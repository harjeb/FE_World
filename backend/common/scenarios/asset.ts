import Ajv from 'ajv';
import schema from './scenario-v1.schema.json' with { type: 'json' };

export type SourcePoint = [number, number];
export type SourceFaction = 'player' | 'ally' | 'enemy';
export interface SourceReference {
  kind: string;
  slot?: number;
  variant?: string;
  instruction?: string;
  loadMode?: number;
  restriction?: number;
}
export interface SourceUnit {
  index: number;
  characterId: number;
  characterSymbol: string | null;
  classId: number;
  effectiveClassId: number;
  classSymbol: string | null;
  leaderId: number;
  faction: SourceFaction;
  level: number;
  autolevel: boolean;
  entryPosition: SourcePoint;
  position: SourcePoint | null;
  positionStatus: 'on-map' | 'off-map' | 'unresolved';
  route: { position: SourcePoint; flags: number; a: number; b: number; delayFrames: number }[];
  itemIds: number[];
  aiBytes: number[];
  dropItem: boolean | null;
  sourceAddress: string;
  sourceRecordHex: string;
}
export interface SourceUnitGroup {
  id: string;
  sourceAddress: string;
  references: SourceReference[];
  units: SourceUnit[];
}
export interface SourceRecord {
  id: number;
  symbol: string | null;
  sourceAddress: string;
  sourceRecordHex: string;
  [key: string]: unknown;
}
export interface ScenarioAsset {
  format: 'agent-tactics.scenario';
  schemaVersion: 1;
  id: string;
  name: string;
  chapter: { number: string; route: string; tableIndex: number; internalName: string };
  source: {
    kind: 'gba-rom'; game: 'fe6' | 'fe7' | 'fe8'; gameCode: string; fileName: string;
    bytes: number; sha1: string; sha256: string; profileRevision: string;
  };
  coordinates: { origin: 'top-left'; indexBase: 0; pointOrder: ['x', 'y']; matrixOrder: 'rows-y-columns-x' };
  map: { width: number; height: number; tilePixels: 16; terrainIds: number[][]; metatileIndices: number[][] };
  terrainCatalog: Record<string, { id: number; label: string; color: string; glyph: string; symbol: string | null; annotationBasis: string }>;
  classCatalog: Record<string, SourceRecord>;
  characterCatalog: Record<string, SourceRecord>;
  itemCatalog: Record<string, SourceRecord>;
  unitGroups: SourceUnitGroup[];
  objects: { id: string; kind: 'seize' | 'door' | 'chest' | 'source-location'; position: SourcePoint; positionStatus: 'on-map' | 'off-map'; sourceCommand: number; sourceAddress: string; itemId: number | null }[];
  mapChanges: { id: string; sourceId: number; position: SourcePoint; width: number; height: number; terrainIds: (number | null)[][]; metatileIndices: (number | null)[][]; sourceAddress: string }[];
  events: Record<'turn' | 'talk' | 'location' | 'misc', Record<string, unknown>[]>;
  eventScripts: Record<string, Record<string, unknown>[]>;
  coverage: {
    enemyTemplateCount: number; unitGroupCount: number; primaryEnemyTemplateCount: number | null;
    initialEnemySelection: 'chapter-table' | 'opening-script-references';
    scriptScanWarnings: { script: string; issue: string }[];
    scriptScanMode: 'static-packets-and-calls' | 'static-patterns-to-first-terminator';
    runtimeExecuted: false; asmSpawnEffectsExecuted: false;
  };
  adaptation: { status: 'source-template'; requires: string[]; notes: string[] };
  provenance: {
    chapterAddress: string; chapterRecordHex: string; layoutAddress: string; configAddress: string;
    eventGroupAddress: string; eventPointerWords: string[]; layoutSha256: string; configSha256: string;
  };
}

// Native JSON Schema validates structure without coercing, defaulting or dropping fields.
// This is deliberately separate from the random-map BattleMap v3 contract.
const checkShape = new Ajv({ allErrors: true, strict: true }).compile<ScenarioAsset>(schema);

