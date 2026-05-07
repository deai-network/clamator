# Repo Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrappable monorepo with TS pnpm workspace, Py uv workspace, Apache 2.0 license, and working `make install/build/test/lint/clean` against empty package sets.

**Architecture:** Top-level `Makefile` delegates to two language workspaces. TS via pnpm with `packages/*` glob. Py via uv with workspace members. Empty-package builds and tests succeed cleanly. All design + plan docs land flat under `docs/`.

**Tech Stack:** pnpm 9, Node ≥20, TypeScript 5, uv ≥0.5, Python ≥3.11, GNU make.

---

## File Structure

- Create: `LICENSE` — verbatim Apache 2.0 license text.
- Create: `README.md` — pre-1.0 disclaimer, install/build/test pointers, link to design doc.
- Create: `CHANGELOG.md` — Keep-a-Changelog skeleton with `## [Unreleased]`.
- Create: `.gitignore` — Node, Python, dist, generated, docker volumes.
- Create: `Makefile` — install, build, lint, test, interop, clean, release, help.
- Create: `ts/package.json` — workspace root, devDeps only, `private: true`.
- Create: `ts/pnpm-workspace.yaml` — `packages: ['packages/*']`.
- Create: `ts/tsconfig.base.json` — strict, ES2022, ESM, declaration true.
- Create: `py/pyproject.toml` — uv workspace root, dev-deps, ruff + pytest config.
- Create: `docs/backlog.md` — deferred items from design §scope.

`AGENTS.md` already exists at repo root; do not modify in this plan.

---

## Task 1: License + repo metadata

**Files:**
- Create: `LICENSE`
- Create: `README.md`
- Create: `CHANGELOG.md`
- Create: `.gitignore`

- [ ] **Step 1: Write `LICENSE`**

Paste the verbatim Apache 2.0 license text from https://www.apache.org/licenses/LICENSE-2.0.txt. At the end (after the standard "APPENDIX: How to apply..." block), append:

```
Copyright 2026 Kristof Csillag

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

Verify with: `wc -l LICENSE` → expect ≥200 lines.

- [ ] **Step 2: Write `README.md`**

````markdown
# clamator

Polyglot TS↔Py RPC over pluggable transports. JSON-RPC 2.0 envelopes; Zod as contract source of truth; codegen for Python.

> **Pre-1.0:** API stability not guaranteed. Minor versions may break.

See [`docs/2026-05-07-clamator-design.md`](docs/2026-05-07-clamator-design.md) for the design spec.

## Build

```bash
make install   # install deps in both langs
make build     # build all packages
make test      # per-lang unit tests
make interop   # cross-lang interop tests (requires docker)
```

## Packages

| npm | PyPI |
|---|---|
| `@clamator/protocol` | `clamator-protocol` |
| `@clamator/over-memory` | `clamator-over-memory` |
| `@clamator/over-redis` | `clamator-over-redis` |
| `@clamator/codegen` | — |

## License

Apache 2.0. See [`LICENSE`](LICENSE).
````

- [ ] **Step 3: Write `CHANGELOG.md`**

```markdown
# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow lockstep across all packages until 1.0.

## [Unreleased]
```

- [ ] **Step 4: Write `.gitignore`**

```gitignore
# Node
node_modules/
*.log
npm-debug.log*
.pnpm-store/

# TypeScript build output
ts/packages/*/dist/
ts/packages/*/.tsbuildinfo
ts/packages/*/lib/

# Python
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
.venv/
.uv-cache/
py/packages/*/dist/
py/packages/*/build/
py/packages/*/*.egg-info/

# Codegen artifacts
tests/interop/generated/
tests/interop/.tmp/

# Docker
tests/interop/.redis-data/

