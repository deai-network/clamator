from __future__ import annotations
import uuid
from typing import Any, Protocol

from .envelope import (
    SERVICE_RE, METHOD_RE, parse_envelope,
    SuccessResponseEnvelope, ErrorResponseEnvelope,
    build_request, build_notification,
)
from .error import RpcError, ClamatorProtocolError
from .transport import Transport


class ClamatorClient(Protocol):
    async def call(self, service: str, method: str, params: Any) -> Any: ...
    async def notify(self, service: str, method: str, params: Any) -> None: ...


class RpcClientCore:
    def __init__(self, transport: Transport, *, default_timeout_ms: int = 30_000) -> None:
        self._transport = transport
        self._default_timeout = default_timeout_ms / 1000
        self._state = "idle"

    async def call(self, service: str, method: str, params: Any) -> Any:
        if not SERVICE_RE.match(service):
            raise ValueError(f"invalid service \"{service}\"")
        if not METHOD_RE.match(method):
            raise ValueError(f"invalid method \"{method}\"")
        rpc_id = str(uuid.uuid4())
        env = build_request(f"{service}.{method}", params, rpc_id)
        reply = await self._transport.send(env, timeout=self._default_timeout)
        try:
            parsed = parse_envelope(reply)
        except ValueError as e:
            raise ClamatorProtocolError(f"invalid response envelope: {e}") from e
        if isinstance(parsed, SuccessResponseEnvelope):
            return parsed.result
        if isinstance(parsed, ErrorResponseEnvelope):
            raise RpcError(parsed.error["code"], parsed.error["message"], parsed.error.get("data"))
        raise ClamatorProtocolError(f"unexpected response kind: {parsed.kind}")

    async def notify(self, service: str, method: str, params: Any) -> None:
        if not SERVICE_RE.match(service):
            raise ValueError(f"invalid service \"{service}\"")
        if not METHOD_RE.match(method):
            raise ValueError(f"invalid method \"{method}\"")
        await self._transport.notify(build_notification(f"{service}.{method}", params))

    async def start(self) -> None:
        if self._state == "stopped":
            raise RuntimeError("client has been stopped")
        if self._state == "started":
            return
        await self._transport.start()
        self._state = "started"

    async def stop(self) -> None:
        if self._state != "started":
            self._state = "stopped"
            return
        await self._transport.stop()
        self._state = "stopped"
