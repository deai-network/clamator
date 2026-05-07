from __future__ import annotations
from clamator_protocol import RpcServerCore
from redis.asyncio import Redis
from .server_transport import ServerRedisTransport


class RedisRpcServer(RpcServerCore):
    def __init__(
        self, *, redis: Redis, key_prefix: str,
        instance_id: str | None = None,
        consumer_claim_idle_ms: int = 60_000,
        default_handler_timeout_ms: int = 30_000,
        shutdown_grace_ms: int = 5_000,
    ) -> None:
        super().__init__(ServerRedisTransport(
            redis=redis, key_prefix=key_prefix, instance_id=instance_id,
            consumer_claim_idle_ms=consumer_claim_idle_ms,
            default_handler_timeout_ms=default_handler_timeout_ms,
            shutdown_grace_ms=shutdown_grace_ms,
        ))
