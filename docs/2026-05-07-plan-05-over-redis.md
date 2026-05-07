# Redis Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@clamator/over-redis` (TS) and `clamator-over-redis` (Py). Redis-streams transport supporting worker-pool consumer groups, per-instance reply streams, crash recovery via `XCLAIM`, and graceful shutdown.

**Architecture:** Two facade classes per language: `RedisRpcServer` (composes `RpcServerCore` with a server-side `RedisTransport`) and `RedisRpcClient` (composes `RpcClientCore` with a client-side `RedisTransport`). Server: per-service consumer group on `<keyPrefix>:cmds:<service>`, blocking `XREADGROUP`, `XACK` after handler returns, periodic `XPENDING`/`XCLAIM` for crash recovery. Client: per-instance reply stream `<keyPrefix>:replies:<instanceId>` (`MAXLEN ~ N`), blocking `XREAD`, in-memory pending-deferred map, per-call timeout. UUID JSON-RPC `id`s correlate replies. Single `envelope` field with serialized JSON.

**Tech Stack:** TS — `ioredis`, vitest, depends on `@clamator/protocol`. Py — `redis-py` 5+ (async client), pytest, depends on `clamator-protocol`. Tests use a real redis via `tests/interop/docker-compose.yml` started on demand (per-language tests can use any local redis on `REDIS_URL`).

**Depends on:** plan 02 (protocol). Independent of plans 03 + 04.

---

## File Structure

### TS package (`ts/packages/over-redis/`)

- Create: `ts/packages/over-redis/package.json`
- Create: `ts/packages/over-redis/tsconfig.json`
- Create: `ts/packages/over-redis/AGENTS.md`
- Create: `ts/packages/over-redis/LICENSE` — symlink
- Create: `ts/packages/over-redis/src/index.ts`
- Create: `ts/packages/over-redis/src/keys.ts` — key/stream naming helpers
- Create: `ts/packages/over-redis/src/server-transport.ts` — server-side `Transport`
- Create: `ts/packages/over-redis/src/client-transport.ts` — client-side `Transport`
- Create: `ts/packages/over-redis/src/server.ts` — `RedisRpcServer` facade
- Create: `ts/packages/over-redis/src/client.ts` — `RedisRpcClient` facade
- Create: `ts/packages/over-redis/src/backoff.ts` — exponential-backoff helper
- Create: `ts/packages/over-redis/tests/keys.test.ts`
- Create: `ts/packages/over-redis/tests/round-trip.test.ts` (real-redis)
- Create: `ts/packages/over-redis/tests/timeout.test.ts` (real-redis)
- Create: `ts/packages/over-redis/tests/worker-pool.test.ts` (real-redis)
- Create: `ts/packages/over-redis/tests/crash-recovery.test.ts` (real-redis)

### Py package (`py/packages/over-redis/`)

- Create: `py/packages/over-redis/pyproject.toml`
- Create: `py/packages/over-redis/AGENTS.md`
- Create: `py/packages/over-redis/LICENSE` — symlink
- Create: `py/packages/over-redis/src/clamator_over_redis/__init__.py`
- Create: `py/packages/over-redis/src/clamator_over_redis/keys.py`
- Create: `py/packages/over-redis/src/clamator_over_redis/server_transport.py`
- Create: `py/packages/over-redis/src/clamator_over_redis/client_transport.py`
- Create: `py/packages/over-redis/src/clamator_over_redis/server.py`
- Create: `py/packages/over-redis/src/clamator_over_redis/client.py`
- Create: `py/packages/over-redis/src/clamator_over_redis/backoff.py`
- Create: `py/packages/over-redis/tests/test_keys.py`
- Create: `py/packages/over-redis/tests/test_round_trip.py`
- Create: `py/packages/over-redis/tests/test_timeout.py`
- Create: `py/packages/over-redis/tests/test_worker_pool.py`
- Create: `py/packages/over-redis/tests/test_crash_recovery.py`
- Create: `py/packages/over-redis/tests/conftest.py` — fixtures + redis-skip guard

---

## Conventions

- All real-redis tests start with: `if (!process.env.REDIS_URL) test.skip()` (TS) / `pytest.skip` via fixture (Py). CI sets `REDIS_URL` before running. Locally: `docker compose -f tests/interop/docker-compose.yml up -d redis && export REDIS_URL=redis://localhost:6379`.
- Each test uses a unique `keyPrefix` to isolate state; the test cleans up via `KEYS <prefix>:*` + `DEL` in `afterEach`.
- Default timeouts in tests are short (≤500ms) to keep the suite fast.

---

## Task 1: TS scaffold

**Files:**
- Create: `ts/packages/over-redis/package.json`
- Create: `ts/packages/over-redis/tsconfig.json`
- Create: `ts/packages/over-redis/src/index.ts`
- Create: `ts/packages/over-redis/LICENSE`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@clamator/over-redis",
  "version": "0.1.0",
  "description": "Redis-streams transport for clamator (pre-1.0).",
  "license": "Apache-2.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist", "LICENSE"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "clean": "rm -rf dist .tsbuildinfo",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@clamator/protocol": "0.1.0",
    "ioredis": "^5.4.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`** (extend base; same shape as other packages)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "src", "outDir": "dist", "tsBuildInfoFile": ".tsbuildinfo" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Symlink LICENSE + write empty `src/index.ts`**

```bash
ln -s ../../../LICENSE ts/packages/over-redis/LICENSE
```

```typescript
export {};
```

- [ ] **Step 4: Install + build**

```bash
cd ts && pnpm install
pnpm --filter @clamator/over-redis build
```

- [ ] **Step 5: Commit**

```bash
git add ts/packages/over-redis/package.json ts/packages/over-redis/tsconfig.json ts/packages/over-redis/src/index.ts ts/packages/over-redis/LICENSE ts/pnpm-lock.yaml
git commit -m "feat(ts/over-redis): scaffold package"
```

---

## Task 2: TS keys + backoff helpers

**Files:**
- Create: `ts/packages/over-redis/src/keys.ts`
- Create: `ts/packages/over-redis/src/backoff.ts`
- Create: `ts/packages/over-redis/tests/keys.test.ts`

