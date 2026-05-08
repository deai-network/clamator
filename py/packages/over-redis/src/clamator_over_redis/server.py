from __future__ import annotations

from clamator_protocol import RpcServerCore
from redis.asyncio import Redis

from .server_transport import ServerRedisTransport


class RedisRpcServer(RpcServerCore):
    def __init__(
        self, *, redis: Redis | None = None, redis_url: str | None = None,
        key_prefix: str,
        instance_id: str | None = None,
        consumer_claim_idle_ms: int = 60_000,
        reply_stream_maxlen: int = 1024,
        shutdown_grace_ms: int = 5_000,
    ) -> None:
        super().__init__(ServerRedisTransport(
            redis=redis, redis_url=redis_url,
            key_prefix=key_prefix, instance_id=instance_id,
            consumer_claim_idle_ms=consumer_claim_idle_ms,
            reply_stream_maxlen=reply_stream_maxlen,
            shutdown_grace_ms=shutdown_grace_ms,
        ))
