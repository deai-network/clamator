# clamator v0.1 — design spec

**Date:** 2026-05-07
**Status:** Design approved by user. Ready for implementation planning.
**License:** Apache 2.0

## 1. Goals + scope

### Goals

Clamator is a polyglot RPC library for TypeScript ↔ Python. Single source of truth for method contracts is Zod (TS); Python types are codegenned. Wire format is JSON-RPC 2.0. Transport is pluggable; v0.1 ships in-memory and redis-streams adapters. Library is consumer-agnostic — exposes interfaces, ships no consumer wiring.

### Niche

Polyglot TS↔Py RPC where the substrate is a queue/stream (redis-streams, NATS in v0.2), with Zod as authoritative contract. Distinct from gRPC (HTTP/2-locked, .proto IDL), tRPC/ts-rest (TS-only, HTTP-bound), raw JSON-RPC libraries (no contract layer), and queue libraries (no typed-RPC layer). Trades binary wire-format byte savings for debuggability and ecosystem alignment.

### v0.1 scope

Ships these published packages, lockstep version `0.1.0`:

- npm: `@clamator/protocol`, `@clamator/over-memory`, `@clamator/over-redis`, `@clamator/codegen`
- PyPI: `clamator-protocol`, `clamator-over-memory`, `clamator-over-redis`

Plus:

- Cross-lang interop test suite covering both transports.
- Apache 2.0 license file at repo root.
- `AGENTS.md` documenting agent rules + release procedure.

### Non-goals (deferred to v0.x+)

- NATS adapter; HTTP/WebSocket adapters.
- Bidirectional / server-initiated calls.
- Streaming method results.
- Batch requests.
- Cancellation propagation.
- Sync API wrappers.
- Observability / telemetry interfaces.
- Metrics adapters.
- Scaffolding tool for new consumers.
- Auth abstraction (consumer routes through transport-level TLS + ACLs).
- Encryption abstraction (consumer concern, lives inside `params`).

### Inviolates

- Protocol package does no I/O.
- Method contracts namespaced as `<service>.<method>`.
- Server methods documented as idempotent (not enforced).
- Validation at every edge (TS-out, TS-in, Py-out, Py-in).
- Async-only API in both languages.

## 2. Repository layout

```
clamator/
├── LICENSE                          # Apache 2.0
├── README.md
├── AGENTS.md                        # rules for agents, release procedure
├── CHANGELOG.md
├── Makefile                         # global targets
├── docs/
│   └── 2026-05-07-clamator-design.md
├── ts/
│   ├── package.json                 # pnpm workspace root, devDeps only
│   ├── pnpm-workspace.yaml
│   ├── tsconfig.base.json
│   └── packages/
│       ├── protocol/                # @clamator/protocol
│       ├── over-memory/             # @clamator/over-memory
│       ├── over-redis/              # @clamator/over-redis
│       └── codegen/                 # @clamator/codegen (CLI)
├── py/
│   ├── pyproject.toml               # uv workspace root
│   ├── uv.lock
│   └── packages/
│       ├── protocol/                # clamator-protocol
│       ├── over-memory/             # clamator-over-memory
│       └── over-redis/              # clamator-over-redis
├── tests/
│   └── interop/
│       ├── docker-compose.yml       # redis test service
│       ├── contracts/               # shared Zod contract sources
│       ├── generated/               # codegen output, gitignored
│       ├── drivers/
│       │   ├── ts/
│       │   └── py/
│       ├── scenarios/               # YAML scenario specs
│       ├── lib/
│       └── run.sh
├── .github/workflows/
│   ├── ts.yml                       # pnpm install/lint/test/build per pkg
│   ├── py.yml                       # uv sync, ruff, pytest per pkg
│   ├── interop.yml                  # docker-compose redis, run interop suite
│   └── release.yml                  # tag-triggered verification only (no publish)
├── scripts/
│   └── release.sh                   # version bump + local publish driver
└── .gitignore
```

### AGENTS.md rules

- **Flat `docs/` directory.** Never write to nested skill-named subdirs (no `docs/superpowers/...`, no `docs/specs/...`).
- **No `Co-Authored-By` trailer in git commits.**
- (Plus release-procedure section, see § 10.)

### Makefile (global targets)

