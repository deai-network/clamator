# Cross-Language Interop Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cross-language interop test harness in `tests/interop/`. Proves the wire envelope, codegen output, and `over-redis` transport work consistently across TS↔Py boundaries. Memory transport is intentionally out of scope here (in-process only — covered in plan 03).

**Architecture:** A scenario-based runner (`bash` + Node) launches a server-language subprocess and a client-language subprocess per scenario, both wired to a shared dockerized redis. Scenarios are YAML files; drivers are tiny TS + Py CLIs that read scenario JSON over stdin and emit structured results over stdout. Codegen is invoked at the start of `run.sh` to regenerate fixtures from `tests/interop/contracts/`. The matrix runs every scenario in both directions (ts-server/py-client and py-server/ts-client).

**Tech Stack:** docker compose, redis 7, bash, Node 20 (driver + runner), Python 3.11 (driver). YAML via `yaml` (TS) and `pyyaml` (Py, runner only invokes `yaml.safe_load` — actually, runner is TS, so YAML parsing happens in TS). Drivers wire to `@clamator/over-redis` and `clamator-over-redis`.

**Depends on:** plan 02 (protocol), plan 04 (codegen), plan 05 (over-redis).

---

## File Structure

```
tests/interop/
├── docker-compose.yml
├── contracts/
│   ├── arith.ts
│   └── notifications.ts
├── generated/                     # gitignored; produced by codegen
│   ├── ts/
│   ├── py/
│   └── manifest.json
├── drivers/
│   ├── ts/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── server.ts
│   │   └── client.ts
│   └── py/
│       ├── pyproject.toml
│       ├── server.py
│       └── client.py
├── scenarios/
│   ├── basic-call.yaml
│   ├── error-mapping.yaml
│   ├── validation-failure.yaml
│   ├── notification.yaml
│   ├── timeout.yaml
│   ├── concurrent-calls.yaml
│   ├── worker-pool.yaml
│   ├── crash-recovery.yaml
│   └── schema-hash.yaml
├── lib/
│   ├── runner.ts
│   ├── docker.ts
│   └── package.json (or merged into drivers/ts/package.json)
└── run.sh
```

`tests/interop/` is **not** a published package and not part of the npm/pnpm workspace member list (or it is, but `private: true`). Decision: include in `pnpm-workspace.yaml` as `tests/interop/drivers/ts` so codegen can resolve `@clamator/*` via workspace links; mark `private: true`.

---

## Task 1: Workspace + docker-compose + ignore rules

**Files:**
- Create: `tests/interop/docker-compose.yml`
- Create: `tests/interop/.gitignore`
- Modify: `ts/pnpm-workspace.yaml`

- [ ] **Step 1: Write `docker-compose.yml`**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 1s
      timeout: 1s
      retries: 30
```

- [ ] **Step 2: Write `tests/interop/.gitignore`**

```
generated/
.tmp/
node_modules/
```

- [ ] **Step 3: Add interop drivers to pnpm workspace**

Edit `ts/pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - '../tests/interop/drivers/ts'
  - '../tests/interop/lib'
```

- [ ] **Step 4: Verify docker compose comes up**

```bash
docker compose -f tests/interop/docker-compose.yml up -d redis
docker compose -f tests/interop/docker-compose.yml ps
docker exec $(docker ps --format '{{.Names}}' | grep redis) redis-cli ping
docker compose -f tests/interop/docker-compose.yml down
```

Expected: `PONG`.

- [ ] **Step 5: Commit**

```bash
git add tests/interop/docker-compose.yml tests/interop/.gitignore ts/pnpm-workspace.yaml
git commit -m "chore(interop): docker-compose + workspace inclusion"
```

---

## Task 2: Source contracts for interop scenarios

**Files:**
- Create: `tests/interop/contracts/arith.ts`
- Create: `tests/interop/contracts/notifications.ts`
- Create: `tests/interop/contracts/index.ts` — barrel re-export (codegen `--ts-contract-import` target)

- [ ] **Step 1: Write `tests/interop/contracts/arith.ts`**

```typescript
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  divide: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ q: z.number() }),
  }),
  echoText: defineMethod({
    params: z.object({ text: z.string() }),
    result: z.object({ text: z.string() }),
  }),
});
```

- [ ] **Step 2: Write `tests/interop/contracts/notifications.ts`**

```typescript
import { z } from 'zod';
import { defineContract, defineNotification } from '@clamator/protocol';

