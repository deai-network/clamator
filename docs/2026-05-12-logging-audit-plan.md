# Logging audit + fix — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` to implement each phase task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add logger plumbing on every ★ silent-swallow site in `clamator` (Py + TS, protocol + over-memory + over-redis). No wire-format change. Apps see log records for handler exceptions, result-validation failures, params-validation failures, transport-loop exceptions, envelope parse failures, and dispatcher-wrapper bridging.

**Spec:** `docs/2026-05-12-logging-audit-design.md`.

**Branch:** `feat/logging-audit` (already created).

**Strategy:** TDD per ★ site. Each phase is one package on one language. RED test that asserts the log; GREEN by adding the log call. No refactors mid-cycle. One commit per phase (`feat(<pkg>):` style). Per-package `AGENTS.md` updates land in the same commit as the code change for that package. `CHANGELOG.md` updated at the end.

**Conventions locked from the spec:**

- **Levels.** ERROR for: handler throw (`-32603 Internal`), result-validation (`-32603 Result`), transport-loop exception (consumer / reclaim / reply). WARNING for: params-validation (`-32602`), envelope parse fail, reply json parse fail, dispatcher-wrapper. No DEBUG sites.
- **Py shape.** `logger.<level>("RPC handler raised: %s.%s id=%s", service, method, rpc_id, extra={"clamator": {"service": service, "method": method, "rpc_id": rpc_id}}, exc_info=True)`. `exc_info=True` because all sites are inside `except` blocks.
- **TS shape.** `logger.<level>(\`RPC handler raised: ${service}.${method} id=${rpcId}\`, err, { service, method, rpcId })`.
- **Logger plumbing.** Py: module-level `logging.getLogger(__name__)`, no ctor changes. TS: `Logger` interface with `error` and `warn`, threaded through optional `logger?` ctor option; default = `consoleLogger`.
- **`RpcError`** is *not* logged — it's the typed/expected-failure path. Tests assert no records.

---

## Phase 0 — TS `Logger` module

The TS side needs the interface in place before any package can reference it. Land this independently of any ★ site so later phases can import.

- [ ] **0.1** Create `ts/packages/protocol/src/logger.ts`:
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
- [ ] **0.2** Add `export { type Logger, consoleLogger } from './logger.js';` to `ts/packages/protocol/src/index.ts`.
- [ ] **0.3** Build the protocol package: `pnpm --filter @clamator/protocol build`. Verify no TS errors.
- [ ] **0.4** Commit: `feat(protocol-ts): add Logger interface and consoleLogger default`.

---

## Phase 1 — Py protocol `server_core` (3 ★ sites)

- [ ] **1.1 (RED)** Create `py/packages/protocol/tests/test_server_core_logging.py` with four tests:
  1. `test_logs_handler_exception` — register a contract whose handler raises `ValueError("boom")`. Dispatch a request envelope through `RpcServerCore._dispatcher`. Assert: response envelope is `-32603 Internal error`, AND `caplog.records` contains exactly one record on `clamator_protocol.server_core` at level `ERROR` with `record.exc_info` non-`None` and `"boom"` in the formatted message. Use `caplog.set_level(logging.WARNING, logger="clamator_protocol.server_core")`.
  2. `test_logs_result_validation_failure` — handler returns a value that fails the result model (mirror the excavator case: model declares `created_at: AwareDatetime`, handler returns a naive `datetime.now()`). Assert response is `-32603 Result validation failed` AND a single `ERROR` record on `clamator_protocol.server_core` containing the `errors` payload.
  3. `test_logs_params_validation_failure` — request with invalid params (wrong type). Assert response is `-32602` AND a single `WARNING` record.
  4. `test_does_not_log_rpc_error` — handler raises `RpcError(code=-32001, message="domain failure")`. Assert response is the typed RpcError response AND `caplog.records` contains zero records at WARNING+ on `clamator_protocol.server_core`.
