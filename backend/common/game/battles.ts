import { fieldEncounter, type FieldEncounter } from './encounters.ts';
import { CATALOG_CLASS_IDS, CLASSES, classUnavailableReason } from '../data/classes.ts';
import type { Rank, WeaponType } from '../data/types.ts';
import { stats } from '../data/types.ts';
import { WEAPONS } from '../data/weapons.ts';
import type { AiDifficulty, Action, BattleEvent, BattleObject, BattleState, Point, ScenarioEvent, UnitState } from '../engine/types.ts';
import { nextU32, seedRng } from '../engine/rng.ts';
import { generateMap } from '../maps/generate.ts';
import { THEMES, type Theme } from '../maps/themes.ts';
import { canEnter, neighbors, seasonalMap, seasonalTerrain, tilesFromGlyphs } from '../maps/map.ts';
import { classicMap } from './classic-catalog.ts';
import { classicAdaptation } from './classic-adaptation.ts';
import { assertClassicScenario } from './classic-validation.ts';
import { rollRankUpLoot } from './rank-loot.ts';
import { chapterAvailable } from './story.ts';
import { ARENA_MAPS, throneOf } from '../arena/maps.ts';
import type { ArenaMapId } from '../arena/maps.ts';
import type { SnapshotUnit } from '../arena/rules.ts';
import { expectedUnit } from '../arena/demo.ts';
import type { CharacterId } from '../data/characters.ts';
import type { UnitRecord } from './model.ts';
import { toBattleUnit } from './model.ts';
import { DUNGEON_STAGE_DAYS } from './expedition.ts';
import type { RunCarry } from './expedition.ts';
import { createEnemy, defaultBehavior, enemyClassForLevel, pickClasses } from './enemies.ts';
import type { EnemySpec } from './enemies.ts';
import { addEnemyReserves } from './enemy-formation.ts';
import { dateOf, enemyLevel, regionById, ACTION_DAYS } from './calendar.ts';
import { materialDrops, materialSources, MATERIALS } from './materials.ts';
import { CATALOG_VERSION, RULESET_VERSION } from './version.ts';
import { QUEST_DAY_COST, QUEST_LEVEL_CAP } from './quests.ts';
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
  // 实际耗日（任务短/标准/远征不同），供战斗页显示（docs/20）。
  costDays?: number;
  materialLoot?: { item: string; count: number }[];
  // 年度大竞技场的报名（docs/13 §6）。
  annualId?: string;
  // 挑战塔层（docs/00 §9.6）。
  challengeId?: string;
  // 冻结引擎/目录版本，旧回放按此判断能否安全重算。
  rulesetVersion?: string;
  catalogVersion?: number;
  // Arena attacks remember which day and opponent they belong to so the result can settle.
  opponentId?: string;
  arenaDay?: number;
  // 结束时的个人日期，战报按它检索（结算时写入）。
  endDay?: number;
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
  legacyDeployment?: boolean;
  encounter?: FieldEncounter;
  aiDifficulty?: AiDifficulty;
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
  carry?: Record<string, RunCarry>;
  // 地区任务：覆盖目标、回合上限与图名（docs/20）。
  quest?: Quest;
}

const DUNGEON_STAGE_NAMES = ['探路', '消耗战', '首领战'];

// A random encounter: level locked from the departure date before the fight.
// 连续副本复用同一函数，只是等级、图名和跨图携带不同（docs/00 §8.1.3）。
export function encounterMap(encounter: FieldEncounter, day: number, stage = 0) {
  const map = generateMap({ seed: `${encounter.seed}:map:${stage}`, width: encounter.width, height: encounter.height,
    theme: encounter.theme, layout: encounter.layout, unitsPerSide: encounter.maxUnits, enemyCount: encounter.enemyCount });
  return { ...map, tiles: seasonalMap(map.tiles, dateOf(day).season).tiles };
}

