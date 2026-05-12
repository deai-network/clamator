from __future__ import annotations

import asyncio
import logging
from typing import Any

from clamator_protocol import (
    ClamatorTransportError,
    Dispatcher,
    NotificationEnvelope,
    RequestEnvelope,
    build_error_response,
    parse_envelope,
)

from .bus import MemoryBus

logger = logging.getLogger(__name__)


class MemoryTransport:
    def __init__(self, bus: MemoryBus, instance_id: str = "mem") -> None:
        self._bus = bus
        self._instance_id = instance_id
        self._state: str = "idle"
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._my_services: set[str] = set()

    async def register_service(self, name: str, dispatch: Dispatcher) -> None:
        self._bus.register(name, dispatch)
        self._my_services.add(name)

    async def send(self, env: dict[str, Any], *, timeout: float) -> dict[str, Any]:
        if self._state != "started":
            raise ClamatorTransportError(f"transport not started (state={self._state})")
        parsed = parse_envelope(env)
        if not isinstance(parsed, RequestEnvelope):
            raise ClamatorTransportError("send requires a request envelope")
        dispatcher = self._bus.lookup(parsed.service)
        if dispatcher is None:
            return build_error_response(parsed.id, -32601, "Method not found")
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[str(parsed.id)] = fut

        async def runner() -> None:
            try:
                reply = await dispatcher(parsed)
                if str(parsed.id) not in self._pending:
                    return
                self._pending.pop(str(parsed.id))
                if reply is None:
                    fut.set_exception(
                        ClamatorTransportError("dispatcher returned None for a request")
                    )
                else:
                    fut.set_result(reply)
            except Exception as e:  # noqa: BLE001
                logger.warning(
                    "dispatcher threw: service=%s",
                    parsed.service,
                    exc_info=True,
                    extra={"clamator": {"service": parsed.service, "rpc_id": str(parsed.id)}},
                )
                if str(parsed.id) in self._pending:
                    self._pending.pop(str(parsed.id))
                    if not fut.done():
                        fut.set_exception(ClamatorTransportError("dispatcher threw", cause=e))

        loop.create_task(runner())
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except TimeoutError as e:
            self._pending.pop(str(parsed.id), None)
            raise ClamatorTransportError("call timeout") from e

    async def notify(self, env: dict[str, Any]) -> None:
        if self._state != "started":
            raise ClamatorTransportError(f"transport not started (state={self._state})")
        parsed = parse_envelope(env)
        if not isinstance(parsed, NotificationEnvelope):
            raise ClamatorTransportError("notify requires a notification envelope")
        dispatcher = self._bus.lookup(parsed.service)
        if dispatcher is None:
            return
        asyncio.get_running_loop().create_task(dispatcher(parsed))

    async def start(self) -> None:
        if self._state == "stopped":
            raise ClamatorTransportError("transport has been stopped")
        self._state = "started"

    async def stop(self) -> None:
        self._state = "stopped"
        for fut in list(self._pending.values()):
            if not fut.done():
                fut.set_exception(ClamatorTransportError("transport stopped"))
        self._pending.clear()
        for name in list(self._my_services):
            self._bus.unregister(name)
        self._my_services.clear()
