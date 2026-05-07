import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification, RpcError } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;

const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  ping: defineNotification({ params: z.object({}) }),
});

describe.skipIf(!REDIS_URL)('redis round-trip', () => {
  let prefix: string;

  beforeAll(() => {
    if (!REDIS_URL) return;
  });

  afterEach(async () => {
    if (!REDIS_URL) return;
    const r = new IORedis(REDIS_URL!);
    const keys = await r.keys(`${prefix}:*`);
    if (keys.length) await r.del(...keys);
    await r.quit();
  });

  it('round-trips a successful call', async () => {
    prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    server.registerService(arith, { add: async ({ a, b }) => ({ sum: a + b }), ping: async () => {} });
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    const r = await client.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop(); await server.stop();
    await sredis.quit(); await credis.quit();
  });

  it('returns RpcError on handler throw', async () => {
    prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    server.registerService(arith, {
      add: async () => { throw new RpcError(-32000, 'denied'); },
      ping: async () => {},
    });
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    await expect(client.call('arith', 'add', { a: 1, b: 2 })).rejects.toMatchObject({ code: -32000 });
    await client.stop(); await server.stop();
    await sredis.quit(); await credis.quit();
  });
});