- [ ] **Step 1: Write failing test `tests/keys.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { commandStream, replyStream, consumerGroupName, consumerName } from '../src/keys.js';

describe('redis key naming', () => {
  it('commandStream', () => {
    expect(commandStream('app', 'engine')).toBe('app:cmds:engine');
  });
  it('replyStream', () => {
    expect(replyStream('app', 'inst-1')).toBe('app:replies:inst-1');
  });
  it('consumerGroupName equals service', () => {
    expect(consumerGroupName('engine')).toBe('engine');
  });
  it('consumerName combines service and instance', () => {
    expect(consumerName('engine', 'inst-1')).toBe('engine:inst-1');
  });
});
```

- [ ] **Step 2: Run — fails**

- [ ] **Step 3: Write `src/keys.ts`**

```typescript
export function commandStream(prefix: string, service: string): string {
  return `${prefix}:cmds:${service}`;
}

export function replyStream(prefix: string, instanceId: string): string {
  return `${prefix}:replies:${instanceId}`;
}

export function consumerGroupName(service: string): string {
  return service;
}

export function consumerName(service: string, instanceId: string): string {
  return `${service}:${instanceId}`;
}
```

- [ ] **Step 4: Write `src/backoff.ts`**

```typescript
export interface BackoffOptions {
  initialMs: number;
  maxMs: number;
  factor?: number;
  jitter?: boolean;
}

export function expBackoff(opts: BackoffOptions): () => number {
  const factor = opts.factor ?? 2;
  let current = opts.initialMs;
  return () => {
    const value = current;
    current = Math.min(opts.maxMs, current * factor);
    if (opts.jitter ?? true) return Math.floor(value * (0.5 + Math.random() * 0.5));
    return value;
  };
}

export function resetable(opts: BackoffOptions): { next: () => number; reset: () => void } {
  let next = expBackoff(opts);
  return {
    next: () => next(),
    reset: () => { next = expBackoff(opts); },
  };
}
```

- [ ] **Step 5: Run — passes**

- [ ] **Step 6: Commit**

```bash
git add ts/packages/over-redis/src/keys.ts ts/packages/over-redis/src/backoff.ts ts/packages/over-redis/tests/keys.test.ts
git commit -m "feat(ts/over-redis): key naming + backoff helpers"
```

---

## Task 3: TS client-side transport

**Files:**
- Create: `ts/packages/over-redis/src/client-transport.ts`

- [ ] **Step 1: Write `src/client-transport.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  parseEnvelope, EnvelopeKind, ClamatorTransportError,
  type Transport, type SendOptions, type Dispatcher,
} from '@clamator/protocol';
import { commandStream, replyStream } from './keys.js';

export interface ClientTransportOptions {
  redis: Redis;
  keyPrefix: string;
  instanceId?: string;
  replyStreamMaxLen?: number;
  defaultTimeoutMs?: number;
}

interface Pending {
  resolve: (env: Record<string, unknown>) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ClientRedisTransport implements Transport {
  readonly instanceId: string;
  private readonly replyStream: string;
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private pending = new Map<string, Pending>();
  private replyLoop: Promise<void> | null = null;
  private replyLoopAbort = false;

  constructor(private readonly opts: ClientTransportOptions) {
    this.instanceId = opts.instanceId ?? randomUUID();
    this.replyStream = replyStream(opts.keyPrefix, this.instanceId);
  }

  async registerService(_name: string, _dispatch: Dispatcher): Promise<void> {
    throw new Error('client transport cannot host services');
  }

  async send(env: Record<string, unknown>, sendOpts: SendOptions): Promise<Record<string, unknown>> {
    if (this.state !== 'started')
      throw new ClamatorTransportError(`transport not started (state=${this.state})`);
    const parsed = parseEnvelope(env);
    if (parsed.kind !== EnvelopeKind.Request)
      throw new ClamatorTransportError('send requires a request envelope');
    const idStr = String(parsed.id);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(idStr);
        reject(new ClamatorTransportError('call timeout'));
      }, sendOpts.timeoutMs);
      this.pending.set(idStr, { resolve, reject, timer });
      void this.opts.redis.xadd(
        commandStream(this.opts.keyPrefix, parsed.service),
        '*',
        'type', 'rpc',
        'envelope', JSON.stringify(env),
        'reply-to', this.replyStream,
      ).catch(err => {
        const p = this.pending.get(idStr);
        if (!p) return;
        this.pending.delete(idStr);
        clearTimeout(p.timer);
        p.reject(new ClamatorTransportError('xadd failed', err));
      });
    });
  }

  async notify(env: Record<string, unknown>): Promise<void> {
    if (this.state !== 'started')
      throw new ClamatorTransportError(`transport not started (state=${this.state})`);
    const parsed = parseEnvelope(env);
    if (parsed.kind !== EnvelopeKind.Notification)
      throw new ClamatorTransportError('notify requires a notification envelope');
    await this.opts.redis.xadd(
      commandStream(this.opts.keyPrefix, parsed.service),
      '*',
      'type', 'rpc',
      'envelope', JSON.stringify(env),
      // no reply-to
    );
  }

  async start(): Promise<void> {
    if (this.state === 'stopped') throw new ClamatorTransportError('transport has been stopped');
    if (this.state === 'started') return;
    this.state = 'started';
    this.replyLoopAbort = false;
    this.replyLoop = this.runReplyLoop().catch(err => {
      // surface fatal loop errors
      console.error('[clamator/over-redis] reply loop fatal:', err);
    });
  }

  async stop(): Promise<void> {
    if (this.state !== 'started') { this.state = 'stopped'; return; }
    this.replyLoopAbort = true;
    try { await this.replyLoop; } catch { /* ignore */ }
    for (const [id, p] of this.pending.entries()) {
      clearTimeout(p.timer);
      p.reject(new ClamatorTransportError('transport stopped'));
      this.pending.delete(id);
    }
    try { await this.opts.redis.del(this.replyStream); } catch { /* best effort */ }
    this.state = 'stopped';
  }

  private async runReplyLoop(): Promise<void> {
    let lastId = '$';
    while (!this.replyLoopAbort) {
      try {
        const result = await this.opts.redis.xread('BLOCK', 1000, 'STREAMS', this.replyStream, lastId);
        if (!result) continue;
        for (const [, entries] of result as [string, [string, string[]][]][]) {
          for (const [entryId, fields] of entries) {
            lastId = entryId;
            const idx = fields.indexOf('envelope');
            if (idx < 0) continue;
            const json = fields[idx + 1];
            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(json) as Record<string, unknown>; }
            catch { continue; }
            const replyId = String(parsed.id);
            const pending = this.pending.get(replyId);
            if (!pending) continue;  // late or stranger reply
            this.pending.delete(replyId);
            clearTimeout(pending.timer);
            pending.resolve(parsed);
          }
        }
      } catch (err) {
        if (this.replyLoopAbort) return;
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }
}
```

