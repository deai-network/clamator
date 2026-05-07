import asyncio
import pytest
from pydantic import BaseModel
from redis.asyncio import Redis
from clamator_protocol import Contract, MethodEntry, ClamatorTransportError
from clamator_over_redis import RedisRpcServer, RedisRpcClient


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int


arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
    },
)


async def test_timeout_raises_transport_error(redis_url, key_prefix, cleanup):
    """Client raises ClamatorTransportError when handler is slower than timeout."""
    class SlowSvc:
        async def add(self, p):
            await asyncio.sleep(10)  # much longer than client timeout
            return AddR(sum=0)

    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith, SlowSvc())
    await server.start()
    # 100ms client timeout — handler sleeps 10s, so client must time out first
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=100)
    await client.start()
    with pytest.raises(ClamatorTransportError):
        await client.call("arith", "add", {"a": 1, "b": 2})
    await client.stop()
    await server.stop()
    await rs.aclose()
    await rc.aclose()
