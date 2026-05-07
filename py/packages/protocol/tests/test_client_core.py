import pytest
from clamator_protocol.client_core import RpcClientCore
from clamator_protocol.error import RpcError, ClamatorProtocolError


class FakeTransport:
    def __init__(self, reply):
        self.reply = reply
        self.sent = []

    async def register_service(self, name, dispatch): pass
    async def send(self, env, *, timeout):
        self.sent.append(env)
        return self.reply
    async def notify(self, env): self.sent.append(env)
    async def start(self): pass
    async def stop(self): pass


async def test_call_unwraps_result():
    t = FakeTransport({"jsonrpc": "2.0", "id": "x", "result": {"sum": 5}})
    c = RpcClientCore(t)
    await c.start()
    r = await c.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    assert t.sent[0]["method"] == "arith.add"
    assert t.sent[0]["params"] == {"a": 2, "b": 3}
    assert isinstance(t.sent[0]["id"], str)


async def test_call_raises_rpc_error():
    t = FakeTransport({"jsonrpc": "2.0", "id": "x", "error": {"code": -32001, "message": "x", "data": None}})
    c = RpcClientCore(t)
    await c.start()
    with pytest.raises(RpcError) as ei:
        await c.call("arith", "add", {})
    assert ei.value.code == -32001


async def test_call_raises_protocol_error_on_malformed():
    t = FakeTransport({"jsonrpc": "2.0"})
    c = RpcClientCore(t)
    await c.start()
    with pytest.raises(ClamatorProtocolError):
        await c.call("arith", "add", {})


async def test_notify_no_id():
    t = FakeTransport({})
    c = RpcClientCore(t)
    await c.start()
    await c.notify("arith", "ping", {"x": 1})
    assert "id" not in t.sent[0]
    assert t.sent[0] == {"jsonrpc": "2.0", "method": "arith.ping", "params": {"x": 1}}


async def test_call_rejects_bad_format():
    c = RpcClientCore(FakeTransport({}))
    await c.start()
    with pytest.raises(ValueError, match="service"):
        await c.call("Engine", "add", {})
    with pytest.raises(ValueError, match="method"):
        await c.call("arith", "Add", {})
