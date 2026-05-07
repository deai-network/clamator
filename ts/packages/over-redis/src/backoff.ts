export interface BackoffOptions {
  initialMs: number;
  maxMs: number;
  factor?: number;
  jitter?: boolean;
}

export function expBackoff(opts: BackoffOptions): () => number {
  const factor = opts.factor ?? 2;
  let current = opts.initialMs;
  return () => {
    const value = current;
    current = Math.min(opts.maxMs, current * factor);
    if (opts.jitter ?? true) return Math.floor(value * (0.5 + Math.random() * 0.5));
    return value;
  };
}

export function resetable(opts: BackoffOptions): { next: () => number; reset: () => void } {
  let next = expBackoff(opts);
  return {
    next: () => next(),
    reset: () => { next = expBackoff(opts); },
  };
}
