import { CHARACTERS } from '../data/characters.ts';
import type { CharacterId } from '../data/characters.ts';
import type { ClassId } from '../data/classes.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { spellBlock } from '../engine/support.ts';
import { canWield } from '../engine/units.ts';
import { withCharm } from '../data/types.ts';
import type { Rank, Stats, WeaponType } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { seedRng } from '../engine/rng.ts';
import { EngineError } from '../engine/types.ts';
import type { BattleState, Behavior, ItemStack, Point, Side, UnitState } from '../engine/types.ts';
import { seasonalMap, tilesFromGlyphs } from '../maps/map.ts';
import { ARENA_MAPS, throneOf } from './maps.ts';
import type { ArenaMap, ArenaMapId } from './maps.ts';

// One unit frozen in a month-end snapshot (docs/04, 05): it fights at full HP with these numbers.
export interface SnapshotUnit {
  id?: string;
  character: CharacterId;
  // 自捏主角的显示名与形象预设（其余角色缺省）。
  name?: string;
  sex?: 'male' | 'female';
  portrait?: CharacterId;
  personalSkill?: UnitState['skill'];
  classId: ClassId;
  level: number;
  stats: Stats;
  con: number;
  weapons: WeaponId[];
  ranks: Partial<Record<WeaponType, Rank>>;
  items: ItemStack[];
  weaponInstances?: UnitState['weaponInstances'];
  bookInstances?: UnitState['bookInstances'];
  spellbooks?: UnitState['spellbooks'];
  skills?: UnitState['skills'];
  arts?: UnitState['arts'];
  learnedSpells?: UnitState['learnedSpells'];
}

export interface DefenseSlot { unit: SnapshotUnit; pos: Point; behavior: Behavior }

// A player's defense setup (docs/05「防守设置」). slots are in priority order and hold D + B units.
export interface Defense {
  id: string;
  legion: string;
  points: number;
  record: string;
  map: ArenaMapId;
  slots: DefenseSlot[];
  // Commander and up to two backups; a banned commander is replaced by the next one.
  commanders: string[];
  // Preset bans: unit instance ids (legacy character ids still accepted).
  bans: string[];
}

export interface Reveal {
  fielded: DefenseSlot[];
  commander: string;
  // The attacker's unit/character identifiers barred by the defender's preset bans.
  barred: string[];
}

export interface AttackPlan { picks: { character: CharacterId; unitId?: string; pos: Point }[]; commander: string }

export const unitKey = (unit: Pick<SnapshotUnit, 'id' | 'character'>): string => unit.id ?? unit.character;

// References from older plans may be character keys. Resolve one unit, always preferring an exact ID.
export function resolveUnit(units: SnapshotUnit[], reference: string): SnapshotUnit | undefined {
  return units.find(u => u.id === reference) ?? units.find(u => u.character === reference);
}

function pickUnit(roster: SnapshotUnit[], pick: AttackPlan['picks'][number]): SnapshotUnit | undefined {
  return pick.unitId !== undefined ? roster.find(u => u.id === pick.unitId) : roster.find(u => u.character === pick.character);
}

const key = ([x, y]: Point) => `${x},${y}`;
const fail = (code: string, message: string): never => { throw new EngineError(code, message); };

export function canHeal(unit: SnapshotUnit): boolean {
  return unit.weapons.some(id => WEAPONS[id].heal && canWield(unit, id)
    && (unit.bookInstances?.find(row => row.id === id)?.charges ?? 1) > 0)
    || (unit.spellbooks ?? []).some(row => {
      const book = SPELLBOOK_BY_ID.get(row.id);
      return row.charges > 0 && book?.role === 'heal' && !spellBlock(unit, book);
    });
}

export function arenaMap(defense: Defense): ArenaMap {
  return ARENA_MAPS[defense.map];
}

// Portraits are display data. Only snapshots predating instance IDs use them for legacy uniqueness checks.
export function unitLook(unit: Pick<SnapshotUnit, 'character' | 'portrait'>): CharacterId {
  return unit.portrait ?? unit.character;
}