- [ ] **Step 2: Build to verify types**

```bash
pnpm --filter @clamator/over-redis build
```

- [ ] **Step 3: Commit**

```bash
git add ts/packages/over-redis/src/client-transport.ts
git commit -m "feat(ts/over-redis): client-side ClientRedisTransport"
```

---

## Task 4: TS server-side transport

**Files:**
- Create: `ts/packages/over-redis/src/server-transport.ts`

- [ ] **Step 1: Write `src/server-transport.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  parseEnvelope, EnvelopeKind, ClamatorTransportError,
  type Transport, type Dispatcher, type SendOptions,
} from '@clamator/protocol';
import { commandStream, consumerGroupName, consumerName } from './keys.js';

export interface ServerTransportOptions {
  redis: Redis;
  keyPrefix: string;
  instanceId?: string;
  consumerClaimIdleMs?: number;
  defaultHandlerTimeoutMs?: number;
  shutdownGraceMs?: number;
}

export class ServerRedisTransport implements Transport {
  readonly instanceId: string;
  private dispatchers = new Map<string, Dispatcher>();
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private loops: Promise<void>[] = [];
  private abort = false;

  constructor(private readonly opts: ServerTransportOptions) {
    this.instanceId = opts.instanceId ?? randomUUID();
  }

  async registerService(name: string, dispatch: Dispatcher): Promise<void> {
    this.dispatchers.set(name, dispatch);
  }

  async send(): Promise<Record<string, unknown>> {
    throw new Error('server transport cannot send requests');
  }

  async notify(): Promise<void> {
    throw new Error('server transport cannot send notifications');
  }

  async start(): Promise<void> {
    if (this.state === 'stopped') throw new ClamatorTransportError('transport has been stopped');
    if (this.state === 'started') return;
    this.state = 'started';
    this.abort = false;
    for (const service of this.dispatchers.keys()) {
      const stream = commandStream(this.opts.keyPrefix, service);
      const group = consumerGroupName(service);
      try {
        await this.opts.redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes('BUSYGROUP')) throw e;
      }
      this.loops.push(this.runConsumerLoop(service));
      this.loops.push(this.runReclaimLoop(service));
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'started') { this.state = 'stopped'; return; }
    this.abort = true;
    const grace = this.opts.shutdownGraceMs ?? 5000;
    await Promise.race([
      Promise.allSettled(this.loops),
      new Promise(r => setTimeout(r, grace)),
    ]);
    this.state = 'stopped';
  }

  private async runConsumerLoop(service: string): Promise<void> {
    const stream = commandStream(this.opts.keyPrefix, service);
    const group = consumerGroupName(service);
    const consumer = consumerName(service, this.instanceId);
    while (!this.abort) {
      try {
        const result = await this.opts.redis.xreadgroup(
          'GROUP', group, consumer, 'BLOCK', 1000, 'COUNT', 16,
          'STREAMS', stream, '>',
        );
        if (!result) continue;
        for (const [, entries] of result as [string, [string, string[]][]][]) {
          for (const [entryId, fields] of entries) {
            await this.handleEntry(service, stream, group, entryId, fields);
          }
        }
      } catch (err) {
        if (this.abort) return;
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  private async runReclaimLoop(service: string): Promise<void> {
    const stream = commandStream(this.opts.keyPrefix, service);
    const group = consumerGroupName(service);
    const consumer = consumerName(service, this.instanceId);
    const idleThreshold = this.opts.consumerClaimIdleMs ?? 60_000;
    while (!this.abort) {
      try {
        await new Promise(r => setTimeout(r, Math.max(1000, idleThreshold / 4)));
        if (this.abort) return;
        const claimed = await this.opts.redis.xautoclaim(
          stream, group, consumer, idleThreshold, '0', 'COUNT', 32,
        ) as [string, [string, string[]][], string[]];
        const entries = claimed[1];
        if (!entries || entries.length === 0) continue;
        for (const [entryId, fields] of entries) {
          await this.handleEntry(service, stream, group, entryId, fields);
        }
      } catch (err) {
        if (this.abort) return;
      }
    }
  }

  private async handleEntry(
    service: string, stream: string, group: string,
    entryId: string, fields: string[],
  ): Promise<void> {
    const envIdx = fields.indexOf('envelope');
    if (envIdx < 0) {
      await this.opts.redis.xack(stream, group, entryId);
      return;
    }
    const replyToIdx = fields.indexOf('reply-to');
    const replyTo = replyToIdx >= 0 ? fields[replyToIdx + 1] : null;
    let envObj: Record<string, unknown>;
    try { envObj = JSON.parse(fields[envIdx + 1]) as Record<string, unknown>; }
    catch { await this.opts.redis.xack(stream, group, entryId); return; }
    let parsed;
    try { parsed = parseEnvelope(envObj); } catch { await this.opts.redis.xack(stream, group, entryId); return; }

    const dispatcher = this.dispatchers.get(service);
    if (!dispatcher) { await this.opts.redis.xack(stream, group, entryId); return; }

    const reply = await dispatcher(parsed);
    if (replyTo && reply) {
      await this.opts.redis.xadd(
        replyTo, 'MAXLEN', '~', String(this.opts.defaultHandlerTimeoutMs ?? 1024), '*',
        'type', 'rpc', 'envelope', JSON.stringify(reply),
      );
    }
    await this.opts.redis.xack(stream, group, entryId);
  }
}
```

- [ ] **Step 2: Build**

```bash
pnpm --filter @clamator/over-redis build
```

- [ ] **Step 3: Commit**

```bash
git add ts/packages/over-redis/src/server-transport.ts
git commit -m "feat(ts/over-redis): server-side ServerRedisTransport with XCLAIM recovery"
```

---

## Task 5: TS facades

**Files:**
- Create: `ts/packages/over-redis/src/server.ts`
- Create: `ts/packages/over-redis/src/client.ts`
- Modify: `ts/packages/over-redis/src/index.ts`

- [ ] **Step 1: Write `src/server.ts`**

