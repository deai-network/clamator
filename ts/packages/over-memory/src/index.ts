export { MemoryBus } from './bus.js';
export { MemoryTransport } from './transport.js';
export { MemoryRpcServer, type MemoryRpcServerOptions } from './server.js';
export { MemoryRpcClient, type MemoryRpcClientOptions } from './client.js';
// Re-export protocol-layer error classes so consumers don't need a separate
// @clamator/protocol import just to throw RpcError from a handler.
export { RpcError, ClamatorProtocolError, ClamatorTransportError, type Logger, consoleLogger } from '@clamator/protocol';
