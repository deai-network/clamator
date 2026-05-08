from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from .contract import Contract
from .envelope import (
    Envelope,
    NotificationEnvelope,
    RequestEnvelope,
    build_error_response,
    build_success_response,
)
from .error import RpcError, exception_to_error_data
from .transport import Dispatcher, Transport


@dataclass
class _ServiceEntry:
    contract: Contract
    handler_instance: Any


class RpcServerCore:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport
        self._services: dict[str, _ServiceEntry] = {}
        self._state: str = "idle"
        self._inflight: set[asyncio.Task[Any]] = set()

    def register_service(self, contract: Contract, instance: Any) -> None:
        if contract.service in self._services:
            raise ValueError(f'service "{contract.service}" already registered on this server')
        self._services[contract.service] = _ServiceEntry(contract=contract, handler_instance=instance)

    def _dispatcher(self, service_name: str) -> Dispatcher:
        async def dispatch(env: Envelope) -> dict[str, Any] | None:
            entry = self._services.get(service_name)
            if not isinstance(env, (RequestEnvelope, NotificationEnvelope)):
                return None
            is_notification = isinstance(env, NotificationEnvelope)
            rpc_id = None if is_notification else env.id
            if entry is None:
                return None if is_notification else build_error_response(rpc_id, -32601, "Method not found")
            method_entry = entry.contract.methods.get(env.method)
            if method_entry is None:
                return None if is_notification else build_error_response(rpc_id, -32601, "Method not found")
            try:
                params = method_entry.params_model.model_validate(env.params)
            except ValidationError as e:
                if is_notification:
                    return None
                return build_error_response(rpc_id, -32602, "Invalid params", {"errors": e.errors()})
            handler = getattr(entry.handler_instance, method_entry.handler_attr, None)
            if handler is None:
                return None if is_notification else build_error_response(rpc_id, -32601, "Method not found")

            task = asyncio.create_task(handler(params))
            self._inflight.add(task)
            try:
                result = await task
            except RpcError as e:
                if is_notification:
                    return None
                return build_error_response(rpc_id, e.code, e.message, e.data)
            except Exception as e:  # noqa: BLE001
                if is_notification:
                    return None
                return build_error_response(rpc_id, -32603, "Internal error", exception_to_error_data(e))
            finally:
                self._inflight.discard(task)

            if is_notification or method_entry.result_model is None:
                return None
            try:
                validated = method_entry.result_model.model_validate(result)
            except ValidationError as e:
                return build_error_response(rpc_id, -32603, "Result validation failed", {"errors": e.errors()})
            return build_success_response(rpc_id, validated.model_dump(by_alias=True))
        return dispatch

    async def start(self) -> None:
        if self._state == "started":
            return
        if self._state == "stopped":
            raise RuntimeError("server has been stopped")
        for name in self._services:
            await self._transport.register_service(name, self._dispatcher(name))
        await self._transport.start()
        self._state = "started"

    async def stop(self, *, grace_ms: int = 5000) -> None:
        if self._state != "started":
            self._state = "stopped"
            return
        deadline = time.monotonic() + grace_ms / 1000
        while self._inflight and time.monotonic() < deadline:
            await asyncio.wait(self._inflight, timeout=0.05, return_when=asyncio.ALL_COMPLETED)
        await self._transport.stop()
        self._state = "stopped"