```typescript
import { RpcServerCore } from '@clamator/protocol';
import { ServerRedisTransport, type ServerTransportOptions } from './server-transport.js';

export interface RedisRpcServerOptions extends ServerTransportOptions {}

export class RedisRpcServer extends RpcServerCore {
  constructor(opts: RedisRpcServerOptions) {
    super(new ServerRedisTransport(opts));
  }
}
```

- [ ] **Step 2: Write `src/client.ts`**

```typescript
import { RpcClientCore } from '@clamator/protocol';
import { ClientRedisTransport, type ClientTransportOptions } from './client-transport.js';

export interface RedisRpcClientOptions extends ClientTransportOptions {}

export class RedisRpcClient extends RpcClientCore {
  constructor(opts: RedisRpcClientOptions) {
    super(
      new ClientRedisTransport(opts),
      { defaultTimeoutMs: opts.defaultTimeoutMs ?? 30_000 },
    );
  }
}
```

- [ ] **Step 3: Update `src/index.ts`**

```typescript
export { RedisRpcServer, type RedisRpcServerOptions } from './server.js';
export { RedisRpcClient, type RedisRpcClientOptions } from './client.js';
export { ServerRedisTransport } from './server-transport.js';
export { ClientRedisTransport } from './client-transport.js';
export * from './keys.js';
```

- [ ] **Step 4: Commit**

```bash
git add ts/packages/over-redis/src/server.ts ts/packages/over-redis/src/client.ts ts/packages/over-redis/src/index.ts
git commit -m "feat(ts/over-redis): RedisRpcServer/Client facades + index exports"
```

---

## Task 6: TS round-trip + edge tests against real redis

**Files:**
- Create: `ts/packages/over-redis/tests/round-trip.test.ts`
- Create: `ts/packages/over-redis/tests/timeout.test.ts`
- Create: `ts/packages/over-redis/tests/worker-pool.test.ts`
- Create: `ts/packages/over-redis/tests/crash-recovery.test.ts`

- [ ] **Step 1: Write `tests/round-trip.test.ts`**

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

  it('returns RpcError on handler throw', async () => {
    prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    server.registerService(arith, {
      add: async () => { throw new RpcError(-32000, 'denied'); },
      ping: async () => {},
    });
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    await expect(client.call('arith', 'add', { a: 1, b: 2 })).rejects.toMatchObject({ code: -32000 });
    await client.stop(); await server.stop();
    await sredis.quit(); await credis.quit();
  });
});
```

- [ ] **Step 2: Write `tests/timeout.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod, ClamatorTransportError } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;

const c = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});

describe.skipIf(!REDIS_URL)('redis timeout', () => {
  it('client raises ClamatorTransportError when handler is slower than timeout', async () => {
    const prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    server.registerService(c, { add: async () => { await new Promise(r => setTimeout(r, 800)); return { sum: 0 }; } });
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 100 });
    await client.start();
    await expect(client.call('arith', 'add', { a: 1, b: 2 })).rejects.toBeInstanceOf(ClamatorTransportError);
    await client.stop(); await server.stop();
    const r = new IORedis(REDIS_URL!);
    const keys = await r.keys(`${prefix}:*`);
    if (keys.length) await r.del(...keys);
    await r.quit();
    await sredis.quit(); await credis.quit();
  });
});
```

- [ ] **Step 3: Write `tests/worker-pool.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;
const c = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number(), instance: z.string() }),
  }),
});

describe.skipIf(!REDIS_URL)('redis worker pool', () => {
  it('two servers share load roughly evenly', async () => {
    const prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const r1 = new IORedis(REDIS_URL!), r2 = new IORedis(REDIS_URL!), rc = new IORedis(REDIS_URL!);
    const s1 = new RedisRpcServer({ redis: r1, keyPrefix: prefix, instanceId: 'srv-1' });
    const s2 = new RedisRpcServer({ redis: r2, keyPrefix: prefix, instanceId: 'srv-2' });
    s1.registerService(c, { add: async ({ a, b }) => ({ sum: a + b, instance: 'srv-1' }) });
    s2.registerService(c, { add: async ({ a, b }) => ({ sum: a + b, instance: 'srv-2' }) });
    await s1.start(); await s2.start();
    const client = new RedisRpcClient({ redis: rc, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    const counts: Record<string, number> = { 'srv-1': 0, 'srv-2': 0 };
    for (let i = 0; i < 50; i++) {
      const r = await client.call<{ a: number; b: number }, { sum: number; instance: string }>(
        'arith', 'add', { a: i, b: 1 });
      counts[r.instance]++;
    }
    expect(counts['srv-1']).toBeGreaterThan(0);
    expect(counts['srv-2']).toBeGreaterThan(0);
    await client.stop(); await s1.stop(); await s2.stop();
    const cleanup = new IORedis(REDIS_URL!);
    const keys = await cleanup.keys(`${prefix}:*`);
    if (keys.length) await cleanup.del(...keys);
    await cleanup.quit(); await r1.quit(); await r2.quit(); await rc.quit();
  });
});
```

- [ ] **Step 4: Write `tests/crash-recovery.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;
const c = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});

