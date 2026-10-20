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
  commanders: CharacterId[];
  // Preset bans: unit instance ids (legacy character ids still accepted).
  bans: string[];
}

export interface Reveal {
  fielded: DefenseSlot[];
  commander: CharacterId;
  // The attacker's unit/character identifiers barred by the defender's preset bans.
  barred: string[];
}

export interface AttackPlan { picks: { character: CharacterId; unitId?: string; pos: Point }[]; commander: CharacterId }

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

// 玩家看到的是头像；自捏主角可以把形象预设换成另一个角色，所以“同一形象”按 portrait 判断，
// 不能只看 character 锚点。
export function unitLook(unit: Pick<SnapshotUnit, 'character' | 'portrait'>): CharacterId {
  return unit.portrait ?? unit.character;
}

export function validateDefense(defense: Defense): string[] {
  const map = arenaMap(defense);
  const errors: string[] = [];
  const zone = new Set(map.defenderZone.map(key));
  const characters = defense.slots.map(s => s.unit.character);
  if (defense.slots.length !== map.deploy + map.bans) errors.push(`防守名单必须是 ${map.deploy + map.bans} 人`);
  if (new Set(characters).size !== characters.length) errors.push('同一角色不能重复上场');
  const looks = defense.slots.map(s => unitLook(s.unit));
  if (new Set(looks).size !== looks.length) errors.push('同一形象不能重复上场');
  const spots = defense.slots.map(s => key(s.pos));
  if (spots.some(s => !zone.has(s))) errors.push('站位必须在防守出生区内');
  if (new Set(spots).size !== spots.length) errors.push('站位不能重复');
  for (const slot of defense.slots) {
    if (slot.behavior === 'healer' && !canHeal(slot.unit)) errors.push(`${slot.unit.name ?? CHARACTERS[slot.unit.character].name} 不能治疗，不能设为治疗优先`);
  }
  if (defense.commanders.length < 1 || defense.commanders.length > 3 || defense.commanders.some(c => !characters.includes(c))) {
    errors.push('主将与备选必须是防守名单中的 1–3 人');
  }
  if (new Set(defense.commanders).size !== defense.commanders.length) errors.push('主将与备选不能是同一人');
  if (defense.bans.length > map.bans) errors.push(`预设禁用最多 ${map.bans} 个角色`);
  const slotIds = new Set(defense.slots.flatMap(s => [s.unit.id, s.unit.character]));
  if (new Set(defense.bans).size !== defense.bans.length || defense.bans.some(c => !slotIds.has(c) && !(c in CHARACTERS))) errors.push('预设禁用的单位不能重复');
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
  const listed = new Set(defense.slots.flatMap(s => [s.unit.id, s.unit.character]));
  if (bans.length !== map.bans || new Set(bans).size !== bans.length || bans.some(c => !listed.has(c))) {
    fail('ARENA_BAN_INVALID', `需要从防守名单中禁用 ${map.bans} 个不同单位`);
  }
  const fielded = defense.slots.filter(s => !bans.includes(s.unit.id ?? s.unit.character) && !bans.includes(s.unit.character)).slice(0, map.deploy);
  const onField = fielded.map(s => s.unit.character);
  const commander = defense.commanders.find(c => onField.includes(c)) ?? onField[0];
  return { fielded, commander, barred: defense.bans.filter(c => roster.some(u => u.id === c || u.character === c)) };
}

export function validateAttack(defense: Defense, reveal: Reveal, roster: SnapshotUnit[], plan: AttackPlan): string[] {
  const map = arenaMap(defense);
  const errors: string[] = [];
  const zone = new Set(map.attackerZone.map(key));
  const allowedUnits = roster.filter(u => !reveal.barred.includes(u.id ?? u.character) && !reveal.barred.includes(u.character));
  const allowed = allowedUnits.map(u => u.character);
  // 同一形象只能上一人：名额也按可用形象数封顶，否则重名头像会让玩家永远凑不满。
  const need = Math.min(map.deploy, new Set(allowedUnits.map(unitLook)).size);
  const chosen = plan.picks.map(p => p.character);
  if (chosen.length !== need) errors.push(`需要出战 ${need} 人`);
  if (new Set(chosen).size !== chosen.length) errors.push('同一角色只能出战一次');
  // 同形象的两个单位实例（例如自捏主角与同头像的固定人物）不能同时上场。
  const picked = plan.picks.map(p => roster.find(u => (p.unitId !== undefined && u.id === p.unitId) || u.character === p.character));
  const picksLooks = picked.filter((u): u is SnapshotUnit => !!u).map(unitLook);
  if (new Set(picksLooks).size !== picksLooks.length) errors.push('同一形象只能有一名角色上场');
  for (const c of chosen) {
    if (reveal.barred.includes(c)) errors.push(`${CHARACTERS[c].name} 被防守方禁用`);
    else if (!allowed.includes(c)) errors.push(`${c} 不在快照名册中`);
  }
  const spots = plan.picks.map(p => key(p.pos));
  if (spots.some(s => !zone.has(s))) errors.push('站位必须在进攻出生区内');
  if (new Set(spots).size !== spots.length) errors.push('站位不能重复');
  if (!chosen.includes(plan.commander)) errors.push('主将必须是出战人员之一');
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

export const defenderId = (character: CharacterId) => `d-${character}`;

// Builds the battle: attacker = player side and moves first, defender units run the rule AI with
// the behaviors from the defense setup. Arena battles give no experience.
export function createArenaBattle(defense: Defense, bans: string[], roster: SnapshotUnit[], plan: AttackPlan, seed: string, season = 1): BattleState {
  const map = arenaMap(defense);
  const reveal = applyBans(defense, bans, roster);
  const errors = validateAttack(defense, reveal, roster, plan);
  if (errors.length > 0) fail('ARENA_PLAN_INVALID', errors.join('；'));
  const tiles = tilesFromGlyphs(map.rows);
  const attackers = plan.picks.map(p => {
    const snap = roster.find(u => (p.unitId !== undefined && u.id === p.unitId) || u.character === p.character)!;
    return fromSnapshot(snap, 'player', p.unitId ?? p.character, p.pos,
    { boss: p.character === plan.commander });
  });
  const defenders = reveal.fielded.map(s => fromSnapshot(s.unit, 'enemy', defenderId(s.unit.character), s.pos,
    { boss: s.unit.character === reveal.commander, behavior: s.behavior }));
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
    units: defense.slots.map(s => fromSnapshot(s.unit, 'enemy', defenderId(s.unit.character), s.pos, { behavior: s.behavior })),
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
