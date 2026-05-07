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

## Post-v0.1 review followups

All seven 2026-05-08 code-quality nits were resolved before tagging v0.1.0; see commits `83877a3`, `739b986`, `0482970`, `93cc379`, `240afe9`, `111bcb2`, `827c738`.

### Bigger followups (defer to v0.2 or later)

- Implement codegen `--watch` (currently warns + exits). Use `chokidar` (TS-side) or native `fs.watch`.
- Per-handler timeout on the server side. The original `defaultHandlerTimeoutMs` field name implied this; replaced by `replyStreamMaxLen` in v0.1. A real per-handler timeout (using `Promise.race` / `asyncio.wait_for`) is a future feature.

## Lockstep model revisit

Pre-1.0 releases use lockstep semver across all 7 packages with exact-pinned inter-package deps. Revisit at v1.0.
