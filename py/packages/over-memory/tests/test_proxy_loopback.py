from clamator_over_memory import MemoryBus

from .client import call_arith
from .server import build_arith_server


async def test_round_trip_via_codegen_typed_proxy():
    bus = MemoryBus()
    server = await build_arith_server(bus)
    r = await call_arith(bus)
    assert r.sum == 5  # noqa: PLR2004
    await server.stop()  # drains in-flight handlers up to grace_ms ms (default 5000), then stops transport  # noqa: E501
