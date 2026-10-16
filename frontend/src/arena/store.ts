// Today's arena, now owned by the server (docs/05): bans and attacks go through the Agent protocol and
// the returned battle state is what the battle page animates. This module only keeps the small local
// deltas between server refreshes and hands the screens a stable snapshot.
import { useSyncExternalStore } from 'react';
import { applyBans, arenaPoints } from '@common/arena/rules.ts';
import type { AttackPlan, Defense, Reveal } from '@common/arena/rules.ts';
import type { CharacterId } from '@common/data/characters.ts';
import type { BattleState } from '@common/engine/index.ts';
import { session } from '../api/session.ts';
import { MY_ROSTER, OPPONENTS } from '../demo/live.ts';

export type AttackStatus = 'new' | 'revealed' | 'fighting' | 'won' | 'lost';

export interface AttackRecord {
  status: AttackStatus;
  bans: CharacterId[];
  battle: BattleState | null;
  battleId: string | null;
  points: number;
}

export interface ArenaDay {
  attacks: Record<string, AttackRecord>;
  points: number;
  done: number;
}

class ArenaStore {
  private overrides = new Map<string, Partial<AttackRecord>>();
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

  opponent(id: string): Defense | undefined {
    return OPPONENTS.find(o => o.id === id);
  }

  record(id: string): AttackRecord {
    return this.snap.attacks[id] ?? { status: 'new', bans: [], battle: null, battleId: null, points: 0 };
  }

  // Bans are deterministic in the shared rules, so the local reveal matches the server's exactly.
  reveal(id: string): Reveal | null {
    const defense = this.opponent(id), record = this.record(id);
    return defense && record.status !== 'new' ? applyBans(defense, record.bans, MY_ROSTER) : null;
  }

  async confirmBans(id: string, bans: CharacterId[]): Promise<void> {
    const defense = this.opponent(id);
    if (!defense || this.record(id).status !== 'new') return;
    applyBans(defense, bans, MY_ROSTER);
    this.overrides.set(id, { status: 'revealed', bans });
    this.recompute();
    try {
      await session.arenaBan(id, bans);
    } catch (error) {
      this.overrides.delete(id);
      this.recompute();
      throw error;
    }
  }

  async start(id: string, plan: AttackPlan): Promise<void> {
    const record = this.record(id);
    if (!this.opponent(id) || record.status !== 'revealed') return;
    const battleId = await session.arenaAttack(id, plan.picks, plan.commander);
    this.overrides.set(id, { status: 'fighting', battle: session.battleFor(id), battleId });
    this.recompute();
  }

  saveBattle(id: string, battle: BattleState): void {
    if (this.record(id).status !== 'fighting') return;
    this.overrides.set(id, battle.result
      ? { status: battle.result.winner === 'player' ? 'won' : 'lost', battle, points: arenaPoints(battle).total }
      : { battle });
    this.recompute();
  }

  // Restores a battle after a reload, from the server's full state.
  resume(id: string, battle: BattleState, battleId: string): void {
    if (this.record(id).status === 'fighting') return;
    this.overrides.set(id, { status: 'fighting', battle, battleId });
    this.recompute();
  }

  // Clears local deltas; the server keeps the real state.
  reset(): void {
    this.overrides.clear();
    this.recompute();
  }

  private recompute(): void {
    const server = new Map<string, AttackRecord>();
    for (const attack of session.get().results?.attacks ?? []) {
      server.set(attack.opponentId, {
        status: attack.status as AttackStatus, bans: attack.bans, battle: null, battleId: attack.battleId, points: attack.points,
      });
    }
    const attacks: Record<string, AttackRecord> = {};
    for (const id of Object.keys(Object.fromEntries([...server, ...this.overrides]))) {
      const base = server.get(id) ?? { status: 'new' as const, bans: [], battle: null, battleId: null, points: 0 };
      attacks[id] = { ...base, ...this.overrides.get(id) };
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

// Today's earned points (attacks settled today), shown next to the season total.
export function todayPoints(day: ArenaDay): number {
  return day.points;
}

export function useArena(): ArenaDay {
  return useSyncExternalStore(arena.subscribe, arena.get);
}
