# @clamator/over-memory

In-process loopback transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). The shared `MemoryBus` connects a `MemoryRpcServer` and `MemoryRpcClient` running in the same Node.js process.

## Install

```bash
npm install @clamator/over-memory @clamator/protocol zod
```

`zod` is a peer dependency that you must declare in your own `package.json` for type-dedupe — see the [`@clamator/protocol`](https://www.npmjs.com/package/@clamator/protocol) README's install section for the rationale.

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

Server-side — register handlers and start:

```typescript
import { MemoryBus, MemoryRpcServer } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import type { ArithService } from './generated/arith.js';

export async function buildArithServer(bus: MemoryBus) {
  const server = new MemoryRpcServer({ bus }); // no external connection; stop() unregisters from the bus without closing any resource
  const handlers: ArithService = {
    add: async ({ a, b }) => ({ sum: a + b }),
  };
  server.registerService(arithContract, handlers); // must precede start() — post-start registrations are silently ignored, never registered on the bus
  await server.start();
  return server;
}
```

(Verbatim from `ts/packages/over-memory/tests/server.ts:1-13`. In your own code, replace `../src/index.js` with `@clamator/over-memory`.)

Client-side — call the typed proxy:

```typescript
import { MemoryBus, MemoryRpcClient } from '../src/index.js';
import { ArithClient } from './generated/arith.js';

export async function callArith(bus: MemoryBus) {
  const client = new MemoryRpcClient({ bus }); // default timeout 30 s on the full round-trip (call → handler → reply); pass defaultTimeoutMs to override; no retry; timeouts not propagated to server
  await client.start();
  const arith = new ArithClient(client);
  const r = await arith.add({ a: 2, b: 3 });
  await client.stop();
  return r;
}
```

(Verbatim from `ts/packages/over-memory/tests/client.ts:1-11`. In your own code, replace `../src/index.js` with `@clamator/over-memory`.)

`server.start()` returns once handlers are registered on the bus; it does not block. Your application controls the server's lifetime. Call `await server.stop()` to shut down — since the loopback is in-process, the drain is instantaneous and the server unregisters from the bus without closing any external resource. `start()` and `stop()` are both idempotent (calling either twice is a no-op); once `stop()` has been called, calling `start()` again raises — create a new instance to restart.

A single server can host multiple services. Call `registerService(contract, handlers)` once per contract before `start()`; each is registered as its own dispatcher on the shared bus. Registrations after `start()` are silently ignored.

`MemoryBus()` takes no arguments and is the only wiring needed.

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

## Protocol-level parity with over-redis

Params/result validation, error code mapping, handler exception wrapping, and `register_service` semantics are identical to `@clamator/over-redis` — both transports share the same dispatcher (`RpcServerCore` from `@clamator/protocol`). Only the wire substrate differs. Tests written against this transport for protocol-level behaviors translate directly to over-redis.

## When to reach for this vs. `@clamator/over-redis`

- `@clamator/over-memory` — tests, embedded scenarios, anything single-process.
- [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis) — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
