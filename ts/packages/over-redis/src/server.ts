import { RpcServerCore } from '@clamator/protocol';
import { ServerRedisTransport, type ServerTransportOptions } from './server-transport.js';

export interface RedisRpcServerOptions extends ServerTransportOptions {}

export class RedisRpcServer extends RpcServerCore {
  constructor(opts: RedisRpcServerOptions) {
    super(new ServerRedisTransport(opts));
  }
}
