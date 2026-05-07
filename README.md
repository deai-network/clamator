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
