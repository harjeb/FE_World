import { CLASSES } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import type { WeaponType } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { Action, BattleEvent, BattleState, UnitState } from '../engine/types.ts';
import { seedRng } from '../engine/rng.ts';
import { generateMap } from '../maps/generate.ts';
import type { Theme } from '../maps/themes.ts';
import { tilesFromGlyphs } from '../maps/map.ts';
import { ARENA_MAPS, throneOf } from '../arena/maps.ts';
import type { ArenaMapId } from '../arena/maps.ts';
import type { SnapshotUnit } from '../arena/rules.ts';
import { expectedUnit } from '../arena/demo.ts';
import type { CharacterId } from '../data/characters.ts';
import type { UnitRecord } from './model.ts';
import { toBattleUnit } from './model.ts';
import { createEnemy, pickClasses } from './enemies.ts';
import { encounterLevel, regionById } from './calendar.ts';

export interface BattleRecord {
  id: string;
  playerId: string;
  kind: 'field' | 'arena';
  // pve/festival are lethal for ordinary units, arena/sparring are not (docs/00 §7.1, §10.4).
  mode: 'field' | 'festival' | 'arena' | 'sparring';
  name: string;
  goalText: string;
  // Random encounters remember their region so the outcome can clear it.
  region?: number;
  // Arena attacks remember which day and opponent they belong to so the result can settle.
  opponentId?: string;
  arenaDay?: number;
  // The untouched opening board, so a stored replay can be rebuilt step by step (GET_REPLAY).
  initial: BattleState;
  state: BattleState;
  events: BattleEvent[];
  actions: Action[];
  seed: string;
  createdAt: number;
  updatedAt: number;
}

const REGION_THEMES: Theme[] = ['grassland', 'forest', 'mountain', 'town', 'grassland', 'city', 'mountain', 'mountain', 'grassland', 'mountain', 'palace', 'palace'];

const ENEMY_CLASSES = Object.keys(CLASSES) as ClassId[];

// The fixed rules of a random encounter. GET_TODAY sends the same numbers, so the page and the Agent
// see them before committing the days (docs/00 §11「出征前展示胜负条件、回合截止」).
export const FIELD_BATTLE = { maxUnits: 8, turnLimit: 20, goalText: '击败敌方主将或全灭' } as const;

export interface FieldBattleOptions {
  region: number;
  cleared: number;
  seed: string;
  width?: number;
  height?: number;
}

