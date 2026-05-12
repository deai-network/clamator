import { describe, it, expect } from 'vitest';
import type { Logger } from '@clamator/protocol';
import { ServerRedisTransport } from '../src/server-transport.js';

interface LogRecord { level: 'error' | 'warn'; msg: string; err: unknown; fields: unknown }

function recordingLogger() {
  const records: LogRecord[] = [];
  const logger: Logger = {
    error: (msg, err, fields) => { records.push({ level: 'error', msg, err, fields }); },
    warn:  (msg, err, fields) => { records.push({ level: 'warn',  msg, err, fields }); },
  };
  return { records, logger };
}

// Minimal ioredis stub: xack + xadd no-ops, quit no-op. ioredis-typed cast so
// the transport accepts it as a `Redis` without instantiating a real client.
function stubRedis() {
  const acks: any[] = [];
  const adds: any[] = [];
  return {
    acks, adds,
    redis: {
      async xack(...args: any[]) { acks.push(args); return 1; },
      async xadd(...args: any[]) { adds.push(args); return 'ok'; },
      async quit() {},
      duplicate() { return this; },
    } as any,
  };
}

describe('ServerRedisTransport logging', () => {
  it('logs at warn level when an envelope cannot be parsed and acks the entry', async () => {
    const { records, logger } = recordingLogger();
    const { acks, redis } = stubRedis();
    const t = new ServerRedisTransport({ redis, keyPrefix: 'kp', logger });

    const fields = ['envelope', 'not-valid-json-at-all'];
    await (t as any).handleEntry('arith', 'stream', 'grp', '1-0', fields);

    expect(acks.length).toBe(1);
    expect(records).toHaveLength(1);
    expect(records[0].level).toBe('warn');
    expect(records[0].fields).toMatchObject({ service: 'arith', entryId: '1-0' });
  });
});
