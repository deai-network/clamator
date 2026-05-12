import { RpcServerCore, consoleLogger } from '@clamator/protocol';
import { ServerRedisTransport, type ServerTransportOptions } from './server-transport.js';

export interface RedisRpcServerOptions extends ServerTransportOptions {}

export class RedisRpcServer extends RpcServerCore {
  constructor(opts: RedisRpcServerOptions) {
    const logger = opts.logger ?? consoleLogger;
    super(new ServerRedisTransport({ ...opts, logger }), logger);
  }
}
