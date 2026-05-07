# @clamator/over-memory — agent rules

In-process loopback transport. Per-language unit tests of the protocol and adapter behavior land here, NOT in `tests/interop/`.

## Public API surface

- `MemoryBus`
- `MemoryTransport`
- `MemoryRpcServer`, `MemoryRpcServerOptions`
- `MemoryRpcClient`, `MemoryRpcClientOptions`

Changes here usually require a sibling change in `clamator-over-memory` (Py).

## Invariants

- One server per service per bus. Duplicate registration throws.
- Worker pool semantics are NOT supported (in-process; would be meaningless). For worker pools use `over-redis`.
- `notify` to a service with no registered handler is a silent drop.
- `stop()` rejects all outstanding pending calls with `ClamatorTransportError("transport stopped")`.
- `start()` after `stop()` throws.
- No persistence, no cross-bus federation.

## What lives here vs `tests/interop/`

- Lives here: protocol-level invariants, validation, error mapping, notifications, timeout behavior — fast, no docker.
- Lives in `tests/interop/`: cross-language behavior over `over-redis`. Memory cannot bridge languages by definition.
