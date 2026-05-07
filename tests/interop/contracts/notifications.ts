import { z } from 'zod';
import { defineContract, defineNotification } from '@clamator/protocol';

export const notificationsContract = defineContract('notifications', {
  ping: defineNotification({ params: z.object({ tag: z.string().optional() }) }),
});