```makefile
.PHONY: install build test clean release interop lint

install:    ## install deps in both langs
	cd ts && pnpm install
	cd py && uv sync

build:      ## build all packages
	cd ts && pnpm -r build
	cd py && uv build --all

lint:
	cd ts && pnpm -r lint
	cd py && uv run ruff check .

test:       ## per-lang unit tests (no interop)
	cd ts && pnpm -r test
	cd py && uv run pytest

interop:    ## cross-lang interop tests (regen fixtures, spin redis, run scenarios)
	bash tests/interop/run.sh

clean:      ## delegate clean to every package + drop interop artifacts
	cd ts && pnpm -r clean
	cd py && find packages -type d \( -name dist -o -name build -o -name .pytest_cache -o -name __pycache__ \) -exec rm -rf {} +
	rm -rf tests/interop/.tmp tests/interop/generated
	rm -rf ts/node_modules

release:    ## lockstep version bump + local publish to npm + PyPI
	bash scripts/release.sh
```

No standalone `make codegen` target — codegen output is consumer-side; clamator dogfoods it inside `tests/interop/run.sh` only.

## 3. Wire envelope (JSON-RPC 2.0)

Adopted verbatim. All envelopes JSON-encoded UTF-8.

### Message shapes

**Request.**
```json
{ "jsonrpc": "2.0", "method": "<service>.<method>", "params": <object>, "id": "<uuid>" }
```

**Success response.**
```json
{ "jsonrpc": "2.0", "id": "<uuid>", "result": <object> }
```

**Error response.**
```json
{ "jsonrpc": "2.0", "id": "<uuid>", "error": { "code": <int>, "message": "<string>", "data": <object | null> } }
```

**Notification.** Same as request but without `id`. No reply produced.

### Method namespacing

`method` is always `<service>.<method>`. Single dot is significant.

- Service names match `^[a-z][a-z0-9-]*$`.
- Method names match `^[a-z][a-zA-Z0-9-]*$`.
- Protocol package validates format on send + receive.

### Reserved error codes

