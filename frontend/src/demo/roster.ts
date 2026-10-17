// 名册 demo data: today's roster is the month-6 snapshot the arena uses (MY_ROSTER) plus the things
// a real roster would track: status, experience, weapon experience, history. All of it is made up
// deterministically so the pages look lived-in; none of it is a confirmed rule.
import type { SnapshotUnit } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import type { CharacterId } from '@common/data/characters.ts';
import { RANKS, STAT_KEYS } from '@common/data/types.ts';
import type { Rank, StatKey, Stats, WeaponType } from '@common/data/types.ts';
import { session } from '../api/session.ts';
import { plainDate } from '../ui/calendar.ts';
import { MY_DEFENSE, MY_ROSTER, serverUnit } from './live.ts';
import { promotionsFor } from './promotions.ts';

export type RosterStatus = 'main' | 'reserve' | 'injured';
export const STATUS_TEXT: Record<RosterStatus, string> = { main: '主力', reserve: '替补', injured: '重伤' };

export interface WeaponProgress { type: WeaponType; rank: Rank; exp: number; next: number | null }

export interface RosterEntry {
  unit: SnapshotUnit;
  status: RosterStatus;
  promotable: boolean;
  exp: number;
  joined: string;
  order: number;
  weapons: WeaponProgress[];
}

const MAIN: CharacterId[] = ['erin', 'victor', 'gustav', 'lina', 'owen', 'noah'];
const INJURED: CharacterId[] = ['sera'];
const JOINED: Partial<Record<CharacterId, string>> = {
  ren: '游历招募', roland: '游历招募', ig: '游历招募', mira: '游历招募',
};
// Weapon experience needed to reach the next rank (placeholder numbers).
const NEXT_RANK: Record<Rank, number | null> = { E: 30, D: 50, C: 70, B: 100, A: 150, S: null };

// Stable pseudo-random numbers per character, so reloads show the same roster.
export function seeded(id: string, salt: number, mod: number): number {
  let h = salt * 2654435761 >>> 0;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % mod;
}

function build(roster: SnapshotUnit[]): RosterEntry[] {
  return roster.map((unit, order) => {
    const c = unit.character;
    const srv = serverUnit(unit.id ?? c);
    return {
      unit,
      status: MAIN.includes(c) ? 'main' : INJURED.includes(c) ? 'injured' : 'reserve',
      promotable: promotionsFor(unit.classId).length > 0,
      exp: srv?.exp ?? seeded(c, 1, 100),
      joined: srv ? plainDate(srv.joinedDay) : JOINED[c] ?? '初始角色',
      order,
      weapons: (Object.entries(unit.ranks) as [WeaponType, Rank][]).map(([type, rank]) => {
        const next = NEXT_RANK[rank];
        const exp = srv?.weaponExp?.[type] ?? (next ? seeded(c, 2 + RANKS.indexOf(rank), next) : 0);
        return { type, rank, exp: next ? Math.min(exp, next) : 0, next };
      }),
    };
  });
}

// Rebuilt whenever the server session changes, so the 名册 page shows the live roster.
export let ROSTER: RosterEntry[] = build(MY_ROSTER);
session.subscribe(() => { ROSTER = build(MY_ROSTER); });

export const rosterEntry = (id: string | null) => ROSTER.find(e => e.unit.id === id) ?? ROSTER.find(e => e.unit.character === id);
export const ROSTER_LIMIT = 18;

// Where the unit stands in the defense that was locked with the month-6 snapshot.
export function defenseSlot(c: CharacterId): { place: number; behavior: string } | null {
  const i = MY_DEFENSE.slots.findIndex(s => s.unit.character === c);
  if (i < 0) return null;
  const names = { aggressive: '进攻', opportunist: '伺机', hold: '固守', guard: '护卫', healer: '治疗优先' };
  return { place: i + 1, behavior: names[MY_DEFENSE.slots[i].behavior] };
}

// 历次升级: the gains between the starting level and now, spread over the level-ups so that they add
// up to the current stats exactly. Every level gets at least one point (空级保护).
export function levelHistory(entry: RosterEntry): { level: number; gains: Partial<Stats> }[] {
  const srv = serverUnit(entry.unit.id ?? entry.unit.character);
  // 有真实升级日志就用真实数据 (docs/04)；演示回退只用于离线预览。
  if (srv) {
    return srv.growthLog.map(g => {
      const gains = { ...g.gains } as Partial<Stats>;
      for (const key of STAT_KEYS) if (g.inherited?.[key]) gains[key] = (gains[key] ?? 0) + g.inherited[key];
      return { level: g.level, gains };
    }).reverse();
  }
  const def = CHARACTERS[entry.unit.character];
  const n = entry.unit.level - def.level;
  if (n <= 0) return [];
  const levels: Partial<Stats>[] = Array.from({ length: n }, () => ({}));
  STAT_KEYS.forEach((key, k) => {
    const total = entry.unit.stats[key] - def.base[key];
    const offset = seeded(entry.unit.character, 10 + k, n);
    for (let i = 0; i < n; i++) {
      const gain = Math.floor((i + 1) * total / n) - Math.floor(i * total / n);
      if (gain > 0) levels[(i + offset) % n][key] = (levels[(i + offset) % n][key] ?? 0) + gain;
    }
  });
  for (let i = 0; i < n; i++) {
    if (Object.keys(levels[i]).length > 0) continue;
    const donor = levels.findIndex(l => Object.values(l).reduce((a, b) => a + b, 0) >= 3);
    if (donor < 0) break;
    const key = Object.keys(levels[donor])[0] as StatKey;
    levels[donor][key] = (levels[donor][key] ?? 1) - 1;
    if (levels[donor][key] === 0) delete levels[donor][key];
    levels[i][key] = 1;
  }
  return levels.map((gains, i) => ({ level: def.level + i + 1, gains })).reverse();
}