export function validateDefense(defense: Defense): string[] {
  const map = arenaMap(defense);
  const errors: string[] = [];
  const zone = new Set(map.defenderZone.map(key));
  const characters = defense.slots.map(s => unitKey(s.unit));
  if (defense.slots.length !== map.deploy + map.bans) errors.push(`防守名单必须是 ${map.deploy + map.bans} 人`);
  if (new Set(characters).size !== characters.length) errors.push('同一角色不能重复上场');
  const looks = defense.slots.map(s => s.unit.id ?? unitLook(s.unit));
  if (new Set(looks).size !== looks.length) errors.push('同一形象不能重复上场');
  const spots = defense.slots.map(s => key(s.pos));
  if (spots.some(s => !zone.has(s))) errors.push('站位必须在防守出生区内');
  if (new Set(spots).size !== spots.length) errors.push('站位不能重复');
  for (const slot of defense.slots) {
    if (slot.behavior === 'healer' && !canHeal(slot.unit)) errors.push(`${slot.unit.name ?? CHARACTERS[slot.unit.character].name} 不能治疗，不能设为治疗优先`);
  }
  const commanders = defense.commanders.map(c => resolveUnit(defense.slots.map(s => s.unit), c));
  if (defense.commanders.length < 1 || defense.commanders.length > 3 || commanders.some(c => !c)) {
    errors.push('主将与备选必须是防守名单中的 1–3 人');
  }
  if (new Set(commanders).size !== commanders.length) errors.push('主将与备选不能是同一人');
  if (defense.bans.length > map.bans) errors.push(`预设禁用最多 ${map.bans} 个角色`);
  const slotIds = new Set(defense.slots.flatMap(s => [s.unit.id, s.unit.character]));
  const banKeys = defense.bans.map(c => {
    const unit = resolveUnit(defense.slots.map(s => s.unit), c);
    return unit ? unitKey(unit) : c;
  });
  if (new Set(banKeys).size !== banKeys.length || defense.bans.some(c => !slotIds.has(c) && !(c in CHARACTERS))) errors.push('预设禁用的单位不能重复');
  return errors;
}

// What the attacker may see before banning: full stats and gear, never positions, AI or priority,
// so the list is ordered by level rather than by the defender's priority.
export function opponentList(defense: Defense): SnapshotUnit[] {
  const order = Object.keys(CHARACTERS);
  return defense.slots.map(s => s.unit)
    .sort((a, b) => b.level - a.level || order.indexOf(a.character) - order.indexOf(b.character));
}

// Bans take B units off the list; the first D of the rest, by priority, fight (docs/05).
export function applyBans(defense: Defense, bans: string[], roster: SnapshotUnit[]): Reveal {
  const map = arenaMap(defense);
  const units = defense.slots.map(s => s.unit);
  const banned = bans.map(c => resolveUnit(units, c));
  if (bans.length !== map.bans || new Set(banned).size !== banned.length || banned.some(u => !u)) {
    fail('ARENA_BAN_INVALID', `需要从防守名单中禁用 ${map.bans} 个不同单位`);
  }
  const fielded = defense.slots.filter(s => !banned.includes(s.unit)).slice(0, map.deploy);
  const lead = defense.commanders.map(c => resolveUnit(units, c)).find(u => fielded.some(s => s.unit === u));
  const commander = unitKey(lead ?? fielded[0].unit);
  return { fielded, commander, barred: defense.bans.filter(c => !!resolveUnit(roster, c)) };
}

export function validateAttack(defense: Defense, reveal: Reveal, roster: SnapshotUnit[], plan: AttackPlan): string[] {
  const map = arenaMap(defense);
  const errors: string[] = [];
  const zone = new Set(map.attackerZone.map(key));
  const barred = reveal.barred.map(c => resolveUnit(roster, c));
  const allowedUnits = roster.filter(u => !barred.includes(u));
  const need = Math.min(map.deploy, new Set(allowedUnits.map(u => u.id ?? unitLook(u))).size);
  const picked = plan.picks.map(p => pickUnit(roster, p));
  if (picked.length !== need) errors.push(`需要出战 ${need} 人`);
  const chosen = picked.filter((u): u is SnapshotUnit => !!u);
  if (new Set(chosen.map(unitKey)).size !== chosen.length) errors.push('同一角色只能出战一次');
  const looks = chosen.map(u => u.id ?? unitLook(u));
  if (new Set(looks).size !== looks.length) errors.push('同一形象只能有一名角色上场');
  for (const unit of picked) {
    if (!unit) errors.push('单位不在快照名册中');
    else if (barred.includes(unit)) errors.push(`${unit.name ?? CHARACTERS[unit.character].name} 被防守方禁用`);
  }
  const spots = plan.picks.map(p => key(p.pos));
  if (spots.some(s => !zone.has(s))) errors.push('站位必须在进攻出生区内');
  if (new Set(spots).size !== spots.length) errors.push('站位不能重复');
  if (!resolveUnit(chosen, plan.commander)) errors.push('主将必须是出战人员之一');
  return errors;
}

