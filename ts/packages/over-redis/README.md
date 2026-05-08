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

The following test demonstrates both the server and client sides round-trip together using the generated `ArithClient` proxy and `ArithService` interface:

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import IORedis from 'ioredis';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import { ArithClient, type ArithService } from './generated/arith.js';

const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)('redis round-trip via codegen typed proxy', () => {
  let prefix: string;

  afterEach(async () => {
    if (!REDIS_URL) return;
    const r = new IORedis(REDIS_URL!);
    const keys = await r.keys(`${prefix}:*`);
    if (keys.length) await r.del(...keys);
    await r.quit();
  });

  it('round-trips a successful call through ArithClient', async () => {
    prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    const handlers: ArithService = {
      add: async ({ a, b }) => ({ sum: a + b }),
      ping: async (_params) => {},
    };
    server.registerService(arithContract, handlers);
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    const arith = new ArithClient(client);
    const r = await arith.add({ a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop();
    await sredis.quit();
    await credis.quit();
  });
});
```

(Verbatim from `ts/packages/over-redis/tests/proxy-round-trip.test.ts:1-41`.)

By default the connection is built from `$REDIS_URL` (or `redis://localhost:6379`). Pass `redisUrl` for a different URL, or `redis` for a pre-built `ioredis` instance.

## Key surface

- `RedisRpcServer({ keyPrefix, redis?, redisUrl?, ... })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `RedisRpcClient({ keyPrefix, redis?, redisUrl?, defaultTimeoutMs? })` — `start()`, `stop()`. The instance is also a `ClamatorClient`, so it can be wrapped by a generated `*Client` proxy.

## When to reach for this vs. `@clamator/over-memory`

- [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory) — tests, embedded scenarios, anything single-process.
- `@clamator/over-redis` — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