export function createFieldBattle(units: UnitRecord[], options: FieldBattleOptions): BattleRecord {
  const region = regionById(options.region);
  const dungeon = options.stageIndex !== undefined;
  const stage = options.stageIndex ?? 0;
  const cap = options.quest?.enemyLevelCap ?? QUEST_LEVEL_CAP[options.quest?.tier ?? 'standard'];
  const base = Math.min(cap, options.level ?? enemyLevel(options.day ?? 0, region.offset));
  const level = dungeon ? Math.min(cap, base + stage * 2) : base;
  const themes: Theme[] = [REGION_THEMES[(options.region - 1) % REGION_THEMES.length]];
  if (!dungeon && !options.quest && options.region === 4) themes.push('riverlands');
  if (!dungeon && !options.quest && options.region === 5) themes.push('lakeland');
  const theme = themes[nextU32(seedRng(`${options.seed}:theme`)) % themes.length];
  const encounter = options.encounter ?? (!options.quest && !options.legacyDeployment ? fieldEncounter(options.seed, options.day ?? 0, options.region, options.aiDifficulty, dungeon ? 'dungeon' : 'field') : undefined);
  const maxUnits = encounter?.maxUnits ?? options.quest?.maxUnits ?? FIELD_BATTLE.maxUnits;
  if (!units.length || units.length > maxUnits || new Set(units.map(u => u.id)).size !== units.length) throw new Error(`Invalid deployment (maximum ${maxUnits})`);
  const count = units.length;
  const quest = options.quest;
  // 护卫任务多留一个己方出生点给被护送者（unitsPerSide 封顶 8）。
  const map = encounter ? encounterMap(encounter, options.day ?? 0, stage) : generateMap({
    seed: `${options.seed}:map:${stage}`, width: options.width ?? 20, height: options.height ?? 20,
    unitsPerSide: Math.min(8, count + (quest?.kind === 'escort' ? 1 : 0)), theme,
  });
  const playerUnits = units.slice(0, count).map((u, i) => {
    const carry = options.carry?.[u.id];
    const extra: Partial<UnitState> = { boss: i === 0 };
    if (carry) Object.assign(extra, structuredClone(carry), { hp: Math.max(1, carry.hp) });
    return toBattleUnit(u, 'player', u.id, map.spawns.player[i], extra);
  });
  const classes = pickClasses(`${options.seed}:foes:${stage}`, encounter ? map.spawns.enemy.length : count, ENEMY_CLASSES.filter(id => enemyClassForLevel(id, level) === id));
  const enemySpecs: EnemySpec[] = classes.map((classId, i) => ({
    aiDifficulty: options.aiDifficulty, seed: `${options.seed}:foes:${stage}`, classId, level, pos: map.spawns.enemy[i], boss: i === 0,
    name: i === 0 ? `${region.name}守将` : undefined,
  }));
  const enemies = enemySpecs.map((spec, i) => createEnemy(`e${i}`, spec));
  const tiles = map.tiles;
  const npcUnits = quest?.kind === 'escort' ? [createEscortNpc('npc0', map.spawns.player[count] ?? map.spawns.player[0], level)] : [];
  const encounterTheme = encounter?.theme ?? theme;
  const name = quest ? `${region.name} · ${quest.name}`
    : dungeon ? `${region.name} · ${DUNGEON_STAGE_NAMES[stage] ?? `第 ${stage + 1} 图`}`
      : `${region.name} · ${encounterTheme === 'riverlands' || encounterTheme === 'lakeland' ? THEMES[encounterTheme].name : '遭遇战'}${encounter ? ` · ${encounter.name}` : ''}`;
  const exit = map.objective.position;
  // 连续副本每图目标不同（docs/00 §8.1.3）：探路压制、消耗战全灭、首领战斩首。
  const configuredGoal = quest?.stageGoals?.[stage];
  const dungeonGoal: BattleState['goal'] =
    configuredGoal === 'seize' ? { kind: 'seize', throne: exit }
      : configuredGoal === 'rout' ? { kind: 'rout' }
        : configuredGoal === 'boss' ? { kind: 'boss', target: 'e0' }
          : stage === 0 ? { kind: 'seize', throne: exit }
            : stage === 1 ? { kind: 'rout' }
              : { kind: 'boss', target: 'e0' };
  const goal: BattleState['goal'] = dungeon
    ? dungeonGoal
    : quest
      ? quest.kind === 'seize' ? { kind: 'seize', throne: exit }
        : quest.kind === 'defend' ? { kind: 'defend', turns: quest.turnLimit }
          : quest.kind === 'escape' ? { kind: 'escape', exits: [exit], need: quest.need ?? 1 }
            : quest.kind === 'gather' ? { kind: 'gather', exits: [exit], need: quest.need ?? 1 }
              : quest.kind === 'escort' ? { kind: 'escort', exits: [exit], npc: 'npc0' }
                : { kind: 'rout' }
      : { kind: 'boss', target: 'e0' };
  const state: BattleState = {
    encounter: encounter ? { ...encounter, playerGroups: map.playerGroups } : undefined,
    engineVersion: 1, aiDifficulty: options.aiDifficulty ?? 'normal', id: `field-${options.seed}-${stage}`, kind: 'field', name,
    map: seasonalMap(tiles, dateOf(options.day ?? 0).season),
    units: [...playerUnits, ...npcUnits, ...enemies], turn: 1, turnLimit: quest?.turnLimit ?? FIELD_BATTLE.turnLimit, phase: 'player',
    goal, boxes: quest?.kind === 'gather' ? gatherBoxes(exit, tiles[0].length, tiles.length) : undefined,
    npcRoute: quest?.kind === 'escort' ? (quest.npcRoute?.map(p => [p.x, p.y] as Point) ?? [exit]) : undefined,
    nextObjective: quest?.nextObjective ?? (quest?.kind === 'escort' ? '护送 NPC 抵达撤离点' : undefined),
    rng: seedRng(`${options.seed}:combat:${stage}`), growthRng: seedRng(`${options.seed}:growth:${stage}`),
  };
  if (!encounter) addEnemyReserves(state, enemySpecs, map.spawns.player);
  return {
    id: state.id, playerId: '', kind: 'field', mode: 'field', name: state.name, region: options.region,
    materialLoot: materialDrops(options.region, enemyLevel(options.day ?? 0, region.offset), `${options.seed}:materials`, options.aiDifficulty === 'hard' ? 5 : 4, options.aiDifficulty === 'hard' ? 0.12 : 0.08),
    dungeon: dungeon || undefined, runId: options.runId, stageIndex: dungeon ? stage : undefined, questId: quest?.id,
    costDays: dungeon ? (quest?.stageDays ?? DUNGEON_STAGE_DAYS[stage]) : quest ? (quest.costDays ?? QUEST_DAY_COST[quest.tier]) : ACTION_DAYS.sortie,
    goalText: dungeon ? (goal.kind === 'seize' ? '压制指定地点' : goal.kind === 'rout' ? '消灭全部敌军' : '击败敌方主将') : quest?.objective ?? FIELD_BATTLE.goalText, initial: structuredClone(state), state, events: [], actions: [], seed: options.seed,
    rulesetVersion: RULESET_VERSION, catalogVersion: CATALOG_VERSION, createdAt: Date.now(), updatedAt: Date.now(),
  };
}


