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

const CLASSIC_MAP_NAMES: Record<string, string> = {
  'fe6-ch13-main': '林间救援', 'fe6-ch14-main': '隐林绿洲', 'fe6-ch16-main': '古林王城',
  'fe6-ch18-ilia': '霜河渡口', 'fe6-ch19-ilia': '寒峰堡垒', 'fe6-ch20-ilia': '雪原关隘',
  'fe6-ch21-main': '封印山门', 'fe6-ch22-main': '沉梦宫城', 'fe6-ch23-main': '亡魂山道', 'fe6-ch24-main': '龙眠圣所',
  'fe7-ch19-eliwood': '龙门遗迹', 'fe7-ch20-eliwood': '丘陵烽烟', 'fe7-ch22-eliwood': '黄沙古塔',
  'fe7-ch23-eliwood-lloyd': '雾岭伏击', 'fe7-ch23-eliwood-linus': '险谷截击',
  'fe7-ch25-eliwood-kenneth': '白花祭殿', 'fe7-ch25-eliwood-jerme': '暗巷杀阵',
  'fe7-ch27-eliwood': '灰烬回廊', 'fe7-ch30-eliwood': '断崖孤城', 'fe7-chfinal-1-eliwood': '黎明圣殿',
  'fe8-ch11-ephraim': '迷雾幽船', 'fe8-ch12-eirika': '寂静湖村', 'fe8-ch13-ephraim': '萤火山垒',
  'fe8-ch14-eirika': '白沙宫苑', 'fe8-ch14-ephraim': '暮色王庭', 'fe8-ch15-eirika': '流火沙海',
  'fe8-ch16-eirika': '湖畔废都', 'fe8-ch17-eirika': '断流古渡', 'fe8-ch20-eirika': '幽湖树海', 'fe8-chfinal-1-eirika': '终焉王座',
  'fe1-ch16': '林缘古堡', 'fe1-ch17': '密林王城', 'fe1-ch18': '长桥险关', 'fe1-ch19': '星辉神殿',
  'fe1-ch20': '铁壁王都', 'fe1-ch21': '群峰绝路', 'fe1-ch22': '苍穹祭坛',
  'fe1-ch23': '幽林魔殿', 'fe1-ch24': '龙影山脊', 'fe1-ch25': '深林龙座',
  'fe3-book1-ch11': '黄沙驿路', 'fe3-book1-ch12': '飞瀑关口', 'fe3-book1-ch13': '连弩长廊',
  'fe3-book1-ch14': '古都内城', 'fe3-book1-ch15': '焚风荒漠', 'fe3-book1-ch16': '湖心旧宫',
  'fe3-book1-ch17': '残垣密道', 'fe3-book1-ch18': '湖岸决战', 'fe3-book1-ch19': '龙眠祭殿', 'fe3-book1-ch20': '沉湖王庭',
  'fe2-map-01': '丘陵前哨', 'fe2-map-02': '赤岩要道', 'fe2-map-03': '荒野营垒', 'fe2-map-04': '断桥古关',
  'fe2-map-05': '熔炉外城', 'fe2-map-06': '幽谷石牢', 'fe2-map-07': '裂地神庙',
  'fe2-map-08': '熔火长阶', 'fe2-map-09': '地底圣堂', 'fe2-map-10': '封魔遗城',
};

export const CLASSIC_MAPS: readonly ClassicMap[] = data.maps.map(map => {
  const name = CLASSIC_MAP_NAMES[map.id];
  if (!name) throw new Error(`经典地图缺少场景名称 ${map.id}`);
  return { ...map, name };
});
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
