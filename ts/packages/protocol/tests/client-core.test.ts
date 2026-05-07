import { describe, it, expect } from 'vitest';
import { RpcClientCore } from '../src/client-core.js';
import { ClamatorProtocolError } from '../src/error.js';
import type { Transport } from '../src/transport.js';

function recordingTransport(reply: Record<string, unknown>): { transport: Transport; sent: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = [];
  const transport: Transport = {
    async registerService() {},
    async send(env) { sent.push(env); return reply; },
    async notify(env) { sent.push(env); },
    async start() {},
    async stop() {},
  };
  return { transport, sent };
}

describe('RpcClientCore', () => {
  it('call sends a well-formed request and unwraps result', async () => {
    const { transport, sent } = recordingTransport({ jsonrpc: '2.0', id: 'x', result: { sum: 5 } });
    const c = new RpcClientCore(transport);
    await c.start();
    const r = await c.call<{ a: number; b: number }, { sum: number }>('arith', 'add', { a: 2, b: 3 });
    expect(r).toEqual({ sum: 5 });
    expect(sent[0]).toMatchObject({ jsonrpc: '2.0', method: 'arith.add', params: { a: 2, b: 3 } });
    expect(typeof (sent[0] as any).id).toBe('string');
  });

  it('call surfaces RpcError on error response', async () => {
    const { transport } = recordingTransport({ jsonrpc: '2.0', id: 'x', error: { code: -32001, message: 'x', data: null } });
    const c = new RpcClientCore(transport);
    await c.start();
    await expect(c.call('arith', 'add', {})).rejects.toMatchObject({ name: 'RpcError', code: -32001 });
  });

  it('call rejects with ClamatorProtocolError on malformed reply', async () => {
    const { transport } = recordingTransport({ jsonrpc: '2.0' });  // missing id+result+error
    const c = new RpcClientCore(transport);
    await c.start();
    await expect(c.call('arith', 'add', {})).rejects.toBeInstanceOf(ClamatorProtocolError);
  });

  it('notify sends a request without id', async () => {
    const { transport, sent } = recordingTransport({} as any);
    const c = new RpcClientCore(transport);
    await c.start();
    await c.notify('arith', 'ping', { x: 1 });
    expect(sent[0]).toEqual({ jsonrpc: '2.0', method: 'arith.ping', params: { x: 1 } });
    expect('id' in (sent[0] as object)).toBe(false);
  });

  it('rejects bad service / method format synchronously', async () => {
    const { transport } = recordingTransport({} as any);
    const c = new RpcClientCore(transport);
    await c.start();
    await expect(c.call('Engine', 'add', {})).rejects.toThrow(/service/);
    await expect(c.call('arith', 'Add', {})).rejects.toThrow(/method/);
  });
});
