# Release + CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the release tooling (`scripts/release.sh`) for lockstep version bump + local publish, plus the three GitHub Actions workflows (`ts.yml`, `py.yml`, `interop.yml`) and the verification-only `release.yml`. Wire everything to the v0.1 packages from plans 01–06.

**Architecture:** Per-language CI workflows lint, build, test packages on every PR + push to main. A separate `interop.yml` workflow stands up redis (service container), regenerates fixtures via codegen, runs the full interop scenario suite. `release.yml` triggers on tag push (`v*.*.*`) and runs the same verification across the tagged ref; **it does not publish**. Publishing is local: the user runs `scripts/release.sh <version>` from their machine, which bumps every `package.json` and `pyproject.toml` in lockstep, runs full verification, then `npm publish` + `twine upload` per package in dependency order.

**Tech Stack:** bash + jq for `release.sh`. GitHub Actions YAML. `npm publish`, `uv build`, `twine` (Py).

**Depends on:** all of plans 01–06 must be complete (need real packages + tests + interop suite to verify against).

---

## File Structure

- Create: `scripts/release.sh` — version-bump + publish driver.
- Create: `.github/workflows/ts.yml`
- Create: `.github/workflows/py.yml`
- Create: `.github/workflows/interop.yml`
- Create: `.github/workflows/release.yml` — verification only.

---

## Task 1: `scripts/release.sh`

**Files:**
- Create: `scripts/release.sh`

- [ ] **Step 1: Write `scripts/release.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "usage: $0 <version>" >&2
  exit 2
fi
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "invalid version: $VERSION (expect X.Y.Z[-pre])" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.."; pwd)"
cd "$REPO_ROOT"

# --- Pre-checks ---
if [[ -n "$(git status --porcelain)" ]]; then
  echo "working tree not clean; commit or stash first" >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "must be on main; on $CURRENT_BRANCH" >&2
  exit 1
fi

git fetch origin main --quiet
LOCAL="$(git rev-parse main)"
REMOTE="$(git rev-parse origin/main)"
if [[ "$LOCAL" != "$REMOTE" ]]; then
  echo "local main is not in sync with origin/main; pull first" >&2
  exit 1
fi

echo "==> Bumping all packages to $VERSION"

# --- TS packages ---
TS_PKGS=(ts/packages/protocol ts/packages/over-memory ts/packages/over-redis ts/packages/codegen)
for pkg in "${TS_PKGS[@]}"; do
  if [[ ! -f "$pkg/package.json" ]]; then continue; fi
  jq --arg v "$VERSION" \
    '.version = $v
     | (.dependencies // {}) as $deps
     | .dependencies = ($deps | with_entries(if .key | startswith("@clamator/") then .value = $v else . end))' \
    "$pkg/package.json" > "$pkg/package.json.new"
  mv "$pkg/package.json.new" "$pkg/package.json"
done

# --- Py packages ---
PY_PKGS=(py/packages/protocol py/packages/over-memory py/packages/over-redis)
for pkg in "${PY_PKGS[@]}"; do
  if [[ ! -f "$pkg/pyproject.toml" ]]; then continue; fi
  # Update [project] version
  python3 - "$pkg/pyproject.toml" "$VERSION" <<'PY'
import sys, re
path, version = sys.argv[1], sys.argv[2]
with open(path) as f:
    text = f.read()
text = re.sub(r'(?m)^(version\s*=\s*")[^"]+(")', rf'\g<1>{version}\g<2>', text, count=1)
text = re.sub(
    r'(clamator-(?:protocol|over-memory|over-redis|codegen))==[0-9.A-Za-z\-]+',
    rf'\1=={version}', text,
)
with open(path, 'w') as f:
    f.write(text)
PY
done

echo "==> Verifying lockstep"
make build
make test
make interop

echo "==> All verification passed."
echo "==> Diff summary:"
git --no-pager diff --stat

cat <<EOM

Next steps:
  1. Review the diff above.
  2. Commit:    git commit -am "release: v$VERSION"
  3. Tag:       git tag v$VERSION
  4. Push:      git push origin main && git push origin v$VERSION
  5. Wait for the verification GH Actions workflow to pass on the tag.
  6. Publish phase: $0 publish $VERSION
EOM

if [[ "${1:-}" == "publish" ]]; then
  shift
  PUB_VERSION="${1:-}"
  if [[ -z "$PUB_VERSION" ]]; then
    echo "usage: $0 publish <version>" >&2
    exit 2
  fi

  echo "==> npm publish (dep order: protocol, over-memory, over-redis, codegen)"
  for pkg in "${TS_PKGS[@]}"; do
    pushd "$pkg" >/dev/null
    name="$(jq -r .name package.json)"
    pubver="$(jq -r .version package.json)"
    if [[ "$pubver" != "$PUB_VERSION" ]]; then
      echo "version mismatch in $pkg: $pubver != $PUB_VERSION" >&2; exit 1
    fi
    npm publish --access public
    popd >/dev/null
  done

  echo "==> PyPI publish (dep order: protocol, over-memory, over-redis)"
  cd py
  for pkg in "${PY_PKGS[@]}"; do
    pushd "../$pkg" >/dev/null
    rm -rf dist
    uv build
    twine upload dist/*
    popd >/dev/null
  done
  cd "$REPO_ROOT"
  echo "==> Done. Verify with:"
  echo "    npm view @clamator/protocol@$PUB_VERSION"
  echo "    pip index versions clamator-protocol"
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/release.sh
```

