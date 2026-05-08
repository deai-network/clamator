# clamator-over-redis

Redis-streams transport for [clamator](https://pypi.org/project/clamator-protocol/). Implements the `Transport` interface from `clamator-protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a Py service and a TS service, or two Py services on different hosts.

## Install

```bash
pip install clamator-over-redis clamator-protocol redis
```

## Quickstart

Define the contract once and import it from both the server and the client:

```python
# arith_contract.py
from pydantic import BaseModel
from clamator_protocol import Contract, MethodEntry


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int


class PingP(BaseModel):
    pass


arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)
```

Server:

```python
# server.py
import asyncio

from clamator_over_redis import RedisRpcServer

from arith_contract import AddP, AddR, PingP, arith


class ArithService:
    async def add(self, p: AddP) -> AddR:
        return AddR(sum=p.a + p.b)

    async def ping(self, p: PingP) -> None:
        pass


async def main() -> None:
    server = RedisRpcServer(key_prefix="my-app")
    server.register_service(arith, ArithService())
    await server.start()
    await asyncio.Event().wait()  # serve until cancelled


if __name__ == "__main__":
    asyncio.run(main())
```

Client:

```python
# client.py
import asyncio

from clamator_over_redis import RedisRpcClient


async def main() -> None:
    client = RedisRpcClient(key_prefix="my-app")
    await client.start()
    result = await client.call("arith", "add", {"a": 2, "b": 3})
    print(result)  # {"sum": 5}
    await client.stop()


if __name__ == "__main__":
    asyncio.run(main())
```

By default the connection is built from `$REDIS_URL` (or `redis://localhost:6379`). Pass `redis_url=` for a different URL, or `redis=` for a pre-built `redis.asyncio.Redis` instance.

## Key surface

- `RedisRpcServer(*, key_prefix, redis=None, redis_url=None, ...)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `RedisRpcClient(*, key_prefix, redis=None, redis_url=None, default_timeout_ms=30_000)` — `start()`, `stop()`, `call(service, method, params, *, timeout_ms=None)`, `notify(service, method, params)`.

## When to reach for this vs. `clamator-over-memory`

- [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/) — tests, embedded scenarios, anything single-process.
- `clamator-over-redis` — cross-process, cross-host, durable streams, production.

## Codegen workflow

The codegen tool is published as [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) on npm regardless of which language consumes the output. Run it from the TS side with `--out-py <dir>` and import the emitted modules from your Python package.

## Links

- Sibling (TypeScript): [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
