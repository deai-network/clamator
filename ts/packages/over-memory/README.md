# @clamator/over-memory

In-process loopback transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). The shared `MemoryBus` connects a `MemoryRpcServer` and `MemoryRpcClient` running in the same Node.js process.

## Install

```bash
npm install @clamator/over-memory @clamator/protocol
```

## Quickstart

Define the contract:

```typescript
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});
```

(Verbatim from `ts/packages/over-memory/tests/contracts/arith.ts:1-9`.)

Generate the typed proxies:

```bash
npx @clamator/codegen --src contracts --out-ts generated --ts-contract-import '../contracts/arith.js'
```

Wire server and client through a shared bus, talk via `ArithClient`:

```typescript
import { describe, it, expect } from 'vitest';
import { MemoryBus, MemoryRpcServer, MemoryRpcClient } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import { ArithClient, type ArithService } from './generated/arith.js';

describe('memory loopback via codegen typed proxy', () => {
  it('round-trips a successful call through ArithClient', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    const handlers: ArithService = {
      add: async ({ a, b }) => ({ sum: a + b }),
    };
    server.registerService(arithContract, handlers);
    await server.start();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    const arith = new ArithClient(client);
    const r = await arith.add({ a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop();
  });
});
```

(Verbatim from `ts/packages/over-memory/tests/proxy-loopback.test.ts:1-23`.)

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
