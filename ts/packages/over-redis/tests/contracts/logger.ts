import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const loggerContract = defineContract('logger', {
  log: defineMethod({
    params: z.object({ msg: z.string() }),
    result: z.object({ ok: z.boolean() }),
  }),
});
