import { MemoryBus, MemoryRpcServer } from '../src/index.js';
import { arithContract } from './contracts/arith.js';
import type { ArithService } from './generated/arith.js';

export async function buildArithServer(bus: MemoryBus) {
  const server = new MemoryRpcServer({ bus }); // no external connection; stop() unregisters from the bus without closing any resource
  const handlers: ArithService = {
    add: async ({ a, b }) => ({ sum: a + b }),
  };
  server.registerService(arithContract, handlers); // must precede start() — post-start registrations are silently ignored, never registered on the bus
  await server.start();
  return server;
}
