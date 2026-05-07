# Protocol Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@clamator/protocol` (TS) and `clamator-protocol` (Py). Wire-envelope types + validation, error classes, contract DSL (TS only), Transport interface, `RpcServerCore`, `RpcClientCore`. Zero I/O.

**Architecture:** Two parallel packages with sibling APIs. TS is the contract source of truth (defines `defineContract`, `defineMethod`, `defineNotification`); Py exposes the runtime shape (`Contract`, `MethodEntry`) that codegen targets. The Core classes wrap a `Transport`; consumers typically interact with the per-transport facades (plans 03 + 05) or generated wrappers (plan 04). Validation runs at every edge (TS-out, TS-in, Py-out, Py-in). Async-only.

**Tech Stack:** TypeScript 5 (ESM-only), Zod 3, vitest. Python 3.11+, Pydantic v2, pytest, pytest-asyncio.

---

## File Structure

### TS package (`ts/packages/protocol/`)

- Create: `ts/packages/protocol/package.json`
- Create: `ts/packages/protocol/tsconfig.json`
- Create: `ts/packages/protocol/AGENTS.md`
- Create: `ts/packages/protocol/src/index.ts` — re-exports.
- Create: `ts/packages/protocol/src/envelope.ts` — Request, Response, Notification types + `parseEnvelope`.
- Create: `ts/packages/protocol/src/error.ts` — `RpcError`, `ClamatorProtocolError`, `ClamatorTransportError`, `exceptionToErrorData`.
- Create: `ts/packages/protocol/src/contract.ts` — `defineContract`, `defineMethod`, `defineNotification`, type helpers.
- Create: `ts/packages/protocol/src/transport.ts` — `Transport` interface.
- Create: `ts/packages/protocol/src/server-core.ts` — `RpcServerCore`.
- Create: `ts/packages/protocol/src/client-core.ts` — `RpcClientCore`, `ClamatorClient`.
- Create: `ts/packages/protocol/tests/envelope.test.ts`
- Create: `ts/packages/protocol/tests/error.test.ts`
- Create: `ts/packages/protocol/tests/contract.test.ts`
- Create: `ts/packages/protocol/tests/server-core.test.ts`
- Create: `ts/packages/protocol/tests/client-core.test.ts`

### Py package (`py/packages/protocol/`)

- Create: `py/packages/protocol/pyproject.toml`
- Create: `py/packages/protocol/AGENTS.md`
- Create: `py/packages/protocol/src/clamator_protocol/__init__.py` — re-exports.
- Create: `py/packages/protocol/src/clamator_protocol/envelope.py`
- Create: `py/packages/protocol/src/clamator_protocol/error.py`
- Create: `py/packages/protocol/src/clamator_protocol/contract.py`
- Create: `py/packages/protocol/src/clamator_protocol/transport.py`
- Create: `py/packages/protocol/src/clamator_protocol/server_core.py`
- Create: `py/packages/protocol/src/clamator_protocol/client_core.py`
- Create: `py/packages/protocol/tests/test_envelope.py`
- Create: `py/packages/protocol/tests/test_error.py`
- Create: `py/packages/protocol/tests/test_server_core.py`
- Create: `py/packages/protocol/tests/test_client_core.py`

---

## Task 1: TS package scaffold

**Files:**
- Create: `ts/packages/protocol/package.json`
- Create: `ts/packages/protocol/tsconfig.json`
- Create: `ts/packages/protocol/src/index.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@clamator/protocol",
  "version": "0.1.0",
  "description": "Polyglot RPC protocol layer (pre-1.0; API may break in minor versions).",
  "license": "Apache-2.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "LICENSE"],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "clean": "rm -rf dist .tsbuildinfo",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": ".tsbuildinfo"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write empty `src/index.ts`**

```typescript
export {};
```

- [ ] **Step 4: Symlink LICENSE for npm packaging**

```bash
ln -s ../../../LICENSE ts/packages/protocol/LICENSE
```

(Verify with `ls -la ts/packages/protocol/LICENSE` → expect `-> ../../../LICENSE`.)

- [ ] **Step 5: Install + build to verify scaffold**

```bash
cd ts && pnpm install
pnpm --filter @clamator/protocol build
```

Expected: `dist/index.js` and `dist/index.d.ts` produced. Exit 0.

- [ ] **Step 6: Commit**

```bash
git add ts/packages/protocol/package.json ts/packages/protocol/tsconfig.json ts/packages/protocol/src/index.ts ts/packages/protocol/LICENSE ts/pnpm-lock.yaml
git commit -m "feat(ts/protocol): scaffold @clamator/protocol package"
```

---

## Task 2: TS envelope types + parsing

**Files:**
- Create: `ts/packages/protocol/src/envelope.ts`
- Create: `ts/packages/protocol/tests/envelope.test.ts`

- [ ] **Step 1: Write failing test `tests/envelope.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { parseEnvelope, EnvelopeKind, SERVICE_RE, METHOD_RE } from '../src/envelope.js';

