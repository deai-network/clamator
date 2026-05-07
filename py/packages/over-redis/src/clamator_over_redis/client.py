from __future__ import annotations
from clamator_protocol import RpcClientCore
from redis.asyncio import Redis
from .client_transport import ClientRedisTransport


class RedisRpcClient(RpcClientCore):
    def __init__(
        self, *, redis: Redis, key_prefix: str,
        instance_id: str | None = None,
        default_timeout_ms: int = 30_000,
    ) -> None:
        super().__init__(
            ClientRedisTransport(
                redis=redis, key_prefix=key_prefix, instance_id=instance_id,
                default_timeout_ms=default_timeout_ms,
            ),
            default_timeout_ms=default_timeout_ms,
        )