describe.skipIf(!REDIS_URL)('redis crash recovery', () => {
  it('XCLAIM-based reclaim picks up an abandoned message', async () => {
    const prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const r1 = new IORedis(REDIS_URL!), r2 = new IORedis(REDIS_URL!), rc = new IORedis(REDIS_URL!);
    // Server 1 starts a handler that hangs forever, ack-less. Then we kill it.
    const s1 = new RedisRpcServer({
      redis: r1, keyPrefix: prefix, instanceId: 'srv-die',
      consumerClaimIdleMs: 200, // aggressive for test speed
    });
    s1.registerService(c, { add: async () => { await new Promise(() => {}); return { sum: 0 }; } });
    await s1.start();
    const client = new RedisRpcClient({ redis: rc, keyPrefix: prefix, defaultTimeoutMs: 5000 });
    await client.start();
    const callPromise = client.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 1, b: 2 });
    await new Promise(r => setTimeout(r, 100));
    // "Crash": stop server 1 forcibly without graceful drain.
    (s1 as any)._transport?.abort && ((s1 as any)._transport.abort = true);
    await s1.stop();
    // Server 2 starts and claims the pending message.
    const s2 = new RedisRpcServer({
      redis: r2, keyPrefix: prefix, instanceId: 'srv-recover',
      consumerClaimIdleMs: 200,
    });
    s2.registerService(c, { add: async ({ a, b }) => ({ sum: a + b }) });
    await s2.start();
    const r = await callPromise;
    expect(r).toEqual({ sum: 3 });
    await client.stop(); await s2.stop();
    const cleanup = new IORedis(REDIS_URL!);
    const keys = await cleanup.keys(`${prefix}:*`);
    if (keys.length) await cleanup.del(...keys);
    await cleanup.quit(); await r1.quit(); await r2.quit(); await rc.quit();
  }, 10_000);
});
```

- [ ] **Step 5: Run tests against a local redis**

```bash
docker compose -f tests/interop/docker-compose.yml up -d redis
export REDIS_URL=redis://localhost:6379
pnpm --filter @clamator/over-redis test
```

If a test fails, investigate the cause; do **not** weaken assertions. Common issues: missing `XAUTOCLAIM` (requires redis ≥6.2), too-short timeouts on slow CI, etc.

- [ ] **Step 6: Commit**

```bash
git add ts/packages/over-redis/tests/round-trip.test.ts ts/packages/over-redis/tests/timeout.test.ts ts/packages/over-redis/tests/worker-pool.test.ts ts/packages/over-redis/tests/crash-recovery.test.ts
git commit -m "test(ts/over-redis): real-redis round-trip, timeout, worker-pool, crash-recovery"
```

---

## Task 7: TS package AGENTS.md

**Files:**
- Create: `ts/packages/over-redis/AGENTS.md`

- [ ] **Step 1: Write `AGENTS.md`**

```markdown
# @clamator/over-redis — agent rules

Redis-streams transport. Implements the `Transport` interface from `@clamator/protocol`. Per-language unit tests live here against a real redis (skipped if `REDIS_URL` is unset). Cross-language end-to-end tests live in `tests/interop/`.

## Public API surface

- `RedisRpcServer`, `RedisRpcServerOptions`
- `RedisRpcClient`, `RedisRpcClientOptions`
- `ServerRedisTransport`, `ClientRedisTransport` (advanced)
- key-naming helpers from `./keys`

Sibling package: `clamator-over-redis` (Py). Changes here usually require sibling change in same commit.

## Configuration knobs (defaults)

| Knob | Default | Notes |
|---|---|---|
| `keyPrefix` | required | namespace for all streams + keys |
| `instanceId` | UUID | identifies this client/server instance |
| `replyStreamMaxLen` | 1024 | bound for client reply stream |
| `consumerClaimIdleMs` | 60_000 | XCLAIM idle threshold (server) |
| `defaultTimeoutMs` | 30_000 | per-call timeout (client) |
| `defaultHandlerTimeoutMs` | 30_000 | per-handler timeout (server) |
| `shutdownGraceMs` | 5_000 | drain window on `stop()` |

## Stream / key naming (must not change without bumping version)

| Purpose | Pattern |
|---|---|
| Per-service request stream | `<keyPrefix>:cmds:<service>` |
| Consumer group | group name = `<service>` |
| Per-instance reply stream | `<keyPrefix>:replies:<instance-id>` |

## Crash recovery + idempotency

- `XCLAIM` reclaims messages whose consumer has been idle > `consumerClaimIdleMs`.
- Combined with the protocol-level idempotency contract, retried messages are safe.
- Document idempotency in handler-author guidance, not enforced by the adapter.

## Out of scope (v0.1)

- Federation across redis instances
- Observability / metrics
- Multi-region replication
- TLS sugar (consumer configures the redis client directly)
```

- [ ] **Step 2: Commit**

```bash
git add ts/packages/over-redis/AGENTS.md
git commit -m "docs(ts/over-redis): AGENTS.md"
```

---

## Task 8: Py scaffold

**Files:**
- Create: `py/packages/over-redis/pyproject.toml`
- Create: `py/packages/over-redis/src/clamator_over_redis/__init__.py`
- Create: `py/packages/over-redis/LICENSE`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "clamator-over-redis"
version = "0.1.0"
description = "Redis-streams transport for clamator (pre-1.0)."
license = { text = "Apache-2.0" }
readme = "../../../README.md"
requires-python = ">=3.11"
authors = [{ name = "Kristof Csillag" }]
dependencies = [
  "clamator-protocol==0.1.0",
  "redis>=5.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/clamator_over_redis"]
include = ["LICENSE"]

[tool.hatch.build.force-include]
"../../../LICENSE" = "LICENSE"

[tool.uv.sources]
clamator-protocol = { workspace = true }
```

- [ ] **Step 2: Symlink LICENSE + empty `__init__.py`**

```bash
ln -s ../../../LICENSE py/packages/over-redis/LICENSE
```

```python
"""clamator-over-redis: redis-streams transport adapter."""
```

- [ ] **Step 3: Sync**

```bash
cd py && uv sync
```

- [ ] **Step 4: Commit**

```bash
git add py/packages/over-redis/pyproject.toml py/packages/over-redis/src/clamator_over_redis/__init__.py py/packages/over-redis/LICENSE py/uv.lock
git commit -m "feat(py/over-redis): scaffold package"
```

---

## Task 9: Py keys + backoff

**Files:**
- Create: `py/packages/over-redis/src/clamator_over_redis/keys.py`
- Create: `py/packages/over-redis/src/clamator_over_redis/backoff.py`
- Create: `py/packages/over-redis/tests/test_keys.py`

- [ ] **Step 1: Write `keys.py`**

```python
def command_stream(prefix: str, service: str) -> str:
    return f"{prefix}:cmds:{service}"


def reply_stream(prefix: str, instance_id: str) -> str:
    return f"{prefix}:replies:{instance_id}"


def consumer_group_name(service: str) -> str:
    return service


def consumer_name(service: str, instance_id: str) -> str:
    return f"{service}:{instance_id}"
```

- [ ] **Step 2: Write `backoff.py`**

```python
import random
from dataclasses import dataclass


@dataclass
class ExpBackoff:
    initial_ms: int
    max_ms: int
    factor: float = 2.0
    jitter: bool = True
    _current_ms: int | None = None

    def next_delay_ms(self) -> int:
        if self._current_ms is None:
            self._current_ms = self.initial_ms
        value = self._current_ms
        self._current_ms = min(self.max_ms, int(self._current_ms * self.factor))
        if self.jitter:
            return int(value * (0.5 + random.random() * 0.5))
        return value

    def reset(self) -> None:
        self._current_ms = None
```

