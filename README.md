# clamator

![clamator](https://raw.githubusercontent.com/deai-network/clamator/main/images/splash.png)

[![TS](https://github.com/csillag/clamator/actions/workflows/ts.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/ts.yml)
[![Py](https://github.com/csillag/clamator/actions/workflows/py.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/py.yml)
[![Interop](https://github.com/csillag/clamator/actions/workflows/interop.yml/badge.svg)](https://github.com/csillag/clamator/actions/workflows/interop.yml)

*clamator* is Latin for "shouter" or "crier" (from *clamare*, "to call") — same root as *claim*, *clamor*, *exclaim*. RPC is, after all, the business of calling.

Polyglot TS↔Py RPC over pluggable transports. JSON-RPC 2.0 envelopes; Zod as contract source of truth; codegen for Python.

clamator exists because no off-the-shelf RPC stack covers a particular intersection: TypeScript and Python services in the same system, communicating over a queue or stream substrate (Redis Streams, NATS, or similar), with typed contracts authored once and shared by both sides — no separate IDL, no parallel transport bolted on just to use the queue.

The popular options each force a tradeoff. gRPC is fully polyglot but locks you to HTTP/2 and a separate `.proto` toolchain. tRPC and ts-rest give the best Zod-driven typed DX a TypeScript-only system can ask for, but they don't cross to Python. OpenAPI generators cross languages but force a REST shape onto what is really RPC. Cap'n Proto is fast and polyglot but ships its own IDL and a less idiomatic developer surface. Hand-rolled JSON-RPC over Redis or NATS works for a while, but with no contract layer it leaves you re-typing every method by hand on both sides and re-implementing worker-pool semantics each time.

clamator's combination is what those tools won't combine: Zod as the single source of truth (so the TypeScript side keeps its idiomatic DX), JSON-RPC 2.0 on the wire (text, debuggable, language-neutral, mature), Zod-to-Pydantic codegen (so the Python side gets the same shapes without re-authoring them), and a pluggable, stream-based transport (so Redis Streams, an in-process loopback, or future NATS/AMQP adapters all sit behind the same `Transport` interface). The Redis adapter ships with consumer-group worker-pool semantics already wired up — something every JSON-RPC-over-Redis project ends up reimplementing.

Reach for clamator when a TypeScript service and a Python service share a contract surface, the substrate between them is already a queue or stream, and the alternative is either adopting an HTTP-locked RPC framework alongside the queue you already have, or hand-rolling JSON-RPC envelopes and worker-pool semantics in two languages.

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
| [`@clamator/protocol`](ts/packages/protocol) | [`clamator-protocol`](py/packages/protocol) |
| [`@clamator/over-memory`](ts/packages/over-memory) | [`clamator-over-memory`](py/packages/over-memory) |
| [`@clamator/over-redis`](ts/packages/over-redis) | [`clamator-over-redis`](py/packages/over-redis) |
| [`@clamator/codegen`](ts/packages/codegen) | — |

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
