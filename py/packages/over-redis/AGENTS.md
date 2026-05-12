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

## Logging

Two module-level loggers — `logging.getLogger("clamator_over_redis.server_transport")` and `logging.getLogger("clamator_over_redis.client_transport")` — emit records on previously silent server-side fault paths. Wire format unchanged.

- Server consumer loop (`xreadgroup` raises) → `ERROR` with `exc_info`. Retry continues after 100 ms.
- Server reclaim loop (`xautoclaim` raises) → `ERROR` with `exc_info`. Retry continues on next idle cycle.
- Server poison envelope (`json.loads` or `parse_envelope` raises in `_handle_entry`) → `WARNING` with `exc_info`. Entry is acked so it does not replay.
- Client reply json parse fail → `WARNING` with `exc_info`. Reply skipped, loop continues.
- Client reply loop (`xread` raises) → `ERROR` with `exc_info`. Retry continues after 100 ms.

Best-effort cleanup paths during `stop()` (`xack`, `aclose`, `delete reply-stream`) and the `BUSYGROUP` idempotency filter on `xgroup_create` remain silent — those are expected, not faults.

## Out of scope (v0.1)

- Federation across redis instances
- Observability / metrics
- Multi-region replication
- TLS sugar (consumer configures the redis client directly)
