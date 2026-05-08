"""clamator-over-redis: redis-streams transport adapter."""

# Re-export protocol-layer error classes so consumers don't need a separate
# clamator_protocol import just to raise RpcError from a handler.
from clamator_protocol import ClamatorProtocolError, ClamatorTransportError, RpcError

from .client import RedisRpcClient
from .client_transport import ClientRedisTransport
from .keys import command_stream, consumer_group_name, consumer_name, reply_stream
from .server import RedisRpcServer
from .server_transport import ServerRedisTransport

__all__ = [
    "RedisRpcServer", "RedisRpcClient",
    "ServerRedisTransport", "ClientRedisTransport",
    "command_stream", "reply_stream", "consumer_group_name", "consumer_name",
    "RpcError", "ClamatorProtocolError", "ClamatorTransportError",
]