- [ ] **Step 3: Write test `tests/test_keys.py`**

```python
from clamator_over_redis.keys import (
    command_stream, reply_stream, consumer_group_name, consumer_name,
)


def test_command_stream():
    assert command_stream("app", "engine") == "app:cmds:engine"


def test_reply_stream():
    assert reply_stream("app", "i") == "app:replies:i"


def test_consumer_group_name_equals_service():
    assert consumer_group_name("engine") == "engine"


def test_consumer_name():
    assert consumer_name("engine", "i") == "engine:i"
```

- [ ] **Step 4: Run — passes**

- [ ] **Step 5: Commit**

```bash
git add py/packages/over-redis/src/clamator_over_redis/keys.py py/packages/over-redis/src/clamator_over_redis/backoff.py py/packages/over-redis/tests/test_keys.py
git commit -m "feat(py/over-redis): key naming + backoff"
```

---

## Task 10: Py client transport

**Files:**
- Create: `py/packages/over-redis/src/clamator_over_redis/client_transport.py`

- [ ] **Step 1: Write `client_transport.py`**

```python
from __future__ import annotations
import asyncio
import json
import uuid
from typing import Any

from redis.asyncio import Redis

from clamator_protocol import (
    parse_envelope, ClamatorTransportError, RequestEnvelope, NotificationEnvelope,
    Dispatcher,
)
from .keys import command_stream, reply_stream


class ClientRedisTransport:
    def __init__(
        self, *, redis: Redis, key_prefix: str,
        instance_id: str | None = None,
        reply_stream_maxlen: int = 1024,
        default_timeout_ms: int = 30_000,
    ) -> None:
        self._redis = redis
        self._key_prefix = key_prefix
        self.instance_id = instance_id or str(uuid.uuid4())
        self._reply_stream = reply_stream(key_prefix, self.instance_id)
        self._reply_maxlen = reply_stream_maxlen
        self._default_timeout = default_timeout_ms / 1000
        self._state = "idle"
        self._pending: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._reply_loop_task: asyncio.Task[Any] | None = None

    async def register_service(self, name: str, dispatch: Dispatcher) -> None:
        raise NotImplementedError("client transport cannot host services")

    async def send(self, env: dict[str, Any], *, timeout: float) -> dict[str, Any]:
        if self._state != "started":
            raise ClamatorTransportError(f"transport not started (state={self._state})")
        parsed = parse_envelope(env)
        if not isinstance(parsed, RequestEnvelope):
            raise ClamatorTransportError("send requires a request envelope")
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[dict[str, Any]] = loop.create_future()
        self._pending[str(parsed.id)] = fut
        try:
            await self._redis.xadd(
                command_stream(self._key_prefix, parsed.service),
                {"type": "rpc", "envelope": json.dumps(env), "reply-to": self._reply_stream},
            )
        except Exception as e:
            self._pending.pop(str(parsed.id), None)
            raise ClamatorTransportError("xadd failed", cause=e) from e
        try:
            return await asyncio.wait_for(fut, timeout=timeout)
        except asyncio.TimeoutError as e:
            self._pending.pop(str(parsed.id), None)
            raise ClamatorTransportError("call timeout") from e

    async def notify(self, env: dict[str, Any]) -> None:
        if self._state != "started":
            raise ClamatorTransportError(f"transport not started (state={self._state})")
        parsed = parse_envelope(env)
        if not isinstance(parsed, NotificationEnvelope):
            raise ClamatorTransportError("notify requires a notification envelope")
        await self._redis.xadd(
            command_stream(self._key_prefix, parsed.service),
            {"type": "rpc", "envelope": json.dumps(env)},
        )

    async def start(self) -> None:
        if self._state == "stopped":
            raise ClamatorTransportError("transport has been stopped")
        if self._state == "started":
            return
        self._state = "started"
        self._reply_loop_task = asyncio.create_task(self._reply_loop())

    async def stop(self) -> None:
        if self._state != "started":
            self._state = "stopped"
            return
        self._state = "stopped"
        if self._reply_loop_task:
            self._reply_loop_task.cancel()
            try:
                await self._reply_loop_task
            except asyncio.CancelledError:
                pass
        for fut in list(self._pending.values()):
            if not fut.done():
                fut.set_exception(ClamatorTransportError("transport stopped"))
        self._pending.clear()
        try:
            await self._redis.delete(self._reply_stream)
        except Exception:
            pass

    async def _reply_loop(self) -> None:
        last_id = "$"
        while True:
            try:
                results = await self._redis.xread({self._reply_stream: last_id}, block=1000)
                if not results:
                    continue
                for _stream, entries in results:
                    for entry_id, fields in entries:
                        last_id = entry_id
                        env_field = fields.get(b"envelope") or fields.get("envelope")
                        if env_field is None:
                            continue
                        if isinstance(env_field, bytes):
                            env_field = env_field.decode()
                        try:
                            parsed = json.loads(env_field)
                        except Exception:
                            continue
                        rid = str(parsed.get("id"))
                        fut = self._pending.pop(rid, None)
                        if fut and not fut.done():
                            fut.set_result(parsed)
            except asyncio.CancelledError:
                return
            except Exception:
                await asyncio.sleep(0.1)
```

- [ ] **Step 2: Commit**

```bash
git add py/packages/over-redis/src/clamator_over_redis/client_transport.py
git commit -m "feat(py/over-redis): client-side ClientRedisTransport"
```

---

## Task 11: Py server transport

**Files:**
- Create: `py/packages/over-redis/src/clamator_over_redis/server_transport.py`

- [ ] **Step 1: Write `server_transport.py`**

