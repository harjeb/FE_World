import { CATALOG_CLASS_IDS, CLASSES, classUnavailableReason } from '../data/classes.ts';
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
import { enemyLevel, regionById } from './calendar.ts';
import type { Quest } from './quests.ts';

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
  // 连续副本：同一 run 的第 stageIndex 张图（docs/00 §8.1.3）。
  dungeon?: boolean;
  runId?: string;
  stageIndex?: number;
  // 地区任务（docs/20）：目标、回合上限与名字来自任务定义。
  questId?: string;
  // 年度大竞技场的报名（docs/13 §6）。
  annualId?: string;
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

const ENEMY_CLASSES = CATALOG_CLASS_IDS.filter(id => CLASSES[id].stage > 0 && !classUnavailableReason(id));

// The fixed rules of a random encounter. GET_TODAY sends the same numbers, so the page and the Agent
// see them before committing the days (docs/00 §11「出征前展示胜负条件、回合截止」).
export const FIELD_BATTLE = { maxUnits: 8, turnLimit: 20, goalText: '击败敌方主将或全灭' } as const;

export interface FieldBattleOptions {
  region: number;
  cleared: number;
  day?: number;
  seed: string;
  width?: number;
  height?: number;
  // 省略时按出发日期计算；连续副本三张图共用出发时的等级。
  level?: number;
  // 连续副本的图号与跨图携带状态（HP、物品、武器）。
  stageIndex?: number;
  runId?: string;
  carry?: Record<string, { hp: number; items: UnitState['items']; weapons: UnitState['weapons'] }>;
  // 地区任务：覆盖目标、回合上限与图名（docs/20）。
  quest?: Quest;
}

const DUNGEON_STAGE_NAMES = ['探路', '消耗战', '首领战'];

// A random encounter: level locked from the departure date before the fight.
// 连续副本复用同一函数，只是等级、图名和跨图携带不同（docs/00 §8.1.3）。
export function createFieldBattle(units: UnitRecord[], options: FieldBattleOptions): BattleRecord {
  const region = regionById(options.region);
  const dungeon = options.stageIndex !== undefined;
  const stage = options.stageIndex ?? 0;
  const base = options.level ?? enemyLevel(options.day ?? 0, region.offset);
  const level = dungeon ? Math.min(99, base + stage * 2) : base;
  const theme = REGION_THEMES[(options.region - 1) % REGION_THEMES.length];
  const count = Math.max(1, Math.min(FIELD_BATTLE.maxUnits, units.length));
  const map = generateMap({
    seed: `${options.seed}:map:${stage}`, width: options.width ?? 20, height: options.height ?? 20,
    unitsPerSide: count, theme,
  });
  const playerUnits = units.slice(0, count).map((u, i) => {
    const carry = options.carry?.[u.id];
    const extra: Partial<UnitState> = { boss: i === 0 };
    if (carry) { extra.hp = Math.max(1, carry.hp); extra.items = carry.items.map(it => ({ ...it })); extra.weapons = [...carry.weapons]; }
    return toBattleUnit(u, 'player', u.id, map.spawns.player[i], extra);
  });
  const classes = pickClasses(`${options.seed}:foes:${stage}`, count, ENEMY_CLASSES);
  const enemies = classes.map((classId, i) => createEnemy(`e${i}`, {
    classId, level, pos: map.spawns.enemy[i], boss: i === 0,
    name: i === 0 ? `${region.name}守将` : undefined,
  }));
  const tiles = map.tiles;
  const quest = options.quest;
  const name = quest ? `${region.name} · ${quest.name}`
    : dungeon ? `${region.name} · ${DUNGEON_STAGE_NAMES[stage] ?? `第 ${stage + 1} 图`}` : `${region.name} · 遭遇战`;
  const goal: BattleState['goal'] = quest
    ? quest.kind === 'seize' ? { kind: 'seize', throne: map.objective.position }
      : quest.kind === 'defend' ? { kind: 'defend', turns: quest.turnLimit }
        : { kind: 'rout' }
    : { kind: 'boss', target: 'e0' };
  const state: BattleState = {
    engineVersion: 1, id: `field-${options.seed}-${stage}`, kind: 'field', name,
    map: { width: tiles[0].length, height: tiles.length, tiles },
    units: [...playerUnits, ...enemies], turn: 1, turnLimit: quest?.turnLimit ?? FIELD_BATTLE.turnLimit, phase: 'player',
    goal,
    rng: seedRng(`${options.seed}:combat:${stage}`), growthRng: seedRng(`${options.seed}:growth:${stage}`),
  };
  return {
    id: state.id, playerId: '', kind: 'field', mode: 'field', name: state.name, region: options.region,
    dungeon: dungeon || undefined, runId: options.runId, stageIndex: dungeon ? stage : undefined, questId: quest?.id,
    goalText: quest?.objective ?? FIELD_BATTLE.goalText, initial: structuredClone(state), state, events: [], actions: [], seed: options.seed,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// 大竞技场 (docs/00 §9.4): the player's squad attacks an official bracket team on an arena map.
// `round` 1–3 are the qualifiers, 4–9 the knockout rounds. Arena kind: no per-hit experience.
// 大竞技场每轮的地图：海选 1–3 平原，正赛逐步换成隘口、林地与王城。每场按名单顺序出战前 deploy 人。
export function festivalMapId(round: number): ArenaMapId {
  return round <= 3 ? 'plains' : round <= 5 ? 'pass' : round <= 7 ? 'woods' : 'castle';
}

export function createFestivalBattle(units: UnitRecord[], round: number, seed: string, opts: { day?: number; annualId?: string; carry?: Record<string, { hp: number; items: UnitState['items']; weapons: UnitState['weapons'] }> } = {}): BattleRecord {
  const map = ARENA_MAPS[festivalMapId(round)];
  const level = Math.min(99, enemyLevel(opts.day ?? 0) + Math.floor((round - 1) / 2));
  const tiles = tilesFromGlyphs(map.rows);
  const count = Math.max(1, Math.min(units.length, map.deploy));
  const playerUnits = units.slice(0, count).map((u, i) => {
    const carry = opts.carry?.[u.id];
    const extra: Partial<UnitState> = { boss: i === 0 };
    if (carry) { extra.hp = Math.max(1, carry.hp); extra.items = carry.items.map(it => ({ ...it })); extra.weapons = [...carry.weapons]; }
    return toBattleUnit(u, 'player', u.id, map.attackerZone[i], extra);
  });
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
    annualId: opts.annualId, initial: structuredClone(state), state, events: [], actions: [], seed, createdAt: Date.now(), updatedAt: Date.now(),
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
