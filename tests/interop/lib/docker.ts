import { spawnSync } from 'node:child_process';

export function dockerComposeUp(file: string): void {
  const r = spawnSync('docker', ['compose', '-f', file, 'up', '-d', 'redis'], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('docker compose up failed');
}

export function dockerComposeDown(file: string): void {
  spawnSync('docker', ['compose', '-f', file, 'down', '-v'], { stdio: 'inherit' });
}

export async function waitForRedis(redisUrl: string, attempts = 30): Promise<void> {
  const { default: IORedis } = await import('ioredis');
  for (let i = 0; i < attempts; i++) {
    const r = new IORedis(redisUrl, { lazyConnect: true, connectTimeout: 1000 });
    try {
      await r.connect();
      const pong = await r.ping();
      await r.quit();
      if (pong === 'PONG') return;
    } catch {
      /* retry */
    } finally {
      try { r.disconnect(); } catch { /* ignore */ }
    }
    await new Promise(res => setTimeout(res, 200));
  }
  throw new Error('redis never became ready');
}
