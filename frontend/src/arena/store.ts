// Today's arena attacks, standing in for the server until the API exists: bans, the live battle state
// and results per opponent. Saved in this browser so a reload or 暂离 resumes the same attack
// (docs/05: 断线可以重连继续); storage failures only cost that convenience.
import { useSyncExternalStore } from 'react';
import { MY_ROSTER, OPPONENTS } from '@common/arena/demo.ts';
import { applyBans, arenaPoints, createArenaBattle } from '@common/arena/rules.ts';
import type { AttackPlan, Defense, Reveal } from '@common/arena/rules.ts';
import type { CharacterId } from '@common/data/characters.ts';
import type { BattleState } from '@common/engine/index.ts';

export type AttackStatus = 'new' | 'revealed' | 'fighting' | 'won' | 'lost';

export interface AttackRecord {
  status: AttackStatus;
  bans: CharacterId[];
  battle: BattleState | null;
  points: number;
}

interface Saved { version: 1; attacks: Record<string, AttackRecord> }

export interface ArenaDay {
  attacks: Record<string, AttackRecord>;
  points: number;
  done: number;
}

const KEY = 'agent-tactics.arena-day';

function blank(): Saved {
  const attacks: Record<string, AttackRecord> = {};
  for (const o of OPPONENTS) attacks[o.id] = { status: 'new', bans: [], battle: null, points: 0 };
  return { version: 1, attacks };
}

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    if (saved?.version === 1 && OPPONENTS.every(o => saved.attacks?.[o.id])) return saved;
  } catch {
    // Unreadable or blocked storage: start a fresh day.
  }
  return blank();
}

function summarize(saved: Saved): ArenaDay {
  const records = Object.values(saved.attacks);
  return {
    attacks: saved.attacks,
    points: records.reduce((sum, r) => sum + r.points, 0),
    done: records.filter(r => r.status === 'won' || r.status === 'lost').length,
  };
}

export class ArenaStore {
  private saved = load();
  private day = summarize(this.saved);
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  get = () => this.day;

  opponent(id: string): Defense | undefined {
    return OPPONENTS.find(o => o.id === id);
  }

  record(id: string): AttackRecord {
    return this.saved.attacks[id];
  }

  reveal(id: string): Reveal | null {
    const defense = this.opponent(id), record = this.record(id);
    return defense && record.status !== 'new' ? applyBans(defense, record.bans, MY_ROSTER) : null;
  }

  confirmBans(id: string, bans: CharacterId[]): void {
    const defense = this.opponent(id);
    if (!defense || this.record(id).status !== 'new') return;
    applyBans(defense, bans, MY_ROSTER);
    this.update(id, { status: 'revealed', bans });
  }

  start(id: string, plan: AttackPlan): void {
    const defense = this.opponent(id), record = this.record(id);
    if (!defense || record.status !== 'revealed') return;
    const seed = Math.random().toString(36).slice(2, 10);
    this.update(id, { status: 'fighting', battle: createArenaBattle(defense, record.bans, MY_ROSTER, plan, seed) });
  }

  saveBattle(id: string, battle: BattleState): void {
    if (this.record(id).status !== 'fighting') return;
    if (!battle.result) this.update(id, { battle });
    else this.update(id, { battle, status: battle.result.winner === 'player' ? 'won' : 'lost', points: arenaPoints(battle).total });
  }

  // Demo only: a real arena day cannot be replayed.
  reset(): void {
    this.saved = blank();
    this.commit();
  }

  private update(id: string, patch: Partial<AttackRecord>): void {
    this.saved = { ...this.saved, attacks: { ...this.saved.attacks, [id]: { ...this.saved.attacks[id], ...patch } } };
    this.commit();
  }

  private commit(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {
      // Keep going in memory.
    }
    this.day = summarize(this.saved);
    for (const listener of this.listeners) listener();
  }
}

export const arena = new ArenaStore();

export function useArena(): ArenaDay {
  return useSyncExternalStore(arena.subscribe, arena.get);
}
