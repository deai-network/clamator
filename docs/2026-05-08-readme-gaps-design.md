# README Gaps + Verbatim-Compliance — Design Spec

Date: 2026-05-08
Status: Draft

## Background

This work has two motivating sources:

1. **Porting experiment.** An outside agent was asked to port a real codebase to clamator using only the per-package READMEs as reference, without reading the design doc or source. The experiment surfaced 17 gaps; analysis reduced them to 9 substantive items the READMEs should answer but currently do not. Sub-agent confidence dropped to "low" on error handling, custom-command migration, and backwards compatibility — the topics least visible from current docs.

2. **Verbatim-compliance audit.** While planning the gap-closure work, an audit of all seven package READMEs found that commit `4e0dcfc docs(transports): use codegen typed proxies in quickstart examples` rewrote the four transport READMEs (TS+Py × over-memory+over-redis) to showcase the codegen-emitted typed-proxy pattern, but no test or fixture in the repo currently drives the transports through those proxies. Seven hand-written code blocks plus one drifted block are present across those four READMEs. The protocol READMEs (TS+Py) and the codegen README remain compliant.

This spec covers both concerns in one piece of work because they share the same surface (the same READMEs), share the same constraint system (the verbatim-quote rule in AGENTS.md), and the relaxation needed to address one cleanly enables the other.

## Goal

After this work:

1. The verbatim-quote rule in AGENTS.md permits code-comment annotations in README copies, with two coupling rules and explicit comment-placement guidance, and a CI check enforces the new rule mechanically.
2. The four transport READMEs no longer contain hand-written or drifted code blocks. Every quoted code block in every package README is a verbatim quote (modulo comments) of a working, compiled or executed source file in the repo.
3. The 9 documentation gaps the porting experiment surfaced are closed in the relevant READMEs (`protocol`, `codegen`, `over-redis`, `over-memory`) on both the Py and TS sides where applicable.

## Non-goals

- No new conceptual deep-dives, tutorials, or contributor guides.
- No restructuring of `docs/` or per-package README section ordering beyond what gap closure requires.
- No new top-level design docs.
- No CHANGELOG entries.
- No `make interop` runs, no docker invocations, no Redis-touching commands. Interop infra is being repaired in another session.
- No edits to existing design or plan documents in `docs/`. (This spec is new; it lives at `docs/2026-05-08-readme-gaps-design.md`.)

## Phases

The work is sequenced as three phases, in order. Each phase is independently committable and independently verifiable.

### Phase 1 — Documentation rule clarification + verbatim CI check

This phase lands first because it defines the rule that Phases 2 and 3 must satisfy.

#### Phase 1.1 — `AGENTS.md` rule update

The current rule (paraphrased): code examples in READMEs must be verbatim quotes of working test or fixture code.

The clarified rule:

> Code examples in READMEs must be verbatim quotes of working test or fixture code in the repo, **except for code comments — comments may be added freely in the README copy for documentation purposes.** A "comment" means any token sequence the source language treats as a comment: `#` lines and `# trailing` segments in Python, `//` lines and `// trailing` segments and `/* ... */` blocks in TypeScript, and so on. Whitespace around comments is similarly free.
>
> **Update-coupling rule (test → README).** When updating a test or fixture that is quoted in a README, also update the README's quoted block so it remains verbatim. Comments that exist only in the README copy are preserved.
>
> **Update-coupling rule (README → test).** When updating demo code in a README, the code must originate from a working source file. Update the source file (test or fixture) first, then propagate the change to the README. Existing README-only comments are preserved across the propagation.
>
> **Comment placement guidance.**
> - Use end-of-line comments for short keyword annotations: `await server.start()  # must follow register_service`.
> - Use above-statement comments for full sentences. End-of-line full sentences are stranded when a variable rename forces a wrap.
> - Avoid mid-block standalone comment lines that depend on neighbor context (e.g., "the next line is critical because…"). They break silently when the next line moves.

The above text is the canonical wording. Phase 1.1 inserts it into `AGENTS.md` at the location where the current verbatim-quote rule lives, replacing the existing wording.

