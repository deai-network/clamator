import { randomUUID } from 'node:crypto';
import IORedis, { type Redis } from 'ioredis';
import {
  parseEnvelope, EnvelopeKind, ClamatorTransportError,
  type Transport, type Dispatcher, type SendOptions,
} from '@clamator/protocol';
import { commandStream, consumerGroupName, consumerName } from './keys.js';

export interface ServerTransportOptions {
  /** Existing ioredis instance. Mutually exclusive with `redisUrl`. */
  redis?: Redis;
  /** Redis URL. If neither `redis` nor `redisUrl` is provided, falls back to `process.env.REDIS_URL` then `redis://localhost:6379`. */
  redisUrl?: string;
  keyPrefix: string;
  instanceId?: string;
  consumerClaimIdleMs?: number;
  replyStreamMaxLen?: number;
  shutdownGraceMs?: number;
}

export class ServerRedisTransport implements Transport {
  readonly instanceId: string;
  private dispatchers = new Map<string, Dispatcher>();
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private loops: Promise<void>[] = [];
  private abort = false;
  private reclaimWakers: Set<() => void> = new Set();
  // Dedicated connection per service for the blocking XREADGROUP call so that
  // xadd (reply), xack, and xautoclaim on the main connection are never
  // queued behind the blocking read.
  private blockingConns: Redis[] = [];

  private readonly redis: Redis;
  private readonly ownsRedis: boolean;
  private readonly keyPrefix: string;
  private readonly replyStreamMaxLen: number;
  private readonly consumerClaimIdleMs: number;
  private readonly shutdownGraceMs: number;

  constructor(opts: ServerTransportOptions) {
    if (opts.redis && opts.redisUrl)
      throw new ClamatorTransportError('provide either `redis` or `redisUrl`, not both');
    if (opts.redis) {
      this.redis = opts.redis;
      this.ownsRedis = false;
    } else {
      const url = opts.redisUrl ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
      this.redis = new IORedis(url);
      this.ownsRedis = true;
    }
    this.keyPrefix = opts.keyPrefix;
    this.instanceId = opts.instanceId ?? randomUUID();
    this.replyStreamMaxLen = opts.replyStreamMaxLen ?? 1024;
    this.consumerClaimIdleMs = opts.consumerClaimIdleMs ?? 60_000;
    this.shutdownGraceMs = opts.shutdownGraceMs ?? 5_000;
  }

  async registerService(name: string, dispatch: Dispatcher): Promise<void> {
    this.dispatchers.set(name, dispatch);
  }

  async send(): Promise<Record<string, unknown>> {
    throw new Error('server transport cannot send requests');
  }

  async notify(): Promise<void> {
    throw new Error('server transport cannot send notifications');
  }

  async start(): Promise<void> {
    if (this.state === 'stopped') throw new ClamatorTransportError('transport has been stopped');
    if (this.state === 'started') return;
    this.state = 'started';
    this.abort = false;
    for (const service of this.dispatchers.keys()) {
      const stream = commandStream(this.keyPrefix, service);
      const group = consumerGroupName(service);
      try {
        await this.redis.xgroup('CREATE', stream, group, '$', 'MKSTREAM');
      } catch (e) {
        const msg = (e as Error).message;
        if (!msg.includes('BUSYGROUP')) throw e;
      }
      // Dedicated connection for blocking XREADGROUP so the main connection
      // stays free for non-blocking operations (xadd, xack, xautoclaim).
      const blockingRedis = this.redis.duplicate();
      this.blockingConns.push(blockingRedis);
      this.loops.push(this.runConsumerLoop(service, blockingRedis));
      this.loops.push(this.runReclaimLoop(service));
    }
  }

