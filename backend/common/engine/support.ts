// 战技、法术与功能杖的目标和落点规则（docs/23、docs/27）。step.ts 用它们校验指令，actionOptions
// 用同一组函数列出可选目标，所以网页、Agent 的 GET_REACHABLE 与服务端校验不会各算各的。
import { CLASSES } from '../data/classes.ts';
import { rankAtLeast } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { Weapon, WeaponId } from '../data/weapons.ts';
import { MOVEMENT, TERRAINS } from '../maps/map.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import type { SpellbookDef } from '../data/spellbooks.ts';
import { legalArtTarget } from './arts.ts';
import type { WeaponArt } from '../data/weapon-arts.ts';
import { attackWeapons, distance, hasCurableStatus, inBounds, inRange, isSilenced, living, samePoint } from './units.ts';
import type { BattleState, Point, UnitState } from './types.ts';
import { spellRange } from './spells.ts';

// 落点：从施法者原位（caster）或本次移动的落点（stand）量起，曼哈顿距离不超过 max。
// required=false 时可省略，引擎取施法者相邻的第一个空格。wall=true 的落点另按临时墙规则过滤。
export interface DestinationRule { from: 'caster' | 'stand'; max: number; required: boolean; wall?: boolean }

export type StaffEffect = 'heal' | 'cure' | 'sleep' | 'silence' | 'warp' | 'rescue';

// 法术按效果分流：攻击走交战，status 是敌方控场，其余都给友军。
export type SpellKind = 'attack' | 'status' | 'heal' | 'wall' | 'cure' | 'warp' | 'rescue' | 'regen' | 'buff' | 'vision';

// 彷徨之壁：每名施法者同时最多 2 面，持续到施放后第 3 个己方阶段开始前。
export const WALL_LIMIT = 2;

const HOSTILE_STAVES: readonly WeaponId[] = ['sleep_staff', 'silence_staff'];

export function isHostileSpell(book: Pick<SpellbookDef, 'role'>): boolean {
  return book.role === 'attack' || book.role === 'hostile_support';
}

export function spellKind(book: SpellbookDef): SpellKind {
  if (book.role === 'attack') return 'attack';
  if (book.role === 'hostile_support') return 'status';
  if (book.role === 'heal') return 'heal';
  if (book.id === 'fw_spell_9') return 'wall';
  if (book.id === 'fw_spell_22') return 'cure';
  if (book.id === 'fw_spell_49') return 'warp';
  if (book.id === 'fw_spell_56' || book.id === 'fw_spell_57') return 'rescue';
  if (book.id === 'fw_spell_58') return 'regen';
  return book.effects.buff ? 'buff' : 'vision';
}

// 施放资格：黑／暗魔法要求现职业有 理 权限，白魔法要求 杖 权限，熟练度达到书的级别；限量教材法术还须已学会。
export function spellBlock(unit: Pick<UnitState, 'classId' | 'ranks' | 'learnedSpells'>, book: SpellbookDef): string | null {
  const type = book.study === 'whiteMagic' ? 'staff' : 'tome';
  const school = book.study === 'whiteMagic' ? '白魔法' : '黑魔法';
  if (CLASSES[unit.classId].weapons[type] === undefined) return `现职业没有${school}权限`;
  if (!rankAtLeast(unit.ranks[type], book.rank)) return `${school}需要 ${type === 'staff' ? '杖' : '理'} ${book.rank} 级（现在 ${unit.ranks[type] ?? '无'}）`;
  if (book.effects.manual && !unit.learnedSpells?.includes(book.id)) return '需要先用对应教材学会';
  return null;
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
  if (spell === 'fw_spell_9') return { from: 'stand', max: 3, required: true, wall: true };
  if (spell === 'fw_spell_49') return { from: 'caster', max: 5, required: true };
  if (spell === 'fw_spell_56' || spell === 'fw_spell_57') return { from: 'caster', max: 1, required: false };
  return null;
}

