// 战报（docs/00 §11「战报保留伤亡与消耗」）: what a stored battle cost and gave, derived only from the
// server record — the opening board, the final board and the event list. Nothing is estimated.
import { ITEMS } from '@common/data/weapons.ts';
import type { ItemId } from '@common/data/weapons.ts';
import { GAME_ITEMS } from '@common/game/items.ts';
import type { ItemKey } from '@common/game/items.ts';
import type { BattleState, UnitState } from '@common/engine/index.ts';
import type { ServerReplayData } from '../api/session.ts';
import { spellInfo, weaponLabel } from '../battle/commands.ts';

export interface UnitReport {
  id: string; name: string; classId: string; character?: string; portrait?: string;
  fallen: boolean; escaped: boolean; fallenTurn: number | null;
  hp: [number, number]; levels: number; levelTo: number; kills: number; damageDealt: number; damageTaken: number;
  items: { name: string; used: number }[];
  durability: { name: string; spent: number; left: number; max: number }[];
  charges: { name: string; spent: number; left: number; max: number }[];
  shieldUsed: boolean;
}

export interface BattleReport {
  winner: 'player' | 'enemy' | null; reason: string | null; turns: number;
  units: UnitReport[];
  enemiesDefeated: number; enemies: number;
  loot: { name: string; count: number }[];
}

const itemLabel = (id: string) => ITEMS[id as ItemId]?.name ?? GAME_ITEMS[id as ItemKey]?.name ?? id;

function usesByItem(unit: UnitState): Map<string, number> {
  const out = new Map<string, number>();
  for (const stack of unit.items) out.set(stack.id, (out.get(stack.id) ?? 0) + stack.uses);
  return out;
}

function pairs<T extends { id: string }>(before: T[] | undefined, after: T[] | undefined, value: (row: T) => number, max: (row: T) => number) {
  const rows: { name: string; spent: number; left: number; max: number }[] = [];
  (before ?? []).forEach((row, i) => {
    const later = (after ?? [])[i]?.id === row.id ? (after ?? [])[i] : (after ?? []).find(r => r.id === row.id);
    const left = later ? value(later) : value(row);
    if (value(row) - left > 0) rows.push({ name: spellInfo(row.id)?.name ?? weaponLabel(row.id), spent: value(row) - left, left, max: max(later ?? row) });
  });
  return rows;
}

export function battleReport(data: ServerReplayData): BattleReport {
  const initial: BattleState = data.initial, final: BattleState = data.state;
  let turn = 1;
  const fallenTurn = new Map<string, number>();
  const kills = new Map<string, number>();
  const dealt = new Map<string, number>();
  const taken = new Map<string, number>();
  const loot = new Map<string, number>();
  for (const e of data.events) {
    if (e.t === 'phase') turn = e.turn;
    else if (e.t === 'defeated') fallenTurn.set(e.unit, turn);
    else if (e.t === 'combat') {
      for (const s of e.strikes) {
        dealt.set(s.by, (dealt.get(s.by) ?? 0) + s.damage);
        taken.set(s.target, (taken.get(s.target) ?? 0) + s.damage);
        if (s.damage > 0 && s.hpAfter === 0) kills.set(s.by, (kills.get(s.by) ?? 0) + 1);
      }
    } else if (e.t === 'treasure') loot.set(e.item, (loot.get(e.item) ?? 0) + e.count);
  }
  const units = initial.units.filter(u => u.side === 'player' && !u.npc).map((u0): UnitReport => {
    const u1 = final.units.find(u => u.id === u0.id) ?? u0;
    const before = usesByItem(u0), after = usesByItem(u1);
    const items = [...before].flatMap(([id, uses]) => {
      const used = uses - (after.get(id) ?? 0);
      return used > 0 && id !== 'immortal_shield' ? [{ name: itemLabel(id), used }] : [];
    });
    const fallen = !u1.alive && !u1.escaped;
    return {
      id: u0.id, name: u0.name, classId: u1.classId, character: u0.character, portrait: u0.portrait,
      fallen, escaped: !!u1.escaped, fallenTurn: fallenTurn.get(u0.id) ?? null,
      hp: [u1.hp, u1.stats.hp], levels: u1.level - u0.level, levelTo: u1.level,
      kills: kills.get(u0.id) ?? 0, damageDealt: dealt.get(u0.id) ?? 0, damageTaken: taken.get(u0.id) ?? 0,
      items,
      durability: pairs(u0.weaponInstances, u1.weaponInstances, r => r.durability, r => r.maxDurability),
      charges: [
        ...pairs(u0.bookInstances, u1.bookInstances, r => r.charges, r => r.maxCharges),
        ...pairs(u0.spellbooks, u1.spellbooks, r => r.charges, r => r.maxCharges),
      ],
      shieldUsed: (u1.shieldsUsed ?? 0) > 0,
    };
  });
  const enemies = final.units.filter(u => u.side === 'enemy');
  return {
    winner: final.result?.winner ?? null, reason: final.result?.reason ?? null, turns: final.turn,
    units, enemies: enemies.length, enemiesDefeated: enemies.filter(u => !u.alive).length,
    loot: [...loot].map(([item, count]) => ({ name: itemLabel(item), count })),
  };
}