// ---- 经典地图战斗（docs/24） -------------------------------------------------
// 地图与初始敌军来自 catalog；玩家名单仍来自名册，王座/首领与跨图携带沿用现有引擎。
export interface ClassicBattleOptions {
  region?: number;
  aiDifficulty?: AiDifficulty;
  mapId: string;
  seed: string;
  // 出发日决定目标等级；经典图按副本曲线缩放，不再直接使用原作等级。
  day?: number;
  // 出发季节可与经典图的等级取样日分开，跨季时不改变旧等级规则。
  season?: number;
  quest?: Quest;
  // 覆盖目标等级（测试/预览用）；默认按出发日计算。
  level?: number;
  stageIndex?: number;
  runId?: string;
  carry?: Record<string, RunCarry>;
  // 玩家出发时能买到的最高装备级；随机升级宝箱据此再高一级。不填按 E。
  lootRank?: Rank;
  // 账号已领取的一次性隐藏要素（mapId:objectId）。
  claimed?: readonly string[];
}

function classicPassable(map: ReturnType<typeof classicMap>, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  const tile = map.terrain[y][x];
  return tile !== 'wall' && tile !== 'water';
}

// 出击格：优先使用原作的出击位置；不足时从这些位置向外寻找可站立格。
function classicSpawns(map: ReturnType<typeof classicMap>, need: number, blockedByObject: Set<number>): Point[] {
  const key = (p: Point) => p[1] * map.width + p[0];
  const blocked = new Set(map.enemies.map(enemy => key(enemy.pos)));
  for (const cell of blockedByObject) blocked.add(cell);
  const used = new Set<number>();
  const chosen: Point[] = [];
  const tryAdd = (p: Point) => {
    const k = key(p);
    if (chosen.length >= need || used.has(k) || blocked.has(k) || !classicPassable(map, p[0], p[1])) return false;
    used.add(k); chosen.push([p[0], p[1]]);
    return true;
  };
  for (const p of map.playerSpawns) tryAdd(p);
  const queue = [...chosen];
  for (let i = 0; i < queue.length && chosen.length < need; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Point[]) {
      const p: Point = [nx, ny];
      if (tryAdd(p)) queue.push(p);
      if (chosen.length >= need) break;
    }
  }
  if (chosen.length === 0) {
    // 没有原作出击记录（部分 FC 地图）时取最远离敌军的一批可站立格。
    const cells: Point[] = [];
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
      if (classicPassable(map, x, y) && !blocked.has(y * map.width + x)) cells.push([x, y]);
    }
    const cx = map.enemies.reduce((sum, e) => sum + e.pos[0], 0) / Math.max(1, map.enemies.length);
    const cy = map.enemies.reduce((sum, e) => sum + e.pos[1], 0) / Math.max(1, map.enemies.length);
    cells.sort((a, b) => (Math.abs(b[0] - cx) + Math.abs(b[1] - cy)) - (Math.abs(a[0] - cx) + Math.abs(a[1] - cy)));
    for (const p of cells) tryAdd(p);
  }
  return chosen;
}

