import type { Contract, AnyMethodDef, HandlersFor } from './contract.js';
import type { Transport, Dispatcher } from './transport.js';
import { EnvelopeKind, type Envelope, buildSuccessResponse, buildErrorResponse } from './envelope.js';
import { RpcError, exceptionToErrorData } from './error.js';
import { type Logger, consoleLogger } from './logger.js';

interface ServiceEntry {
  contract: Contract<string, Record<string, AnyMethodDef>>;
  handlers: Record<string, (params: unknown) => Promise<unknown>>;
}

export interface ServerStopOptions {
  graceMs?: number;
}

export class RpcServerCore {
  private services = new Map<string, ServiceEntry>();
  private state: 'idle' | 'started' | 'stopped' = 'idle';
  private inflight = new Set<Promise<unknown>>();

  constructor(
    private readonly transport: Transport,
    private readonly logger: Logger = consoleLogger,
  ) {}

  registerService<M extends Record<string, AnyMethodDef>>(
    contract: Contract<string, M>,
    handlers: HandlersFor<M>,
  ): void {
    if (this.services.has(contract.service))
      throw new Error(`service "${contract.service}" already registered on this server`);
    this.services.set(contract.service, {
      contract,
      handlers: handlers as unknown as Record<string, (params: unknown) => Promise<unknown>>,
    });
  }

  private dispatcher(serviceName: string): Dispatcher {
    return async (env: Envelope) => {
      const entry = this.services.get(serviceName);
      if (!entry) {
        if (env.kind === EnvelopeKind.Notification) return null;
        const id = env.kind === EnvelopeKind.Request ? env.id : null;
        return buildErrorResponse(id, -32601, 'Method not found');
      }
      if (env.kind !== EnvelopeKind.Request && env.kind !== EnvelopeKind.Notification) return null;
      const methodDef = entry.contract.methods[env.method];
      const id = env.kind === EnvelopeKind.Request ? env.id : null;
      if (!methodDef) {
        return env.kind === EnvelopeKind.Notification ? null : buildErrorResponse(id, -32601, 'Method not found');
      }
      let parsed: unknown;
      try {
        parsed = methodDef.params.parse(env.params);
      } catch (e) {
        this.logger.warn(
          `RPC params validation failed: ${serviceName}.${env.method} id=${String(id)}`,
          e,
          { service: serviceName, method: env.method, rpcId: id },
        );
        if (env.kind === EnvelopeKind.Notification) return null;
        return buildErrorResponse(id, -32602, 'Invalid params', exceptionToErrorData(e));
      }
      const handler = entry.handlers[env.method];
      if (!handler) return env.kind === EnvelopeKind.Notification ? null : buildErrorResponse(id, -32601, 'Method not found');

      const work = handler(parsed);
      this.inflight.add(work);
      let result: unknown;
      try {
        result = await work;
      } catch (e) {
        this.inflight.delete(work);
        if (env.kind === EnvelopeKind.Notification) {
          if (!(e instanceof RpcError)) {
            this.logger.error(
              `RPC handler raised: ${serviceName}.${env.method} id=${String(id)}`,
              e,
              { service: serviceName, method: env.method, rpcId: id },
            );
          }
          return null;
        }
        if (e instanceof RpcError) return buildErrorResponse(id, e.code, e.message, e.data);
        this.logger.error(
          `RPC handler raised: ${serviceName}.${env.method} id=${String(id)}`,
          e,
          { service: serviceName, method: env.method, rpcId: id },
        );
        return buildErrorResponse(id, -32603, 'Internal error', exceptionToErrorData(e));
      }
      this.inflight.delete(work);
      if (env.kind === EnvelopeKind.Notification) return null;
      const isNotificationDef = 'notification' in methodDef && methodDef.notification === true;
      if (isNotificationDef) return null;
      try {
        const validated = (methodDef as { result: { parse: (x: unknown) => unknown } }).result.parse(result);
        return buildSuccessResponse(id as string | number, validated);
      } catch (e) {
        this.logger.error(
          `RPC result validation failed: ${serviceName}.${env.method} id=${String(id)}`,
          e,
          { service: serviceName, method: env.method, rpcId: id },
        );
        return buildErrorResponse(id, -32603, 'Result validation failed', exceptionToErrorData(e));
      }
    };
  }

  async start(): Promise<void> {
    if (this.state === 'started') return;
    if (this.state === 'stopped') throw new Error('server has been stopped');
    for (const name of this.services.keys()) {
      await this.transport.registerService(name, this.dispatcher(name));
    }
    await this.transport.start();
    this.state = 'started';
  }

  async stop(opts: ServerStopOptions = {}): Promise<void> {
    if (this.state !== 'started') { this.state = 'stopped'; return; }
    const grace = opts.graceMs ?? 5000;
    const deadline = Date.now() + grace;
    while (this.inflight.size > 0 && Date.now() < deadline) {
      await Promise.race([
        Promise.allSettled([...this.inflight]),
        new Promise(r => setTimeout(r, 50)),
      ]);
    }
    await this.transport.stop();
    this.state = 'stopped';
  }
}
