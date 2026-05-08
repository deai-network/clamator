from clamator_over_redis import RedisRpcClient
from redis.asyncio import Redis

from .generated.arith import AddParams, AddResult, ArithClient


async def call_arith(*, redis: Redis, key_prefix: str) -> AddResult:
    client = RedisRpcClient(redis=redis, key_prefix=key_prefix, default_timeout_ms=3000)  # default timeout 30 s; no auto-retry on disconnect; timeouts not propagated to server  # noqa: E501
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    await client.stop()
    return r
