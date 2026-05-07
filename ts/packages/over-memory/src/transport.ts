import {
  parseEnvelope, EnvelopeKind, ClamatorTransportError,
  type Transport, type Dispatcher, type SendOptions,
} from '@clamator/protocol';
import type { MemoryBus } from './bus.js';

interface Pending {
  resolve: (env: Record<string, unknown>) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class MemoryTransport implements Transport {
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private pending = new Map<string, Pending>();
  private myServices = new Set<string>();

  constructor(private readonly bus: MemoryBus, private readonly _instanceId: string = 'mem') {}

  async registerService(name: string, dispatch: Dispatcher): Promise<void> {
    this.bus.register(name, dispatch);
    this.myServices.add(name);
  }

  async send(env: Record<string, unknown>, opts: SendOptions): Promise<Record<string, unknown>> {
    if (this.state !== 'started')
      throw new ClamatorTransportError(`transport not started (state=${this.state})`);
    const parsed = parseEnvelope(env);
    if (parsed.kind !== EnvelopeKind.Request)
      throw new ClamatorTransportError('send requires a request envelope');
    const dispatcher = this.bus.lookup(parsed.service);
    if (!dispatcher) {
      // Simulate the same -32601 path as a real adapter after delivery + lookup-failure on server.
      return {
        jsonrpc: '2.0', id: parsed.id,
        error: { code: -32601, message: 'Method not found', data: null },
      };
    }
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(parsed.id as string);
        reject(new ClamatorTransportError('call timeout'));
      }, opts.timeoutMs);
      this.pending.set(String(parsed.id), { resolve, reject, timer });
      // Schedule async dispatch via microtask.
      queueMicrotask(async () => {
        try {
          const reply = await dispatcher(parsed);
          const p = this.pending.get(String(parsed.id));
          if (!p) return;
          this.pending.delete(String(parsed.id));
          clearTimeout(p.timer);
          if (reply === null) {
            p.reject(new ClamatorTransportError('dispatcher returned null for a request'));
          } else {
            p.resolve(reply);
          }
        } catch (e) {
          const p = this.pending.get(String(parsed.id));
          if (!p) return;
          this.pending.delete(String(parsed.id));
          clearTimeout(p.timer);
          p.reject(new ClamatorTransportError('dispatcher threw', e));
        }
      });
    });
  }

  async notify(env: Record<string, unknown>): Promise<void> {
    if (this.state !== 'started')
      throw new ClamatorTransportError(`transport not started (state=${this.state})`);
    const parsed = parseEnvelope(env);
    if (parsed.kind !== EnvelopeKind.Notification)
      throw new ClamatorTransportError('notify requires a notification envelope');
    const dispatcher = this.bus.lookup(parsed.service);
    if (!dispatcher) return;  // Silent drop, like a real fire-and-forget.
    queueMicrotask(() => { void dispatcher(parsed); });
  }

  async start(): Promise<void> {
    if (this.state === 'stopped') throw new ClamatorTransportError('transport has been stopped');
    this.state = 'started';
  }

  async stop(): Promise<void> {
    this.state = 'stopped';
    for (const [id, p] of this.pending.entries()) {
      clearTimeout(p.timer);
      p.reject(new ClamatorTransportError('transport stopped'));
      this.pending.delete(id);
    }
    for (const name of this.myServices) this.bus.unregister(name);
    this.myServices.clear();
  }
}
