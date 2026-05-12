# @clamator/protocol — agent rules

Pure protocol package. **No I/O, ever.** Anything that touches a network, filesystem, or process belongs in a transport adapter.

## Public API surface

These exports are the SemVer surface; changes require updating the matching Py package (`clamator-protocol`) in the same commit:

- `defineContract`, `defineMethod`, `defineNotification`
- `Contract`, `MethodDef`, `NotificationDef`, `AnyMethodDef`, `HandlersFor`
- `parseEnvelope`, `buildRequest`, `buildNotification`, `buildSuccessResponse`, `buildErrorResponse`, `EnvelopeKind`
- `RpcError`, `ClamatorProtocolError`, `ClamatorTransportError`, `exceptionToErrorData`
- `Transport`, `Dispatcher`
- `RpcServerCore`, `RpcClientCore`, `ClamatorClient`
- `Logger`, `consoleLogger`

## Reserved error codes

| Code | Meaning |
|---|---|
| -32600 | Invalid Request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32700 | Parse error |
| -32000..-32099 | Application-defined |

Adding/changing a reserved code: update both languages + interop scenario in the same commit.

## Validation order (must match Py side)

- Server inbound: parse envelope → look up service+method → validate params → invoke handler → validate result → build response.
- Server outbound: handler return validated against result schema.
- Client outbound: param-format check (service/method regex); param schema validation lives in generated wrapper.
- Client inbound: parse envelope → unwrap result/error.

## Cross-cutting rules

- ESM-only. No CJS dual-export.
- All async APIs are `Promise<T>`.
- `RpcServerCore.registerService` is dedup'd per service name.
- `start()` / `stop()` are idempotent; calling `start()` after `stop()` throws.

## Logging

`RpcServerCore`'s constructor accepts an optional second arg `logger: Logger`; defaults to `consoleLogger` (`error`/`warn` map to `console.error`/`console.warn` with a `[clamator]` prefix). The `Logger` interface:

```ts
interface Logger {
  error(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
  warn(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
}
```

Three dispatcher fault paths emit records (wire format unchanged):

- Handler exception (`-32603 Internal error`) → `error` with the thrown value attached.
- Result-schema validation failure (`-32603 Result validation failed`) → `error`.
- Params-schema validation failure (`-32602 Invalid params`) → `warn`.

`RpcError` raised by a handler is the typed-failure path and is intentionally **not** logged. Each record carries fields `{service, method, rpcId}`.
