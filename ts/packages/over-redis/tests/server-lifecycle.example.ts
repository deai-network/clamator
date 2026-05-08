import type IORedis from 'ioredis';
import { RedisRpcServer } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import type { ArithService } from './generated/arith.js';

// Long-running server that stops gracefully on SIGTERM/SIGINT.
// Wire pattern: start the server, then await a Promise that resolves when a
// signal arrives. The signal handler triggers stop() and resolves.
export async function runArithServer(opts: { redis: IORedis; keyPrefix: string }) {
  const server = new RedisRpcServer({ redis: opts.redis, keyPrefix: opts.keyPrefix });
  const handlers: ArithService = {
    add: async ({ a, b }) => ({ sum: a + b }),
    ping: async (_p) => {},
  };
  server.registerService(arithContract, handlers);
  await server.start();
  await new Promise<void>((resolve) => {
    const stop = async () => {
      await server.stop();
      resolve();
    };
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  });
}
