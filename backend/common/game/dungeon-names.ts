// Player-facing dungeon names shared by menus, story clues and battle headers.
// Keep this module independent of map catalogs so the UI only loads the names it needs.
const REGIONAL_DUNGEONS = [
  { name: '奥伦烽火', stages: ['麦野前哨', '烽火粮道'] },
  { name: '希尔瓦迷林', stages: ['幽林隘口', '古树营垒'] },
  { name: '托尔加深矿', stages: ['碎岩矿道', '熔炉腹地'] },
  { name: '瓦恩铁壁', stages: ['断桥外垒', '铁壁内城'] },
  { name: '莱斯米尔暗潮', stages: ['迷雾渡口', '沉湖水寨'] },
  { name: '泽拉斯遗城', stages: ['残垣古道', '秘法回廊'] },
  { name: '巴尔格兽牙', stages: ['兽牙山径', '祖灵石寨'] },
  { name: '斯凯恩断翼', stages: ['风切栈道', '断翼崖堡'] },
  { name: '萨鲁恩余烬', stages: ['黄沙炉道', '余烬工坊'] },
  { name: '德拉克莫龙巢', stages: ['龙骨谷口', '龙脉深窟'] },
  { name: '莫尔达冥庭', stages: ['长夜墓道', '封印灵堂'] },
  { name: '赛勒斯汀星门', stages: ['星辉长阶', '轮回回廊'] },
] as const;

export function regionalDungeon(region: number) {
  if (!Number.isInteger(region) || region < 1 || region > REGIONAL_DUNGEONS.length) throw new Error(`未知副本地区 ${region}`);
  return REGIONAL_DUNGEONS[region - 1];
}

export function regionalDungeonName(region: number): string {
  return regionalDungeon(region).name;
}

export const CLASSIC_DUNGEON_NAMES = {
  'clx-fe1': '幽林龙殿', 'clx-fe2': '熔火遗城', 'clx-fe3': '湖光王座',
  'clx-fe6': '古林封印', 'clx-fe7': '灰烬圣殿', 'clx-fe8': '冥湖树海',
} as const;
