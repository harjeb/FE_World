import { nextU32, seedRng } from '../engine/rng.ts';

export type MaterialCategory = 'herb' | 'ore' | 'wood';
export type MaterialTier = 1 | 2 | 3 | 4 | 5 | 6;
export interface MaterialDef {
  name: string; category: MaterialCategory; tier: MaterialTier; rare: boolean;
  regions: number[]; price: number; note: string;
}

// Explicit habitats overlap; the first region is the species' primary habitat.
export const MATERIALS = {
  herb: { name: '止血草', category: 'herb', tier: 1, rare: false, regions: [1, 2, 5], price: 80, note: '用于炼药与配制补给' },
  mint: { name: '薄荷', category: 'herb', tier: 1, rare: false, regions: [1, 4, 5], price: 80, note: '用于炼药与配制补给' },
  yarrow: { name: '蓍草', category: 'herb', tier: 1, rare: false, regions: [2, 3, 6], price: 80, note: '用于炼药与配制补给' },
  moon_dew: { name: '月露草', category: 'herb', tier: 1, rare: true, regions: [1, 5, 8], price: 240, note: '用于炼药与配制补给' },
  ginseng: { name: '人参', category: 'herb', tier: 2, rare: false, regions: [2, 5, 7], price: 140, note: '用于炼药与配制补给' },
  angelica: { name: '当归', category: 'herb', tier: 2, rare: false, regions: [3, 5, 6], price: 140, note: '用于炼药与配制补给' },
  sage: { name: '鼠尾草', category: 'herb', tier: 2, rare: false, regions: [2, 4, 8], price: 140, note: '用于炼药与配制补给' },
  blood_lotus: { name: '血莲', category: 'herb', tier: 2, rare: true, regions: [2, 6, 10], price: 420, note: '用于炼药与配制补给' },
  astragalus: { name: '黄芪', category: 'herb', tier: 3, rare: false, regions: [3, 6, 9], price: 240, note: '用于炼药与配制补给' },
  honeysuckle: { name: '金银花', category: 'herb', tier: 3, rare: false, regions: [4, 5, 8], price: 240, note: '用于炼药与配制补给' },
  spirit_leaf: { name: '灵叶', category: 'herb', tier: 3, rare: false, regions: [3, 7, 10], price: 240, note: '用于炼药与配制补给' },
  jade_orchid: { name: '玉兰', category: 'herb', tier: 3, rare: true, regions: [3, 8, 11], price: 720, note: '用于炼药与配制补给' },
  snow_ginseng: { name: '雪参', category: 'herb', tier: 4, rare: false, regions: [7, 8, 11], price: 380, note: '用于炼药与配制补给' },
  fire_blossom: { name: '火绒花', category: 'herb', tier: 4, rare: false, regions: [6, 9, 12], price: 380, note: '用于炼药与配制补给' },
  nightshade: { name: '夜影草', category: 'herb', tier: 4, rare: false, regions: [4, 8, 10], price: 380, note: '用于炼药与配制补给' },
  phoenix_grass: { name: '凤尾草', category: 'herb', tier: 4, rare: true, regions: [6, 10, 12], price: 1140, note: '用于炼药与配制补给' },
  dragon_root: { name: '龙根', category: 'herb', tier: 5, rare: false, regions: [8, 9, 12], price: 600, note: '用于炼药与配制补给' },
  star_anise: { name: '星茴草', category: 'herb', tier: 5, rare: false, regions: [7, 10, 11], price: 600, note: '用于炼药与配制补给' },
  sun_petal: { name: '日光花', category: 'herb', tier: 5, rare: false, regions: [6, 9, 11], price: 600, note: '用于炼药与配制补给' },
  spirit_lotus: { name: '灵莲', category: 'herb', tier: 5, rare: true, regions: [8, 10, 12], price: 1800, note: '用于炼药与配制补给' },
  celestial_root: { name: '天根', category: 'herb', tier: 6, rare: false, regions: [9, 11, 12], price: 900, note: '用于炼药与配制补给' },
  void_moss: { name: '虚空苔', category: 'herb', tier: 6, rare: false, regions: [8, 10, 12], price: 900, note: '用于炼药与配制补给' },
  dawn_flower: { name: '黎明花', category: 'herb', tier: 6, rare: false, regions: [7, 11, 12], price: 900, note: '用于炼药与配制补给' },
  immortal_bloom: { name: '不凋花', category: 'herb', tier: 6, rare: true, regions: [10, 11, 12], price: 2700, note: '用于炼药与配制补给' },
  sandstone: { name: '砂岩', category: 'ore', tier: 1, rare: false, regions: [1, 3, 6, 12], price: 80, note: '用于锻造、矿物配剂与精炼' },
  limestone: { name: '石灰石', category: 'ore', tier: 1, rare: false, regions: [1, 2, 9], price: 80, note: '用于锻造、矿物配剂与精炼' },
  clay: { name: '陶土', category: 'ore', tier: 1, rare: false, regions: [1, 4, 5], price: 80, note: '用于锻造、矿物配剂与精炼' },
  amber: { name: '琥珀', category: 'ore', tier: 1, rare: true, regions: [2, 5, 8], price: 240, note: '用于锻造、矿物配剂与精炼' },
  copper_ore: { name: '铜矿', category: 'ore', tier: 2, rare: false, regions: [2, 3, 9], price: 140, note: '用于锻造、矿物配剂与精炼' },
  tin_ore: { name: '锡矿', category: 'ore', tier: 2, rare: false, regions: [2, 6, 7], price: 140, note: '用于锻造、矿物配剂与精炼' },
  zinc_ore: { name: '锌矿', category: 'ore', tier: 2, rare: false, regions: [3, 4, 9], price: 140, note: '用于锻造、矿物配剂与精炼' },
  malachite: { name: '孔雀石', category: 'ore', tier: 2, rare: true, regions: [2, 8, 10], price: 420, note: '用于锻造、矿物配剂与精炼' },
  ore: { name: '铁矿', category: 'ore', tier: 3, rare: false, regions: [3, 6, 9], price: 240, note: '用于锻造、矿物配剂与精炼' },
  magnetite: { name: '磁铁矿', category: 'ore', tier: 3, rare: false, regions: [3, 7, 11], price: 240, note: '用于锻造、矿物配剂与精炼' },
  hematite: { name: '赤铁矿', category: 'ore', tier: 3, rare: false, regions: [4, 6, 9], price: 240, note: '用于锻造、矿物配剂与精炼' },
  star_iron: { name: '星铁', category: 'ore', tier: 3, rare: true, regions: [3, 9, 12], price: 720, note: '用于锻造、矿物配剂与精炼' },
  coal: { name: '煤炭', category: 'ore', tier: 4, rare: false, regions: [6, 9, 10], price: 380, note: '用于锻造、矿物配剂与精炼' },
  quartz: { name: '石英', category: 'ore', tier: 4, rare: false, regions: [4, 7, 11], price: 380, note: '用于锻造、矿物配剂与精炼' },
  sulfur: { name: '硫磺', category: 'ore', tier: 4, rare: false, regions: [6, 10, 12], price: 380, note: '用于锻造、矿物配剂与精炼' },
  obsidian: { name: '黑曜石', category: 'ore', tier: 4, rare: true, regions: [6, 9, 12], price: 1140, note: '用于锻造、矿物配剂与精炼' },
  silver_ore: { name: '银矿', category: 'ore', tier: 5, rare: false, regions: [9, 8, 11], price: 600, note: '用于锻造、矿物配剂与精炼' },
  gold_ore: { name: '金矿', category: 'ore', tier: 5, rare: false, regions: [7, 9, 12], price: 600, note: '用于锻造、矿物配剂与精炼' },
  platinum_ore: { name: '铂矿', category: 'ore', tier: 5, rare: false, regions: [8, 10, 11], price: 600, note: '用于锻造、矿物配剂与精炼' },
  mithril: { name: '秘银', category: 'ore', tier: 5, rare: true, regions: [9, 11, 12], price: 1800, note: '用于锻造、矿物配剂与精炼' },
  adamantite: { name: '精金', category: 'ore', tier: 6, rare: false, regions: [9, 11, 12], price: 900, note: '用于锻造、矿物配剂与精炼' },
  titanium_ore: { name: '钛矿', category: 'ore', tier: 6, rare: false, regions: [7, 10, 12], price: 900, note: '用于锻造、矿物配剂与精炼' },
  meteor_ore: { name: '陨矿', category: 'ore', tier: 6, rare: false, regions: [8, 11, 12], price: 900, note: '用于锻造、矿物配剂与精炼' },
  orichalcum: { name: '山铜', category: 'ore', tier: 6, rare: true, regions: [10, 11, 12], price: 2700, note: '用于锻造、矿物配剂与精炼' },
  wood: { name: '白杨木', category: 'wood', tier: 1, rare: false, regions: [1, 2, 5], price: 80, note: '用于武器木作、弓身与药杖' },
  willow: { name: '柳木', category: 'wood', tier: 1, rare: false, regions: [1, 4, 8, 10], price: 80, note: '用于武器木作、弓身与药杖' },
  birch: { name: '桦木', category: 'wood', tier: 1, rare: false, regions: [2, 5, 7, 11], price: 80, note: '用于武器木作、弓身与药杖' },
  fragrant_wood: { name: '香木', category: 'wood', tier: 1, rare: true, regions: [1, 5, 10], price: 240, note: '用于武器木作、弓身与药杖' },
  pine: { name: '松木', category: 'wood', tier: 2, rare: false, regions: [2, 7, 8], price: 140, note: '用于武器木作、弓身与药杖' },
  cedar: { name: '雪松木', category: 'wood', tier: 2, rare: false, regions: [2, 6, 11], price: 140, note: '用于武器木作、弓身与药杖' },
  elm: { name: '榆木', category: 'wood', tier: 2, rare: false, regions: [3, 4, 5], price: 140, note: '用于武器木作、弓身与药杖' },
  moon_willow: { name: '月柳木', category: 'wood', tier: 2, rare: true, regions: [2, 8, 10], price: 420, note: '用于武器木作、弓身与药杖' },
  hard_wood: { name: '硬木', category: 'wood', tier: 3, rare: false, regions: [3, 5, 8], price: 240, note: '用于武器木作、弓身与药杖' },
  oak: { name: '橡木', category: 'wood', tier: 3, rare: false, regions: [3, 6, 9], price: 240, note: '用于武器木作、弓身与药杖' },
  maple: { name: '枫木', category: 'wood', tier: 3, rare: false, regions: [4, 7, 10], price: 240, note: '用于武器木作、弓身与药杖' },
  ironwood: { name: '铁木', category: 'wood', tier: 3, rare: true, regions: [3, 9, 11], price: 720, note: '用于武器木作、弓身与药杖' },
  teak: { name: '柚木', category: 'wood', tier: 4, rare: false, regions: [5, 8, 10], price: 380, note: '用于武器木作、弓身与药杖' },
  walnut: { name: '胡桃木', category: 'wood', tier: 4, rare: false, regions: [4, 7, 9], price: 380, note: '用于武器木作、弓身与药杖' },
  cypress: { name: '柏木', category: 'wood', tier: 4, rare: false, regions: [6, 8, 11], price: 380, note: '用于武器木作、弓身与药杖' },
  bloodwood: { name: '血木', category: 'wood', tier: 4, rare: true, regions: [6, 10, 12], price: 1140, note: '用于武器木作、弓身与药杖' },
  ebony: { name: '乌木', category: 'wood', tier: 5, rare: false, regions: [8, 9, 10], price: 600, note: '用于武器木作、弓身与药杖' },
  rosewood: { name: '紫檀木', category: 'wood', tier: 5, rare: false, regions: [5, 9, 12], price: 600, note: '用于武器木作、弓身与药杖' },
  frostwood: { name: '霜木', category: 'wood', tier: 5, rare: false, regions: [7, 8, 11], price: 600, note: '用于武器木作、弓身与药杖' },
  spiritwood: { name: '灵木', category: 'wood', tier: 5, rare: true, regions: [8, 11, 12], price: 1800, note: '用于武器木作、弓身与药杖' },
  dragonwood: { name: '龙木', category: 'wood', tier: 6, rare: false, regions: [9, 10, 12], price: 900, note: '用于武器木作、弓身与药杖' },
  starwood: { name: '星木', category: 'wood', tier: 6, rare: false, regions: [8, 11, 12], price: 900, note: '用于武器木作、弓身与药杖' },
  sunwood: { name: '日轮木', category: 'wood', tier: 6, rare: false, regions: [7, 9, 11], price: 900, note: '用于武器木作、弓身与药杖' },
  worldtree_branch: { name: '世界树枝', category: 'wood', tier: 6, rare: true, regions: [10, 11, 12], price: 2700, note: '用于武器木作、弓身与药杖' },
} satisfies Record<string, MaterialDef>;

