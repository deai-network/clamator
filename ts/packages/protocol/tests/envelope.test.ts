import { describe, it, expect } from 'vitest';
import { parseEnvelope, EnvelopeKind, SERVICE_RE, METHOD_RE } from '../src/envelope.js';

describe('parseEnvelope', () => {
  it('classifies a valid request', () => {
    const env = parseEnvelope({
      jsonrpc: '2.0', method: 'engine.launch', params: { x: 1 }, id: 'abc',
    });
    expect(env.kind).toBe(EnvelopeKind.Request);
    if (env.kind === EnvelopeKind.Request) {
      expect(env.service).toBe('engine');
      expect(env.method).toBe('launch');
      expect(env.id).toBe('abc');
    }
  });

  it('classifies a valid notification (no id)', () => {
    const env = parseEnvelope({
      jsonrpc: '2.0', method: 'engine.resync', params: {},
    });
    expect(env.kind).toBe(EnvelopeKind.Notification);
  });

  it('classifies a success response', () => {
    const env = parseEnvelope({ jsonrpc: '2.0', id: 'abc', result: { ok: true } });
    expect(env.kind).toBe(EnvelopeKind.SuccessResponse);
  });

  it('classifies an error response', () => {
    const env = parseEnvelope({ jsonrpc: '2.0', id: 'abc', error: { code: -32603, message: 'x', data: null } });
    expect(env.kind).toBe(EnvelopeKind.ErrorResponse);
  });

  it('rejects batch (array)', () => {
    expect(() => parseEnvelope([{} as unknown])).toThrow(/-32600/);
  });

  it('rejects wrong jsonrpc version', () => {
    expect(() => parseEnvelope({ jsonrpc: '1.0', method: 'a.b', params: {} })).toThrow(/-32600/);
  });

  it('rejects bad method format (no dot)', () => {
    expect(() => parseEnvelope({ jsonrpc: '2.0', method: 'launch', params: {} })).toThrow(/-32600/);
  });

  it('rejects bad service segment', () => {
    expect(() => parseEnvelope({ jsonrpc: '2.0', method: 'Engine.launch', params: {} })).toThrow(/-32600/);
  });

  it('rejects bad method segment', () => {
    expect(() => parseEnvelope({ jsonrpc: '2.0', method: 'engine.Launch', params: {} })).toThrow(/-32600/);
  });

  it('SERVICE_RE matches expected', () => {
    expect(SERVICE_RE.test('engine')).toBe(true);
    expect(SERVICE_RE.test('order-service')).toBe(true);
    expect(SERVICE_RE.test('Engine')).toBe(false);
    expect(SERVICE_RE.test('1engine')).toBe(false);
  });

  it('METHOD_RE matches expected', () => {
    expect(METHOD_RE.test('launch')).toBe(true);
    expect(METHOD_RE.test('launchProcess')).toBe(true);
    expect(METHOD_RE.test('launch-process')).toBe(true);
    expect(METHOD_RE.test('Launch')).toBe(false);
  });
});
