import { describe, it, expect } from 'vitest';
import { ClamatorTransportError, type Logger } from '@clamator/protocol';
import { MemoryBus } from '../src/bus.js';
import { MemoryTransport } from '../src/transport.js';

interface LogRecord { level: 'error' | 'warn'; msg: string; err: unknown; fields: unknown }

function recordingLogger() {
  const records: LogRecord[] = [];
  const logger: Logger = {
    error: (msg, err, fields) => { records.push({ level: 'error', msg, err, fields }); },
    warn:  (msg, err, fields) => { records.push({ level: 'warn',  msg, err, fields }); },
  };
  return { records, logger };
}

describe('MemoryTransport logging', () => {
  it('logs at WARNING when dispatcher throws (wrapper preserves original cause)', async () => {
    const bus = new MemoryBus();
    const { records, logger } = recordingLogger();

    const original = new Error('boom');
    bus.register('arith', async () => { throw original; });

    const t = new MemoryTransport(bus, 'mem-test', logger);
    await t.start();

    const req = {
      jsonrpc: '2.0', id: 'i1', method: 'arith.add', params: {},
    };
    await expect(t.send(req, { timeoutMs: 1000 })).rejects.toMatchObject({
      name: 'ClamatorTransportError',
      message: expect.stringContaining('dispatcher threw') as any,
    });

    expect(records).toHaveLength(1);
    expect(records[0].level).toBe('warn');
    expect(records[0].err).toBe(original);
    expect(records[0].fields).toMatchObject({ service: 'arith' });

    await t.stop();
  });
});
