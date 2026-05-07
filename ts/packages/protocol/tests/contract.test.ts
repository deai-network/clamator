import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { defineContract, defineMethod, defineNotification } from '../src/contract.js';

describe('defineContract', () => {
  it('builds a valid contract', () => {
    const c = defineContract('engine', {
      launch: defineMethod({
        params: z.object({ id: z.string() }),
        result: z.object({ ok: z.boolean() }),
      }),
      resync: defineNotification({
        params: z.object({}),
      }),
    });
    expect(c.service).toBe('engine');
    expect(Object.keys(c.methods)).toEqual(['launch', 'resync']);
  });

  it('rejects bad service name', () => {
    expect(() => defineContract('Engine', { x: defineMethod({ params: z.object({}), result: z.object({}) }) }))
      .toThrow(/service/);
  });

  it('rejects bad method name', () => {
    expect(() => defineContract('engine', { Launch: defineMethod({ params: z.object({}), result: z.object({}) }) }))
      .toThrow(/method/);
  });

  it('rejects method def without result', () => {
    expect(() => defineContract('engine', { launch: { params: z.object({}) } as any }))
      .toThrow(/result/);
  });

  it('rejects notification def WITH result', () => {
    expect(() => defineContract('engine', { resync: { params: z.object({}), result: z.object({}), notification: true } as any }))
      .toThrow(/notification/);
  });
});