// 经典图的物件／事件层：隐藏要素只在指定任务里生成，已领取的一次性物件不再出现；
// 揭开对象全部消失的密室事件连同触发物件、地图变化一起去掉。随机升级宝箱在开战时一次抽定，
// 写成普通 loot：回放、重连与结算都只读这份结果。
function classicScenarioLayer(mapId: string, adaptation: ReturnType<typeof classicAdaptation>,
  opts: { questId?: string; claimed: readonly string[]; lootRank: Rank; seed: string; day?: number }) {
  const claimed = new Set(opts.claimed);
  const removed = new Set<string>();
  let objects: BattleObject[] = [];
  for (const raw of adaptation.objects) {
    const object = structuredClone(raw);
    const secret = object.secret;
    delete object.secret;
    const hidden = object.hideIn?.includes(opts.questId ?? '');
    delete object.hideIn;
    if (hidden) { removed.add(object.id); continue; }
    if (secret && secret.quest !== opts.questId) {
      // 其他场合：有替换掉落的保留原物件，纯隐藏物件整件不生成。
      if (!secret.loot) { removed.add(object.id); continue; }
    } else if (secret) {
      // 主线找物品的宝箱：对应章节开放之后才出现。
      if (secret.chapter !== undefined && !(opts.day !== undefined && chapterAvailable(secret.chapter, opts.day))) { removed.add(object.id); continue; }
      if (claimed.has(`${mapId}:${object.id}`)) { removed.add(object.id); continue; }
      if (secret.loot) object.loot = { ...secret.loot };
      object.once = true;
    }
    objects.push(object);
  }
  const reveals = (event: ScenarioEvent) => event.actions.flatMap(action => action.kind === 'setObject' ? [action.object] : []);
  const dropped = adaptation.events.filter(event => reveals(event).length > 0 && reveals(event).every(id => removed.has(id)));
  for (const event of dropped) {
    if (event.trigger.kind === 'object' && objects.some(object => object.id === (event.trigger as { object: string }).object && object.once && !object.loot)) {
      const trigger = (event.trigger as { object: string }).object;
      objects = objects.filter(object => object.id !== trigger);
    }
  }
  const events = adaptation.events.filter(event => !dropped.includes(event)).map(event => ({
    ...structuredClone(event), actions: event.actions.filter(action => action.kind !== 'setObject' || !removed.has(action.object)).map(action => structuredClone(action)),
  }));
  const used = new Set([...events.flatMap(event => event.actions.flatMap(action => action.kind === 'mapChange' ? [action.change] : [])),
    ...objects.flatMap(object => object.change ? [object.change] : [])]);
  const orphaned = new Set(dropped.flatMap(event => event.actions.flatMap(action => action.kind === 'mapChange' ? [action.change] : [])));
  const mapChanges = adaptation.mapChanges.filter(change => used.has(change.id) || !orphaned.has(change.id));
  const rolled = objects.filter(object => object.lootRoll === 'rank_up');
  const items = rollRankUpLoot(opts.lootRank, opts.seed, rolled.length);
  rolled.forEach((object, index) => {
    delete object.lootRoll;
    if (items[index]) object.loot = { item: items[index], count: 1 };
  });
  return { objects, events, mapChanges };
}

