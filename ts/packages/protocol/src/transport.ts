import type { Envelope } from './envelope.js';

/** Adapter-side dispatch fn: returns Response envelope for requests, null for notifications. */
export type Dispatcher = (env: Envelope) => Promise<Record<string, unknown> | null>;

export interface SendOptions {
  timeoutMs: number;
}

export interface Transport {
  /** Register a handler for inbound traffic on a given service name. */
  registerService(name: string, dispatch: Dispatcher): Promise<void>;
  /** Send a request envelope; resolve with the response envelope. */
  send(env: Record<string, unknown>, opts: SendOptions): Promise<Record<string, unknown>>;
  /** Send a fire-and-forget notification envelope. */
  notify(env: Record<string, unknown>): Promise<void>;
  /** Spin up loops; idempotent. */
  start(): Promise<void>;
  /** Drain in-flight + close; idempotent. */
  stop(): Promise<void>;
}
