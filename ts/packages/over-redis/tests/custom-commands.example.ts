import type IORedis from 'ioredis';
import { defineContract, defineMethod } from '@clamator/protocol';
import { z } from 'zod';
import { RedisRpcServer } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import type { ArithService } from './generated/arith.js';

// Hand-built contract for user-defined commands. Same shape as a codegen-
// emitted contract; just authored inline instead of imported from a generated
// module. Use this pattern when adding services to an engine at registration
// time without going through the codegen pipeline (e.g., user-supplied
// custom commands collected at boot).
const customCommandsContract = defineContract('custom-commands', {
  echo: defineMethod({
    params: z.object({ msg: z.string() }),
    result: z.object({ msg: z.string() }),
  }),
});

// One RedisRpcServer hosts both the codegen-emitted `arith` service and the
// hand-built `custom-commands` service. registerService must be called for
// each contract before start(); each gets its own consumer group keyed by
// the contract's service name.
export async function buildExtendedServer(opts: { redis: IORedis; keyPrefix: string }) {
  const server = new RedisRpcServer({ redis: opts.redis, keyPrefix: opts.keyPrefix });
  const arithHandlers: ArithService = {
    add: async ({ a, b }) => ({ sum: a + b }),
    ping: async (_p) => {},
  };
  const customHandlers = {
    echo: async ({ msg }: { msg: string }) => ({ msg }),
  };
  server.registerService(arithContract, arithHandlers);
  server.registerService(customCommandsContract, customHandlers);
  await server.start();
  return server;
}
