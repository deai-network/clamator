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

## Links

- Sibling (Python): [`clamator-protocol`](https://pypi.org/project/clamator-protocol/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
