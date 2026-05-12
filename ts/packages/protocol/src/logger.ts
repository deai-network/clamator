export interface Logger {
  error(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
  warn(msg: string, err?: unknown, fields?: Record<string, unknown>): void;
}

export const consoleLogger: Logger = {
  error: (msg, err, fields) =>
    console.error(`[clamator] ${msg}`, fields ?? {}, err ?? ''),
  warn: (msg, err, fields) =>
    console.warn(`[clamator] ${msg}`, fields ?? {}, err ?? ''),
};
