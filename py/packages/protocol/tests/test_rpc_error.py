from clamator_protocol import RpcError

RPC_FORBIDDEN = -32001  # application-defined; outside the reserved -32600..-32099 range


def test_rpc_error_construction():
    err = RpcError(RPC_FORBIDDEN, "forbidden", {"reason": "no-token"})
    assert err.code == RPC_FORBIDDEN
    assert err.message == "forbidden"
    assert err.data == {"reason": "no-token"}
