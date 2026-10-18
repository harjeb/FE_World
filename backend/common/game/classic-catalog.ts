import catalog from '../../../content/scenarios/classic-maps-v1/catalog.json' with { type: 'json' };
import type { Terrain } from '../maps/map.ts';

// 经典地图目录（tools/classic-integration/build_catalog.py 生成）。
// 地形与职业均已按 docs/24 的适配规则换成项目定义；敌军只取每章的初始编制。
export type ClassicGame = 'fe1' | 'fe2' | 'fe6' | 'fe7' | 'fe8' | 'fe3';

export interface ClassicEnemy {
  classId: string;
  level: number;
  pos: [number, number];
  boss?: boolean;
  sourceClassId?: number;
  sourceClass?: string;
}

export interface ClassicMap {
  id: string;
  game: ClassicGame;
  name: string;
  width: number;
  height: number;
  terrain: Terrain[][];
  playerSpawns: [number, number][];
  enemies: ClassicEnemy[];
  goal: { kind: 'seize'; position: [number, number] } | { kind: 'boss' } | { kind: 'rout' };
  turnLimit: number;
  adapted?: boolean;
  appliedChanges?: string[];
  spawnAdjusted?: boolean;
  source: { pack: string; file: string; sourceId: string };
}

interface Catalog { format: string; schemaVersion: number; count: number; maps: ClassicMap[] }

const data = catalog as Catalog;
if (data.format !== 'agent-tactics.classic-maps' || data.schemaVersion !== 1 || data.count !== data.maps.length) {
  throw new Error('经典地图目录格式无效');
}

export const CLASSIC_MAPS: readonly ClassicMap[] = data.maps;
export const CLASSIC_BY_ID = new Map(CLASSIC_MAPS.map(map => [map.id, map]));

export function classicMap(id: string): ClassicMap {
  const map = CLASSIC_BY_ID.get(id);
  if (!map) throw new Error(`未知经典地图 ${id}`);
  return map;
}

export function classicMapsByGame(game: ClassicGame): ClassicMap[] {
  return CLASSIC_MAPS.filter(map => map.game === game);
}

export const CLASSIC_GAME_NAMES: Record<ClassicGame, string> = {
  fe1: '暗黑龙与光之剑', fe2: '外传', fe3: '纹章之谜', fe6: '封印之剑', fe7: '烈火之剑', fe8: '圣魔之光石',
};
