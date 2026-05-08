from __future__ import annotations
import asyncio
import json
import os
import uuid
from typing import Any

from redis.asyncio import Redis

from clamator_protocol import (
    parse_envelope, ClamatorTransportError, RequestEnvelope, NotificationEnvelope,
    Dispatcher,
)
from .keys import command_stream, reply_stream


class ClientRedisTransport:
    def __init__(
        self, *, redis: Redis | None = None, redis_url: str | None = None,
        key_prefix: str,
        instance_id: str | None = None,
        default_timeout_ms: int = 30_000,
    ) -> None:
        if redis is not None and redis_url is not None:
            raise ClamatorTransportError("provide either `redis` or `redis_url`, not both")
        if redis is not None:
            self._redis = redis
            self._owns_redis = False
        else:
            url = redis_url or os.environ.get("REDIS_URL") or "redis://localhost:6379"
            self._redis = Redis.from_url(url)
            self._owns_redis = True
        self._key_prefix = key_prefix
        self.instance_id = instance_id or str(uuid.uuid4())
        self._reply_stream = reply_stream(key_prefix, self.instance_id)
        self._default_timeout = default_timeout_ms / 1000
        self._state = "idle"
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._reply_loop_task: asyncio.Task[Any] | None = None

    async def register_service(self, name: str, dispatch: Dispatcher) -> None:
        raise NotImplementedError("client transport cannot host services")

    async def send(self, env: dict[str, Any], *, timeout: float) -> dict[str, Any]:
        if self._state != "started":
            raise ClamatorTransportError(f"transport not started (state={self._state})")
        parsed = parse_envelope(env)
        if not isinstance(parsed, RequestEnvelope):
            raise ClamatorTransportError("send requires a request envelope")
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[str(parsed.id)] = fut
        try:
            await self._redis.xadd(
                command_stream(self._key_prefix, parsed.service),
                {"type": "rpc", "envelope": json.dumps(env), "reply-to": self._reply_stream},
            )
        except Exception as e:
            self._pending.pop(str(parsed.id), None)
            raise ClamatorTransportError("xadd failed", cause=e) from e
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError as e:
            self._pending.pop(str(parsed.id), None)
            raise ClamatorTransportError("call timeout") from e

    async def notify(self, env: dict[str, Any]) -> None:
        if self._state != "started":
            raise ClamatorTransportError(f"transport not started (state={self._state})")
        parsed = parse_envelope(env)
        if not isinstance(parsed, NotificationEnvelope):
            raise ClamatorTransportError("notify requires a notification envelope")
        await self._redis.xadd(
            command_stream(self._key_prefix, parsed.service),
            {"type": "rpc", "envelope": json.dumps(env)},
        )

    async def start(self) -> None:
        if self._state == "stopped":
            raise ClamatorTransportError("transport has been stopped")
        if self._state == "started":
            return
        self._state = "started"
        self._reply_loop_task = asyncio.create_task(self._reply_loop())

    async def stop(self) -> None:
        if self._state != "started":
            self._state = "stopped"
            return
        self._state = "stopped"
        if self._reply_loop_task:
            self._reply_loop_task.cancel()
            try:
                await self._reply_loop_task
            except asyncio.CancelledError:
                pass
        for fut in list(self._pending.values()):
            if not fut.done():
                fut.set_exception(ClamatorTransportError("transport stopped"))
        self._pending.clear()
        try:
            await self._redis.delete(self._reply_stream)
        except Exception:
            pass
        if self._owns_redis:
            try:
                await self._redis.aclose()
            except Exception:
                pass

    async def _reply_loop(self) -> None:
        last_id = "0"
        while True:
            try:
                results = await self._redis.xread({self._reply_stream: last_id}, block=1000)
                if not results:
                    continue
                for _stream, entries in results:
                    for entry_id, fields in entries:
                        last_id = entry_id
                        env_field = fields.get(b"envelope") or fields.get("envelope")
                        if env_field is None:
                            continue
                        if isinstance(env_field, bytes):
                            env_field = env_field.decode()
                        try:
                            parsed = json.loads(env_field)
                        except Exception:
                            continue
                        rid = str(parsed.get("id"))
                        fut = self._pending.pop(rid, None)
                        if fut and not fut.done():
                            fut.set_result(parsed)
            except asyncio.CancelledError:
                return
            except Exception:
                await asyncio.sleep(0.1)
