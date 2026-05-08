# Docs Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "what / why / when" paragraph to the top-level `README.md` and create role-typed `README.md` files for all seven publishable packages so npm and PyPI landing pages render meaningful documentation.

**Architecture:** No code or behavior changes. Three role-typed README templates (protocol, transport adapter, codegen). All quickstart code blocks are verbatim quotes of existing test, driver, or contract files in the repo — no new fixture files are introduced. Python `pyproject.toml` files are updated to point `readme` at the package-local README instead of the repo-root one.

**Tech Stack:** Markdown only. Verification commands: `pnpm -C ts build`, `pnpm -C ts -r lint`, `make test` (per-language unit tests; no interop), `uv --project py build --all`. **No `make interop` runs in this work** — the user is repairing interop infra in another session.

**Spec:** `docs/2026-05-08-improve-docs-design.md`.

---

## File Structure

Files created (new):

- `ts/packages/protocol/README.md`
- `ts/packages/over-memory/README.md`
- `ts/packages/over-redis/README.md`
- `ts/packages/codegen/README.md`
- `py/packages/protocol/README.md`
- `py/packages/over-memory/README.md`
- `py/packages/over-redis/README.md`

Files modified:

- `README.md` — insert one paragraph.
- `py/packages/protocol/pyproject.toml` — change `readme` from `"../../../README.md"` to `"README.md"`.
- `py/packages/over-memory/pyproject.toml` — same change.
- `py/packages/over-redis/pyproject.toml` — same change.

No `package.json` edits — npm picks up `README.md` next to `package.json` automatically. The four TS package `package.json` files already declare `"files": [...]` arrays that exclude `README.md`, but npm always includes `README.md`, `LICENSE`, and `package.json` regardless of the `files` array. This is verified at the end of Task 12 with `npm pack --dry-run`.

---

## Examples-policy mapping

Per the spec, every quoted code block in every README must be a verbatim quote of a working file in the repo. The mapping for this work:

| README | Quotes from |
|---|---|
| `ts/packages/protocol/README.md` (Key surface) | `ts/packages/over-memory/tests/loopback.test.ts:6-16` (contract definition) |
| `py/packages/protocol/README.md` (Key surface) | `py/packages/over-memory/tests/test_loopback.py:21-27` (contract definition) |
| `ts/packages/over-memory/README.md` (Quickstart) | `ts/packages/over-memory/tests/loopback.test.ts:1-34` |
| `py/packages/over-memory/README.md` (Quickstart) | `py/packages/over-memory/tests/test_loopback.py:1-49` |
| `ts/packages/over-redis/README.md` (Quickstart) | `ts/packages/over-redis/tests/round-trip.test.ts:1-45` |
| `py/packages/over-redis/README.md` (Quickstart) | `py/packages/over-redis/tests/test_round_trip.py:1-48` |
| `ts/packages/codegen/README.md` (CLI usage) | `tests/interop/lib/runner.ts:280-289` |
| `ts/packages/codegen/README.md` (Contract input) | `ts/packages/codegen/tests/fixtures/contracts/arith.ts:1-13` |

**No new fixture files are created in this work.** Every quote points at an existing tracked file. If a step in a later task requires content that does not exist verbatim in the source file, the engineer must NOT invent code — they must stop and report.

---

## Task 1: Top-level `README.md` — add what/why/when paragraph

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current `README.md`**

Confirm the current content matches what this plan expects. Open `README.md` and verify:

- The first paragraph after the badges is the line beginning `Polyglot TS↔Py RPC over pluggable transports.`
- The next non-empty line after that paragraph is the blockquote `> **Pre-1.0:** API stability not guaranteed. Minor versions may break.`

If either differs from the above, stop and report. Do not adapt the change blindly.

- [ ] **Step 2: Insert new paragraph**

Edit `README.md` so that **between** the existing `Polyglot TS↔Py RPC over pluggable transports.` paragraph and the `> **Pre-1.0:**` blockquote, the following paragraph appears (preserve a blank line on each side):

