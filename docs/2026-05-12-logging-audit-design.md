# Logging audit: eliminate silent exception swallowing

**Date:** 2026-05-12
**Status:** Design — approved during brainstorm session, ready for implementation.

## Problem

`server_core` and the redis/memory transports catch exceptions and translate them into JSON-RPC error envelopes (`-32603 Internal error`, `-32603 Result validation failed`, `-32602 Invalid params`) or silently drop them inside background loops. None of these paths log. The client sees only the wire envelope; the operator sees nothing.

The trigger was an excavator session where `PUT /api/sources/:id` returned `500` with `{"code":"-32603","message":"Internal error"}` and no log line on the server. Root cause was a pydantic `AwareDatetime` rejecting a tz-naive `createdAt` returned by the handler — a result-validation failure that should have produced an `ERROR`-level log identifying the contract/handler drift.

Audit found mirrored gaps on the TS side: same `-32603 Internal error` and `-32603 Result validation failed` paths, plus background loop silent-swallows in `over-redis` (consumer-loop, reclaim-loop, reply-loop, envelope parse, reply json parse).

## Goal

Every server-side fault path emits a log line. Wire format unchanged.

## Non-goals

- General observability/telemetry/metrics interfaces (deferred per `backlog.md`).
- Logging configuration helpers — applications configure their logger themselves.
- Cleanup-path coverage (best-effort `quit`/`disconnect`/`del` and `BUSYGROUP` idempotency filter stay silent — these are expected failures, not faults).
- Client-side request-failure logging — clients receive typed exceptions; logging policy belongs to the caller.

## Audit — sites to fix (★ = real silent swallow)

### Py protocol — `py/packages/protocol/src/clamator_protocol/server_core.py`
- L60 params `ValidationError` → `-32602 Invalid params` — silent ★
- L80 handler `Exception` → `-32603 Internal error` — silent ★
- L93 result `ValidationError` → `-32603 Result validation failed` — silent ★

### Py over-memory — `py/packages/over-memory/src/clamator_over_memory/transport.py`
- L55 dispatcher `Exception` → rejected as `ClamatorTransportError("dispatcher threw", cause=e)`. Caller observes; original traceback hidden behind wrapper ★

### Py over-redis — `py/packages/over-redis/src/clamator_over_redis/server_transport.py`
- L109 consumer-loop `Exception` → sleep+retry, silent ★
- L128 reclaim-loop `Exception` → silent ★
- L146 envelope parse fail → `xack`, silent ★

### Py over-redis — `py/packages/over-redis/src/clamator_over_redis/client_transport.py`
- L132 reply json parse fail → continue, silent ★
- L140 reply-loop `Exception` → sleep+retry, silent ★

### TS protocol — `ts/packages/protocol/src/server-core.ts`
- L51 params zod parse fail → `-32602 Invalid params` — silent ★
- L63 handler throw → `-32603 Internal error` — silent ★
- L76 result zod parse fail → `-32603 Result validation failed` — silent ★

### TS over-memory — `ts/packages/over-memory/src/transport.ts`
- L58 dispatcher throw → rejected as `ClamatorTransportError('dispatcher threw', e)` — wrapper hides original ★

### TS over-redis — `ts/packages/over-redis/src/server-transport.ts`
- L135 consumer-loop catch → sleep+retry, silent ★
- L167 reclaim-loop catch → silent ★
- L186/188 envelope parse fail → `xack`, silent ★

### TS over-redis — `ts/packages/over-redis/src/client-transport.ts`
- L154 reply json parse fail → continue, silent ★
- L163 reply-loop catch → sleep+retry, silent ★

(L111 `runReplyLoop().catch(err => console.error(...))` already logs fatal-startup failures; left as-is.)

### Out of scope — cleanup paths (stay silent)

Py over-redis client_transport: L107 (delete reply stream), L112 (aclose).
Py over-redis server_transport: L66 (BUSYGROUP filter), L90 (aclose).
TS over-redis server-transport: L80 (BUSYGROUP filter), L101/110/114 (disconnect/quit best-effort).
TS over-redis client-transport: L78 (xadd failure rejects pending — not silent), L121/122/128/129/132 (best-effort during stop).

