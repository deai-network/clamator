# clamator-over-redis

Redis-streams transport for [clamator](https://pypi.org/project/clamator-protocol/). Implements the `Transport` interface from `clamator-protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a Py service and a TS service, or two Py services on different hosts.

## Install

```bash
pip install clamator-over-redis clamator-protocol redis
```

## Quickstart

```python
import pytest
from pydantic import BaseModel
from redis.asyncio import Redis
from clamator_protocol import Contract, MethodEntry, RpcError
from clamator_over_redis import RedisRpcServer, RedisRpcClient


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


class Svc:
    async def add(self, p): return AddR(sum=p.a + p.b)
    async def ping(self, p): pass


async def test_round_trip(redis_url, key_prefix, cleanup):
    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith, Svc())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    r = await client.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    await client.stop()
    await server.stop()
    await rs.aclose()
    await rc.aclose()
```

(Verbatim from `py/packages/over-redis/tests/test_round_trip.py:1-48`.)

## Configuration

`RedisRpcServer` keyword arguments:

- `redis` — a `redis.asyncio.Redis` instance, dedicated to this server.
- `key_prefix` — string prefix for the request and response stream keys. Both sides must agree.
- `instance_id` (optional) — unique id of this server instance; defaults to a random UUID. Used for redelivery / claim semantics.
- `consumer_claim_idle_ms` (optional) — milliseconds before a pending message becomes eligible for claim by another consumer; defaults to 60000.
- `reply_stream_maxlen` (optional) — bound on the per-service reply stream length (Redis `MAXLEN`); defaults to 1024.
- `shutdown_grace_ms` (optional) — grace period in milliseconds for in-flight work to complete during `stop()`; defaults to 5000.

`RedisRpcClient` keyword arguments:

- `redis` — a `redis.asyncio.Redis` instance, dedicated to this client.
- `key_prefix` — same prefix the server uses.
- `instance_id` (optional) — unique id of this client instance; defaults to a random UUID. Used to scope reply streams.
- `default_timeout_ms` (optional) — default timeout per call when the caller does not specify one; defaults to 30000.

## Key surface

- `RedisRpcServer(*, redis, key_prefix, instance_id=None, consumer_claim_idle_ms=60_000, reply_stream_maxlen=1024, shutdown_grace_ms=5_000)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `RedisRpcClient(*, redis, key_prefix, instance_id=None, default_timeout_ms=30_000)` — `start()`, `stop()`, `call(service, method, params, *, timeout_ms=None)`, `notify(service, method, params)`.

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
