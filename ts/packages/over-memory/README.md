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
    const bus = new MemoryBus(); // in-process only; no external state — bus is garbage-collected with the process
    const server = new MemoryRpcServer({ bus }); // no external connection; stop() unregisters from the bus without closing any resource
    const handlers: ArithService = {
      add: async ({ a, b }) => ({ sum: a + b }),
    };
    server.registerService(arithContract, handlers); // must precede start() — post-start registrations are silently ignored, never registered on the bus
    await server.start(); // idempotent if already started
    const client = new MemoryRpcClient({ bus }); // default timeout 30 s (pass defaultTimeoutMs to override); no retry; timeouts not propagated to server
    await client.start();
    const arith = new ArithClient(client);
    const r = await arith.add({ a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop(); // drains in-flight handlers up to graceMs (default 5 s), then stops transport
  });
});
```

(Verbatim from `ts/packages/over-memory/tests/proxy-loopback.test.ts:1-23`.)

`MemoryBus()` takes no arguments and is the only wiring needed. The loopback is synchronous within a single event loop turn — no timeouts, retries, or stream parameters.

## Key surface

- `MemoryBus` — constructor: `new MemoryBus()`. The connecting object passed to both server and client.
- `MemoryRpcServer({ bus })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `MemoryRpcClient({ bus })` — `start()`, `stop()`. Wrap with a generated `*Client` proxy for typed calls.

## Worker-pool semantics

N/A — this transport is a single-process loopback. Multiple `MemoryRpcServer` instances on the same `MemoryBus` do not form a competing-consumers pool because there is no shared substrate; each bus is in-memory to its constructing process. For cross-process worker-pool behavior, use `@clamator/over-redis`.

## Owned external state

N/A — `MemoryBus` owns no external state. There are no Redis keys, no streams, no files, no sockets. The bus is garbage-collected with the process.

## Connection ownership

N/A — there is no external connection to own. `MemoryRpcServer` and `MemoryRpcClient` share a `MemoryBus` that lives entirely in-process; `stop()` releases its references without closing any external resource.

## When to reach for this vs. `@clamator/over-redis`

- `@clamator/over-memory` — tests, embedded scenarios, anything single-process.
- [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis) — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
