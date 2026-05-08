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

The emitted `generated/arith.py` exports Pydantic models, a typed `ArithClient`, an `ArithService` ABC, and the `arith_contract` `Contract` object. Wire server and client through Redis, talk via `ArithClient`.

Server-side — register handlers and start:

```python
from clamator_over_redis import RedisRpcServer
from redis.asyncio import Redis

from .generated.arith import AddParams, AddResult, ArithService, PingParams, arith_contract


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)

    async def ping(self, params: PingParams) -> None:
        return None


async def build_arith_server(*, redis: Redis, key_prefix: str) -> RedisRpcServer:
    server = RedisRpcServer(redis=redis, key_prefix=key_prefix)  # injected redis= not closed by stop() — caller owns lifecycle; omit to let transport own it  # noqa: E501
    server.register_service(arith_contract, Arith())  # must precede start() — post-start registrations are silently ignored, no consumer group or read loop is created  # noqa: E501
    await server.start()
    return server
```

(Verbatim from `py/packages/over-redis/tests/server.py:1-19`.)

Client-side — call the typed proxy:

```python
from clamator_over_redis import RedisRpcClient
from redis.asyncio import Redis

from .generated.arith import AddParams, AddResult, ArithClient


async def call_arith(*, redis: Redis, key_prefix: str) -> AddResult:
    client = RedisRpcClient(redis=redis, key_prefix=key_prefix, default_timeout_ms=3000)  # default timeout 30 s; no auto-retry on disconnect; timeouts not propagated to server  # noqa: E501
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    await client.stop()
    return r
```

(Verbatim from `py/packages/over-redis/tests/client.py:1-13`.)

Call `await server.stop()` to shut down — drains in-flight handlers up to `grace_ms` (default 5 s) before disconnecting.

By default the connection is built from `$REDIS_URL` (or `redis://localhost:6379`). Pass `redis_url=` for a different URL, or `redis=` for a pre-built `redis.asyncio.Redis` instance.

## Key surface

- `RedisRpcServer(*, key_prefix, redis=None, redis_url=None, ...)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `RedisRpcClient(*, key_prefix, redis=None, redis_url=None, default_timeout_ms=30_000)` — `start()`, `stop()`. The instance is a `ClamatorClient`, so it can be wrapped by a generated `*Client` proxy.

## Worker-pool semantics

Multiple `RedisRpcServer` instances sharing the same `key_prefix` form a competing-consumers pool: each call is processed by exactly one instance. They share a single Redis consumer group per service (named `<service>`); each server is a unique consumer (named `<service>:<instance_id>`). XREADGROUP delivers each request to exactly one server. A reclaim loop (`XAUTOCLAIM`) re-delivers messages unacknowledged for `consumer_claim_idle_ms` (default 60,000 ms). Delivery semantics are at-least-once. To run a single-consumer scenario, run one server.

## Keys owned under `key_prefix`

| Pattern | Type | Purpose |
|---|---|---|
| `<key_prefix>:cmds:<service>` | stream | inbound command stream per service; servers consume via XREADGROUP, clients write via XADD |
| `<key_prefix>:replies:<instance_id>` | stream | per-client reply stream; servers write replies via XADD, the client reads via XREAD; deleted by client `stop()` |
| `<service>` | consumer group | competing-consumers pool name (lives inside the cmds stream's metadata; not a top-level key) |

## When to reach for this vs. `clamator-over-memory`

- [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/) — tests, embedded scenarios, anything single-process.
- `clamator-over-redis` — cross-process, cross-host, durable streams, production.

## Links

- Sibling (TypeScript): [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
