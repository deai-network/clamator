# clamator-protocol

Pure JSON-RPC 2.0 protocol primitives plus Pydantic-derived envelope types for clamator. **No I/O, ever** — anything that touches a network, filesystem, or process belongs in a transport adapter. Requires Pydantic v2 (pinned `>=2.5`); v1 is not supported.

## Install

```bash
pip install clamator-protocol
```

## When you reach for this

- Defining a `Contract` (in tests, in custom tooling).
- Building a custom transport adapter that needs the wire-envelope models, the `Transport` and `Dispatcher` interfaces, or the reserved JSON-RPC error codes.

If you only consume generated clients and servers, you don't import this package directly — your transport package (`clamator-over-memory`, `clamator-over-redis`) re-exports the few symbols you need.

## Defining a contract

The Python counterpart of a Zod contract is a `Contract` with `MethodEntry` rows that bind Pydantic models to handler attribute names:

```python
arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)
```

(Verbatim from `py/packages/over-memory/tests/test_loopback.py:22-28`.)

When `clamator-protocol` is consumed alongside generated wrappers from `@clamator/codegen`, the `Contract` and `MethodEntry` values are produced by codegen — the snippet above is what direct authors of test contracts or custom tooling write.

The single `methods` dict holds both methods and notifications. A `MethodEntry` with `result_model=None` declares a notification (the snippet's `ping` is one); there is no separate `notifications=` kwarg. `handler_attr` is the attribute the dispatcher resolves on the registered handler instance — it is independent of the wire-side method name (the dict key) and is conventionally `snake_case`.

## Key exports

- `Contract`, `MethodEntry` — declare a service's methods and notifications with Pydantic models for params and results.
- `RpcError` — the error type you raise from a handler to surface a structured JSON-RPC error to the caller.
- `ClamatorProtocolError`, `ClamatorTransportError` — distinguishable error classes for protocol-level vs. transport-level failures.
- `Transport`, `Dispatcher` — interfaces a custom transport adapter implements.

## Hand-built contracts

The `Contract` and `MethodEntry` classes are first-class — you do not need to run codegen to use them. The "Defining a contract" snippet above is itself hand-built. Codegen exists to keep TS and Py contracts in lockstep when both languages consume the same wire-side service; if you only have a Py-side service, or if you need to build the contract dynamically at runtime (e.g., from a registry of handler functions keyed by command type), build the `Contract` by hand.

`register_service(contract, handler_instance)` accepts any `Contract` regardless of how it was built. The dispatcher calls `getattr(handler_instance, method_entry.handler_attr)(params)` for each request — the handler instance doesn't need to subclass any particular ABC, only to expose the right async attributes. Codegen-emitted contracts and hand-built contracts are interchangeable at the dispatch layer; the choice is purely about authoring ergonomics. **You can mix both on a single server**: register codegen-emitted services and hand-built services in the same startup sequence; each call is independent and the service-name uniqueness check is the only constraint.

## Codegen workflow

clamator's codegen is an npm package (`@clamator/codegen`) regardless of which language consumes the output. For a Py-only project, run the CLI against your Zod contract source and emit the Python wrappers into your package's source tree:

```bash
npx @clamator/codegen --src contracts --out-py src/myapp/_generated
```

Commit the emitted files alongside your code — they are vendored generated artifacts. Re-run codegen on contract changes; for drift detection, also pass `--manifest` and diff the manifest in CI (see [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) for the full pattern).

The Python package then imports `AddParams`, `AddResult`, `ArithClient`, `ArithService`, and `arith_contract` from `myapp._generated.arith`.

## Version compatibility

All seven clamator packages (TS + Py protocol, both transports on both languages, codegen) are released in lockstep — same `X.Y.Z` version, every time. The release-verification workflow refuses to publish a tag unless every package's manifest reports the matching version, and the same workflow runs the cross-language interop test suite. **Pin all your clamator packages to the same `X.Y.Z`** on both client and server sides — `clamator-protocol==X.Y.Z` + `clamator-over-redis==X.Y.Z` on the Py side, `@clamator/protocol@X.Y.Z` + `@clamator/over-redis@X.Y.Z` on the TS side.

The drift you do need to worry about is **your contract source diverging from your committed generated wrappers**. The "Drift detection via the manifest" pattern in [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) is the right tool: regenerate the manifest in CI and diff against the committed copy. At runtime, a contract mismatch surfaces as `RpcError(-32602, "Invalid params")` from server-side Pydantic validation — useful but generic; the manifest-diff pre-deploy check gives a more actionable error.

## Method or notification?

Both methods and notifications send a request envelope; only methods produce a response envelope. Pick by the caller's needs, not the handler's.

- **Use a method** when the caller needs to know whether the operation succeeded, get a value back, surface a structured `RpcError`, or sequence subsequent calls on completion. Methods carry a request id and the caller waits for the matching response or a timeout.
- **Use a notification** when the caller is doing fire-and-forget work where neither success/failure nor a return value matters in the moment — telemetry, cache-busting, status pings. Notifications have no request id and produce no response; the caller cannot tell whether the handler ran, succeeded, or threw.

If you would otherwise add a method that returns nothing solely to confirm delivery, prefer a method returning an empty Pydantic model over a notification — the response envelope is the confirmation. Pick a notification only when "did this run?" is genuinely not a question the caller will ever ask.

## Validation pipeline

Server-side handlers receive **already-validated Pydantic instances**, not raw dicts. The dispatcher does the work in this order on every incoming envelope:

1. **Params validation.** The wire dict goes through `method_entry.params_model.model_validate(...)`. Failures produce `RpcError(-32602, "Invalid params", data={"errors": <ValidationError details>})` and the request is rejected before the handler runs. Notifications with bad params are silently dropped.
2. **Handler dispatch.** The dispatcher calls `getattr(handler_instance, handler_attr)(params)` — passing the validated `params_model` instance. Handlers declare their type as the model class (e.g., `async def add(self, params: AddParams) -> AddResult`) and will never see a `dict` at runtime.
3. **Handler exceptions.** A handler that raises `RpcError(code, message, data)` produces a response with that exact code/message/data. Any other exception is wrapped as `RpcError(-32603, "Internal error", data={...exception details})`.
4. **Result validation.** If the method has a `result_model`, the return value is run through `result_model.model_validate(...)`. A handler returning the wrong shape is reported to the client as `RpcError(-32603, "Result validation failed", data={"errors": ...})` — there is no automatic coercion. Notifications skip result validation.

Handlers are insulated from wire-format details: if the dispatch reaches your code, the params are valid; if your return value fails validation, the client sees a structured error rather than a corrupted reply.

**Notification handler exceptions are silently swallowed.** The dispatcher catches `RpcError` and any other exception in the same `try/except` block, but returns `None` on the notification path (no response envelope to write). There is no built-in logging hook — if your notification handlers can fail in interesting ways, wrap the handler body with your own `try/except` + observability so the failure isn't invisible.

## Wire-format and serialization

The wire format is JSON. Pydantic v2 default serializers apply when params and results cross the wire: `datetime` → ISO 8601 string, `Decimal` → string, `bytes` → base64-encoded string, `UUID` → canonical hex. Native JSON types (string, number, boolean, null, list, dict) round-trip without configuration. For non-primitive custom types (e.g., MongoDB `ObjectId`), define matching serializers on both sides — Pydantic field serializers / `model_serializer` on Py, Zod `.transform(...)` on TS. The cross-language interop suite verifies primitive-type round-trip on every release; custom types are the integrator's responsibility.

## Observability

clamator provides no built-in logging, metrics, or tracing hooks. The dispatcher does not log handler invocations, errors, or timings — your handler body is the right place for instrumentation. Wrap each handler with your own structured logging or OpenTelemetry spans; the typed `params` and the handler's return value are the natural span attributes.

## Errors

Raise `RpcError` from a handler to surface a structured JSON-RPC error to the caller. The constructor takes a `code`, a `message`, and an optional `data` payload:

```python
from clamator_protocol import RpcError

RPC_FORBIDDEN = -32001  # application-defined; outside the reserved -32600..-32099 range


def test_rpc_error_construction():
    err = RpcError(RPC_FORBIDDEN, "forbidden", {"reason": "no-token"})
    assert err.code == RPC_FORBIDDEN
    assert err.message == "forbidden"
    assert err.data == {"reason": "no-token"}
```

(Verbatim from `py/packages/protocol/tests/test_rpc_error.py:1-10`.)

Reserved JSON-RPC error codes (`-32600` to `-32603` for protocol-level errors, `-32000` to `-32099` reserved for transport implementations) are owned by the protocol layer; pick application-specific codes outside that range. A workable convention is to pick a contiguous private band per error category (e.g., `-32100..-32199` for state-machine refusals, `-32200..-32299` for resource-not-found shapes) and document the band in your contract's documentation. Codegen does not reserve any band — application codes are entirely your namespace.

What the client sees:

- A handler that raises `RpcError(code, message, data)` produces an error response carrying that exact code/message/data on the client side; the proxy method re-raises an `RpcError` with the same fields.
- A handler that raises any other exception is caught by the protocol layer and wrapped: clients receive `RpcError(code=-32603, message="Internal error", data={...})` with exception details in `data`.
- A client-side call that exceeds `default_timeout_ms` raises `clamator_protocol.ClamatorTransportError("call timeout")` from the transport layer, NOT `asyncio.TimeoutError`. The same exception class surfaces when no server is consuming the request stream — there is no distinct "no consumer" error.
- Envelope-level parse and validation failures use the JSON-RPC reserved codes: `-32700` (parse error), `-32600` (invalid request), `-32601` (method not found), `-32602` (invalid params), `-32603` (internal error).

## Authorization

clamator has no authorization at the protocol or transport layer. Any process that can reach the underlying transport — a Redis instance for `over-redis`, the parent process for `over-memory` — can call any registered method or send any notification on any registered service.

Apply caller-identity checks at the boundary: a gateway (typically an HTTP server in front of the typed proxy) enforces who-can-call-what before invoking the proxy method. For network-substrate transports, deploy the substrate behind a network you trust (TLS, AUTH, ACLs, private VPC).

## Links

- Sibling (TypeScript): [`@clamator/protocol`](https://www.npmjs.com/package/@clamator/protocol)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
