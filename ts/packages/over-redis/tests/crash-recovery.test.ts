import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;
const c = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});

describe.skipIf(!REDIS_URL)('redis crash recovery', () => {
  it('XCLAIM-based reclaim picks up an abandoned message', async () => {
    const prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const r1 = new IORedis(REDIS_URL!), r2 = new IORedis(REDIS_URL!), rc = new IORedis(REDIS_URL!);
    // Server 1 starts a handler that hangs forever, ack-less. Then we kill it.
    const s1 = new RedisRpcServer({
      redis: r1, keyPrefix: prefix, instanceId: 'srv-die',
      consumerClaimIdleMs: 200, // aggressive for test speed
      shutdownGraceMs: 0,       // crash simulation: no drain window
    });
    s1.registerService(c, { add: async () => { await new Promise(() => {}); return { sum: 0 }; } });
    await s1.start();
    const client = new RedisRpcClient({ redis: rc, keyPrefix: prefix, defaultTimeoutMs: 5000 });
    await client.start();
    const callPromise = client.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 1, b: 2 });
    await new Promise(r => setTimeout(r, 100));
    // "Crash": stop server 1 forcibly without graceful drain.
    // graceMs: 0 skips inflight drain so in-flight handlers are abandoned.
    await s1.stop({ graceMs: 0 });
    // Server 2 starts and claims the pending message.
    const s2 = new RedisRpcServer({
      redis: r2, keyPrefix: prefix, instanceId: 'srv-recover',
      consumerClaimIdleMs: 200,
    });
    s2.registerService(c, { add: async ({ a, b }) => ({ sum: a + b }) });
    await s2.start();
    const r = await callPromise;
    expect(r).toEqual({ sum: 3 });
    await client.stop(); await s2.stop();
    const cleanup = new IORedis(REDIS_URL!);
    const keys = await cleanup.keys(`${prefix}:*`);
    if (keys.length) await cleanup.del(...keys);
    await cleanup.quit(); await r1.quit(); await r2.quit(); await rc.quit();
  }, 10_000);
});
