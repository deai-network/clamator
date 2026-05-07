import { describe, it, expect } from 'vitest';
import IORedis from 'ioredis';
import { z } from 'zod';
import { defineContract, defineMethod, ClamatorTransportError } from '@clamator/protocol';
import { RedisRpcServer, RedisRpcClient } from '../src/index.js';

const REDIS_URL = process.env.REDIS_URL;

const c = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});

describe.skipIf(!REDIS_URL)('redis timeout', () => {
  it('client raises ClamatorTransportError when handler is slower than timeout', async () => {
    const prefix = `clam-test-${Math.random().toString(36).slice(2, 8)}`;
    const sredis = new IORedis(REDIS_URL!);
    const credis = new IORedis(REDIS_URL!);
    const server = new RedisRpcServer({ redis: sredis, keyPrefix: prefix });
    server.registerService(c, { add: async () => { await new Promise(r => setTimeout(r, 800)); return { sum: 0 }; } });
    await server.start();
    const client = new RedisRpcClient({ redis: credis, keyPrefix: prefix, defaultTimeoutMs: 100 });
    await client.start();
    await expect(client.call('arith', 'add', { a: 1, b: 2 })).rejects.toBeInstanceOf(ClamatorTransportError);
    await client.stop(); await server.stop();
    const r = new IORedis(REDIS_URL!);
    const keys = await r.keys(`${prefix}:*`);
    if (keys.length) await r.del(...keys);
    await r.quit();
    await sredis.quit(); await credis.quit();
  });
});