- [ ] **Step 3: Smoke-run the bump phase against a tag like 0.1.1-test**

(Do NOT run `publish`.) Use a throwaway branch to verify the script doesn't break.

```bash
git checkout -b release-script-smoke
bash scripts/release.sh 0.1.1-test
git diff --stat                          # check expected changes
git checkout main && git branch -D release-script-smoke
```

- [ ] **Step 4: Commit**

```bash
git add scripts/release.sh
git commit -m "chore: scripts/release.sh — lockstep bump + verify + local publish"
```

---

## Task 2: `.github/workflows/ts.yml`

**Files:**
- Create: `.github/workflows/ts.yml`

- [ ] **Step 1: Write `ts.yml`**

```yaml
name: TS

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-test-lint:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
          run_install: false
      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ~/.local/share/pnpm/store
          key: pnpm-${{ runner.os }}-${{ hashFiles('ts/pnpm-lock.yaml') }}
          restore-keys: pnpm-${{ runner.os }}-
      - name: Install
        run: cd ts && pnpm install --frozen-lockfile
      - name: Lint
        run: cd ts && pnpm -r lint
      - name: Build
        run: cd ts && pnpm -r build
      - name: Test
        run: cd ts && pnpm -r test
```

- [ ] **Step 2: Push to a branch + open PR; verify the workflow runs green**

```bash
git checkout -b ci-ts
git add .github/workflows/ts.yml
git commit -m "ci: ts build/test/lint workflow"
git push -u origin ci-ts
# Open PR; verify green; merge.
```

(If the workflow fails, fix root cause — do NOT add `continue-on-error`.)

---

## Task 3: `.github/workflows/py.yml`

**Files:**
- Create: `.github/workflows/py.yml`

- [ ] **Step 1: Write `py.yml`**

```yaml
name: Py

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build-test-lint:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - name: Install uv
        run: pipx install uv
      - name: Cache uv
        uses: actions/cache@v4
        with:
          path: ~/.cache/uv
          key: uv-${{ runner.os }}-${{ hashFiles('py/uv.lock') }}
          restore-keys: uv-${{ runner.os }}-
      - name: Sync
        run: cd py && uv sync --frozen
      - name: Lint
        run: cd py && uv run ruff check .
      - name: Test
        run: cd py && uv run pytest -v
      - name: Build
        run: cd py && uv build --all
```

- [ ] **Step 2: Verify green on PR**

```bash
git add .github/workflows/py.yml
git commit -m "ci: py build/test/lint workflow"
git push
```

---

## Task 4: `.github/workflows/interop.yml`

**Files:**
- Create: `.github/workflows/interop.yml`

- [ ] **Step 1: Write `interop.yml`**

```yaml
name: Interop

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  cross-language:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    services:
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 1s
          --health-timeout 1s
          --health-retries 30
    env:
      REDIS_URL: redis://localhost:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - uses: pnpm/action-setup@v4
        with:
          version: 9.12.0
      - name: Install uv
        run: pipx install uv
      - name: Install datamodel-code-generator
        run: pipx install datamodel-code-generator
      - name: pnpm install
        run: cd ts && pnpm install --frozen-lockfile
      - name: uv sync
        run: cd py && uv sync --frozen
      - name: Build TS packages
        run: cd ts && pnpm -r build
      - name: Run interop scenarios
        run: bash tests/interop/run.sh
        env:
          # Compose-up not needed; the service container above provides redis.
          INTEROP_USE_EXTERNAL_REDIS: '1'
```

> NOTE: The `tests/interop/run.sh` runner currently hardcodes `docker compose up`. Add an env-guarded path: when `INTEROP_USE_EXTERNAL_REDIS=1`, skip docker calls and use the existing `REDIS_URL`. Update `tests/interop/lib/docker.ts` accordingly.

- [ ] **Step 2: Adjust runner for external redis**

In `tests/interop/lib/runner.ts`, gate `dockerComposeUp`/`dockerComposeDown` calls:

```typescript
const useExternalRedis = process.env.INTEROP_USE_EXTERNAL_REDIS === '1';
// In main():
if (!useExternalRedis) dockerComposeUp(COMPOSE_FILE);
try {
  await waitForRedis(REDIS_URL);
  /* ... */
} finally {
  if (!useExternalRedis && process.env.INTEROP_KEEP_DOCKER !== '1') dockerComposeDown(COMPOSE_FILE);
}
```

- [ ] **Step 3: Verify green on PR**

```bash
git add .github/workflows/interop.yml tests/interop/lib/runner.ts
git commit -m "ci: interop workflow + external-redis runner mode"
git push
```

