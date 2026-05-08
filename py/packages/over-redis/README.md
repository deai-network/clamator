# clamator-over-redis

Redis-streams transport for [clamator](https://pypi.org/project/clamator-protocol/). Implements the `Transport` interface from `clamator-protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a Py service and a TS service, or two Py services on different hosts. Requires Pydantic v2 and `redis>=5`.

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
    client = RedisRpcClient(redis=redis, key_prefix=key_prefix, default_timeout_ms=3000)  # default timeout 30 s on the full round-trip (xadd → handler → reply); no auto-retry on disconnect; timeouts not propagated to server (server completes the handler and writes a reply the client ignores)  # noqa: E501
    await client.start()
    arith = ArithClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    await client.stop()
    return r
```

(Verbatim from `py/packages/over-redis/tests/client.py:1-13`.)

`server.start()` returns once each registered service has its consumer group created and its read loop spawned; it does not block. Your application controls the server's lifetime. Call `await server.stop()` to shut down — drains in-flight handlers up to `grace_ms` (default 5 s) before disconnecting. `start()` and `stop()` are both idempotent (calling either twice is a no-op); once `stop()` has been called, calling `start()` again raises — create a new instance to restart. Client-side cancellation (e.g., `asyncio.CancelledError` raised in the awaiter) is not propagated to the server; the server completes the handler and writes a reply that the canceled caller never reads.

A single server can host multiple services. Call `register_service(contract, handler_obj)` once per contract before `start()`; each service gets its own consumer group keyed by the service name. Registrations after `start()` are silently ignored — no consumer group or read loop is created for them.

By default the connection is built from `$REDIS_URL` (or `redis://localhost:6379`). Pass `redis_url=` for a different URL, or `redis=` for a pre-built `redis.asyncio.Redis` instance.

`key_prefix` is used as a literal Redis key prefix — clamator does not parse it. Any string Redis accepts as a key works, including slashes, colons, and embedded path-like separators (e.g., `my-app/tenant-42`). Pick a `key_prefix` that doesn't collide with non-clamator usage of the same Redis instance: clamator owns only keys under its prefix (see "Keys owned" below), but a sibling app writing to those same keys would corrupt clamator's streams (and vice versa).

**Consumer-group cleanup on server crash.** clamator never calls `XGROUP DELCONSUMER`. A crashed or stopped server leaves its `<service>:<instance_id>` consumer entry in the group with whatever pending entries it had unacknowledged (those get reclaimed by `XAUTOCLAIM` after `consumer_claim_idle_ms`). The consumer entry itself persists. Long-lived deployments with frequent restarts accumulate dead-consumer entries; periodic operator cleanup via `XINFO CONSUMERS <stream> <group>` + `XGROUP DELCONSUMER` for entries with idle time well past your reclaim window is recommended.

Sharing one injected `redis` instance across multiple `RedisRpcServer` and `RedisRpcClient` instances — and across your application's other Redis usage on the same instance — is safe. Each server/client manages its own subscription internally; XREADGROUP and reply-stream XREAD calls use short polling blocks, so non-blocking ops (XADD, XACK, XAUTOCLAIM) on the same connection interleave without deadlock.

Per-client reply streams are bounded: the server XADDs replies with `maxlen=reply_stream_maxlen` (default 1024, approximate) and the client deletes its reply stream on `stop()`. If a client process crashes without calling `stop()`, the reply-stream key persists with up to ~1024 entries until manually deleted; there is no Redis-side TTL. From the server's perspective the abandoned reply stream is harmless — XADD to a stream nobody is reading is still a normal stream write; the bounded MAXLEN keeps memory usage finite.

## Lifecycle integration

`start()` returns immediately, leaving the server running in background tasks — your application owns the wait-and-shutdown loop. The canonical pattern is to await an `asyncio.Event` that signal handlers `.set()`, with `await server.stop()` in a `finally` so the drain still runs if the awaiter is cancelled:

```python
import asyncio
import signal

from clamator_over_redis import RedisRpcServer
from redis.asyncio import Redis

from .generated.arith import AddParams, AddResult, ArithService, PingParams, arith_contract


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)

    async def ping(self, params: PingParams) -> None:
        return None


# Long-running server that stops gracefully on SIGTERM/SIGINT.
# Wire pattern: start the server, then await an asyncio.Event that the signal
# handlers .set() on receipt; on wake, call await server.stop() in a finally
# so the drain still runs even if the awaiter is cancelled.
async def run_arith_server(*, redis: Redis, key_prefix: str) -> None:
    server = RedisRpcServer(redis=redis, key_prefix=key_prefix)
    server.register_service(arith_contract, Arith())
    await server.start()
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)
    try:
        await stop_event.wait()
    finally:
        await server.stop()
```

(Verbatim from `py/packages/over-redis/tests/server_lifecycle_example.py:1-33`.)

## Key surface

- `RedisRpcServer(*, key_prefix, redis=None, redis_url=None, instance_id=None, consumer_claim_idle_ms=60_000, reply_stream_maxlen=1024, shutdown_grace_ms=5_000)` — `register_service(contract, handler_obj)`, `start()`, `stop(*, grace_ms=5_000)`.
- `RedisRpcClient(*, key_prefix, redis=None, redis_url=None, default_timeout_ms=30_000, instance_id=None)` — `start()`, `stop()`. The instance is a `ClamatorClient`, so it can be wrapped by a generated `*Client` proxy.

## Client lifetime and fan-out

`RedisRpcClient` and `RedisRpcServer` are stateful: each spawns a background reply/consumer loop and (`RedisRpcClient`) maintains a per-instance reply-stream key in Redis. Construct once and keep alive for the application's lifetime — do not construct/destroy per call.

A `key_prefix` identifies a backend, not a service. One `RedisRpcClient` can back many service proxies — wrap it with each generated `*Client`:

```python
from clamator_over_redis import RedisRpcClient

from .generated.arith import AddParams, AddResult, ArithClient
from .generated.logger import LoggerClient, LogParams


# One key_prefix-pinned RedisRpcClient backs many service proxies.
async def call_multiple_services(key_prefix: str) -> AddResult:
    client = RedisRpcClient(key_prefix=key_prefix)
    await client.start()
    arith = ArithClient(client)
    logger = LoggerClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    await logger.log(LogParams(msg=f"sum={r.sum}"))
    await client.stop()
    return r
```

(Verbatim from `py/packages/over-redis/tests/multi_service_example.py:1-16`.)

For multiple backends, construct one `RedisRpcClient` per `key_prefix` and hold them in named variables. The same injected `redis` instance can back every client, so the marginal cost of an additional `key_prefix` is one background task + one reply-stream key in Redis. The "multiple backends, one key_prefix per backend" topology degenerates the worker-pool semantics to a pool of one per key_prefix — the `key_prefix` itself acts as the multi-tenant routing key, and each client's traffic stays within its own backend's command and reply streams.

Call `await client.stop()` on each client during application shutdown to drain the reply loop and delete the reply-stream key.

## Per-call timeout override

Each generated proxy method accepts an optional `timeout_ms` keyword argument that overrides the client's `default_timeout_ms` for that single call: `await arith.add(AddParams(a=2, b=3), timeout_ms=60_000)`. When omitted, the client's `default_timeout_ms` applies. Notification proxy methods don't accept the override — they have no reply to wait for. The override is round-trip wall-time (xadd → handler → reply); cancellation and retry semantics are otherwise unchanged.

## Worker-pool semantics

Multiple `RedisRpcServer` instances sharing the same `key_prefix` form a competing-consumers pool: each call is processed by exactly one instance. They share a single Redis consumer group per service (named `<service>`); each server is a unique consumer (named `<service>:<instance_id>`). XREADGROUP delivers each request to exactly one server. A reclaim loop (`XAUTOCLAIM`) re-delivers messages unacknowledged for `consumer_claim_idle_ms` (default 60,000 ms). Delivery semantics are at-least-once. To run a single-consumer scenario, run one server.

**Handlers must be idempotent.** A handler whose execution exceeds `consumer_claim_idle_ms` is reclaimed and re-dispatched to another consumer (or itself), so the same request may run more than once. A client timeout does not propagate to the server (see the client comment above), so a request the client gave up on may still complete server-side.

**On start.** The server's consumer loop reads new entries via XREADGROUP with id `>`. Pending entries from a prior session — entries XREADGROUPed but not XACKed before a crash — are reclaimed via XAUTOCLAIM after `consumer_claim_idle_ms` (default 60s) elapses; new entries arriving in the meantime are processed normally.

**Per-service dispatch is serialized within a single server.** Each registered service has its own consumer loop that reads up to 16 messages per XREADGROUP poll and processes them one at a time (`await` per message; no detached tasks). Multiple services registered on the same server run their own consumer loops concurrently, but two requests for the same service on the same server are not parallelized.

**Single-server in-order invariant.** Within one `RedisRpcServer` instance, this serialization is a documented invariant: a request arriving after another on the same service observes the full effect of the prior request's handler before its own handler runs. Handlers can rely on previous-call mutations being visible (state machines, per-aggregate updates) without explicit locking. The invariant survives as long as handler latency stays well under `consumer_claim_idle_ms` (default 60s) — a handler exceeding the reclaim threshold can be redelivered while still running, which violates the order.

**Multi-server / worker-pool ordering is not yet finalized — clamator is pre-1.0.** The current behavior under worker-pool fan-out (multiple `RedisRpcServer` instances sharing the same `key_prefix`) is competing-consumers via XREADGROUP, with no in-order guarantee across servers. That falls out of the XREADGROUP design rather than being a stable contract. If you need ordered processing today, the supported pattern is **partition by `key_prefix`**: assign a unique `key_prefix` per ordering domain (e.g., per tenant, per aggregate root, per database) and run exactly one server per `key_prefix`. Richer multi-server ordering primitives (e.g., sticky transactions, contract-level partition keys) are candidates for a future minor release.

To process one service's requests in parallel within a single server (when ordering is not required), have your handler spawn the work as `asyncio.create_task(...)` and return immediately; the consumer-loop dispatch becomes effectively non-blocking and the reply confirms acceptance, not completion.

**Single-consumer case.** For single-server deployments (one server per backend), worker-pool semantics degenerate trivially: the consumer group has one consumer, every request goes to that consumer, and no fan-out concerns apply.

## Fire-and-forget operations

Operations the caller doesn't need a reply for — telemetry, cache invalidations, status pings — should be modeled as notifications in the contract (`defineNotification` on the TS side; `MethodEntry(result_model=None, ...)` on the Py side). The generated proxy emits a typed notification method that returns once the request envelope is XADDed to Redis; it does not wait for the server to process.

```python
from clamator_over_redis import RedisRpcClient

from .generated.arith import ArithClient, PingParams


# Fire-and-forget: notification proxies return once the request is queued in Redis;
# they do not wait for the server to process. Handlers must be idempotent — see
# "Worker-pool semantics" for the at-least-once delivery details.
async def fire_notification(key_prefix: str) -> None:
    client = RedisRpcClient(key_prefix=key_prefix)
    await client.start()
    arith = ArithClient(client)
    await arith.ping(PingParams())
    await client.stop()
```

(Verbatim from `py/packages/over-redis/tests/fire_and_forget_example.py:1-14`.)

The await resolves once the message is on the stream. It does not confirm the server received, processed, or finished the call. Notification handlers run under the same at-least-once delivery semantics as method handlers — design them to be idempotent.

## Long-running background processes

clamator's RPC surface is request/reply (and fire-and-forget for notifications). It does not provide a server-to-client streaming or progress channel — the typed proxy is a single round-trip. If you need actual monitoring and control of long-running background processes (start, stop, query state, report progress, cancel, sequential and parallel children, persistence across restarts), which is a different concern from RPC, look at [Optio](https://github.com/deai-network/optio): a Python process-management framework that handles exactly that.

## Re-entrancy

**Cross-service or cross-`key_prefix` re-entrancy is safe.** A handler can `await client.call(...)` against a different service, or a different `key_prefix` via a different `RedisRpcClient`, without issue — different streams, different consumer groups, no shared lock.

**Same-service same-server re-entrancy deadlocks.** A handler that calls `await client.call("myservice", "foo", ...)` to invoke its own service's method on the same server will deadlock: the consumer loop reading that service's stream is held by the outer handler, so the inner request sits in the stream forever, and the outer handler waits forever for the inner reply.

**Don't go through the RPC layer for in-process composition.** If a handler needs the logic of another method on the same service, factor that logic into a regular function or call the other method on `self` directly (`await self.foo(params)`). The RPC layer is for wire-side routing; once a request is dispatched, you have direct access to your own code, and a Python function call achieves the same result with zero serialization, zero validation overhead, and no deadlock risk.

## Authorization

clamator has no authorization at the RPC layer. Any process that can read/write this Redis instance can call any registered method or send any notification — there is no caller identity in the wire envelope.

Apply caller-identity checks at the boundary: a gateway (HTTP server, message-bus filter, etc.) enforces who-can-call-what before invoking the typed proxy. Deploy Redis behind a network you trust (TLS, AUTH, ACLs, private VPC); the transport assumes the substrate is already restricted to authenticated participants.

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
