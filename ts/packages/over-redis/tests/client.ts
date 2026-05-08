import type IORedis from 'ioredis';
import { RedisRpcClient } from '../src/index.js';
import { ArithClient } from './generated/arith.js';

export async function callArith(opts: { redis: IORedis; keyPrefix: string }) {
  const client = new RedisRpcClient({ redis: opts.redis, keyPrefix: opts.keyPrefix, defaultTimeoutMs: 3000 }); // default timeout 30 s; no auto-retry on disconnect; timeouts not propagated to server
  await client.start();
  const arith = new ArithClient(client);
  const r = await arith.add({ a: 2, b: 3 });
  await client.stop();
  return r;
}
