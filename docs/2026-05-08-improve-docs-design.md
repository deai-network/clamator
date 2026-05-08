# Docs Improvement — Design Spec

Date: 2026-05-08
Branch: `worktree-improve-docs`
Status: Draft

## Goal

Make clamator's user-facing documentation match the package surface that ships to npm and PyPI:

1. Top-level `README.md` gets a short "what / why / when" paragraph so first-time readers can decide whether to use clamator without reading the design doc.
2. Every published package (`ts/packages/*`, `py/packages/*`) gets a `README.md` so its npm or PyPI landing page is informative instead of empty.

## Non-goals

- No changes to existing design or plan documents under `docs/`.
- No new tutorials, conceptual deep-dives, or contributor guides. Those are separate efforts.
- No code changes, no behavior changes, no API surface changes.
- No execution of `tests/interop/` (docker + redis). The user is repairing that infra in another session; static fixture files may be added but never run from this work.

## Constraints

- Documentation must follow the AGENTS.md rule: code examples in READMEs are either a verbatim quote of a working example file in the repo, or backed by a typecheck-only fixture in `tests/interop/`. No "example-only" code that has never executed.
- `docs/` is flat (AGENTS.md). This spec lives directly under `docs/`, not under `docs/superpowers/specs/` or any nested hierarchy.
- READMEs must be scoped strictly to the consumers of the specific package. No leaking of sibling/internal/transport-implementation detail.
- Per-package `AGENTS.md` files already exist and stay where they are. READMEs supplement, not replace, them. `AGENTS.md` is for agents working on the package; `README.md` is for people consuming the package.

## Top-level `README.md` change

Insert a 3–5 sentence paragraph after the current opening line and before the `Pre-1.0` callout. The paragraph covers:

- **What** — clamator lets a TypeScript process and a Python process call each other's methods over JSON-RPC 2.0, with Zod as the single source of truth for the contract and Python wrappers generated from it.
- **Why** — one contract definition; types and validation stay in lockstep across languages by construction; the transport is swappable (in-process loopback for tests, Redis streams for production).
- **When to reach for it** — appropriate when a TS service and a Py service share a contract surface and the alternative is hand-rolling request/response shapes twice.

All other top-level sections (Build, Packages, Release, License) remain unchanged. No quickstart at the top level — per-package READMEs carry that.

## Per-package READMEs — role-typed templates

Three role types. Each template only contains sections that earn their place for that role's consumers.

### Role 1 — Protocol (`@clamator/protocol`, `clamator-protocol`)

Consumers do not call this directly. Codegen and adapter authors do.

Sections:

1. Title + one-line purpose: pure JSON-RPC 2.0 protocol primitives plus Zod-derived envelope types.
2. Install command for the language.
3. **When you reach for this** — bullet list:
   - Authoring a Zod contract that will be fed to `@clamator/codegen`.
   - Building a custom transport adapter that needs the wire-envelope schema and reserved error codes.
   - Plus an explicit note: "If you only consume generated clients and servers, you don't import this directly — your transport package does."
4. **Key surface** — three to six exported symbols with one-line descriptions, scoped to what direct consumers touch.
5. **Links** — sibling-language package, `@clamator/codegen`, the top-level design doc, this package's `AGENTS.md`.

### Role 2 — Transport adapter (`over-memory` × 2, `over-redis` × 2)

Sections:

1. Title + one-line purpose (in-process loopback, or Redis-streams).
2. Install command.
3. **Quickstart** — a verbatim quote of an interop fixture or a new typecheck-only fixture. Scoped to this transport from this language's perspective. The TS quickstart shows TS code; the Py quickstart shows Py code. They do not show the other side's wire-up beyond the minimum needed to make the snippet self-contained.
4. **Configuration** — only the knobs a consumer sets: connection string, stream names, timeouts. No internal flags.
5. **Key surface** — constructor plus the two or three public methods (`registerHandler`, `call`, `close`-style) with signatures.
6. **When to reach for this vs. the other transport** — short comparison: `over-memory` for tests, embedded scenarios, single-process; `over-redis` for cross-process / cross-host, durable stream, production.
7. **Links** — sibling-language package, `@clamator/codegen` (with the Py-side note: "run the TS codegen tool; consume the generated Py output"), the top-level design doc, the backlog when a relevant entry exists, this package's `AGENTS.md`.

