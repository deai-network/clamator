import asyncio

import pytest
from clamator_over_memory import MemoryBus, MemoryRpcClient, MemoryRpcServer
from clamator_protocol import Contract, MethodEntry, RpcError
from pydantic import BaseModel


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int


class PingP(BaseModel):
    tag: str | None = None


arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)


class Svc:
    def __init__(self):
        self.pinged = False
    async def add(self, p: AddP) -> AddR:
        return AddR(sum=p.a + p.b)
    async def ping(self, p: PingP) -> None:
        self.pinged = True


async def test_round_trip():
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith, Svc())
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    r = await client.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    await client.stop()
    await server.stop()


async def test_handler_rpc_error():
    class Bad(Svc):
        async def add(self, p):
            raise RpcError(-32000, "denied")
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith, Bad())
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    with pytest.raises(RpcError) as ei:
        await client.call("arith", "add", {"a": 1, "b": 2})
    assert ei.value.code == -32000
    await client.stop(); await server.stop()


async def test_notification_fires():
    bus = MemoryBus()
    svc = Svc()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith, svc)
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    await client.notify("arith", "ping", {"tag": "x"})
    await asyncio.sleep(0.01)
    assert svc.pinged is True
    await client.stop(); await server.stop()
