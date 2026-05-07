import type { z } from 'zod';
import { SERVICE_RE, METHOD_RE } from './envelope.js';

export interface MethodDef<P extends z.ZodTypeAny, R extends z.ZodTypeAny> {
  params: P;
  result: R;
  notification?: false;
}

export interface NotificationDef<P extends z.ZodTypeAny> {
  params: P;
  notification: true;
}

export type AnyMethodDef = MethodDef<z.ZodTypeAny, z.ZodTypeAny> | NotificationDef<z.ZodTypeAny>;

export interface Contract<S extends string, M extends Record<string, AnyMethodDef>> {
  service: S;
  methods: M;
}

export function defineMethod<P extends z.ZodTypeAny, R extends z.ZodTypeAny>(
  def: MethodDef<P, R>,
): MethodDef<P, R> {
  return def;
}

export function defineNotification<P extends z.ZodTypeAny>(
  def: Omit<NotificationDef<P>, 'notification'>,
): NotificationDef<P> {
  return { ...def, notification: true } as NotificationDef<P>;
}

export function defineContract<S extends string, M extends Record<string, AnyMethodDef>>(
  service: S,
  methods: M,
): Contract<S, M> {
  if (!SERVICE_RE.test(service))
    throw new Error(`invalid service name "${service}" (must match ${SERVICE_RE.source})`);
  for (const [name, def] of Object.entries(methods)) {
    if (!METHOD_RE.test(name))
      throw new Error(`invalid method name "${name}" (must match ${METHOD_RE.source})`);
    const isNotification = (def as unknown as Record<string, unknown>).notification === true;
    if (isNotification) {
      if ('result' in (def as unknown as Record<string, unknown>))
        throw new Error(`notification "${name}" must not include result`);
    } else {
      if (!('result' in def) || (def as MethodDef<z.ZodTypeAny, z.ZodTypeAny>).result === undefined)
        throw new Error(`method "${name}" must include result schema`);
    }
  }
  return { service, methods };
}

/** Inferred handler signatures from a contract's method map. */
export type HandlersFor<M extends Record<string, AnyMethodDef>> = {
  [K in keyof M]: M[K] extends NotificationDef<infer P>
    ? (params: z.infer<P>) => Promise<void>
    : M[K] extends MethodDef<infer P, infer R>
    ? (params: z.infer<P>) => Promise<z.infer<R>>
    : never;
};
