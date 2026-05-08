import pytest
from redis.asyncio import Redis
from clamator_over_redis import RedisRpcServer, RedisRpcClient
from .generated.arith import ArithClient, ArithService, arith_contract, AddParams, AddResult, PingParams


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)

    async def ping(self, params: PingParams) -> None:
        return None


@pytest.mark.asyncio
async def test_round_trip_via_codegen_typed_proxy(redis_url, key_prefix, cleanup):
    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith_contract, Arith())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    assert r.sum == 5
    await client.stop()
    await server.stop()
    await rs.aclose()
    await rc.aclose()