function fromSnapshot(snap: SnapshotUnit, side: Side, id: string, pos: Point, extra: Partial<UnitState>): UnitState {
  const character = CHARACTERS[snap.character];
  return {
    id, name: snap.name ?? character.name, side, character: snap.character, portrait: snap.portrait, classId: snap.classId,
    level: snap.level, exp: 0, stats: withCharm(snap.stats), con: snap.con, hp: snap.stats.hp,
    pos: [pos[0], pos[1]], weapons: [...snap.weapons], items: snap.items.map(i => ({ ...i })), ranks: { ...snap.ranks },
    weaponInstances: snap.weaponInstances?.map(row => ({ ...row })),
    bookInstances: snap.bookInstances?.map(row => ({ ...row })),
    spellbooks: snap.spellbooks?.map(row => ({ ...row })),
    skills: snap.skills ? [...snap.skills] : undefined, arts: snap.arts ? [...snap.arts] : undefined,
    learnedSpells: snap.learnedSpells ? [...snap.learnedSpells] : undefined,
    skill: snap.personalSkill ?? character.skill, acted: false, alive: true, ...extra,
  };
}

export const defenderId = (identity: string) => `d-${identity}`;

// Builds the battle: attacker = player side and moves first, defender units run the rule AI with
// the behaviors from the defense setup. Arena battles give no experience.
export function createArenaBattle(defense: Defense, bans: string[], roster: SnapshotUnit[], plan: AttackPlan, seed: string, season = 1): BattleState {
  const map = arenaMap(defense);
  const reveal = applyBans(defense, bans, roster);
  const errors = validateAttack(defense, reveal, roster, plan);
  if (errors.length > 0) fail('ARENA_PLAN_INVALID', errors.join('；'));
  const tiles = tilesFromGlyphs(map.rows);
  const picked = plan.picks.map(p => pickUnit(roster, p)!);
  const leader = resolveUnit(picked, plan.commander);
  const attackers = plan.picks.map((p, index) => {
    const snap = picked[index];
    return fromSnapshot(snap, 'player', unitKey(snap), p.pos,
    { boss: snap === leader });
  });
  const defenders = reveal.fielded.map(s => fromSnapshot(s.unit, 'enemy', defenderId(unitKey(s.unit)), s.pos,
    { boss: unitKey(s.unit) === reveal.commander, behavior: s.behavior }));
  return {
    engineVersion: 1,
    id: `arena-${defense.id}-${seed}`,
    kind: 'arena',
    name: map.name,
    map: seasonalMap(tiles, season),
    units: [...attackers, ...defenders],
    turn: 1,
    turnLimit: map.turnLimit,
    phase: 'player',
    goal: map.goal === 'boss' ? { kind: 'boss', target: defenderId(reveal.commander) }
      : map.goal === 'seize' ? { kind: 'seize', throne: throneOf(map) } : { kind: 'rout' },
    rng: seedRng(`${seed}:combat`),
    growthRng: seedRng(`${seed}:growth`),
  };
}

// The defense alone on its map (every listed unit, no attackers), for previewing AI behavior areas.
export function defenseBoard(defense: Defense): BattleState {
  const map = arenaMap(defense);
  const tiles = tilesFromGlyphs(map.rows);
  return {
    engineVersion: 1, id: `defense-${defense.id}`, kind: 'arena', name: map.name,
    map: { width: tiles[0].length, height: tiles.length, tiles },
    units: defense.slots.map(s => fromSnapshot(s.unit, 'enemy', defenderId(unitKey(s.unit)), s.pos, { behavior: s.behavior })),
    turn: 1, turnLimit: map.turnLimit, phase: 'enemy', goal: { kind: 'rout' },
    rng: seedRng('preview'), growthRng: seedRng('preview'),
  };
}

// docs/05「积分」: win +20, no unit lost +5, won within half the turn limit +5; anything else 0.
export function arenaPoints(state: BattleState): { total: number; win: number; flawless: number; swift: number } {
  if (state.result?.winner !== 'player') return { total: 0, win: 0, flawless: 0, swift: 0 };
  const flawless = state.units.every(u => u.side !== 'player' || u.alive) ? 5 : 0;
  const swift = state.turn <= Math.floor(state.turnLimit / 2) ? 5 : 0;
  return { total: 20 + flawless + swift, win: 20, flawless, swift };
}
