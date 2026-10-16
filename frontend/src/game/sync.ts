import type { Push } from '../../../backend/common/protocol/v2.ts';
import type { GameClient } from './client.ts';
import { displayError, TransportError } from './errors.ts';
import { compareCursors } from './store.ts';
import { isRecord } from './transport.ts';

export function decodePush(value: unknown): Push | null {
  if (!isRecord(value) || value.protocolVersion !== 2 || value.type !== 'EVENTS_AVAILABLE'
    || typeof value.latestCursor !== 'string' || !Number.isSafeInteger(value.playerVersion)) return null;
  try { compareCursors(value.latestCursor, value.latestCursor); } catch { return null; }
  return value as unknown as Push;
}

export class EventSynchronizer {
  private readonly client: GameClient;
  private working: Promise<void> | null = null;
  private again = false;
  private disposed = false;
  constructor(client: GameClient) { this.client = client; }

  notify(push?: Push): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const cursor = this.client.store.getSnapshot().eventCursor;
    if (push && cursor !== null && compareCursors(push.latestCursor, cursor) <= 0) return this.working ?? Promise.resolve();
    this.again = true;
    if (!this.working) {
      this.working = this.drain().finally(() => {
        this.working = null;
        if (this.again && !this.disposed) queueMicrotask(() => { void this.notify().catch(() => {}); });
      });
    }
    return this.working;
  }

  private async drain(): Promise<void> {
    while (this.again && !this.disposed) {
      this.again = false;
      try {
        let cursor = this.client.store.getSnapshot().eventCursor;
        for (let page = 0; page < 100; page++) {
          const result = await this.client.query('GET_EVENTS', { after: cursor, limit: 200 });
          if (this.disposed) return;
          if (result.resyncRequired) {
            await this.client.synchronize();
            this.client.store.resetCursor(this.client.store.getSnapshot().player?.lastEventCursor ?? null);
            break;
          }
          this.client.store.appendEvents(result.items);
          if (result.nextCursor === null) break;
          if (cursor !== null && compareCursors(result.nextCursor, cursor) <= 0) throw new TransportError('protocol', 'Event pagination did not advance');
          cursor = result.nextCursor;
          if (page === 99) throw new TransportError('protocol', 'Event backlog requires a full resynchronization');
        }
        await this.client.synchronize();
      } catch (error) {
        if (!this.disposed) this.client.store.update({ error: displayError(error), connection: 'offline' });
        throw error;
      }
    }
  }
  dispose(): void { this.disposed = true; this.again = false; }
}

export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}
export interface ConnectionOptions {
  client: GameClient;
  socketUrl?: string;
  createSocket?: (url: string) => SocketLike;
  pollMs?: number;
  reconnectMs?: number;
  maximumReconnectMs?: number;
}

// WebSocket is a notification channel. All reads and writes still use the same HTTP client.
export class GameConnection {
  private readonly options: ConnectionOptions;
  private synchronizer: EventSynchronizer;
  private socket: SocketLike | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private running = false;
  private generation = 0;
  private live = false;
  constructor(options: ConnectionOptions) { this.options = options; this.synchronizer = new EventSynchronizer(options.client); }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const generation = ++this.generation;
    this.synchronizer = new EventSynchronizer(this.options.client);
    try { await this.options.client.initialize(); }
    catch (error) { if (generation === this.generation) this.running = false; throw error; }
    if (!this.running || generation !== this.generation) return;
    if (this.options.client.mode === 'mock') return;
    this.pollTimer = setInterval(() => { void this.refresh(); }, this.options.pollMs ?? 5000);
    if (this.options.socketUrl) this.connect();
  }

  private async refresh() {
    if (!this.running) return;
    try {
      await this.synchronizer.notify();
      if (this.running && this.options.client.store.getSnapshot().connection === 'offline') {
        this.options.client.store.update({ connection: this.live ? 'live' : 'polling' });
      }
    }
    catch { /* The store exposes errors; polling will try again without replaying writes. */ }
  }

  private connect() {
    if (!this.running || !this.options.socketUrl) return;
    this.options.client.store.update({ connection: this.attempt ? 'reconnecting' : 'connecting' });
    try {
      const create = this.options.createSocket ?? (url => new WebSocket(url) as unknown as SocketLike);
      const socket = create(this.options.socketUrl);
      this.socket = socket;
      socket.onopen = () => {
        if (!this.running || this.socket !== socket) return;
        this.attempt = 0;
        this.live = true;
        this.options.client.store.update({ connection: 'live' });
        void this.refresh();
      };
      socket.onmessage = event => {
        if (!this.running || this.socket !== socket) return;
        let parsed: unknown;
        try { parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
        const push = decodePush(parsed);
        if (push) void this.synchronizer.notify(push).catch(() => {});
      };
      socket.onerror = () => {
        if (this.socket === socket) socket.close();
      };
      socket.onclose = () => {
        if (!this.running || this.socket !== socket) return;
        this.socket = null;
        this.live = false;
        this.scheduleReconnect();
      };
    } catch { this.scheduleReconnect(); }
  }

  private scheduleReconnect() {
    if (!this.running || this.reconnectTimer) return;
    const delay = Math.min(this.options.maximumReconnectMs ?? 30_000, (this.options.reconnectMs ?? 1000) * 2 ** Math.min(this.attempt++, 8));
    this.options.client.store.update({ connection: 'polling' });
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }

  stop(): void {
    this.running = false;
    ++this.generation;
    this.live = false;
    this.attempt = 0;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pollTimer = null;
    this.reconnectTimer = null;
    this.synchronizer.dispose();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    if (this.options.client.store.getSnapshot().status !== 'disposed') this.options.client.store.update({ connection: 'offline' });
  }
}
