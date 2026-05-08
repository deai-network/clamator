from clamator_protocol.error import (
    ClamatorProtocolError,
    ClamatorTransportError,
    RpcError,
    exception_to_error_data,
)


def test_rpc_error_fields():
    e = RpcError(-32000, "oops", {"x": 1})
    assert e.code == -32000
    assert e.message == "oops"
    assert e.data == {"x": 1}
    assert isinstance(e, Exception)


def test_protocol_error_is_exception():
    assert isinstance(ClamatorProtocolError("p"), Exception)


def test_transport_error_carries_cause():
    cause = RuntimeError("boom")
    e = ClamatorTransportError("lost", cause=cause)
    assert e.__cause__ is cause


def test_exception_to_error_data_strips_unserializable():
    class Boom(Exception):
        pass
    e = Boom("hi")
    e.foo = "bar"
    e.n = 7
    e.bad = object()
    data = exception_to_error_data(e)
    assert data["name"] == "Boom"
    assert data["message"] == "hi"
    assert data["foo"] == "bar"
    assert data["n"] == 7
    assert "bad" not in data
