# @clamator/over-redis

Redis-streams transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). Implements the `Transport` interface from `@clamator/protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a TS service and a Py service, or two TS services on different hosts.

## Install

```bash
npm install @clamator/over-redis @clamator/protocol ioredis
```

## Quickstart

Define the contract once and import it from both the server and the client:

```typescript
// arith-contract.ts
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification } from '@clamator/protocol';

export const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  ping: defineNotification({ params: z.object({}) }),
});
```

Server:

```typescript
// server.ts
import { RedisRpcServer } from '@clamator/over-redis';
import { arith } from './arith-contract.js';

const server = new RedisRpcServer({ keyPrefix: 'my-app' });

server.registerService(arith, {
  add: async ({ a, b }) => ({ sum: a + b }),
  ping: async () => {},
});

await server.start();
process.on('SIGTERM', () => { void server.stop(); });
```

Client:

```typescript
// client.ts
import { RedisRpcClient } from '@clamator/over-redis';

const client = new RedisRpcClient({ keyPrefix: 'my-app' });
await client.start();

const result = await client.call<{ a: number; b: number }, { sum: number }>(
  'arith', 'add', { a: 2, b: 3 },
);
console.log(result); // { sum: 5 }

await client.stop();
```

By default the connection is built from `$REDIS_URL` (or `redis://localhost:6379`). Pass `redisUrl` for a different URL, or `redis` for a pre-built `ioredis` instance.

## Key surface

- `RedisRpcServer({ keyPrefix, redis?, redisUrl?, ... })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `RedisRpcClient({ keyPrefix, redis?, redisUrl?, defaultTimeoutMs? })` — `start()`, `stop()`, `call<P, R>(service, method, params, opts?)`, `notify(service, method, params)`.

## When to reach for this vs. `@clamator/over-memory`

- [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory) — tests, embedded scenarios, anything single-process.
- `@clamator/over-redis` — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
