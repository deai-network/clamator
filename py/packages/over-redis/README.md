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

The following test demonstrates both the server and client sides round-trip together using the generated `ArithClient` proxy and `ArithService` ABC:

```python
import pytest
from redis.asyncio import Redis
from clamator_over_redis import RedisRpcServer, RedisRpcClient
from .generated.arith import ArithClient, ArithService, arith_contract, AddParams, AddResult, PingParams


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)

    async def ping(self, params: PingParams) -> None:
        return None


@pytest.mark.asyncio
async def test_round_trip_via_codegen_typed_proxy(redis_url, key_prefix, cleanup):
    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith_contract, Arith())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    assert r.sum == 5
    await client.stop()
    await server.stop()
    await rs.aclose()
    await rc.aclose()
```

(Verbatim from `py/packages/over-redis/tests/test_proxy_round_trip.py:1-30`.)

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
