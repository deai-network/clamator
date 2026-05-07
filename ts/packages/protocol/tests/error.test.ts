import { describe, it, expect } from 'vitest';
import { RpcError, ClamatorProtocolError, ClamatorTransportError, exceptionToErrorData } from '../src/error.js';

describe('errors', () => {
  it('RpcError carries code/message/data', () => {
    const e = new RpcError(-32000, 'oops', { x: 1 });
    expect(e.code).toBe(-32000);
    expect(e.message).toBe('oops');
    expect(e.data).toEqual({ x: 1 });
    expect(e.name).toBe('RpcError');
  });

  it('ClamatorProtocolError extends Error', () => {
    const e = new ClamatorProtocolError('proto');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('ClamatorProtocolError');
  });

  it('ClamatorTransportError carries cause', () => {
    const cause = new Error('boom');
    const e = new ClamatorTransportError('lost', cause);
    expect(e.cause).toBe(cause);
    expect(e.name).toBe('ClamatorTransportError');
  });

  it('exceptionToErrorData captures name + message + serializable attrs', () => {
    class MyErr extends Error {
      foo = 'bar';
      n = 7;
      circ: unknown;
      constructor() { super('hi'); this.name = 'MyErr'; this.circ = this; }
    }
    const data = exceptionToErrorData(new MyErr());
    expect(data).toMatchObject({ name: 'MyErr', message: 'hi', foo: 'bar', n: 7 });
    expect('circ' in data).toBe(false);
  });
});
