# clamator-over-memory

In-process loopback transport for [clamator](https://pypi.org/project/clamator-protocol/). The shared `MemoryBus` connects a `MemoryRpcServer` and `MemoryRpcClient` running in the same Python process. Requires Pydantic v2.

## Install

```bash
pip install clamator-over-memory clamator-protocol
```

## Quickstart

Contracts are authored in TypeScript and the Python sibling is produced by [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen):

```bash
npx @clamator/codegen --src contracts --out-py generated
```

The emitted `generated/arith.py` exports Pydantic models, a typed `ArithClient`, an `ArithService` ABC, and the `arith_contract` `Contract` object. Wire server and client through a shared bus, talk via `ArithClient`.

Server-side — register handlers and start:

```python
from clamator_over_memory import MemoryBus, MemoryRpcServer

from .generated.arith import AddParams, AddResult, ArithService, arith_contract


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)


async def build_arith_server(bus: MemoryBus) -> MemoryRpcServer:
    server = MemoryRpcServer(bus=bus)  # no external connection; stop() unregisters from the bus without closing any resource  # noqa: E501
    server.register_service(arith_contract, Arith())  # must precede start() — post-start registrations are silently ignored, never registered on the bus  # noqa: E501
    await server.start()
    return server
```

(Verbatim from `py/packages/over-memory/tests/server.py:1-15`.)

Client-side — call the typed proxy:

```python
from clamator_over_memory import MemoryBus, MemoryRpcClient

from .generated.arith import AddParams, AddResult, ArithClient


async def call_arith(bus: MemoryBus) -> AddResult:
    client = MemoryRpcClient(bus=bus)  # default timeout 30 s on the full round-trip (call → handler → reply); pass default_timeout_ms to override; no retry; timeouts not propagated to server  # noqa: E501
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    await client.stop()
    return r
```

(Verbatim from `py/packages/over-memory/tests/client.py:1-12`.)

`server.start()` returns once handlers are registered on the bus; it does not block. Your application controls the server's lifetime. Call `await server.stop()` to shut down — since the loopback is in-process, the drain is instantaneous and the server unregisters from the bus without closing any external resource. `start()` and `stop()` are both idempotent (calling either twice is a no-op); once `stop()` has been called, calling `start()` again raises — create a new instance to restart.

A single server can host multiple services. Call `register_service(contract, handler_obj)` once per contract before `start()`; each is registered as its own dispatcher on the shared bus. Registrations after `start()` are silently ignored.

`MemoryBus()` takes no arguments and is the only wiring needed. The loopback is synchronous within a single asyncio task — no timeouts, retries, or stream parameters beyond the client's `default_timeout_ms`.

## Key surface

- `MemoryBus()` — the connecting object passed to both server and client.
- `MemoryRpcServer(bus=...)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `MemoryRpcClient(bus=...)` — `start()`, `stop()`. Wrap with a generated `*Client` proxy for typed calls.

## Worker-pool semantics

N/A — this transport is a single-process loopback. Multiple `MemoryRpcServer` instances on the same `MemoryBus` do not form a competing-consumers pool because there is no shared substrate; each bus is in-memory to its constructing process. For cross-process worker-pool behavior, use `clamator-over-redis`.

## Owned external state

N/A — `MemoryBus` owns no external state. There are no Redis keys, no streams, no files, no sockets. The bus is garbage-collected with the process.

## Connection ownership

N/A — there is no external connection to own. `MemoryRpcServer` and `MemoryRpcClient` share a `MemoryBus` that lives entirely in-process; `stop()` releases its references without closing any external resource.

## When to reach for this vs. `clamator-over-redis`

- `clamator-over-memory` — tests, embedded scenarios, anything single-process.
- [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/) — cross-process, cross-host, durable streams, production.

## Links

- Sibling (TypeScript): [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