export function assertScenarioAsset(value: unknown): asserts value is ScenarioAsset {
  if (!checkShape(value)) {
    throw new Error('关卡素材格式无效：' + checkShape.errors!.slice(0, 8)
      .map(error => `${error.instancePath || '/'} ${error.message}`).join('; '));
  }
  const asset = value;
  const fail = (message: string): never => { throw new Error(`关卡素材 ${asset.id}：${message}`); };
  const { width, height } = asset.map;
  const inMap = (p: SourcePoint) => p[0] < width && p[1] < height;
  const matrix = (values: unknown[][], w: number, h: number, name: string) => {
    if (values.length !== h || values.some(row => row.length !== w)) fail(`${name} 行列尺寸不匹配`);
  };
  const hasTerrain = (id: number) => {
    if (!Object.hasOwn(asset.terrainCatalog, id)) fail(`地形 ${id} 未在 terrainCatalog 中定义`);
  };
  matrix(asset.map.terrainIds, width, height, 'terrainIds');
  matrix(asset.map.metatileIndices, width, height, 'metatileIndices');
  for (const row of asset.map.terrainIds) for (const id of row) hasTerrain(id);
  for (const catalog of [asset.terrainCatalog, asset.classCatalog, asset.characterCatalog, asset.itemCatalog]) {
    for (const [key, item] of Object.entries(catalog)) if (String(item.id) !== key) fail(`目录键 ${key} 与条目编号不一致`);
  }
  const unique = (ids: string[], name: string) => {
    if (new Set(ids).size !== ids.length) fail(`${name} ID重复`);
  };
  unique(asset.unitGroups.map(group => group.id), '单位组');
  unique(asset.mapChanges.map(change => change.id), '地图变化');
  unique(asset.objects.map(object => object.id), '物件');
  let enemies = 0;
  for (const group of asset.unitGroups) {
    unique(group.units.map(unit => String(unit.index)), `单位组 ${group.id}`);
    for (const unit of group.units) {
      if (!Object.hasOwn(asset.classCatalog, unit.effectiveClassId)) fail(`职业 ${unit.effectiveClassId} 缺少定义`);
      if (!Object.hasOwn(asset.characterCatalog, unit.characterId)) fail(`人物 ${unit.characterId} 缺少定义`);
      for (const item of unit.itemIds) if (!Object.hasOwn(asset.itemCatalog, item)) fail(`物品 ${item} 缺少定义`);
      if (unit.positionStatus === 'unresolved' ? unit.position !== null
        : unit.position === null || inMap(unit.position) !== (unit.positionStatus === 'on-map')) {
        fail(`单位 ${group.id}/${unit.index} 的坐标状态与坐标不一致`);
      }
      if (unit.sourceRecordHex.length !== (asset.source.game === 'fe8' ? 40 : 32)) fail('单位原始记录长度与游戏格式不一致');
      if (unit.faction === 'enemy') enemies++;
    }
  }
  for (const change of asset.mapChanges) {
    if (!inMap(change.position) || change.position[0] + change.width > width || change.position[1] + change.height > height) fail(`地图变化 ${change.id} 超出范围`);
    matrix(change.terrainIds, change.width, change.height, change.id);
    matrix(change.metatileIndices, change.width, change.height, change.id + ' metatiles');
    for (let y = 0; y < change.height; y++) for (let x = 0; x < change.width; x++) {
      const terrain = change.terrainIds[y][x];
      if ((terrain === null) !== (change.metatileIndices[y][x] === null)) fail(`地图变化 ${change.id} 的保留掩码不一致`);
      if (terrain !== null) hasTerrain(terrain);
    }
  }
  for (const object of asset.objects) {
    if (inMap(object.position) !== (object.positionStatus === 'on-map')) fail(`物件 ${object.id} 的坐标状态不一致`);
    if (object.itemId !== null && !Object.hasOwn(asset.itemCatalog, object.itemId)) fail(`物件 ${object.id} 引用了未定义物品`);
  }
  if (asset.coverage.enemyTemplateCount !== enemies || asset.coverage.unitGroupCount !== asset.unitGroups.length) fail('模板统计与实际数据不一致');
  const codes = { fe6: 'AFEJ', fe7: 'AE7J', fe8: 'BE8J' };
  if (asset.source.gameCode !== codes[asset.source.game]) fail('作品与ROM版本码不匹配');
}

export function parseScenarioAsset(json: string): ScenarioAsset {
  const value: unknown = JSON.parse(json);
  assertScenarioAsset(value);
  return value;
}

/** Select one explicit group; this does not execute its event conditions or spawn it. */
export function enemyTemplates(asset: ScenarioAsset, groupId: string): SourceUnit[] {
  const group = asset.unitGroups.find(group => group.id === groupId);
  if (!group) throw new Error(`未知单位组 ${groupId}`);
  return group.units.filter(unit => unit.faction === 'enemy');
}
