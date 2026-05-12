# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow lockstep across all packages until 1.0.

## [Unreleased]

### Added

- TS: `Logger` interface (`error`, `warn`) and `consoleLogger` default, exported from `@clamator/protocol` and re-exported by `@clamator/over-memory` and `@clamator/over-redis`. Optional `logger?` constructor option on `RpcServerCore`, `MemoryTransport`, `MemoryRpcServer`, `MemoryRpcClient`, `ServerRedisTransport`, `ClientRedisTransport`, `RedisRpcServer`.

### Changed

- Server-side fault paths in protocol cores and transports now emit log records instead of swallowing silently. Levels: `ERROR` for handler exceptions, result-validation failures, and transport-loop exceptions (consumer / reclaim / reply); `WARNING` for params-validation, poison envelopes, reply-parse failures, and dispatcher-wrapper bridging.
- Py uses module-level `logging.getLogger(__name__)` on `clamator_protocol.server_core`, `clamator_over_memory.transport`, `clamator_over_redis.server_transport`, and `clamator_over_redis.client_transport`. No `basicConfig` added — configuration remains the application's job.
- Wire format unchanged. `RpcError` raised by a handler is the typed-failure path and is intentionally not logged.