```python
from __future__ import annotations
import asyncio
import json
import uuid
from typing import Any

from redis.asyncio import Redis

from clamator_protocol import (
    parse_envelope, ClamatorTransportError, Dispatcher,
)
from .keys import command_stream, consumer_group_name, consumer_name


class ServerRedisTransport:
    def __init__(
        self, *, redis: Redis, key_prefix: str,
        instance_id: str | None = None,
        consumer_claim_idle_ms: int = 60_000,
        default_handler_timeout_ms: int = 30_000,
        shutdown_grace_ms: int = 5_000,
    ) -> None:
        self._redis = redis
        self._key_prefix = key_prefix
        self.instance_id = instance_id or str(uuid.uuid4())
        self._claim_idle_ms = consumer_claim_idle_ms
        self._handler_timeout_ms = default_handler_timeout_ms
        self._shutdown_grace_ms = shutdown_grace_ms
        self._dispatchers: dict[str, Dispatcher] = {}
        self._state = "idle"
        self._tasks: list[asyncio.Task[Any]] = []

    async def register_service(self, name: str, dispatch: Dispatcher) -> None:
        self._dispatchers[name] = dispatch

    async def send(self, env: dict[str, Any], *, timeout: float) -> dict[str, Any]:
        raise NotImplementedError("server transport cannot send requests")

    async def notify(self, env: dict[str, Any]) -> None:
        raise NotImplementedError("server transport cannot send notifications")

    async def start(self) -> None:
        if self._state == "stopped":
            raise ClamatorTransportError("transport has been stopped")
        if self._state == "started":
            return
        self._state = "started"
        for service in self._dispatchers:
            stream = command_stream(self._key_prefix, service)
            group = consumer_group_name(service)
            try:
                await self._redis.xgroup_create(stream, group, id="$", mkstream=True)
            except Exception as e:
                if "BUSYGROUP" not in str(e):
                    raise
            self._tasks.append(asyncio.create_task(self._consumer_loop(service)))
            self._tasks.append(asyncio.create_task(self._reclaim_loop(service)))

    async def stop(self) -> None:
        if self._state != "started":
            self._state = "stopped"
            return
        self._state = "stopped"
        for t in self._tasks:
            t.cancel()
        try:
            await asyncio.wait_for(
                asyncio.gather(*self._tasks, return_exceptions=True),
                timeout=self._shutdown_grace_ms / 1000,
            )
        except asyncio.TimeoutError:
            pass
        self._tasks.clear()

    async def _consumer_loop(self, service: str) -> None:
        stream = command_stream(self._key_prefix, service)
        group = consumer_group_name(service)
        consumer = consumer_name(service, self.instance_id)
        while self._state == "started":
            try:
                results = await self._redis.xreadgroup(
                    group, consumer, {stream: ">"}, block=1000, count=16,
                )
                if not results:
                    continue
                for _, entries in results:
                    for entry_id, fields in entries:
                        await self._handle_entry(service, stream, group, entry_id, fields)
            except asyncio.CancelledError:
                return
            except Exception:
                await asyncio.sleep(0.1)

    async def _reclaim_loop(self, service: str) -> None:
        stream = command_stream(self._key_prefix, service)
        group = consumer_group_name(service)
        consumer = consumer_name(service, self.instance_id)
        while self._state == "started":
            try:
                await asyncio.sleep(max(1.0, self._claim_idle_ms / 4000))
                claimed = await self._redis.xautoclaim(
                    stream, group, consumer, min_idle_time=self._claim_idle_ms, count=32,
                )
                # claimed: (next_cursor, [(id, fields), ...], deleted_ids)
                _, entries, _ = claimed if len(claimed) == 3 else (claimed[0], claimed[1], [])
                for entry_id, fields in entries or []:
                    await self._handle_entry(service, stream, group, entry_id, fields)
            except asyncio.CancelledError:
                return
            except Exception:
                pass

    async def _handle_entry(
        self, service: str, stream: str, group: str, entry_id: Any, fields: dict[Any, Any],
    ) -> None:
        env_b = fields.get(b"envelope") or fields.get("envelope")
        if env_b is None:
            await self._redis.xack(stream, group, entry_id)
            return
        if isinstance(env_b, bytes):
            env_b = env_b.decode()
        reply_to = fields.get(b"reply-to") or fields.get("reply-to")
        if isinstance(reply_to, bytes):
            reply_to = reply_to.decode()
        try:
            env_obj = json.loads(env_b)
            parsed = parse_envelope(env_obj)
        except Exception:
            await self._redis.xack(stream, group, entry_id)
            return
        dispatcher = self._dispatchers.get(service)
        if dispatcher is None:
            await self._redis.xack(stream, group, entry_id)
            return
        reply = await dispatcher(parsed)
        if reply_to and reply is not None:
            await self._redis.xadd(
                reply_to, {"type": "rpc", "envelope": json.dumps(reply)},
                maxlen=1024, approximate=True,
            )
        await self._redis.xack(stream, group, entry_id)
```

- [ ] **Step 2: Commit**

```bash
git add py/packages/over-redis/src/clamator_over_redis/server_transport.py
git commit -m "feat(py/over-redis): server-side ServerRedisTransport with XAUTOCLAIM"
```

---

## Task 12: Py facades + tests

**Files:**
- Create: `py/packages/over-redis/src/clamator_over_redis/server.py`
- Create: `py/packages/over-redis/src/clamator_over_redis/client.py`
- Modify: `py/packages/over-redis/src/clamator_over_redis/__init__.py`
- Create: `py/packages/over-redis/tests/conftest.py`
- Create: `py/packages/over-redis/tests/test_round_trip.py`
- Create: `py/packages/over-redis/tests/test_timeout.py`
- Create: `py/packages/over-redis/tests/test_worker_pool.py`
- Create: `py/packages/over-redis/tests/test_crash_recovery.py`

- [ ] **Step 1: Write `server.py`**

```python
from __future__ import annotations
from clamator_protocol import RpcServerCore
from redis.asyncio import Redis
from .server_transport import ServerRedisTransport


class RedisRpcServer(RpcServerCore):
    def __init__(
        self, *, redis: Redis, key_prefix: str,
        instance_id: str | None = None,
        consumer_claim_idle_ms: int = 60_000,
        default_handler_timeout_ms: int = 30_000,
        shutdown_grace_ms: int = 5_000,
    ) -> None:
        super().__init__(ServerRedisTransport(
            redis=redis, key_prefix=key_prefix, instance_id=instance_id,
            consumer_claim_idle_ms=consumer_claim_idle_ms,
            default_handler_timeout_ms=default_handler_timeout_ms,
            shutdown_grace_ms=shutdown_grace_ms,
        ))
```

- [ ] **Step 2: Write `client.py`**

