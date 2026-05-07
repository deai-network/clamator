import { RpcServerCore } from '@clamator/protocol';
import { MemoryTransport } from './transport.js';
import type { MemoryBus } from './bus.js';

export interface MemoryRpcServerOptions {
  bus: MemoryBus;
  instanceId?: string;
}

export class MemoryRpcServer extends RpcServerCore {
  constructor(opts: MemoryRpcServerOptions) {
    super(new MemoryTransport(opts.bus, opts.instanceId ?? 'mem-server'));
  }
}
