import type { Weapon } from '../data/weapons.ts';
import type { SkillId } from '../data/skills.ts';
import { artStats } from './art-effects.ts';
import { distance, living } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';

// Passive modifiers from personal skills (docs/02). def only applies against physical attacks.
export interface Mods { hit: number; avoid: number; crit: number; followUpCrit: number; damage: number; def: number; attack: number; res: number; attackSpeed: number }

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

export function combatStats(unit: UnitState, weapon: Weapon | null) {
  const stats = artStats(unit);
  if (hasSkill(unit, 'lightshot') && unit.hp === unit.stats.hp && weapon?.type === 'bow') stats.skl *= 2;
  return stats;
}

// 首版只接入可在交战公式中直接验证的固有数值；未知/待核实效果保持目录记录，不臆造。
function applyClassSkills(mods: Mods, f: Fighter): void {
  const skills = new Set(f.unit.classSkills ?? []);
  const weapon = f.weapon?.type;
  if (skills.has('sk-24')) { mods.hit += 3; mods.avoid += 3; }
  if (skills.has('sk-25')) mods.attack += 1;
  if (skills.has('sk-27')) mods.def += 1;
  if (skills.has('sk-28')) mods.attack += 1;
  if (skills.has('sk-39')) mods.res += 3;
  if (skills.has('sk-41')) mods.avoid += 3;
  if (skills.has('sk-67')) mods.attackSpeed += 10;
  if (skills.has('sk-69')) mods.attack += 10;
  if (skills.has('sk-70')) mods.res += 10;
  if (skills.has('sk-72')) mods.def += 10;
  if (skills.has('sk-73')) { mods.hit += 20; mods.crit += 5; }
  if (skills.has('sk-93')) mods.damage += 5;
  if (weapon === 'sword') {
    if (skills.has('sk-114')) mods.crit += 3;
    if (skills.has('sk-115')) mods.crit += 5;
    if (skills.has('sk-116')) mods.crit += 7;
    if (skills.has('sk-117')) mods.crit += 10;
  }
  if (weapon === 'fist') {
    if (skills.has('sk-118')) mods.avoid += 3;
    if (skills.has('sk-119')) mods.avoid += 7;
    if (skills.has('sk-120')) mods.avoid += 10;
    if (skills.has('sk-130')) mods.hit += 7;
    if (skills.has('sk-131')) mods.hit += 10;
  }
  if (weapon === 'axe') {
    if (skills.has('sk-122')) mods.hit += 3;
    if (skills.has('sk-123')) mods.hit += 5;
    if (skills.has('sk-124')) mods.hit += 7;
    if (skills.has('sk-125')) mods.hit += 10;
  }
  if (weapon === 'bow') {
    if (skills.has('sk-126')) mods.hit += 5;
    if (skills.has('sk-127')) mods.hit += 10;
    if (skills.has('sk-128')) mods.hit += 15;
  }
  if (weapon === 'tome' || weapon === 'staff') {
    if (skills.has('sk-132')) mods.hit += 3;
    if (skills.has('sk-133')) mods.hit += 5;
    if (skills.has('sk-134')) mods.hit += 7;
    if (skills.has('sk-135')) mods.hit += 10;
  }
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
  const mods: Mods = { hit: 0, avoid: 0, crit: 0, followUpCrit: 0, damage: 0, def: 0, attack: 0, res: 0, attackSpeed: 0 };
  const { unit } = f;
  const active = new Set<SkillId>();
  if (unit.skill) active.add(unit.skill);
  for (const skill of unit.skills ?? []) active.add(skill);
  for (const skill of active) applySkill(mods, state, f, skill);
  applyClassSkills(mods, f);
  if (unit.shelteredTurn === state.turn) mods.def += 2;
  const veteranNearby = living(state, unit.side)
    .some(ally => ally.id !== unit.id && hasSkill(ally, 'veteran') && distance(ally.pos, f.pos) === 1);
  if (veteranNearby) mods.hit += 10;
  return mods;
}
