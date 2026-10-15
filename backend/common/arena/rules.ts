import { CHARACTERS } from '../data/characters.ts';
import type { CharacterId } from '../data/characters.ts';
import { CLASSES } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import { rankAtLeast } from '../data/types.ts';
import type { Rank, Stats, WeaponType } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { seedRng } from '../engine/rng.ts';
import { EngineError } from '../engine/types.ts';
import type { BattleState, Behavior, ItemStack, Point, Side, UnitState } from '../engine/types.ts';
import { tilesFromGlyphs } from '../maps/map.ts';
import { ARENA_MAPS } from './maps.ts';
import type { ArenaMap, ArenaMapId } from './maps.ts';

// One unit frozen in a month-end snapshot (docs/04, 05): it fights at full HP with these numbers.
export interface SnapshotUnit {
  character: CharacterId;
  classId: ClassId;
  level: number;
  stats: Stats;
  con: number;
  weapons: WeaponId[];
  ranks: Partial<Record<WeaponType, Rank>>;
  items: ItemStack[];
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
  // Preset bans: character names the attacker may not field.
  bans: CharacterId[];
}

export interface Reveal {
  fielded: DefenseSlot[];
  commander: CharacterId;
  // The attacker's characters barred by the defender's preset bans.
  barred: CharacterId[];
}

export interface AttackPlan { picks: { character: CharacterId; pos: Point }[]; commander: CharacterId }

const key = ([x, y]: Point) => `${x},${y}`;
const fail = (code: string, message: string): never => { throw new EngineError(code, message); };

function canUseStaff(unit: SnapshotUnit): boolean {
  return unit.weapons.some(id => WEAPONS[id].type === 'staff'
    && CLASSES[unit.classId].weapons.staff !== undefined && rankAtLeast(unit.ranks.staff, WEAPONS[id].rank));
}

export function arenaMap(defense: Defense): ArenaMap {
  return ARENA_MAPS[defense.map];
}

export function validateDefense(defense: Defense): string[] {
  const map = arenaMap(defense);
  const errors: string[] = [];
  const zone = new Set(map.defenderZone.map(key));
  const characters = defense.slots.map(s => s.unit.character);
  if (defense.slots.length !== map.deploy + map.bans) errors.push(`防守名单必须是 ${map.deploy + map.bans} 人`);
  if (new Set(characters).size !== characters.length) errors.push('同一角色不能重复上场');
  const spots = defense.slots.map(s => key(s.pos));
  if (spots.some(s => !zone.has(s))) errors.push('站位必须在防守出生区内');
  if (new Set(spots).size !== spots.length) errors.push('站位不能重复');
  for (const slot of defense.slots) {
    if (slot.behavior === 'healer' && !canUseStaff(slot.unit)) errors.push(`${CHARACTERS[slot.unit.character].name} 不会用杖，不能设为治疗优先`);
  }
  if (defense.commanders.length < 1 || defense.commanders.length > 3 || defense.commanders.some(c => !characters.includes(c))) {
    errors.push('主将与备选必须是防守名单中的 1–3 人');
  }
  if (defense.bans.length > map.bans) errors.push(`预设禁用最多 ${map.bans} 个角色`);
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
export function applyBans(defense: Defense, bans: CharacterId[], roster: SnapshotUnit[]): Reveal {
  const map = arenaMap(defense);
  const listed = defense.slots.map(s => s.unit.character);
  if (bans.length !== map.bans || new Set(bans).size !== bans.length || bans.some(c => !listed.includes(c))) {
    fail('ARENA_BAN_INVALID', `需要从防守名单中禁用 ${map.bans} 个不同角色`);
  }
  const fielded = defense.slots.filter(s => !bans.includes(s.unit.character)).slice(0, map.deploy);
  const onField = fielded.map(s => s.unit.character);
  const commander = defense.commanders.find(c => onField.includes(c)) ?? onField[0];
  const mine = roster.map(u => u.character);
  return { fielded, commander, barred: defense.bans.filter(c => mine.includes(c)) };
}

export function validateAttack(defense: Defense, reveal: Reveal, roster: SnapshotUnit[], plan: AttackPlan): string[] {
  const map = arenaMap(defense);
  const errors: string[] = [];
  const zone = new Set(map.attackerZone.map(key));
  const allowed = roster.filter(u => !reveal.barred.includes(u.character)).map(u => u.character);
  const need = Math.min(map.deploy, allowed.length);
  const chosen = plan.picks.map(p => p.character);
  if (chosen.length !== need) errors.push(`需要出战 ${need} 人`);
  if (new Set(chosen).size !== chosen.length) errors.push('同一角色只能出战一次');
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
    id, name: character.name, side, character: snap.character, classId: snap.classId,
    level: snap.level, exp: 0, stats: { ...snap.stats }, con: snap.con, hp: snap.stats.hp,
    pos: [pos[0], pos[1]], weapons: [...snap.weapons], items: snap.items.map(i => ({ ...i })), ranks: { ...snap.ranks },
    skill: character.skill, acted: false, alive: true, ...extra,
  };
}

export const defenderId = (character: CharacterId) => `d-${character}`;

// Builds the battle: attacker = player side and moves first, defender units run the rule AI with
// the behaviors from the defense setup. Arena battles give no experience.
export function createArenaBattle(defense: Defense, bans: CharacterId[], roster: SnapshotUnit[], plan: AttackPlan, seed: string): BattleState {
  const map = arenaMap(defense);
  const reveal = applyBans(defense, bans, roster);
  const errors = validateAttack(defense, reveal, roster, plan);
  if (errors.length > 0) fail('ARENA_PLAN_INVALID', errors.join('；'));
  const tiles = tilesFromGlyphs(map.rows);
  const attackers = plan.picks.map(p => fromSnapshot(roster.find(u => u.character === p.character)!, 'player', p.character, p.pos,
    { boss: p.character === plan.commander }));
  const defenders = reveal.fielded.map(s => fromSnapshot(s.unit, 'enemy', defenderId(s.unit.character), s.pos,
    { boss: s.unit.character === reveal.commander, behavior: s.behavior }));
  return {
    engineVersion: 1,
    id: `arena-${defense.id}-${seed}`,
    kind: 'arena',
    name: map.name,
    map: { width: tiles[0].length, height: tiles.length, tiles },
    units: [...attackers, ...defenders],
    turn: 1,
    turnLimit: map.turnLimit,
    phase: 'player',
    goal: map.goal === 'boss' ? { kind: 'boss', target: defenderId(reveal.commander) } : { kind: 'rout' },
    rng: seedRng(`${seed}:combat`),
    growthRng: seedRng(`${seed}:growth`),
  };
}

// docs/05「积分」: win +20, no unit lost +5, won within half the turn limit +5; anything else 0.
export function arenaPoints(state: BattleState): { total: number; win: number; flawless: number; swift: number } {
  if (state.result?.winner !== 'player') return { total: 0, win: 0, flawless: 0, swift: 0 };
  const flawless = state.units.every(u => u.side !== 'player' || u.alive) ? 5 : 0;
  const swift = state.turn <= Math.floor(state.turnLimit / 2) ? 5 : 0;
  return { total: 20 + flawless + swift, win: 20, flawless, swift };
}
