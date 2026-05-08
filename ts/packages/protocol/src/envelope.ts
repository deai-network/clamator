export const SERVICE_RE = /^[a-z][a-z0-9-]*$/;
// Method names must be valid identifiers in both TS and Py output of the codegen.
// Hyphens were previously allowed in the wire-side regex but broke codegen Py
// emission ("def group-cancel" is invalid syntax). Tightened in v0.1.6 to keep
// the wire-side and codegen-side validity definitions in agreement.
export const METHOD_RE = /^[a-z][a-zA-Z0-9]*$/;

// Plain string enum (NOT `const enum` — incompatible with `isolatedModules: true`).
export enum EnvelopeKind {
	Request = 'request',
	Notification = 'notification',
	SuccessResponse = 'success',
	ErrorResponse = 'error',
}

export type RpcId = string | number;

export interface RequestEnvelope {
	kind: EnvelopeKind.Request;
	service: string;
	method: string;
	fullMethod: string;
	params: unknown;
	id: RpcId;
	raw: Record<string, unknown>;
}

export interface NotificationEnvelope {
	kind: EnvelopeKind.Notification;
	service: string;
	method: string;
	fullMethod: string;
	params: unknown;
	raw: Record<string, unknown>;
}

export interface SuccessResponseEnvelope {
	kind: EnvelopeKind.SuccessResponse;
	id: RpcId;
	result: unknown;
}

export interface ErrorResponseEnvelope {
	kind: EnvelopeKind.ErrorResponse;
	id: RpcId | null;
	error: { code: number; message: string; data: unknown };
}

export type Envelope =
	| RequestEnvelope
	| NotificationEnvelope
	| SuccessResponseEnvelope
	| ErrorResponseEnvelope;

class InvalidRequest extends Error {
	readonly code = -32600;
	constructor(msg: string) {
		super(`-32600 Invalid Request: ${msg}`);
	}
}

export function parseEnvelope(value: unknown): Envelope {
	if (Array.isArray(value)) throw new InvalidRequest('batch requests not supported');
	if (typeof value !== 'object' || value === null) throw new InvalidRequest('not an object');
	const obj = value as Record<string, unknown>;
	if (obj.jsonrpc !== '2.0') throw new InvalidRequest('jsonrpc must equal "2.0"');

	const hasMethod = typeof obj.method === 'string';
	const hasResult = 'result' in obj;
	const hasError = 'error' in obj;
	const hasId = 'id' in obj && obj.id !== null && obj.id !== undefined;

	if (hasMethod) {
		const fullMethod = obj.method as string;
		const dot = fullMethod.indexOf('.');
		if (dot <= 0 || dot === fullMethod.length - 1)
			throw new InvalidRequest('method must be "<service>.<method>"');
		const service = fullMethod.slice(0, dot);
		const method = fullMethod.slice(dot + 1);
		if (!SERVICE_RE.test(service)) throw new InvalidRequest('invalid service segment');
		if (!METHOD_RE.test(method)) throw new InvalidRequest('invalid method segment');
		if (hasId) {
			const id = obj.id as RpcId;
			if (typeof id !== 'string' && typeof id !== 'number')
				throw new InvalidRequest('id must be string or number');
			return {
				kind: EnvelopeKind.Request,
				service, method, fullMethod,
				params: obj.params ?? {},
				id, raw: obj,
			};
		}
		return {
			kind: EnvelopeKind.Notification,
			service, method, fullMethod,
			params: obj.params ?? {},
			raw: obj,
		};
	}

	if (hasResult && !hasError) {
		if (!hasId) throw new InvalidRequest('response must have id');
		return {
			kind: EnvelopeKind.SuccessResponse,
			id: obj.id as RpcId,
			result: obj.result,
		};
	}

	if (hasError && !hasResult) {
		const err = obj.error as Record<string, unknown> | undefined;
		if (!err || typeof err.code !== 'number' || typeof err.message !== 'string')
			throw new InvalidRequest('error must have numeric code + string message');
		return {
			kind: EnvelopeKind.ErrorResponse,
			id: (hasId ? (obj.id as RpcId) : null),
			error: { code: err.code, message: err.message, data: err.data ?? null },
		};
	}

	throw new InvalidRequest('envelope must be request, notification, or response');
}

export function buildSuccessResponse(id: RpcId, result: unknown): Record<string, unknown> {
	return { jsonrpc: '2.0', id, result };
}

export function buildErrorResponse(
	id: RpcId | null,
	code: number, message: string, data: unknown = null,
): Record<string, unknown> {
	return { jsonrpc: '2.0', id, error: { code, message, data } };
}

export function buildRequest(fullMethod: string, params: unknown, id: RpcId): Record<string, unknown> {
	return { jsonrpc: '2.0', method: fullMethod, params, id };
}

export function buildNotification(fullMethod: string, params: unknown): Record<string, unknown> {
	return { jsonrpc: '2.0', method: fullMethod, params };
}
