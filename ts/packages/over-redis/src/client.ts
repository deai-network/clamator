import { RpcClientCore } from '@clamator/protocol';
import { ClientRedisTransport, type ClientTransportOptions } from './client-transport.js';

export interface RedisRpcClientOptions extends ClientTransportOptions {}

export class RedisRpcClient extends RpcClientCore {
  constructor(opts: RedisRpcClientOptions) {
    super(
      new ClientRedisTransport(opts),
      { defaultTimeoutMs: opts.defaultTimeoutMs ?? 30_000 },
    );
  }
}
