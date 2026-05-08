import { RedisRpcClient } from '../src/index.js';
import { ArithClient } from './generated/arith.js';
import { LoggerClient } from './generated/logger.js';

// One keyPrefix-pinned RedisRpcClient backs many service proxies.
export async function callMultipleServices(keyPrefix: string) {
  const client = new RedisRpcClient({ keyPrefix });
  await client.start();
  const arith = new ArithClient(client);
  const logger = new LoggerClient(client);
  const sum = await arith.add({ a: 2, b: 3 });
  await logger.log({ msg: `sum=${sum.sum}` });
  await client.stop();
  return sum;
}
