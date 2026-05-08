# clamator-over-memory

In-process loopback transport for [clamator](https://pypi.org/project/clamator-protocol/). The shared `MemoryBus` connects a `MemoryRpcServer` and `MemoryRpcClient` running in the same Python process.

## Install

```bash
pip install clamator-over-memory clamator-protocol
```

## Quickstart

```python
import asyncio
import pytest
from pydantic import BaseModel
from clamator_protocol import Contract, MethodEntry, RpcError
from clamator_over_memory import MemoryBus, MemoryRpcServer, MemoryRpcClient


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int


class PingP(BaseModel):
    tag: str | None = None


arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)


class Svc:
    def __init__(self):
        self.pinged = False
    async def add(self, p: AddP) -> AddR:
        return AddR(sum=p.a + p.b)
    async def ping(self, p: PingP) -> None:
        self.pinged = True


async def test_round_trip():
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith, Svc())
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    r = await client.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    await client.stop()
    await server.stop()
```

(Verbatim from `py/packages/over-memory/tests/test_loopback.py:1-49`.)

## Configuration

`MemoryBus()` takes no arguments. The same instance is passed to the server and the client; that's the entire wiring.

`MemoryRpcServer(bus=...)` and `MemoryRpcClient(bus=...)` accept:

- `bus` — the shared `MemoryBus`.

There are no timeouts, retries, or stream parameters — the loopback is synchronous within a single asyncio task.

## Key surface

- `MemoryBus()` — the connecting object passed to both server and client.
- `MemoryRpcServer(bus=...)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `MemoryRpcClient(bus=...)` — `start()`, `stop()`, `call(service, method, params)`, `notify(service, method, params)`.

## When to reach for this vs. `clamator-over-redis`

- `clamator-over-memory` — tests, embedded scenarios, anything single-process.
- [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/) — cross-process, cross-host, durable streams, production.

## Codegen workflow

The codegen tool is published as [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) on npm regardless of which language consumes the output. To target Python, run the TS-side tool with `--out-py <dir>` and import the emitted modules from your Python package.

## Links

- Sibling (TypeScript): [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
