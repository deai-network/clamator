import { RpcClientCore } from '@clamator/protocol';
import { MemoryTransport } from './transport.js';
import type { MemoryBus } from './bus.js';

export interface MemoryRpcClientOptions {
  bus: MemoryBus;
  instanceId?: string;
  defaultTimeoutMs?: number;
}

export class MemoryRpcClient extends RpcClientCore {
  constructor(opts: MemoryRpcClientOptions) {
    super(
      new MemoryTransport(opts.bus, opts.instanceId ?? 'mem-client'),
      { defaultTimeoutMs: opts.defaultTimeoutMs ?? 30_000 },
    );
  }
}
