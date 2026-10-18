// 战技、法术与功能杖的目标和落点规则（docs/23、docs/27）。step.ts 用它们校验指令，actionOptions
// 用同一组函数列出可选目标，所以网页、Agent 的 GET_REACHABLE 与服务端校验不会各算各的。
import { WEAPONS } from '../data/weapons.ts';
import type { Weapon, WeaponId } from '../data/weapons.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import type { SpellbookDef } from '../data/spellbooks.ts';
import { distance, hasCurableStatus, inBounds, inRange, isSilenced, living, samePoint } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';

// 落点：从施法者原位（caster）或本次移动的落点（stand）量起，曼哈顿距离不超过 max。
// required=false 时可省略，引擎取施法者相邻的第一个空格。
export interface DestinationRule { from: 'caster' | 'stand'; max: number; required: boolean }

export type StaffEffect = 'heal' | 'cure' | 'sleep' | 'silence' | 'warp' | 'rescue';

// 这几项辅助法术不看目标 HP：墙、传送、拉近。
export const SPECIAL_SUPPORT_SPELLS: readonly string[] = ['fw_spell_9', 'fw_spell_49', 'fw_spell_56', 'fw_spell_57'];

const HOSTILE_STAVES: readonly WeaponId[] = ['sleep_staff', 'silence_staff'];

export function isHostileSpell(book: Pick<SpellbookDef, 'role'>): boolean {
  return book.role === 'attack' || book.role === 'hostile_support';
}

export function staffEffect(weapon: WeaponId): StaffEffect {
  if (weapon === 'sleep_staff') return 'sleep';
  if (weapon === 'silence_staff') return 'silence';
  if (weapon === 'warp_staff') return 'warp';
  if (weapon === 'rescue_staff') return 'rescue';
  if (weapon === 'restore') return 'cure';
  return 'heal';
}

export function spellDestination(spell: string): DestinationRule | null {
  if (spell === 'fw_spell_9') return { from: 'stand', max: 3, required: true };
  if (spell === 'fw_spell_49') return { from: 'caster', max: 5, required: true };
  if (spell === 'fw_spell_56' || spell === 'fw_spell_57') return { from: 'caster', max: 1, required: false };
  return null;
}

export function staffDestination(weapon: WeaponId): DestinationRule | null {
  if (weapon === 'warp_staff') return { from: 'caster', max: 5, required: true };
  if (weapon === 'rescue_staff') return { from: 'caster', max: 1, required: false };
  return null;
}

// 空格：地图内、没有存活单位、没有完好的墙或关着的门。
export function freeCell(state: BattleState, pos: Point): boolean {
  if (!inBounds(state, pos)) return false;
  if (living(state).some(unit => samePoint(unit.pos, pos))) return false;
  return !(state.objects ?? []).some(object => (object.kind === 'wall' && object.state === 'intact' || object.kind === 'door' && object.state === 'closed') && samePoint(object.pos, pos));
}

export function adjacentFree(state: BattleState, unit: UnitState): Point | null {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const pos: Point = [unit.pos[0] + dx, unit.pos[1] + dy];
    if (freeCell(state, pos)) return pos;
  }
  return null;
}

// 落点是否合法；不能落在施法者本次移动的落点上，否则两个单位会叠在同一格。
export function destinationValid(state: BattleState, unit: UnitState, to: Point, rule: DestinationRule, dest: Point): boolean {
  const origin = rule.from === 'stand' ? to : unit.pos;
  return freeCell(state, dest) && !samePoint(dest, to) && distance(dest, origin) <= rule.max;
}

// 省略落点时引擎采用的格子（只有 required=false 的规则才有）。
export function defaultDestination(state: BattleState, unit: UnitState, rule: DestinationRule): Point | null {
  return rule.required ? null : adjacentFree(state, unit);
}

// 所有合法落点，供网页高亮与 Agent 查询。
export function destinationCells(state: BattleState, unit: UnitState, to: Point, rule: DestinationRule): Point[] {
  const origin = rule.from === 'stand' ? to : unit.pos;
  const cells: Point[] = [];
  for (let dy = -rule.max; dy <= rule.max; dy++) {
    for (let dx = -rule.max; dx <= rule.max; dx++) {
      const cell: Point = [origin[0] + dx, origin[1] + dy];
      if (destinationValid(state, unit, to, rule, cell)) cells.push(cell);
    }
  }
  return cells;
}

const within = ([min, max]: readonly [number, number], d: number) => d >= min && d <= max;

// 战技目标：敌军，距离按战技自己的射程（不看武器射程）。
export function artTargets(state: BattleState, unit: UnitState, to: Point, art: { range: readonly [number, number] }): UnitState[] {
  return living(state).filter(target => target.side !== unit.side && within(art.range, distance(target.pos, to)));
}

// 法术目标：攻击／妨害法术打敌军，其余给友军（含自己）；治疗类要求目标受伤且未石化。
export function spellTargets(state: BattleState, unit: UnitState, to: Point, spell: string): UnitState[] {
  const book = SPELLBOOK_BY_ID.get(spell);
  const instance = unit.spellbooks?.find(row => row.id === spell);
  if (!book || !instance || instance.charges <= 0 || isSilenced(unit)) return [];
  const hostile = isHostileSpell(book);
  return living(state).filter(target => (hostile ? target.side !== unit.side : target.side === unit.side)
    && within(book.range, distance(target.pos, to))
    && (hostile || SPECIAL_SUPPORT_SPELLS.includes(book.id) || (!target.petrified && target.hp < target.stats.hp)));
}

// 杖的目标：睡眠／沉默杖打敌军，其余给其他友军；复原杖要有可解除的异常，传送／救援不看 HP。
export function staffTargets(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId): UnitState[] {
  const hostile = HOSTILE_STAVES.includes(weapon);
  const effect = staffEffect(weapon);
  return living(state).filter(target => inRange(unit, weapon, to, target.pos)
    && (hostile ? target.side !== unit.side : target.side === unit.side && target.id !== unit.id)
    && (effect !== 'cure' || hasCurableStatus(target))
    && (hostile || effect === 'cure' || effect === 'warp' || effect === 'rescue' || (!target.petrified && target.hp < target.stats.hp)));
}

// 法术书不在武器表里；交战公式按武器计算，所以施法期间临时登记一把同数值的“武器”。
export function spellWeapon(book: SpellbookDef): Weapon {
  const hostile = isHostileSpell(book);
  return {
    name: book.name, type: hostile ? 'tome' : 'staff', rank: 'E', might: book.might, hit: book.hit, weight: book.weight,
    crit: book.crit, range: book.range, maxCharges: book.maxCharges, ...(hostile ? {} : { heal: 'mag10' as const }),
  };
}

export function withSpellWeapon<T>(book: SpellbookDef, run: () => T): T {
  const id = book.id as WeaponId;
  const previous = WEAPONS[id];
  WEAPONS[id] = spellWeapon(book);
  try { return run(); } finally {
    if (previous) WEAPONS[id] = previous;
    else delete WEAPONS[id];
  }
}