export type MaterialId = keyof typeof MATERIALS;
export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

export function materialTier(level: number): MaterialTier {
  if (!Number.isFinite(level) || level < 1) throw new RangeError('材料等级必须是大于等于 1 的有限数');
  return level >= 75 ? 6 : level >= 55 ? 5 : level >= 35 ? 4 : level >= 20 ? 3 : level >= 10 ? 2 : 1;
}

export function materialSources(region: number, level: number): MaterialId[] {
  if (!Number.isInteger(region) || region < 1 || region > 12) throw new RangeError('材料地区必须为 1–12');
  const tier = materialTier(level);
  return MATERIAL_IDS.filter(id => MATERIALS[id].tier <= tier && MATERIALS[id].regions.includes(region));
}

// Own random stream: gathering never consumes battle RNG. Rare species need a separate successful roll.
export function materialDrops(region: number, level: number, seed: string, rolls: number, rareChance = 0.08): { item: MaterialId; count: number }[] {
  const sources = materialSources(region, level);
  if (!Number.isInteger(rolls) || rolls < 0 || rolls > 10_000) throw new RangeError('材料采集次数必须为 0–10000 的整数');
  if (!Number.isFinite(rareChance) || rareChance < 0 || rareChance > 1) throw new RangeError('稀有概率必须为 0–1');
  const rng = seedRng(`materials:${region}:${level}:${seed}`);
  const common = sources.filter(id => !MATERIALS[id].rare);
  const rare = sources.filter(id => MATERIALS[id].rare);
  const counts = new Map<MaterialId, number>();
  for (let i = 0; i < rolls; i++) {
    const rareHit = nextU32(rng) / 4294967296 < rareChance;
    const pool = rareHit && rare.length ? rare : common;
    if (!pool.length) continue;
    const weights = pool.map(id => 2 ** MATERIALS[id].tier * (MATERIALS[id].regions[0] === region ? 2 : 1));
    let pick = nextU32(rng) / 4294967296 * weights.reduce((a, b) => a + b, 0);
    let item = pool[pool.length - 1];
    for (let j = 0; j < pool.length; j++) { pick -= weights[j]; if (pick < 0) { item = pool[j]; break; } }
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  return [...counts].map(([item, count]) => ({ item, count }));
}