### Role 3 — Codegen (`@clamator/codegen`, TS only)

Sections:

1. Title + one-line purpose: turn a Zod contract module into TS + Py client/server wrappers.
2. Install: `npm install -D @clamator/codegen`.
3. **CLI usage** — verbatim quote of a fixture invocation showing input contract path, TS output directory, Py output directory.
4. **Contract input shape** — a minimal Zod contract example, quoted from a fixture.
5. **Output layout** — what files are emitted, where, and how to wire them into a TS or Py project.
6. **Links** — both protocol packages, all four transport packages, the top-level design doc, this package's `AGENTS.md`.

## Examples policy

For every README quickstart and every quoted code block:

1. Look first for an existing fixture under `tests/interop/` that already demonstrates the relevant scenario from the relevant language's perspective. Quote it verbatim if it fits.
2. Where no existing fixture fits, add a new minimal typecheck-only fixture under `tests/interop/` and quote that.
3. Do not write inline example code in a README that lives only in the README.

The implementation plan (next phase) will inventory every README quickstart, map it to either an existing fixture or a new fixture file, and produce the explicit list. This spec does not pre-commit a count.

**Execution carve-out:** Adding fixture files is allowed. Running `make interop`, `docker compose`, or any redis-touching command is not — see Non-goals. The implementation phase reports back which new fixture files (if any) were added so the user can run them later.

## Cross-link map

| From | Links to |
|---|---|
| Top-level `README.md` | (unchanged — already lists packages and design doc) |
| `ts/packages/protocol/README.md` | `clamator-protocol`, `@clamator/codegen`, design doc, own `AGENTS.md` |
| `py/packages/protocol/README.md` | `@clamator/protocol`, `@clamator/codegen` (with run-TS-codegen note), design doc, own `AGENTS.md` |
| `ts/packages/over-memory/README.md` | `clamator-over-memory`, `@clamator/codegen`, design doc, backlog (if relevant), own `AGENTS.md` |
| `py/packages/over-memory/README.md` | `@clamator/over-memory`, `@clamator/codegen` (with run-TS-codegen note), design doc, backlog (if relevant), own `AGENTS.md` |
| `ts/packages/over-redis/README.md` | `clamator-over-redis`, `@clamator/codegen`, design doc, backlog (if relevant), own `AGENTS.md` |
| `py/packages/over-redis/README.md` | `@clamator/over-redis`, `@clamator/codegen` (with run-TS-codegen note), design doc, backlog (if relevant), own `AGENTS.md` |
| `ts/packages/codegen/README.md` | `@clamator/protocol`, `clamator-protocol`, all four transports, design doc, own `AGENTS.md` |

In every row of this table, "design doc" means `docs/2026-05-07-clamator-design.md`. Sibling links use the registry URL (`npmjs.com` / `pypi.org`) so the link works on the rendered npm/PyPI landing page. In-repo links (design, backlog, `AGENTS.md`) use relative paths from the package directory.

## Manifest fields

Each `package.json` and `pyproject.toml` must surface the new README on its registry page.

- `ts/packages/*/package.json`: confirm or add a top-level `"readme": "README.md"` field. npm picks `README.md` up by default; explicit declaration is allowed and harmless.
- `py/packages/*/pyproject.toml`: confirm or add `[project] readme = "README.md"`. PyPI requires this to render the long description.

The implementation plan will audit which manifests already declare this and which need editing.

## Verification

- `pnpm -C ts -r build` and `uv --project py run --frozen pytest` must continue to pass — they do not exercise READMEs but they confirm the new fixture files (if any) typecheck.
- `pnpm -C ts -r typecheck` (or equivalent) must pass for any new TS fixtures.
- Markdown linkcheck (manual or scripted; the implementation plan picks one) must confirm relative links resolve and registry links are well-formed.
- **No interop runs in this work**, per the carve-out above. The implementation phase reports added fixtures back to the user.

## Out of scope (explicit, to prevent scope creep)

- No CHANGELOG entries — the user controls release messaging.
- No edits to `AGENTS.md` files at any level.
- No edits to existing design or plan documents.
- No `CONTRIBUTING.md`, no `CODE_OF_CONDUCT.md`, no GitHub issue templates.
- No badges added or removed.
- No restructuring of `docs/`.

## Open questions

None at spec time. The implementation plan will surface concrete fixture-mapping decisions, where a new fixture is needed and where reuse is enough.
