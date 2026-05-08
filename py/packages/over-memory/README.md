# clamator-over-memory

In-process loopback transport for [clamator](https://pypi.org/project/clamator-protocol/). The shared `MemoryBus` connects a `MemoryRpcServer` and `MemoryRpcClient` running in the same Python process.

## Install

```bash
pip install clamator-over-memory clamator-protocol
```

## Quickstart

Contracts are authored in TypeScript and the Python sibling is produced by [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen):

```bash
npx @clamator/codegen --src contracts --out-py generated
```

The emitted `generated/arith.py` exports Pydantic models, a typed `ArithClient`, an `ArithService` ABC, and the `arith_contract` `Contract` object. Wire server and client through a shared bus, talk via `ArithClient`:

```python
from clamator_over_memory import MemoryBus, MemoryRpcClient, MemoryRpcServer

from .generated.arith import AddParams, AddResult, ArithClient, ArithService, arith_contract


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)


async def test_round_trip_via_codegen_typed_proxy():
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith_contract, Arith())
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    assert r.sum == 5  # noqa: PLR2004
    await client.stop()
    await server.stop()
```

(Verbatim from `py/packages/over-memory/tests/test_proxy_loopback.py:1-22`.)

`MemoryBus()` takes no arguments and is the only wiring needed. The loopback is synchronous within a single asyncio task — no timeouts, retries, or stream parameters.

## Key surface

- `MemoryBus()` — the connecting object passed to both server and client.
- `MemoryRpcServer(bus=...)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `MemoryRpcClient(bus=...)` — `start()`, `stop()`. Wrap with a generated `*Client` proxy for typed calls.

## When to reach for this vs. `clamator-over-redis`

- `clamator-over-memory` — tests, embedded scenarios, anything single-process.
- [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/) — cross-process, cross-host, durable streams, production.

## Links

- Sibling (TypeScript): [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
