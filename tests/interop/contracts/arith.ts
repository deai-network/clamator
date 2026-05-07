import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ sum: z.number() }),
  }),
  slowAdd: defineMethod({
    params: z.object({ a: z.number(), b: z.number(), sleepMs: z.number().int().nonnegative() }),
    result: z.object({ sum: z.number() }),
  }),
  divide: defineMethod({
    params: z.object({ a: z.number(), b: z.number() }),
    result: z.object({ q: z.number() }),
  }),
  echoText: defineMethod({
    params: z.object({ text: z.string() }),
    result: z.object({ text: z.string() }),
  }),
});
