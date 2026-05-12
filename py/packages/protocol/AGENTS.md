# clamator-protocol — agent rules

Pure protocol package. **No I/O, ever.** Network, filesystem, process — all belong in adapters.

## Public API surface

These exports are the SemVer surface; changes require updating `@clamator/protocol` (TS) in the same commit:

- `Contract`, `MethodEntry`
- `Envelope`, `RequestEnvelope`, `NotificationEnvelope`, `SuccessResponseEnvelope`, `ErrorResponseEnvelope`, `EnvelopeKind`
- `parse_envelope`, `build_request`, `build_notification`, `build_success_response`, `build_error_response`
- `RpcError`, `ClamatorProtocolError`, `ClamatorTransportError`, `exception_to_error_data`
- `Transport`, `Dispatcher`
- `RpcServerCore`, `RpcClientCore`, `ClamatorClient`

## Reserved error codes

Same as `@clamator/protocol`. Adding/changing a reserved code: update both languages + interop scenario in the same commit.

## Validation order (must match TS side)

- Server inbound: parse envelope → look up service+method → `params_model.model_validate` → invoke handler → `result_model.model_validate` → build response.
- Server outbound: handler return validated against result model.
- Client outbound: format check (regex); param schema validation lives in generated wrapper.
- Client inbound: parse envelope → unwrap result/error.

## Cross-cutting rules

- Async-only.
- Pydantic v2 with `model_config = {populate_by_name: True}` on every generated model (codegen sets this; protocol package does not enforce on bare BaseModel).
- `RpcServerCore.register_service` is dedup'd per service name.
- `start()` / `stop()` are idempotent; calling `start()` after `stop()` raises.

## Logging

`RpcServerCore`'s dispatcher uses `logging.getLogger("clamator_protocol.server_core")`. Three fault paths emit records (wire format unchanged):

- Handler exception (`-32603 Internal error`) → `ERROR` with `exc_info`.
- Result-model validation failure (`-32603 Result validation failed`) → `ERROR` with the `errors` payload.
- Params-model validation failure (`-32602 Invalid params`) → `WARNING` with the `errors` payload.

`RpcError` raised by a handler is the typed-failure path and is intentionally **not** logged. Each record carries a `clamator` key in `extra` (`{service, method, rpc_id, errors?}`) — the namespace avoids collision with `LogRecord` builtins. Library does not call `logging.basicConfig`; the application configures handlers and levels.
