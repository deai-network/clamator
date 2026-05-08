# @clamator/over-redis

Redis-streams transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). Implements the `Transport` interface from `@clamator/protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a TS service and a Py service, or two TS services on different hosts.

## Install

```bash
npm install @clamator/over-redis @clamator/protocol ioredis
```

## Quickstart

Define the contract in TypeScript:

```typescript
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  ping: defineNotification({ params: z.object({}) }),
});
```

(Verbatim from `ts/packages/over-redis/tests/contracts/arith.ts:1-10`.)

Run [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) to emit a typed client and a service interface from that contract:

```bash
npx @clamator/codegen --src contracts --out-ts generated --ts-contract-import '../contracts/arith.js'
```

Server-side — register handlers and start:

```typescript
import type IORedis from 'ioredis';
import { RedisRpcServer } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import type { ArithService } from './generated/arith.js';

export async function buildArithServer(opts: { redis: IORedis; keyPrefix: string }) {
  const server = new RedisRpcServer({ redis: opts.redis, keyPrefix: opts.keyPrefix }); // injected redis= not closed by stop() — caller owns lifecycle; omit to let transport own it
  const handlers: ArithService = {
    add: async ({ a, b }) => ({ sum: a + b }),
    ping: async (_params) => {},
  };
  server.registerService(arithContract, handlers); // must precede start() — post-start registrations are silently ignored, no consumer group or read loop is created
  await server.start();
  return server;
}
```

(Verbatim from `ts/packages/over-redis/tests/server.ts:1-15`. In your own code, replace `../src/index.js` with `@clamator/over-redis`.)

Client-side — call the typed proxy:

```typescript
import type IORedis from 'ioredis';
import { RedisRpcClient } from '../src/index.js';
import { ArithClient } from './generated/arith.js';

export async function callArith(opts: { redis: IORedis; keyPrefix: string }) {
  const client = new RedisRpcClient({ redis: opts.redis, keyPrefix: opts.keyPrefix, defaultTimeoutMs: 3000 }); // default timeout 30 s on the full round-trip (xadd → handler → reply); no auto-retry on disconnect; timeouts not propagated to server (server completes the handler and writes a reply the client ignores)
  await client.start();
  const arith = new ArithClient(client);
  const r = await arith.add({ a: 2, b: 3 });
  await client.stop();
  return r;
}
```

(Verbatim from `ts/packages/over-redis/tests/client.ts:1-12`. In your own code, replace `../src/index.js` with `@clamator/over-redis`.)

`server.start()` returns once each registered service has its consumer group created and its read loop spawned; it does not block. Your application controls the server's lifetime. Call `await server.stop()` to shut down — drains in-flight handlers up to `graceMs` (default 5 s) before disconnecting.

A single server can host multiple services. Call `registerService(contract, handlers)` once per contract before `start()`; each service gets its own consumer group keyed by the service name. Registrations after `start()` are silently ignored — no consumer group or read loop is created for them.

By default the connection is built from `$REDIS_URL` (or `redis://localhost:6379`). Pass `redisUrl` for a different URL, or `redis` for a pre-built `ioredis` instance.

Sharing one injected `redis` instance across multiple `RedisRpcServer` and `RedisRpcClient` instances — and across your application's other Redis usage on the same instance — is safe. Each server/client manages its own subscription internally: for blocking stream reads (XREADGROUP, XREAD on the reply stream), the transport calls `redis.duplicate()` to obtain a dedicated connection so the injected one stays available for non-blocking ops (XADD, XACK, XAUTOCLAIM).

Per-client reply streams are bounded: the server XADDs replies with `MAXLEN ~ replyStreamMaxLen` (default 1024) and the client `DEL`s its reply stream on `stop()`. If a client process crashes without calling `stop()`, the reply-stream key persists with up to ~1024 entries until manually deleted; there is no Redis-side TTL.

## Key surface

- `RedisRpcServer({ keyPrefix, redis?, redisUrl?, ... })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `RedisRpcClient({ keyPrefix, redis?, redisUrl?, defaultTimeoutMs? })` — `start()`, `stop()`. The instance is also a `ClamatorClient`, so it can be wrapped by a generated `*Client` proxy.

## Client lifetime and fan-out

`RedisRpcClient` and `RedisRpcServer` are stateful: each spawns a background reply/consumer loop, calls `redis.duplicate()` for a dedicated blocking connection, and (`RedisRpcClient`) maintains a per-instance reply-stream key in Redis. Construct once and keep alive for the application's lifetime — do not construct/destroy per call.

A `keyPrefix` identifies a backend, not a service. One `RedisRpcClient` can back many service proxies — wrap it with each generated `*Client`:

```typescript
import { RedisRpcClient } from '../src/index.js';
import { ArithClient } from './generated/arith.js';
import { LoggerClient } from './generated/logger.js';

