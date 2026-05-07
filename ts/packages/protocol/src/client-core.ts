import { randomUUID } from 'node:crypto';
import type { Transport } from './transport.js';
import { SERVICE_RE, METHOD_RE, parseEnvelope, EnvelopeKind, buildRequest, buildNotification } from './envelope.js';
import { RpcError, ClamatorProtocolError } from './error.js';

export interface ClamatorClient {
  call<P, R>(service: string, method: string, params: P): Promise<R>;
  notify<P>(service: string, method: string, params: P): Promise<void>;
}

export interface RpcClientCoreOptions {
  defaultTimeoutMs?: number;
}

export class RpcClientCore implements ClamatorClient {
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private readonly defaultTimeoutMs: number;

  constructor(private readonly transport: Transport, opts: RpcClientCoreOptions = {}) {
    this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 30_000;
  }

  async call<P, R>(service: string, method: string, params: P): Promise<R> {
    if (!SERVICE_RE.test(service)) throw new Error(`invalid service "${service}"`);
    if (!METHOD_RE.test(method)) throw new Error(`invalid method "${method}"`);
    const id = randomUUID();
    const env = buildRequest(`${service}.${method}`, params, id);
    const reply = await this.transport.send(env, { timeoutMs: this.defaultTimeoutMs });
    let parsed;
    try { parsed = parseEnvelope(reply); }
    catch (e) { throw new ClamatorProtocolError(`invalid response envelope: ${(e as Error).message}`); }
    if (parsed.kind === EnvelopeKind.SuccessResponse) return parsed.result as R;
    if (parsed.kind === EnvelopeKind.ErrorResponse) {
      const { code, message, data } = parsed.error;
      throw new RpcError(code, message, data);
    }
    throw new ClamatorProtocolError(`unexpected response kind: ${parsed.kind}`);
  }

  async notify<P>(service: string, method: string, params: P): Promise<void> {
    if (!SERVICE_RE.test(service)) throw new Error(`invalid service "${service}"`);
    if (!METHOD_RE.test(method)) throw new Error(`invalid method "${method}"`);
    await this.transport.notify(buildNotification(`${service}.${method}`, params));
  }

  async start(): Promise<void> {
    if (this.state === 'stopped') throw new Error('client has been stopped');
    if (this.state === 'started') return;
    await this.transport.start();
    this.state = 'started';
  }

  async stop(): Promise<void> {
    if (this.state !== 'started') { this.state = 'stopped'; return; }
    await this.transport.stop();
    this.state = 'stopped';
  }
}
