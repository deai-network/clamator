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
  const client = new RedisRpcClient({ redis: opts.redis, keyPrefix: opts.keyPrefix, defaultTimeoutMs: 3000 }); // default timeout 30 s; no auto-retry on disconnect; timeouts not propagated to server
  await client.start();
  const arith = new ArithClient(client);
  const r = await arith.add({ a: 2, b: 3 });
  await client.stop();
  return r;
}
```

(Verbatim from `ts/packages/over-redis/tests/client.ts:1-12`. In your own code, replace `../src/index.js` with `@clamator/over-redis`.)

Call `await server.stop()` to shut down — drains in-flight handlers up to `graceMs` (default 5 s) before disconnecting.

By default the connection is built from `$REDIS_URL` (or `redis://localhost:6379`). Pass `redisUrl` for a different URL, or `redis` for a pre-built `ioredis` instance.

## Key surface

- `RedisRpcServer({ keyPrefix, redis?, redisUrl?, ... })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `RedisRpcClient({ keyPrefix, redis?, redisUrl?, defaultTimeoutMs? })` — `start()`, `stop()`. The instance is also a `ClamatorClient`, so it can be wrapped by a generated `*Client` proxy.

## Worker-pool semantics

Multiple `RedisRpcServer` instances sharing the same `keyPrefix` form a competing-consumers pool: each call is processed by exactly one instance. They share a single Redis consumer group per service (named `<service>`); each server is a unique consumer (named `<service>:<instanceId>`). XREADGROUP delivers each request to exactly one server. A reclaim loop (`XAUTOCLAIM`) re-delivers messages unacknowledged for `consumerClaimIdleMs` (default 60,000 ms). Delivery semantics are at-least-once. To run a single-consumer scenario, run one server.

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
