export { RedisRpcServer, type RedisRpcServerOptions } from './server.js';
export { RedisRpcClient, type RedisRpcClientOptions } from './client.js';
export { ServerRedisTransport } from './server-transport.js';
export { ClientRedisTransport } from './client-transport.js';
export * from './keys.js';
// Re-export protocol-layer error classes so consumers don't need a separate
// @clamator/protocol import just to throw RpcError from a handler.
export { RpcError, ClamatorProtocolError, ClamatorTransportError, type Logger, consoleLogger } from '@clamator/protocol';
