import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  parseEnvelope, EnvelopeKind, ClamatorTransportError,
  type Transport, type SendOptions, type Dispatcher,
} from '@clamator/protocol';
import { commandStream, replyStream } from './keys.js';

export interface ClientTransportOptions {
  redis: Redis;
  keyPrefix: string;
  instanceId?: string;
  replyStreamMaxLen?: number;
  defaultTimeoutMs?: number;
}

interface Pending {
  resolve: (env: Record<string, unknown>) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ClientRedisTransport implements Transport {
  readonly instanceId: string;
  private readonly replyStream: string;
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private pending = new Map<string, Pending>();
  private replyLoop: Promise<void> | null = null;
  private replyLoopAbort = false;
  // Dedicated connection for the blocking XREAD reply loop, so that
  // xadd calls in send() are not queued behind the blocking read.
  private replyRedis: Redis | null = null;

  constructor(private readonly opts: ClientTransportOptions) {
    this.instanceId = opts.instanceId ?? randomUUID();
    this.replyStream = replyStream(opts.keyPrefix, this.instanceId);
  }

  async registerService(_name: string, _dispatch: Dispatcher): Promise<void> {
    throw new Error('client transport cannot host services');
  }

  async send(env: Record<string, unknown>, sendOpts: SendOptions): Promise<Record<string, unknown>> {
    if (this.state !== 'started')
      throw new ClamatorTransportError(`transport not started (state=${this.state})`);
    const parsed = parseEnvelope(env);
    if (parsed.kind !== EnvelopeKind.Request)
      throw new ClamatorTransportError('send requires a request envelope');
    const idStr = String(parsed.id);
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(idStr);
        reject(new ClamatorTransportError('call timeout'));
      }, sendOpts.timeoutMs);
      this.pending.set(idStr, { resolve, reject, timer });
      void this.opts.redis.xadd(
        commandStream(this.opts.keyPrefix, parsed.service),
        '*',
        'type', 'rpc',
        'envelope', JSON.stringify(env),
        'reply-to', this.replyStream,
      ).catch(err => {
        const p = this.pending.get(idStr);
        if (!p) return;
        this.pending.delete(idStr);
        clearTimeout(p.timer);
        p.reject(new ClamatorTransportError('xadd failed', err));
      });
    });
  }

  async notify(env: Record<string, unknown>): Promise<void> {
    if (this.state !== 'started')
      throw new ClamatorTransportError(`transport not started (state=${this.state})`);
    const parsed = parseEnvelope(env);
    if (parsed.kind !== EnvelopeKind.Notification)
      throw new ClamatorTransportError('notify requires a notification envelope');
    await this.opts.redis.xadd(
      commandStream(this.opts.keyPrefix, parsed.service),
      '*',
      'type', 'rpc',
      'envelope', JSON.stringify(env),
      // no reply-to
    );
  }

  async start(): Promise<void> {
    if (this.state === 'stopped') throw new ClamatorTransportError('transport has been stopped');
    if (this.state === 'started') return;
    this.state = 'started';
    this.replyLoopAbort = false;
    // Use a dedicated duplicate connection for the blocking XREAD so that
    // xadd commands in send() are not queued behind the blocking read.
    this.replyRedis = this.opts.redis.duplicate();
    this.replyLoop = this.runReplyLoop().catch(err => {
      // surface fatal loop errors
      console.error('[clamator/over-redis] reply loop fatal:', err);
    });
  }

  async stop(): Promise<void> {
    if (this.state !== 'started') { this.state = 'stopped'; return; }
    this.replyLoopAbort = true;
    // Disconnect the reply connection to unblock the XREAD immediately.
    try { this.replyRedis?.disconnect(); } catch { /* ignore */ }
    try { await this.replyLoop; } catch { /* ignore */ }
    for (const [id, p] of this.pending.entries()) {
      clearTimeout(p.timer);
      p.reject(new ClamatorTransportError('transport stopped'));
      this.pending.delete(id);
    }
    try { await this.opts.redis.del(this.replyStream); } catch { /* best effort */ }
    try { await this.replyRedis?.quit(); } catch { /* best effort */ }
    this.replyRedis = null;
    this.state = 'stopped';
  }

  private async runReplyLoop(): Promise<void> {
    // Use '0-0' rather than '$' so replies are never missed between iterations.
    // The reply stream is unique per client instance, so reading from the
    // beginning is always correct and safe.
    let lastId = '0-0';
    while (!this.replyLoopAbort) {
      try {
        const result = await this.replyRedis!.xread('BLOCK', 1000, 'STREAMS', this.replyStream, lastId);
        if (!result) continue;
        for (const [, entries] of result as [string, [string, string[]][]][]) {
          for (const [entryId, fields] of entries) {
            lastId = entryId;
            const idx = fields.indexOf('envelope');
            if (idx < 0) continue;
            const json = fields[idx + 1] ?? '';
            let parsed: Record<string, unknown>;
            try { parsed = JSON.parse(json) as Record<string, unknown>; }
            catch { continue; }
            const replyId = String(parsed.id);
            const pending = this.pending.get(replyId);
            if (!pending) continue;  // late or stranger reply
            this.pending.delete(replyId);
            clearTimeout(pending.timer);
            pending.resolve(parsed);
          }
        }
      } catch (err) {
        if (this.replyLoopAbort) return;
        await new Promise(r => setTimeout(r, 100));
      }
    }
  }
}
