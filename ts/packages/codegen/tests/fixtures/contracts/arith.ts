import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const arithContract = defineContract('arith', {
  add: defineMethod({
    params: z.object({ a: z.number().int(), b: z.number().int() }),
    result: z.object({ sum: z.number().int() }),
  }),
  divide: defineMethod({
    params: z.object({ a: z.number().int(), b: z.number().int() }),
    result: z.object({ q: z.number(), r: z.number().int() }),
  }),
});
