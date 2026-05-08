# @clamator/over-redis

Redis-streams transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). Implements the `Transport` interface from `@clamator/protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a TS service and a Py service, or two TS services on different hosts.

## Install

```bash
npm install @clamator/over-redis @clamator/protocol ioredis
```

## Quickstart

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification, RpcError } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;

const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  ping: defineNotification({ params: z.object({}) }),
});

describe.skipIf(!REDIS_URL)('redis round-trip', () => {
  let prefix: string;

  beforeAll(() => {
    if (!REDIS_URL) return;
  });

  afterEach(async () => {
    if (!REDIS_URL) return;
    const r = new IORedis(REDIS_URL!);
    const keys = await r.keys(`${prefix}:*`);
    if (keys.length) await r.del(...keys);
    await r.quit();
  });

  it('round-trips a successful call', async () => {
    prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    server.registerService(arith, { add: async ({ a, b }) => ({ sum: a + b }), ping: async () => {} });
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    const r = await client.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop(); await server.stop();
    await sredis.quit(); await credis.quit();
  });
```

(Verbatim from `ts/packages/over-redis/tests/round-trip.test.ts:1-45`. In your own code, replace the relative `'../src/index.js'` import with `'@clamator/over-redis'`.)

## Configuration

`RedisRpcServer` constructor options:

- `redis` — an `ioredis` `IORedis` instance, dedicated to this server.
- `keyPrefix` — string prefix for the request and response stream keys (e.g., `"my-service"`). Both sides must agree.
- `instanceId` (optional) — unique id of this server instance; defaults to a random suffix. Used for redelivery / claim semantics.
- `consumerClaimIdleMs` (optional) — milliseconds before a pending message becomes eligible for claim by another consumer; tune for your workload.
- `replyStreamMaxLen` (optional) — bound on the per-service reply stream length (Redis `MAXLEN`); defaults to 1024.
- `shutdownGraceMs` (optional) — grace period in milliseconds for in-flight work to complete during `stop()`.

`RedisRpcClient` constructor options:

- `redis` — an `ioredis` `IORedis` instance, dedicated to this client.
- `keyPrefix` — same prefix the server uses.
- `instanceId` (optional) — unique id of this client instance; defaults to a random UUID. Used to scope reply streams.
- `defaultTimeoutMs` (optional) — default timeout per call when the caller does not specify one.

## Key surface

- `RedisRpcServer({ redis, keyPrefix, instanceId?, consumerClaimIdleMs?, replyStreamMaxLen?, shutdownGraceMs? })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `RedisRpcClient({ redis, keyPrefix, instanceId?, defaultTimeoutMs? })` — `start()`, `stop()`, `call<P, R>(service, method, params, opts?)`, `notify(service, method, params)`.

## When to reach for this vs. `@clamator/over-memory`

- [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory) — tests, embedded scenarios, anything single-process.
- `@clamator/over-redis` — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
