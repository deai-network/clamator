import { describe, it, expect, afterEach } from 'vitest';
import IORedis from 'ioredis';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import { ArithClient, type ArithService } from './generated/arith.js';

const REDIS_URL = process.env.REDIS_URL;

describe.skipIf(!REDIS_URL)('redis round-trip via codegen typed proxy', () => {
  let prefix: string;

  afterEach(async () => {
    if (!REDIS_URL) return;
    const r = new IORedis(REDIS_URL!);
    const keys = await r.keys(`${prefix}:*`);
    if (keys.length) await r.del(...keys);
    await r.quit();
  });

  it('round-trips a successful call through ArithClient', async () => {
    prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    const handlers: ArithService = {
      add: async ({ a, b }) => ({ sum: a + b }),
      ping: async (_params) => {},
    };
    server.registerService(arithContract, handlers);
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    const arith = new ArithClient(client);
    const r = await arith.add({ a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop();
    await sredis.quit();
    await credis.quit();
  });
});