// One keyPrefix-pinned RedisRpcClient backs many service proxies.
export async function callMultipleServices(keyPrefix: string) {
  const client = new RedisRpcClient({ keyPrefix });
  await client.start();
  const arith = new ArithClient(client);
  const logger = new LoggerClient(client);
  const sum = await arith.add({ a: 2, b: 3 });
  await logger.log({ msg: `sum=${sum.sum}` });
  await client.stop();
  return sum;
}
```

(Verbatim from `ts/packages/over-redis/tests/multi-service.example.ts:1-15`. In your own code, replace `../src/index.js` with `@clamator/over-redis`.)

For multiple backends, construct one `RedisRpcClient` per `keyPrefix` and hold them in named variables. The same injected `redis` instance can back every client, so the marginal cost of an additional `keyPrefix` is one background task + one duplicated TCP connection + one reply-stream key in Redis.

Call `await client.stop()` on each client during application shutdown to drain the reply loop and `DEL` the reply-stream key.

## Worker-pool semantics

Multiple `RedisRpcServer` instances sharing the same `keyPrefix` form a competing-consumers pool: each call is processed by exactly one instance. They share a single Redis consumer group per service (named `<service>`); each server is a unique consumer (named `<service>:<instanceId>`). XREADGROUP delivers each request to exactly one server. A reclaim loop (`XAUTOCLAIM`) re-delivers messages unacknowledged for `consumerClaimIdleMs` (default 60,000 ms). Delivery semantics are at-least-once. To run a single-consumer scenario, run one server.

**Handlers must be idempotent.** A handler whose execution exceeds `consumerClaimIdleMs` is reclaimed and re-dispatched to another consumer (or itself), so the same request may run more than once. A client timeout does not propagate to the server (see the client comment above), so a request the client gave up on may still complete server-side.

**Per-service dispatch is serialized within a single server.** Each registered service has its own consumer loop that reads up to 16 messages per XREADGROUP poll and processes them one at a time (`await` per message; no `asyncio.create_task`). Multiple services registered on the same server run their own consumer loops concurrently, but two requests for the same service on the same server are not parallelized. To process one service's requests in parallel, run multiple `RedisRpcServer` instances sharing the same `keyPrefix` — the consumer group splits work between them.

## Fire-and-forget operations

Operations the caller doesn't need a reply for — telemetry, cache invalidations, status pings — should be modeled as notifications in the contract (`defineNotification` on the TS side; `MethodEntry(result_model=None, ...)` on the Py side). The generated proxy emits a typed notification method that returns once the request envelope is XADDed to Redis; it does not wait for the server to process.

```typescript
import { RedisRpcClient } from '../src/index.js';
import { ArithClient } from './generated/arith.js';

// Fire-and-forget: notification proxies return once the request is queued in Redis;
// they do not wait for the server to process. Handlers must be idempotent — see
// "Worker-pool semantics" for the at-least-once delivery details.
export async function fireNotification(keyPrefix: string) {
  const client = new RedisRpcClient({ keyPrefix });
  await client.start();
  const arith = new ArithClient(client);
  await arith.ping({});
  await client.stop();
}
```

(Verbatim from `ts/packages/over-redis/tests/fire-and-forget.example.ts:1-13`. In your own code, replace `../src/index.js` with `@clamator/over-redis`.)

The await resolves once the message is on the stream. It does not confirm the server received, processed, or finished the call. Notification handlers run under the same at-least-once delivery semantics as method handlers — design them to be idempotent.

## Authorization

clamator has no authorization at the RPC layer. Any process that can read/write this Redis instance can call any registered method or send any notification — there is no caller identity in the wire envelope.

Apply caller-identity checks at the boundary: a gateway (HTTP server, message-bus filter, etc.) enforces who-can-call-what before invoking the typed proxy. Deploy Redis behind a network you trust (TLS, AUTH, ACLs, private VPC); the transport assumes the substrate is already restricted to authenticated participants.

## Keys owned under `keyPrefix`

| Pattern | Type | Purpose |
|---|---|---|
| `<keyPrefix>:cmds:<service>` | stream | inbound command stream per service; servers consume via XREADGROUP, clients write via XADD |
| `<keyPrefix>:replies:<instanceId>` | stream | per-client reply stream; servers write replies via XADD, the client reads via XREAD; deleted by client `stop()` |
| `<service>` | consumer group | competing-consumers pool name (lives inside the cmds stream's metadata; not a top-level key) |

## When to reach for this vs. `@clamator/over-memory`

- [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory) — tests, embedded scenarios, anything single-process.
- `@clamator/over-redis` — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
