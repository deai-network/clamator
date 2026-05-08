from clamator_over_memory import MemoryBus, MemoryRpcServer

from .generated.arith import AddParams, AddResult, ArithService, arith_contract


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)


async def build_arith_server(bus: MemoryBus) -> MemoryRpcServer:
    server = MemoryRpcServer(bus=bus)  # no external connection; stop() unregisters from the bus without closing any resource  # noqa: E501
    server.register_service(arith_contract, Arith())  # must precede start() — post-start registrations are silently ignored, never registered on the bus  # noqa: E501
    await server.start()
    return server
