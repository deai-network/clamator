# @clamator/protocol

Pure JSON-RPC 2.0 protocol primitives plus Zod-derived envelope types for clamator. **No I/O, ever** — anything that touches a network, filesystem, or process belongs in a transport adapter.

## Install

```bash
npm install @clamator/protocol zod
```

**`zod` is a peer dependency — declare it in your own `package.json`** (any range compatible with `^3.23.0`). This ensures pnpm/npm picks a single physical `zod` copy across your workspace, so TypeScript sees one `ZodType` identity. Without your own `zod` declaration, package-manager dedupe heuristics may give different parts of your codebase distinct `zod` instances; mixed-source schemas then fail to compile with "type X is not assignable to type Y" errors despite being the same shape on both sides. The same applies for every consumer of `@clamator/over-memory`, `@clamator/over-redis`, and `@clamator/codegen`.

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

## Version compatibility

All seven clamator packages (TS + Py protocol, both transports on both languages, codegen) are released in lockstep — same `X.Y.Z` version, every time. The release-verification workflow refuses to publish a tag unless every package's manifest reports the matching version, and the same workflow runs the cross-language interop test suite. **Pin all your clamator packages to the same `X.Y.Z`** on both client and server sides — `@clamator/protocol@X.Y.Z` + `@clamator/over-redis@X.Y.Z` on the TS side, `clamator-protocol==X.Y.Z` + `clamator-over-redis==X.Y.Z` on the Py side.

The drift you do need to worry about is **your contract source diverging from your committed generated wrappers**. The "Drift detection via the manifest" pattern in [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) is the right tool: regenerate the manifest in CI and diff against the committed copy. At runtime, a contract mismatch surfaces as `RpcError({ code: -32602, message: "Invalid params" })` from server-side validation — useful but generic; the manifest-diff pre-deploy check gives a more actionable error.

## Method or notification?

Both methods and notifications send a request envelope; only methods produce a response envelope. Pick by the caller's needs, not the handler's.

- **Use a method** when the caller needs to know whether the operation succeeded, get a value back, surface a structured `RpcError`, or sequence subsequent calls on completion. Methods carry a request id and the caller waits for the matching response or a timeout.
- **Use a notification** when the caller is doing fire-and-forget work where neither success/failure nor a return value matters in the moment — telemetry, cache-busting, status pings. Notifications have no request id and produce no response; the caller cannot tell whether the handler ran, succeeded, or threw.

If you would otherwise add a method that returns nothing solely to confirm delivery, prefer a method returning `z.object({})` over a notification — the response envelope is the confirmation. Pick a notification only when "did this run?" is genuinely not a question the caller will ever ask.

## Hand-built contracts

`defineContract` / `defineMethod` / `defineNotification` are first-class — you do not need to run codegen to use them. Codegen exists to keep TS and Py contracts in lockstep when both languages consume the same wire-side service. If your contract is dynamic (e.g., constructed at runtime from a registry of handler functions), or if you have only one language side, build the contract directly with `defineContract(...)` and pass it to `registerService(contract, handlers)` — the dispatcher only uses the contract's `methods[name].params` / `result` Zod schemas and looks up handlers in the `handlers` object literal you pass.

Codegen-emitted clients and hand-built service registrations interoperate freely; the choice is purely about authoring ergonomics on the side that consumes a typed proxy.

## Validation pipeline

Server-side handlers receive **parsed values from the contract's Zod schemas**, not raw dicts. The dispatcher does the work in this order on every incoming envelope:

1. **Params validation.** The wire dict goes through `methodDef.params.parse(env.params)`. Failures produce `RpcError({ code: -32602, message: "Invalid params", data: { ... } })` and the request is rejected before the handler runs. Notifications with bad params are silently dropped.
2. **Handler dispatch.** The dispatcher calls `entry.handlers[methodName](parsed)` — passing the Zod-validated value. Handlers declare their parameter type as `z.infer<typeof contract.methods.<m>.params>` (or use the typed `<Service>Service` interface from codegen).
3. **Handler exceptions.** A handler that throws `new RpcError({ code, message, data })` produces a response with that exact code/message/data. Any other thrown error is wrapped as `RpcError({ code: -32603, message: "Internal error", data: { ... } })`.
4. **Result validation.** If the method has a `result` schema, the return value is run through `methodDef.result.parse(result)`. A handler returning the wrong shape is reported to the client as `RpcError({ code: -32603, message: "Result validation failed", data: { ... } })` — there is no automatic coercion. Notifications skip result validation.

Handlers are insulated from wire-format details: if the dispatch reaches your code, the params are valid; if your return value fails validation, the client sees a structured error rather than a corrupted reply.

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

Reserved JSON-RPC error codes (`-32600` to `-32603` for protocol-level errors, `-32000` to `-32099` reserved for transport implementations) are owned by the protocol layer; pick application-specific codes outside that range. A workable convention is to pick a contiguous private band per error category (e.g., `-32100..-32199` for state-machine refusals, `-32200..-32299` for resource-not-found shapes) and document the band in your contract's documentation. Codegen does not reserve any band — application codes are entirely your namespace.

What the client sees:

- A handler that throws `new RpcError({ code, message, data })` produces an error response carrying that exact code/message/data on the client side; the proxy method re-throws an `RpcError` with the same fields.
- A handler that throws any other error is caught by the protocol layer and wrapped: clients receive `RpcError({ code: -32603, message: "Internal error", data: {...} })` with exception details in `data`.
- A client-side call that exceeds `defaultTimeoutMs` rejects with `ClamatorTransportError('call timeout')` from the transport layer. The same class surfaces when no server is consuming the request stream — there is no distinct "no consumer" error.
- Envelope-level parse and validation failures use the JSON-RPC reserved codes: `-32700` (parse error), `-32600` (invalid request), `-32601` (method not found), `-32602` (invalid params), `-32603` (internal error).

## Authorization

clamator has no authorization at the protocol or transport layer. Any process that can reach the underlying transport — a Redis instance for `over-redis`, the parent process for `over-memory` — can call any registered method or send any notification on any registered service.

Apply caller-identity checks at the boundary: a gateway (typically an HTTP server in front of the typed proxy) enforces who-can-call-what before invoking the proxy method. For network-substrate transports, deploy the substrate behind a network you trust (TLS, AUTH, ACLs, private VPC).

## Browser consumers

`@clamator/protocol` uses Node-only APIs (`node:crypto`) and cannot be loaded in a browser bundle. Importing the contract source file (which calls `defineContract(...)` from this package) into a browser-targeted bundle will fail. To share Zod *types* between server-side contracts and browser code, keep the browser-shareable schemas in a separate module that does not import `@clamator/protocol`. See [`@clamator/codegen`'s "Browser consumers" section](https://www.npmjs.com/package/@clamator/codegen) for the recommended layout.

## Links

- Sibling (Python): [`clamator-protocol`](https://pypi.org/project/clamator-protocol/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
