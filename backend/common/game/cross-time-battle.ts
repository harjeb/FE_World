import type { BattleRecord } from './battles.ts';
import { createCrossTimeGroups } from '../engine/cross-time-groups.ts';
import type { AiDifficulty, BattleState, Point } from '../engine/types.ts';
import { seedRng } from '../engine/rng.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { WeaponId } from '../data/weapons.ts';
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import { seasonalMap } from '../maps/map.ts';
import { classicMap } from './classic-catalog.ts';
import { classicAdaptation } from './classic-adaptation.ts';
import { dateOf } from './calendar.ts';
import { toBattleUnit, weaponMax, type UnitRecord } from './model.ts';
import { CATALOG_VERSION, RULESET_VERSION } from './version.ts';
import { CROSS_TIME_ROSTER, CROSS_TIME_MAP_ID, CROSS_TIME_QUEST_ID, CROSS_TIME_DAYS, CROSS_TIME_MAX_UNITS, CROSS_TIME_TURN_LIMIT, createCrossTimeRecruit } from './cross-time.ts';

export interface CrossTimeBattleOptions {
  region: number;
  day: number;
  seed: string;
  aiDifficulty?: AiDifficulty;
  season?: number;
}

export function crossTimeInitialState(roster: UnitRecord[], options: CrossTimeBattleOptions): BattleState {
  const map = classicMap(CROSS_TIME_MAP_ID);
  const adaptation = classicAdaptation(CROSS_TIME_MAP_ID);
  const hard = options.aiDifficulty === 'hard';
  const players = roster.map((unit, index) => toBattleUnit(unit, 'player', unit.id, map.playerSpawns[index], { boss: index === 0 }));
  const enemies = CROSS_TIME_ROSTER.map(row => {
    const id = `cross-time:${row.id}`;
    const unit = createCrossTimeRecruit(row.id, id, options.day, options.seed);
    unit.level = hard ? 52 : 48;
    unit.stats = { ...(hard ? row.hard52 : row.normal48) };
    unit.hp = unit.stats.hp;
    unit.con = row.con + (hard ? 2 : 0);
    unit.weapons = [...row.weapons] as WeaponId[];
    unit.weaponInstances = unit.weapons.map(id => ({ id, durability: weaponMax(id), maxDurability: weaponMax(id) }));
    unit.bookInstances = unit.weapons.filter(id => WEAPONS[id].type === 'staff').map(id => {
      const charges = (row.staffCharges as Partial<Record<WeaponId, number>>)[id]!;
      return { id, charges, maxCharges: charges };
    });
    unit.spellbooks = row.books.map(book => ({ id: book.id, charges: book.charges, maxCharges: book.charges }));
    unit.items = [];
    unit.ranks = {};
    for (const id of unit.weapons) unit.ranks[WEAPONS[id].type] = WEAPONS[id].type === 'staff' ? 'B' : 'A';
    for (const book of row.books) unit.ranks[SPELLBOOK_BY_ID.get(book.id)!.study === 'whiteMagic' ? 'staff' : 'tome'] = SPELLBOOK_BY_ID.get(book.id)!.study === 'whiteMagic' ? 'B' : 'A';
    return toBattleUnit(unit, 'enemy', id, [...row.pos] as Point, { boss: row.boss, behavior: row.behavior });
  });
  const name = '时空试炼·终焉诸将';
  const state: BattleState = {
    engineVersion: 1, aiDifficulty: options.aiDifficulty ?? 'normal', id: `cross-time-${options.seed}`, kind: 'field', name,
    map: seasonalMap(map.terrain, options.season ?? dateOf(options.day).season),
    units: [...players, ...enemies], turn: 1, turnLimit: CROSS_TIME_TURN_LIMIT, phase: 'player',
    crossTimeGroups: createCrossTimeGroups(CROSS_TIME_ROSTER),
    goal: { kind: 'boss', target: 'cross-time:lu-bu' },
    objects: structuredClone(adaptation.objects), loot: [],
    scenario: { id: CROSS_TIME_MAP_ID, adapterVersion: adaptation.adapterVersion, sourceSha256: adaptation.sourceSha256,
      baseLevel: hard ? 52 : 48, events: [], mapChanges: [], fired: [], flags: [] },
    rng: seedRng(`${options.seed}:cross-time:combat`), growthRng: seedRng(`${options.seed}:cross-time:growth`),
  };
  return state;
}

export function createCrossTimeBattle(roster: UnitRecord[], options: CrossTimeBattleOptions): BattleRecord {
  if (!roster.length || roster.length > CROSS_TIME_MAX_UNITS || new Set(roster.map(u => u.id)).size !== roster.length) {
    throw new Error('Invalid cross-time deployment (maximum 8)');
  }
  const state = crossTimeInitialState(roster, options);
  return {
    id: state.id, playerId: '', kind: 'field', mode: 'field', name: state.name, region: options.region,
    questId: CROSS_TIME_QUEST_ID, costDays: CROSS_TIME_DAYS, goalText: '击败吕布',
    initial: structuredClone(state), state, events: [], actions: [], seed: options.seed,
    rulesetVersion: RULESET_VERSION, catalogVersion: CATALOG_VERSION, createdAt: Date.now(), updatedAt: Date.now(),
  };
}
