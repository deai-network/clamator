import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineContract, defineMethod, ClamatorTransportError } from '@clamator/protocol';
import { MemoryBus, MemoryRpcServer, MemoryRpcClient } from '../src/index.js';

const c = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});

describe('memory error edges', () => {
  it('-32601 if service not registered', async () => {
    const bus = new MemoryBus();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    await expect(client.call('arith', 'add', { a: 1, b: 2 }))
      .rejects.toMatchObject({ name: 'RpcError', code: -32601 });
    await client.stop();
  });

  it('-32602 on bad params', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    server.registerService(c, { add: async () => ({ sum: 0 }) });
    await server.start();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    await expect(client.call('arith', 'add', { a: 'no', b: 1 } as any))
      .rejects.toMatchObject({ name: 'RpcError', code: -32602 });
    await client.stop(); await server.stop();
  });

  it('client timeout surfaces ClamatorTransportError', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    server.registerService(c, {
      add: async () => { await new Promise(r => setTimeout(r, 200)); return { sum: 0 }; },
    });
    await server.start();
    const client = new MemoryRpcClient({ bus, defaultTimeoutMs: 30 });
    await client.start();
    await expect(client.call('arith', 'add', { a: 1, b: 1 })).rejects.toBeInstanceOf(ClamatorTransportError);
    await client.stop(); await server.stop();
  });
});