// A random encounter (docs/00 §8.1.2): level locked from the cleared-region count before the fight.
export function createFieldBattle(units: UnitRecord[], options: FieldBattleOptions): BattleRecord {
  const region = regionById(options.region);
  const level = encounterLevel(options.cleared, region.offset, 0);
  const theme = REGION_THEMES[(options.region - 1) % REGION_THEMES.length];
  const count = Math.max(1, Math.min(FIELD_BATTLE.maxUnits, units.length));
  const map = generateMap({
    seed: `${options.seed}:map`, width: options.width ?? 20, height: options.height ?? 20,
    unitsPerSide: count, theme,
  });
  const playerUnits = units.slice(0, count).map((u, i) => toBattleUnit(u, 'player', u.id, map.spawns.player[i], { boss: i === 0 }));
  const classes = pickClasses(`${options.seed}:foes`, count, ENEMY_CLASSES);
  const enemies = classes.map((classId, i) => createEnemy(`e${i}`, {
    classId, level, pos: map.spawns.enemy[i], boss: i === 0,
    name: i === 0 ? `${region.name}守将` : undefined,
  }));
  const tiles = map.tiles;
  const state: BattleState = {
    engineVersion: 1, id: `field-${options.seed}`, kind: 'field', name: `${region.name} · 遭遇战`,
    map: { width: tiles[0].length, height: tiles.length, tiles },
    units: [...playerUnits, ...enemies], turn: 1, turnLimit: FIELD_BATTLE.turnLimit, phase: 'player',
    goal: { kind: 'boss', target: 'e0' },
    rng: seedRng(`${options.seed}:combat`), growthRng: seedRng(`${options.seed}:growth`),
  };
  return {
    id: state.id, playerId: '', kind: 'field', mode: 'field', name: state.name, region: options.region,
    goalText: FIELD_BATTLE.goalText, initial: structuredClone(state), state, events: [], actions: [], seed: options.seed,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// 大竞技场 (docs/00 §9.4): the player's squad attacks an official bracket team on an arena map.
// `round` 1–3 are the qualifiers, 4–9 the knockout rounds. Arena kind: no per-hit experience.
export function createFestivalBattle(units: UnitRecord[], round: number, seed: string): BattleRecord {
  const mapId: ArenaMapId = round <= 3 ? 'plains' : round <= 5 ? 'pass' : round <= 7 ? 'woods' : 'castle';
  const map = ARENA_MAPS[mapId];
  const level = 12 + round * 4;
  const tiles = tilesFromGlyphs(map.rows);
  const count = Math.max(1, Math.min(units.length, map.deploy));
  const playerUnits = units.slice(0, count).map((u, i) => toBattleUnit(u, 'player', u.id, map.attackerZone[i], { boss: i === 0 }));
  const classes = pickClasses(`${seed}:festival`, Math.min(map.deploy, map.defenderZone.length), ENEMY_CLASSES);
  const enemies = classes.map((classId, i) => createEnemy(`d${i}`, {
    classId, level, pos: map.defenderZone[i], boss: i === 0, name: i === 0 ? `第 ${round} 轮主将` : undefined,
  }));
  const goal: BattleState['goal'] = map.goal === 'boss' ? { kind: 'boss', target: 'd0' }
    : map.goal === 'seize' ? { kind: 'seize', throne: throneOf(map) } : { kind: 'rout' };
  const state: BattleState = {
    engineVersion: 1, id: `festival-${round}-${seed}`, kind: 'arena', name: `${map.name} · 大竞技场第 ${round} 轮`,
    map: { width: tiles[0].length, height: tiles.length, tiles },
    units: [...playerUnits, ...enemies], turn: 1, turnLimit: map.turnLimit, phase: 'player', goal,
    rng: seedRng(`${seed}:combat`), growthRng: seedRng(`${seed}:growth`),
  };
  return {
    id: state.id, playerId: '', kind: 'arena', mode: 'festival', name: state.name, goalText: map.goalText,
    initial: structuredClone(state), state, events: [], actions: [], seed, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// 陪练快照 (docs/05「练习」): official rosters the player can test a defense against.
export function sparringRoster(seed: string, size = 8): SnapshotUnit[] {
  const names = ['erin', 'karl', 'victor', 'lina', 'owen', 'sera', 'noah', 'gustav', 'ren', 'ig', 'mira', 'roland'] as CharacterId[];
  const level = 10 + (seed.length % 5);
  return names.slice(0, size).map(c => expectedUnit(c, level));
}

export interface BattleOutcome {
  winner: 'player' | 'enemy';
  reason: string;
  deaths: string[];
  survivors: string[];
}

export function summarizeOutcome(record: BattleRecord): BattleOutcome {
  const state = record.state;
  const playerUnits = state.units.filter(u => u.side === 'player');
  return {
    winner: state.result?.winner ?? 'enemy',
    reason: state.result?.reason ?? '',
    deaths: playerUnits.filter(u => !u.alive).map(u => u.id),
    survivors: playerUnits.filter(u => u.alive).map(u => u.id),
  };
}

// Weapon types a player unit actually swung, from the combat events (used for 熟练度).
export function weaponsUsed(record: BattleRecord): Map<string, Set<WeaponType>> {
  const used = new Map<string, Set<WeaponType>>();
  for (const event of record.events) {
    if (event.t !== 'combat') continue;
    for (const [id, weapon] of [[event.attacker, event.weapons[0]], [event.defender, event.weapons[1]]] as const) {
      if (!weapon) continue;
      const set = used.get(id) ?? new Set<WeaponType>();
      set.add(WEAPONS[weapon].type);
      used.set(id, set);
    }
  }
  return used;
}

export function unitsForDeployment(record: BattleRecord): UnitState[] {
  return record.state.units.filter(u => u.side === 'player');
}
