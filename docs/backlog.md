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

## Lockstep model revisit

Pre-1.0 releases use lockstep semver across all 7 packages with exact-pinned inter-package deps. Revisit at v1.0.