```markdown
clamator lets a TypeScript process and a Python process call each other's methods over JSON-RPC 2.0, with Zod as the single source of truth for the contract and Python wrappers generated from it. One contract definition keeps types and validation in lockstep across both languages by construction, and the transport is swappable — an in-process loopback for tests, Redis streams for production. Reach for clamator when a TS service and a Py service share a contract surface and the alternative is hand-rolling request/response shapes twice.
```

Do not change any other line in `README.md`.

- [ ] **Step 3: Verify**

Run:

```bash
grep -c "clamator lets a TypeScript" README.md
grep -c "Polyglot TS↔Py RPC" README.md
grep -c "Pre-1.0:" README.md
```

Expected output: each command prints `1`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): add what/why/when paragraph"
```

---

## Task 2: `ts/packages/protocol/README.md`

**Files:**
- Create: `ts/packages/protocol/README.md`

- [ ] **Step 1: Confirm the contract-definition snippet exists verbatim**

Run:

```bash
sed -n '6,16p' ts/packages/over-memory/tests/loopback.test.ts
```

Expected output (exactly):

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

If the output differs in any character, stop and report.

- [ ] **Step 2: Create the README**

Create `ts/packages/protocol/README.md` with exactly this content:

````markdown
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

(Verbatim from `ts/packages/over-memory/tests/loopback.test.ts`.)

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
````

- [ ] **Step 3: Verify**

Run:

```bash
test -f ts/packages/protocol/README.md && wc -l ts/packages/protocol/README.md
grep -c "Pure JSON-RPC 2.0 protocol primitives" ts/packages/protocol/README.md
grep -c "clamator-protocol" ts/packages/protocol/README.md
```

Expected: file exists with around 50 lines, each grep prints `1` or higher.

- [ ] **Step 4: Commit**

```bash
git add ts/packages/protocol/README.md
git commit -m "docs(ts/protocol): add package README"
```

---

## Task 3: `py/packages/protocol/README.md`

**Files:**
- Create: `py/packages/protocol/README.md`

- [ ] **Step 1: Confirm the contract-definition snippet exists verbatim**

Run:

```bash
sed -n '21,27p' py/packages/over-memory/tests/test_loopback.py
```

Expected output (exactly):

```python
arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)
```

If output differs, stop and report.

- [ ] **Step 2: Create the README**

Create `py/packages/protocol/README.md` with exactly this content:

````markdown
# clamator-protocol

Pure JSON-RPC 2.0 protocol primitives plus Pydantic-derived envelope types for clamator. **No I/O, ever** — anything that touches a network, filesystem, or process belongs in a transport adapter.

## Install

```bash
pip install clamator-protocol
```

## When you reach for this

- Defining a `Contract` (in tests, in custom tooling).
- Building a custom transport adapter that needs the wire-envelope models, the `Transport` and `Dispatcher` interfaces, or the reserved JSON-RPC error codes.

If you only consume generated clients and servers, you don't import this package directly — your transport package (`clamator-over-memory`, `clamator-over-redis`) re-exports the few symbols you need.

## Defining a contract

The Python counterpart of a Zod contract is a `Contract` with `MethodEntry` rows that bind Pydantic models to handler attribute names:

```python
arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)
```

(Verbatim from `py/packages/over-memory/tests/test_loopback.py`.)

When `clamator-protocol` is consumed alongside generated wrappers from `@clamator/codegen`, the `Contract` and `MethodEntry` values are produced by codegen — the snippet above is what direct authors of test contracts or custom tooling write.

## Key exports

- `Contract`, `MethodEntry` — declare a service's methods and notifications with Pydantic models for params and results.
- `RpcError` — the error type you raise from a handler to surface a structured JSON-RPC error to the caller.
- `ClamatorProtocolError`, `ClamatorTransportError` — distinguishable error classes for protocol-level vs. transport-level failures.
- `Transport`, `Dispatcher` — interfaces a custom transport adapter implements.

## Codegen workflow

clamator's codegen tool is published to npm (`@clamator/codegen`) regardless of which language consumes the output. Python users run the TS-side tool against their Zod contract source and consume the emitted Python wrappers from their package. See [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) for the CLI invocation.

## Links

- Sibling (TypeScript): [`@clamator/protocol`](https://www.npmjs.com/package/@clamator/protocol)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
````

- [ ] **Step 3: Verify**

```bash
test -f py/packages/protocol/README.md && wc -l py/packages/protocol/README.md
grep -c "Pure JSON-RPC 2.0 protocol primitives" py/packages/protocol/README.md
grep -c "clamator-over-memory" py/packages/protocol/README.md
```

Expected: file exists; each grep prints `1` or higher.

- [ ] **Step 4: Commit**

```bash
git add py/packages/protocol/README.md
git commit -m "docs(py/protocol): add package README"
```

---

## Task 4: `ts/packages/over-memory/README.md`

**Files:**
- Create: `ts/packages/over-memory/README.md`

- [ ] **Step 1: Confirm the quickstart snippet exists verbatim**

```bash
sed -n '1,34p' ts/packages/over-memory/tests/loopback.test.ts
```

Expected: matches the snippet embedded in Step 2 below, character for character.

If output differs, stop and report.

- [ ] **Step 2: Create the README**

Create `ts/packages/over-memory/README.md` with exactly this content:

````markdown
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
````

- [ ] **Step 3: Verify**

```bash
test -f ts/packages/over-memory/README.md && wc -l ts/packages/over-memory/README.md
grep -c "MemoryBus" ts/packages/over-memory/README.md
grep -c "@clamator/over-redis" ts/packages/over-memory/README.md
```

Expected: file exists; each grep prints `1` or higher.

- [ ] **Step 4: Commit**

```bash
git add ts/packages/over-memory/README.md
git commit -m "docs(ts/over-memory): add package README"
```

---

## Task 5: `py/packages/over-memory/README.md`

**Files:**
- Create: `py/packages/over-memory/README.md`

- [ ] **Step 1: Confirm the quickstart snippet exists verbatim**

```bash
sed -n '1,49p' py/packages/over-memory/tests/test_loopback.py
```

Expected: matches the snippet embedded in Step 2 below, character for character.

If output differs, stop and report.

- [ ] **Step 2: Create the README**

Create `py/packages/over-memory/README.md` with exactly this content:

````markdown
# clamator-over-memory

In-process loopback transport for [clamator](https://pypi.org/project/clamator-protocol/). The shared `MemoryBus` connects a `MemoryRpcServer` and `MemoryRpcClient` running in the same Python process.

## Install

```bash
pip install clamator-over-memory clamator-protocol
```

## Quickstart

```python
import asyncio
import pytest
from pydantic import BaseModel
from clamator_protocol import Contract, MethodEntry, RpcError
from clamator_over_memory import MemoryBus, MemoryRpcServer, MemoryRpcClient


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int


