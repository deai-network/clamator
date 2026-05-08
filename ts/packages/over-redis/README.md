# @clamator/over-redis

Redis-streams transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). Implements the `Transport` interface from `@clamator/protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a TS service and a Py service, or two TS services on different hosts.

## Install

```bash
npm install @clamator/over-redis @clamator/protocol ioredis
```

## Quickstart

Define the contract in TypeScript:

```typescript
// contracts/arith.ts
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

Run [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) to emit a typed client and a service interface from that contract:

```bash
npx @clamator/codegen --src contracts --out-ts generated --ts-contract-import '../contracts/arith.js'
```

Server — implement the generated `ArithService` interface:

```typescript
// server.ts
import { RedisRpcServer } from '@clamator/over-redis';
import { arithContract } from './contracts/arith.js';
import type { ArithService } from './generated/arith.js';

const handlers: ArithService = {
  add: async ({ a, b }) => ({ sum: a + b }),
  ping: async () => {},
};

const server = new RedisRpcServer({ keyPrefix: 'my-app' });
server.registerService(arithContract, handlers);
await server.start();
process.on('SIGTERM', () => { void server.stop(); });
```

Client — call methods on the generated `ArithClient`:

```typescript
// client.ts
import { RedisRpcClient } from '@clamator/over-redis';
import { ArithClient } from './generated/arith.js';

const transport = new RedisRpcClient({ keyPrefix: 'my-app' });
await transport.start();

const arith = new ArithClient(transport);
const result = await arith.add({ a: 2, b: 3 });
console.log(result); // { sum: 5 }

await transport.stop();
```

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
