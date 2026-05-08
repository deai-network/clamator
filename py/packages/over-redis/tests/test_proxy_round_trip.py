from redis.asyncio import Redis

from .client import call_arith
from .server import build_arith_server


async def test_round_trip_via_codegen_typed_proxy(redis_url, key_prefix, cleanup):
    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = await build_arith_server(redis=rs, key_prefix=key_prefix)
    r = await call_arith(redis=rc, key_prefix=key_prefix)
    assert r.sum == 5  # noqa: PLR2004
    await server.stop()  # drains in-flight handlers up to grace_ms (default 5 s), then stops transport  # noqa: E501
    await rs.aclose()
    await rc.aclose()
