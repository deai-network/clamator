export class RpcError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(code: number, message: string, data: unknown = null) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
}

export class ClamatorProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClamatorProtocolError';
  }
}

export class ClamatorTransportError extends Error {
  readonly cause: unknown;
  constructor(message: string, cause: unknown = null) {
    super(message);
    this.name = 'ClamatorTransportError';
    this.cause = cause;
  }
}

const SERIALIZABLE_TYPES = new Set(['string', 'number', 'boolean']);

export function exceptionToErrorData(err: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (err instanceof Error) {
    out.name = err.name;
    out.message = err.message;
    for (const key of Object.getOwnPropertyNames(err)) {
      if (key === 'stack' || key === 'message' || key === 'name') continue;
      const v = (err as unknown as Record<string, unknown>)[key];
      if (v === null || SERIALIZABLE_TYPES.has(typeof v)) out[key] = v;
      else if (Array.isArray(v) && v.every(x => x === null || SERIALIZABLE_TYPES.has(typeof x))) out[key] = v;
    }
  } else {
    out.name = typeof err;
    out.message = String(err);
  }
  return out;
}
