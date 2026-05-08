import pytest
from clamator_over_memory import MemoryBus, MemoryRpcServer, MemoryRpcClient
from .generated.arith import ArithClient, ArithService, arith_contract, AddParams, AddResult


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)


async def test_round_trip_via_codegen_typed_proxy():
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith_contract, Arith())
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    assert r.sum == 5
    await client.stop()
    await server.stop()