export function staffDestination(weapon: WeaponId): DestinationRule | null {
  if (weapon === 'warp_staff') return { from: 'caster', max: 4, required: true };
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

// 胜利目标所在格：出口、王座与地上的物资箱。
function objectiveCells(state: BattleState): Point[] {
  const goal = state.goal;
  return [...(goal.kind === 'escape' || goal.kind === 'gather' || goal.kind === 'escort' ? goal.exits : []),
    ...(goal.kind === 'seize' ? [goal.throne] : []), ...(state.boxes ?? [])];
}

// 尚未触发的增援出生格。
function pendingSpawnCells(state: BattleState): Point[] {
  const fired = new Set(state.scenario?.fired ?? []);
  return (state.scenario?.events ?? []).filter(event => !fired.has(event.id))
    .flatMap(event => event.actions.flatMap(action => action.kind === 'spawn' ? action.units.map(unit => unit.pos) : []));
}

// 我方能走到任一目标格的单位（不计单位阻挡；关着的门可打开，完好的墙与 blocked 格不可通过）。
function unitsReachingObjective(state: BattleState, blocked: Point | null): Set<string> {
  const marks = objectiveCells(state);
  const reached = new Set<string>();
  const movers = living(state, 'player').filter(unit => !unit.petrified);
  for (const move of new Set(movers.map(unit => CLASSES[unit.classId].moveType))) {
    const index = MOVEMENT[move].index, seen = new Set<string>(), queue: Point[] = [];
    const open = ([x, y]: Point) => inBounds(state, [x, y]) && TERRAINS[state.map.tiles[y][x]].costs[index] !== null
      && !(blocked && blocked[0] === x && blocked[1] === y)
      && !(state.objects ?? []).some(object => object.kind === 'wall' && object.state === 'intact' && samePoint(object.pos, [x, y]));
    for (const mark of marks) if (open(mark)) { seen.add(mark.join(',')); queue.push(mark); }
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      for (const next of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Point[]) {
        if (!seen.has(next.join(',')) && open(next)) { seen.add(next.join(',')); queue.push(next); }
      }
    }
    for (const unit of movers) if (CLASSES[unit.classId].moveType === move && seen.has(unit.pos.join(','))) reached.add(unit.id);
  }
  return reached;
}

// 临时墙不得放在物件、出口、王座、物资箱或增援出生格上，也不能让原本能走到目标的我方单位被这面墙堵死。
// `before` 是放墙前能走到目标的单位；列举多个落点时只算一次。
function wallCellAllowed(state: BattleState, cell: Point, before: () => Set<string>): boolean {
  if ((state.objects ?? []).some(object => samePoint(object.pos, cell))) return false;
  if ([...objectiveCells(state), ...pendingSpawnCells(state)].some(point => samePoint(point, cell))) return false;
  if (objectiveCells(state).length === 0) return true;
  const after = unitsReachingObjective(state, cell);
  return [...before()].every(id => after.has(id));
}

// 施法者本次移动离开的原位也算空格；判断通路时把施法者放在落点。
function standing(state: BattleState, unit: UnitState, to: Point): BattleState {
  return { ...state, units: state.units.map(u => u.id === unit.id ? { ...u, pos: to } : u) };
}

function lazy<T>(make: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= make());
}

// 落点是否合法；不能落在施法者本次移动的落点上，否则两个单位会叠在同一格。
export function destinationValid(state: BattleState, unit: UnitState, to: Point, rule: DestinationRule, dest: Point,
  reach?: () => Set<string>): boolean {
  const origin = rule.from === 'stand' ? to : unit.pos;
  if (!freeCell(state, dest) || samePoint(dest, to) || distance(dest, origin) > rule.max) return false;
  if (!rule.wall) return true;
  const moved = standing(state, unit, to);
  return wallCellAllowed(moved, dest, reach ?? lazy(() => unitsReachingObjective(moved, null)));
}

// 省略落点时引擎采用的格子（只有 required=false 的规则才有）。
export function defaultDestination(state: BattleState, unit: UnitState, rule: DestinationRule): Point | null {
  return rule.required ? null : adjacentFree(state, unit);
}

// 所有合法落点，供网页高亮与 Agent 查询。
export function destinationCells(state: BattleState, unit: UnitState, to: Point, rule: DestinationRule): Point[] {
  const origin = rule.from === 'stand' ? to : unit.pos;
  const reach = lazy(() => unitsReachingObjective(standing(state, unit, to), null));
  const cells: Point[] = [];
  for (let dy = -rule.max; dy <= rule.max; dy++) {
    for (let dx = -rule.max; dx <= rule.max; dx++) {
      const cell: Point = [origin[0] + dx, origin[1] + dy];
      if (destinationValid(state, unit, to, rule, cell, reach)) cells.push(cell);
    }
  }
  return cells;
}

const within = ([min, max]: readonly [number, number], d: number) => d >= min && d <= max;

// 原创战技射程与武器取交集，列表与实际提交复用同一条件。
export function artTargets(state: BattleState, unit: UnitState, to: Point, art: WeaponArt, weapon?: WeaponId): UnitState[] {
  return living(state).filter(target => (weapon ? [weapon] : attackWeapons(unit))
    .some(id => legalArtTarget(state, unit, to, id, art, target)));
}

