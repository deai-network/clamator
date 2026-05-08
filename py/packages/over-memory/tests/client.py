from clamator_over_memory import MemoryBus, MemoryRpcClient

from .generated.arith import AddParams, AddResult, ArithClient


async def call_arith(bus: MemoryBus) -> AddResult:
    client = MemoryRpcClient(bus=bus)  # default timeout 30 s (pass default_timeout_ms to override); no retry; timeouts not propagated to server  # noqa: E501
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    await client.stop()
    return r
