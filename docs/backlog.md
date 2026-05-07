# Backlog

Future work and decisions outside the v0.1 scope. Consult before starting any new work.

## Deferred to post-v0.1

- NATS adapter (`@clamator/over-nats`, `clamator-over-nats`).
- HTTP/WebSocket adapter.
- Bidirectional / server-initiated calls.
- Streaming method results.
- Batch requests.
- Cancellation propagation (`$cancelRequest` notification).
- Sync API wrappers.
- Observability / telemetry / metrics interfaces.
- Scaffolding tool for new consumers.
- Auth abstraction.
- Encryption abstraction.
- Reverse-direction codegen (Pydantic → Zod).
- Non-Pydantic Py output (msgspec, dataclasses, attrs).
- Doc generation from contracts.
- Multi-region / federated redis.

## Post-v0.1 review followups (2026-05-08)

### Code-quality nits to fix in v0.1.1+

- **AGENTS.md says "XCLAIM" in TS over-redis but command used is `XAUTOCLAIM`.** Fix: `ts/packages/over-redis/AGENTS.md` lines mentioning XCLAIM, and `ts/packages/over-redis/tests/crash-recovery.test.ts:16` test description. Py AGENTS.md is correct.
- **Py `parse_envelope` accepts `bool` as `RpcId`.** `bool` is a subclass of `int` in Python, so `id=True` slips through `isinstance(rpc_id, (str, int))`. TS rejects it. Either narrow Py or relax TS. Path: `py/packages/protocol/src/clamator_protocol/envelope.py`.
- **Stray `class GeneratedModels(BaseModel): pass` in every codegenned `.py` file.** Comes from `datamodel-codegen` honoring the wrapper schema's `title`. Fix: omit `title` in `emit-py.ts` wrapper schema, or post-process to strip the empty class.
- **Worker-pool fairness scenario is a mathematical identity, not a real test.** Fix: drivers emit `HANDLED:<count>` per server to stderr; runner parses and asserts both servers handled ≥ N/10. Path: `tests/interop/lib/runner.ts:468–480` and the driver `server.ts`/`server.py`.
- **"100 concurrent calls" scenario runs sequentially.** Drivers don't actually parallelize; the runner repeats the call list and the driver loops. Fix: driver fans out via `Promise.all` / `asyncio.gather` when `concurrent` is set. Or rename to "100 sequential calls".
- **Dead `import sys as _sys, importlib.util` in interop Py server driver.** Path: `tests/interop/drivers/py/server.py:9`. Just remove `_sys` from the import.
- **Py `over-redis __init__.py` doesn't export key-naming helpers** (`command_stream`, `reply_stream`, `consumer_group_name`, `consumer_name`). TS exports all four via `export * from './keys.js'`. The Py AGENTS.md lists them. Fix: add them to `__all__`.

### Bigger followups (defer to v0.2 or later)

- Implement codegen `--watch` (currently warns + exits). Use `chokidar` (TS-side) or native `fs.watch`.
- Per-handler timeout on the server side. The original `defaultHandlerTimeoutMs` field name implied this; replaced by `replyStreamMaxLen` in v0.1. A real per-handler timeout (using `Promise.race` / `asyncio.wait_for`) is a future feature.

## Lockstep model revisit

Pre-1.0 releases use lockstep semver across all 7 packages with exact-pinned inter-package deps. Revisit at v1.0.
