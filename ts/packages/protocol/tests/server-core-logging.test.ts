import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { RpcServerCore } from '../src/server-core.js';
import { defineContract, defineMethod } from '../src/contract.js';
import { RpcError } from '../src/error.js';
import type { Logger } from '../src/logger.js';
import type { Transport, Dispatcher } from '../src/transport.js';
import { EnvelopeKind } from '../src/envelope.js';

interface LogRecord { level: 'error' | 'warn'; msg: string; err: unknown; fields: unknown }

function recordingLogger() {
  const records: LogRecord[] = [];
  const logger: Logger = {
    error: (msg, err, fields) => { records.push({ level: 'error', msg, err, fields }); },
    warn:  (msg, err, fields) => { records.push({ level: 'warn',  msg, err, fields }); },
  };
  return { records, logger };
}

function fakeTransport(): { transport: Transport; dispatchers: Map<string, Dispatcher> } {
  const dispatchers = new Map<string, Dispatcher>();
  const transport: Transport = {
    async registerService(name, dispatch) { dispatchers.set(name, dispatch); },
    async send() { throw new Error('send not used'); },
    async notify() {},
    async start() {},
    async stop() {},
  };
  return { transport, dispatchers };
}

const arith = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
});

function reqEnv(method: string, params: unknown, id: string | number = 'i1') {
  return {
    kind: EnvelopeKind.Request as const,
    service: 'arith', method, fullMethod: `arith.${method}`,
    params, id, raw: {},
  } as any;
}

describe('RpcServerCore logging', () => {
  it('logs handler exception at ERROR with error attached', async () => {
    const { records, logger } = recordingLogger();
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport, logger);
    server.registerService(arith, {
      add: async () => { throw new Error('boom'); },
    });
    await server.start();
    const reply = await dispatchers.get('arith')!(reqEnv('add', { a: 1, b: 2 }));
    expect((reply as any).error.code).toBe(-32603);
    expect((reply as any).error.message).toBe('Internal error');
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe('error');
    expect((records[0].err as Error).message).toBe('boom');
    expect(records[0].fields).toMatchObject({ service: 'arith', method: 'add', rpcId: 'i1' });
  });

  it('logs result-validation failure at ERROR', async () => {
    const { records, logger } = recordingLogger();
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport, logger);
    server.registerService(arith, {
      add: async () => ({ sum: 'not-a-number' as any }),
    });
    await server.start();
    const reply = await dispatchers.get('arith')!(reqEnv('add', { a: 1, b: 2 }));
    expect((reply as any).error.code).toBe(-32603);
    expect((reply as any).error.message).toBe('Result validation failed');
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe('error');
    expect(records[0].fields).toMatchObject({ service: 'arith', method: 'add' });
  });

  it('logs params-validation failure at WARNING', async () => {
    const { records, logger } = recordingLogger();
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport, logger);
    server.registerService(arith, {
      add: async () => ({ sum: 0 }),
    });
    await server.start();
    const reply = await dispatchers.get('arith')!(reqEnv('add', { a: 'not-a-number', b: 2 }));
    expect((reply as any).error.code).toBe(-32602);
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe('warn');
  });

  it('does not log RpcError raised by handler', async () => {
    const { records, logger } = recordingLogger();
    const { transport, dispatchers } = fakeTransport();
    const server = new RpcServerCore(transport, logger);
    server.registerService(arith, {
      add: async () => { throw new RpcError(-32001, 'denied', { why: 'x' }); },
    });
    await server.start();
    const reply = await dispatchers.get('arith')!(reqEnv('add', { a: 1, b: 2 }));
    expect((reply as any).error.code).toBe(-32001);
    expect(records).toHaveLength(0);
  });
});
