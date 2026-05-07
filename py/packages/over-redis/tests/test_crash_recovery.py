import asyncio
import pytest
from pydantic import BaseModel
from redis.asyncio import Redis
from clamator_protocol import Contract, MethodEntry
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


async def test_xautoclaim_reclaim_picks_up_abandoned_message(redis_url, key_prefix, cleanup):
    """
    Server 1 picks up a message but hangs forever without ACKing.
    After being stopped ('crashed'), server 2 reclaims the message via XAUTOCLAIM
    and delivers the reply.
    """
    class HangSvc:
        async def add(self, p):
            await asyncio.sleep(3600)  # effectively never returns
            return AddR(sum=0)

    class RecoverSvc:
        async def add(self, p): return AddR(sum=p.a + p.b)

    r1 = Redis.from_url(redis_url)
    r2 = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)

    # consumerClaimIdleMs=200 is aggressive — message idle for 200ms triggers reclaim
    s1 = RedisRpcServer(
        redis=r1, key_prefix=key_prefix, instance_id="srv-die",
        consumer_claim_idle_ms=200,
    )
    s1.register_service(arith, HangSvc())
    await s1.start()

    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=8000)
    await client.start()

    # Fire off the call — server 1 will pick it up but hang without ACKing
    call_task = asyncio.create_task(
        client.call("arith", "add", {"a": 1, "b": 2})
    )

    # Give server 1 enough time to dequeue the message (but not ack it)
    await asyncio.sleep(0.15)

    # "Crash" server 1 — stop it without completing the in-flight handler
    await s1.stop()

    # Wait a bit to ensure the message becomes idle enough for XAUTOCLAIM
    await asyncio.sleep(0.15)

    # Start server 2 — it will reclaim the abandoned pending message
    s2 = RedisRpcServer(
        redis=r2, key_prefix=key_prefix, instance_id="srv-recover",
        consumer_claim_idle_ms=200,
    )
    s2.register_service(arith, RecoverSvc())
    await s2.start()

    result = await call_task
    assert result == {"sum": 3}

    await client.stop()
    await s2.stop()
    await r1.aclose()
    await r2.aclose()
    await rc.aclose()
