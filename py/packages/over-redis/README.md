# clamator-over-redis

Redis-streams transport for [clamator](https://pypi.org/project/clamator-protocol/). Implements the `Transport` interface from `clamator-protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a Py service and a TS service, or two Py services on different hosts.

## Install

```bash
pip install clamator-over-redis clamator-protocol redis
```

## Quickstart

Contracts are authored in TypeScript and the Python sibling is produced by [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen):

```bash
npx @clamator/codegen --src contracts --out-py generated
```

The emitted `generated/arith.py` exports Pydantic models, a typed `ArithClient`, an `ArithService` ABC, and the `arith_contract` `Contract` object.

Server — subclass the generated `ArithService` ABC:

```python
# server.py
import asyncio

from clamator_over_redis import RedisRpcServer

from generated.arith import (
    AddParams, AddResult, PingParams, ArithService, arith_contract,
)


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)

    async def ping(self, params: PingParams) -> None:
        pass


async def main() -> None:
    server = RedisRpcServer(key_prefix="my-app")
    server.register_service(arith_contract, Arith())
    await server.start()
    await asyncio.Event().wait()  # serve until cancelled


if __name__ == "__main__":
    asyncio.run(main())
```

Client — call methods on the generated `ArithClient`:

```python
# client.py
import asyncio

from clamator_over_redis import RedisRpcClient

from generated.arith import ArithClient, AddParams


async def main() -> None:
    transport = RedisRpcClient(key_prefix="my-app")
    await transport.start()

    arith = ArithClient(transport)
    result = await arith.add(AddParams(a=2, b=3))
    print(result)  # AddResult(sum=5)

    await transport.stop()


if __name__ == "__main__":
    asyncio.run(main())
```

By default the connection is built from `$REDIS_URL` (or `redis://localhost:6379`). Pass `redis_url=` for a different URL, or `redis=` for a pre-built `redis.asyncio.Redis` instance.

## Key surface

- `RedisRpcServer(*, key_prefix, redis=None, redis_url=None, ...)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `RedisRpcClient(*, key_prefix, redis=None, redis_url=None, default_timeout_ms=30_000)` — `start()`, `stop()`. The instance is a `ClamatorClient`, so it can be wrapped by a generated `*Client` proxy.

## When to reach for this vs. `clamator-over-memory`

- [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/) — tests, embedded scenarios, anything single-process.
- `clamator-over-redis` — cross-process, cross-host, durable streams, production.

## Links

- Sibling (TypeScript): [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
