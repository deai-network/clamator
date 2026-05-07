# clamator

[![TS](https://github.com/csillag/clamator/actions/workflows/ts.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/ts.yml)
[![Py](https://github.com/csillag/clamator/actions/workflows/py.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/py.yml)
[![Interop](https://github.com/csillag/clamator/actions/workflows/interop.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/interop.yml)

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

## License

Apache 2.0. See [`LICENSE`](LICENSE).
