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
| `replyStreamMaxLen` | 1024 | bound for client reply stream |
| `consumerClaimIdleMs` | 60_000 | XCLAIM idle threshold (server) |
| `defaultTimeoutMs` | 30_000 | per-call timeout (client) |
| `defaultHandlerTimeoutMs` | 30_000 | per-handler timeout (server) |
| `shutdownGraceMs` | 5_000 | drain window on `stop()` |

## Stream / key naming (must not change without bumping version)

| Purpose | Pattern |
|---|---|
| Per-service request stream | `<keyPrefix>:cmds:<service>` |
| Consumer group | group name = `<service>` |
| Per-instance reply stream | `<keyPrefix>:replies:<instance-id>` |

## Crash recovery + idempotency

- `XCLAIM` reclaims messages whose consumer has been idle > `consumerClaimIdleMs`.
- Combined with the protocol-level idempotency contract, retried messages are safe.
- Document idempotency in handler-author guidance, not enforced by the adapter.

## Out of scope (v0.1)

- Federation across redis instances
- Observability / metrics
- Multi-region replication
- TLS sugar (consumer configures the redis client directly)