export const notificationsContract = defineContract('notifications', {
  ping: defineNotification({ params: z.object({ tag: z.string().optional() }) }),
});
```

- [ ] **Step 3: Write `tests/interop/contracts/index.ts`**

```typescript
export { arithContract } from './arith.js';
export { notificationsContract } from './notifications.js';
```

- [ ] **Step 4: Commit**

```bash
git add tests/interop/contracts/
git commit -m "feat(interop): seed arith + notifications contracts"
```

---

## Task 3: TS driver

**Files:**
- Create: `tests/interop/drivers/ts/package.json`
- Create: `tests/interop/drivers/ts/tsconfig.json`
- Create: `tests/interop/drivers/ts/server.ts`
- Create: `tests/interop/drivers/ts/client.ts`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@clamator/interop-driver-ts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "clean": "rm -rf dist .tsbuildinfo"
  },
  "dependencies": {
    "@clamator/protocol": "workspace:*",
    "@clamator/over-redis": "workspace:*",
    "ioredis": "^5.4.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "extends": "../../../../ts/tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "tsBuildInfoFile": ".tsbuildinfo"
  },
  "include": ["server.ts", "client.ts", "../../generated/ts/**/*", "../../contracts/**/*"]
}
```

- [ ] **Step 3: Write `server.ts`**

```typescript
import IORedis from 'ioredis';
import { RedisRpcServer } from '@clamator/over-redis';
import { arithContract } from '../../contracts/arith.js';
import { notificationsContract } from '../../contracts/notifications.js';
import { RpcError } from '@clamator/protocol';

interface DriverInput {
  contract: 'arith' | 'notifications';
  redisUrl: string;
  keyPrefix: string;
  instanceId?: string;
  consumerClaimIdleMs?: number;
}

async function readStdin(): Promise<DriverInput> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk.toString());
  return JSON.parse(chunks.join('')) as DriverInput;
}

async function main() {
  const cfg = await readStdin();
  const redis = new IORedis(cfg.redisUrl);
  const server = new RedisRpcServer({
    redis, keyPrefix: cfg.keyPrefix,
    instanceId: cfg.instanceId,
    consumerClaimIdleMs: cfg.consumerClaimIdleMs,
  });
  if (cfg.contract === 'arith') {
    server.registerService(arithContract, {
      add: async ({ a, b }) => ({ sum: a + b }),
      divide: async ({ a, b }) => {
        if (b === 0) throw new RpcError(-32000, 'division by zero');
        return { q: a / b };
      },
      echoText: async ({ text }) => ({ text }),
    });
  } else {
    let pingedAt: number | null = null;
    server.registerService(notificationsContract, {
      ping: async () => { pingedAt = Date.now(); },
    });
    process.on('SIGTERM', () => {
      console.log(JSON.stringify({ pingedAt }));
      process.exit(0);
    });
  }
  await server.start();
  console.log('READY');
  await new Promise(() => {});
}
main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 4: Write `client.ts`**

```typescript
import IORedis from 'ioredis';
import { RedisRpcClient } from '@clamator/over-redis';
import { RpcError, ClamatorTransportError } from '@clamator/protocol';

interface Call {
  method: string;     // "<service>.<method>"
  params: unknown;
  notification?: boolean;
  expectErrorCode?: number;
  expectMessageMatches?: string;
  expectResult?: unknown;
}

interface Input {
  redisUrl: string;
  keyPrefix: string;
  defaultTimeoutMs?: number;
  calls: Call[];
}

async function readStdin(): Promise<Input> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk.toString());
  return JSON.parse(chunks.join('')) as Input;
}

