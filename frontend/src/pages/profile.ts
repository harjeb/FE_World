// Display helpers for the roster pages: a snapshot unit as an engine unit, so the card numbers
// (攻击 / 命中 / 必杀 / 攻速 / 回避) come from the same formulas as battle (docs/03).
import type { SnapshotUnit } from '@common/arena/rules.ts';
import { CLASS_ABILITY_BY_ID } from '@common/data/class-abilities.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import type { Stats } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { attackWeapons, isMagicWeapon, seedRng, unitCombatStats } from '@common/engine/index.ts';
import type { BattleState, UnitState } from '@common/engine/index.ts';
import { tilesFromGlyphs } from '@common/maps/map.ts';

export function asUnit(s: SnapshotUnit, weapons: WeaponId[] = s.weapons): UnitState {
  const c = CHARACTERS[s.character];
  return {
    id: s.character, name: s.name ?? c.name, side: 'player', character: s.character, portrait: s.portrait ?? undefined, classId: s.classId, level: s.level, exp: 0,
    stats: { ...s.stats }, con: s.con, hp: s.stats.hp, pos: [0, 0], weapons: [...weapons],
    items: s.items.map(i => ({ ...i })), ranks: { ...s.ranks }, skill: c.skill, acted: false, alive: true,
    weaponInstances: s.weaponInstances?.map(row => ({ ...row })),
    bookInstances: s.bookInstances?.map(row => ({ ...row })),
    spellbooks: s.spellbooks?.map(row => ({ ...row })),
    skills: s.skills ? [...s.skills] : undefined, arts: s.arts ? [...s.arts] : undefined,
    // 职业固有能力与战斗里一样生效（game/model.ts toUnitState）。
    classSkills: [...(CLASS_ABILITY_BY_ID.get(s.classId as never)?.inherentIds ?? [])],
  };
}

// The unit alone on one plain tile: no terrain bonus, no neighbors.
function alone(unit: UnitState): BattleState {
  return {
    engineVersion: 1, id: 'profile', kind: 'field', name: '', map: { width: 1, height: 1, tiles: tilesFromGlyphs(['.']) },
    units: [unit], turn: 1, turnLimit: 1, phase: 'player', goal: { kind: 'rout' }, rng: seedRng('profile'), growthRng: seedRng('profile'),
  };
}

export interface CombatLine { weapon: WeaponId; attack: number; hit: number; crit: number; attackSpeed: number; avoid: number }

// 名册「战斗能力」的八项，与交战公式同源（engine unitCombatStats）。
export const COMBAT_KEYS = ['attack', 'protection', 'attackSpeed', 'resistance', 'hit', 'avoid', 'crit', 'dodge'] as const;
export type CombatKey = (typeof COMBAT_KEYS)[number];
export type CombatNumbers = Record<CombatKey, number>;
export interface CombatProfile {
  weapon: WeaponId | null;
  magic: boolean;
  range: [number, number] | null;
  now: CombatNumbers;
  // 技能（个人、职业固有、已装备）与装备的加成部分；> 0 时数值旁标 ▲。
  bonus: CombatNumbers;
  // 同一职业属性全到上限、拿同一把武器时的数值：雷达图的刻度。
  cap: CombatNumbers;
}

function numbers(unit: UnitState, weapon: WeaponId | null): CombatNumbers {
  const s = unitCombatStats(alone(unit), unit, weapon);
  return { attack: s.attack, protection: s.protection, attackSpeed: s.attackSpeed, resistance: s.resistance, hit: s.hit, avoid: s.avoid, crit: s.crit, dodge: s.dodge };
}

export function combatProfile(unit: UnitState, caps: Stats): CombatProfile {
  const weapon = attackWeapons(unit)[0] ?? null;
  const w = weapon ? WEAPONS[weapon] : null;
  const now = numbers(unit, weapon);
  const bare = numbers({ ...unit, skill: undefined, skills: [], classSkills: [], arts: [] }, weapon);
  const gear = { avoid: w?.bonus?.avoid ?? 0, resistance: w?.bonus?.res ?? 0 } as Partial<CombatNumbers>;
  const bonus = Object.fromEntries(COMBAT_KEYS.map(k => [k, now[k] - bare[k] + (gear[k] ?? 0)])) as CombatNumbers;
  const cap = numbers({ ...unit, stats: { ...caps } }, weapon);
  return { weapon, magic: !!w && isMagicWeapon(w), range: w ? [w.range[0], w.range[1]] : null, now, bonus, cap };
}

// Numbers with the equipped weapon (the first one the unit can attack with), or null for staff users.
export function combatLine(unit: UnitState, mods: { attack?: number; hit?: number; crit?: number; avoid?: number } = {}): CombatLine | null {
  const weapon = attackWeapons(unit)[0];
  if (!weapon) return null;
  const s = unitCombatStats(alone(unit), unit, weapon);
  return {
    weapon, attack: s.attack + (mods.attack ?? 0), hit: s.hit + (mods.hit ?? 0), crit: s.crit + (mods.crit ?? 0),
    attackSpeed: s.attackSpeed, avoid: s.avoid + (mods.avoid ?? 0),
  };
}

export const weaponName = (id: WeaponId) => WEAPONS[id].name;
