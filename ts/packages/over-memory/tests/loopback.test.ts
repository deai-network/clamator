import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification, RpcError } from '@clamator/protocol';
import { MemoryBus, MemoryRpcServer, MemoryRpcClient } from '../src/index.js';

const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  divide: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ q: z.number() }),
  }),
  ping: defineNotification({ params: z.object({ tag: z.string().optional() }) }),
});

describe('memory loopback', () => {
  it('round-trips a successful call', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    server.registerService(arith, {
      add: async ({ a, b }) => ({ sum: a + b }),
      divide: async ({ a, b }) => ({ q: a / b }),
      ping: async () => {},
    });
    await server.start();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    const r = await client.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop();
  });

  it('handler RpcError surfaces as RpcError client-side', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    server.registerService(arith, {
      add: async () => { throw new RpcError(-32000, 'denied'); },
      divide: async () => ({ q: 0 }),
      ping: async () => {},
    });
    await server.start();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    await expect(client.call('arith', 'add', { a: 1, b: 2 })).rejects.toMatchObject({ name: 'RpcError', code: -32000 });
    await client.stop(); await server.stop();
  });

  it('notification fires-and-forgets', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    let pinged = false;
    server.registerService(arith, {
      add: async ({ a, b }) => ({ sum: a + b }),
      divide: async () => ({ q: 0 }),
      ping: async () => { pinged = true; },
    });
    await server.start();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    await client.notify('arith', 'ping', { tag: 'x' });
    // Allow microtask flush.
    await new Promise(r => setTimeout(r, 5));
    expect(pinged).toBe(true);
    await client.stop(); await server.stop();
  });
});