async function main() {
  const cfg = await readStdin();
  const redis = new IORedis(cfg.redisUrl);
  const client = new RedisRpcClient({
    redis, keyPrefix: cfg.keyPrefix, defaultTimeoutMs: cfg.defaultTimeoutMs ?? 5000,
  });
  await client.start();
  const results: Record<string, unknown>[] = [];
  for (const call of cfg.calls) {
    const dot = call.method.indexOf('.');
    const service = call.method.slice(0, dot);
    const method = call.method.slice(dot + 1);
    try {
      if (call.notification) {
        await client.notify(service, method, call.params);
        results.push({ ok: true, kind: 'notification' });
      } else {
        const r = await client.call(service, method, call.params);
        results.push({ ok: true, kind: 'result', result: r });
      }
    } catch (e) {
      if (e instanceof RpcError) {
        results.push({ ok: false, kind: 'rpc-error', code: e.code, message: e.message, data: e.data });
      } else if (e instanceof ClamatorTransportError) {
        results.push({ ok: false, kind: 'transport-error', message: (e as Error).message });
      } else {
        results.push({ ok: false, kind: 'unknown-error', message: String(e) });
      }
    }
  }
  console.log(JSON.stringify({ results }));
  await client.stop();
  await redis.quit();
}
main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: Install + build**

```bash
cd ts && pnpm install
pnpm --filter @clamator/interop-driver-ts build
```

- [ ] **Step 6: Commit**

```bash
git add tests/interop/drivers/ts/
git commit -m "feat(interop): TS server + client drivers"
```

---

## Task 4: Py driver

**Files:**
- Create: `tests/interop/drivers/py/pyproject.toml`
- Create: `tests/interop/drivers/py/server.py`
- Create: `tests/interop/drivers/py/client.py`

- [ ] **Step 1: Write `pyproject.toml`**

```toml
[project]
name = "clamator-interop-driver-py"
version = "0.0.0"
description = "Cross-language interop driver (private)."
requires-python = ">=3.11"
dependencies = [
  "clamator-protocol",
  "clamator-over-redis",
  "redis>=5.0",
  "pydantic>=2.5",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = []  # not built

[tool.uv.sources]
clamator-protocol = { workspace = true }
clamator-over-redis = { workspace = true }
```

Add `tests/interop/drivers/py` to `py/pyproject.toml`'s `[tool.uv.workspace] members`. (Update plan 01's pyproject if not already done — workspace members glob `packages/*` doesn't reach this path; add explicit member.)

```toml
[tool.uv.workspace]
members = ["packages/*", "../tests/interop/drivers/py"]
```

- [ ] **Step 2: Write `server.py`**

```python
import asyncio
import json
import sys
from typing import Any
from redis.asyncio import Redis
from clamator_over_redis import RedisRpcServer
from clamator_protocol import RpcError

import sys as _sys, importlib.util

# Import the generated contract modules at runtime
def _import(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


async def main() -> None:
    cfg: dict[str, Any] = json.loads(sys.stdin.read())
    contract = cfg["contract"]
    base = cfg.get("generatedDir", "tests/interop/generated/py")
    arith_mod = _import(f"{base}/arith.py", "arith")
    notif_mod = _import(f"{base}/notifications.py", "notifications")
    redis = Redis.from_url(cfg["redisUrl"])
    server = RedisRpcServer(
        redis=redis, key_prefix=cfg["keyPrefix"],
        instance_id=cfg.get("instanceId"),
        consumer_claim_idle_ms=cfg.get("consumerClaimIdleMs", 60_000),
    )
    if contract == "arith":
        class Arith(arith_mod.ArithService):
            async def add(self, params): return arith_mod.AddResult(sum=params.a + params.b)
            async def divide(self, params):
                if params.b == 0: raise RpcError(-32000, "division by zero")
                return arith_mod.DivideResult(q=params.a / params.b)
            async def echo_text(self, params): return arith_mod.EchoTextResult(text=params.text)
        server.register_service(arith_mod.arith_contract, Arith())
    else:
        class Notif(notif_mod.NotificationsService):
            async def ping(self, params): pass
        server.register_service(notif_mod.notifications_contract, Notif())
    await server.start()
    print("READY", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await server.stop()
        await redis.close()


asyncio.run(main())
```

