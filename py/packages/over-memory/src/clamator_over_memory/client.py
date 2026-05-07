from __future__ import annotations
from clamator_protocol import RpcClientCore
from .bus import MemoryBus
from .transport import MemoryTransport


class MemoryRpcClient(RpcClientCore):
    def __init__(self, *, bus: MemoryBus, instance_id: str = "mem-client",
                 default_timeout_ms: int = 30_000) -> None:
        super().__init__(MemoryTransport(bus, instance_id), default_timeout_ms=default_timeout_ms)
