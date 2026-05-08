# @clamator/over-memory

In-process loopback transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). The shared `MemoryBus` connects a `MemoryRpcServer` and `MemoryRpcClient` running in the same Node.js process.

## Install

```bash
npm install @clamator/over-memory @clamator/protocol
```

## Quickstart

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification, RpcError } from '@clamator/protocol';
import { MemoryBus, MemoryRpcServer, MemoryRpcClient } from '../src/index.js';

const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  divide: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ q: z.number() }),
  }),
  ping: defineNotification({ params: z.object({ tag: z.string().optional() }) }),
});

describe('memory loopback', () => {
  it('round-trips a successful call', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    server.registerService(arith, {
      add: async ({ a, b }) => ({ sum: a + b }),
      divide: async ({ a, b }) => ({ q: a / b }),
      ping: async () => {},
    });
    await server.start();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    const r = await client.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop();
  });
```

(Verbatim from `ts/packages/over-memory/tests/loopback.test.ts:1-34`. In your own code, replace the relative `'../src/index.js'` import with `'@clamator/over-memory'`.)

## Configuration

`MemoryBus` takes no arguments. The same instance is passed to the server and the client; that's the entire wiring.

`MemoryRpcServer` and `MemoryRpcClient` accept:

- `bus` — the shared `MemoryBus`.

There are no timeouts, retries, or stream parameters — the loopback is synchronous within a single event loop turn.

## Key surface

- `MemoryBus` — constructor: `new MemoryBus()`. The connecting object passed to both server and client.
- `MemoryRpcServer({ bus })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `MemoryRpcClient({ bus })` — `start()`, `stop()`, `call<P, R>(service, method, params)`, `notify(service, method, params)`.

## When to reach for this vs. `@clamator/over-redis`

- `@clamator/over-memory` — tests, embedded scenarios, anything single-process.
- [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis) — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