## Decisions

### D1. Log levels — operator-loud

| Site | Level |
|---|---|
| handler throw (`-32603 Internal`) | ERROR |
| result-validation fail (`-32603 Result`) | ERROR |
| params-validation fail (`-32602`) | WARNING |
| transport loop exception (consumer / reclaim / reply) | ERROR |
| envelope parse fail (poison message) | WARNING |
| reply json parse fail (client side) | WARNING |
| dispatcher-wrapper (over-memory L55 / L58) | WARNING |

No DEBUG sites. Cleanup catches stay silent.

`RpcError` from a handler is **not** logged — it's the typed/expected-failure path.

### D2. Log shape — hybrid

Human-readable message string + namespaced structured fields.

**Py.** `logger.error("RPC handler raised: %s.%s id=%s", service, method, rpc_id, extra={"clamator": {"service": service, "method": method, "rpc_id": rpc_id}}, exc_info=True)`. The `clamator` namespace avoids collision with `LogRecord` builtin attributes.

**TS.** `logger.error("RPC handler raised: ${service}.${method} id=${rpc_id}", err, { service, method, rpcId })`. Fields as third arg, exception as second.

### D3. Logger facility — stdlib (Py) + custom interface (TS)

**Py.** `logging.getLogger(__name__)` per module. Standard library convention. App configures handlers/levels. No `basicConfig` in clamator.

**TS.** New module `ts/packages/protocol/src/logger.ts` exports:

```ts
export interface Logger {
  error(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
  warn(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  error: (msg, err, fields) =>
    console.error(`[clamator] ${msg}`, fields ?? {}, err ?? ''),
  warn: (msg, err, fields) =>
    console.warn(`[clamator] ${msg}`, fields ?? {}, err ?? ''),
};
```

Re-exported by `clamator-over-memory` and `clamator-over-redis` so an app imports `Logger` from one place.

### D4. Wiring — constructor injection (TS only)

Each TS component that has a ★ site accepts `logger?: Logger` on its constructor / factory options. Default = `consoleLogger`.

- `Server` (`ts/packages/protocol/src/server.ts`) — already takes options; add `logger?`.
- `InMemoryTransport` — add `logger?` to options.
- `RedisServerTransport` — add `logger?` to options.
- `RedisClientTransport` — add `logger?` to options.

No globals. App passes the same logger to every component it constructs. Convention only.

Py side needs no equivalent — `logging.getLogger(__name__)` is already swappable via stdlib config.

### D5. Tests — minimum coverage, both sides

Per package:

1. **Py protocol** (`py/packages/protocol/tests/test_server_core_logging.py`):
   - `test_logs_handler_exception` — handler raises `ValueError("boom")`; assert response is `-32603 Internal error` AND `caplog` captured an `ERROR`-level record on `clamator_protocol.server_core` containing service, method, exception message, `exc_info` traceback.
   - `test_logs_result_validation_failure` — handler returns a value the result model rejects; assert response is `-32603 Result validation failed` AND `caplog` captured an `ERROR` record with the `errors` payload.
   - `test_logs_params_validation_failure` — invalid params; assert response is `-32602` AND `caplog` captured a `WARNING` record.
   - `test_does_not_log_rpc_error` — handler raises `RpcError`; assert no `ERROR`/`WARNING` records on the logger (RpcError is the typed path).

2. **TS protocol** (`ts/packages/protocol/tests/server-core-logging.test.ts`): same four cases, using a spy logger.

3. **Py over-memory** (`py/packages/over-memory/tests/test_transport_logging.py`): one test — dispatcher throw produces a `WARNING` on `clamator_over_memory.transport` AND the future rejection still carries `cause=e`.

4. **TS over-memory** (`ts/packages/over-memory/tests/transport-logging.test.ts`): same.

5. **Py over-redis** (`py/packages/over-redis/tests/test_logging.py`): one consumer-loop test — inject a failing dispatcher; assert a `WARNING`-or-`ERROR` record on `clamator_over_redis.server_transport`. (Poison-envelope test combined into the same module if cheap.)

6. **TS over-redis** (`ts/packages/over-redis/tests/logging.test.ts`): same.

Total ≈ 10 tests.