class PingP(BaseModel):
    tag: str | None = None


arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)


class Svc:
    def __init__(self):
        self.pinged = False
    async def add(self, p: AddP) -> AddR:
        return AddR(sum=p.a + p.b)
    async def ping(self, p: PingP) -> None:
        self.pinged = True


async def test_round_trip():
    bus = MemoryBus()
    server = MemoryRpcServer(bus=bus)
    server.register_service(arith, Svc())
    await server.start()
    client = MemoryRpcClient(bus=bus)
    await client.start()
    r = await client.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    await client.stop()
    await server.stop()
```

(Verbatim from `py/packages/over-memory/tests/test_loopback.py:1-49`.)

## Configuration

`MemoryBus()` takes no arguments. The same instance is passed to the server and the client; that's the entire wiring.

`MemoryRpcServer(bus=...)` and `MemoryRpcClient(bus=...)` accept:

- `bus` — the shared `MemoryBus`.

There are no timeouts, retries, or stream parameters — the loopback is synchronous within a single asyncio task.

## Key surface

- `MemoryBus()` — the connecting object passed to both server and client.
- `MemoryRpcServer(bus=...)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `MemoryRpcClient(bus=...)` — `start()`, `stop()`, `call(service, method, params)`, `notify(service, method, params)`.

