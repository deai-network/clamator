import { describe, it, expect } from 'vitest';
import { MemoryBus } from '../src/index.js';
import { buildArithServer } from './server.js';
import { callArith } from './client.js';

describe('memory loopback via codegen typed proxy', () => {
  it('round-trips a successful call through ArithClient', async () => {
    const bus = new MemoryBus();
    const server = await buildArithServer(bus);
    const r = await callArith(bus);
    expect(r).toEqual({ sum: 5 });
    await server.stop(); // drains in-flight handlers up to graceMs (default 5 s), then stops transport
  });
});
