// Today's arena, owned by the server (docs/05, TODO ARENA-02): opponents and each attack's status come
// from GET_ARENA / GET_ARENA_RESULTS, the reveal after bans from ARENA_BAN (asked again with the same
// bans after a reload — the server answers a revealed attack the same way). The first release is
// attack-only, so nothing here reads or edits a player defense.
import { useSyncExternalStore } from 'react';
import { arenaPoints } from '@common/arena/rules.ts';
import type { CharacterId } from '@common/data/characters.ts';
import type { BattleState } from '@common/engine/index.ts';
import { session } from '../api/session.ts';
import type { ArenaReveal, ServerOpponent } from '../api/session.ts';

export type AttackStatus = 'new' | 'revealed' | 'fighting' | 'won' | 'lost';

export interface AttackRecord {
  status: AttackStatus;
  bans: string[];
  battle: BattleState | null;
  battleId: string | null;
  points: number;
  noShow?: boolean;
  surrender?: boolean;
}

export interface ArenaDay {
  attacks: Record<string, AttackRecord>;
  points: number;
  done: number;
}

const FRESH: AttackRecord = { status: 'new', bans: [], battle: null, battleId: null, points: 0 };

class ArenaStore {
  private overrides = new Map<string, Partial<AttackRecord>>();
  private reveals = new Map<string, ArenaReveal>();
  private listeners = new Set<() => void>();
  private snap: ArenaDay = { attacks: {}, points: 0, done: 0 };

  constructor() {
    session.subscribe(() => this.recompute());
    this.recompute();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get = (): ArenaDay => this.snap;

  opponents(): ServerOpponent[] {
    return session.get().arena?.opponents ?? [];
  }

  opponent(id: string): ServerOpponent | undefined {
    return this.opponents().find(o => o.id === id);
  }

  // 1-based position of an opponent in today's list.
  index(id: string): number {
    return this.opponents().findIndex(o => o.id === id) + 1;
  }

  // The day's record is open until it settles (leaving the day settles it; unplayed attacks lose).
  open(): boolean {
    const arena = session.get().arena;
    return !!arena && arena.day !== null && !arena.settled && arena.opponents.length > 0;
  }

  record(id: string): AttackRecord {
    return this.snap.attacks[id] ?? FRESH;
  }

  cachedReveal(id: string): ArenaReveal | null {
    return this.reveals.get(id) ?? null;
  }

  // The reveal for a revealed attack; after a reload it is fetched again with the stored bans.
  async reveal(id: string): Promise<ArenaReveal> {
    const known = this.reveals.get(id);
    if (known) return known;
    const reveal = await session.arenaBan(id, this.record(id).bans);
    this.reveals.set(id, reveal);
    this.recompute();
    return reveal;
  }

  async confirmBans(id: string, bans: string[]): Promise<ArenaReveal> {
    const reveal = await session.arenaBan(id, bans);
    this.reveals.set(id, reveal);
    this.overrides.set(id, { status: 'revealed', bans });
    this.recompute();
    return reveal;
  }

  async start(id: string, picks: { character: CharacterId; unitId: string; pos: [number, number] }[], commander: string): Promise<void> {
    if (this.record(id).status !== 'revealed') return;
    const battleId = await session.arenaAttack(id, picks, commander);
    this.overrides.set(id, { status: 'fighting', battle: session.battleFor(id), battleId });
    this.recompute();
  }

  saveBattle(id: string, battle: BattleState): void {
    this.overrides.set(id, battle.result
      ? { status: battle.result.winner === 'player' ? 'won' : 'lost', battle, points: arenaPoints(battle).total }
      : { status: 'fighting', battle });
    this.recompute();
  }

  // Restores a battle after a reload, from the server's full state.
  resume(id: string, battle: BattleState, battleId: string): void {
    this.overrides.set(id, { status: 'fighting', battle, battleId });
    this.recompute();
  }

  private recompute(): void {
    const server = new Map<string, AttackRecord>();
    for (const attack of session.get().results?.attacks ?? []) {
      server.set(attack.opponentId, {
        status: attack.status as AttackStatus, bans: attack.bans, battle: null, battleId: attack.battleId, points: attack.points,
        noShow: attack.noShow, surrender: attack.surrender,
      });
    }
    // Server results win once they are final; local deltas only bridge the gap until the next refresh.
    for (const [id, base] of server) {
      const local = this.overrides.get(id);
      if (local && (base.status === 'won' || base.status === 'lost') && local.status !== base.status && !local.battle?.result) this.overrides.delete(id);
    }
    const attacks: Record<string, AttackRecord> = {};
    for (const id of new Set([...server.keys(), ...this.overrides.keys()])) {
      attacks[id] = { ...(server.get(id) ?? FRESH), ...this.overrides.get(id) };
    }
    const records = Object.values(attacks);
    this.snap = {
      attacks,
      points: records.reduce((sum, r) => sum + r.points, 0),
      done: records.filter(r => r.status === 'won' || r.status === 'lost').length,
    };
    for (const listener of this.listeners) listener();
  }
}

export const arena = new ArenaStore();

export function useArena(): ArenaDay {
  return useSyncExternalStore(arena.subscribe, arena.get);
}
