import type { Weapon } from '../data/weapons.ts';
import type { SkillId } from '../data/skills.ts';
import { distance, living } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';

// Passive modifiers from personal skills (docs/02). def only applies against physical attacks.
export interface Mods { hit: number; avoid: number; crit: number; followUpCrit: number; damage: number; def: number }

export interface Fighter {
  unit: UnitState;
  pos: Point;
  weapon: Weapon | null;
  // Whether the unit has moved (or is moving) this turn; 坚守 needs it.
  moved: boolean;
}

// 个人技能与已装备的习得技能一起生效（docs/00 §4.2）；技能来源只按目录计算一次。
function hasSkill(unit: UnitState, skill: SkillId): boolean {
  return unit.skill === skill || (unit.skills ?? []).includes(skill);
}

function applySkill(mods: Mods, state: BattleState, f: Fighter, skill: SkillId): void {
  const { unit } = f;
  switch (skill) {
    case 'nimble': mods.avoid += 10; break;
    case 'hawkeye': mods.hit += 15; break;
    case 'focus': if (f.weapon?.type === 'tome') mods.crit += 10; break;
    case 'opening': mods.followUpCrit += 10; break;
    case 'surge': if (unit.hp * 2 <= unit.stats.hp) mods.damage += 3; break;
    case 'steadfast': if (!f.moved) mods.def += 3; break;
    case 'keen': mods.crit += 10; break;
    case 'grit': if (unit.hp * 2 <= unit.stats.hp) mods.hit += 20; break;
    case 'charge': if (f.moved) mods.damage += 2; break;
    default: break;
  }
  void state;
}

export function skillMods(state: BattleState, f: Fighter): Mods {
  const mods: Mods = { hit: 0, avoid: 0, crit: 0, followUpCrit: 0, damage: 0, def: 0 };
  const { unit } = f;
  const active = new Set<SkillId>();
  if (unit.skill) active.add(unit.skill);
  for (const skill of unit.skills ?? []) active.add(skill);
  for (const skill of active) applySkill(mods, state, f, skill);
  if (unit.shelteredTurn === state.turn) mods.def += 2;
  const veteranNearby = living(state, unit.side)
    .some(ally => ally.id !== unit.id && hasSkill(ally, 'veteran') && distance(ally.pos, f.pos) === 1);
  if (veteranNearby) mods.hit += 10;
  return mods;
}