- [ ] **Step 3: Write `client.py`**

```python
import asyncio
import json
import sys
from typing import Any
from redis.asyncio import Redis
from clamator_over_redis import RedisRpcClient
from clamator_protocol import RpcError, ClamatorTransportError


async def main() -> None:
    cfg: dict[str, Any] = json.loads(sys.stdin.read())
    redis = Redis.from_url(cfg["redisUrl"])
    client = RedisRpcClient(
        redis=redis, key_prefix=cfg["keyPrefix"],
        default_timeout_ms=cfg.get("defaultTimeoutMs", 5000),
    )
    await client.start()
    results = []
    for call in cfg["calls"]:
        method = call["method"]
        service, _, m = method.partition(".")
        try:
            if call.get("notification"):
                await client.notify(service, m, call["params"])
                results.append({"ok": True, "kind": "notification"})
            else:
                r = await client.call(service, m, call["params"])
                results.append({"ok": True, "kind": "result", "result": r})
        except RpcError as e:
            results.append({"ok": False, "kind": "rpc-error",
                            "code": e.code, "message": e.message, "data": e.data})
        except ClamatorTransportError as e:
            results.append({"ok": False, "kind": "transport-error", "message": str(e)})
        except Exception as e:  # noqa: BLE001
            results.append({"ok": False, "kind": "unknown-error", "message": str(e)})
    print(json.dumps({"results": results}), flush=True)
    await client.stop()
    await redis.close()


asyncio.run(main())
```

- [ ] **Step 4: Sync + verify import**

```bash
cd py && uv sync
uv run python -c "import clamator_over_redis; print('ok')"
```

- [ ] **Step 5: Commit**

```bash
git add tests/interop/drivers/py/ py/pyproject.toml
git commit -m "feat(interop): Py server + client drivers"
```

---

## Task 5: Scenarios

**Files:**
- Create one YAML file per scenario in `tests/interop/scenarios/`.

- [ ] **Step 1: Write each scenario file**

`scenarios/basic-call.yaml`:
```yaml
name: basic call
matrix: both
contract: arith
calls:
  - method: arith.add
    params: { a: 2, b: 3 }
    expect: { result: { sum: 5 } }
  - method: arith.echoText
    params: { text: "hello" }
    expect: { result: { text: "hello" } }
```

`scenarios/error-mapping.yaml`:
```yaml
name: error mapping
matrix: both
contract: arith
calls:
  - method: arith.divide
    params: { a: 10, b: 0 }
    expect:
      error:
        code: -32000
        messageMatches: "division by zero"
```

`scenarios/validation-failure.yaml`:
```yaml
name: validation failure
matrix: both
contract: arith
calls:
  - method: arith.add
    params: { a: "two", b: 3 }
    expect:
      error:
        code: -32602
```

`scenarios/notification.yaml`:
```yaml
name: notification fire-and-forget
matrix: both
contract: notifications
calls:
  - method: notifications.ping
    params: { tag: "x" }
    notification: true
    expect:
      kind: notification
```

`scenarios/timeout.yaml`:
```yaml
name: client timeout
matrix: both
contract: arith
client:
  defaultTimeoutMs: 100
server:
  slowMs: 800   # interpreted by drivers; for now reject as out-of-scope or use a slow handler variant
calls:
  - method: arith.add
    params: { a: 1, b: 2 }
    expect:
      error:
        kind: transport-error
        messageMatches: "timeout"
```

> NOTE: For `timeout.yaml` to function, drivers need a "slow" variant of arith.add. Either: (a) add a `slowAdd` method to the arith contract that sleeps for a configurable duration; (b) add a separate `slow` contract. Decision: add `slowAdd: defineMethod({ params: z.object({ a, b, sleepMs }), result: z.object({ sum }) })` to the arith contract; servers honor sleepMs. Update `tests/interop/contracts/arith.ts` accordingly + drivers accordingly. Keep this consistent across both languages.

`scenarios/concurrent-calls.yaml`:
```yaml
name: 100 concurrent calls
matrix: both
contract: arith
client:
  concurrent: 100
calls:
  - method: arith.add
    params: { a: 1, b: 1 }
    expect: { result: { sum: 2 } }
```