## When to reach for this vs. `clamator-over-redis`

- `clamator-over-memory` — tests, embedded scenarios, anything single-process.
- [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/) — cross-process, cross-host, durable streams, production.

## Codegen workflow

The codegen tool is published as [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) on npm regardless of which language consumes the output. To target Python, run the TS-side tool with `--out-py <dir>` and import the emitted modules from your Python package.

## Links

- Sibling (TypeScript): [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
````

- [ ] **Step 3: Verify**

```bash
test -f py/packages/over-memory/README.md && wc -l py/packages/over-memory/README.md
grep -c "MemoryBus" py/packages/over-memory/README.md
grep -c "clamator-over-redis" py/packages/over-memory/README.md
```

Expected: file exists; each grep prints `1` or higher.

- [ ] **Step 4: Commit**

```bash
git add py/packages/over-memory/README.md
git commit -m "docs(py/over-memory): add package README"
```

---

## Task 6: `ts/packages/over-redis/README.md`

**Files:**
- Create: `ts/packages/over-redis/README.md`

- [ ] **Step 1: Confirm the quickstart snippet exists verbatim**

```bash
sed -n '1,45p' ts/packages/over-redis/tests/round-trip.test.ts
```

Expected: matches the snippet embedded in Step 2 below, character for character.

If output differs, stop and report.

- [ ] **Step 2: Create the README**

Create `ts/packages/over-redis/README.md` with exactly this content:

````markdown
# @clamator/over-redis

Redis-streams transport for [clamator](https://www.npmjs.com/package/@clamator/protocol). Implements the `Transport` interface from `@clamator/protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a TS service and a Py service, or two TS services on different hosts.

## Install

```bash
npm install @clamator/over-redis @clamator/protocol ioredis
```

## Quickstart

```typescript
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification, RpcError } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;

const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  ping: defineNotification({ params: z.object({}) }),
});

describe.skipIf(!REDIS_URL)('redis round-trip', () => {
  let prefix: string;

  beforeAll(() => {
    if (!REDIS_URL) return;
  });

  afterEach(async () => {
    if (!REDIS_URL) return;
    const r = new IORedis(REDIS_URL!);
    const keys = await r.keys(`${prefix}:*`);
    if (keys.length) await r.del(...keys);
    await r.quit();
  });

  it('round-trips a successful call', async () => {
    prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    server.registerService(arith, { add: async ({ a, b }) => ({ sum: a + b }), ping: async () => {} });
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    const r = await client.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop(); await server.stop();
    await sredis.quit(); await credis.quit();
  });
```

(Verbatim from `ts/packages/over-redis/tests/round-trip.test.ts:1-45`. In your own code, replace the relative `'../src/index.js'` import with `'@clamator/over-redis'`.)

## Configuration

`RedisRpcServer` constructor options:

- `redis` — an `ioredis` `IORedis` instance, dedicated to this server.
- `keyPrefix` — string prefix for the request and response stream keys (e.g., `"my-service"`). Both sides must agree.
- `instanceId` (optional) — unique id of this server instance; defaults to a random suffix. Used for redelivery / claim semantics.
- `consumerClaimIdleMs` (optional) — milliseconds before a pending message becomes eligible for claim by another consumer; tune for your workload.

`RedisRpcClient` constructor options:

- `redis` — an `ioredis` `IORedis` instance, dedicated to this client.
- `keyPrefix` — same prefix the server uses.
- `defaultTimeoutMs` (optional) — default timeout per call when the caller does not specify one.

## Key surface

- `RedisRpcServer({ redis, keyPrefix, instanceId?, consumerClaimIdleMs? })` — `registerService(contract, handlers)`, `start()`, `stop()`.
- `RedisRpcClient({ redis, keyPrefix, defaultTimeoutMs? })` — `start()`, `stop()`, `call<P, R>(service, method, params, opts?)`, `notify(service, method, params)`.

## When to reach for this vs. `@clamator/over-memory`

- [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory) — tests, embedded scenarios, anything single-process.
- `@clamator/over-redis` — cross-process, cross-host, durable streams, production.

## Links

- Sibling (Python): [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
````

- [ ] **Step 3: Verify**

```bash
test -f ts/packages/over-redis/README.md && wc -l ts/packages/over-redis/README.md
grep -c "RedisRpcServer" ts/packages/over-redis/README.md
grep -c "@clamator/over-memory" ts/packages/over-redis/README.md
```

Expected: file exists; each grep prints `1` or higher.

- [ ] **Step 4: Commit**

```bash
git add ts/packages/over-redis/README.md
git commit -m "docs(ts/over-redis): add package README"
```

---

## Task 7: `py/packages/over-redis/README.md`

**Files:**
- Create: `py/packages/over-redis/README.md`

- [ ] **Step 1: Confirm the quickstart snippet exists verbatim**

```bash
sed -n '1,48p' py/packages/over-redis/tests/test_round_trip.py
```

Expected: matches the snippet embedded in Step 2 below, character for character.

If output differs, stop and report.

- [ ] **Step 2: Create the README**

Create `py/packages/over-redis/README.md` with exactly this content:

````markdown
# clamator-over-redis

Redis-streams transport for [clamator](https://pypi.org/project/clamator-protocol/). Implements the `Transport` interface from `clamator-protocol` so JSON-RPC traffic flows over Redis streams between processes — typically a Py service and a TS service, or two Py services on different hosts.

## Install

```bash
pip install clamator-over-redis clamator-protocol redis
```

## Quickstart

```python
import pytest
from pydantic import BaseModel
from redis.asyncio import Redis
from clamator_protocol import Contract, MethodEntry, RpcError
from clamator_over_redis import RedisRpcServer, RedisRpcClient


class AddP(BaseModel):
    a: int
    b: int


class AddR(BaseModel):
    sum: int


class PingP(BaseModel):
    pass


arith = Contract(
    service="arith",
    methods={
        "add": MethodEntry(params_model=AddP, result_model=AddR, handler_attr="add"),
        "ping": MethodEntry(params_model=PingP, result_model=None, handler_attr="ping"),
    },
)


class Svc:
    async def add(self, p): return AddR(sum=p.a + p.b)
    async def ping(self, p): pass


async def test_round_trip(redis_url, key_prefix, cleanup):
    rs = Redis.from_url(redis_url)
    rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith, Svc())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    r = await client.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    await client.stop()
    await server.stop()
    await rs.aclose()
    await rc.aclose()
```

(Verbatim from `py/packages/over-redis/tests/test_round_trip.py:1-48`.)

## Configuration

`RedisRpcServer` constructor arguments:

- `redis` — a `redis.asyncio.Redis` instance, dedicated to this server.
- `key_prefix` — string prefix for the request and response stream keys. Both sides must agree.
- `instance_id` (optional) — unique id of this server instance; defaults to a random suffix.
- `consumer_claim_idle_ms` (optional) — milliseconds before a pending message becomes eligible for claim by another consumer.

`RedisRpcClient` constructor arguments:

- `redis` — a `redis.asyncio.Redis` instance, dedicated to this client.
- `key_prefix` — same prefix the server uses.
- `default_timeout_ms` (optional) — default timeout per call when the caller does not specify one.

## Key surface

- `RedisRpcServer(redis, key_prefix, instance_id=None, consumer_claim_idle_ms=None)` — `register_service(contract, handler_obj)`, `start()`, `stop()`.
- `RedisRpcClient(redis, key_prefix, default_timeout_ms=None)` — `start()`, `stop()`, `call(service, method, params, *, timeout_ms=None)`, `notify(service, method, params)`.

## When to reach for this vs. `clamator-over-memory`

- [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/) — tests, embedded scenarios, anything single-process.
- `clamator-over-redis` — cross-process, cross-host, durable streams, production.

## Codegen workflow

The codegen tool is published as [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) on npm regardless of which language consumes the output. Run it from the TS side with `--out-py <dir>` and import the emitted modules from your Python package.

## Links

- Sibling (TypeScript): [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis)
- Codegen: [`@clamator/codegen`](https://www.npmjs.com/package/@clamator/codegen) (run from TS side; consume the generated Python output)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
````

- [ ] **Step 3: Verify**

```bash
test -f py/packages/over-redis/README.md && wc -l py/packages/over-redis/README.md
grep -c "RedisRpcServer" py/packages/over-redis/README.md
grep -c "clamator-over-memory" py/packages/over-redis/README.md
```

Expected: file exists; each grep prints `1` or higher.

- [ ] **Step 4: Commit**

```bash
git add py/packages/over-redis/README.md
git commit -m "docs(py/over-redis): add package README"
```

---

## Task 8: `ts/packages/codegen/README.md`

**Files:**
- Create: `ts/packages/codegen/README.md`

- [ ] **Step 1: Confirm the CLI-invocation snippet exists verbatim**

```bash
sed -n '280,289p' tests/interop/lib/runner.ts
```

Expected output (exactly):

```typescript
  const args = [
    codegenCli,
    '--src', contractsSrc,
    '--out-ts', outTs,
    '--out-py', outPy,
    '--manifest', manifestPath,
    '--ts-contract-import', '../../contracts/index.js',
  ];
```

If output differs, stop and report.

- [ ] **Step 2: Confirm the contract-input snippet exists verbatim**

```bash
sed -n '1,13p' ts/packages/codegen/tests/fixtures/contracts/arith.ts
```

Expected output (exactly):

```typescript
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number().int(), b: z.number().int() }),
    result: z.object({ sum: z.number().int() }),
  }),
  divide: defineMethod({
    params: z.object({ a: z.number().int(), b: z.number().int() }),
    result: z.object({ q: z.number(), r: z.number().int() }),
  }),
});
```

If output differs, stop and report.

- [ ] **Step 3: Create the README**

Create `ts/packages/codegen/README.md` with exactly this content:

````markdown
# @clamator/codegen

CLI plus library that turns a Zod contract module into TypeScript and Python client/server wrappers for clamator.

## Install

```bash
npm install -D @clamator/codegen
```

## CLI usage

```bash
npx @clamator/codegen \
  --src <contracts-dir> \
  --out-ts <ts-output-dir> \
  --out-py <py-output-dir> \
  --manifest <manifest.json> \
  --ts-contract-import <import-path>
```

The interop test runner invokes the CLI like this:

```typescript
const args = [
  codegenCli,
  '--src', contractsSrc,
  '--out-ts', outTs,
  '--out-py', outPy,
  '--manifest', manifestPath,
  '--ts-contract-import', '../../contracts/index.js',
];
```

(Verbatim from `tests/interop/lib/runner.ts`. `codegenCli` is the path to `dist/cli.js` of this package.)

Pass `--out-py` only when you want Python output. The Python emitter requires the [`datamodel-code-generator`](https://pypi.org/project/datamodel-code-generator/) Python tool on `PATH`.

## Contract input shape

A contract module exports one or more contracts via `defineContract` from `@clamator/protocol`:

```typescript
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number().int(), b: z.number().int() }),
    result: z.object({ sum: z.number().int() }),
  }),
  divide: defineMethod({
    params: z.object({ a: z.number().int(), b: z.number().int() }),
    result: z.object({ q: z.number(), r: z.number().int() }),
  }),
});
```

(Verbatim from `ts/packages/codegen/tests/fixtures/contracts/arith.ts`.)

The codegen scans every `.ts` file in `--src` for `defineContract` calls and emits one wrapper file per contract.

## Output layout

Given a `--src` directory containing contract modules and an `--out-ts <dir>` and `--out-py <dir>`:

- `<out-ts>/<service>.ts` — typed client and server wrappers for each contract; importable from a TS package.
- `<out-py>/<service>.py` — typed client and server wrappers for each contract; importable from a Python package.
- `<manifest>.json` — content-addressed schema hashes per method/notification, used by interop tests to detect drift.

The `--ts-contract-import` flag controls the import path written into the emitted TS wrappers — supply the path that resolves to your contract module from the directory the wrappers will be imported from.

## Links

- Protocol packages: [`@clamator/protocol`](https://www.npmjs.com/package/@clamator/protocol), [`clamator-protocol`](https://pypi.org/project/clamator-protocol/)
- Transports:
  - [`@clamator/over-memory`](https://www.npmjs.com/package/@clamator/over-memory)
  - [`@clamator/over-redis`](https://www.npmjs.com/package/@clamator/over-redis)
  - [`clamator-over-memory`](https://pypi.org/project/clamator-over-memory/)
  - [`clamator-over-redis`](https://pypi.org/project/clamator-over-redis/)
- Design spec: [`docs/2026-05-07-clamator-design.md`](../../../docs/2026-05-07-clamator-design.md)
- Agent rules: [`AGENTS.md`](./AGENTS.md)
````

- [ ] **Step 4: Verify**

```bash
test -f ts/packages/codegen/README.md && wc -l ts/packages/codegen/README.md
grep -c "Zod contract module" ts/packages/codegen/README.md
grep -c "datamodel-code-generator" ts/packages/codegen/README.md
```

Expected: file exists; each grep prints `1` or higher.

- [ ] **Step 5: Commit**

```bash
git add ts/packages/codegen/README.md
git commit -m "docs(ts/codegen): add package README"
```

---

## Task 9: Point Python `pyproject.toml` `readme` fields at the per-package README

**Files:**
- Modify: `py/packages/protocol/pyproject.toml`
- Modify: `py/packages/over-memory/pyproject.toml`
- Modify: `py/packages/over-redis/pyproject.toml`

Currently each Py package's `pyproject.toml` has `readme = "../../../README.md"`, which makes PyPI render the top-level README on every Py package's landing page. After this change, PyPI renders the package-local README created in Tasks 3, 5, 7.

- [ ] **Step 1: Confirm current value**

```bash
grep -n '^readme' py/packages/protocol/pyproject.toml py/packages/over-memory/pyproject.toml py/packages/over-redis/pyproject.toml
```

Expected: each line shows `readme = "../../../README.md"`. If any line differs, stop and report.

- [ ] **Step 2: Update `py/packages/protocol/pyproject.toml`**

Replace the line:

```toml
readme = "../../../README.md"
```

with:

```toml
readme = "README.md"
```

Use `Edit` with `old_string="readme = \"../../../README.md\""` and `new_string="readme = \"README.md\""`.

- [ ] **Step 3: Update `py/packages/over-memory/pyproject.toml`**

Same edit as Step 2 in this file.

- [ ] **Step 4: Update `py/packages/over-redis/pyproject.toml`**

Same edit as Step 2 in this file.

- [ ] **Step 5: Verify**

```bash
grep -n '^readme' py/packages/protocol/pyproject.toml py/packages/over-memory/pyproject.toml py/packages/over-redis/pyproject.toml
```

Expected: each line now shows `readme = "README.md"`.

- [ ] **Step 6: Confirm wheel builds still succeed**

```bash
cd py && uv build --all
```

Expected: three wheels produced under `py/packages/*/dist/*.whl`. No errors.

Inspect one wheel to confirm the per-package README is bundled:

```bash
unzip -l py/packages/protocol/dist/clamator_protocol-*.whl | grep -i readme
```

Expected: a line listing `clamator_protocol-*.dist-info/README.md` (hatch surfaces the `readme` file under the package's `dist-info` directory). If `README.md` is not listed, stop and report — likely an interaction with `[tool.hatch.build.force-include]` that needs investigation rather than a blind retry.

Clean the dist artifacts:

```bash
cd py && find packages -type d -name dist -exec rm -rf {} + 2>/dev/null || true
```

- [ ] **Step 7: Commit**

```bash
git add py/packages/protocol/pyproject.toml py/packages/over-memory/pyproject.toml py/packages/over-redis/pyproject.toml
git commit -m "build(py): point per-package readme at local README.md"
```

---

## Task 10: Verify TS package builds and lint still pass

The four TS packages each declare `"files": ["dist", "LICENSE"]` in their `package.json`. npm always includes `README.md` regardless of the `files` array, but verify that explicitly with `npm pack --dry-run`.

- [ ] **Step 1: Build TS workspace**

```bash
pnpm -C ts -r build
```

Expected: builds succeed for all four packages.

- [ ] **Step 2: Lint TS workspace**

```bash
pnpm -C ts -r lint
```

Expected: all packages lint clean (no diagnostics).

- [ ] **Step 3: Confirm npm tarball includes README for each TS package**

For each package, run `npm pack --dry-run` from the package directory and check that `README.md` appears in the included file list:

```bash
for pkg in ts/packages/{protocol,over-memory,over-redis,codegen}; do
  echo "==> $pkg"
  (cd "$pkg" && npm pack --dry-run 2>&1) | grep -E "README\.md|files:"
done
```

Expected: every package's output contains a `README.md` line. If any package's output does not list `README.md`, stop and report — either the file was not committed, or that package's `files` array is overriding default-inclusion behavior in an unexpected way.

- [ ] **Step 4: No commit**

This task verifies state; it does not change files.

---

## Task 11: Run per-language unit tests

- [ ] **Step 1: TS unit tests**

```bash
make test
```

This runs `pnpm -r test` and `uv run pytest`. **`make test` does not run interop** — confirm by reading the `test` target in `Makefile` if uncertain. Running `make interop` is forbidden in this work.

Expected: TS tests pass and Python tests pass. The Py over-redis tests skip when `REDIS_URL` is not set, which is the expected default.

- [ ] **Step 2: No commit**

Verification only.

---

## Task 12: Final relative-link check

- [ ] **Step 1: Confirm every relative `docs/` link resolves**

Each per-package README links to `../../../docs/2026-05-07-clamator-design.md`. From `ts/packages/<pkg>/` and `py/packages/<pkg>/` this resolves to `docs/2026-05-07-clamator-design.md` at the repo root. Confirm:

```bash
for f in ts/packages/*/README.md py/packages/*/README.md; do
  echo "==> $f"
  grep -oE 'docs/[A-Za-z0-9_.-]+\.md' "$f" | while read rel; do
    target="${rel}"
    test -f "$target" && echo "  OK $rel" || echo "  MISSING $rel"
  done
done
```

Expected: every line is `OK`. Any `MISSING` means a relative link is broken — fix and re-run before continuing.

- [ ] **Step 2: Confirm every `AGENTS.md` link resolves**

```bash
for f in ts/packages/*/README.md py/packages/*/README.md; do
  d=$(dirname "$f")
  test -f "$d/AGENTS.md" && echo "OK $f" || echo "MISSING $d/AGENTS.md"
done
```

Expected: every line is `OK`.

- [ ] **Step 3: No commit**

Verification only. If any link fixes were needed, commit those as part of the relevant earlier task and re-run this check.

---

## Self-review

After all tasks complete, the engineer should re-read the spec (`docs/2026-05-08-improve-docs-design.md`) and confirm:

- Top-level README has the new what/why/when paragraph (Task 1).
- All seven publishable packages have a `README.md` (Tasks 2–8).
- All Py manifests point `readme` at the local file (Task 9).
- TS builds and TS lint pass (Task 10).
- Per-language unit tests pass; interop was not invoked (Task 11).
- All relative links resolve (Task 12).
- No new fixture files were created — every quoted code block is a verbatim quote of an existing tracked file.

If any of these is not true, stop before declaring the work done.

## Out of scope (do not do these)

- No `make interop`, no `docker compose`, no redis commands. The user is repairing interop infra in another session.
- No edits to any `AGENTS.md` file.
- No edits to existing design or plan documents (only this plan and the new READMEs are added/changed).
- No `CHANGELOG.md` entries.
- No new fixture files under `tests/interop/`, `examples/`, or anywhere else.
