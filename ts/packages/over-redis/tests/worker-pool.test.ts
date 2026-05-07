import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;
const c = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number(), instance: z.string() }),
  }),
});

describe.skipIf(!REDIS_URL)('redis worker pool', () => {
  it('two servers share load roughly evenly', async () => {
    const prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const r1 = new IORedis(REDIS_URL!), r2 = new IORedis(REDIS_URL!), rc = new IORedis(REDIS_URL!);
    const s1 = new RedisRpcServer({ redis: r1, keyPrefix: prefix, instanceId: 'srv-1' });
    const s2 = new RedisRpcServer({ redis: r2, keyPrefix: prefix, instanceId: 'srv-2' });
    s1.registerService(c, { add: async ({ a, b }) => ({ sum: a + b, instance: 'srv-1' }) });
    s2.registerService(c, { add: async ({ a, b }) => ({ sum: a + b, instance: 'srv-2' }) });
    await s1.start(); await s2.start();
    const client = new RedisRpcClient({ redis: rc, keyPrefix: prefix, defaultTimeoutMs: 3000 });
    await client.start();
    const counts: Record<string, number> = { 'srv-1': 0, 'srv-2': 0 };
    for (let i = 0; i < 50; i++) {
      const r = await client.call<{ a: number; b: number }, { sum: number; instance: string }>(
        'arith', 'add', { a: i, b: 1 });
      counts[r.instance]++;
    }
    expect(counts['srv-1']).toBeGreaterThan(0);
    expect(counts['srv-2']).toBeGreaterThan(0);
    await client.stop(); await s1.stop(); await s2.stop();
    const cleanup = new IORedis(REDIS_URL!);
    const keys = await cleanup.keys(`${prefix}:*`);
    if (keys.length) await cleanup.del(...keys);
    await cleanup.quit(); await r1.quit(); await r2.quit(); await rc.quit();
  });
});
