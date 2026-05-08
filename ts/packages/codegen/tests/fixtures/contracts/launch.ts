import { z } from 'zod';
import { defineContract, defineMethod } from '@clamator/protocol';

export const launchContract = defineContract('launch', {
  start: defineMethod({
    params: z.object({ processId: z.string() }),
    result: z.discriminatedUnion('ok', [
      z.object({ ok: z.literal(true), runId: z.string() }),
      z.object({
        ok: z.literal(false),
        reason: z.enum(['not-launchable', 'already-running', 'not-found']),
      }),
    ]),
  }),
});
