#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/release.sh <version>           — bump all packages, verify, print next steps
#   scripts/release.sh publish <version>   — publish pre-bumped packages to npm + PyPI

SUBCOMMAND=""
if [[ "${1:-}" == "publish" ]]; then
  SUBCOMMAND="publish"
  shift
fi

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  if [[ "$SUBCOMMAND" == "publish" ]]; then
    echo "usage: $0 publish <version>" >&2
  else
    echo "usage: $0 <version>" >&2
  fi
  exit 2
fi
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
  echo "invalid version: $VERSION (expect X.Y.Z[-pre])" >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "$0")/.."; pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Publish phase (runs after bump+commit+tag, called manually by the user)
# ---------------------------------------------------------------------------
if [[ "$SUBCOMMAND" == "publish" ]]; then
  TS_PKGS=(ts/packages/protocol ts/packages/over-memory ts/packages/over-redis ts/packages/codegen)
  PY_PKGS=(py/packages/protocol py/packages/over-memory py/packages/over-redis)

  echo "==> pnpm publish (dep order: protocol, over-memory, over-redis, codegen)"
  # pnpm publish rewrites @clamator/* "workspace:*" deps to the real version
  # automatically. Use pnpm (not npm) so this rewrite happens.
  for pkg in "${TS_PKGS[@]}"; do
    pushd "$REPO_ROOT/$pkg" >/dev/null
    name="$(jq -r .name package.json)"
    pubver="$(jq -r .version package.json)"
    if [[ "$pubver" != "$VERSION" ]]; then
      echo "version mismatch in $pkg: $pubver != $VERSION" >&2
      exit 1
    fi
    echo "  publishing $name@$pubver ..."
    pnpm publish --access public --no-git-checks
    popd >/dev/null
  done

  echo "==> PyPI publish (dep order: protocol, over-memory, over-redis)"
  # uv build from a workspace member writes artifacts to the workspace-root
  # py/dist/, NOT to <pkg>/dist/. Build all once, then upload per-pkg in dep order.
  rm -rf "$REPO_ROOT/py/dist"
  ( cd "$REPO_ROOT/py" && uv build --all )

  declare -A PY_PYPI_NAMES=(
    [py/packages/protocol]=clamator_protocol
    [py/packages/over-memory]=clamator_over_memory
    [py/packages/over-redis]=clamator_over_redis
  )
  for pkg in "${PY_PKGS[@]}"; do
    name="${PY_PYPI_NAMES[$pkg]}"
    echo "  uploading $name@$VERSION ..."
    twine upload "$REPO_ROOT/py/dist/${name}-${VERSION}"*
  done

  echo "==> Done. Verify with:"
  echo "    npm view @clamator/protocol@$VERSION"
  echo "    pip index versions clamator-protocol"
  exit 0
fi

# ---------------------------------------------------------------------------
# Bump phase
# ---------------------------------------------------------------------------

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
# Bump only the .version field. Leave @clamator/* deps as "workspace:*" so the
# verification build/test/interop run uses workspace links. pnpm publish rewrites
# workspace:* → the real version automatically at publish time.
TS_PKGS=(ts/packages/protocol ts/packages/over-memory ts/packages/over-redis ts/packages/codegen)
for pkg in "${TS_PKGS[@]}"; do
  if [[ ! -f "$pkg/package.json" ]]; then continue; fi
  jq --arg v "$VERSION" '.version = $v' \
    "$pkg/package.json" > "$pkg/package.json.new"
  mv "$pkg/package.json.new" "$pkg/package.json"
done

# --- Py packages ---
# [project] version field and any "clamator-*==<ver>" dependency pins.
PY_PKGS=(py/packages/protocol py/packages/over-memory py/packages/over-redis)
for pkg in "${PY_PKGS[@]}"; do
  if [[ ! -f "$pkg/pyproject.toml" ]]; then continue; fi
  python3 - "$pkg/pyproject.toml" "$VERSION" <<'PY'
import sys, re
path, version = sys.argv[1], sys.argv[2]
with open(path) as f:
    text = f.read()
# Bump [project] version = "..."
text = re.sub(r'(?m)^(version\s*=\s*")[^"]+(")', rf'\g<1>{version}\g<2>', text, count=1)
# Bump pinned clamator-* deps: clamator-foo==old  →  clamator-foo==new
text = re.sub(
    r'(clamator-(?:protocol|over-memory|over-redis|codegen))==[0-9.A-Za-z\-]+',
    rf'\1=={version}', text,
)
with open(path, 'w') as f:
    f.write(text)
PY
done

echo "==> Version bump complete. Running verification..."
make build
make test
make interop

echo "==> All verification passed."
echo ""
echo "==> Diff summary:"
git --no-pager diff --stat

cat <<EOM

Next steps:
  1. Review the diff:  git diff
  2. Commit:           git commit -am "release: v$VERSION"
  3. Tag:              git tag v$VERSION
  4. Push:             git push origin main && git push origin v$VERSION
  5. Wait for the release-verification GH Actions workflow to pass on the tag.
  6. Publish:          $0 publish $VERSION
EOM