> NOTE: Runner must support a `concurrent` knob — drivers loop n times and fire all calls in parallel (`Promise.all` / `asyncio.gather`).

`scenarios/worker-pool.yaml`:
```yaml
name: worker pool fairness
matrix: both
contract: arith
servers: 2
calls:
  - method: arith.add
    params: { a: 1, b: 1 }
    repeat: 50
    expect:
      result: { sum: 2 }
      distributionRoughlyEven: true
```

> NOTE: requires the runner to spawn TWO server processes with distinct `instanceId`s, and the result-checking step to confirm both instances saw at least 5 calls each (lower bound for "roughly even").

`scenarios/crash-recovery.yaml`:
```yaml
name: crash recovery via XCLAIM
matrix: both
contract: arith
servers: 2
crashServerAfterMs: 100
consumerClaimIdleMs: 200
client:
  defaultTimeoutMs: 5000
calls:
  - method: arith.add
    params: { a: 1, b: 2 }
    expect: { result: { sum: 3 } }
```

`scenarios/schema-hash.yaml`:
```yaml
name: schema-hash manifest cross-side equality
matrix: ts-only   # this scenario is runner-internal; no driver subprocess needed
calls: []
expect:
  manifestEqualsAcrossSides: true
```

- [ ] **Step 2: Commit**

```bash
git add tests/interop/scenarios/ tests/interop/contracts/arith.ts tests/interop/drivers/
git commit -m "feat(interop): scenario YAML files (basic, error, validation, notification, timeout, concurrent, worker-pool, crash, schema-hash) + slowAdd contract method"
```

---

## Task 6: Runner library + run.sh

**Files:**
- Create: `tests/interop/lib/package.json`
- Create: `tests/interop/lib/tsconfig.json`
- Create: `tests/interop/lib/runner.ts`
- Create: `tests/interop/lib/docker.ts`
- Create: `tests/interop/run.sh`

- [ ] **Step 1: Write `lib/package.json`**

```json
{
  "name": "@clamator/interop-runner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "clean": "rm -rf dist .tsbuildinfo",
    "start": "tsx runner.ts"
  },
  "dependencies": {
    "yaml": "^2.5.0",
    "ioredis": "^5.4.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "@types/node": "^20.0.0"
  }
}
```

- [ ] **Step 2: Write `lib/tsconfig.json`**

```json
{
  "extends": "../../../ts/tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "tsBuildInfoFile": ".tsbuildinfo"
  },
  "include": ["runner.ts", "docker.ts"]
}
```

- [ ] **Step 3: Write `lib/docker.ts`** — minimal helpers

```typescript
import { spawn, spawnSync } from 'node:child_process';

export function dockerComposeUp(file: string): void {
  const r = spawnSync('docker', ['compose', '-f', file, 'up', '-d', 'redis'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('docker compose up failed');
}

export function dockerComposeDown(file: string): void {
  spawnSync('docker', ['compose', '-f', file, 'down', '-v'], { stdio: 'inherit' });
}

export async function waitForRedis(redisUrl: string, attempts = 30): Promise<void> {
  const { default: IORedis } = await import('ioredis');
  for (let i = 0; i < attempts; i++) {
    const r = new IORedis(redisUrl);
    try {
      const pong = await r.ping();
      await r.quit();
      if (pong === 'PONG') return;
    } catch { /* retry */ }
    await new Promise(res => setTimeout(res, 200));
  }
  throw new Error('redis never became ready');
}
```

- [ ] **Step 4: Write `lib/runner.ts`**