#### Phase 1.2 — Verbatim-diff CI check

A new script at `scripts/check-readme-verbatim.{ts,js,py}` (language to be chosen by the implementation plan; criteria below) walks every package README, extracts every fenced code block whose info string is a recognized source language (`ts`, `typescript`, `python`, `py`), reads the citation footer if present, and verifies that the comment-stripped, whitespace-normalized block matches the comment-stripped, whitespace-normalized cited source range.

Citation grammar (exactly):

> `(Verbatim from \`<repo-relative-path>:<start-line>-<end-line>\`.)`

Or for citations without a line range (whole file):

> `(Verbatim from \`<repo-relative-path>\`.)`

A README that includes a code block in a recognized source language and has no citation footer immediately following the block is treated as a violation: the script reports `MISSING-CITATION` for that block.

Comment stripping rules:

- **Python.** `#` to end of line, `'''…'''` and `"""…"""` are NOT stripped (they're string literals; a docstring is part of the program). Only `#` comments.
- **TypeScript.** `//` to end of line; `/* … */` blocks (multi-line included).
- **Bash, JSON, etc.** Out of scope for verbatim diff. The script ignores fenced blocks with these info strings — they're treated as illustrative CLI examples, not source-of-truth quotes.

Whitespace normalization:

- Trim trailing whitespace per line.
- Collapse runs of blank lines into single blank lines.
- Strip a single leading blank line and a single trailing blank line.

Output format on failure:

```
FAIL ts/packages/over-memory/README.md
  Block at line 37 (typescript)
  Citation: tests/interop/proxy-fixtures/over-memory/loopback.ts:1-32
  Mismatch:
  --- README block (comments stripped)
  +++ source range (comments stripped)
  @@ ... @@
   <unified diff>
```

CI integration:

- The script runs in the existing TS CI workflow as a new step before `pnpm -C ts -r build`.
- **In Phase 1, the step is non-blocking** — it reports violations to the workflow log but does not fail the build. This is necessary because Phase 1 lands before Phase 2 (which fixes the existing eight non-compliant blocks); a blocking gate would break main on Phase 1's first CI run.
- **The step is flipped to blocking as a final task in Phase 2**, once the eight known violations are resolved and the script reports zero violations.
- Local invocation: `make check-readmes` (a new Makefile target that runs the script). The local Makefile target is always blocking — only the CI workflow step has the non-blocking-then-blocking transition.

Script-language criterion (decision in implementation plan, not here):

- Node, if the rest of repo tooling is consistently Node and the script can be authored without bringing in a markdown-parsing dependency that doesn't already ship.
- Python, if a small `re`-based tokenizer is enough.
- Bash, only if the script stays under ~80 lines; otherwise prefer a real language.

The implementation plan will pick one of these and justify the choice. The spec does not pre-commit.

### Phase 2 — Verbatim compliance fix for transport READMEs

The audit identified seven hand-written blocks plus one drifted block across four READMEs:

| README | Block | Status |
|---|---|---|
| `ts/packages/over-memory/README.md` | contracts/arith.ts (single-method) | hand-written |
| `ts/packages/over-memory/README.md` | loopback.ts (uses `ArithClient`) | hand-written |
| `py/packages/over-memory/README.md` | loopback.py (uses `ArithClient`) | hand-written |
| `ts/packages/over-redis/README.md` | contracts/arith.ts (`add`+`ping`) | hand-written |
| `ts/packages/over-redis/README.md` | server.ts (typed via `ArithService`) | hand-written |
| `ts/packages/over-redis/README.md` | client.ts (uses `ArithClient`) | hand-written |
| `py/packages/over-redis/README.md` | server.py (subclasses `ArithService`) | drifted |
| `py/packages/over-redis/README.md` | client.py (uses `ArithClient`) | hand-written |

Path A is chosen: **add real fixtures that exercise the typed-proxy pattern, then quote them.** This preserves the user-facing message of commit `4e0dcfc` (proxies are the recommended user surface) while restoring rule compliance.

#### Phase 2.1 — Fixture inventory

For each non-compliant block, an underlying fixture file must exist that:

- Compiles (TS) or executes (Py) without errors against the actual codegen output.
- Imports the codegen-emitted proxies (`ArithClient`, `ArithService`, `AddParams`, `AddResult`, etc.) from a stable repo-relative path.
- Drives the relevant transport (`MemoryRpc{Server,Client}` or `RedisRpc{Server,Client}`) end-to-end through the proxy interface.
- Is small enough to be readable as documentation when quoted.

Fixture homes (final layout decided by the implementation plan; this is the proposal):

- **TS over-memory:** `ts/packages/over-memory/tests/proxy-loopback.test.ts` — runnable test, uses `vitest` like the existing `loopback.test.ts`.
- **Py over-memory:** `py/packages/over-memory/tests/test_proxy_loopback.py` — runnable test, uses `pytest`.
- **TS over-redis:** `ts/packages/over-redis/tests/proxy-round-trip.test.ts` — runnable test, skipped without `REDIS_URL` (matches existing `round-trip.test.ts` pattern).
- **Py over-redis:** `py/packages/over-redis/tests/test_proxy_round_trip.py` — runnable test, skipped without `REDIS_URL`.
- **Contract definitions** (the two `contracts/arith.ts` blocks): each transport's quickstart imports its contract from a local fixture under that transport's tests directory. The implementation plan picks whether to share one contract fixture across the four transport READMEs or have per-transport variants. Sharing is cleaner; per-transport allows tighter scope (e.g., over-redis can show a contract with `add`+`ping`, over-memory a contract with `add`+`divide`+`ping`). The plan will choose.

Each fixture imports the codegen-emitted proxy from a stable path. Two viable sources:

1. **Pre-generated, committed proxies** at `tests/interop/generated/{ts,py}/arith.{ts,py}` (these already exist per the audit). Fixtures import from this path. The plan must verify the existing generated files match the contract shape the fixtures need; if not, the plan extends them by re-running codegen or by adding a second contract.

2. **Per-package generated proxies** at e.g. `ts/packages/over-memory/tests/generated/arith.ts`, regenerated as a test setup step. More isolated but adds setup complexity.

The implementation plan picks. Default preference: option 1 (reuse existing generated artifacts where shape matches, extend if needed).

#### Phase 2.2 — README requoting

Once each fixture exists and is verified to compile/run, the four transport READMEs are edited so each previously-hand-written block becomes a verbatim quote of the relevant fixture, with a citation footer in the canonical grammar from Phase 1.2.

Comments in the README copies that don't exist in the source are permitted under the Phase 1.1 rule. Most existing README copies don't have such comments; this phase preserves the copy-modulo-citation as the baseline, and Phase 3 layers the gap-closure comments on top.

#### Phase 2.3 — Verification before next phase

After Phase 2 lands:

- `pnpm -C ts -r build` and `pnpm -C ts -r test` pass.
- `uv --project py run --frozen pytest` passes (Py over-redis tests skip without `REDIS_URL`).
- The new `make check-readmes` script (from Phase 1.2) reports zero violations across all seven READMEs.
- Manual eye-check by the user that the README quickstarts read sensibly with the new contract/proxy fixtures.

#### Phase 2.4 — Flip the CI gate to blocking

After Phase 2.3 confirms zero violations, the CI workflow step that runs `check-readme-verbatim` is changed from non-blocking to blocking. From this point on, any future README edit that drifts from source fails CI rather than landing silently.

### Phase 3 — Gap closure (9 gaps)

This phase closes the documentation gaps from the porting experiment. Each gap is fixed in the smallest-form way that matches its content type:

- A single fact about API behavior (e.g., "`register_service` must precede `start()`") becomes a code comment in the relevant README copy.
- A type-signature fact that doesn't naturally appear in any test (e.g., the `RpcError` constructor) becomes a small new fixture under `tests/` plus a quoted block in the README.
- A multi-fact reference that doesn't fit one comment (e.g., the set of Redis keys a transport owns) becomes a small Markdown table in the README.
- A design trade-off that requires reasoning (e.g., when to use a notification vs. a method) becomes a short prose subsection.

Symmetric coverage applies. Most gaps that affect over-redis also have meaningful answers for over-memory; the over-memory READMEs receive either the same comment (where the concept exists identically) or an explicit "N/A" note (where the concept does not apply because there is no shared substrate / no external connection / no network). Asymmetry by silent omission is exactly the gap-class the porting experiment surfaced; explicit "N/A" notes are the symmetric remedy.

#### Phase 3.0 — Source-read pass before any writing

Per the project's verification stance, every documented behavior fact must be confirmed against the actual implementation in `py/packages/` and `ts/packages/` before it is written into a README. Phase 3.0 produces an internal notes table (not committed to docs) with one row per gap covering #4–9, listing both languages' `path:line` references for the underlying behavior, plus the verified canonical wording. Subsequent sub-phases consume this table.

For gap #3 (codegen ABC shape), Phase 3.0 also confirms that the existing `tests/interop/generated/{ts,py}/arith.{ts,py}` files contain a representative ABC shape, or extends them by running codegen against a small contract that produces one.

#### Phase 3.1 — Per-gap edits

Gap-by-gap mapping. Each row identifies the gap, the file(s) it lands in, the form of the fix, and (where applicable) the new fixture required.

| # | Gap | File(s) | Form | New fixture? |
|---|---|---|---|---|
| 1 | When to use notification vs. method | `py/packages/protocol/README.md`, `ts/packages/protocol/README.md` | short prose subsection (~150 words) covering the design trade-off | no |
| 2 | `RpcError` constructor / shape | `py/packages/protocol/README.md`, `ts/packages/protocol/README.md` | small fixture demonstrating `raise RpcError(code, message, data)` (Py) and `throw new RpcError({ code, message, data })` (TS), quoted with comments labeling each field | yes — minimal protocol-package-local test per language that constructs an `RpcError` and asserts the JSON-RPC error envelope shape it produces. No transport needed; `RpcError` shape is protocol-intrinsic. Likely homes: `py/packages/protocol/tests/test_rpc_error.py`, `ts/packages/protocol/tests/rpc-error.test.ts` (the implementation plan confirms or chooses) |
| 3 | Codegen ABC method signature shape | `ts/packages/codegen/README.md` | quote a representative slice of the existing generated ABC under `tests/interop/generated/ts/arith.ts` (or `.py` if the ABC shape is clearer there), with a prose annotation explaining how each Zod method maps to an emitted method signature | no (uses existing generated artifact; if shape coverage gaps exist, Phase 3.0 extends it) |
| 4 | `register_service` timing (only before `start()`?) | `py/packages/over-redis/README.md`, `ts/packages/over-redis/README.md`; symmetric copies in `over-memory` READMEs | code comment in the quickstart fixture's quoted block, on the `register_service` line: must precede `start()`; `start()` is idempotent / not | no (annotates Phase 2 fixture) |
| 5 | `stop()` drain semantics | `py/packages/over-redis/README.md`, `ts/packages/over-redis/README.md`; symmetric copies in `over-memory` READMEs | code comment on `await server.stop()`: drains in-flight handlers before returning; cancels after `shutdownGraceMs` (TS) / equivalent (Py) | no |
| 6 | Owned Redis keys under `keyPrefix` | `py/packages/over-redis/README.md`, `ts/packages/over-redis/README.md` | small Markdown table titled "Keys owned under `keyPrefix`" listing each stream / consumer-group / heartbeat key pattern, with a one-line purpose for each. **Memory side:** explicit one-line "N/A — no shared substrate; the loopback bus owns no external state" note at the symmetric position | no (table is prose) |
| 7 | Consumer-group / worker-pool semantics for multiple servers | `py/packages/over-redis/README.md`, `ts/packages/over-redis/README.md` | code comment near the server example explaining that multiple `RedisRpcServer` instances sharing a `keyPrefix` form a competing-consumers pool via a single Redis consumer group. **Memory side:** explicit "single-process loopback; no cross-process worker pool" note at symmetric position | no |
| 8 | Connection ownership when `redis=` is injected | `py/packages/over-redis/README.md`, `ts/packages/over-redis/README.md` | code comment on `RedisRpcServer({ redis: ..., ... })`: injected client is not closed by `stop()`; caller owns lifecycle. **Memory side:** "N/A — no external connection to own" note at symmetric position | no |
| 9 | Client default timeout, retry, cancel propagation | `py/packages/over-redis/README.md`, `ts/packages/over-redis/README.md`; over-memory gets a reduced-form copy | comments on `RedisRpcClient(...)` and on a representative `client.call(...)` line: default timeout (the actual numeric default extracted by Phase 3.0), retry policy (none on disconnect — caller's responsibility, per Phase 3.0 confirmation), cancel propagation (whether server-side cancellation is implemented, determined by Phase 3.0 source-read; if the answer is "no", the comment says so explicitly). **Memory side:** timeout + cancel only, with a "no retry — call is local" note | no |

Total: 9 gaps × 2 languages where symmetric (gap 3 is single-language) × variable form. Approximate edit count: ~25 substantive comment/table/prose edits + ~4 explicit-N/A notes across 7 README files (the 4 transport READMEs gain symmetric edits; protocol READMEs gain gaps #1 and #2; codegen README gains gap #3).

#### Phase 3.2 — Source files for new comments

Per the rule update in Phase 1.1, comments in the README copy may be added without corresponding source-file changes. Phase 3.1 follows that pattern: new comments live only in the README copy, and the verbatim-diff check ignores them.

If a fact added in Phase 3 turns out to be illustrated more naturally by changing a fixture (e.g., a fixture that explicitly shows `register_service` happening before `start()` because that order is otherwise implicit), the implementation plan may add a comment to the fixture itself instead. This is a matter of placement preference, not rule compliance.

#### Phase 3.3 — Verification after Phase 3

- `pnpm -C ts -r build` and `pnpm -C ts -r test` continue to pass.
- `uv --project py run --frozen pytest` continues to pass.
- `make check-readmes` reports zero violations.
- The user runs the validation experiment (see "Validation handoff" below).

## Validation handoff

After Phase 3 lands, the user re-runs the porting experiment with a fresh agent and only the updated READMEs as reference. Success criterion: the agent does not surface gaps from the original list of 9 items. Gaps surfacing in unrelated areas are acceptable feedback for future iterations but not blockers for this spec.

The user has chosen to run validation themselves rather than dispatching a sub-agent for it. This work does not include automated re-experiment runs.

## Examples-policy compatibility

Phase 1.1 modifies the rule. Phase 1.2 enforces the modified rule. Phases 2 and 3 land artifacts that comply with it.

The two coupling rules in Phase 1.1 are restatements of behavior that disciplined contributors already follow informally; making them explicit is a standardization step, not a behavior change. The verbatim-diff check in Phase 1.2 is the only mechanical addition. After Phase 1, any future README edit that drifts from source fails CI rather than rotting silently — which is the SSOT promise the original rule intended but did not enforce.

## Out of scope (explicit)

- No CHANGELOG entries.
- No edits to existing design or plan documents.
- No restructuring of `docs/`.
- No `make interop` runs and no docker invocations.
- No edits to `package.json` or `pyproject.toml` beyond what fixture additions require.
- No new top-level READMEs (e.g., `tests/README.md`, `scripts/README.md`).
- No edits to per-package `AGENTS.md` files. The rule update lives only in the top-level `AGENTS.md`.

## Open questions

None at spec time. The implementation plan will resolve:

- Script language for `check-readme-verbatim` (Phase 1.2).
- Fixture-home choice (shared contract fixture vs. per-transport variants in Phase 2).
- Generated-proxy source path for fixtures (existing `tests/interop/generated/` reuse vs. per-package regeneration in Phase 2).
- Exact `Keys owned` table content for gap #6 (depends on Phase 3.0 source-read).
