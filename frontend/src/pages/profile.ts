// Display helpers for the roster pages: a snapshot unit as an engine unit, so the card numbers
// (攻击 / 命中 / 必杀 / 攻速 / 回避) come from the same formulas as battle (docs/03).
import type { SnapshotUnit } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { attackWeapons, seedRng, unitCombatStats } from '@common/engine/index.ts';
import type { BattleState, UnitState } from '@common/engine/index.ts';
import { tilesFromGlyphs } from '@common/maps/map.ts';

export function asUnit(s: SnapshotUnit, weapons: WeaponId[] = s.weapons): UnitState {
  const c = CHARACTERS[s.character];
  return {
    id: s.character, name: c.name, side: 'player', character: s.character, classId: s.classId, level: s.level, exp: 0,
    stats: { ...s.stats }, con: s.con, hp: s.stats.hp, pos: [0, 0], weapons: [...weapons],
    items: s.items.map(i => ({ ...i })), ranks: { ...s.ranks }, skill: c.skill, acted: false, alive: true,
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
