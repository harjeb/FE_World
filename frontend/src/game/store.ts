import type { Battle, Capabilities, Event, Mutation, PlayerState, Run } from '../../../backend/common/protocol/v2.ts';
import type { DisplayError } from './errors.ts';

export interface GameSnapshot {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'disposed';
  connection: 'idle' | 'mock' | 'connecting' | 'live' | 'reconnecting' | 'polling' | 'offline';
  player: PlayerState | null;
  run: Run | null;
  battle: Battle | null;
  capabilities: Capabilities | null;
  pending: { commandId: string; op: Mutation; status: 'sending' | 'uncertain' } | null;
  eventCursor: string | null;
  recentEvents: Event[];
  error: DisplayError | null;
}

export function immutableSnapshot<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) immutableSnapshot(child);
  }
  return value;
}

export function compareCursors(a: string, b: string): number {
  if (!/^\d{1,128}$/.test(a) || !/^\d{1,128}$/.test(b)) throw new Error('Invalid event cursor');
  const left = BigInt(a), right = BigInt(b);
  return left === right ? 0 : left > right ? 1 : -1;
}

export class GameStore {
  private snapshot: GameSnapshot = immutableSnapshot({
    status: 'idle', connection: 'idle', player: null, run: null, battle: null,
    capabilities: null, pending: null, eventCursor: null, recentEvents: [], error: null,
  });
  private readonly listeners = new Set<() => void>();
  getSnapshot = (): GameSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  update(patch: Partial<GameSnapshot>): void {
    this.snapshot = immutableSnapshot({ ...this.snapshot, ...structuredClone(patch) });
    for (const listener of this.listeners) {
      // Rendering failures cannot invalidate an already committed backend command.
      try { listener(); } catch { /* Isolate observers from transaction handling. */ }
    }
  }

  applyPlayer(player: PlayerState): void {
    const previous = this.snapshot.player;
    if (previous && previous.playerId !== player.playerId) throw new Error('Session player changed; create a new runtime');
    if (previous && previous.playerVersion > player.playerVersion) return;
    const battle = this.snapshot.battle;
    const keepBattle = battle && player.activeRun?.id === battle.runId && player.activeRun.battleId === battle.id;
    this.update({ player, run: player.activeRun, battle: keepBattle ? battle : null });
  }

  applyBattle(battle: Battle): void {
    const run = this.snapshot.run;
    if (!run || run.id !== battle.runId || run.battleId !== battle.id) return;
    const previous = this.snapshot.battle;
    if (previous?.id === battle.id && previous.version > battle.version) return;
    this.update({ battle });
  }

  resetCursor(cursor: string | null): void {
    if (cursor !== null) compareCursors(cursor, cursor);
    this.update({ eventCursor: cursor, recentEvents: [] });
  }

  appendEvents(events: Event[]): void {
    let cursor = this.snapshot.eventCursor;
    const added: Event[] = [];
    for (const event of [...events].sort((left, right) => compareCursors(left.cursor, right.cursor))) {
      if (cursor !== null && compareCursors(event.cursor, cursor) <= 0) continue;
      compareCursors(event.cursor, event.cursor);
      added.push(event);
      cursor = event.cursor;
    }
    if (added.length) this.update({ eventCursor: cursor, recentEvents: [...this.snapshot.recentEvents, ...added].slice(-100) });
  }
}
