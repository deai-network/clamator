from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any, Protocol, runtime_checkable

from .envelope import Envelope

Dispatcher = Callable[[Envelope], Awaitable[dict[str, Any] | None]]


@runtime_checkable
class Transport(Protocol):
    async def register_service(self, name: str, dispatch: Dispatcher) -> None: ...
    async def send(self, env: dict[str, Any], *, timeout: float) -> dict[str, Any]: ...
    async def notify(self, env: dict[str, Any]) -> None: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