**Test fixture details.**
- Py: use pytest `caplog` with `caplog.set_level(logging.WARNING, logger="clamator_protocol.server_core")`. Assert against `caplog.records`.
- TS: define a `recordingLogger()` helper inline in tests that pushes `{level, msg, err, fields}` to an array. Assert against the array.

## Files touched

### Py

- `py/packages/protocol/src/clamator_protocol/server_core.py` — add `import logging; logger = logging.getLogger(__name__)`; 3 log calls.
- `py/packages/protocol/tests/test_server_core_logging.py` — new file, 4 tests.
- `py/packages/over-memory/src/clamator_over_memory/transport.py` — add module logger; 1 log call.
- `py/packages/over-memory/tests/test_transport_logging.py` — new file, 1 test.
- `py/packages/over-redis/src/clamator_over_redis/server_transport.py` — add module logger; 3 log calls.
- `py/packages/over-redis/src/clamator_over_redis/client_transport.py` — add module logger; 2 log calls.
- `py/packages/over-redis/tests/test_logging.py` — new file, 1 test.

### TS

- `ts/packages/protocol/src/logger.ts` — new file: `Logger` interface + `consoleLogger`.
- `ts/packages/protocol/src/index.ts` — re-export `Logger`, `consoleLogger`.
- `ts/packages/protocol/src/server.ts` (or wherever the Server constructor lives) — accept `logger?` option.
- `ts/packages/protocol/src/server-core.ts` — accept logger via dispatcher factory; 3 log calls.
- `ts/packages/protocol/tests/server-core-logging.test.ts` — new file, 4 tests.
- `ts/packages/over-memory/src/index.ts` — re-export `Logger`.
- `ts/packages/over-memory/src/transport.ts` — accept `logger?`; 1 log call.
- `ts/packages/over-memory/tests/transport-logging.test.ts` — new file.
- `ts/packages/over-redis/src/index.ts` — re-export `Logger`.
- `ts/packages/over-redis/src/server-transport.ts` — accept `logger?`; 3 log calls.
- `ts/packages/over-redis/src/client-transport.ts` — accept `logger?`; 2 log calls.
- `ts/packages/over-redis/tests/logging.test.ts` — new file.

### Docs

- `py/packages/protocol/AGENTS.md`, `ts/packages/protocol/AGENTS.md` — note logging behaviour + (TS only) the `Logger` interface and `logger?` constructor option.
- `py/packages/over-memory/AGENTS.md`, `ts/packages/over-memory/AGENTS.md` — same.
- `py/packages/over-redis/AGENTS.md`, `ts/packages/over-redis/AGENTS.md` — same.
- `CHANGELOG.md` — `Unreleased` entry: "Added logger plumbing on Server and transports; previously silent fault paths now produce log records (ERROR / WARNING per site). No wire-format change."

## Risks

- **Pydantic `extra=` keys collide with `LogRecord` builtins.** Avoided by nesting under `"clamator"` key.
- **Tests that assert on `caplog` need correct propagation.** pytest's `caplog` attaches to the root logger and propagates by default. Per-test `caplog.set_level(..., logger=<name>)` is safer than relying on root level.
- **`logger.exception` vs `logger.error(..., exc_info=True)`.** `logger.exception` is only correct inside an active `except`. All call sites are inside `except` blocks, so either works; this design uses `exc_info=True` explicitly for symmetry with the param-validation `WARNING` path (which is *not* an active exception in some framings — `ValidationError` *is* caught, so `exc_info=True` works there too).
- **TS dispatcher factory closure.** `server-core.ts` returns the dispatcher from `Server.dispatcher(name)`. The logger needs to be in scope at the dispatcher's closure-creation site. Threading it through is one parameter; no architectural change.

## Cross-language synchronization

Per `AGENTS.md` § 1.4: TS and Py changes ship in the same commit chain on this branch. Interop test suite (`tests/interop/`) doesn't change — wire behaviour unchanged.

## Release strategy

Behaviour-additive bug fix, no breaking change. Next release will be `v0.1.9` per project's lockstep semver. Release itself is the user's call (per `AGENTS.md` § 9, releases are run from the user's machine). This work just lands on `feat/logging-audit` and merges to main via PR.
