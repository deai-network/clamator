from __future__ import annotations

from clamator_protocol import Dispatcher


class MemoryBus:
    def __init__(self) -> None:
        self._dispatchers: dict[str, Dispatcher] = {}

    def register(self, service: str, dispatch: Dispatcher) -> None:
        if service in self._dispatchers:
            raise ValueError(f'service "{service}" already registered on this bus')
        self._dispatchers[service] = dispatch

    def unregister(self, service: str) -> None:
        self._dispatchers.pop(service, None)

    def lookup(self, service: str) -> Dispatcher | None:
        return self._dispatchers.get(service)
