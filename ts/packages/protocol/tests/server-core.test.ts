import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { RpcServerCore } from '../src/server-core.js';
import { defineContract, defineMethod, defineNotification } from '../src/contract.js';
import { RpcError } from '../src/error.js';
import type { Transport, Dispatcher } from '../src/transport.js';

function fakeTransport(): { transport: Transport; dispatchers: Map<string, Dispatcher>; started: boolean } {
  const dispatchers = new Map<string, Dispatcher>();
  let started = false;
  const transport: Transport = {
    async registerService(name, dispatch) { dispatchers.set(name, dispatch); },
    async send() { throw new Error('send not used in server tests'); },
    async notify() {},
    async start() { started = true; },
    async stop() { started = false; },
  };
  return { transport, dispatchers, get started() { return started; } } as any;
}

const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  ping: defineNotification({ params: z.object({}) }),
});

describe('RpcServerCore', () => {
  it('dispatches a valid request', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, {
      add: async ({ a, b }) => ({ sum: a + b }),
      ping: async () => {},
    });
    await server.start();
    const dispatch = dispatchers.get('arith')!;
    const reply = await dispatch({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 2, b: 3 }, id: 'i1', raw: {} as any,
    });
    expect(reply).toEqual({ jsonrpc: '2.0', id: 'i1', result: { sum: 5 } });
  });

  it('returns -32601 when method not found', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, { add: async () => ({ sum: 0 }), ping: async () => {} });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'unknown', fullMethod: 'arith.unknown',
      params: {}, id: 'i', raw: {} as any,
    });
    expect((reply as any).error.code).toBe(-32601);
  });

  it('returns -32602 on bad params', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, { add: async () => ({ sum: 0 }), ping: async () => {} });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 'nope', b: 3 }, id: 'i', raw: {} as any,
    });
    expect((reply as any).error.code).toBe(-32602);
  });

  it('returns RpcError code/message from handler throw', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, {
      add: async () => { throw new RpcError(-32001, 'denied', { reason: 'auth' }); },
      ping: async () => {},
    });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 1, b: 2 }, id: 'i', raw: {} as any,
    });
    expect((reply as any).error).toEqual({ code: -32001, message: 'denied', data: { reason: 'auth' } });
  });

  it('returns -32603 on generic exception', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, {
      add: async () => { throw new Error('boom'); },
      ping: async () => {},
    });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 1, b: 2 }, id: 'i', raw: {} as any,
    });
    expect((reply as any).error.code).toBe(-32603);
    expect((reply as any).error.data).toMatchObject({ name: 'Error', message: 'boom' });
  });

  it('returns -32603 when handler returns invalid result', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, {
      add: async () => ({ sum: 'not a number' as any }),
      ping: async () => {},
    });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'request' as any, service: 'arith', method: 'add', fullMethod: 'arith.add',
      params: { a: 1, b: 2 }, id: 'i', raw: {} as any,
    });
    expect((reply as any).error.code).toBe(-32603);
  });

  it('returns null for notification dispatch', async () => {
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport);
    const ping = vi.fn().mockResolvedValue(undefined);
    server.registerService(arith, { add: async () => ({ sum: 0 }), ping });
    await server.start();
    const reply = await dispatchers.get('arith')!({
      kind: 'notification' as any, service: 'arith', method: 'ping', fullMethod: 'arith.ping',
      params: {}, raw: {} as any,
    });
    expect(reply).toBeNull();
    expect(ping).toHaveBeenCalled();
  });

  it('throws on duplicate service registration', async () => {
    const { transport } = fakeTransport();
    const server = new RpcServerCore(transport);
    server.registerService(arith, { add: async () => ({ sum: 0 }), ping: async () => {} });
    expect(() => server.registerService(arith, { add: async () => ({ sum: 0 }), ping: async () => {} }))
      .toThrow(/already registered/);
  });

  it('stop is idempotent', async () => {
    const { transport } = fakeTransport();
    const server = new RpcServerCore(transport);
    await server.start();
    await server.stop();
    await expect(server.stop()).resolves.toBeUndefined();
  });
});