If the runner can't actually find the redis service container, debug by adding a `redis-cli ping` step against `127.0.0.1:6379` before the run.

---

## Task 5: `.github/workflows/release.yml`

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write `release.yml`**

```yaml
name: Release verification

on:
  push:
    tags:
      - 'v*.*.*'

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    services:
      redis:
        image: redis:7-alpine
        ports: ['6379:6379']
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 1s --health-timeout 1s --health-retries 30
    env:
      REDIS_URL: redis://localhost:6379
      INTEROP_USE_EXTERNAL_REDIS: '1'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - name: Install uv
        run: pipx install uv
      - name: Install datamodel-code-generator
        run: pipx install datamodel-code-generator
      - name: Install + build (both langs)
        run: |
          cd ts && pnpm install --frozen-lockfile && pnpm -r build && cd ..
          cd py && uv sync --frozen && uv build --all && cd ..
      - name: Test
        run: |
          cd ts && pnpm -r test && cd ..
          cd py && uv run pytest -v && cd ..
      - name: Interop
        run: bash tests/interop/run.sh
      - name: Verify lockstep version on tag
        run: |
          TAG="${GITHUB_REF_NAME#v}"
          fail=0
          for pkg in ts/packages/protocol ts/packages/over-memory ts/packages/over-redis ts/packages/codegen; do
            ver="$(jq -r .version "$pkg/package.json")"
            if [[ "$ver" != "$TAG" ]]; then echo "$pkg version $ver != tag $TAG"; fail=1; fi
          done
          for pkg in py/packages/protocol py/packages/over-memory py/packages/over-redis; do
            ver="$(grep -E '^version' "$pkg/pyproject.toml" | head -1 | sed -E 's/version\s*=\s*"([^"]+)"/\1/')"
            if [[ "$ver" != "$TAG" ]]; then echo "$pkg version $ver != tag $TAG"; fail=1; fi
          done
          [[ "$fail" -eq 0 ]]
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
```

> **Important:** Do NOT add publish steps to this workflow. Per AGENTS.md §7, publishing is local. This workflow's only job is to produce a green badge on the tagged ref + create the GH Release.

- [ ] **Step 2: Verify by pushing a test tag**

(Skip until at least one full release attempt; for initial wiring, confirm the YAML parses by running `gh workflow list`.)

```bash
git add .github/workflows/release.yml
git commit -m "ci: release verification workflow (no publish)"
git push
```

---

## Task 6: README polish + final integration check

**Files:**
- Modify: `README.md` (add badges + release pointer)
- Modify: `AGENTS.md` (no changes — already documents release flow)

- [ ] **Step 1: Add CI badges + brief release note to `README.md`**

Append after the title:

```markdown
[![TS](https://github.com/csillag/clamator/actions/workflows/ts.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/ts.yml)
[![Py](https://github.com/csillag/clamator/actions/workflows/py.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/py.yml)
[![Interop](https://github.com/csillag/clamator/actions/workflows/interop.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/interop.yml)
```

And add a Release section near the bottom:

```markdown
## Release

Lockstep semver across all 7 packages. Releases are tag-driven verification + local publish:

```bash
bash scripts/release.sh 0.1.0          # bump + verify
git commit -am "release: v0.1.0"
git tag v0.1.0
git push origin main v0.1.0
# Wait for the verification workflow to go green on the tag.
bash scripts/release.sh publish 0.1.0  # npm publish + twine upload locally
```
```

- [ ] **Step 2: Final integration sweep**

```bash
make clean && make install && make build && make test && make interop
```

Each must exit 0.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: CI badges + release section in README"
```

---

## Task 7: Required-status-check setup (manual)

This is a GitHub UI step, not a code change. Perform it after the workflows have run successfully on `main` at least once:

- [ ] **Step 1: In repo Settings → Branches → Branch protection rule for `main`**

Add required status checks:
- `TS / build-test-lint`
- `Py / build-test-lint`
- `Interop / cross-language`

(Per `docs/2026-05-07-implementation-plans-index.md`, the GH Actions verification workflow is required-status-check on `main`.)

- [ ] **Step 2: Document the protection in `AGENTS.md`** (append a short note under §7 Build and release tooling)

```markdown
### Required status checks on `main`

- `TS / build-test-lint`
- `Py / build-test-lint`
- `Interop / cross-language`

These three must pass on every PR before merge. The release-verification workflow is gated on tags only.
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): note required status checks on main"
```

---

## Final verification (whole plan)

- [ ] **Step 1: Confirm `make` end-to-end**

```bash
make clean && make install && make build && make test && make lint && make interop
```

- [ ] **Step 2: Confirm CI green on PR**

Open a PR with a trivial change. All three workflows pass (`TS`, `Py`, `Interop`).

- [ ] **Step 3: Confirm tag verification**

Push a `v0.1.0-rc.0` tag (or similar) on a side branch and confirm `Release verification` runs green and creates a GH Release.

- [ ] **Step 4: Final commit clean**

```bash
git status
```
