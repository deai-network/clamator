from __future__ import annotations
import asyncio
import json
import uuid
from typing import Any

from redis.asyncio import Redis

from clamator_protocol import (
    parse_envelope, ClamatorTransportError, Dispatcher,
)
from .keys import command_stream, consumer_group_name, consumer_name


class ServerRedisTransport:
    def __init__(
        self, *, redis: Redis, key_prefix: str,
        instance_id: str | None = None,
        consumer_claim_idle_ms: int = 60_000,
        reply_stream_maxlen: int = 1024,
        shutdown_grace_ms: int = 5_000,
    ) -> None:
        self._redis = redis
        self._key_prefix = key_prefix
        self.instance_id = instance_id or str(uuid.uuid4())
        self._claim_idle_ms = consumer_claim_idle_ms
        self._reply_stream_maxlen = reply_stream_maxlen
        self._shutdown_grace_ms = shutdown_grace_ms
        self._dispatchers: dict[str, Dispatcher] = {}
        self._state = "idle"
        self._tasks: list[asyncio.Task[Any]] = []

    async def register_service(self, name: str, dispatch: Dispatcher) -> None:
        self._dispatchers[name] = dispatch

    async def send(self, env: dict[str, Any], *, timeout: float) -> dict[str, Any]:
        raise NotImplementedError("server transport cannot send requests")

    async def notify(self, env: dict[str, Any]) -> None:
        raise NotImplementedError("server transport cannot send notifications")

    async def start(self) -> None:
        if self._state == "stopped":
            raise ClamatorTransportError("transport has been stopped")
        if self._state == "started":
            return
        self._state = "started"
        for service in self._dispatchers:
            stream = command_stream(self._key_prefix, service)
            group = consumer_group_name(service)
            try:
                await self._redis.xgroup_create(stream, group, id="$", mkstream=True)
            except Exception as e:
                if "BUSYGROUP" not in str(e):
                    raise
            self._tasks.append(asyncio.create_task(self._consumer_loop(service)))
            self._tasks.append(asyncio.create_task(self._reclaim_loop(service)))

    async def stop(self) -> None:
        if self._state != "started":
            self._state = "stopped"
            return
        self._state = "stopped"
        for t in self._tasks:
            t.cancel()
        try:
            await asyncio.wait_for(
                asyncio.gather(*self._tasks, return_exceptions=True),
                timeout=self._shutdown_grace_ms / 1000,
            )
        except asyncio.TimeoutError:
            pass
        self._tasks.clear()

    async def _consumer_loop(self, service: str) -> None:
        stream = command_stream(self._key_prefix, service)
        group = consumer_group_name(service)
        consumer = consumer_name(service, self.instance_id)
        while self._state == "started":
            try:
                results = await self._redis.xreadgroup(
                    group, consumer, {stream: ">"}, block=1000, count=16,
                )
                if not results:
                    continue
                for _, entries in results:
                    for entry_id, fields in entries:
                        await self._handle_entry(service, stream, group, entry_id, fields)
            except asyncio.CancelledError:
                return
            except Exception:
                await asyncio.sleep(0.1)

    async def _reclaim_loop(self, service: str) -> None:
        stream = command_stream(self._key_prefix, service)
        group = consumer_group_name(service)
        consumer = consumer_name(service, self.instance_id)
        while self._state == "started":
            try:
                await asyncio.sleep(max(1.0, self._claim_idle_ms / 4000))
                claimed = await self._redis.xautoclaim(
                    stream, group, consumer, min_idle_time=self._claim_idle_ms, count=32,
                )
                # claimed: (next_cursor, [(id, fields), ...], deleted_ids)
                _, entries, _ = claimed if len(claimed) == 3 else (claimed[0], claimed[1], [])
                for entry_id, fields in entries or []:
                    await self._handle_entry(service, stream, group, entry_id, fields)
            except asyncio.CancelledError:
                return
            except Exception:
                pass

    async def _handle_entry(
        self, service: str, stream: str, group: str, entry_id: Any, fields: dict[Any, Any],
    ) -> None:
        env_b = fields.get(b"envelope") or fields.get("envelope")
        if env_b is None:
            await self._redis.xack(stream, group, entry_id)
            return
        if isinstance(env_b, bytes):
            env_b = env_b.decode()
        reply_to = fields.get(b"reply-to") or fields.get("reply-to")
        if isinstance(reply_to, bytes):
            reply_to = reply_to.decode()
        try:
            env_obj = json.loads(env_b)
            parsed = parse_envelope(env_obj)
        except Exception:
            await self._redis.xack(stream, group, entry_id)
            return
        dispatcher = self._dispatchers.get(service)
        if dispatcher is None:
            await self._redis.xack(stream, group, entry_id)
            return
        reply = await dispatcher(parsed)
        if reply_to and reply is not None:
            await self._redis.xadd(
                reply_to, {"type": "rpc", "envelope": json.dumps(reply)},
                maxlen=self._reply_stream_maxlen, approximate=True,
            )
        await self._redis.xack(stream, group, entry_id)