# IDE
.vscode/
.idea/
*.swp
.DS_Store
```

- [ ] **Step 5: Commit**

```bash
git add LICENSE README.md CHANGELOG.md .gitignore
git commit -m "chore: add license, readme, changelog, gitignore"
```

---

## Task 2: TS workspace root

**Files:**
- Create: `ts/package.json`
- Create: `ts/pnpm-workspace.yaml`
- Create: `ts/tsconfig.base.json`

- [ ] **Step 1: Write `ts/package.json`**

```json
{
  "name": "clamator-ts-workspace",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20",
    "pnpm": ">=9"
  },
  "packageManager": "pnpm@9.12.0",
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^20.0.0",
    "vitest": "^2.1.0",
    "tsx": "^4.19.0"
  },
  "scripts": {
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "build": "pnpm -r build",
    "clean": "pnpm -r clean"
  }
}
```

- [ ] **Step 2: Write `ts/pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Write `ts/tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

- [ ] **Step 4: Verify `pnpm install` succeeds with empty packages glob**

```bash
cd ts && pnpm install
```

Expected: `Done in N.Ns`. No errors. `ts/node_modules/` and `ts/pnpm-lock.yaml` created. Warning about empty `packages/*` glob is acceptable.

- [ ] **Step 5: Commit**

```bash
git add ts/package.json ts/pnpm-workspace.yaml ts/tsconfig.base.json ts/pnpm-lock.yaml
git commit -m "chore(ts): scaffold pnpm workspace"
```

---

## Task 3: Py workspace root

**Files:**
- Create: `py/pyproject.toml`

- [ ] **Step 1: Write `py/pyproject.toml`**

```toml
[tool.uv.workspace]
members = ["packages/*"]

[tool.uv]
dev-dependencies = [
  "pytest>=8.0",
  "pytest-asyncio>=0.24",
  "ruff>=0.6",
  "mypy>=1.10",
]

[tool.ruff]
line-length = 100
target-version = "py311"
extend-exclude = [".venv", "build", "dist"]

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "PL"]
ignore = ["PLR0913"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["packages"]
```

(No `[project]` table at the workspace root — uv workspaces only require `[tool.uv.workspace]` when no project metadata is needed at the root.)

- [ ] **Step 2: Verify `uv sync` succeeds**

```bash
cd py && uv sync
```

Expected: `Resolved N packages`, `Installed N packages`. `py/.venv/` and `py/uv.lock` created. No errors.

- [ ] **Step 3: Commit**

```bash
git add py/pyproject.toml py/uv.lock
git commit -m "chore(py): scaffold uv workspace"
```

---

## Task 4: Top-level Makefile

**Files:**
- Create: `Makefile`

- [ ] **Step 1: Write `Makefile`**

```makefile
.PHONY: install build test lint clean release interop help

help:                    ## list targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "%-12s %s\n", $$1, $$2}'

install:    ## install deps in both langs
	cd ts && pnpm install
	cd py && uv sync

build:      ## build all packages
	cd ts && pnpm -r build
	cd py && uv build --all

lint:       ## lint both langs
	cd ts && pnpm -r lint
	cd py && uv run ruff check .

test:       ## per-lang unit tests (no interop)
	cd ts && pnpm -r test
	cd py && uv run pytest

interop:    ## cross-lang interop tests (regen fixtures, spin redis, run scenarios)
	bash tests/interop/run.sh

clean:      ## clean all artifacts
	cd ts && pnpm -r clean || true
	cd py && find packages -type d \( -name dist -o -name build -o -name .pytest_cache -o -name __pycache__ -o -name '*.egg-info' \) -exec rm -rf {} + 2>/dev/null || true
	rm -rf tests/interop/.tmp tests/interop/generated
	rm -rf ts/node_modules

release:    ## lockstep version bump + local publish to npm + PyPI
	bash scripts/release.sh
```

- [ ] **Step 2: Verify `make help` prints aligned target list**

```bash
make help
```

Expected: each target listed with its `##` description.

- [ ] **Step 3: Verify `make install` succeeds**

```bash
make install
```

Expected: pnpm + uv install both succeed; exit 0.

- [ ] **Step 4: Verify `make test` succeeds on empty workspaces**

```bash
make test
```

If `pytest` exits 5 ("no tests collected"), modify the `test:` target to swallow that specific code:

```makefile
test:       ## per-lang unit tests (no interop)
	cd ts && pnpm -r test
	cd py && uv run pytest --co -q >/dev/null 2>&1 || EXIT=$$?; \
	  if [ "$${EXIT:-0}" -eq 5 ]; then echo "(no python tests)"; \
	  else cd py && uv run pytest; fi
```

(Keep the simple form first; only apply the override if needed.)

- [ ] **Step 5: Verify `make build` exits 0**

```bash
make build
```

Expected: `pnpm -r build` and `uv build --all` both succeed (no packages → noop).

- [ ] **Step 6: Verify `make clean` exits 0**

```bash
make clean
```

Expected: removes any artifacts; no errors when nothing to clean.

- [ ] **Step 7: Commit**

```bash
git add Makefile
git commit -m "chore: add top-level Makefile"
```

---

## Task 5: Backlog file

**Files:**
- Create: `docs/backlog.md`

- [ ] **Step 1: Write `docs/backlog.md`**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/backlog.md
git commit -m "docs: seed backlog"
```

---

## Final verification

- [ ] **Step 1: Run full pipeline against empty workspace**

```bash
make clean && make install && make build && make test && make lint
```

Each must exit 0.

- [ ] **Step 2: Confirm `git status` clean**

```bash
git status
```

Expected: `nothing to commit, working tree clean`.