```python
from __future__ import annotations
from clamator_protocol import RpcClientCore
from redis.asyncio import Redis
from .client_transport import ClientRedisTransport


class RedisRpcClient(RpcClientCore):
    def __init__(
        self, *, redis: Redis, key_prefix: str,
        instance_id: str | None = None,
        reply_stream_maxlen: int = 1024,
        default_timeout_ms: int = 30_000,
    ) -> None:
        super().__init__(
            ClientRedisTransport(
                redis=redis, key_prefix=key_prefix, instance_id=instance_id,
                reply_stream_maxlen=reply_stream_maxlen,
                default_timeout_ms=default_timeout_ms,
            ),
            default_timeout_ms=default_timeout_ms,
        )
```

- [ ] **Step 3: Update `__init__.py`**

```python
"""clamator-over-redis: redis-streams transport adapter."""

from .server import RedisRpcServer
from .client import RedisRpcClient
from .server_transport import ServerRedisTransport
from .client_transport import ClientRedisTransport

__all__ = [
    "RedisRpcServer", "RedisRpcClient",
    "ServerRedisTransport", "ClientRedisTransport",
]
```

- [ ] **Step 4: Write `tests/conftest.py`**

```python
import os
import secrets
import pytest
from redis.asyncio import Redis


def _redis_url() -> str | None:
    return os.environ.get("REDIS_URL")


@pytest.fixture
def redis_url():
    url = _redis_url()
    if not url:
        pytest.skip("REDIS_URL not set")
    return url


@pytest.fixture
def key_prefix():
    return f"clam-test-{secrets.token_hex(4)}"


@pytest.fixture
async def cleanup(redis_url, key_prefix):
    yield
    r = Redis.from_url(redis_url)
    keys = await r.keys(f"{key_prefix}:*")
    if keys:
        await r.delete(*keys)
    await r.close()
```

- [ ] **Step 5: Write `tests/test_round_trip.py`**

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
    rs = Redis.from_url(redis_url); rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith, Svc())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    r = await client.call("arith", "add", {"a": 2, "b": 3})
    assert r == {"sum": 5}
    await client.stop(); await server.stop()
    await rs.close(); await rc.close()


async def test_handler_rpc_error(redis_url, key_prefix, cleanup):
    class Bad(Svc):
        async def add(self, p): raise RpcError(-32000, "denied")
    rs = Redis.from_url(redis_url); rc = Redis.from_url(redis_url)
    server = RedisRpcServer(redis=rs, key_prefix=key_prefix)
    server.register_service(arith, Bad())
    await server.start()
    client = RedisRpcClient(redis=rc, key_prefix=key_prefix, default_timeout_ms=3000)
    await client.start()
    with pytest.raises(RpcError) as ei:
        await client.call("arith", "add", {"a": 1, "b": 2})
    assert ei.value.code == -32000
    await client.stop(); await server.stop()
    await rs.close(); await rc.close()
```

- [ ] **Step 6: Write `tests/test_timeout.py`, `tests/test_worker_pool.py`, `tests/test_crash_recovery.py`**

Mirror the TS tests' shape, adjusted to Python idioms. Use the same fixtures (`redis_url`, `key_prefix`, `cleanup`). Each must skip when `REDIS_URL` is unset. Use 3-second timeouts for slow CI.

(For brevity here, model each on its TS sibling — read the TS file and translate. The expected behavior is identical.)

- [ ] **Step 7: Run tests**

```bash
docker compose -f tests/interop/docker-compose.yml up -d redis
export REDIS_URL=redis://localhost:6379
cd py && uv run pytest packages/over-redis -v
```

- [ ] **Step 8: Commit**

```bash
git add py/packages/over-redis/src/clamator_over_redis/server.py py/packages/over-redis/src/clamator_over_redis/client.py py/packages/over-redis/src/clamator_over_redis/__init__.py py/packages/over-redis/tests/
git commit -m "feat(py/over-redis): facades + real-redis tests (round-trip, timeout, worker-pool, crash-recovery)"
```

---

## Task 13: Py AGENTS.md + sibling-consistency review

**Files:**
- Create: `py/packages/over-redis/AGENTS.md`

- [ ] **Step 1: Write `AGENTS.md`** (mirror TS rules)

```markdown
# clamator-over-redis — agent rules

Redis-streams transport (Py side). Sibling: `@clamator/over-redis` (TS). Changes must be paired.

## Public API surface

- `RedisRpcServer`, `RedisRpcClient`
- `ServerRedisTransport`, `ClientRedisTransport`
- key-naming helpers from `keys` module

## Configuration knobs (defaults)

| Knob (Py snake) | TS sibling | Default |
|---|---|---|
| `key_prefix` | `keyPrefix` | required |
| `instance_id` | `instanceId` | UUID |
| `reply_stream_maxlen` | `replyStreamMaxLen` | 1024 |
| `consumer_claim_idle_ms` | `consumerClaimIdleMs` | 60_000 |
| `default_timeout_ms` | `defaultTimeoutMs` | 30_000 |
| `default_handler_timeout_ms` | `defaultHandlerTimeoutMs` | 30_000 |
| `shutdown_grace_ms` | `shutdownGraceMs` | 5_000 |

Same stream/key naming as TS sibling. Same error-code mapping. Same crash-recovery semantics.

## Sibling-consistency invariants

If the TS sibling adds a knob or changes a default, this package adds it in the same commit. CI grep checks the AGENTS.md tables on both sides match.
```

- [ ] **Step 2: Sibling-consistency review**

Open each pair side-by-side and confirm equivalent behavior:
- `client-transport.ts` vs `client_transport.py`
- `server-transport.ts` vs `server_transport.py`

Verify:
- Same `XADD` field encoding (`type: rpc`, `envelope: <json>`, optional `reply-to`).
- Same consumer-group + reply-stream naming.
- Same `XAUTOCLAIM` reclaim path.
- Same default timeouts.
- Same lifecycle states.

If divergence: fix it in this commit.

- [ ] **Step 3: Final test runs both languages**

```bash
docker compose -f tests/interop/docker-compose.yml up -d redis
export REDIS_URL=redis://localhost:6379
pnpm --filter @clamator/over-redis test
cd py && uv run pytest packages/over-redis -v
docker compose -f tests/interop/docker-compose.yml down
```

- [ ] **Step 4: Commit**

```bash
git add py/packages/over-redis/AGENTS.md
git commit -m "docs(py/over-redis): AGENTS.md + sibling-consistency review pass"
```