> This is the largest file. It loads each scenario, regenerates fixtures, spawns the right server + client subprocesses, collects results, and asserts expectations. For brevity in this plan, the file is described in detail in implementation steps but the engineer writes it incrementally:
>
> 1. Load all `scenarios/*.yaml` via `yaml.parse`.
> 2. For each scenario, expand into directional runs based on `matrix` field (`both` → `[ts→py, py→ts]`).
> 3. For each directional run:
>    - Pick `serverLang` and `clientLang`.
>    - Compute a unique `keyPrefix` (`clam-interop-${scenarioName}-${dir}-${rand}`).
>    - Spawn server subprocess (`node` for ts, `uv run python` for py) with stdin = JSON config.
>    - Wait for `READY` line on stdout (timeout 10s).
>    - For `servers: 2` scenarios, spawn a second server with a different `instanceId`.
>    - Spawn client subprocess; pipe scenario JSON config + calls to stdin.
>    - Collect client's stdout JSON.
>    - For each call in the scenario, assert against the corresponding result entry.
>    - For `crashServerAfterMs` scenarios, after the configured delay, kill the first server process with SIGKILL.
>    - For `worker-pool` scenarios, for each server's stderr/stdout signal which calls it handled (drivers can be extended to log each handled call). Verify both saw ≥ N/10 calls.
>    - For `schema-hash` scenarios, run the codegen twice from disjoint working dirs and compare the manifest JSON byte-for-byte.
>    - Tear down subprocesses.
>    - Clean up `keyPrefix:*` keys via redis.
> 4. Aggregate failures; exit non-zero on any failure.
>
> Implementation guidance (skeleton only, fill in step-by-step):

