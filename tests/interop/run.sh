#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root (two levels up from this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$ROOT"

# Install pnpm dependencies (idempotent)
echo "[run.sh] Installing pnpm dependencies..."
pnpm -C ts install --frozen-lockfile 2>/dev/null || pnpm -C ts install

# Run the runner via pnpm exec tsx (uses the lib package's local tsx).
# Use `-C ts` so pnpm resolves against the workspace manifest; repo root has none.
echo "[run.sh] Starting interop runner..."
pnpm -C ts --filter @clamator/interop-runner exec tsx \
  "$ROOT/tests/interop/lib/runner.ts"
