import { CATALOG_CLASS_IDS, CLASSES, classUnavailableReason } from '../data/classes.ts';
import type { ClassId } from '../data/classes.ts';
import { TERRAINS } from '../maps/map.ts';
import type { Terrain } from '../maps/map.ts';
import { isItemKey } from './items.ts';
import classMapData from '../../../content/scenarios/classic-maps-v1/class-map.json' with { type: 'json' };
import { classicAdaptation } from './classic-adaptation.ts';
import type { ClassicAdaptation } from './classic-adaptation.ts';
import { classicMap } from './classic-catalog.ts';
import type { ClassicMap } from './classic-catalog.ts';

// 场景验收（QUEST-08）：创建战斗前一次性检查部署、敌军、物件、事件与可达性。
// validateMap 保持原样；这里只做经典地图适配层的额外检查。
export interface ScenarioProblem { code: string; message: string }

interface ClassMapEntry { game: string; sourceKey: string; sourceId: number; projectClass: string; review: string }
const CLASS_MAP = new Map((classMapData as unknown as { classes: ClassMapEntry[] }).classes
  .map(entry => [`${entry.game}:${entry.sourceKey}`, entry]));

function passable(tile: Terrain): boolean {
  return TERRAINS[tile].costs[0] !== null;
}

function inside(map: ClassicMap, [x, y]: [number, number]): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

// 全部地图变化生效后的地形：密室物件开局埋在墙里，揭开后须落在可通行格。
function changedTerrain(map: ClassicMap, changes: ClassicAdaptation['mapChanges']): Terrain[][] {
  const terrain = map.terrain.map(row => [...row]);
  for (const change of changes) {
    change.terrain.forEach((row, dy) => row.forEach((tile, dx) => {
      const x = change.position[0] + dx, y = change.position[1] + dy;
      if (tile !== null && inside(map, [x, y])) terrain[y][x] = tile;
    }));
  }
  return terrain;
}

function reachable(map: ClassicMap, changes: ClassicAdaptation['mapChanges']): boolean {
  const terrain = map.terrain.map(row => [...row]);
  const applyAll = () => {
    for (const change of changes) {
      for (let dy = 0; dy < change.terrain.length; dy++) {
        for (let dx = 0; dx < change.terrain[dy].length; dx++) {
          const tile = change.terrain[dy][dx];
          if (tile === null) continue;
          const x = change.position[0] + dx, y = change.position[1] + dy;
          if (inside(map, [x, y])) terrain[y][x] = tile;
        }
      }
    }
  };
  const target = map.goal.kind === 'seize'
    ? map.goal.position
    : map.enemies.find(enemy => enemy.boss)?.pos ?? map.enemies[0]?.pos;
  if (!target) return false;
  const search = () => {
    const seen = new Set<number>();
    const queue: [number, number][] = [];
    for (const [x, y] of map.playerSpawns) {
      if (!passable(terrain[y][x])) continue;
      const key = y * map.width + x;
      if (!seen.has(key)) { seen.add(key); queue.push([x, y]); }
    }
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i];
      if (x === target[0] && y === target[1]) return true;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as [number, number][]) {
        if (!inside(map, [nx, ny])) continue;
        const key = ny * map.width + nx;
        if (seen.has(key) || !passable(terrain[ny][nx])) continue;
        seen.add(key);
        queue.push([nx, ny]);
      }
    }
    return false;
  };
  if (search()) return true;
  applyAll();
  return search();
}

