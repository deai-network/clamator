import asyncio

import pytest
from clamator_over_memory import MemoryBus, MemoryRpcClient, MemoryRpcServer
from clamator_protocol import (
    ClamatorTransportError,
    Contract,
    MethodEntry,
    RpcError,
)
from pydantic import BaseModel


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int


arith = Contract(
    service="arith",
    methods={"add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add")},
)


async def test_method_not_found():
    bus = MemoryBus()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    with pytest.raises(RpcError) as ei:
        await client.call("arith", "add", {"a": 1, "b": 2})
    assert ei.value.code == -32601
    await client.stop()


async def test_invalid_params():
    class Svc:
        async def add(self, p): return AddR(sum=0)
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith, Svc())
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    with pytest.raises(RpcError) as ei:
        await client.call("arith", "add", {"a": "x", "b": 1})
    assert ei.value.code == -32602
    await client.stop()
    await server.stop()


async def test_client_timeout():
    class Slow:
        async def add(self, p):
            await asyncio.sleep(0.2)
            return AddR(sum=0)
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith, Slow())
    await server.start()
    client = MemoryRpcClient(bus=bus, default_timeout_ms=30)
    await client.start()
    with pytest.raises(ClamatorTransportError):
        await client.call("arith", "add", {"a": 1, "b": 1})
    await client.stop()
    await server.stop()
