# clamator-protocol

Pure JSON-RPC 2.0 protocol primitives plus Pydantic-derived envelope types for clamator. **No I/O, ever** — anything that touches a network, filesystem, or process belongs in a transport adapter.

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

(Verbatim from `py/packages/over-memory/tests/test_loopback.py`.)

When `clamator-protocol` is consumed alongside generated wrappers from `@clamator/codegen`, the `Contract` and `MethodEntry` values are produced by codegen — the snippet above is what direct authors of test contracts or custom tooling write.

## Key exports

- `Contract`, `MethodEntry` — declare a service's methods and notifications with Pydantic models for params and results.
- `RpcError` — the error type you raise from a handler to surface a structured JSON-RPC error to the caller.
- `ClamatorProtocolError`, `ClamatorTransportError` — distinguishable error classes for protocol-level vs. transport-level failures.
- `Transport`, `Dispatcher` — interfaces a custom transport adapter implements.

## Codegen workflow

clamator's codegen tool is published to npm (`@clamator/codegen`) regardless of which language consumes the output. Python users run the TS-side tool against their Zod contract source and consume the emitted Python wrappers from their package. See [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) for the CLI invocation.

## Links

- Sibling (TypeScript): [`@clamator/protocol`](https://www.npmjs.com/package/@clamator/protocol)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
