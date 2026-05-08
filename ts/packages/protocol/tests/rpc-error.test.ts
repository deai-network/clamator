import { describe, it, expect } from 'vitest';
import { RpcError } from '../src/index.js';

describe('RpcError', () => {
  it('constructs with code, message, and data', () => {
    const err = new RpcError(-32001, 'forbidden', { reason: 'no-token' });
    expect(err.code).toBe(-32001);
    expect(err.message).toBe('forbidden');
    expect(err.data).toEqual({ reason: 'no-token' });
  });
});
