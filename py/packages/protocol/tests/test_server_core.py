import asyncio
import pytest
from pydantic import BaseModel
from clamator_protocol.contract import Contract, MethodEntry
from clamator_protocol.server_core import RpcServerCore
from clamator_protocol.transport import Transport, Dispatcher
from clamator_protocol.envelope import RequestEnvelope, NotificationEnvelope
from clamator_protocol.error import RpcError


class AddParams(BaseModel):
    a: int
    b: int


class AddResult(BaseModel):
    sum: int


class PingParams(BaseModel):
    pass


arith_contract = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddParams, result_model=AddResult, handler_attr="add"),
        "ping": MethodEntry(params_model=PingParams, result_model=None, handler_attr="ping"),
    },
)


class FakeTransport:
    def __init__(self):
        self.dispatchers: dict[str, Dispatcher] = {}
        self.started = False

    async def register_service(self, name, dispatch):
        self.dispatchers[name] = dispatch

    async def send(self, env, *, timeout):
        raise AssertionError("unused")

    async def notify(self, env):
        pass

    async def start(self):
        self.started = True

    async def stop(self):
        self.started = False


class ArithService:
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)
    async def ping(self, params: PingParams) -> None:
        pass


def request_env(method: str, params, rpc_id="i1") -> RequestEnvelope:
    return RequestEnvelope(
        service="arith", method=method, full_method=f"arith.{method}",
        params=params, id=rpc_id, raw={},
    )


async def test_dispatches_valid_request():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": 2, "b": 3}))
    assert reply == {"jsonrpc": "2.0", "id": "i1", "result": {"sum": 5}}


async def test_method_not_found():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("unknown", {}))
    assert reply["error"]["code"] == -32601


async def test_invalid_params():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": "x", "b": 3}))
    assert reply["error"]["code"] == -32602


async def test_handler_rpc_error():
    class BadService(ArithService):
        async def add(self, params):
            raise RpcError(-32001, "denied", {"why": "x"})
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, BadService())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": 1, "b": 2}))
    assert reply["error"] == {"code": -32001, "message": "denied", "data": {"why": "x"}}


async def test_handler_generic_exception():
    class Boom(ArithService):
        async def add(self, params):
            raise RuntimeError("boom")
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, Boom())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": 1, "b": 2}))
    assert reply["error"]["code"] == -32603
    assert reply["error"]["data"]["name"] == "RuntimeError"


async def test_invalid_result():
    class BadResult(ArithService):
        async def add(self, params):
            return {"sum": "not int"}  # not a valid AddResult
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, BadResult())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": 1, "b": 2}))
    assert reply["error"]["code"] == -32603


async def test_notification_returns_none():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    await s.start()
    nenv = NotificationEnvelope(service="arith", method="ping", full_method="arith.ping", params={}, raw={})
    reply = await t.dispatchers["arith"](nenv)
    assert reply is None


async def test_duplicate_service_registration():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    with pytest.raises(ValueError, match="already registered"):
        s.register_service(arith_contract, ArithService())


async def test_stop_idempotent():
    t = FakeTransport()
    s = RpcServerCore(t)
    await s.start()
    await s.stop()
    await s.stop()  # no raise
