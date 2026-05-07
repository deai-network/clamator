# clamator-over-redis — agent rules

Redis-streams transport (Python). Implements the `Transport` interface from `clamator-protocol`. Sibling: `@clamator/over-redis` (TS). Per-language unit tests live here against a real redis (skipped if `REDIS_URL` is unset). Cross-language end-to-end tests live in `tests/interop/`.

## Public API surface

- `RedisRpcServer`, `RedisRpcClient`
- `ServerRedisTransport`, `ClientRedisTransport` (advanced)
- key-naming helpers from `keys` module

Changes here usually require sibling change in same commit.

## Configuration knobs (defaults)

| Knob (Py snake) | TS sibling | Default | Notes |
|---|---|---|---|
| `key_prefix` | `keyPrefix` | required | namespace for all streams + keys |
| `instance_id` | `instanceId` | UUID | identifies this client/server instance |
| `reply_stream_maxlen` | `replyStreamMaxLen` | 1024 | XADD MAXLEN bound for reply streams (server only) |
| `consumer_claim_idle_ms` | `consumerClaimIdleMs` | 60_000 | XAUTOCLAIM idle threshold (server) |
| `default_timeout_ms` | `defaultTimeoutMs` | 30_000 | per-call timeout (client) |
| `shutdown_grace_ms` | `shutdownGraceMs` | 5_000 | drain window on `stop()` |

## Stream / key naming (must not change without bumping version)

| Purpose | Pattern |
|---|---|
| Per-service request stream | `<keyPrefix>:cmds:<service>` |
| Consumer group | group name = `<service>` |
| Per-instance reply stream | `<keyPrefix>:replies:<instance-id>` |

## XADD field encoding

- All requests and replies use single `envelope` field containing JSON-serialized envelope.
- Request streams add `type=rpc` and optional `reply-to=<stream>` fields.
- Reply streams add `type=rpc` field.

Same encoding as TS sibling.

## Crash recovery + idempotency

- `XAUTOCLAIM` reclaims messages whose consumer has been idle > `consumer_claim_idle_ms`.
- Combined with the protocol-level idempotency contract, retried messages are safe.
- Document idempotency in handler-author guidance, not enforced by the adapter.

## Out of scope (v0.1)

- Federation across redis instances
- Observability / metrics
- Multi-region replication
- TLS sugar (consumer configures the redis client directly)
