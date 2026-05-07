# Agent Instructions — clamator

These rules apply to every agent working in this repository.

## 1. Workflow

### Use the relevant superpowers skill before any change

Every feature addition, behavior change, or bug fix MUST go through the relevant superpowers skill before implementation — `brainstorming` for new features and changes, `systematic-debugging` for bugs, `test-driven-development` for implementation. **No exceptions for "simple" tasks.** If you find yourself thinking "this is too simple to need it," that is the exact moment you must use it. The user does not need to mention skills explicitly — recognizing when they apply is your job.

### Describe and confirm before implementing

Do not implement any change — including bug fixes, refactors, or "obvious" improvements — without first describing what you intend to do and getting explicit confirmation from the user.

### Read sibling implementations before modifying one of them

Whenever a behavior is implemented twice — TS side and Py side, or `over-memory` adapter and `over-redis` adapter — read all sibling implementations before modifying any one. Invariants like validation order, error-code mapping, and idempotency contract drift fast otherwise.

### Cross-language synchronization

When you add a reserved error code, change a method-format constraint, or alter a wire-envelope field, update both language sides (`@clamator/protocol` and `clamator-protocol`) and add interop scenario coverage in the same commit.

## 2. Permissions

- Read any superpowers-related file freely.
- Write design and plan files to `docs/` freely.
- During an approved implementation phase, write freely within this repo.
- Run any `bash`, `pnpm`, `node`, `uv`, `python`, `ruff`, `redis-cli`, or `docker compose` command without asking, **except** destructive ones (publish, force-push, deploy) — those require explicit user instruction (see § 9).

## 3. Repository conventions

### Rules live in `AGENTS.md`

All project rules go in `AGENTS.md`. Never create a `CLAUDE.md` file.

### `docs/` is flat

Place design, spec, and plan documents directly under `docs/` (e.g., `docs/2026-05-07-clamator-design.md`). Never nest under `docs/superpowers/specs/`, `docs/superpowers/plans/`, `docs/specs/`, or any similar hierarchy.

### Backlog tracking

`docs/backlog.md` tracks future work and architectural decisions. Always consult it when starting a new task — there may already be a plan or decision relevant to the work. Keep it current:
- When new decisions about future work are made, add them.
- When planned work completes, update or remove the entry.
- When a multi-phase project progresses, update phase status.

### Per-package `AGENTS.md`

Each package under `ts/packages/*` and `py/packages/*` has its own `AGENTS.md` with package-specific API details. When you change a package's public API, exported symbols, contract entries, configuration knobs, or transport behavior, update that package's `AGENTS.md` in the same commit. Also check whether the root `AGENTS.md` needs a corresponding update.

### Make targets

When modifying `Makefile` targets (adding, renaming, or removing), also update the `make help` output and the README if necessary.

## 4. Tooling

### TypeScript

All TypeScript work goes through `pnpm` from `ts/`. Do not invoke `npx` against the host — use `pnpm exec` or the workspace-local binaries.

### Python

All Python work goes through `uv run` from `py/`. Do not invoke `python` against the host interpreter directly.

### Redis (interop tests)

`redis-cli` runs **inside the docker container** started by `tests/interop/docker-compose.yml`:

```bash
docker exec -it <redis-container> redis-cli
```

Resolve the container name via `docker ps --format '{{.Names}}' | grep redis`. Do not try to install `redis-cli` on the host.

## 5. Subagent hygiene

When using subagents for search or research, monitor for "Tool result missing due to internal error" situations and similar hangs. Check in every 30–60 seconds and clean up if a subagent is stuck.

## 6. Examples and tests

### Examples in code documentation must run

Code examples in the README and docs that demonstrate API usage must either:
1. Be checked by a typecheck-only fixture (or a runnable scenario) in `tests/interop/`, or
2. Be a verbatim quote of a working example file in the repo.

No "example-only" code that has never executed.

### Test layering

- **Per-language unit tests** (`ts/packages/*/tests`, `py/packages/*/tests`) must use in-process API calls and the `over-memory` transport. No spawning subprocesses, no docker, no redis.
- **Subprocess + redis** usage belongs only in `tests/interop/`.

If a unit test seems to require a subprocess, reconsider — usually the right fix is to expose the seam in-process.

## 7. Build and release tooling

Publishing is local (`scripts/release.sh` → `npm publish` + `twine upload`). The `.github/workflows/release.yml` GitHub Action does **verification only** — never add publish steps to any workflow file. Tag-triggered verification produces a green badge for the release; the user runs `release.sh` from their machine to actually upload.

### Required status checks on `main`

- `TS / build-test-lint`
- `Py / build-test-lint`
- `Interop / cross-language`

These three must pass on every PR before merge. The release-verification workflow is gated on tags only.

## 8. Git commits

Do not add `Co-Authored-By` trailers, "🤖 Generated with…" footers, or any other AI-attribution lines to commit messages. Commit messages contain only the actual change description.

## 9. Release process

When the user says "bump version and release", "ship a release", or similar, run this sequence. Confirm each destructive step with the user before proceeding.

### Pre-checks (refuse to proceed if any fail)

- Working tree clean (`git status` empty).
- On `main` branch.
- `git pull` shows no incoming changes.
- All tests + interop pass: `make test && make interop`.

### Steps

1. Ask the user for the new version (or compute next patch by default; show suggestion).
2. Run `scripts/release.sh <new-version>`. The script:
   - Updates every `ts/packages/*/package.json` `version`.
   - Updates every `py/packages/*/pyproject.toml` `[project] version`.
   - Updates pinned inter-package deps to the new version.
   - Runs `make build && make test && make interop`.
3. Show the user the diff. Wait for explicit confirmation before proceeding.
4. Commit changes with message `release: vX.Y.Z`. **No `Co-Authored-By` trailer.**
5. Tag `vX.Y.Z`. Push branch + tag.
6. After the GH Actions verification workflow passes on the tag, run the publish phase of `release.sh`:
   - `npm publish --access public` for each TS package in dep order.
   - `uv build` then `twine upload dist/*` for each Py package in dep order.
7. Confirm successful publish: `npm view @clamator/protocol@X.Y.Z` and `pip index versions clamator-protocol`.

### Refuse to

- Run `make release` or `scripts/release.sh` (publish phase) without explicit user instruction. Verification dry-runs are fine.
- Skip the verification GH Actions check.
- Use `--no-verify`, `--force`, `--no-gpg-sign`, or any other bypass flag.
- Edit `release.sh` to silence pre-checks.
- Add a `Co-Authored-By` trailer to release commits.
- Push without first showing the diff to the user.
