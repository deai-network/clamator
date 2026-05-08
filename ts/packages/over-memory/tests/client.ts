import { MemoryBus, MemoryRpcClient } from '../src/index.js';
import { ArithClient } from './generated/arith.js';

export async function callArith(bus: MemoryBus) {
  const client = new MemoryRpcClient({ bus }); // default timeout 30 s (pass defaultTimeoutMs to override); no retry; timeouts not propagated to server
  await client.start();
  const arith = new ArithClient(client);
  const r = await arith.add({ a: 2, b: 3 });
  await client.stop();
  return r;
}
