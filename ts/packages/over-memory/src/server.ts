import { RpcServerCore, consoleLogger, type Logger } from '@clamator/protocol';
import { MemoryTransport } from './transport.js';
import type { MemoryBus } from './bus.js';

export interface MemoryRpcServerOptions {
  bus: MemoryBus;
  instanceId?: string;
  logger?: Logger;
}

export class MemoryRpcServer extends RpcServerCore {
  constructor(opts: MemoryRpcServerOptions) {
    const logger = opts.logger ?? consoleLogger;
    super(new MemoryTransport(opts.bus, opts.instanceId ?? 'mem-server', logger), logger);
  }
}
