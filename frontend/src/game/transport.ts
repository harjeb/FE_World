import type { AnyRequest, Operation, Response as ApiResponse } from '../../../backend/common/protocol/v2.ts';
import { TransportError } from './errors.ts';

export interface Transport {
  readonly mode: 'http' | 'mock';
  send(request: AnyRequest, signal?: AbortSignal): Promise<unknown>;
  dispose?(): void;
}

export const mutations = new Set<Operation>([
  'SETUP_LEGION', 'EXECUTE_ACTION', 'DEPLOY', 'UNIT_ACT', 'END_PHASE', 'WITHDRAW_RUN',
  'BUY', 'SELL', 'RECRUIT_TAVERN', 'RESOLVE_RECRUIT', 'TRANSFER_ITEM', 'EQUIP_SKILLS',
  'USE_ITEM', 'PROMOTE', 'ASSIGN_BEXP', 'RETIRE_UNIT', 'DISMISS_UNIT', 'CLAIM_LEGACY',
  'REINCARNATE', 'REPAIR_ITEM', 'CLAIM_PRODUCTION', 'ARM_REFINEMENT', 'START_REFINEMENT',
  'STOP_REFINEMENT', 'SKIP_REFINEMENT', 'COMPLETE_STORY_EVENT', 'CLAIM_REWARD', 'ARENA_BAN', 'SET_DEFENSE',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function decodeResponse<K extends Operation>(raw: unknown, op: K, seq?: number): ApiResponse<K> {
  const invalid = () => { throw new TransportError('protocol', `Invalid ${op} response envelope`); };
  if (!isRecord(raw) || raw.protocolVersion !== 2 || raw.op !== op || !Number.isSafeInteger(raw.seq)
    || (seq !== undefined && raw.seq !== seq) || typeof raw.ok !== 'boolean') return invalid();
  if (raw.ok) {
    if (!Number.isSafeInteger(raw.playerVersion) || Number(raw.playerVersion) < 0 || !('data' in raw)) return invalid();
  } else {
    if (raw.playerVersion !== null && (!Number.isSafeInteger(raw.playerVersion) || Number(raw.playerVersion) < 0)) return invalid();
    if (!isRecord(raw.error) || typeof raw.error.code !== 'string' || typeof raw.error.message !== 'string'
      || !['refresh', 'same_command', 'wait', 'none'].includes(String(raw.error.retry))) return invalid();
  }
  return raw as unknown as ApiResponse<K>;
}

export interface HttpTransportOptions {
  baseUrl: string;
  timeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export class HttpTransport implements Transport {
  readonly mode = 'http' as const;
  private readonly base: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeout: number;
  private readonly controllers = new Set<AbortController>();
  private disposed = false;

  constructor(options: HttpTransportOptions) {
    this.base = options.baseUrl.replace(/\/+$/, '');
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeout = options.timeoutMs ?? 15_000;
    if (this.timeout <= 0 || !Number.isFinite(this.timeout)) throw new Error('timeoutMs must be positive');
  }

  async send(request: AnyRequest, signal?: AbortSignal): Promise<unknown> {
    if (this.disposed || signal?.aborted) throw new TransportError('aborted', 'Request was cancelled');
    const controller = new AbortController();
    this.controllers.add(controller);
    let timedOut = false;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeout);
    try {
      const endpoint = mutations.has(request.op) ? 'commands' : 'query';
      const response = await this.fetcher(`${this.base}/api/v2/${endpoint}`, {
        method: 'POST', credentials: 'include', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request),
      });
      // Business errors may use non-2xx HTTP statuses but still carry a valid API envelope.
      try { return await response.json(); }
      catch { throw new TransportError('protocol', `Backend returned a non-JSON response (${response.status})`); }
    } catch (error) {
      if (timedOut) throw new TransportError('timeout', 'Backend request timed out; commit status may be unknown');
      if (controller.signal.aborted) throw new TransportError('aborted', 'Request was cancelled; commit status may be unknown');
      if (error instanceof TransportError) throw error;
      throw new TransportError('network', error instanceof Error ? error.message : 'Backend is unreachable');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      this.controllers.delete(controller);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}
