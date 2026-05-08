import type IORedis from 'ioredis';
import { RedisRpcServer } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import type { ArithService } from './generated/arith.js';

export async function buildArithServer(opts: { redis: IORedis; keyPrefix: string }) {
  const server = new RedisRpcServer({ redis: opts.redis, keyPrefix: opts.keyPrefix }); // injected redis= not closed by stop() — caller owns lifecycle; omit to let transport own it
  const handlers: ArithService = {
    add: async ({ a, b }) => ({ sum: a + b }),
    ping: async (_params) => {},
  };
  server.registerService(arithContract, handlers); // must precede start() — post-start registrations are silently ignored, no consumer group or read loop is created
  await server.start();
  return server;
}