```typescript
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { parse as yamlParse } from 'yaml';
import { dockerComposeUp, dockerComposeDown, waitForRedis } from './docker.js';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const COMPOSE_FILE = path.resolve('tests/interop/docker-compose.yml');
const SCENARIOS_DIR = path.resolve('tests/interop/scenarios');

interface Scenario {
  name: string;
  matrix: 'both' | 'ts-only' | 'py-only';
  contract: string;
  servers?: number;
  client?: { defaultTimeoutMs?: number; concurrent?: number };
  consumerClaimIdleMs?: number;
  crashServerAfterMs?: number;
  calls: ScenarioCall[];
  expect?: Record<string, unknown>;
}
interface ScenarioCall {
  method: string;
  params?: unknown;
  notification?: boolean;
  repeat?: number;
  expect?: Record<string, unknown>;
}

interface RunResult { name: string; direction: string; passed: boolean; reason?: string; }

function loadScenarios(): Scenario[] {
  return readdirSync(SCENARIOS_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(f => yamlParse(readFileSync(path.join(SCENARIOS_DIR, f), 'utf-8')) as Scenario);
}

function spawnDriver(role: 'server' | 'client', lang: 'ts' | 'py', cfg: unknown): ChildProcessWithoutNullStreams {
  const cwd = path.resolve('.');
  const env = { ...process.env };
  let proc: ChildProcessWithoutNullStreams;
  if (lang === 'ts') {
    proc = spawn('pnpm', ['--filter', '@clamator/interop-driver-ts', 'exec', 'tsx', `tests/interop/drivers/ts/${role}.ts`], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  } else {
    proc = spawn('uv', ['run', 'python', `tests/interop/drivers/py/${role}.py`], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
  }
  proc.stdin.write(JSON.stringify(cfg));
  proc.stdin.end();
  return proc;
}

async function waitForReady(proc: ChildProcessWithoutNullStreams, timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server READY timeout')), timeoutMs);
    proc.stdout.on('data', chunk => {
      if (chunk.toString().includes('READY')) {
        clearTimeout(timer); resolve();
      }
    });
    proc.on('exit', code => reject(new Error(`server exited ${code} before READY`)));
  });
}

async function readClientJson(proc: ChildProcessWithoutNullStreams, timeoutMs = 30_000): Promise<{ results: any[] }> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    const timer = setTimeout(() => reject(new Error('client output timeout')), timeoutMs);
    proc.stdout.on('data', c => chunks.push(c.toString()));
    proc.on('exit', () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(chunks.join(''))); }
      catch (e) { reject(new Error(`bad client JSON: ${(e as Error).message}\n${chunks.join('')}`)); }
    });
  });
}

async function regenFixtures(): Promise<void> {
  const r = spawn('pnpm', ['--filter', '@clamator/codegen', 'exec', 'clamator-codegen',
    '--src', 'tests/interop/contracts',
    '--out-ts', 'tests/interop/generated/ts',
    '--out-py', 'tests/interop/generated/py',
    '--manifest', 'tests/interop/generated/manifest.json',
    '--ts-contract-import', '../../contracts/index.js',
  ], { stdio: 'inherit' });
  await new Promise<void>((res, rej) => r.on('exit', code => code === 0 ? res() : rej(new Error(`codegen exited ${code}`))));
}

async function runScenario(s: Scenario): Promise<RunResult[]> {
  const directions: { server: 'ts' | 'py'; client: 'ts' | 'py' }[] =
    s.matrix === 'ts-only' ? [{ server: 'ts', client: 'ts' }]
    : s.matrix === 'py-only' ? [{ server: 'py', client: 'py' }]
    : [{ server: 'ts', client: 'py' }, { server: 'py', client: 'ts' }];

  const out: RunResult[] = [];
  for (const dir of directions) {
    const keyPrefix = `clam-interop-${s.name.replace(/\W+/g, '-')}-${dir.server}${dir.client}-${Math.random().toString(36).slice(2, 6)}`;
    let serverA: ChildProcessWithoutNullStreams | null = null;
    let serverB: ChildProcessWithoutNullStreams | null = null;
    try {
      serverA = spawnDriver('server', dir.server, {
        contract: s.contract, redisUrl: REDIS_URL, keyPrefix,
        instanceId: 'srv-A', consumerClaimIdleMs: s.consumerClaimIdleMs ?? 60_000,
        generatedDir: dir.server === 'py' ? 'tests/interop/generated/py' : undefined,
      });
      await waitForReady(serverA);
      if (s.servers && s.servers >= 2) {
        serverB = spawnDriver('server', dir.server, {
          contract: s.contract, redisUrl: REDIS_URL, keyPrefix,
          instanceId: 'srv-B', consumerClaimIdleMs: s.consumerClaimIdleMs ?? 60_000,
        });
        await waitForReady(serverB);
      }
      if (s.crashServerAfterMs) {
        setTimeout(() => { try { serverA?.kill('SIGKILL'); } catch {} }, s.crashServerAfterMs);
      }
      const calls = expandCalls(s.calls);
      const client = spawnDriver('client', dir.client, {
        redisUrl: REDIS_URL, keyPrefix, defaultTimeoutMs: s.client?.defaultTimeoutMs ?? 5000,
        calls,
      });
      const { results } = await readClientJson(client);
      const failure = checkExpectations(s, results);
      out.push({ name: s.name, direction: `${dir.server}→${dir.client}`, passed: failure === null, reason: failure ?? undefined });
    } finally {
      try { serverA?.kill('SIGTERM'); } catch {}
      try { serverB?.kill('SIGTERM'); } catch {}
      // best-effort cleanup
      const { default: IORedis } = await import('ioredis');
      const r = new IORedis(REDIS_URL);
      const keys = await r.keys(`${keyPrefix}:*`);
      if (keys.length) await r.del(...keys);
      await r.quit();
    }
  }
  return out;
}

function expandCalls(calls: ScenarioCall[]): unknown[] {
  const out: unknown[] = [];
  for (const c of calls) {
    const n = c.repeat ?? 1;
    for (let i = 0; i < n; i++) out.push({ method: c.method, params: c.params, notification: c.notification });
  }
  return out;
}

function checkExpectations(s: Scenario, results: any[]): string | null {
  let idx = 0;
  for (const c of s.calls) {
    const n = c.repeat ?? 1;
    for (let i = 0; i < n; i++) {
      const r = results[idx++];
      if (!c.expect) continue;
      const exp: any = c.expect;
      if (exp.result !== undefined) {
        if (r.kind !== 'result') return `call ${idx}: expected result, got ${r.kind}: ${JSON.stringify(r)}`;
        if (JSON.stringify(r.result) !== JSON.stringify(exp.result))
          return `call ${idx}: result mismatch: got ${JSON.stringify(r.result)}, want ${JSON.stringify(exp.result)}`;
      } else if (exp.error !== undefined) {
        if (r.ok !== false) return `call ${idx}: expected error, got ok`;
        if (exp.error.code !== undefined && r.code !== exp.error.code)
          return `call ${idx}: code mismatch: got ${r.code}, want ${exp.error.code}`;
        if (exp.error.messageMatches && !new RegExp(exp.error.messageMatches).test(r.message))
          return `call ${idx}: message ${r.message} does not match /${exp.error.messageMatches}/`;
        if (exp.error.kind && r.kind !== exp.error.kind)
          return `call ${idx}: error-kind mismatch: got ${r.kind}, want ${exp.error.kind}`;
      } else if (exp.kind === 'notification') {
        if (r.kind !== 'notification') return `call ${idx}: expected notification ack, got ${r.kind}`;
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  dockerComposeUp(COMPOSE_FILE);
  try {
    await waitForRedis(REDIS_URL);
    await regenFixtures();
    const scenarios = loadScenarios();
    const results: RunResult[] = [];
    for (const s of scenarios) {
      const r = await runScenario(s);
      results.push(...r);
    }
    const failed = results.filter(r => !r.passed);
    for (const r of results) {
      console.log(`${r.passed ? 'PASS' : 'FAIL'}  ${r.name}  (${r.direction})${r.reason ? `\n     ${r.reason}` : ''}`);
    }
    if (failed.length) process.exit(1);
  } finally {
    if (process.env.INTEROP_KEEP_DOCKER !== '1') dockerComposeDown(COMPOSE_FILE);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 5: Write `tests/interop/run.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