| Code | Meaning |
|---|---|
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32700 | Parse error |
| -32000..-32099 | Application-defined (consumer's range) |

### Error class

Both languages export `RpcError` with fields `code: int`, `message: str`, `data: object | null`. Throwing `RpcError` from a handler produces a corresponding error response. Throwing any other exception → -32603 with `data` containing exception class name + serializable subset of attributes.

### Encoding rules

- UTF-8 JSON only. No msgpack/cbor in v0.1.
- Envelope is opaque to applications. Adapters serialize at the transport boundary.
- Batch requests not supported in v0.1; adapter rejects with -32600 if encountered.

## 4. Contract DSL + method shape

Single source of truth: Zod schemas in TS. `@clamator/protocol` exports `defineContract`, `defineMethod`, `defineNotification` typing helpers.

### Method shape

```typescript
type MethodDef<P extends z.ZodTypeAny, R extends z.ZodTypeAny> = {
  params: P;
  result: R;
  notification?: false;
};

type NotificationDef<P extends z.ZodTypeAny> = {
  params: P;
  notification: true;
};

type Contract<S extends string, M extends Record<string, MethodDef<any,any> | NotificationDef<any>>> = {
  service: S;
  methods: M;
};
```

### Validation at definition time

`defineContract(service, methods)` throws synchronously if:

- `service` does not match `^[a-z][a-z0-9-]*$`.
- Any method key does not match `^[a-z][a-zA-Z0-9-]*$`.
- A non-notification method def lacks `result`.
- A notification method def includes `result`.

### Example

```typescript
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification } from '@clamator/protocol';

export const engineContract = defineContract('engine', {
  launch: defineMethod({
    params: z.object({ processId: z.string(), resume: z.boolean().optional() }),
    result: z.object({ launched: z.boolean() }),
  }),
  cancel: defineMethod({
    params: z.object({ processId: z.string() }),
    result: z.object({ cancelled: z.boolean() }),
  }),
  resync: defineNotification({
    params: z.object({ clean: z.boolean().optional() }),
  }),
});
```

### Python side

Python does **not** redefine contracts. Codegen produces:

- Pydantic v2 models per `params` and `result` schema.
- A typed `<Service>Client` class with one method per contract method.
- A `<Service>Service` ABC with abstract methods matching the contract.
- A method-name registry dict mapping method names to `(params_model, result_model_or_none)` for runtime dispatch.

### Centralized vs alternatives (rejected)

- Per-method-file definitions: rejected — scatters discovery, complicates codegen walker.
- Decorator-only on server: rejected — client side gets no compile-time guarantee that calls match server-registered methods.

Centralized matches Zod ecosystem conventions (ts-rest pattern). One file per service, all methods in one object.

## 5. Codegen pipeline (`@clamator/codegen`)

### CLI

```bash
clamator-codegen \
  --src <dir>                  # contains *.ts files with defineContract calls
  --out-ts <dir>               # generated TS wrappers go here (omit to skip)
  --out-py <dir>               # generated Py wrappers go here (omit to skip)
  [--manifest <path>]          # optional cross-side manifest output
  [--json-schema-target jsonSchema7|openApi3]
  [--ts-contract-import <module-path>]   # how generated TS imports source contract
  [--watch]                    # re-run on src change
```

### Pipeline

1. Walk `--src` for files exporting `defineContract(...)` calls. Use TS compiler API + tsx loader to evaluate them at runtime — captures `Contract` objects with full Zod fidelity.
2. Per contract per method, convert `params` + `result` Zod schemas to JSON Schema via `zod-to-json-schema`. Default target `jsonSchema7`. Artifacts written to a tempdir; not committed.
3. Emit TS wrappers to `--out-ts/<service>.ts`:
   - `<Service>Client` class with one async method per contract method.
   - `<Service>Service` interface for server-handler shape.
   - Re-imports the source contract via configured path.
4. Emit Py wrappers to `--out-py/<service>.py`:
   - Pydantic v2 models per type via `datamodel-code-generator`.
   - `<Service>Client` class.
   - `<Service>Service` ABC with abstract methods.
   - `METHODS` dict: `{ "method_name": (ParamsModel, ResultModel | None) }`.
5. Optional `--manifest`: JSON map `{service: {method: {params_schema_hash, result_schema_hash}}}` for CI-side cross-language drift detection.

### Output file headers

Every generated file starts with:

```
// AUTO-GENERATED by @clamator/codegen vX.Y.Z from <source-file>.
// DO NOT EDIT. Re-run codegen to update.
```

(Comment syntax adjusted per language.)

### Generated TS shape (example)

```typescript
import { engineContract } from '<configured-import-path>';
import type { ClamatorClient } from '@clamator/protocol';
import type { z } from 'zod';

export type LaunchParams = z.infer<typeof engineContract.methods.launch.params>;
export type LaunchResult = z.infer<typeof engineContract.methods.launch.result>;
// ... etc

export class EngineClient {
  constructor(private client: ClamatorClient) {}
  launch(params: LaunchParams): Promise<LaunchResult> {
    return this.client.call('engine', 'launch', params);
  }
  cancel(params: CancelParams): Promise<CancelResult> {
    return this.client.call('engine', 'cancel', params);
  }
  resync(params: ResyncParams): Promise<void> {
    return this.client.notify('engine', 'resync', params);
  }
}

export interface EngineService {
  launch(params: LaunchParams): Promise<LaunchResult>;
  cancel(params: CancelParams): Promise<CancelResult>;
  resync(params: ResyncParams): Promise<void>;
}
```

### Generated Py shape (example)

```python
from __future__ import annotations
from abc import ABC, abstractmethod
from pydantic import BaseModel
from clamator_protocol import ClamatorClient

class LaunchParams(BaseModel):
    process_id: str
    resume: bool | None = None

class LaunchResult(BaseModel):
    launched: bool

# ... etc

class EngineClient:
    def __init__(self, client: ClamatorClient) -> None:
        self._client = client

    async def launch(self, params: LaunchParams) -> LaunchResult:
        raw = await self._client.call("engine", "launch", params.model_dump(by_alias=True))
        return LaunchResult.model_validate(raw)
    # ...

class EngineService(ABC):
    @abstractmethod
    async def launch(self, params: LaunchParams) -> LaunchResult: ...
    # ...

METHODS = {
    "launch": (LaunchParams, LaunchResult),
    "cancel": (CancelParams, CancelResult),
    "resync": (ResyncParams, None),
}
```

### Naming conventions

- TS class names: PascalCase from contract service name. Hyphens stripped, segments PascalCased (`excavator-engine` → `ExcavatorEngineClient`).
- Py class names: same PascalCase rules.
- Py field names: snake_case from camelCase Zod fields. Pydantic `model_config = {populate_by_name: True}` + Field aliases preserve wire-format camelCase.

### Idempotency + determinism

Re-running with no source change produces no diff (deterministic ordering, stable formatting). Pre-commit hook for consumers (snippet in docs, not enforced): re-run codegen, fail if `git diff` non-empty in `--out-*`.

### Out of scope (v0.1)

- Reverse direction (Pydantic → Zod).
- Non-Pydantic Py output (dataclasses, msgspec, attrs).
- Non-Zod TS source.
- Doc generation from contracts.

## 6. Server / Client API

### Protocol package interfaces

Exports the **interfaces and core base classes**. No I/O.

#### Transport interface

```typescript
export interface Transport {
  registerService(name: string, dispatch: (req: Request) => Promise<Response | null>): Promise<void>;
  send(req: Request, opts: { timeout: number }): Promise<Response>;
  notify(n: Notification): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

```python
class Transport(Protocol):
    async def register_service(self, name: str,
                               dispatch: Callable[[Request], Awaitable[Response | None]]) -> None: ...
    async def send(self, req: Request, *, timeout: float) -> Response: ...
    async def notify(self, n: Notification) -> None: ...
    async def start(self) -> None: ...
    async def stop(self) -> None: ...
```

#### Core classes (`RpcServerCore`, `RpcClientCore`)

Wrap a `Transport`. Exported for transport-author and advanced-consumer use. Typical consumers don't touch these directly.

```typescript
export class RpcServerCore {
  constructor(transport: Transport);
  registerService<S extends string, M>(contract: Contract<S, M>, handlers: HandlersFor<M>): void;
  start(): Promise<void>;
  stop(opts?: { graceMs?: number }): Promise<void>;
}

export class RpcClientCore implements ClamatorClient {
  constructor(transport: Transport, opts?: { defaultTimeoutMs?: number });
  call<P, R>(service: string, method: string, params: P): Promise<R>;
  notify<P>(service: string, method: string, params: P): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ClamatorClient {
  call<P, R>(service: string, method: string, params: P): Promise<R>;
  notify<P>(service: string, method: string, params: P): Promise<void>;
}
```

`HandlersFor<M>` is a mapped type: keys = method names from `M`, values = `(params) => Promise<result>` (or `Promise<void>` for notifications).

### Per-transport facades

Each adapter package exports `<X>RpcServer` and `<X>RpcClient`. Single entry point per role per transport — merged config dict.

#### Memory transport

```typescript
import { MemoryBus, MemoryRpcServer, MemoryRpcClient } from '@clamator/over-memory';

const bus = new MemoryBus();
const server = new MemoryRpcServer({ bus });
const client = new MemoryRpcClient({ bus });
```

```python
from clamator_over_memory import MemoryBus, MemoryRpcServer, MemoryRpcClient

bus = MemoryBus()
server = MemoryRpcServer(bus=bus)
client = MemoryRpcClient(bus=bus)
```

#### Redis transport

```typescript
import { RedisRpcServer, RedisRpcClient } from '@clamator/over-redis';

const server = new RedisRpcServer({
  redis,                            // ioredis (or compatible) instance
  keyPrefix: 'app',
  instanceId: 'srv-1',              // optional, defaults to UUID
  replyStreamMaxLen: 1024,
  consumerClaimIdleMs: 60_000,
  defaultHandlerTimeoutMs: 30_000,
  shutdownGraceMs: 5_000,
});

const client = new RedisRpcClient({
  redis,
  keyPrefix: 'app',
  defaultTimeoutMs: 30_000,
});
```

```python
from clamator_over_redis import RedisRpcServer, RedisRpcClient

server = RedisRpcServer(
  redis=r, key_prefix='app', instance_id='srv-1',
  reply_stream_maxlen=1024, consumer_claim_idle_ms=60_000,
  default_handler_timeout_ms=30_000, shutdown_grace_ms=5_000,
)
client = RedisRpcClient(redis=r, key_prefix='app', default_timeout_ms=30_000)
```

### Server-side registration

```typescript
import { engineContract } from './contracts/engine';
import type { EngineService } from './generated/engine';

const handlers: EngineService = {
  launch: async ({ processId }) => ({ launched: true }),
  cancel: async ({ processId }) => ({ cancelled: true }),
  resync: async ({ clean }) => { /* fire-and-forget */ },
};

server.registerService(engineContract, handlers);
await server.start();
```

```python
from .generated.engine import EngineService, LaunchParams, LaunchResult, CancelParams, CancelResult, ResyncParams
from .contracts.engine import engine_contract

class MyEngine(EngineService):
    async def launch(self, params: LaunchParams) -> LaunchResult:
        return LaunchResult(launched=True)
    async def cancel(self, params: CancelParams) -> CancelResult:
        return CancelResult(cancelled=True)
    async def resync(self, params: ResyncParams) -> None:
        return

server.register_service(engine_contract, MyEngine())
await server.start()
```

### Registration invariant

> Registering two contracts with the same `service` name on one server throws at registration time.

This is pure deduplication. A server CAN register many distinct services in one process. Same service in **different processes** via separate servers is the worker-pool pattern (intended; not an error).

### Service composability — three intended modes

1. **Many services in one process.** One `RpcServer` instance, multiple `registerService` calls. Shares one transport connection and shutdown lifecycle. Default for "monolith with namespaces".
2. **Many processes, same service (worker pool).** Each process spins its own `RpcServer`, all register the same contract. Redis adapter's consumer group load-balances across them.
3. **Many processes, different services.** Each process spins its own `RpcServer`, registers only its services. Routing by service-name → stream-name; processes don't see each other's traffic.

**One server per process is the recommended convention** (not enforced). Multiple servers in one process opens problems: overlapping consumer-group memberships, multiplied lifecycles, undefined load distribution.

### Client calls

```typescript
import { EngineClient } from './generated/engine';

const engine = new EngineClient(client);
const r = await engine.launch({ processId: 'p1' });
//        ^? { launched: boolean }
await engine.resync({ clean: false });   // notification, returns void
```

```python
from .generated.engine import EngineClient, LaunchParams, ResyncParams

engine = EngineClient(client)
r = await engine.launch(LaunchParams(process_id='p1'))
await engine.resync(ResyncParams(clean=False))
```

### Validation at every edge

- **Server inbound**: incoming `params` parsed as Pydantic / Zod. Failure → -32602 (invalid params).
- **Server outbound**: handler return validated against result schema. Failure → -32603 (internal).
- **Client outbound**: params validated before send. Failure throws synchronously.
- **Client inbound**: response validated against result schema. Failure → wrapped as `ClamatorProtocolError`.

### Lifecycle

- `start()` opens transport connections, creates routing primitives, spins consumer loops.
- `stop()` cancels consumer loops, drains in-flight handlers up to `shutdownGraceMs`, closes the transport. Idempotent.

### Error classes

- `RpcError`: application-defined error carrying JSON-RPC `code/message/data`.
- `ClamatorProtocolError`: protocol-level (validation failures, malformed envelope).
- `ClamatorTransportError`: transport-level (connection lost, timeout). Carries `cause`.

Caller distinguishes via `instanceof` / `isinstance`.

### Idempotency contract (documented, not enforced)

Server methods MUST be idempotent. Adapters cannot guarantee exactly-once delivery without significant additional coordination cost; at-least-once with idempotent handlers is the standard alternative. The protocol package documents this; it does not enforce it.

Implementation guidance for handler authors:

- Use stable natural keys.
- For inserts, use upsert patterns rather than raw `insertOne`.
- For irreversible side effects, store a deduplication key derived from the request (e.g., the JSON-RPC `id`) alongside the effect.

### Cancellation

Caller-side cancellation does not propagate to the server in v0.1.

- Adding a `$cancelRequest` notification doubles protocol surface and requires every adapter to support it.
- Idempotency contract makes "client gave up and retried" indistinguishable from "initial-call-plus-retry"; both safe with recommended handler patterns.
- Server-side timeout is the server's concern; protocol does not impose one.

Reconsider if real workload demands it. Documented as deliberate omission, not oversight.

## 7. Transport: `over-memory`

In-process loopback. Primary uses: same-language unit tests for protocol behavior, dev-time iteration without redis.

### `MemoryBus`

Per-process registry of service-name → handler-channel pairings. Server and client must share the same bus instance to communicate. Multiple buses in one process are independent.

### Dispatch

- `registerService(name, dispatch)` stores dispatcher. Throws if the name is already registered on that bus.
- `send(req, opts)` looks up the service, invokes the dispatcher with the envelope. Reply via in-memory promise/future. Timeout enforced.
- `notify(n)` invokes dispatcher with notification. Dispatcher returns null. No reply.

All dispatching is async function calls; no real queue. Microtask scheduling provides natural concurrency.

### Worker pool semantics

Not supported. A `MemoryBus` allows exactly one server per service. Load balancing is meaningless in-process; if you need worker-pool semantics, use a real transport.

### Lifecycle

- `start()` / `stop()` toggle a flag. Calls before `start()` reject; calls after `stop()` reject.
- `stop()` rejects all outstanding pending calls with `ClamatorTransportError("transport stopped")`.

### Non-features

- Cross-process — by definition. If process-bridging is needed, use `over-redis` or a future IPC adapter.
- Persistence — transient bus, all state lost when bus is dropped.
- Multi-bus federation.

## 8. Transport: `over-redis`

Redis-streams adapter implementing the `Transport` interface.

### Stream / key naming

Single `keyPrefix` constructor option (string). All names derived:

| Purpose | Pattern |
|---|---|
| Per-service request stream | `<keyPrefix>:cmds:<service>` |
| Per-service consumer group | (same stream, group name = `<service>`) |
| Per-instance reply stream | `<keyPrefix>:replies:<instance-id>` |

Different `keyPrefix` values isolate clamator deployments on the same redis. Different services within one prefix get different streams; no overlap.

### Worker pool / consumer groups

- Servers consume their service's stream via `XREADGROUP` with consumer group `<service>` and consumer name `<service>:<instance-id>`.
- Group creation: `XGROUP CREATE ... MKSTREAM`, `BUSYGROUP` ignored (idempotent attach).
- Multiple server processes joining the same group share load — each command delivered to exactly one consumer.
- `XACK` on successful handler return.
- Failed handlers (uncaught exception) are mapped to JSON-RPC error responses and the message is acked anyway — error is part of the protocol, not a transport failure.

### Crash recovery

- On consumer startup, inspect Pending Entry List (PEL) via `XPENDING`. Messages whose owner has been idle for > `consumerClaimIdleMs` are claimed via `XCLAIM` and retried by the new consumer.
- Combined with the documented idempotency contract, retried messages are safe.

### Per-call envelope

Outgoing request:
```
XADD <keyPrefix>:cmds:<service> *
  type "rpc"
  envelope <json-rpc request>
  reply-to <keyPrefix>:replies:<instance-id>
```

Single `envelope` field with serialized JSON. `type "rpc"` reserved for forward compatibility.

Notifications: same `XADD` without a `reply-to` field. Server's adapter sees no `reply-to` → does not produce a reply envelope.

### Reply path

- Each `RedisRpcClient` instance picks a UUID `instanceId` on construction (override allowed). Reply stream is per-client-instance and exclusive.
- Reply stream is bounded with `MAXLEN ~ N` (`replyStreamMaxLen`, default 1024). On graceful shutdown, `DEL`'d. If `DEL` is missed (crash), MAXLEN trim caps cost.
- Stale reply streams pose no correctness issue.
- Reply consumer reads via `XREAD` (no consumer group — exclusive stream). Each reply envelope's `id` is matched to in-memory pending-deferred map. No match → drop silently.

### Correlation + timeout

- Client generates UUID per call (the JSON-RPC `id`).
- After `XADD`, registers in-memory deferred + per-call timer (`defaultTimeoutMs` or per-call override).
- On reply: deferred resolved/rejected.
- On timeout: deferred rejected with `ClamatorTransportError("call timeout")`. Late replies dropped silently.

### Connection lifecycle

- Constructor accepts a redis client (ioredis on TS, async-redis on Py) or connection options dict (lib creates client).
- `start()`: ensures consumer groups exist, starts consumer loops, starts reply loop (clients).
- `stop()`: cancels loops, drains in-flight handlers up to `shutdownGraceMs`, `DEL`s the per-instance reply stream (clients), closes the connection if owned.

### Reconnect strategy

Adapter wraps the redis client with retry/backoff for the consumer + reply loops. Underlying-client reconnect delegated to the library (ioredis / redis-py). Backoff exponential, capped (e.g., 100ms → 30s).

### Configuration knobs

| Knob (TS / Py) | Default | Meaning |
|---|---|---|
| `keyPrefix` / `key_prefix` | required | Namespace for streams/keys |
| `instanceId` / `instance_id` | UUID | Identifies this client/server instance |
| `replyStreamMaxLen` / `reply_stream_maxlen` | 1024 | Reply stream bound (client only) |
| `consumerClaimIdleMs` / `consumer_claim_idle_ms` | 60_000 | XCLAIM idle threshold (server only) |
| `defaultTimeoutMs` / `default_timeout_ms` | 30_000 | Default per-call timeout (client only) |
| `defaultHandlerTimeoutMs` / `default_handler_timeout_ms` | 30_000 | Default handler-side timeout (server only) |
| `shutdownGraceMs` / `shutdown_grace_ms` | 5_000 | Drain window on stop |
| `reconnectBackoff` / `reconnect_backoff` | exp 100ms→30s | Backoff schedule for loop restart |

### Out of scope (v0.1)

- Federation across redis instances.
- Observability / metrics interfaces.
- Multi-region replication.
- TLS configuration sugar (consumer configures the redis client with TLS).

## 9. Cross-language interop tests

**Goal.** Prove the wire envelope, codegen output, and transport adapters work consistently across TS↔Py boundaries. v0.1 scope: redis-only (memory transport is in-process by definition; cannot bridge languages).

### Layout

```
tests/interop/
├── docker-compose.yml         # ephemeral redis, no auth
├── contracts/                 # Zod sources for interop scenarios
│   ├── arith.ts
│   └── notifications.ts
├── generated/                 # codegen output, gitignored
│   ├── ts/
│   └── py/
├── drivers/
│   ├── ts/
│   │   ├── server.ts
│   │   └── client.ts
│   └── py/
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
│   └── docker.ts
└── run.sh
```

### Scenario YAML

```yaml
name: basic call ts-server py-client over redis
server: { lang: ts, contract: arith }
client: { lang: py, contract: arith }
transport: redis
calls:
  - method: arith.add
    params: { a: 2, b: 3 }
    expect: { result: { sum: 5 } }
  - method: arith.divide
    params: { a: 10, b: 0 }
    expect: { error: { code: -32000, messageMatches: "division by zero" } }
```

### Runner flow

`tests/interop/run.sh`:

1. `docker compose up -d redis`.
2. Build codegen CLI if not built.
3. Regenerate fixtures: `pnpm exec clamator-codegen --src tests/interop/contracts --out-ts tests/interop/generated/ts --out-py tests/interop/generated/py --manifest tests/interop/generated/manifest.json`.
4. Per scenario:
   - Spawn server-lang subprocess running configured driver + contract registration.
   - Wait for server's `READY` line on stdout.
   - Spawn client-lang subprocess; pipe scenario JSON via stdin.
   - Collect client's structured result on stdout.
   - Assert per-call expectations.
   - Tear down processes.
5. `docker compose down`.

### Matrix

Each scenario runs in 2 directions:

- `(ts-server, py-client)` over redis
- `(py-server, ts-client)` over redis

When NATS adapter ships in v0.2, matrix doubles.

### Where memory transport gets tested

**Not in `tests/interop/`.** Memory is per-language unit testing:

- `ts/packages/over-memory/tests/` — TS-only memory functional tests.
- `py/packages/over-memory/tests/` — Py-only memory functional tests.

These cover protocol-level invariants (validation, error mapping, notification, timeout) without redis as a dep — fast, local, no docker.

### Coverage

- Basic call: TS↔Py.
- Error mapping: `RpcError` round-trip; generic exception → -32603.
- Validation failure: bad params → -32602; bad result → -32603.
- Notifications: fire-and-forget, server handler runs.
- Timeout: short client timeout + slow server → `ClamatorTransportError`.
- Concurrent: 100 calls in flight, all correlated.
- Worker pool: two server processes, calls distribute roughly evenly.
- Crash recovery: kill server mid-handler, second worker picks up via XCLAIM after `consumerClaimIdleMs`.
- Cross-side schema-hash: codegen `--manifest` outputs identical from TS and Py walks of the same Zod source.

### CI integration

`.github/workflows/interop.yml` runs on every PR + on main. Uses GH Actions service container for redis (or docker-compose). Caches pnpm + uv.

## 10. Versioning, publishing, license

### Versioning

- **Lockstep semver across all 7 packages** in v0.1.
- Inter-package deps pinned exactly to lockstep version (e.g., `@clamator/over-redis@0.1.0` → `@clamator/protocol: 0.1.0`, no `^`).
- Pre-1.0 disclaimer in README + each pkg description: API stability not guaranteed; minor versions may break.
- Lockstep model revisited at v1.0.

### Tag + release flow

- Single git tag per release: `v0.1.0`, `v0.1.1`, etc.
- `scripts/release.sh` (called by `make release`) is the single entry point. Steps in §10 of AGENTS.md.

### npm publishing — local upload

- User maintains `~/.npmrc`:
  ```
  @clamator:registry=https://registry.npmjs.org/
  //registry.npmjs.org/:_authToken=<token>
  ```
- `release.sh` runs `npm publish --access public` per package locally, in dep order. Errors on auth missing.
- Each pkg's `package.json` has `"publishConfig": { "access": "public" }`.
- Pre-publish hook verifies `name` field matches `@clamator/*`.

### PyPI publishing — local upload (twine)

- User maintains `~/.pypirc` with API token.
- `release.sh` runs `uv build` then `twine upload dist/*` per package locally, in dep order.

### GH Actions release workflow — verification only

`.github/workflows/release.yml` triggers on tag push `v*.*.*`:

- Re-runs build + tests + interop on the tagged ref. Green badge for the release.
- Creates GH Release from tag with auto-generated commit-log notes.
- **Does not publish.** Publishing is local via `release.sh`.

### License

- Apache 2.0.
- Single `LICENSE` file at repo root.
- Each published pkg includes `LICENSE` in dist (npm `files`, PyPI `package-data`).
- `pyproject.toml` `license = { text = "Apache-2.0" }` per pkg.
- `package.json` `"license": "Apache-2.0"` per pkg.
- No per-file copyright headers in v0.1.

### Changelog

- `CHANGELOG.md` at repo root, Keep-a-Changelog style.
- Manual entries written as part of the release commit (release.sh prompts for the changelog block).
- No tooling-driven changelog generation in v0.1.

### AGENTS.md release section

```markdown
## Release process

When the user says "bump version and release", "ship a release", or similar, run this sequence. Confirm each destructive step with the user before proceeding.

### Pre-checks (refuse to proceed if any fail)
- Working tree clean (`git status` empty).
- On `main` branch.
- `git pull` shows no incoming changes.
- All tests + interop pass: `make test && make interop`.

### Steps
1. Ask user for new version (or compute next patch by default; show suggestion).
2. Run `scripts/release.sh <new-version>`. The script:
   - Updates every `ts/packages/*/package.json` `version`.
   - Updates every `py/packages/*/pyproject.toml` `[project] version`.
   - Updates pinned inter-pkg deps to new version.
   - Runs `make build && make test && make interop`.
3. Show the user the diff. Wait for explicit confirmation before proceeding.
4. Commit changes with message `release: vX.Y.Z`. **No `Co-Authored-By` trailer.**
5. Tag `vX.Y.Z`. Push branch + tag.
6. After GH Actions verification workflow passes on the tag, run the publish phase of `release.sh`:
   - `npm publish --access public` for each TS pkg in dep order.
   - `uv build` then `twine upload dist/*` for each Py pkg in dep order.
7. Confirm successful publish: `npm view @clamator/protocol@X.Y.Z` and `pip index versions clamator-protocol`.

### Refuse to
- Skip the verification GH Actions check.
- Use `--no-verify`, `--force`, `--no-gpg-sign`, or any other bypass flag.
- Edit `release.sh` to silence pre-checks.
- Add a `Co-Authored-By` trailer to release commits.
- Push without first showing the diff to the user.
```

## 11. Open implementation choices (for planning agent)

Decisions deferred to the planning agent / implementer.

### Protocol package

- Whether `defineMethod` / `defineNotification` are runtime functions or pure type-helper identity functions.
- Whether `Contract.service` is exposed as a brand or a plain string field.
- Naming of helper types: `Method`, `Notification`, `RpcError` vs `MethodDef`, etc.
- TS publishing format: ESM-only (recommended) or dual ESM/CJS.

### Codegen package

- TS contract evaluation: tsx loader + Node ESM, jiti, or ts-node.
- Pydantic generation: `datamodel-code-generator` shell-out vs Python lib API.
- Python field-name policy: snake_case-with-aliases (recommended) vs camelCase to match wire.
- Incremental builds: full re-emit (default) vs cached hashing as opt-in.
- `zod-to-json-schema` target (`jsonSchema7` vs `openApi3`).
- Whether codegen invokes formatters on output or leaves to consumer's pre-commit.

### Server / Client API

- Server handler shape (TS): plain object map vs generated `<Service>Service` interface enforced via TS structural typing only.
- Server handler shape (Py): handler-class-via-ABC (sketched) vs handler-dict-of-callables.
- Whether `start()` / `stop()` couple to constructor or stay explicit (recommended explicit).
- Whether `RedisRpcServer` / `RedisRpcClient` subclass `RpcServerCore` / `RpcClientCore` or compose them.

### Memory transport

- Whether `MemoryBus` allows re-registration after stop or is bound to first registration. (§7 specifies that stopped-state calls reject; the re-registration question is separate.)

### Redis transport

- Reply-stream consumer model: blocking `XREAD` (recommended) vs polling.
- Reconnect/retry wrapper as own class or inlined.
- Whether to expose redis-side stats (PEL size, group lag) as adapter properties (probably not v0.1).
- `XADD` field encoding: single `envelope` with serialized JSON (recommended) vs split fields.

### Interop tests

- YAML scenario format (recommended) vs TS-native.
- Driver subprocess wire format: JSON-over-stdio (recommended) vs file fixtures.
- Worker-pool fairness threshold per scenario.

### Versioning / release

- Pre-publish checks beyond release.sh (lint, type-check, etc.).
- Whether GH Actions verification workflow is required-status-check on `main`.

### Documentation

- README structure.
- Whether to ship a "getting started" walkthrough alongside v0.1 or defer.
