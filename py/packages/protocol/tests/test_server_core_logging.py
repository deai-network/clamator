import logging

from clamator_protocol.contract import Contract, MethodEntry
from clamator_protocol.envelope import RequestEnvelope
from clamator_protocol.error import RpcError
from clamator_protocol.server_core import RpcServerCore
from clamator_protocol.transport import Dispatcher
from pydantic import BaseModel

LOGGER_NAME = "clamator_protocol.server_core"


class AddParams(BaseModel):
    a: int
    b: int


class AddResult(BaseModel):
    sum: int


arith_contract = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddParams, result_model=AddResult, handler_attr="add"),
    },
)


class FakeTransport:
    def __init__(self):
        self.dispatchers: dict[str, Dispatcher] = {}

    async def register_service(self, name, dispatch):
        self.dispatchers[name] = dispatch

    async def send(self, env, *, timeout):
        raise AssertionError("unused")

    async def notify(self, env):
        pass

    async def start(self):
        pass

    async def stop(self):
        pass


def req(method: str, params, rpc_id="i1") -> RequestEnvelope:
    return RequestEnvelope(
        service="arith", method=method, full_method=f"arith.{method}",
        params=params, id=rpc_id, raw={},
    )


async def _make_dispatcher(service_instance):
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, service_instance)
    await s.start()
    return t.dispatchers["arith"]


async def test_logs_handler_exception(caplog):
    class Boom:
        async def add(self, params):
            raise ValueError("boom")

    caplog.set_level(logging.WARNING, logger=LOGGER_NAME)
    dispatch = await _make_dispatcher(Boom())
    reply = await dispatch(req("add", {"a": 1, "b": 2}))

    assert reply["error"]["code"] == -32603
    assert reply["error"]["message"] == "Internal error"

    records = [r for r in caplog.records if r.name == LOGGER_NAME]
    assert len(records) == 1
    rec = records[0]
    assert rec.levelno == logging.ERROR
    assert rec.exc_info is not None
    assert "arith" in rec.getMessage()
    assert "add" in rec.getMessage()
    assert "boom" in (rec.exc_info[1].args[0] if rec.exc_info[1].args else "")


async def test_logs_result_validation_failure(caplog):
    class BadResult:
        async def add(self, params):
            return {"sum": "not int"}

    caplog.set_level(logging.WARNING, logger=LOGGER_NAME)
    dispatch = await _make_dispatcher(BadResult())
    reply = await dispatch(req("add", {"a": 1, "b": 2}))

    assert reply["error"]["code"] == -32603
    assert reply["error"]["message"] == "Result validation failed"

    records = [r for r in caplog.records if r.name == LOGGER_NAME]
    assert len(records) == 1
    rec = records[0]
    assert rec.levelno == logging.ERROR
    assert "arith" in rec.getMessage()
    assert "add" in rec.getMessage()


async def test_logs_params_validation_failure(caplog):
    class Svc:
        async def add(self, params):
            return AddResult(sum=0)

    caplog.set_level(logging.WARNING, logger=LOGGER_NAME)
    dispatch = await _make_dispatcher(Svc())
    reply = await dispatch(req("add", {"a": "not-an-int", "b": 2}))

    assert reply["error"]["code"] == -32602
    records = [r for r in caplog.records if r.name == LOGGER_NAME]
    assert len(records) == 1
    rec = records[0]
    assert rec.levelno == logging.WARNING


async def test_does_not_log_rpc_error(caplog):
    class Denial:
        async def add(self, params):
            raise RpcError(-32001, "denied", {"why": "x"})

    caplog.set_level(logging.WARNING, logger=LOGGER_NAME)
    dispatch = await _make_dispatcher(Denial())
    reply = await dispatch(req("add", {"a": 1, "b": 2}))

    assert reply["error"]["code"] == -32001
    records = [r for r in caplog.records if r.name == LOGGER_NAME]
    assert len(records) == 0