- [ ] **1.2** Run the tests: `cd py && uv run pytest packages/protocol/tests/test_server_core_logging.py -v`. All four MUST fail (RED).
- [ ] **1.3 (GREEN)** In `py/packages/protocol/src/clamator_protocol/server_core.py`:
  - Add `import logging` at the top.
  - Add `logger = logging.getLogger(__name__)` at module scope.
  - In the `except ValidationError as e:` at L60: insert
    ```python
    logger.warning(
        "RPC params validation failed: %s.%s id=%s",
        service_name, env.method, rpc_id,
        extra={"clamator": {"service": service_name, "method": env.method, "rpc_id": rpc_id, "errors": e.errors()}},
    )
    ```
    before the `if is_notification: return None`.
  - In the `except Exception as e:` at L80: insert
    ```python
    logger.exception(
        "RPC handler raised: %s.%s id=%s",
        service_name, env.method, rpc_id,
        extra={"clamator": {"service": service_name, "method": env.method, "rpc_id": rpc_id}},
    )
    ```
    before the `if is_notification: return None`. (`logger.exception` = `logger.error(..., exc_info=True)` and works correctly here because we're inside the active `except` block.)
  - In the `except ValidationError as e:` at L93: insert
    ```python
    logger.error(
        "RPC result validation failed: %s.%s id=%s errors=%s",
        service_name, env.method, rpc_id, e.errors(),
        extra={"clamator": {"service": service_name, "method": env.method, "rpc_id": rpc_id, "errors": e.errors()}},
    )
    ```
    before the `return build_error_response(...)`.
- [ ] **1.4** Re-run tests: `cd py && uv run pytest packages/protocol/tests/test_server_core_logging.py -v`. All four MUST pass (GREEN).
- [ ] **1.5** Run the rest of the protocol test suite to confirm no regressions: `cd py && uv run pytest packages/protocol/`.
- [ ] **1.6** Update `py/packages/protocol/AGENTS.md` with a brief "Logging" subsection naming the module logger and listing the three log sites.
- [ ] **1.7** Commit: `feat(protocol-py): log handler/result/params failures in dispatcher`.

---

## Phase 2 — TS protocol `server-core` (3 ★ sites)

- [ ] **2.1 (RED)** Create `ts/packages/protocol/tests/server-core-logging.test.ts` with four tests (mirroring Phase 1):
  - Helper at the top of the file:
    ```ts
    function recordingLogger() {
      const records: Array<{ level: 'error' | 'warn'; msg: string; err: unknown; fields: unknown }> = [];
      return {
        records,
        logger: {
          error: (msg, err, fields) => { records.push({ level: 'error', msg, err, fields }); },
          warn:  (msg, err, fields) => { records.push({ level: 'warn',  msg, err, fields }); },
        } as Logger,
      };
    }
    ```
  - `logs handler exception` — handler throws `new Error('boom')`. Assert response is `-32603 Internal error` AND `records` has one entry at `error` level whose `err` is the thrown Error.
  - `logs result validation failure` — handler returns a value that fails the zod result schema. Assert response is `-32603 Result validation failed` AND one `error` record.
  - `logs params validation failure` — invalid params on the request. Assert `-32602` AND one `warn` record.
  - `does not log RpcError` — handler throws `new RpcError(-32001, 'domain failure')`. Assert response is the typed RpcError envelope AND `records` is empty.
- [ ] **2.2** Run: `cd ts && pnpm --filter @clamator/protocol test`. Four new tests MUST fail.
- [ ] **2.3 (GREEN)** In `ts/packages/protocol/src/server-core.ts`:
  - Import: `import { type Logger, consoleLogger } from './logger.js';`.
  - Add constructor param: `constructor(private readonly transport: Transport, private readonly logger: Logger = consoleLogger) {}`.
  - In the params `catch (e)` at L51: before the early-return, add `this.logger.warn(\`RPC params validation failed: ${serviceName}.${env.method} id=${id}\`, e, { service: serviceName, method: env.method, rpcId: id });`. (Need `serviceName` in scope — it's the dispatcher factory's argument.)
  - In the `await work` `catch (e)` at L63: after the `if (e instanceof RpcError) return ...` line (so RpcError is NOT logged), add `this.logger.error(\`RPC handler raised: ${serviceName}.${env.method} id=${id}\`, e, { service: serviceName, method: env.method, rpcId: id });` before the `return buildErrorResponse(id, -32603, ...)`.
  - In the result-validation `catch (e)` at L76: before `return buildErrorResponse(...)`, add `this.logger.error(\`RPC result validation failed: ${serviceName}.${env.method} id=${id}\`, e, { service: serviceName, method: env.method, rpcId: id });`.
- [ ] **2.4** Build + re-run: `cd ts && pnpm --filter @clamator/protocol build && pnpm --filter @clamator/protocol test`. All MUST pass.
- [ ] **2.5** Update `ts/packages/protocol/AGENTS.md` documenting the `Logger` interface, `consoleLogger`, the `logger?` ctor param on `RpcServerCore`, and the three log sites.
- [ ] **2.6** Commit: `feat(protocol-ts): add logger plumbing and dispatcher log sites`.

---

## Phase 3 — Py over-memory transport (1 ★ site)

- [ ] **3.1 (RED)** Create `py/packages/over-memory/tests/test_transport_logging.py`. One test: build a `MemoryTransport`, register a dispatcher that raises `ValueError("boom")`, call `send()` and `await` the result. Assert: the awaited result raises `ClamatorTransportError` whose `cause` is the original `ValueError` AND `caplog.records` contains exactly one record on `clamator_over_memory.transport` at level `WARNING` whose `record.exc_info` is non-`None`.
- [ ] **3.2** Run: `cd py && uv run pytest packages/over-memory/tests/test_transport_logging.py -v`. MUST fail.
- [ ] **3.3 (GREEN)** In `py/packages/over-memory/src/clamator_over_memory/transport.py`:
  - Add `import logging` + `logger = logging.getLogger(__name__)` at module scope.
  - In the `except Exception as e:` at L55: before the `if str(parsed.id) in self._pending:` line, add
    ```python
    logger.warning(
        "dispatcher threw: service=%s",
        parsed.service,
        exc_info=True,
    )
    ```
- [ ] **3.4** Re-run + full over-memory tests: `cd py && uv run pytest packages/over-memory/`. All pass.
- [ ] **3.5** Update `py/packages/over-memory/AGENTS.md`.
- [ ] **3.6** Commit: `feat(over-memory-py): log dispatcher exceptions at WARNING`.

---

## Phase 4 — TS over-memory transport (1 ★ site)

- [ ] **4.1 (RED)** Create `ts/packages/over-memory/tests/transport-logging.test.ts`. Build a `MemoryTransport`, register a failing dispatcher, call `send()`, assert rejection with `ClamatorTransportError` whose `cause` is the original Error AND the spy logger has one `warn` record.
- [ ] **4.2** Run: `cd ts && pnpm --filter @clamator/over-memory test`. MUST fail.
- [ ] **4.3 (GREEN)** In `ts/packages/over-memory/src/transport.ts`:
  - Import `{ type Logger, consoleLogger } from '@clamator/protocol'`.
  - Change ctor to `constructor(private readonly bus: MemoryBus, private readonly _instanceId: string = 'mem', private readonly logger: Logger = consoleLogger) {}` (third positional, backwards-compatible).
  - In the `catch (e)` at L58: before the `const p = this.pending.get(...)` line, add `this.logger.warn(\`dispatcher threw: service=${parsed.service}\`, e, { service: parsed.service });`.
- [ ] **4.4** Add `export { type Logger, consoleLogger } from '@clamator/protocol';` to `ts/packages/over-memory/src/index.ts` so apps can import from the transport package directly.
- [ ] **4.5** Build + re-run: `pnpm --filter @clamator/over-memory build && pnpm --filter @clamator/over-memory test`.
- [ ] **4.6** Update `ts/packages/over-memory/AGENTS.md`.
- [ ] **4.7** Commit: `feat(over-memory-ts): log dispatcher exceptions at WARNING`.

---

## Phase 5 — Py over-redis (5 ★ sites: 3 server + 2 client)

- [ ] **5.1 (RED)** Create `py/packages/over-redis/tests/test_logging.py`. Tests:
  - `test_server_consumer_loop_logs_exception` — patch the `_handle_entry` method to raise on first call. Drive a single message through the loop. Assert an `ERROR` record on `clamator_over_redis.server_transport`. (Use the existing test harness for redis loop tests — fake redis or real redis depending on existing convention; check `tests/test_server_transport.py` for the pattern.)
  - `test_server_handle_entry_logs_poison_envelope` — push a message with non-JSON `envelope` field. Assert `WARNING` record on `clamator_over_redis.server_transport`.
  - `test_client_reply_json_parse_fail_logs` — push a reply message with non-JSON envelope onto the reply stream. Assert `WARNING` record on `clamator_over_redis.client_transport`.
- [ ] **5.2** Run: `cd py && uv run pytest packages/over-redis/tests/test_logging.py -v`. MUST fail.
- [ ] **5.3 (GREEN)** In `py/packages/over-redis/src/clamator_over_redis/server_transport.py`:
  - Add `import logging` + `logger = logging.getLogger(__name__)`.
  - In the `except Exception:` at L109 (consumer loop): replace `pass`/`await asyncio.sleep` with `logger.exception("redis consumer loop error: service=%s", service); await asyncio.sleep(0.1)`.
  - In the `except Exception:` at L128 (reclaim loop): `logger.exception("redis reclaim loop error: service=%s", service)`.
  - In the `except Exception:` at L146 (envelope parse): `logger.warning("redis poison envelope: service=%s entry=%s", service, entry_id, exc_info=True); await self._redis.xack(...)`.
- [ ] **5.4** In `py/packages/over-redis/src/clamator_over_redis/client_transport.py`:
  - Add `import logging` + `logger = logging.getLogger(__name__)`.
  - At L132 (reply json parse): `logger.warning("redis reply parse failed", exc_info=True); continue`.
  - At L140 (reply loop generic): `logger.exception("redis reply loop error"); await asyncio.sleep(0.1)`.
- [ ] **5.5** Re-run all over-redis tests: `cd py && uv run pytest packages/over-redis/`. All MUST pass.
- [ ] **5.6** Update `py/packages/over-redis/AGENTS.md`.
- [ ] **5.7** Commit: `feat(over-redis-py): log transport loop and parse failures`.

---

## Phase 6 — TS over-redis (5 ★ sites: 3 server + 2 client)

- [ ] **6.1 (RED)** Create `ts/packages/over-redis/tests/logging.test.ts`. Three tests mirroring Phase 5: consumer-loop logs on dispatcher error, server poison-envelope logs, client reply json parse fail logs.
- [ ] **6.2** Run: `cd ts && pnpm --filter @clamator/over-redis test`. MUST fail.
- [ ] **6.3 (GREEN)** In `ts/packages/over-redis/src/server-transport.ts`:
  - Import `{ type Logger, consoleLogger } from '@clamator/protocol'`.
  - Add `logger?: Logger` to `ServerTransportOptions`. In ctor: `this.logger = opts.logger ?? consoleLogger;` and add `private logger: Logger` field.
  - At L135 (consumer loop catch): replace silent retry with `if (!this.abort) this.logger.error(\`redis consumer loop error: service=${service}\`, err, { service });`.
  - At L167 (reclaim loop catch): `if (!this.abort) this.logger.error(\`redis reclaim loop error: service=${service}\`, err, { service });`.
  - At L186/188 (envelope parse fail in `handleEntry`): `this.logger.warn(\`redis poison envelope: service=${service} entry=${entryId}\`, undefined, { service, entryId });` before the `xack`.
- [ ] **6.4** In `ts/packages/over-redis/src/client-transport.ts`:
  - Same import + field setup.
  - Add `logger?: Logger` to `ClientTransportOptions`.
  - At L154 (reply json parse catch): replace `continue;` with `{ this.logger.warn('redis reply parse failed', e); continue; }`.
  - At L163 (reply-loop generic catch): `if (!this.replyLoopAbort) this.logger.error('redis reply loop error', err);` before the sleep.
- [ ] **6.5** Re-export `Logger`+`consoleLogger` from `ts/packages/over-redis/src/index.ts`.
- [ ] **6.6** Build + re-run all over-redis tests: `pnpm --filter @clamator/over-redis build && pnpm --filter @clamator/over-redis test`.
- [ ] **6.7** Update `ts/packages/over-redis/AGENTS.md`.
- [ ] **6.8** Commit: `feat(over-redis-ts): log transport loop and parse failures`.

---

## Phase 7 — CHANGELOG + final verification

- [ ] **7.1** Add an `Unreleased` (or next `v0.1.9`) entry to `CHANGELOG.md`:
  ```
  ### Added
  - TS: `Logger` interface (`error`, `warn`) and `consoleLogger` default, re-exported from `@clamator/protocol`, `@clamator/over-memory`, `@clamator/over-redis`. Optional `logger?` constructor option on `RpcServerCore`, `MemoryTransport`, `ServerRedisTransport`, `ClientRedisTransport`.

  ### Changed
  - Server-side fault paths in protocol cores and transports now emit log records (`ERROR` for handler exceptions, result-validation failures, and transport-loop exceptions; `WARNING` for params-validation, poison envelopes, dispatcher-wrapper). Py uses module-level `logging.getLogger(__name__)`; configuration is the application's job (no `basicConfig` added). Wire format unchanged.

  ### Not changed
  - `RpcError` (typed/expected-failure path) is intentionally not logged.
  ```
- [ ] **7.2** Run the full local test suite: `make test`. MUST pass.
- [ ] **7.3** Run interop: `make interop`. MUST pass.
- [ ] **7.4** Commit: `docs: changelog entry for logging audit`.
- [ ] **7.5** Final inspection: `git log feat/logging-audit ^main --oneline` should show ~8 commits (Phase 0 + Phases 1–6 + Phase 7).
- [ ] **7.6** Hand back to user for PR + merge decision. Do **not** open PR autonomously per `AGENTS.md` § 9 — present the branch and offer to push.

---

## File Structure summary

**Files created:**
- `ts/packages/protocol/src/logger.ts`
- `py/packages/protocol/tests/test_server_core_logging.py`
- `ts/packages/protocol/tests/server-core-logging.test.ts`
- `py/packages/over-memory/tests/test_transport_logging.py`
- `ts/packages/over-memory/tests/transport-logging.test.ts`
- `py/packages/over-redis/tests/test_logging.py`
- `ts/packages/over-redis/tests/logging.test.ts`

**Files modified:**
- `py/packages/protocol/src/clamator_protocol/server_core.py`
- `ts/packages/protocol/src/server-core.ts`
- `ts/packages/protocol/src/index.ts`
- `py/packages/over-memory/src/clamator_over_memory/transport.py`
- `ts/packages/over-memory/src/transport.ts`
- `ts/packages/over-memory/src/index.ts`
- `py/packages/over-redis/src/clamator_over_redis/server_transport.py`
- `py/packages/over-redis/src/clamator_over_redis/client_transport.py`
- `ts/packages/over-redis/src/server-transport.ts`
- `ts/packages/over-redis/src/client-transport.ts`
- `ts/packages/over-redis/src/index.ts`
- Six `AGENTS.md` files (one per touched package, both languages).
- `CHANGELOG.md`

## Risks / open points the executor may encounter

- **Existing redis tests' infrastructure.** Inspect `py/packages/over-redis/tests/` and `ts/packages/over-redis/tests/` for the fake-vs-real redis pattern before writing Phase 5/6 tests. Follow existing convention.
- **`extra={"clamator": ...}` collisions.** Python's `LogRecord` reserves names like `name`, `msg`, `levelname`, `pathname`, etc. The `"clamator"` namespacing avoids all of them.
- **TS `MemoryTransport` ctor positional change.** Adding a third positional `logger` parameter is backwards-compatible because it defaults. If existing code or tests call the ctor with three positional args, audit those — quick `grep -rn 'new MemoryTransport(' ts/' should show all call sites.
- **`logger.exception` reentrancy.** Safe here because each call site is inside an active `except` block. Confirmed during the spec audit.