// 胜利后要记入账号的一次性隐藏要素：只算真正拿到战利品的 once 物件。
export function secretClaims(state: BattleState): string[] {
  const mapId = state.scenario?.id;
  if (!mapId) return [];
  const once = new Set((state.objects ?? []).filter(object => object.once).map(object => object.id));
  return (state.loot ?? []).flatMap(entry => entry.id.startsWith('object:') && once.has(entry.id.slice(7)) ? [`${mapId}:${entry.id.slice(7)}`] : []);
}

// Low-level flyers can become ground units; move only illegal starts to the nearest free legal tile.
function placeClassicEnemies(map: ReturnType<typeof classicMap>, specs: EnemySpec[], players: Point[], blocked: Set<number>): void {
  const key = ([x, y]: Point) => y * map.width + x;
  const occupied = new Set([...players, ...specs.map(spec => spec.pos)].map(key));
  for (const spec of specs) {
    const moveType = CLASSES[spec.classId].moveType;
    if (canEnter(map.terrain[spec.pos[1]][spec.pos[0]], moveType)) continue;
    const queue: Point[] = [spec.pos];
    const seen = new Set([key(spec.pos)]);
    const origin = key(spec.pos);
    let placed = false;
    for (let i = 0; i < queue.length; i++) {
      const point = queue[i], cell = key(point);
      if (!occupied.has(cell) && !blocked.has(cell) && canEnter(map.terrain[point[1]][point[0]], moveType)) {
        occupied.delete(origin);
        occupied.add(cell);
        spec.pos = point;
        placed = true;
        break;
      }
      for (const next of neighbors(point, map.width, map.height)) {
        if (seen.has(key(next)) || !canEnter(map.terrain[next[1]][next[0]], 'flying')) continue;
        seen.add(key(next));
        queue.push(next);
      }
    }
    if (!placed) throw new Error(`经典地图 ${map.id} 没有适合 ${spec.classId} 的敌军落脚点`);
  }
}

