from __future__ import annotations

from clamator_protocol import RpcServerCore

from .bus import MemoryBus
from .transport import MemoryTransport


class MemoryRpcServer(RpcServerCore):
    def __init__(self, *, bus: MemoryBus, instance_id: str = "mem-server") -> None:
        super().__init__(MemoryTransport(bus, instance_id))