describe('parseEnvelope', () => {
  it('classifies a valid request', () => {
    const env = parseEnvelope({
      jsonrpc: '2.0', method: 'engine.launch', params: { x: 1 }, id: 'abc',
    });
    expect(env.kind).toBe(EnvelopeKind.Request);
    if (env.kind === EnvelopeKind.Request) {
      expect(env.service).toBe('engine');
      expect(env.method).toBe('launch');
      expect(env.id).toBe('abc');
    }
  });

  it('classifies a valid notification (no id)', () => {
    const env = parseEnvelope({
      jsonrpc: '2.0', method: 'engine.resync', params: {},
    });
    expect(env.kind).toBe(EnvelopeKind.Notification);
  });

  it('classifies a success response', () => {
    const env = parseEnvelope({ jsonrpc: '2.0', id: 'abc', result: { ok: true } });
    expect(env.kind).toBe(EnvelopeKind.SuccessResponse);
  });

  it('classifies an error response', () => {
    const env = parseEnvelope({ jsonrpc: '2.0', id: 'abc', error: { code: -32603, message: 'x', data: null } });
    expect(env.kind).toBe(EnvelopeKind.ErrorResponse);
  });

  it('rejects batch (array)', () => {
    expect(() => parseEnvelope([{} as unknown])).toThrow(/-32600/);
  });

  it('rejects wrong jsonrpc version', () => {
    expect(() => parseEnvelope({ jsonrpc: '1.0', method: 'a.b', params: {} })).toThrow(/-32600/);
  });

  it('rejects bad method format (no dot)', () => {
    expect(() => parseEnvelope({ jsonrpc: '2.0', method: 'launch', params: {} })).toThrow(/-32600/);
  });

  it('rejects bad service segment', () => {
    expect(() => parseEnvelope({ jsonrpc: '2.0', method: 'Engine.launch', params: {} })).toThrow(/-32600/);
  });

  it('rejects bad method segment', () => {
    expect(() => parseEnvelope({ jsonrpc: '2.0', method: 'engine.Launch', params: {} })).toThrow(/-32600/);
  });

  it('SERVICE_RE matches expected', () => {
    expect(SERVICE_RE.test('engine')).toBe(true);
    expect(SERVICE_RE.test('order-service')).toBe(true);
    expect(SERVICE_RE.test('Engine')).toBe(false);
    expect(SERVICE_RE.test('1engine')).toBe(false);
  });

  it('METHOD_RE matches expected', () => {
    expect(METHOD_RE.test('launch')).toBe(true);
    expect(METHOD_RE.test('launchProcess')).toBe(true);
    expect(METHOD_RE.test('launch-process')).toBe(true);
    expect(METHOD_RE.test('Launch')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test (fails — module missing)**

```bash
pnpm --filter @clamator/protocol test
```

Expected: vitest reports `Cannot find module '../src/envelope.js'`.

- [ ] **Step 3: Write `src/envelope.ts`**

```typescript
export const SERVICE_RE = /^[a-z][a-z0-9-]*$/;
export const METHOD_RE = /^[a-z][a-zA-Z0-9-]*$/;

// Plain string enum (NOT `const enum` — incompatible with `isolatedModules: true`).
export enum EnvelopeKind {
  Request = 'request',
  Notification = 'notification',
  SuccessResponse = 'success',
  ErrorResponse = 'error',
}

export type RpcId = string | number;

export interface RequestEnvelope {
  kind: EnvelopeKind.Request;
  service: string;
  method: string;
  fullMethod: string;
  params: unknown;
  id: RpcId;
  raw: Record<string, unknown>;
}

export interface NotificationEnvelope {
  kind: EnvelopeKind.Notification;
  service: string;
  method: string;
  fullMethod: string;
  params: unknown;
  raw: Record<string, unknown>;
}

export interface SuccessResponseEnvelope {
  kind: EnvelopeKind.SuccessResponse;
  id: RpcId;
  result: unknown;
}

export interface ErrorResponseEnvelope {
  kind: EnvelopeKind.ErrorResponse;
  id: RpcId | null;
  error: { code: number; message: string; data: unknown };
}

export type Envelope =
  | RequestEnvelope
  | NotificationEnvelope
  | SuccessResponseEnvelope
  | ErrorResponseEnvelope;

class InvalidRequest extends Error {
  readonly code = -32600;
  constructor(msg: string) {
    super(`-32600 Invalid Request: ${msg}`);
  }
}

export function parseEnvelope(value: unknown): Envelope {
  if (Array.isArray(value)) throw new InvalidRequest('batch requests not supported');
  if (typeof value !== 'object' || value === null) throw new InvalidRequest('not an object');
  const obj = value as Record<string, unknown>;
  if (obj.jsonrpc !== '2.0') throw new InvalidRequest('jsonrpc must equal "2.0"');

  const hasMethod = typeof obj.method === 'string';
  const hasResult = 'result' in obj;
  const hasError = 'error' in obj;
  const hasId = 'id' in obj && obj.id !== null && obj.id !== undefined;

  if (hasMethod) {
    const fullMethod = obj.method as string;
    const dot = fullMethod.indexOf('.');
    if (dot <= 0 || dot === fullMethod.length - 1)
      throw new InvalidRequest('method must be "<service>.<method>"');
    const service = fullMethod.slice(0, dot);
    const method = fullMethod.slice(dot + 1);
    if (!SERVICE_RE.test(service)) throw new InvalidRequest('invalid service segment');
    if (!METHOD_RE.test(method)) throw new InvalidRequest('invalid method segment');
    if (hasId) {
      const id = obj.id as RpcId;
      if (typeof id !== 'string' && typeof id !== 'number')
        throw new InvalidRequest('id must be string or number');
      return {
        kind: EnvelopeKind.Request,
        service, method, fullMethod,
        params: obj.params ?? {},
        id, raw: obj,
      };
    }
    return {
      kind: EnvelopeKind.Notification,
      service, method, fullMethod,
      params: obj.params ?? {},
      raw: obj,
    };
  }

  if (hasResult && !hasError) {
    if (!hasId) throw new InvalidRequest('response must have id');
    return {
      kind: EnvelopeKind.SuccessResponse,
      id: obj.id as RpcId,
      result: obj.result,
    };
  }

  if (hasError && !hasResult) {
    const err = obj.error as Record<string, unknown> | undefined;
    if (!err || typeof err.code !== 'number' || typeof err.message !== 'string')
      throw new InvalidRequest('error must have numeric code + string message');
    return {
      kind: EnvelopeKind.ErrorResponse,
      id: (hasId ? (obj.id as RpcId) : null),
      error: { code: err.code, message: err.message, data: err.data ?? null },
    };
  }

  throw new InvalidRequest('envelope must be request, notification, or response');
}

export function buildSuccessResponse(id: RpcId, result: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', id, result };
}

export function buildErrorResponse(
  id: RpcId | null,
  code: number, message: string, data: unknown = null,
): Record<string, unknown> {
  return { jsonrpc: '2.0', id, error: { code, message, data } };
}

export function buildRequest(fullMethod: string, params: unknown, id: RpcId): Record<string, unknown> {
  return { jsonrpc: '2.0', method: fullMethod, params, id };
}

export function buildNotification(fullMethod: string, params: unknown): Record<string, unknown> {
  return { jsonrpc: '2.0', method: fullMethod, params };
}
```

- [ ] **Step 4: Run test (passes)**

```bash
pnpm --filter @clamator/protocol test
```

Expected: all envelope tests pass.

- [ ] **Step 5: Commit**

```bash
git add ts/packages/protocol/src/envelope.ts ts/packages/protocol/tests/envelope.test.ts
git commit -m "feat(ts/protocol): envelope types + parseEnvelope"
```

---

## Task 3: TS error classes

**Files:**
- Create: `ts/packages/protocol/src/error.ts`
- Create: `ts/packages/protocol/tests/error.test.ts`

- [ ] **Step 1: Write failing test `tests/error.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { RpcError, ClamatorProtocolError, ClamatorTransportError, exceptionToErrorData } from '../src/error.js';

describe('errors', () => {
  it('RpcError carries code/message/data', () => {
    const e = new RpcError(-32000, 'oops', { x: 1 });
    expect(e.code).toBe(-32000);
    expect(e.message).toBe('oops');
    expect(e.data).toEqual({ x: 1 });
    expect(e.name).toBe('RpcError');
  });

  it('ClamatorProtocolError extends Error', () => {
    const e = new ClamatorProtocolError('proto');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ClamatorProtocolError');
  });

  it('ClamatorTransportError carries cause', () => {
    const cause = new Error('boom');
    const e = new ClamatorTransportError('lost', cause);
    expect(e.cause).toBe(cause);
    expect(e.name).toBe('ClamatorTransportError');
  });

  it('exceptionToErrorData captures name + message + serializable attrs', () => {
    class MyErr extends Error {
      foo = 'bar';
      n = 7;
      circ: unknown;
      constructor() { super('hi'); this.name = 'MyErr'; this.circ = this; }
    }
    const data = exceptionToErrorData(new MyErr());
    expect(data).toMatchObject({ name: 'MyErr', message: 'hi', foo: 'bar', n: 7 });
    expect('circ' in data).toBe(false);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
pnpm --filter @clamator/protocol test -- error.test
```

- [ ] **Step 3: Write `src/error.ts`**

```typescript
export class RpcError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(code: number, message: string, data: unknown = null) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

export class ClamatorProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClamatorProtocolError';
  }
}

export class ClamatorTransportError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown = null) {
    super(message);
    this.name = 'ClamatorTransportError';
    this.cause = cause;
  }
}

const SERIALIZABLE_TYPES = new Set(['string', 'number', 'boolean']);

export function exceptionToErrorData(err: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (err instanceof Error) {
    out.name = err.name;
    out.message = err.message;
    for (const key of Object.getOwnPropertyNames(err)) {
      if (key === 'stack' || key === 'message' || key === 'name') continue;
      const v = (err as unknown as Record<string, unknown>)[key];
      if (v === null || SERIALIZABLE_TYPES.has(typeof v)) out[key] = v;
      else if (Array.isArray(v) && v.every(x => x === null || SERIALIZABLE_TYPES.has(typeof x))) out[key] = v;
    }
  } else {
    out.name = typeof err;
    out.message = String(err);
  }
  return out;
}
```

- [ ] **Step 4: Run — passes**

```bash
pnpm --filter @clamator/protocol test
```

- [ ] **Step 5: Commit**

```bash
git add ts/packages/protocol/src/error.ts ts/packages/protocol/tests/error.test.ts
git commit -m "feat(ts/protocol): RpcError/ProtocolError/TransportError + exceptionToErrorData"
```

---

## Task 4: TS Transport interface

**Files:**
- Create: `ts/packages/protocol/src/transport.ts`

- [ ] **Step 1: Write `src/transport.ts`**

```typescript
import type { Envelope } from './envelope.js';

/** Adapter-side dispatch fn: returns Response envelope for requests, null for notifications. */
export type Dispatcher = (env: Envelope) => Promise<Record<string, unknown> | null>;

export interface SendOptions {
  timeoutMs: number;
}

export interface Transport {
  /** Register a handler for inbound traffic on a given service name. */
  registerService(name: string, dispatch: Dispatcher): Promise<void>;
  /** Send a request envelope; resolve with the response envelope. */
  send(env: Record<string, unknown>, opts: SendOptions): Promise<Record<string, unknown>>;
  /** Send a fire-and-forget notification envelope. */
  notify(env: Record<string, unknown>): Promise<void>;
  /** Spin up loops; idempotent. */
  start(): Promise<void>;
  /** Drain in-flight + close; idempotent. */
  stop(): Promise<void>;
}
```

(No tests for the interface alone — exercised through ServerCore + ClientCore.)

- [ ] **Step 2: Build to verify types compile**

```bash
pnpm --filter @clamator/protocol build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add ts/packages/protocol/src/transport.ts
git commit -m "feat(ts/protocol): Transport interface"
```

---

## Task 5: TS contract DSL

**Files:**
- Create: `ts/packages/protocol/src/contract.ts`
- Create: `ts/packages/protocol/tests/contract.test.ts`

- [ ] **Step 1: Write failing test `tests/contract.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification } from '../src/contract.js';

describe('defineContract', () => {
  it('builds a valid contract', () => {
    const c = defineContract('engine', {
      launch: defineMethod({
        params: z.object({ id: z.string() }),
        result: z.object({ ok: z.boolean() }),
      }),
      resync: defineNotification({
        params: z.object({}),
      }),
    });
    expect(c.service).toBe('engine');
    expect(Object.keys(c.methods)).toEqual(['launch', 'resync']);
  });

  it('rejects bad service name', () => {
    expect(() => defineContract('Engine', { x: defineMethod({ params: z.object({}), result: z.object({}) }) }))
      .toThrow(/service/);
  });

  it('rejects bad method name', () => {
    expect(() => defineContract('engine', { Launch: defineMethod({ params: z.object({}), result: z.object({}) }) }))
      .toThrow(/method/);
  });

  it('rejects method def without result', () => {
    expect(() => defineContract('engine', { launch: { params: z.object({}) } as any }))
      .toThrow(/result/);
  });

  it('rejects notification def WITH result', () => {
    expect(() => defineContract('engine', { resync: { params: z.object({}), result: z.object({}), notification: true } as any }))
      .toThrow(/notification/);
  });
});
```

- [ ] **Step 2: Run — fails**

```bash
pnpm --filter @clamator/protocol test -- contract.test
```

- [ ] **Step 3: Write `src/contract.ts`**

```typescript
import type { z } from 'zod';
import { SERVICE_RE, METHOD_RE } from './envelope.js';

export interface MethodDef<P extends z.ZodTypeAny, R extends z.ZodTypeAny> {
  params: P;
  result: R;
  notification?: false;
}

export interface NotificationDef<P extends z.ZodTypeAny> {
  params: P;
  notification: true;
}

export type AnyMethodDef = MethodDef<z.ZodTypeAny, z.ZodTypeAny> | NotificationDef<z.ZodTypeAny>;

export interface Contract<S extends string, M extends Record<string, AnyMethodDef>> {
  service: S;
  methods: M;
}

export function defineMethod<P extends z.ZodTypeAny, R extends z.ZodTypeAny>(
  def: MethodDef<P, R>,
): MethodDef<P, R> {
  return def;
}

export function defineNotification<P extends z.ZodTypeAny>(
  def: NotificationDef<P>,
): NotificationDef<P> {
  return def;
}

export function defineContract<S extends string, M extends Record<string, AnyMethodDef>>(
  service: S,
  methods: M,
): Contract<S, M> {
  if (!SERVICE_RE.test(service))
    throw new Error(`invalid service name "${service}" (must match ${SERVICE_RE.source})`);
  for (const [name, def] of Object.entries(methods)) {
    if (!METHOD_RE.test(name))
      throw new Error(`invalid method name "${name}" (must match ${METHOD_RE.source})`);
    if ('notification' in def && def.notification === true) {
      if ('result' in (def as Record<string, unknown>))
        throw new Error(`notification "${name}" must not include result`);
    } else {
      if (!('result' in def) || (def as MethodDef<z.ZodTypeAny, z.ZodTypeAny>).result === undefined)
        throw new Error(`method "${name}" must include result schema`);
    }
  }
  return { service, methods };
}

/** Inferred handler signatures from a contract's method map. */
export type HandlersFor<M extends Record<string, AnyMethodDef>> = {
  [K in keyof M]: M[K] extends NotificationDef<infer P>
    ? (params: z.infer<P>) => Promise<void>
    : M[K] extends MethodDef<infer P, infer R>
    ? (params: z.infer<P>) => Promise<z.infer<R>>
    : never;
};
```

- [ ] **Step 4: Run — passes**

```bash
pnpm --filter @clamator/protocol test
```

- [ ] **Step 5: Commit**

```bash
git add ts/packages/protocol/src/contract.ts ts/packages/protocol/tests/contract.test.ts
git commit -m "feat(ts/protocol): contract DSL with format validation"
```

---

## Task 6: TS RpcServerCore

**Files:**
- Create: `ts/packages/protocol/src/server-core.ts`
- Create: `ts/packages/protocol/tests/server-core.test.ts`

- [ ] **Step 1: Write failing test `tests/server-core.test.ts`**

Use a fake in-memory transport to verify dispatch behavior:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { RpcServerCore } from '../src/server-core.js';
import { defineContract, defineMethod, defineNotification } from '../src/contract.js';
import { RpcError } from '../src/error.js';
import type { Transport, Dispatcher } from '../src/transport.js';

function fakeTransport(): { transport: Transport; dispatchers: Map<string, Dispatcher>; started: boolean } {
  const dispatchers = new Map<string, Dispatcher>();
  let started = false;
  const transport: Transport = {
    async registerService(name, dispatch) { dispatchers.set(name, dispatch); },
    async send() { throw new Error('send not used in server tests'); },
    async notify() {},
    async start() { started = true; },
    async stop() { started = false; },
  };
  return { transport, dispatchers, get started() { return started; } } as any;
}

const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  ping: defineNotification({ params: z.object({}) }),
});

describe('RpcServerCore', () => {
  it('dispatches a valid request', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, {
      add: async ({ a, b }) => ({ sum: a + b }),
      ping: async () => {},
    });
    await server.start();
    const dispatch = dispatchers.get('arith')!;
    const reply = await dispatch({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 2, b: 3 }, id: 'i1', raw: {} as any,
    });
    expect(reply).toEqual({ jsonrpc: '2.0', id: 'i1', result: { sum: 5 } });
  });

  it('returns -32601 when method not found', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, { add: async () => ({ sum: 0 }), ping: async () => {} });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'unknown', fullMethod: 'arith.unknown',
      params: {}, id: 'i', raw: {} as any,
    });
    expect((reply as any).error.code).toBe(-32601);
  });

  it('returns -32602 on bad params', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, { add: async () => ({ sum: 0 }), ping: async () => {} });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 'nope', b: 3 }, id: 'i', raw: {} as any,
    });
    expect((reply as any).error.code).toBe(-32602);
  });

  it('returns RpcError code/message from handler throw', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, {
      add: async () => { throw new RpcError(-32001, 'denied', { reason: 'auth' }); },
      ping: async () => {},
    });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 1, b: 2 }, id: 'i', raw: {} as any,
    });
    expect((reply as any).error).toEqual({ code: -32001, message: 'denied', data: { reason: 'auth' } });
  });

  it('returns -32603 on generic exception', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, {
      add: async () => { throw new Error('boom'); },
      ping: async () => {},
    });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 1, b: 2 }, id: 'i', raw: {} as any,
    });
    expect((reply as any).error.code).toBe(-32603);
    expect((reply as any).error.data).toMatchObject({ name: 'Error', message: 'boom' });
  });

  it('returns -32603 when handler returns invalid result', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, {
      add: async () => ({ sum: 'not a number' as any }),
      ping: async () => {},
    });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 1, b: 2 }, id: 'i', raw: {} as any,
    });
    expect((reply as any).error.code).toBe(-32603);
  });

  it('returns null for notification dispatch', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    const ping = vi.fn().mockResolvedValue(undefined);
    server.registerService(arith, { add: async () => ({ sum: 0 }), ping });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'notification' as any, service: 'arith', method: 'ping', fullMethod: 'arith.ping',
      params: {}, raw: {} as any,
    });
    expect(reply).toBeNull();
    expect(ping).toHaveBeenCalled();
  });

  it('throws on duplicate service registration', async () => {
    const { transport } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, { add: async () => ({ sum: 0 }), ping: async () => {} });
    expect(() => server.registerService(arith, { add: async () => ({ sum: 0 }), ping: async () => {} }))
      .toThrow(/already registered/);
  });

  it('stop is idempotent', async () => {
    const { transport } = fakeTransport();
    const server = new RpcServerCore(transport);
    await server.start();
    await server.stop();
    await expect(server.stop()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — fails (RpcServerCore missing)**

- [ ] **Step 3: Write `src/server-core.ts`**

```typescript
import type { Contract, AnyMethodDef, HandlersFor } from './contract.js';
import type { Transport, Dispatcher } from './transport.js';
import { EnvelopeKind, type Envelope, buildSuccessResponse, buildErrorResponse } from './envelope.js';
import { RpcError, exceptionToErrorData } from './error.js';

interface ServiceEntry {
  contract: Contract<string, Record<string, AnyMethodDef>>;
  handlers: Record<string, (params: unknown) => Promise<unknown>>;
}

export interface ServerStopOptions {
  graceMs?: number;
}

export class RpcServerCore {
  private services = new Map<string, ServiceEntry>();
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private inflight = new Set<Promise<unknown>>();

  constructor(private readonly transport: Transport) {}

  registerService<M extends Record<string, AnyMethodDef>>(
    contract: Contract<string, M>,
    handlers: HandlersFor<M>,
  ): void {
    if (this.services.has(contract.service))
      throw new Error(`service "${contract.service}" already registered on this server`);
    this.services.set(contract.service, {
      contract,
      handlers: handlers as unknown as Record<string, (params: unknown) => Promise<unknown>>,
    });
  }

  private dispatcher(serviceName: string): Dispatcher {
    return async (env: Envelope) => {
      const entry = this.services.get(serviceName);
      if (!entry) {
        if (env.kind === EnvelopeKind.Notification) return null;
        const id = env.kind === EnvelopeKind.Request ? env.id : null;
        return buildErrorResponse(id, -32601, 'Method not found');
      }
      if (env.kind !== EnvelopeKind.Request && env.kind !== EnvelopeKind.Notification) return null;
      const methodDef = entry.contract.methods[env.method];
      const id = env.kind === EnvelopeKind.Request ? env.id : null;
      if (!methodDef) {
        return env.kind === EnvelopeKind.Notification ? null : buildErrorResponse(id, -32601, 'Method not found');
      }
      let parsed: unknown;
      try {
        parsed = methodDef.params.parse(env.params);
      } catch (e) {
        if (env.kind === EnvelopeKind.Notification) return null;
        return buildErrorResponse(id, -32602, 'Invalid params', exceptionToErrorData(e));
      }
      const handler = entry.handlers[env.method];
      if (!handler) return env.kind === EnvelopeKind.Notification ? null : buildErrorResponse(id, -32601, 'Method not found');

      const work = handler(parsed);
      this.inflight.add(work);
      let result: unknown;
      try {
        result = await work;
      } catch (e) {
        this.inflight.delete(work);
        if (env.kind === EnvelopeKind.Notification) return null;
        if (e instanceof RpcError) return buildErrorResponse(id, e.code, e.message, e.data);
        return buildErrorResponse(id, -32603, 'Internal error', exceptionToErrorData(e));
      }
      this.inflight.delete(work);
      if (env.kind === EnvelopeKind.Notification) return null;
      const isNotificationDef = 'notification' in methodDef && methodDef.notification === true;
      if (isNotificationDef) return null;
      try {
        const validated = (methodDef as { result: { parse: (x: unknown) => unknown } }).result.parse(result);
        return buildSuccessResponse(id as string | number, validated);
      } catch (e) {
        return buildErrorResponse(id, -32603, 'Result validation failed', exceptionToErrorData(e));
      }
    };
  }

  async start(): Promise<void> {
    if (this.state === 'started') return;
    if (this.state === 'stopped') throw new Error('server has been stopped');
    for (const name of this.services.keys()) {
      await this.transport.registerService(name, this.dispatcher(name));
    }
    await this.transport.start();
    this.state = 'started';
  }

  async stop(opts: ServerStopOptions = {}): Promise<void> {
    if (this.state !== 'started') { this.state = 'stopped'; return; }
    const grace = opts.graceMs ?? 5000;
    const deadline = Date.now() + grace;
    while (this.inflight.size > 0 && Date.now() < deadline) {
      await Promise.race([
        Promise.allSettled([...this.inflight]),
        new Promise(r => setTimeout(r, 50)),
      ]);
    }
    await this.transport.stop();
    this.state = 'stopped';
  }
}
```

- [ ] **Step 4: Run — passes**

```bash
pnpm --filter @clamator/protocol test
```

- [ ] **Step 5: Commit**

```bash
git add ts/packages/protocol/src/server-core.ts ts/packages/protocol/tests/server-core.test.ts
git commit -m "feat(ts/protocol): RpcServerCore with edge validation + error mapping"
```

---

## Task 7: TS RpcClientCore

**Files:**
- Create: `ts/packages/protocol/src/client-core.ts`
- Create: `ts/packages/protocol/tests/client-core.test.ts`

- [ ] **Step 1: Write failing test `tests/client-core.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { RpcClientCore } from '../src/client-core.js';
import { ClamatorProtocolError } from '../src/error.js';
import type { Transport } from '../src/transport.js';

function recordingTransport(reply: Record<string, unknown>): { transport: Transport; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const transport: Transport = {
    async registerService() {},
    async send(env) { sent.push(env); return reply; },
    async notify(env) { sent.push(env); },
    async start() {},
    async stop() {},
  };
  return { transport, sent };
}

describe('RpcClientCore', () => {
  it('call sends a well-formed request and unwraps result', async () => {
    const { transport, sent } = recordingTransport({ jsonrpc: '2.0', id: 'x', result: { sum: 5 } });
    const c = new RpcClientCore(transport);
    await c.start();
    const r = await c.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    expect(sent[0]).toMatchObject({ jsonrpc: '2.0', method: 'arith.add', params: { a: 2, b: 3 } });
    expect(typeof (sent[0] as any).id).toBe('string');
  });

  it('call surfaces RpcError on error response', async () => {
    const { transport } = recordingTransport({ jsonrpc: '2.0', id: 'x', error: { code: -32001, message: 'x', data: null } });
    const c = new RpcClientCore(transport);
    await c.start();
    await expect(c.call('arith', 'add', {})).rejects.toMatchObject({ name: 'RpcError', code: -32001 });
  });

  it('call rejects with ClamatorProtocolError on malformed reply', async () => {
    const { transport } = recordingTransport({ jsonrpc: '2.0' });  // missing id+result+error
    const c = new RpcClientCore(transport);
    await c.start();
    await expect(c.call('arith', 'add', {})).rejects.toBeInstanceOf(ClamatorProtocolError);
  });

  it('notify sends a request without id', async () => {
    const { transport, sent } = recordingTransport({} as any);
    const c = new RpcClientCore(transport);
    await c.start();
    await c.notify('arith', 'ping', { x: 1 });
    expect(sent[0]).toEqual({ jsonrpc: '2.0', method: 'arith.ping', params: { x: 1 } });
    expect('id' in (sent[0] as object)).toBe(false);
  });

  it('rejects bad service / method format synchronously', async () => {
    const { transport } = recordingTransport({} as any);
    const c = new RpcClientCore(transport);
    await c.start();
    await expect(c.call('Engine', 'add', {})).rejects.toThrow(/service/);
    await expect(c.call('arith', 'Add', {})).rejects.toThrow(/method/);
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Write `src/client-core.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { Transport } from './transport.js';
import { SERVICE_RE, METHOD_RE, parseEnvelope, EnvelopeKind, buildRequest, buildNotification } from './envelope.js';
import { RpcError, ClamatorProtocolError } from './error.js';

export interface ClamatorClient {
  call<P, R>(service: string, method: string, params: P): Promise<R>;
  notify<P>(service: string, method: string, params: P): Promise<void>;
}

export interface RpcClientCoreOptions {
  defaultTimeoutMs?: number;
}

export class RpcClientCore implements ClamatorClient {
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private readonly defaultTimeoutMs: number;

  constructor(private readonly transport: Transport, opts: RpcClientCoreOptions = {}) {
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 30_000;
  }

  async call<P, R>(service: string, method: string, params: P): Promise<R> {
    if (!SERVICE_RE.test(service)) throw new Error(`invalid service "${service}"`);
    if (!METHOD_RE.test(method)) throw new Error(`invalid method "${method}"`);
    const id = randomUUID();
    const env = buildRequest(`${service}.${method}`, params, id);
    const reply = await this.transport.send(env, { timeoutMs: this.defaultTimeoutMs });
    let parsed;
    try { parsed = parseEnvelope(reply); }
    catch (e) { throw new ClamatorProtocolError(`invalid response envelope: ${(e as Error).message}`); }
    if (parsed.kind === EnvelopeKind.SuccessResponse) return parsed.result as R;
    if (parsed.kind === EnvelopeKind.ErrorResponse) {
      const { code, message, data } = parsed.error;
      throw new RpcError(code, message, data);
    }
    throw new ClamatorProtocolError(`unexpected response kind: ${parsed.kind}`);
  }

  async notify<P>(service: string, method: string, params: P): Promise<void> {
    if (!SERVICE_RE.test(service)) throw new Error(`invalid service "${service}"`);
    if (!METHOD_RE.test(method)) throw new Error(`invalid method "${method}"`);
    await this.transport.notify(buildNotification(`${service}.${method}`, params));
  }

  async start(): Promise<void> {
    if (this.state === 'stopped') throw new Error('client has been stopped');
    if (this.state === 'started') return;
    await this.transport.start();
    this.state = 'started';
  }

  async stop(): Promise<void> {
    if (this.state !== 'started') { this.state = 'stopped'; return; }
    await this.transport.stop();
    this.state = 'stopped';
  }
}
```

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit**

```bash
git add ts/packages/protocol/src/client-core.ts ts/packages/protocol/tests/client-core.test.ts
git commit -m "feat(ts/protocol): RpcClientCore + ClamatorClient interface"
```

---

## Task 8: TS package exports + AGENTS.md + final build

**Files:**
- Modify: `ts/packages/protocol/src/index.ts`
- Create: `ts/packages/protocol/AGENTS.md`

- [ ] **Step 1: Replace `src/index.ts` with full re-exports**

```typescript
export {
  defineContract, defineMethod, defineNotification,
  type Contract, type MethodDef, type NotificationDef, type AnyMethodDef, type HandlersFor,
} from './contract.js';
export {
  parseEnvelope, buildRequest, buildNotification, buildSuccessResponse, buildErrorResponse,
  EnvelopeKind, SERVICE_RE, METHOD_RE,
  type Envelope, type RequestEnvelope, type NotificationEnvelope,
  type SuccessResponseEnvelope, type ErrorResponseEnvelope, type RpcId,
} from './envelope.js';
export {
  RpcError, ClamatorProtocolError, ClamatorTransportError, exceptionToErrorData,
} from './error.js';
export type { Transport, Dispatcher, SendOptions } from './transport.js';
export { RpcServerCore, type ServerStopOptions } from './server-core.js';
export { RpcClientCore, type ClamatorClient, type RpcClientCoreOptions } from './client-core.js';
```

- [ ] **Step 2: Write `AGENTS.md`**

```markdown
# @clamator/protocol — agent rules

Pure protocol package. **No I/O, ever.** Anything that touches a network, filesystem, or process belongs in a transport adapter.

## Public API surface

These exports are the SemVer surface; changes require updating the matching Py package (`clamator-protocol`) in the same commit:

- `defineContract`, `defineMethod`, `defineNotification`
- `Contract`, `MethodDef`, `NotificationDef`, `AnyMethodDef`, `HandlersFor`
- `parseEnvelope`, `buildRequest`, `buildNotification`, `buildSuccessResponse`, `buildErrorResponse`, `EnvelopeKind`
- `RpcError`, `ClamatorProtocolError`, `ClamatorTransportError`, `exceptionToErrorData`
- `Transport`, `Dispatcher`
- `RpcServerCore`, `RpcClientCore`, `ClamatorClient`

## Reserved error codes

| Code | Meaning |
|---|---|
| -32600 | Invalid Request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32700 | Parse error |
| -32000..-32099 | Application-defined |

Adding/changing a reserved code: update both languages + interop scenario in the same commit.

## Validation order (must match Py side)

- Server inbound: parse envelope → look up service+method → validate params → invoke handler → validate result → build response.
- Server outbound: handler return validated against result schema.
- Client outbound: param-format check (service/method regex); param schema validation lives in generated wrapper.
- Client inbound: parse envelope → unwrap result/error.

## Cross-cutting rules

- ESM-only. No CJS dual-export.
- All async APIs are `Promise<T>`.
- `RpcServerCore.registerService` is dedup'd per service name.
- `start()` / `stop()` are idempotent; calling `start()` after `stop()` throws.
```

- [ ] **Step 3: Final build + test**

```bash
pnpm --filter @clamator/protocol build
pnpm --filter @clamator/protocol test
```

- [ ] **Step 4: Commit**

```bash
git add ts/packages/protocol/src/index.ts ts/packages/protocol/AGENTS.md
git commit -m "feat(ts/protocol): re-export public API + AGENTS.md"
```

---

## Task 9: Py package scaffold

**Files:**
- Create: `py/packages/protocol/pyproject.toml`
- Create: `py/packages/protocol/src/clamator_protocol/__init__.py`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "clamator-protocol"
version = "0.1.0"
description = "Polyglot RPC protocol layer (pre-1.0; API may break in minor versions)."
license = { text = "Apache-2.0" }
readme = "../../../README.md"
requires-python = ">=3.11"
authors = [{ name = "Kristof Csillag" }]
dependencies = ["pydantic>=2.5"]

[project.urls]
Homepage = "https://github.com/csillag/clamator"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/clamator_protocol"]
include = ["LICENSE"]

[tool.hatch.build.targets.sdist]
include = ["src", "LICENSE", "README.md", "pyproject.toml"]

[tool.hatch.build.force-include]
"../../../LICENSE" = "LICENSE"
```

- [ ] **Step 2: Symlink LICENSE for editable installs**

```bash
ln -s ../../../LICENSE py/packages/protocol/LICENSE
```

- [ ] **Step 3: Write empty `__init__.py`**

```python
"""clamator-protocol: pure protocol layer for clamator polyglot RPC."""
```

- [ ] **Step 4: Sync workspace**

```bash
cd py && uv sync
```

Expected: `clamator-protocol` resolved as workspace member.

- [ ] **Step 5: Commit**

```bash
git add py/packages/protocol/pyproject.toml py/packages/protocol/src/clamator_protocol/__init__.py py/packages/protocol/LICENSE py/uv.lock
git commit -m "feat(py/protocol): scaffold clamator-protocol package"
```

---

## Task 10: Py envelope module

**Files:**
- Create: `py/packages/protocol/src/clamator_protocol/envelope.py`
- Create: `py/packages/protocol/tests/test_envelope.py`

- [ ] **Step 1: Write failing test `tests/test_envelope.py`**

```python
import pytest
from clamator_protocol.envelope import (
    parse_envelope, EnvelopeKind, SERVICE_RE, METHOD_RE,
    build_request, build_notification, build_success_response, build_error_response,
)


def test_classifies_request():
    env = parse_envelope({"jsonrpc": "2.0", "method": "engine.launch", "params": {"x": 1}, "id": "abc"})
    assert env.kind is EnvelopeKind.REQUEST
    assert env.service == "engine"
    assert env.method == "launch"
    assert env.id == "abc"


def test_classifies_notification():
    env = parse_envelope({"jsonrpc": "2.0", "method": "engine.resync", "params": {}})
    assert env.kind is EnvelopeKind.NOTIFICATION


def test_classifies_success_response():
    env = parse_envelope({"jsonrpc": "2.0", "id": "x", "result": {"ok": True}})
    assert env.kind is EnvelopeKind.SUCCESS_RESPONSE


def test_classifies_error_response():
    env = parse_envelope({"jsonrpc": "2.0", "id": "x", "error": {"code": -32603, "message": "x", "data": None}})
    assert env.kind is EnvelopeKind.ERROR_RESPONSE


def test_rejects_batch():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope([{}])


def test_rejects_wrong_jsonrpc_version():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "1.0", "method": "a.b", "params": {}})


def test_rejects_method_without_dot():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "2.0", "method": "launch", "params": {}})


def test_rejects_invalid_service_segment():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "2.0", "method": "Engine.launch", "params": {}})


def test_rejects_invalid_method_segment():
    with pytest.raises(ValueError, match="-32600"):
        parse_envelope({"jsonrpc": "2.0", "method": "engine.Launch", "params": {}})


def test_regexes():
    assert SERVICE_RE.match("engine")
    assert SERVICE_RE.match("order-service")
    assert not SERVICE_RE.match("Engine")
    assert METHOD_RE.match("launchProcess")
    assert not METHOD_RE.match("Launch")


def test_builders():
    assert build_request("a.b", {}, "id1") == {"jsonrpc": "2.0", "method": "a.b", "params": {}, "id": "id1"}
    assert build_notification("a.b", {}) == {"jsonrpc": "2.0", "method": "a.b", "params": {}}
    assert build_success_response("id1", {"x": 1}) == {"jsonrpc": "2.0", "id": "id1", "result": {"x": 1}}
    err = build_error_response("id1", -32000, "oops", {"k": "v"})
    assert err == {"jsonrpc": "2.0", "id": "id1", "error": {"code": -32000, "message": "oops", "data": {"k": "v"}}}
```

- [ ] **Step 2: Run — fails**

```bash
cd py && uv run pytest packages/protocol/tests/test_envelope.py -v
```

- [ ] **Step 3: Write `envelope.py`**

```python
from __future__ import annotations
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Union

SERVICE_RE = re.compile(r"^[a-z][a-z0-9-]*$")
METHOD_RE = re.compile(r"^[a-z][a-zA-Z0-9-]*$")


class EnvelopeKind(Enum):
    REQUEST = "request"
    NOTIFICATION = "notification"
    SUCCESS_RESPONSE = "success"
    ERROR_RESPONSE = "error"


RpcId = Union[str, int]


@dataclass(frozen=True)
class RequestEnvelope:
    service: str
    method: str
    full_method: str
    params: Any
    id: RpcId
    raw: dict[str, Any] = field(repr=False)
    kind: EnvelopeKind = EnvelopeKind.REQUEST


@dataclass(frozen=True)
class NotificationEnvelope:
    service: str
    method: str
    full_method: str
    params: Any
    raw: dict[str, Any] = field(repr=False)
    kind: EnvelopeKind = EnvelopeKind.NOTIFICATION


@dataclass(frozen=True)
class SuccessResponseEnvelope:
    id: RpcId
    result: Any
    kind: EnvelopeKind = EnvelopeKind.SUCCESS_RESPONSE


@dataclass(frozen=True)
class ErrorResponseEnvelope:
    id: RpcId | None
    error: dict[str, Any]
    kind: EnvelopeKind = EnvelopeKind.ERROR_RESPONSE


Envelope = Union[
    RequestEnvelope, NotificationEnvelope, SuccessResponseEnvelope, ErrorResponseEnvelope
]


def _invalid(msg: str) -> ValueError:
    return ValueError(f"-32600 Invalid Request: {msg}")


def parse_envelope(value: Any) -> Envelope:
    if isinstance(value, list):
        raise _invalid("batch requests not supported")
    if not isinstance(value, dict):
        raise _invalid("not an object")
    if value.get("jsonrpc") != "2.0":
        raise _invalid('jsonrpc must equal "2.0"')

    has_method = isinstance(value.get("method"), str)
    has_result = "result" in value
    has_error = "error" in value
    has_id = "id" in value and value["id"] is not None

    if has_method:
        full_method = value["method"]
        if "." not in full_method:
            raise _invalid('method must be "<service>.<method>"')
        service, _, method = full_method.partition(".")
        if not service or not method:
            raise _invalid('method must be "<service>.<method>"')
        if not SERVICE_RE.match(service):
            raise _invalid("invalid service segment")
        if not METHOD_RE.match(method):
            raise _invalid("invalid method segment")
        if has_id:
            rpc_id = value["id"]
            if not isinstance(rpc_id, (str, int)):
                raise _invalid("id must be string or number")
            return RequestEnvelope(
                service=service, method=method, full_method=full_method,
                params=value.get("params", {}), id=rpc_id, raw=value,
            )
        return NotificationEnvelope(
            service=service, method=method, full_method=full_method,
            params=value.get("params", {}), raw=value,
        )

    if has_result and not has_error:
        if not has_id:
            raise _invalid("response must have id")
        return SuccessResponseEnvelope(id=value["id"], result=value["result"])

    if has_error and not has_result:
        err = value.get("error")
        if not isinstance(err, dict) or not isinstance(err.get("code"), int) or not isinstance(err.get("message"), str):
            raise _invalid("error must have numeric code + string message")
        rpc_id = value["id"] if has_id else None
        return ErrorResponseEnvelope(
            id=rpc_id,
            error={"code": err["code"], "message": err["message"], "data": err.get("data")},
        )

    raise _invalid("envelope must be request, notification, or response")


def build_request(full_method: str, params: Any, rpc_id: RpcId) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "method": full_method, "params": params, "id": rpc_id}


def build_notification(full_method: str, params: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "method": full_method, "params": params}


def build_success_response(rpc_id: RpcId, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rpc_id, "result": result}


def build_error_response(rpc_id: RpcId | None, code: int, message: str, data: Any = None) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": message, "data": data}}
```

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit**

```bash
git add py/packages/protocol/src/clamator_protocol/envelope.py py/packages/protocol/tests/test_envelope.py
git commit -m "feat(py/protocol): envelope types + parse_envelope"
```

---

## Task 11: Py error classes

**Files:**
- Create: `py/packages/protocol/src/clamator_protocol/error.py`
- Create: `py/packages/protocol/tests/test_error.py`

- [ ] **Step 1: Write failing test `tests/test_error.py`**

```python
from clamator_protocol.error import (
    RpcError, ClamatorProtocolError, ClamatorTransportError, exception_to_error_data,
)


def test_rpc_error_fields():
    e = RpcError(-32000, "oops", {"x": 1})
    assert e.code == -32000
    assert e.message == "oops"
    assert e.data == {"x": 1}
    assert isinstance(e, Exception)


def test_protocol_error_is_exception():
    assert isinstance(ClamatorProtocolError("p"), Exception)


def test_transport_error_carries_cause():
    cause = RuntimeError("boom")
    e = ClamatorTransportError("lost", cause=cause)
    assert e.__cause__ is cause


def test_exception_to_error_data_strips_unserializable():
    class Boom(Exception):
        pass
    e = Boom("hi")
    e.foo = "bar"
    e.n = 7
    e.bad = object()
    data = exception_to_error_data(e)
    assert data["name"] == "Boom"
    assert data["message"] == "hi"
    assert data["foo"] == "bar"
    assert data["n"] == 7
    assert "bad" not in data
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Write `error.py`**

```python
from __future__ import annotations
from typing import Any


class RpcError(Exception):
    """Application-defined JSON-RPC error. Throw from a handler to produce an error response."""

    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


class ClamatorProtocolError(Exception):
    """Validation failure or malformed envelope."""


class ClamatorTransportError(Exception):
    """Transport-level failure (connection lost, timeout, etc.)."""

    def __init__(self, message: str, *, cause: BaseException | None = None) -> None:
        super().__init__(message)
        if cause is not None:
            self.__cause__ = cause


_SERIALIZABLE = (str, int, float, bool, type(None))


def exception_to_error_data(err: BaseException) -> dict[str, Any]:
    out: dict[str, Any] = {"name": type(err).__name__, "message": str(err)}
    for k, v in vars(err).items():
        if k in {"args", "__cause__", "__context__", "__traceback__"}:
            continue
        if isinstance(v, _SERIALIZABLE):
            out[k] = v
        elif isinstance(v, list) and all(isinstance(x, _SERIALIZABLE) for x in v):
            out[k] = v
    return out
```

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit**

```bash
git add py/packages/protocol/src/clamator_protocol/error.py py/packages/protocol/tests/test_error.py
git commit -m "feat(py/protocol): RpcError/ProtocolError/TransportError + exception_to_error_data"
```

---

## Task 12: Py contract dataclasses + Transport Protocol

**Files:**
- Create: `py/packages/protocol/src/clamator_protocol/contract.py`
- Create: `py/packages/protocol/src/clamator_protocol/transport.py`

- [ ] **Step 1: Write `contract.py`**

```python
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Type

from pydantic import BaseModel


@dataclass(frozen=True)
class MethodEntry:
    """Runtime descriptor for a single method on a generated contract."""
    params_model: Type[BaseModel]
    result_model: Type[BaseModel] | None  # None for notifications
    handler_attr: str  # attribute on the service-instance to invoke (snake_case)


@dataclass(frozen=True)
class Contract:
    """Runtime descriptor for a service contract. Codegen emits one of these per service."""
    service: str
    methods: dict[str, MethodEntry] = field(default_factory=dict)
```

- [ ] **Step 2: Write `transport.py`**

```python
from __future__ import annotations
from typing import Any, Awaitable, Callable, Protocol, runtime_checkable

from .envelope import Envelope


Dispatcher = Callable[[Envelope], Awaitable[dict[str, Any] | None]]


@runtime_checkable
class Transport(Protocol):
    async def register_service(self, name: str, dispatch: Dispatcher) -> None: ...
    async def send(self, env: dict[str, Any], *, timeout: float) -> dict[str, Any]: ...
    async def notify(self, env: dict[str, Any]) -> None: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
```

- [ ] **Step 3: Verify import sanity**

```bash
cd py && uv run python -c "from clamator_protocol.contract import Contract, MethodEntry; from clamator_protocol.transport import Transport, Dispatcher; print('ok')"
```

Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add py/packages/protocol/src/clamator_protocol/contract.py py/packages/protocol/src/clamator_protocol/transport.py
git commit -m "feat(py/protocol): Contract/MethodEntry dataclasses + Transport protocol"
```

---

## Task 13: Py RpcServerCore

**Files:**
- Create: `py/packages/protocol/src/clamator_protocol/server_core.py`
- Create: `py/packages/protocol/tests/test_server_core.py`

- [ ] **Step 1: Write failing test `tests/test_server_core.py`**

```python
import asyncio
import pytest
from pydantic import BaseModel
from clamator_protocol.contract import Contract, MethodEntry
from clamator_protocol.server_core import RpcServerCore
from clamator_protocol.transport import Transport, Dispatcher
from clamator_protocol.envelope import RequestEnvelope, NotificationEnvelope
from clamator_protocol.error import RpcError


class AddParams(BaseModel):
    a: int
    b: int


class AddResult(BaseModel):
    sum: int


class PingParams(BaseModel):
    pass


arith_contract = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddParams, result_model=AddResult, handler_attr="add"),
        "ping": MethodEntry(params_model=PingParams, result_model=None, handler_attr="ping"),
    },
)


class FakeTransport:
    def __init__(self):
        self.dispatchers: dict[str, Dispatcher] = {}
        self.started = False

    async def register_service(self, name, dispatch):
        self.dispatchers[name] = dispatch

    async def send(self, env, *, timeout):
        raise AssertionError("unused")

    async def notify(self, env):
        pass

    async def start(self):
        self.started = True

    async def stop(self):
        self.started = False


class ArithService:
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)
    async def ping(self, params: PingParams) -> None:
        pass


def request_env(method: str, params, rpc_id="i1") -> RequestEnvelope:
    return RequestEnvelope(
        service="arith", method=method, full_method=f"arith.{method}",
        params=params, id=rpc_id, raw={},
    )


async def test_dispatches_valid_request():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": 2, "b": 3}))
    assert reply == {"jsonrpc": "2.0", "id": "i1", "result": {"sum": 5}}


async def test_method_not_found():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("unknown", {}))
    assert reply["error"]["code"] == -32601


async def test_invalid_params():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": "x", "b": 3}))
    assert reply["error"]["code"] == -32602


async def test_handler_rpc_error():
    class BadService(ArithService):
        async def add(self, params):
            raise RpcError(-32001, "denied", {"why": "x"})
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, BadService())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": 1, "b": 2}))
    assert reply["error"] == {"code": -32001, "message": "denied", "data": {"why": "x"}}


async def test_handler_generic_exception():
    class Boom(ArithService):
        async def add(self, params):
            raise RuntimeError("boom")
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, Boom())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": 1, "b": 2}))
    assert reply["error"]["code"] == -32603
    assert reply["error"]["data"]["name"] == "RuntimeError"


async def test_invalid_result():
    class BadResult(ArithService):
        async def add(self, params):
            return {"sum": "not int"}  # not a valid AddResult
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, BadResult())
    await s.start()
    reply = await t.dispatchers["arith"](request_env("add", {"a": 1, "b": 2}))
    assert reply["error"]["code"] == -32603


async def test_notification_returns_none():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    await s.start()
    nenv = NotificationEnvelope(service="arith", method="ping", full_method="arith.ping", params={}, raw={})
    reply = await t.dispatchers["arith"](nenv)
    assert reply is None


async def test_duplicate_service_registration():
    t = FakeTransport()
    s = RpcServerCore(t)
    s.register_service(arith_contract, ArithService())
    with pytest.raises(ValueError, match="already registered"):
        s.register_service(arith_contract, ArithService())


async def test_stop_idempotent():
    t = FakeTransport()
    s = RpcServerCore(t)
    await s.start()
    await s.stop()
    await s.stop()  # no raise
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Write `server_core.py`**

```python
from __future__ import annotations
import asyncio
import time
from dataclasses import dataclass
from typing import Any

from pydantic import ValidationError

from .contract import Contract
from .envelope import (
    Envelope, RequestEnvelope, NotificationEnvelope,
    build_success_response, build_error_response,
)
from .error import RpcError, exception_to_error_data
from .transport import Transport, Dispatcher


@dataclass
class _ServiceEntry:
    contract: Contract
    handler_instance: Any


class RpcServerCore:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport
        self._services: dict[str, _ServiceEntry] = {}
        self._state: str = "idle"
        self._inflight: set[asyncio.Task[Any]] = set()

    def register_service(self, contract: Contract, instance: Any) -> None:
        if contract.service in self._services:
            raise ValueError(f'service "{contract.service}" already registered on this server')
        self._services[contract.service] = _ServiceEntry(contract=contract, handler_instance=instance)

    def _dispatcher(self, service_name: str) -> Dispatcher:
        async def dispatch(env: Envelope) -> dict[str, Any] | None:
            entry = self._services.get(service_name)
            if not isinstance(env, (RequestEnvelope, NotificationEnvelope)):
                return None
            is_notification = isinstance(env, NotificationEnvelope)
            rpc_id = None if is_notification else env.id
            if entry is None:
                return None if is_notification else build_error_response(rpc_id, -32601, "Method not found")
            method_entry = entry.contract.methods.get(env.method)
            if method_entry is None:
                return None if is_notification else build_error_response(rpc_id, -32601, "Method not found")
            try:
                params = method_entry.params_model.model_validate(env.params)
            except ValidationError as e:
                if is_notification:
                    return None
                return build_error_response(rpc_id, -32602, "Invalid params", {"errors": e.errors()})
            handler = getattr(entry.handler_instance, method_entry.handler_attr, None)
            if handler is None:
                return None if is_notification else build_error_response(rpc_id, -32601, "Method not found")

            task = asyncio.create_task(handler(params))
            self._inflight.add(task)
            try:
                result = await task
            except RpcError as e:
                if is_notification:
                    return None
                return build_error_response(rpc_id, e.code, e.message, e.data)
            except Exception as e:  # noqa: BLE001
                if is_notification:
                    return None
                return build_error_response(rpc_id, -32603, "Internal error", exception_to_error_data(e))
            finally:
                self._inflight.discard(task)

            if is_notification or method_entry.result_model is None:
                return None
            try:
                validated = method_entry.result_model.model_validate(result)
            except ValidationError as e:
                return build_error_response(rpc_id, -32603, "Result validation failed", {"errors": e.errors()})
            return build_success_response(rpc_id, validated.model_dump(by_alias=True))
        return dispatch

    async def start(self) -> None:
        if self._state == "started":
            return
        if self._state == "stopped":
            raise RuntimeError("server has been stopped")
        for name in self._services:
            await self._transport.register_service(name, self._dispatcher(name))
        await self._transport.start()
        self._state = "started"

    async def stop(self, *, grace_ms: int = 5000) -> None:
        if self._state != "started":
            self._state = "stopped"
            return
        deadline = time.monotonic() + grace_ms / 1000
        while self._inflight and time.monotonic() < deadline:
            await asyncio.wait(self._inflight, timeout=0.05, return_when=asyncio.ALL_COMPLETED)
        await self._transport.stop()
        self._state = "stopped"
```

- [ ] **Step 4: Run — passes**

```bash
cd py && uv run pytest packages/protocol/tests/test_server_core.py -v
```

- [ ] **Step 5: Commit**

```bash
git add py/packages/protocol/src/clamator_protocol/server_core.py py/packages/protocol/tests/test_server_core.py
git commit -m "feat(py/protocol): RpcServerCore with edge validation + error mapping"
```

---

## Task 14: Py RpcClientCore

**Files:**
- Create: `py/packages/protocol/src/clamator_protocol/client_core.py`
- Create: `py/packages/protocol/tests/test_client_core.py`

- [ ] **Step 1: Write failing test `tests/test_client_core.py`**

```python
import pytest
from clamator_protocol.client_core import RpcClientCore
from clamator_protocol.error import RpcError, ClamatorProtocolError


class FakeTransport:
    def __init__(self, reply):
        self.reply = reply
        self.sent = []

    async def register_service(self, name, dispatch): pass
    async def send(self, env, *, timeout):
        self.sent.append(env)
        return self.reply
    async def notify(self, env): self.sent.append(env)
    async def start(self): pass
    async def stop(self): pass


async def test_call_unwraps_result():
    t = FakeTransport({"jsonrpc": "2.0", "id": "x", "result": {"sum": 5}})
    c = RpcClientCore(t)
    await c.start()
    r = await c.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    assert t.sent[0]["method"] == "arith.add"
    assert t.sent[0]["params"] == {"a": 2, "b": 3}
    assert isinstance(t.sent[0]["id"], str)


async def test_call_raises_rpc_error():
    t = FakeTransport({"jsonrpc": "2.0", "id": "x", "error": {"code": -32001, "message": "x", "data": None}})
    c = RpcClientCore(t)
    await c.start()
    with pytest.raises(RpcError) as ei:
        await c.call("arith", "add", {})
    assert ei.value.code == -32001


async def test_call_raises_protocol_error_on_malformed():
    t = FakeTransport({"jsonrpc": "2.0"})
    c = RpcClientCore(t)
    await c.start()
    with pytest.raises(ClamatorProtocolError):
        await c.call("arith", "add", {})


async def test_notify_no_id():
    t = FakeTransport({})
    c = RpcClientCore(t)
    await c.start()
    await c.notify("arith", "ping", {"x": 1})
    assert "id" not in t.sent[0]
    assert t.sent[0] == {"jsonrpc": "2.0", "method": "arith.ping", "params": {"x": 1}}


async def test_call_rejects_bad_format():
    c = RpcClientCore(FakeTransport({}))
    await c.start()
    with pytest.raises(ValueError, match="service"):
        await c.call("Engine", "add", {})
    with pytest.raises(ValueError, match="method"):
        await c.call("arith", "Add", {})
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Write `client_core.py`**

```python
from __future__ import annotations
import uuid
from typing import Any, Protocol

from .envelope import (
    SERVICE_RE, METHOD_RE, parse_envelope,
    SuccessResponseEnvelope, ErrorResponseEnvelope,
    build_request, build_notification,
)
from .error import RpcError, ClamatorProtocolError
from .transport import Transport


class ClamatorClient(Protocol):
    async def call(self, service: str, method: str, params: Any) -> Any: ...
    async def notify(self, service: str, method: str, params: Any) -> None: ...


class RpcClientCore:
    def __init__(self, transport: Transport, *, default_timeout_ms: int = 30_000) -> None:
        self._transport = transport
        self._default_timeout = default_timeout_ms / 1000
        self._state = "idle"

    async def call(self, service: str, method: str, params: Any) -> Any:
        if not SERVICE_RE.match(service):
            raise ValueError(f"invalid service \"{service}\"")
        if not METHOD_RE.match(method):
            raise ValueError(f"invalid method \"{method}\"")
        rpc_id = str(uuid.uuid4())
        env = build_request(f"{service}.{method}", params, rpc_id)
        reply = await self._transport.send(env, timeout=self._default_timeout)
        try:
            parsed = parse_envelope(reply)
        except ValueError as e:
            raise ClamatorProtocolError(f"invalid response envelope: {e}") from e
        if isinstance(parsed, SuccessResponseEnvelope):
            return parsed.result
        if isinstance(parsed, ErrorResponseEnvelope):
            raise RpcError(parsed.error["code"], parsed.error["message"], parsed.error.get("data"))
        raise ClamatorProtocolError(f"unexpected response kind: {parsed.kind}")

    async def notify(self, service: str, method: str, params: Any) -> None:
        if not SERVICE_RE.match(service):
            raise ValueError(f"invalid service \"{service}\"")
        if not METHOD_RE.match(method):
            raise ValueError(f"invalid method \"{method}\"")
        await self._transport.notify(build_notification(f"{service}.{method}", params))

    async def start(self) -> None:
        if self._state == "stopped":
            raise RuntimeError("client has been stopped")
        if self._state == "started":
            return
        await self._transport.start()
        self._state = "started"

    async def stop(self) -> None:
        if self._state != "started":
            self._state = "stopped"
            return
        await self._transport.stop()
        self._state = "stopped"
```

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit**

```bash
git add py/packages/protocol/src/clamator_protocol/client_core.py py/packages/protocol/tests/test_client_core.py
git commit -m "feat(py/protocol): RpcClientCore + ClamatorClient protocol"
```

---

## Task 15: Py exports + AGENTS.md + final verification

**Files:**
- Modify: `py/packages/protocol/src/clamator_protocol/__init__.py`
- Create: `py/packages/protocol/AGENTS.md`

- [ ] **Step 1: Replace `__init__.py` with full exports**

```python
"""clamator-protocol: pure protocol layer for clamator polyglot RPC."""

from .contract import Contract, MethodEntry
from .envelope import (
    Envelope, RequestEnvelope, NotificationEnvelope,
    SuccessResponseEnvelope, ErrorResponseEnvelope,
    EnvelopeKind, RpcId, SERVICE_RE, METHOD_RE,
    parse_envelope, build_request, build_notification,
    build_success_response, build_error_response,
)
from .error import (
    RpcError, ClamatorProtocolError, ClamatorTransportError, exception_to_error_data,
)
from .transport import Transport, Dispatcher
from .server_core import RpcServerCore
from .client_core import RpcClientCore, ClamatorClient

__all__ = [
    "Contract", "MethodEntry",
    "Envelope", "RequestEnvelope", "NotificationEnvelope",
    "SuccessResponseEnvelope", "ErrorResponseEnvelope",
    "EnvelopeKind", "RpcId", "SERVICE_RE", "METHOD_RE",
    "parse_envelope", "build_request", "build_notification",
    "build_success_response", "build_error_response",
    "RpcError", "ClamatorProtocolError", "ClamatorTransportError",
    "exception_to_error_data",
    "Transport", "Dispatcher",
    "RpcServerCore", "RpcClientCore", "ClamatorClient",
]
```

- [ ] **Step 2: Write `AGENTS.md`**

```markdown
# clamator-protocol — agent rules

Pure protocol package. **No I/O, ever.** Network, filesystem, process — all belong in adapters.

## Public API surface

These exports are the SemVer surface; changes require updating `@clamator/protocol` (TS) in the same commit:

- `Contract`, `MethodEntry`
- `Envelope`, `RequestEnvelope`, `NotificationEnvelope`, `SuccessResponseEnvelope`, `ErrorResponseEnvelope`, `EnvelopeKind`
- `parse_envelope`, `build_request`, `build_notification`, `build_success_response`, `build_error_response`
- `RpcError`, `ClamatorProtocolError`, `ClamatorTransportError`, `exception_to_error_data`
- `Transport`, `Dispatcher`
- `RpcServerCore`, `RpcClientCore`, `ClamatorClient`

## Reserved error codes

Same as `@clamator/protocol`. Adding/changing a reserved code: update both languages + interop scenario in the same commit.

## Validation order (must match TS side)

- Server inbound: parse envelope → look up service+method → `params_model.model_validate` → invoke handler → `result_model.model_validate` → build response.
- Server outbound: handler return validated against result model.
- Client outbound: format check (regex); param schema validation lives in generated wrapper.
- Client inbound: parse envelope → unwrap result/error.

## Cross-cutting rules

- Async-only.
- Pydantic v2 with `model_config = {populate_by_name: True}` on every generated model (codegen sets this; protocol package does not enforce on bare BaseModel).
- `RpcServerCore.register_service` is dedup'd per service name.
- `start()` / `stop()` are idempotent; calling `start()` after `stop()` raises.
```

- [ ] **Step 3: Final test run + import check**

```bash
cd py && uv run pytest packages/protocol -v
cd py && uv run python -c "import clamator_protocol; print(clamator_protocol.__all__)"
```

- [ ] **Step 4: Commit**

```bash
git add py/packages/protocol/src/clamator_protocol/__init__.py py/packages/protocol/AGENTS.md
git commit -m "feat(py/protocol): re-export public API + AGENTS.md"
```

---

## Final verification (whole plan)

- [ ] **Step 1: TS test + build clean**

```bash
cd ts && pnpm --filter @clamator/protocol build
cd ts && pnpm --filter @clamator/protocol test
```

- [ ] **Step 2: Py test clean**

```bash
cd py && uv run pytest packages/protocol -v
```

- [ ] **Step 3: Cross-language sibling-consistency review**

Open both `server-core.ts` and `server_core.py` side-by-side. Confirm:
- Same error code at the same spot (e.g., -32602 fires on bad params in both).
- Same dispatch order (lookup → params validate → handler → result validate).
- Same notification handling (no reply produced).
- Same dedup invariant on registerService.

If any divergence: fix it in this commit, not later.

- [ ] **Step 4: Confirm `git status` clean**
