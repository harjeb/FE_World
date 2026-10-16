import type { OperationMap } from '../../../backend/common/protocol/v2.ts';
import type { GameClient, Query } from './client.ts';
import { displayError } from './errors.ts';
import type { DisplayError } from './errors.ts';
import { immutableSnapshot } from './store.ts';

export interface ResourceSnapshot<T> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T | null; playerVersion: number | null; error: DisplayError | null;
}

// A page-local query resource. Late responses never replace a more recent load.
export class QueryResource<K extends Query> {
  private readonly client: GameClient;
  private readonly op: K;
  private snapshot: ResourceSnapshot<OperationMap[K]['output']> = { status: 'idle', data: null, playerVersion: null, error: null };
  private readonly listeners = new Set<() => void>();
  private controller: AbortController | null = null;
  private generation = 0;
  private disposed = false;
  private lastInput: OperationMap[K]['input'] | null = null;
  private observedVersion: number | null;
  private readonly unsubscribeStore: () => void;
  private readonly onDispose?: () => void;
  constructor(client: GameClient, op: K, onDispose?: () => void) {
    this.client = client;
    this.op = op;
    this.onDispose = onDispose;
    this.observedVersion = client.store.getSnapshot().player?.playerVersion ?? null;
    this.unsubscribeStore = client.store.subscribe(() => {
      const version = client.store.getSnapshot().player?.playerVersion ?? null;
      if (version === this.observedVersion) return;
      this.observedVersion = version;
      if (this.lastInput && !this.disposed) void this.load(this.lastInput);
    });
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<ResourceSnapshot<OperationMap[K]['output']>>) {
    this.snapshot = Object.freeze({ ...this.snapshot, ...patch });
    for (const listener of this.listeners) { try { listener(); } catch { /* Isolate observers. */ } }
  }
  async load(data: OperationMap[K]['input']): Promise<void> {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.lastInput = structuredClone(data);
    this.controller?.abort();
    this.controller = new AbortController();
    this.update({ status: 'loading', data: null, playerVersion: null, error: null });
    try {
      const result = await this.client.queryResponse(this.op, data, this.controller.signal);
      if (this.disposed || generation !== this.generation) return;
      if (result.playerVersion < (this.client.store.getSnapshot().player?.playerVersion ?? 0)) {
        this.update({ status: 'error', error: { code: 'STALE_QUERY_RESPONSE', message: 'Query result is older than the current player state; refresh it', retry: 'refresh' } });
        return;
      }
      this.update({ status: 'ready', data: immutableSnapshot(structuredClone(result.data)), playerVersion: result.playerVersion, error: null });
    } catch (error) {
      if (!this.disposed && generation === this.generation) this.update({ status: 'error', error: displayError(error) });
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ++this.generation;
    this.controller?.abort();
    this.unsubscribeStore();
    this.listeners.clear();
    this.onDispose?.();
  }
}
