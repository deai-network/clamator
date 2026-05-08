import { describe, it, expect, afterEach } from 'vitest';
import IORedis from 'ioredis';
import { buildArithServer } from './server.js';
import { callArith } from './client.js';

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
    const server = await buildArithServer({ redis: sredis, keyPrefix: prefix });
    const r = await callArith({ redis: credis, keyPrefix: prefix });
    expect(r).toEqual({ sum: 5 });
    await server.stop(); // drains in-flight handlers up to graceMs (default 5 s), then stops transport
    await sredis.quit();
    await credis.quit();
  });
});
