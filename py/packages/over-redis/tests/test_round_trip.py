import pytest
from clamator_over_redis import RedisRpcClient, RedisRpcServer
from clamator_protocol import ClamatorTransportError, Contract, MethodEntry, RpcError
from pydantic import BaseModel
from redis.asyncio import Redis


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int


class PingP(BaseModel):
    pass


arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)


class Svc:
    async def add(self, p): return AddR(sum=p.a + p.b)
    async def ping(self, p): pass


async def test_round_trip(redis_url, key_prefix, cleanup):
    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith, Svc())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    r = await client.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    await client.stop()
    await server.stop()
    await rs.aclose()
    await rc.aclose()


async def test_round_trip_redis_url(redis_url, key_prefix, cleanup):
    server = RedisRpcServer(redis_url=redis_url, key_prefix=key_prefix)
    server.register_service(arith, Svc())
    await server.start()
    client = RedisRpcClient(redis_url=redis_url, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    r = await client.call("arith", "add", {"a": 4, "b": 5})
    assert r == {"sum": 9}
    await client.stop()
    await server.stop()


async def test_rejects_both_redis_and_redis_url(redis_url):
    r = Redis.from_url(redis_url)
    try:
        with pytest.raises(ClamatorTransportError):
            RedisRpcServer(redis=r, redis_url=redis_url, key_prefix="x")
        with pytest.raises(ClamatorTransportError):
            RedisRpcClient(redis=r, redis_url=redis_url, key_prefix="x")
    finally:
        await r.aclose()


async def test_handler_rpc_error(redis_url, key_prefix, cleanup):
    class Bad(Svc):
        async def add(self, p): raise RpcError(-32000, "denied")

    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith, Bad())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    with pytest.raises(RpcError) as ei:
        await client.call("arith", "add", {"a": 1, "b": 2})
    assert ei.value.code == -32000
    await client.stop()
    await server.stop()
    await rs.aclose()
    await rc.aclose()
