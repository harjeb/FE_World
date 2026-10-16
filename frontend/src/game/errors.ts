import type { Failure } from '../../../backend/common/protocol/v2.ts';

export class ClientError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ClientError';
    this.code = code;
  }
}

export class ApiError extends Error {
  readonly failure: Failure;
  constructor(failure: Failure) {
    super(failure.message);
    this.name = 'ApiError';
    this.failure = failure;
  }
}

export class TransportError extends Error {
  readonly kind: 'network' | 'timeout' | 'aborted' | 'protocol';
  constructor(kind: TransportError['kind'], message: string) {
    super(message);
    this.name = 'TransportError';
    this.kind = kind;
  }
}

export interface DisplayError { code: string; message: string; retry: Failure['retry'] }
export function displayError(error: unknown): DisplayError {
  if (error instanceof ApiError) return { ...error.failure };
  if (error instanceof ClientError) return { code: error.code, message: error.message, retry: 'none' };
  if (error instanceof TransportError) return { code: error.kind.toUpperCase(), message: error.message, retry: 'same_command' };
  return { code: 'UNEXPECTED_ERROR', message: error instanceof Error ? error.message : 'Unexpected error', retry: 'none' };
}
