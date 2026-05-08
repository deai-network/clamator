import { describe, it, expect } from 'vitest';
import { MemoryBus, MemoryRpcServer, MemoryRpcClient } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import { ArithClient, type ArithService } from './generated/arith.js';

describe('memory loopback via codegen typed proxy', () => {
  it('round-trips a successful call through ArithClient', async () => {
    const bus = new MemoryBus();
    const server = new MemoryRpcServer({ bus });
    const handlers: ArithService = {
      add: async ({ a, b }) => ({ sum: a + b }),
    };
    server.registerService(arithContract, handlers);
    await server.start();
    const client = new MemoryRpcClient({ bus });
    await client.start();
    const arith = new ArithClient(client);
    const r = await arith.add({ a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    await client.stop();
    await server.stop();
  });
});
