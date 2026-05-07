import IORedis from 'ioredis';
import { RedisRpcServer } from '@clamator/over-redis';
import { arithContract } from '../../contracts/arith.js';
import { notificationsContract } from '../../contracts/notifications.js';
import { RpcError } from '@clamator/protocol';

interface DriverInput {
  contract: 'arith' | 'notifications';
  redisUrl: string;
  keyPrefix: string;
  instanceId?: string;
  consumerClaimIdleMs?: number;
}

async function readStdin(): Promise<DriverInput> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk.toString());
  return JSON.parse(chunks.join('')) as DriverInput;
}

async function main() {
  const cfg = await readStdin();
  const redis = new IORedis(cfg.redisUrl);
  const server = new RedisRpcServer({
    redis,
    keyPrefix: cfg.keyPrefix,
    ...(cfg.instanceId !== undefined ? { instanceId: cfg.instanceId } : {}),
    ...(cfg.consumerClaimIdleMs !== undefined ? { consumerClaimIdleMs: cfg.consumerClaimIdleMs } : {}),
  });

  let handledCount = 0;

  if (cfg.contract === 'arith') {
    server.registerService(arithContract, {
      add: async ({ a, b }) => { handledCount++; return { sum: a + b }; },
      slowAdd: async ({ a, b, sleepMs }) => {
        handledCount++;
        await new Promise(res => setTimeout(res, sleepMs));
        return { sum: a + b };
      },
      divide: async ({ a, b }) => {
        handledCount++;
        if (b === 0) throw new RpcError(-32000, 'division by zero');
        return { q: a / b };
      },
      echoText: async ({ text }) => { handledCount++; return { text }; },
    });
  } else {
    let pingedAt: number | null = null;
    server.registerService(notificationsContract, {
      ping: async () => { handledCount++; pingedAt = Date.now(); },
    });
    process.on('SIGTERM', () => {
      console.log(JSON.stringify({ pingedAt }));
      process.stderr.write(`HANDLED:${handledCount}\n`);
      process.exit(0);
    });
  }

  if (cfg.contract === 'arith') {
    process.on('SIGTERM', () => {
      process.stderr.write(`HANDLED:${handledCount}\n`);
      process.exit(0);
    });
  }

  await server.start();
  console.log('READY');
  await new Promise(() => {});
}
main().catch(err => { console.error(err); process.exit(1); });