export function validateClassicScenario(mapId: string): ScenarioProblem[] {
  const problems: ScenarioProblem[] = [];
  const add = (code: string, message: string) => problems.push({ code, message });
  let map: ClassicMap;
  let adaptation: ClassicAdaptation;
  try {
    map = classicMap(mapId);
    adaptation = classicAdaptation(mapId);
  } catch (error) {
    return [{ code: 'MISSING_CONFIG', message: error instanceof Error ? error.message : String(error) }];
  }

  if (adaptation.adapterVersion.trim().length === 0) add('ADAPTER_VERSION', '适配版本为空');
  if (map.source.pack === 'gba-classics-v1' && !adaptation.sourceSha256) add('SOURCE_SHA', '缺少源文件 SHA-256');
  if (!Number.isFinite(adaptation.difficulty) || adaptation.difficulty < 0) add('DIFFICULTY', '难度必须为非负整数');
  if (!Number.isFinite(adaptation.levelPolicy.stageBonus) || adaptation.levelPolicy.stageBonus < 0) add('LEVEL_POLICY', '副本每图等级加值无效');
  if (!Number.isFinite(adaptation.levelPolicy.bossBonus) || adaptation.levelPolicy.bossBonus < 0) add('LEVEL_POLICY', '首领等级加值无效');

  const objectIds = new Set<string>();
  const objectCells = new Set<string>();
  for (const object of adaptation.objects) {
    if (objectIds.has(object.id)) add('OBJECT_ID', `物件 id 重复：${object.id}`);
    objectIds.add(object.id);
    const [x, y] = object.pos;
    if (!inside(map, [x, y])) { add('OBJECT_BOUNDS', `${object.id} 在 map 外`); continue; }
    const cell = `${x},${y}`;
    if (objectCells.has(cell)) add('OBJECT_OVERLAP', `${object.id} 与另一物件同格 ${cell}`);
    objectCells.add(cell);
    const tile = (object.state === 'hidden' ? changedTerrain(map, adaptation.mapChanges) : map.terrain)[y][x];
    if (object.kind === 'wall' ? tile !== 'wall' : !passable(tile)) {
      add('OBJECT_TERRAIN', `${object.id} 位于不可用地形 ${tile}`);
    }
    if (object.state === 'hidden' && !adaptation.events.some(event => event.actions.some(action => action.kind === 'setObject' && action.object === object.id))) {
      add('OBJECT_HIDDEN', `${object.id} 没有揭开它的事件`);
    }
    if (object.lootRoll !== undefined && (object.kind !== 'chest' || object.lootRoll !== 'rank_up' || object.loot)) {
      add('LOOT_ROLL', `${object.id} 的随机掉落只能用于没有固定掉落的宝箱`);
    }
    if (object.secret?.loot && (!isItemKey(object.secret.loot.item) || !Number.isInteger(object.secret.loot.count) || object.secret.loot.count <= 0)) {
      add('SECRET_LOOT', `${object.id} 的隐藏替换掉落无效`);
    }
    if (object.loot) {
      if (!isItemKey(object.loot.item)) add('LOOT_ITEM', `${object.id} 掉落未知物品 ${object.loot.item}`);
      if (!Number.isInteger(object.loot.count) || object.loot.count <= 0) add('LOOT_COUNT', `${object.id} 掉落数量无效`);
    }
    if (object.kind === 'switch' && object.change && !adaptation.mapChanges.some(change => change.id === object.change)) {
      add('SWITCH_CHANGE', `${object.id} 引用了不存在的地图变化 ${object.change}`);
    }
  }

  const eventIds = new Set<string>();
  for (const event of adaptation.events) {
    if (eventIds.has(event.id)) add('EVENT_ID', `事件 id 重复：${event.id}`);
    eventIds.add(event.id);
    for (const action of event.actions) {
      if (action.kind === 'spawn') {
        for (const unit of action.units) {
          if (!(CATALOG_CLASS_IDS as readonly string[]).includes(unit.classId)) add('SPAWN_CLASS', `${event.id} 引用了目录外职业 ${unit.classId}`);
          if (classUnavailableReason(unit.classId as ClassId)) add('SPAWN_CLASS', `${event.id} 的职业 ${unit.classId} 不可用`);
          if (!inside(map, unit.pos)) add('SPAWN_BOUNDS', `${event.id} 的增援在 map 外`);
          else if (!passable(map.terrain[unit.pos[1]][unit.pos[0]])) add('SPAWN_TERRAIN', `${event.id} 的增援落在不可通行地形`);
          if (!CLASSES[unit.classId as ClassId]) add('SPAWN_CLASS', `${event.id} 引用了未知职业 ${unit.classId}`);
        }
      }
      if (action.kind === 'mapChange' && !adaptation.mapChanges.some(change => change.id === action.change)) {
        add('EVENT_CHANGE', `${event.id} 引用了不存在的地图变化 ${action.change}`);
      }
      if (action.kind === 'setObject' && !objectIds.has(action.object)) add('EVENT_OBJECT', `${event.id} 引用了不存在物件 ${action.object}`);
      if (action.kind === 'loot' && !isItemKey(action.item)) add('EVENT_LOOT', `${event.id} 给出未知物品 ${action.item}`);
      if (action.kind === 'damage') {
        if (!Number.isInteger(action.amount) || action.amount <= 0) add('EVENT_DAMAGE', `${event.id} 炮台伤害无效`);
        if (action.range !== undefined && (!Number.isInteger(action.range) || action.range <= 0)) add('EVENT_DAMAGE', `${event.id} 炮台射程无效`);
        if (action.from && !inside(map, action.from)) add('EVENT_DAMAGE', `${event.id} 炮台位置在 map 外`);
        if (action.target !== 'player' && action.target !== 'enemy') add('EVENT_DAMAGE', `${event.id} 炮台目标无效`);
      }
      if (action.kind === 'status') {
        if (!['sleep', 'silence', 'berserk', 'petrified'].includes(action.status)) add('EVENT_STATUS', `${event.id} 状态效果无效`);
        if (action.turns !== undefined && (!Number.isInteger(action.turns) || action.turns <= 0)) add('EVENT_STATUS', `${event.id} 状态持续回合无效`);
        if (action.range !== undefined && (!Number.isInteger(action.range) || action.range <= 0)) add('EVENT_STATUS', `${event.id} 状态杖射程无效`);
        if (action.from && !inside(map, action.from)) add('EVENT_STATUS', `${event.id} 状态杖位置在 map 外`);
        if (action.target !== 'player') add('EVENT_STATUS', `${event.id} 状态杖只能以玩家单位为目标`);
      }
    }
  }
  for (const change of adaptation.mapChanges) {
    for (let dy = 0; dy < change.terrain.length; dy++) {
      for (let dx = 0; dx < change.terrain[dy].length; dx++) {
        const tile = change.terrain[dy][dx];
        if (tile === null) continue;
        if (!(tile in TERRAINS)) add('CHANGE_TERRAIN', `${change.id} 含未知地形 ${String(tile)}`);
        if (!inside(map, [change.position[0] + dx, change.position[1] + dy])) add('CHANGE_BOUNDS', `${change.id} 超出 map`);
      }
    }
  }

  if (map.playerSpawns.length === 0) add('NO_SPAWNS', '没有出击点');
  const spawns = new Set<string>();
  for (const [x, y] of map.playerSpawns) {
    if (!inside(map, [x, y]) || !passable(map.terrain[y][x])) add('SPAWN_TERRAIN', `出击点 ${x},${y} 不可站立`);
    const cell = `${x},${y}`;
    if (spawns.has(cell)) add('SPAWN_OVERLAP', `出击点重复 ${cell}`);
    spawns.add(cell);
  }
  const enemies = new Set<string>();
  for (const enemy of map.enemies) {
    const [x, y] = enemy.pos;
    if (!inside(map, [x, y]) || !passable(map.terrain[y][x])) add('ENEMY_TERRAIN', `${enemy.classId} 位于不可站立格 ${x},${y}`);
    const cell = `${x},${y}`;
    if (enemies.has(cell)) add('ENEMY_OVERLAP', `敌军同格 ${cell}`);
    enemies.add(cell);
    if (!CLASSES[enemy.classId as ClassId]) add('ENEMY_CLASS', `未知敌军职业 ${enemy.classId}`);
    else if (classUnavailableReason(enemy.classId as ClassId)) add('ENEMY_CLASS', `敌军职业不可用 ${enemy.classId}`);
    if (enemy.sourceClass) {
      const mapped = CLASS_MAP.get(`${map.game}:${enemy.sourceClass}`);
      if (!mapped) add('CLASS_MAP_MISSING', `${enemy.sourceClass} 没有 class-map 记录`);
      else {
        if (mapped.review !== 'accepted') add('CLASS_MAP_REVIEW', `${enemy.sourceClass} 尚未审核通过`);
        if (mapped.projectClass !== enemy.classId) add('CLASS_MAP_MISMATCH', `${enemy.sourceClass} 应映射到 ${mapped.projectClass}，目录为 ${enemy.classId}`);
        if (enemy.sourceClassId !== undefined && mapped.sourceId !== enemy.sourceClassId) add('CLASS_MAP_ID', `${enemy.sourceClass} 源 ID ${enemy.sourceClassId} 与 class-map ${mapped.sourceId} 不一致`);
      }
    }
  }
  if (map.enemies.length === 0) add('NO_ENEMIES', '没有初始敌军');
  if (!map.enemies.some(enemy => enemy.boss)) add('NO_BOSS', '没有主将');
  const goal = map.goal;
  if (goal.kind === 'seize') {
    if (!inside(map, goal.position)) add('GOAL_BOUNDS', '王座在 map 外');
    else if (map.terrain[goal.position[1]][goal.position[0]] !== 'throne') add('GOAL_THRONE', '压制目标格不是王座');
  }
  if (!Number.isInteger(map.turnLimit) || map.turnLimit <= 0) add('TURN_LIMIT', '回合上限无效');
  if (!Number.isInteger(adaptation.deployment.max) || adaptation.deployment.max < 1) add('DEPLOYMENT', '部署上限必须是正整数');
  if (!reachable(map, adaptation.mapChanges)) add('UNREACHABLE', '出击点无法到达目标（含机关变化）');

  // Doors/chests must not sit under the initial garrison or a spawn.
  for (const object of adaptation.objects) {
    const cell = `${object.pos[0]},${object.pos[1]}`;
    if (spawns.has(cell)) add('OBJECT_SPAWN', `${object.id} 与出击点同格`);
    if (object.kind !== 'ballista' && enemies.has(cell)) add('OBJECT_ENEMY', `${object.id} 与初始敌军同格`);
  }
  return problems;
}

// QUEST-08 的命名别名：场景战斗验收，不放宽 validateMap()。
export const validateScenarioBattle = validateClassicScenario;

export function assertClassicScenario(mapId: string): void {
  const problems = validateClassicScenario(mapId);
  if (problems.length > 0) {
    throw new Error(`经典地图 ${mapId} 验收失败：${problems.map(p => `[${p.code}] ${p.message}`).join('；')}`);
  }
}
