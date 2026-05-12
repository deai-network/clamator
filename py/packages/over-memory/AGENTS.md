# clamator-over-memory — agent rules

In-process loopback transport. Per-language unit tests live here, NOT in `tests/interop/`.

## Public API surface

- `MemoryBus`
- `MemoryTransport`
- `MemoryRpcServer`
- `MemoryRpcClient`

Changes here usually require a sibling change in `@clamator/over-memory` (TS).

## Invariants (must match TS sibling)

- One server per service per bus. Duplicate registration raises `ValueError`.
- Worker pool semantics are NOT supported.
- `notify` to a service with no registered handler is a silent drop.
- `stop()` rejects all outstanding pending calls with `ClamatorTransportError("transport stopped")`.
- `start()` after `stop()` raises.
- No persistence.

## Logging

`MemoryTransport` uses `logging.getLogger("clamator_over_memory.transport")`. The dispatcher-wrapper site emits a `WARNING` record with `exc_info` when a dispatcher raises (the wire-side caller already sees the wrapped `ClamatorTransportError("dispatcher threw", cause=e)`; the log surfaces the original traceback to the operator).
