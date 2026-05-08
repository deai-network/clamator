import { RedisRpcClient } from '../src/index.js';
import { ArithClient } from './generated/arith.js';

// Fire-and-forget: notification proxies return once the request is queued in Redis;
// they do not wait for the server to process. Handlers must be idempotent — see
// "Worker-pool semantics" for the at-least-once delivery details.
export async function fireNotification(keyPrefix: string) {
  const client = new RedisRpcClient({ keyPrefix });
  await client.start();
  const arith = new ArithClient(client);
  await arith.ping({});
  await client.stop();
}
