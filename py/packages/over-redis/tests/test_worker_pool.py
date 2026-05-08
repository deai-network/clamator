from clamator_over_redis import RedisRpcClient, RedisRpcServer
from clamator_protocol import Contract, MethodEntry
from pydantic import BaseModel
from redis.asyncio import Redis


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int
    instance: str


arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
    },
)


async def test_two_servers_share_load(redis_url, key_prefix, cleanup):
    """Two servers sharing the same consumer group receive calls roughly evenly."""
    class SvcA:
        async def add(self, p): return AddR(sum=p.a + p.b, instance="srv-1")

    class SvcB:
        async def add(self, p): return AddR(sum=p.a + p.b, instance="srv-2")

    r1 = Redis.from_url(redis_url)
    r2 = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)

    s1 = RedisRpcServer(redis=r1, key_prefix=key_prefix, instance_id="srv-1")
    s2 = RedisRpcServer(redis=r2, key_prefix=key_prefix, instance_id="srv-2")
    s1.register_service(arith, SvcA())
    s2.register_service(arith, SvcB())
    await s1.start()
    await s2.start()

    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()

    counts: dict[str, int] = {"srv-1": 0, "srv-2": 0}
    for i in range(50):
        r = await client.call("arith", "add", {"a": i, "b": 1})
        counts[r["instance"]] += 1

    assert counts["srv-1"] > 0, "srv-1 handled no calls"
    assert counts["srv-2"] > 0, "srv-2 handled no calls"

    await client.stop()
    await s1.stop()
    await s2.stop()
    await r1.aclose()
    await r2.aclose()
    await rc.aclose()
