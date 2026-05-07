import IORedis from 'ioredis';
import { RedisRpcClient } from '@clamator/over-redis';
import { RpcError, ClamatorTransportError } from '@clamator/protocol';

interface Call {
  method: string;     // "<service>.<method>"
  params: unknown;
  notification?: boolean;
  expectErrorCode?: number;
  expectMessageMatches?: string;
  expectResult?: unknown;
}

interface Input {
  redisUrl: string;
  keyPrefix: string;
  defaultTimeoutMs?: number;
  calls: Call[];
  concurrent?: number;
}

async function readStdin(): Promise<Input> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk.toString());
  return JSON.parse(chunks.join('')) as Input;
}

async function invokeCall(
  client: RedisRpcClient,
  call: Call,
): Promise<Record<string, unknown>> {
  const dot = call.method.indexOf('.');
  const service = call.method.slice(0, dot);
  const method = call.method.slice(dot + 1);
  try {
    if (call.notification) {
      await client.notify(service, method, call.params);
      return { ok: true, kind: 'notification' };
    } else {
      const r = await client.call(service, method, call.params);
      return { ok: true, kind: 'result', result: r };
    }
  } catch (e) {
    if (e instanceof RpcError) {
      return { ok: false, kind: 'rpc-error', code: e.code, message: e.message, data: e.data };
    } else if (e instanceof ClamatorTransportError) {
      return { ok: false, kind: 'transport-error', message: (e as Error).message };
    } else {
      return { ok: false, kind: 'unknown-error', message: String(e) };
    }
  }
}

async function main() {
  const cfg = await readStdin();
  const redis = new IORedis(cfg.redisUrl);
  const client = new RedisRpcClient({
    redis, keyPrefix: cfg.keyPrefix, defaultTimeoutMs: cfg.defaultTimeoutMs ?? 5000,
  });
  await client.start();

  let results: Record<string, unknown>[];

  if (cfg.concurrent && cfg.concurrent > 1) {
    // Fan out: run the call list cfg.concurrent times in parallel
    const fans: Array<Promise<Record<string, unknown>[]>> = [];
    for (let i = 0; i < cfg.concurrent; i++) {
      fans.push(Promise.all(cfg.calls.map(call => invokeCall(client, call))));
    }
    const batches = await Promise.all(fans);
    results = batches.flat();
  } else {
    results = [];
    for (const call of cfg.calls) {
      results.push(await invokeCall(client, call));
    }
  }

  console.log(JSON.stringify({ results }));
  await client.stop();
  await redis.quit();
}
main().catch(err => { console.error(err); process.exit(1); });
