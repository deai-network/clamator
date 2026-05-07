import { describe, it, expect } from 'vitest';
import { MemoryBus } from '../src/bus.js';
import { MemoryTransport } from '../src/transport.js';
import { ClamatorTransportError } from '@clamator/protocol';

describe('MemoryBus + MemoryTransport lifecycle', () => {
  it('send before start rejects', async () => {
    const bus = new MemoryBus();
    const t = new MemoryTransport(bus, 'client');
    await expect(t.send({ jsonrpc: '2.0', method: 'a.b', params: {}, id: '1' }, { timeoutMs: 100 }))
      .rejects.toBeInstanceOf(ClamatorTransportError);
  });

  it('after stop, send rejects', async () => {
    const bus = new MemoryBus();
    const t = new MemoryTransport(bus, 'client');
    await t.start();
    await t.stop();
    await expect(t.send({ jsonrpc: '2.0', method: 'a.b', params: {}, id: '1' }, { timeoutMs: 100 }))
      .rejects.toBeInstanceOf(ClamatorTransportError);
  });

  it('bus throws on duplicate service registration', async () => {
    const bus = new MemoryBus();
    const t1 = new MemoryTransport(bus, 'srv1');
    const t2 = new MemoryTransport(bus, 'srv2');
    await t1.start(); await t2.start();
    await t1.registerService('arith', async () => null);
    await expect(t2.registerService('arith', async () => null)).rejects.toThrow(/already registered/);
  });

  it('stop rejects all pending calls', async () => {
    const bus = new MemoryBus();
    const t = new MemoryTransport(bus, 'client');
    await t.start();
    // Register a handler that hangs indefinitely
    await t.registerService('slow', async () => new Promise(() => {}));
    const p = t.send({ jsonrpc: '2.0', method: 'slow.x', params: {}, id: 'pending' }, { timeoutMs: 60_000 });
    // Give the microtask a chance to queue up before stopping
    await new Promise(r => setTimeout(r, 5));
    await t.stop();
    await expect(p).rejects.toMatchObject({ name: 'ClamatorTransportError' });
  });
});