cd ts && pnpm install
pnpm --filter @clamator/interop-runner exec tsx tests/interop/lib/runner.ts
```

```bash
chmod +x tests/interop/run.sh
```

- [ ] **Step 6: Smoke run on a small subset**

Comment out all but `basic-call.yaml`, then:

```bash
bash tests/interop/run.sh
```

Expected: `PASS  basic call  (ts→py)` and `PASS  basic call  (py→ts)`. Re-enable other scenarios, fix per-scenario edges (timeout, worker-pool, crash-recovery), iterate until all pass.

- [ ] **Step 7: Commit**

```bash
git add tests/interop/lib/ tests/interop/run.sh
git commit -m "feat(interop): scenario runner + run.sh"
```

---

## Task 7: Verify `make interop`

- [ ] **Step 1: Run end-to-end**

```bash
make clean && make install && make build && make interop
```

Expected: every scenario passes in both directions.

- [ ] **Step 2: Confirm no leftover redis state**

```bash
docker ps  # no redis running
ls tests/interop/generated  # exists, has fresh files
```

- [ ] **Step 3: Schema-hash scenario (manifest equality)**

The `schema-hash.yaml` scenario relies on the runner emitting a manifest from one walk + asserting it byte-equals the result of a second run. Implement that branch in `runner.ts` (currently sketched as `ts-only` matrix) by re-running codegen into a tempdir and comparing manifests; assert equality.

- [ ] **Step 4: Commit any followups**

```bash
git status
# commit any small fixes uncovered during full-suite run
```

---

## Task 8: tests/interop README + sibling-consistency review

**Files:**
- Create: `tests/interop/README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Interop tests

Cross-language end-to-end tests for `over-redis`. Memory transport is in-process and is tested per-language under `ts/packages/over-memory/tests` and `py/packages/over-memory/tests`.

## Run

```bash
make interop
```

Requires: docker compose, pnpm, uv.

## Layout

- `contracts/` — source-of-truth Zod contracts.
- `generated/` — regenerated each run; gitignored.
- `drivers/{ts,py}/` — minimal CLI drivers used as server/client subprocesses.
- `scenarios/*.yaml` — declarative test cases, directional matrix.
- `lib/runner.ts` — scenario expansion + subprocess orchestration.
- `run.sh` — entrypoint.

## Adding a scenario

1. Add a YAML file under `scenarios/`.
2. If the scenario needs a new contract method, add it to `contracts/`. Both languages pick it up automatically through codegen + drivers.
3. Run `make interop`. Iterate until both directions pass.
```

- [ ] **Step 2: Commit**

```bash
git add tests/interop/README.md
git commit -m "docs(interop): README"
```
