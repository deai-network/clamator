import pytest
from clamator_protocol.envelope import (
    METHOD_RE,
    SERVICE_RE,
    EnvelopeKind,
    build_error_response,
    build_notification,
    build_request,
    build_success_response,
    parse_envelope,
)


def test_classifies_request():
    env = parse_envelope(
        {"jsonrpc": "2.0", "method": "engine.launch", "params": {"x": 1}, "id": "abc"}
    )
    assert env.kind is EnvelopeKind.REQUEST
    assert env.service == "engine"
    assert env.method == "launch"
    assert env.id == "abc"


def test_classifies_notification():
    env = parse_envelope({"jsonrpc": "2.0", "method": "engine.resync", "params": {}})
    assert env.kind is EnvelopeKind.NOTIFICATION


def test_classifies_success_response():
    env = parse_envelope({"jsonrpc": "2.0", "id": "x", "result": {"ok": True}})
    assert env.kind is EnvelopeKind.SUCCESS_RESPONSE


def test_classifies_error_response():
    env = parse_envelope(
        {"jsonrpc": "2.0", "id": "x", "error": {"code": -32603, "message": "x", "data": None}}
    )
    assert env.kind is EnvelopeKind.ERROR_RESPONSE


def test_rejects_batch():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope([{}])


def test_rejects_wrong_jsonrpc_version():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "1.0", "method": "a.b", "params": {}})


def test_rejects_method_without_dot():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "2.0", "method": "launch", "params": {}})


def test_rejects_invalid_service_segment():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "2.0", "method": "Engine.launch", "params": {}})


def test_rejects_invalid_method_segment():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "2.0", "method": "engine.Launch", "params": {}})


def test_rejects_bool_as_id():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "2.0", "method": "a.b", "params": {}, "id": True})


def test_regexes():
    assert SERVICE_RE.match("engine")
    assert SERVICE_RE.match("order-service")
    assert not SERVICE_RE.match("Engine")
    assert METHOD_RE.match("launchProcess")
    assert not METHOD_RE.match("Launch")


def test_builders():
    assert build_request("a.b", {}, "id1") == {
        "jsonrpc": "2.0", "method": "a.b", "params": {}, "id": "id1"
    }
    assert build_notification("a.b", {}) == {"jsonrpc": "2.0", "method": "a.b", "params": {}}
    assert build_success_response("id1", {"x": 1}) == {
        "jsonrpc": "2.0", "id": "id1", "result": {"x": 1}
    }
    err = build_error_response("id1", -32000, "oops", {"k": "v"})
    assert err == {
        "jsonrpc": "2.0", "id": "id1",
        "error": {"code": -32000, "message": "oops", "data": {"k": "v"}},
    }
