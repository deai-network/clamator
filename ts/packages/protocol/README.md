# @clamator/protocol

Pure JSON-RPC 2.0 protocol primitives plus Zod-derived envelope types for clamator. **No I/O, ever** — anything that touches a network, filesystem, or process belongs in a transport adapter.

## Install

```bash
npm install @clamator/protocol
```

## When you reach for this

- Authoring a Zod contract that will be fed to [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen).
- Building a custom transport adapter that needs the wire-envelope schema, the `Transport` and `Dispatcher` interfaces, or the reserved JSON-RPC error codes.

If you only consume generated clients and servers, you don't import this package directly — your transport package (`@clamator/over-memory`, `@clamator/over-redis`) re-exports the few symbols you need.

## Defining a contract

Contracts are the source of truth that both sides — and the codegen — consume:

```typescript
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
```

(Verbatim from `ts/packages/over-memory/tests/loopback.test.ts:6-16`.)

## Key exports

- `defineContract`, `defineMethod`, `defineNotification` — declare a service's methods and notifications with Zod schemas for params and results.
- `RpcError` — the error type you throw from a handler to surface a structured JSON-RPC error to the caller.
- `ClamatorProtocolError`, `ClamatorTransportError` — distinguishable error classes for protocol-level vs. transport-level failures.
- `Transport`, `Dispatcher` — interfaces a custom transport adapter implements.

## Method or notification?

Both methods and notifications send a request envelope; only methods produce a response envelope. Pick by the caller's needs, not the handler's.

- **Use a method** when the caller needs to know whether the operation succeeded, get a value back, surface a structured `RpcError`, or sequence subsequent calls on completion. Methods carry a request id and the caller waits for the matching response or a timeout.
- **Use a notification** when the caller is doing fire-and-forget work where neither success/failure nor a return value matters in the moment — telemetry, cache-busting, status pings. Notifications have no request id and produce no response; the caller cannot tell whether the handler ran, succeeded, or threw.

If you would otherwise add a method that returns nothing solely to confirm delivery, prefer a method returning `z.object({})` over a notification — the response envelope is the confirmation. Pick a notification only when "did this run?" is genuinely not a question the caller will ever ask.

## Errors

Throw `RpcError` from a handler to surface a structured JSON-RPC error to the caller. The constructor takes a `code`, a `message`, and an optional `data` payload:

```typescript
import { describe, it, expect } from 'vitest';
import { RpcError } from '../src/index.js';

describe('RpcError', () => {
  it('constructs with code, message, and data', () => {
    const err = new RpcError(-32001, 'forbidden', { reason: 'no-token' });
    expect(err.code).toBe(-32001);
    expect(err.message).toBe('forbidden');
    expect(err.data).toEqual({ reason: 'no-token' });
  });
});
```

(Verbatim from `ts/packages/protocol/tests/rpc-error.test.ts:1-11`.)

Reserved JSON-RPC error codes (`-32600` to `-32603` for protocol-level errors, `-32000` to `-32099` reserved for transport implementations) are owned by the protocol layer; pick application-specific codes outside that range.

What the client sees:

- A handler that throws `new RpcError({ code, message, data })` produces an error response carrying that exact code/message/data on the client side; the proxy method re-throws an `RpcError` with the same fields.
- A handler that throws any other error is caught by the protocol layer and wrapped: clients receive `RpcError({ code: -32603, message: "Internal error", data: {...} })` with exception details in `data`.
- A client-side call that exceeds `defaultTimeoutMs` rejects with `ClamatorTransportError('call timeout')` from the transport layer. The same class surfaces when no server is consuming the request stream — there is no distinct "no consumer" error.
- Envelope-level parse and validation failures use the JSON-RPC reserved codes: `-32700` (parse error), `-32600` (invalid request), `-32601` (method not found), `-32602` (invalid params), `-32603` (internal error).

## Links

- Sibling (Python): [`clamator-protocol`](https://pypi.org/project/clamator-protocol/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
