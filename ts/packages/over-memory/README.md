# @clamator/over-memory

In-process loopback transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). The shared `MemoryBus` connects a `MemoryRpcServer` and `MemoryRpcClient` running in the same Node.js process.

## Install

```bash
npm install @clamator/over-memory @clamator/protocol
```

## Quickstart

Define the contract:

```typescript
// contracts/arith.ts
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});
```

Generate the typed proxies:

```bash
npx @clamator/codegen --src contracts --out-ts generated --ts-contract-import '../contracts/arith.js'
```

Wire server and client through a shared bus, talk via `ArithClient`:

```typescript
// loopback.ts
import { MemoryBus, MemoryRpcServer, MemoryRpcClient } from '@clamator/over-memory';
import { arithContract } from './contracts/arith.js';
import { ArithClient, type ArithService } from './generated/arith.js';

const handlers: ArithService = {
  add: async ({ a, b }) => ({ sum: a + b }),
};

const bus = new MemoryBus();
const server = new MemoryRpcServer({ bus });
server.registerService(arithContract, handlers);
await server.start();

const transport = new MemoryRpcClient({ bus });
await transport.start();

const arith = new ArithClient(transport);
console.log(await arith.add({ a: 2, b: 3 })); // { sum: 5 }

await transport.stop();
await server.stop();
```

`MemoryBus()` takes no arguments and is the only wiring needed. The loopback is synchronous within a single event loop turn — no timeouts, retries, or stream parameters.

## Key surface

- `MemoryBus` — constructor: `new MemoryBus()`. The connecting object passed to both server and client.
- `MemoryRpcServer({ bus })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `MemoryRpcClient({ bus })` — `start()`, `stop()`. Wrap with a generated `*Client` proxy for typed calls.

## When to reach for this vs. `@clamator/over-redis`

- `@clamator/over-memory` — tests, embedded scenarios, anything single-process.
- [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis) — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
