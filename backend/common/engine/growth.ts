import { CHARACTERS } from '../data/characters.ts';
import { applyGrowthBonus } from '../data/growth-types.ts';
import { STAT_KEYS } from '../data/types.ts';
import type { StatKey, Stats } from '../data/types.ts';
import { roll100 } from './rng.ts';
import { classOf, effectiveLevel } from './units.ts';
import type { BattleEvent, BattleState, UnitState } from './types.ts';

// docs/03「经验」. Δ = foe effective level − own effective level.
export const OVERLEVEL_EXP_GAP = 5;

export function combatExp(unit: UnitState, foe: UnitState, dealtDamage: boolean, killed: boolean): number {
  if (!dealtDamage && !killed) return 0;
  const delta = effectiveLevel(foe) - effectiveLevel(unit);
  // 包括首领击杀在内，总经验只给1点，不能在降档后再叠击杀奖励。
  if (delta <= -OVERLEVEL_EXP_GAP) return 1;
  let exp = Math.max(1, Math.floor((31 + delta) / 3));
  if (killed) exp += Math.max(0, 20 + delta * 3) + (foe.boss ? 40 : 0);
  return Math.min(100, exp);
}

export function staffExp(_unit: UnitState): number {
  return 12;
}

export function expPreview(unit: UnitState, foe: UnitState): { fight: number; kill: number } {
  return { fight: combatExp(unit, foe, true, false), kill: combatExp(unit, foe, true, true) };
}

// Personal + class growth, floored at 0, plus the growth-type/age offset (docs/02).
// Units without a character (generic enemies) do not grow.
export function growthRates(unit: UnitState): Stats | null {
  if (!unit.character) return null;
  const def = CHARACTERS[unit.character];
  const personal = unit.inheritedGrowth ?? def.growth;
  const own = classOf(unit).growth;
  const rates = {} as Stats;
  for (const key of STAT_KEYS) rates[key] = Math.max(0, (personal[key] ?? 0) + (unit.growthAllocation?.[key] ?? 0) + own[key]);
  return applyGrowthBonus(rates, unit.growthType ?? def.growthType, unit.age ?? def.age);
}

// Pure random growth: each stat rolls independently; 100%+ grants a sure point and rolls the rest.
// 空级保护: an empty level is rerolled up to twice while any stat is below its cap.
export function rollLevelUp(state: BattleState, unit: UnitState): { gains: Partial<Stats>; rerolls: number } {
  const rates = growthRates(unit);
  if (!rates) return { gains: {}, rerolls: 0 };
  const caps = classOf(unit).caps;
  // Historical battle JSON has no charm field. Keep its original rolls/RNG intact.
  const keys = STAT_KEYS.filter(key => key !== 'cha' || Number.isFinite(unit.stats.cha));
  const roll = () => {
    const gains: Partial<Stats> = {};
    for (const key of keys) {
      const room = caps[key] - unit.stats[key];
      if (room <= 0) continue;
      let gain = Math.floor(rates[key] / 100);
      const rest = rates[key] % 100;
      if (rest > 0 && roll100(state.growthRng) < rest) gain++;
      if (gain > 0) gains[key] = Math.min(gain, room);
    }
    return gains;
  };
  const anyRoom = keys.some(key => unit.stats[key] < caps[key]);
  let gains = roll(), rerolls = 0;
  while (Object.keys(gains).length === 0 && anyRoom && rerolls < 2) {
    gains = roll();
    rerolls++;
  }
  return { gains, rerolls };
}

export function gainExp(state: BattleState, unit: UnitState, amount: number, events: BattleEvent[]): void {
  const cls = classOf(unit);
  if (state.kind !== 'field' || unit.level >= cls.maxLevel || amount <= 0) return;
  unit.exp += amount;
  const leveled = unit.exp >= 100;
  if (leveled) {
    unit.exp -= 100;
    unit.level += 1;
    if (unit.level >= cls.maxLevel) unit.exp = 0;
  }
  events.push({ t: 'exp', unit: unit.id, gained: amount, exp: unit.exp, level: unit.level });
  if (!leveled) return;
  const { gains, rerolls } = rollLevelUp(state, unit);
  for (const [key, gain] of Object.entries(gains) as [StatKey, number][]) {
    unit.stats[key] += gain;
    if (key === 'hp') unit.hp += gain;
  }
  events.push({ t: 'levelUp', unit: unit.id, level: unit.level, gains, rerolls });
}
