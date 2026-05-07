# Clamator v0.1 Implementation Plans — Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to execute each plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

The v0.1 design (`docs/2026-05-07-clamator-design.md`) is split into seven plans, each producing working, testable software on its own. Execute in dependency order.

## Plan order + dependencies

| # | Plan | File | Depends on |
|---|------|------|-----------|
| 01 | Repo skeleton | `docs/2026-05-07-plan-01-repo-skeleton.md` | — |
| 02 | Protocol packages (TS + Py) | `docs/2026-05-07-plan-02-protocol.md` | 01 |
| 03 | `over-memory` transport (TS + Py) | `docs/2026-05-07-plan-03-over-memory.md` | 02 |
| 04 | Codegen (`@clamator/codegen`) | `docs/2026-05-07-plan-04-codegen.md` | 02 |
| 05 | `over-redis` transport (TS + Py) | `docs/2026-05-07-plan-05-over-redis.md` | 02 |
| 06 | Cross-language interop tests | `docs/2026-05-07-plan-06-interop.md` | 02, 04, 05 |
| 07 | Release + CI workflows | `docs/2026-05-07-plan-07-release-ci.md` | 01–06 |

Plans 03, 04, 05 are independent of each other and may run in parallel by separate agents.

## Conventions across plans

- All commits omit `Co-Authored-By` trailers (per `AGENTS.md`).
- All plan/spec/design files live flat under `docs/` — never nest under `docs/superpowers/...`.
- TS commands run from `ts/` via `pnpm`. Py commands run from `py/` via `uv run`.
- Each package gets its own `AGENTS.md` documenting public-API rules, updated in the same commit as API changes.
- Validate at every edge (TS-out, TS-in, Py-out, Py-in).
- Lockstep version `0.1.0` across all 7 published packages.
- Apache 2.0; single `LICENSE` at repo root; each dist re-includes it.

## Open-question decisions made by these plans

For §11 of the design spec, this plan-set decides:

- `defineMethod` / `defineNotification`: identity functions (returns input as-is) with strong inferred types. Validation lives only in `defineContract`.
- `Contract.service`: plain string field (no brand).
- Type names: `MethodDef`, `NotificationDef`, `Contract`, `RpcError`, `ClamatorProtocolError`, `ClamatorTransportError`.
- TS publishing: ESM-only.
- Pydantic generation: shell out to `datamodel-code-generator` CLI from codegen.
- Py field-name policy: snake_case with `populate_by_name=True` + camelCase aliases preserving wire format.
- Codegen: full re-emit; no incremental cache in v0.1.
- `zod-to-json-schema` target: `jsonSchema7`.
- Codegen does not invoke formatters (consumer's pre-commit handles it).
- TS server handler shape: plain object map typed as `HandlersFor<M>` (structural).
- Py server handler shape: instance of generated `<Service>Service` ABC.
- `start()` / `stop()` are explicit (not bound to constructor).
- `RedisRpcServer`/`RedisRpcClient` and `MemoryRpcServer`/`MemoryRpcClient` subclass `RpcServerCore`/`RpcClientCore` for constructor ergonomics; the `Transport` itself is composed and passed in via `super(transport)` — no transport inheritance.
- `MemoryBus`: re-registration after `stop()` is allowed only after a fresh `start()`; while running, the dedup invariant holds.
- Reply-stream consumer: blocking `XREAD` with timeout.
- Reconnect/retry: inlined helper, not own class.
- `XADD` field encoding: single `envelope` field with serialized JSON.
- Interop scenario format: YAML.
- Driver subprocess wire: JSON-over-stdio, line-delimited.
- GH Actions verification workflow: required status check on `main`.