export function createClassicBattle(units: UnitRecord[], options: ClassicBattleOptions): BattleRecord {
  assertClassicScenario(options.mapId);
  const map = classicMap(options.mapId);
  const stage = options.stageIndex ?? 0;
  const adaptation = classicAdaptation(map.id);
  const season = options.season ?? dateOf(options.day ?? 0).season;
  if (units.length > adaptation.deployment.max) {
    throw new Error(`经典地图 ${map.id} 最多出战 ${adaptation.deployment.max} 人`);
  }
  const objectBlocked = new Set(adaptation.objects.map(object => object.pos[1] * map.width + object.pos[0]));
  const spawns = classicSpawns(map, Math.min(adaptation.deployment.max, units.length), objectBlocked);
  if (spawns.length === 0) throw new Error(`经典地图 ${map.id} 没有可用的出击位置`);
  const count = Math.min(units.length, spawns.length);
  const playerUnits = units.slice(0, count).map((unit, index) => {
    const carry = options.carry?.[unit.id];
    const extra: Partial<UnitState> = { boss: index === 0 };
    if (carry) Object.assign(extra, structuredClone(carry), { hp: Math.max(1, carry.hp) });
    return toBattleUnit(unit, 'player', unit.id, spawns[index], extra);
  });
  const originalLevels = map.enemies.map(enemy => enemy.level).sort((a, b) => a - b);
  const median = originalLevels[Math.floor(originalLevels.length / 2)] ?? 1;
  // 主线任务 region 为 0（不属于任何地区），按偏移 0 计。
  const regionOffset = options.quest && options.quest.region > 0 ? regionById(options.quest.region).offset : 0;
  const policy = adaptation.levelPolicy;
  const stageBonus = options.stageIndex === undefined ? adaptation.difficulty : (options.stageIndex * policy.stageBonus);
  const baseLevel = Math.max(1, Math.min(95, (options.level ?? enemyLevel(options.day ?? 0, regionOffset)) + stageBonus));
  const enemySpecs: EnemySpec[] = map.enemies.map((enemy, index) => {
    const boss = !!enemy.boss;
    const spread = Math.max(-policy.spread, Math.min(policy.spread, enemy.level - median));
    const level = Math.max(1, Math.min(95, baseLevel + (boss ? policy.bossBonus : spread)));
    const classId = enemyClassForLevel(enemy.classId as UnitState['classId'], level);
    const guard = !boss && map.enemies.some(other => other.boss && Math.abs(other.pos[0] - enemy.pos[0]) + Math.abs(other.pos[1] - enemy.pos[1]) <= 3) && index % 3 === 0;
    return {
      aiDifficulty: options.aiDifficulty, seed: `${options.seed}:classic:${stage}`, classId, level,
      pos: [enemy.pos[0], enemy.pos[1]], boss, name: boss ? `${map.name}守将` : undefined,
      behavior: boss ? 'hold' : guard && defaultBehavior(classId) !== 'healer' ? 'guard' : undefined,
    };
  });
  placeClassicEnemies(map, enemySpecs, playerUnits.map(unit => unit.pos), objectBlocked);
  const enemies = enemySpecs.map((spec, index) => createEnemy(`e${index}`, spec));
  if (enemies.length === 0) throw new Error(`经典地图 ${map.id} 没有初始敌军`);
  if (!enemies.some(enemy => enemy.boss)) enemies[0].boss = true;
  const boss = enemies.find(enemy => enemy.boss)!;
  const goal = map.goal.kind === 'seize'
    ? { kind: 'seize', throne: [map.goal.position[0], map.goal.position[1]] } as BattleState['goal']
    : map.goal.kind === 'boss' ? { kind: 'boss', target: boss.id } as BattleState['goal'] : { kind: 'rout' } as BattleState['goal'];
  const name = options.quest?.name ?? map.name;
  const goalText = goal.kind === 'seize' ? '主将压制王座' : goal.kind === 'boss' ? '击败敌军主将或全灭' : '消灭全部敌军';
  const layer = classicScenarioLayer(map.id, adaptation, {
    questId: options.quest?.id, claimed: options.claimed ?? [], lootRank: options.lootRank ?? 'E', seed: `${options.seed}:${stage}`, day: options.day,
  });
  const lootRegion = options.region ?? (options.quest?.region || 1);
  const replaceMaterial = (loot: { item: string; count: number }) => {
    if (!['herb', 'ore', 'wood'].includes(loot.item)) return;
    const common = materialSources(lootRegion, baseLevel).filter(id => !MATERIALS[id].rare);
    const matching = common.filter(id => MATERIALS[id].category === loot.item);
    const pool = matching.length ? matching : common;
    const topTier = Math.max(...pool.map(id => MATERIALS[id].tier));
    const top = pool.filter(id => MATERIALS[id].tier === topTier);
    loot.item = top[nextU32(seedRng(`${options.seed}:chest:${loot.item}:${loot.count}`)) % top.length];
  };
  for (const object of layer.objects) if (object.loot) replaceMaterial(object.loot);
  for (const event of layer.events) for (const action of event.actions) if (action.kind === 'loot') replaceMaterial(action);
  const state: BattleState = {
    engineVersion: 1, aiDifficulty: options.aiDifficulty ?? 'normal', id: `classic-${map.id}-${options.seed}`, kind: 'field', name,
    map: seasonalMap(map.terrain, season),
    units: [...playerUnits, ...enemies], turn: 1, turnLimit: options.quest?.turnLimit ?? map.turnLimit,
    phase: 'player', goal,
    objects: layer.objects,
    loot: [],
    scenario: {
      id: map.id, adapterVersion: adaptation.adapterVersion, sourceSha256: adaptation.sourceSha256,
      baseLevel, events: layer.events, mapChanges: layer.mapChanges.map(change => ({
        ...structuredClone(change), terrain: change.terrain.map(row => row.map(tile => tile === null ? null : seasonalTerrain(tile, season))),
      })),
      fired: [], flags: [],
    },
    rng: seedRng(`${options.seed}:classic:${stage}`), growthRng: seedRng(`${options.seed}:growth:${stage}`),
  };
  addEnemyReserves(state, enemySpecs, [...map.playerSpawns, ...spawns]);
  return {
    id: state.id, playerId: '', kind: 'field', mode: 'field', name, region: options.region ?? options.quest?.region,
    materialLoot: materialDrops(lootRegion, baseLevel, `${options.seed}:materials`, 4, options.aiDifficulty === 'hard' ? 0.12 : 0.08),
    dungeon: options.stageIndex !== undefined || undefined, runId: options.runId,
    stageIndex: options.stageIndex, questId: options.quest?.id,
    costDays: options.quest?.costDays ?? (options.quest ? QUEST_DAY_COST[options.quest.tier] : ACTION_DAYS.sortie),
    goalText, initial: structuredClone(state), state, events: [], actions: [], seed: options.seed,
    rulesetVersion: RULESET_VERSION, catalogVersion: CATALOG_VERSION, createdAt: Date.now(), updatedAt: Date.now(),
  };
}

