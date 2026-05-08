"""clamator-over-memory: in-process transport adapter."""

# Re-export protocol-layer error classes so consumers don't need a separate
# clamator_protocol import just to raise RpcError from a handler.
from clamator_protocol import ClamatorProtocolError, ClamatorTransportError, RpcError

from .bus import MemoryBus
from .client import MemoryRpcClient
from .server import MemoryRpcServer
from .transport import MemoryTransport

__all__ = [
    "MemoryBus",
    "MemoryTransport",
    "MemoryRpcServer",
    "MemoryRpcClient",
    "RpcError",
    "ClamatorProtocolError",
    "ClamatorTransportError",
]
