# @clamator/over-redis — agent rules

Redis-streams transport. Implements the `Transport` interface from `@clamator/protocol`. Per-language unit tests live here against a real redis (skipped if `REDIS_URL` is unset). Cross-language end-to-end tests live in `tests/interop/`.

## Public API surface

- `RedisRpcServer`, `RedisRpcServerOptions`
- `RedisRpcClient`, `RedisRpcClientOptions`
- `ServerRedisTransport`, `ClientRedisTransport` (advanced)
- key-naming helpers from `./keys`

Sibling package: `clamator-over-redis` (Py). Changes here usually require sibling change in same commit.

## Configuration knobs (defaults)

| Knob | Default | Notes |
|---|---|---|
| `keyPrefix` | required | namespace for all streams + keys |
| `instanceId` | UUID | identifies this client/server instance |
| `replyStreamMaxLen` | 1024 | XADD MAXLEN bound for reply streams (server) |
| `consumerClaimIdleMs` | 60_000 | XCLAIM idle threshold (server) |
| `defaultTimeoutMs` | 30_000 | per-call timeout (client) |
| `shutdownGraceMs` | 5_000 | drain window on `stop()` |
| `logger` | `consoleLogger` | `Logger` instance for server-side fault paths |

## Stream / key naming (must not change without bumping version)

| Purpose | Pattern |
|---|---|
| Per-service request stream | `<keyPrefix>:cmds:<service>` |
| Consumer group | group name = `<service>` |
| Per-instance reply stream | `<keyPrefix>:replies:<instance-id>` |

## Crash recovery + idempotency

- `XAUTOCLAIM` reclaims messages whose consumer has been idle > `consumerClaimIdleMs`.
- Combined with the protocol-level idempotency contract, retried messages are safe.
- Document idempotency in handler-author guidance, not enforced by the adapter.

## Logging

`ServerRedisTransport` and `ClientRedisTransport` accept an optional `logger: Logger` (re-exported from `@clamator/protocol`); default `consoleLogger`. `RedisRpcServer` propagates its `opts.logger` into both the transport and the underlying `RpcServerCore`. Records emitted:

- Server consumer loop catches `xreadgroup` error → `error` with the thrown value. Retry continues after 100 ms.
- Server reclaim loop catches `xautoclaim` error → `error`.
- Server `handleEntry` poison envelope (`JSON.parse` or `parseEnvelope` throws) → `warn`. Entry is acked.
- Client reply json parse fail → `warn`. Reply skipped.
- Client reply loop catches `xread` error → `error`. Retry continues after 100 ms.

Wire format unchanged. Best-effort `quit`/`disconnect`/`del` and the `BUSYGROUP` filter on `xgroup CREATE` remain silent — expected, not faults.

## Out of scope (v0.1)

- Federation across redis instances
- Observability / metrics
- Multi-region replication
- TLS sugar (consumer configures the redis client directly)