// 大竞技场 (docs/00 §9.4): the player's squad attacks an official bracket team on an arena map.
// `round` 1–3 are the qualifiers, 4–9 the knockout rounds. Arena kind: no per-hit experience.
// 大竞技场每轮的地图：海选 1–3 平原，正赛逐步换成隘口、林地与王城。每场按名单顺序出战前 deploy 人。
export function festivalMapId(round: number, edition = 0): ArenaMapId {
  const tier = round <= 3 ? 0 : round <= 5 ? 1 : round <= 7 ? 2 : 3;
  const offset = round <= 3 ? 0 : edition % 4;
  return (['plains', 'pass', 'woods', 'castle'] as ArenaMapId[])[(tier + offset) % 4];
}

export function createFestivalBattle(units: UnitRecord[], round: number, seed: string, opts: { day?: number; season?: number; annualId?: string; edition?: number; carry?: Record<string, RunCarry> } = {}): BattleRecord {
  const map = ARENA_MAPS[festivalMapId(round, opts.edition ?? 0)];
  const level = Math.min(99, enemyLevel(opts.day ?? 0) + Math.floor((round - 1) / 2));
  const tiles = tilesFromGlyphs(map.rows);
  const count = Math.max(1, Math.min(units.length, map.deploy));
  const playerUnits = units.slice(0, count).map((u, i) => {
    const carry = opts.carry?.[u.id];
    const extra: Partial<UnitState> = { boss: i === 0 };
    if (carry) Object.assign(extra, structuredClone(carry), { hp: Math.max(1, carry.hp) });
    return toBattleUnit(u, 'player', u.id, map.attackerZone[i], extra);
  });
  const classes = pickClasses(`${seed}:festival`, Math.min(map.deploy, map.defenderZone.length), ENEMY_CLASSES.filter(id => enemyClassForLevel(id, level) === id));
  const enemies = classes.map((classId, i) => createEnemy(`d${i}`, {
    classId, level, pos: map.defenderZone[i], boss: i === 0, name: i === 0 ? `第 ${round} 轮主将` : undefined,
  }));
  const goal: BattleState['goal'] = map.goal === 'boss' ? { kind: 'boss', target: 'd0' }
    : map.goal === 'seize' ? { kind: 'seize', throne: throneOf(map) } : { kind: 'rout' };
  const state: BattleState = {
    engineVersion: 1, id: `festival-${round}-${seed}`, kind: 'arena', name: `${map.name} · 大竞技场第 ${round} 轮`,
    map: seasonalMap(tiles, opts.season ?? dateOf(opts.day ?? 0).season),
    units: [...playerUnits, ...enemies], turn: 1, turnLimit: map.turnLimit, phase: 'player', goal,
    rng: seedRng(`${seed}:combat`), growthRng: seedRng(`${seed}:growth`),
  };
  return {
    id: state.id, playerId: '', kind: 'arena', mode: 'festival', name: state.name, goalText: map.goalText,
    annualId: opts.annualId, initial: structuredClone(state), state, events: [], actions: [], seed,
    rulesetVersion: RULESET_VERSION, catalogVersion: CATALOG_VERSION, createdAt: Date.now(), updatedAt: Date.now(),
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
    // 成功撤离的单位退出战场但不是战死；护卫 NPC 也不算玩家伤亡。
    deaths: playerUnits.filter(u => !u.alive && !u.escaped && !u.npc).map(u => u.id),
    survivors: playerUnits.filter(u => (u.alive || u.escaped) && !u.npc).map(u => u.id),
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
  return record.state.units.filter(u => u.side === 'player' && !u.npc);
}

// 护卫任务里的被护送者：玩家方 NPC，不占名册、不永久入队，由引擎自动走向撤离点（docs/20 §2）。
function createEscortNpc(id: string, pos: Point, level: number): UnitState {
  const base = stats(18, 2, 4, 3, 6, 6, 2, 6, 5);
  return {
    id, name: '被护送者', side: 'player', classId: 'cleric', level, exp: 0,
    stats: base, con: 5, hp: base.hp, pos: [pos[0], pos[1]], weapons: [], items: [], ranks: {},
    npc: true, acted: true, alive: true,
  };
}

// 物资箱放在撤离点附近：拿到箱子并撤离才算带回（docs/20 §2）。
function gatherBoxes(exit: Point, width: number, height: number): Point[] {
  const out: Point[] = [];
  for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [0, 1], [-2, 0]] as [number, number][]) {
    const p: Point = [exit[0] + dx, exit[1] + dy];
    if (p[0] > 0 && p[1] > 0 && p[0] < width - 1 && p[1] < height - 1) out.push(p);
  }
  return out;
}