  async stop(): Promise<void> {
    if (this.state !== 'started') { this.state = 'stopped'; return; }
    this.abort = true;
    // Wake up any sleeping reclaim loops so they can check abort and exit promptly.
    for (const wake of this.reclaimWakers) wake();
    this.reclaimWakers.clear();
    // Disconnect blocking connections to unblock XREADGROUP immediately.
    for (const conn of this.blockingConns) {
      try { conn.disconnect(); } catch { /* ignore */ }
    }
    const grace = this.shutdownGraceMs;
    await Promise.race([
      Promise.allSettled(this.loops),
      new Promise(r => setTimeout(r, grace)),
    ]);
    // Clean up dedicated blocking connections.
    for (const conn of this.blockingConns) {
      try { await conn.quit(); } catch { /* best effort */ }
    }
    this.blockingConns = [];
    if (this.ownsRedis) {
      try { await this.redis.quit(); } catch { /* best effort */ }
    }
    this.state = 'stopped';
  }

  private async runConsumerLoop(service: string, blockingRedis: Redis): Promise<void> {
    const stream = commandStream(this.keyPrefix, service);
    const group = consumerGroupName(service);
    const consumer = consumerName(service, this.instanceId);
    while (!this.abort) {
      try {
        const result = await blockingRedis.xreadgroup(
          'GROUP', group, consumer, 'COUNT', 16, 'BLOCK', 1000,
          'STREAMS', stream, '>',
        );
        if (!result) continue;
        for (const [, entries] of result as [string, [string, string[]][]][]) {
          for (const [entryId, fields] of entries) {
            await this.handleEntry(service, stream, group, entryId, fields);
          }
        }
      } catch (err) {
        if (this.abort) return;
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }

  private interruptibleSleep(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
      const timer = setTimeout(() => { this.reclaimWakers.delete(wake); resolve(); }, ms);
      const wake = () => { clearTimeout(timer); this.reclaimWakers.delete(wake); resolve(); };
      this.reclaimWakers.add(wake);
    });
  }

  private async runReclaimLoop(service: string): Promise<void> {
    const stream = commandStream(this.keyPrefix, service);
    const group = consumerGroupName(service);
    const consumer = consumerName(service, this.instanceId);
    const idleThreshold = this.consumerClaimIdleMs;
    while (!this.abort) {
      try {
        await this.interruptibleSleep(Math.max(1000, idleThreshold / 4));
        if (this.abort) return;
        const claimed = await this.redis.xautoclaim(
          stream, group, consumer, idleThreshold, '0', 'COUNT', 32,
        ) as [string, [string, string[]][], string[]];
        const entries = claimed[1];
        if (!entries || entries.length === 0) continue;
        for (const [entryId, fields] of entries) {
          await this.handleEntry(service, stream, group, entryId, fields);
        }
      } catch (err) {
        if (this.abort) return;
      }
    }
  }

  private async handleEntry(
    service: string, stream: string, group: string,
    entryId: string, fields: string[],
  ): Promise<void> {
    const envIdx = fields.indexOf('envelope');
    if (envIdx < 0) {
      await this.redis.xack(stream, group, entryId);
      return;
    }
    const replyToIdx = fields.indexOf('reply-to');
    const replyTo = replyToIdx >= 0 ? fields[replyToIdx + 1] : null;
    let envObj: Record<string, unknown>;
    try { envObj = JSON.parse(fields[envIdx + 1] ?? '') as Record<string, unknown>; }
    catch { await this.redis.xack(stream, group, entryId); return; }
    let parsed;
    try { parsed = parseEnvelope(envObj); } catch { await this.redis.xack(stream, group, entryId); return; }

    const dispatcher = this.dispatchers.get(service);
    if (!dispatcher) { await this.redis.xack(stream, group, entryId); return; }

    const reply = await dispatcher(parsed);
    if (replyTo && reply) {
      await this.redis.xadd(
        replyTo, 'MAXLEN', '~', String(this.replyStreamMaxLen), '*',
        'type', 'rpc', 'envelope', JSON.stringify(reply),
      );
    }
    await this.redis.xack(stream, group, entryId);
  }
}