// 传送／救援不带走护送 NPC 或正在搬运物资箱的单位，避免绕过任务目标。
function movable(target: UnitState): boolean {
  return !target.npc && !target.petrified && !(target.carried ?? 0);
}

// 已经处于同名状态的目标不再重复施加（同名取较强，不叠加）。
export function hasStatus(target: UnitState, status: 'sleep' | 'silence' | 'root'): boolean {
  if (status === 'sleep') return !!target.statuses?.sleep;
  if (status === 'silence') return isSilenced(target);
  return !!target.artEffects?.statuses?.includes('root');
}

// 法术目标：攻击／控场打敌军，其余给友军。治疗要求目标受伤；范围治疗任选一名受伤友军作为锚点。
export function spellTargets(state: BattleState, unit: UnitState, to: Point, spell: string): UnitState[] {
  const book = SPELLBOOK_BY_ID.get(spell);
  const instance = unit.spellbooks?.find(row => row.id === spell);
  if (!book || !instance || instance.charges <= 0 || isSilenced(unit) || spellBlock(unit, book)) return [];
  const kind = spellKind(book);
  if (kind === 'vision') return [];
  if (kind === 'wall' && (state.objects ?? []).filter(object => object.owner === unit.id && object.kind === 'wall' && object.state === 'intact').length >= WALL_LIMIT) return [];
  const hostile = isHostileSpell(book);
  return living(state).filter(target => (hostile ? target.side !== unit.side : target.side === unit.side)
    && target.id !== unit.id && within(spellRange(unit, book), distance(target.pos, to))
    && (kind !== 'status' || !target.immunities?.includes(book.effects.status!) && !hasStatus(target, book.effects.status!))
    && (kind !== 'heal' || !target.petrified && !target.immunities?.includes('healing') && target.hp < target.stats.hp)
    && (kind !== 'cure' || hasCurableStatus(target))
    && (kind !== 'regen' || !target.petrified && !target.immunities?.includes('healing') && !target.statuses?.regen)
    && (kind !== 'warp' && kind !== 'rescue' || movable(target)));
}

// 杖的目标：睡眠／沉默杖打敌军，其余给其他友军；复原杖要有可解除的异常，传送／救援不看 HP。
export function staffTargets(state: BattleState, unit: UnitState, to: Point, weapon: WeaponId): UnitState[] {
  const hostile = HOSTILE_STAVES.includes(weapon);
  const effect = staffEffect(weapon);
  return living(state).filter(target => inRange(unit, weapon, to, target.pos)
    && (hostile ? target.side !== unit.side : target.side === unit.side && target.id !== unit.id)
    && (effect !== 'cure' || hasCurableStatus(target))
    && (!hostile || !target.immunities?.includes(effect as 'sleep' | 'silence') && !hasStatus(target, effect as 'sleep' | 'silence'))
    && (effect !== 'warp' && effect !== 'rescue' || movable(target))
    && (hostile || effect === 'cure' || effect === 'warp' || effect === 'rescue' || (!target.petrified && target.hp < target.stats.hp)));
}

// 法术书不在武器表里；交战公式按武器计算，所以施法期间临时登记一把同数值的“武器”。
export function spellWeapon(book: SpellbookDef): Weapon {
  const hostile = isHostileSpell(book), e = book.effects;
  const moves = (e.effective ?? []).filter(tag => tag === 'flying' || tag === 'mounted' || tag === 'armored');
  const routes = (e.effective ?? []).filter(tag => tag === 'beast' || tag === 'dragon');
  const tags = (e.effective ?? []).filter(tag => tag === 'demon');
  return {
    name: book.name, type: hostile ? 'tome' : 'staff', proficiencyType: book.study === 'whiteMagic' ? 'staff' : 'tome', rank: book.rank, might: book.might, hit: book.hit, weight: book.weight,
    crit: book.crit, range: book.range, maxCharges: book.maxCharges,
    ...(hostile ? {
      ...(book.defense === 'def' ? { defense: 'def' as const } : {}),
      ...(book.fixedHits > 1 ? { hits: book.fixedHits } : {}), ...(!book.followUp ? { noFollowUp: true } : {}),
      ...(moves.length ? { effective: moves as ('flying' | 'mounted' | 'armored')[] } : {}),
      ...(routes.length ? { effectiveRoutes: routes as ('beast' | 'dragon')[] } : {}), ...(tags.length ? { effectiveTags: tags as 'demon'[] } : {}),
      ...(e.drain ? { drain: e.drain } : {}), ...(e.onHit ? { onHit: e.onHit } : {}), ...(e.ignoreRes ? { ignoreRes: true } : {}),
    } : { heal: 'mag10' as const, healBase: book.healingBase ?? 10, ...(e.area ? { area: true } : {}) }),
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
