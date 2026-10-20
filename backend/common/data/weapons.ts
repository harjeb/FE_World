import type { MoveType, Rank, Stats, WeaponType } from './types.ts';
import type { SkillId } from './skills.ts';
import { EQUIPMENT_ART_LINKS, EXPANDED_WEAPONS } from './expanded-weapons.ts';

export interface WeaponInstance { id: WeaponId; durability: number; maxDurability: number; refinement?: number }

// Normal physical attacks are free; arts spend the carried weapon instance's durability.
export interface Weapon {
  name: string;
  type: WeaponType;
  rank: Rank;
  might: number;
  hit: number;
  weight: number;
  crit: number;
  range: readonly [number, number];
  effective?: readonly MoveType[];
  effectiveRoutes?: readonly ('beast' | 'dragon')[];
  brave?: boolean;
  // Staves: heal = 'mag10' restores 魔 + 10, 'full' restores all HP; magRange caps range at 魔 ÷ 2.
  // 物理武器耐久／法术书次数由单位实例保存；未填按类型默认。
  maxDurability?: number;
  maxCharges?: number;
  heal?: 'mag10' | 'full';
  // 复原杖：解除睡眠、沉默、混乱；不改变 HP 上限。
  cure?: boolean;
  magRange?: boolean;
  note?: string;
  // 穿戴授予：技能不占五格，成长在升级结算时叠加；卸下即失效。
  grants?: { skill?: SkillId; growth?: Partial<Stats>; arts?: readonly { art: string; minimumRefinement: number }[] };
  // 特殊装备效果（docs/22 §5、docs/27 §3）。普通攻击与反击按武器自身规则；主动战技按战技自己的规则，
  // 只有 artHit／artDrain 明确作用于战技。
  // 魔力伤害：普通攻击／反击按 魔 对 魔防（龙石类型本身就是魔力）。
  magic?: boolean;
  // 伤害结算的防御属性；缺省时魔力对魔防、物理对防。玻璃车轮等魔法以魔力对物防。
  defense?: 'def' | 'res';
  // 特效标签：flying/mounted/armored 走 effective，beast/dragon 走 effectiveRoutes，demon 为明确魔物标签。
  effectiveTags?: readonly 'demon'[];
  // 固定段数：一次施放打 hits 段，不再速度追击或勇者连击；noFollowUp 只禁速度追击。
  hits?: number;
  noFollowUp?: boolean;
  // 命中且目标存活时的附加效果（毒／定身／速度降低），按目标免疫过滤。
  onHit?: { statuses?: readonly WeaponAilment[]; debuff?: { stat: 'spd'; amount: number } };
  // 按本击实际扣血回复的比例；石化或禁疗时为 0。
  drain?: number;
  // 本击忽略目标魔防数值（地形、技能与不朽盾照常）。
  ignoreRes?: boolean;
  // 反噬：普通攻击／反击命中时有（31 − 幸运）% 改由出手者自己承受这次伤害。
  backlash?: boolean;
  // 逆克制：本次交战的剑枪斧克制反转（双方都持有时互相抵消）。
  reaver?: boolean;
  // 目标显式配置的冥府加护对这把武器无效；不影响不朽盾或剧情无敌。
  purify?: boolean;
  // 使用主动武器战技时命中加成。
  artHit?: number;
  // 使用这把武器时的回避／魔防加成。
  bonus?: { avoid?: number; res?: number };
  // 敌方发起交战（本单位为防守方）时的加成。
  guard?: { def?: number; attack?: number };
  // 主类别以外还须达到的熟练度（全部满足才能使用；副类不要求现职业权限）。
  requires?: readonly { type: WeaponType; rank: Rank }[];
  // 只允许以这把武器发动这些战技。
  exclusiveArts?: readonly string[];
  // 以这把武器发动指定战技时的吸血比例（替换战技原比例，不相加）。
  artDrain?: Readonly<Record<string, number>>;
  // 治疗基值（回复 魔 + healBase）；area 时回复射程内全部受伤友军。
  healBase?: number;
  area?: boolean;
  // 状态杖：基础命中与施加的状态。
  status?: { kind: 'sleep' | 'silence'; hit: number };
}

export type WeaponAilment = 'poison' | 'root' | 'silence' | 'confusion';

const FLYING = ['flying'] as const;

const BASE_TABLE = {
  // docs/22: retain old IDs below as well, so existing saves keep their gear.
  slim_sword: { name: '细剑', type: 'sword', rank: 'E', might: 3, hit: 100, weight: 2, crit: 5, range: [1, 1], maxDurability: 40 },
  rapier: { name: '刺剑', type: 'sword', rank: 'D', might: 6, hit: 85, weight: 5, crit: 5, range: [1, 1], maxDurability: 30, effective: ['mounted', 'armored'] },
  armor_sword: { name: '破甲剑', type: 'sword', rank: 'D', might: 7, hit: 75, weight: 9, crit: 0, range: [1, 1], maxDurability: 30, effective: ['armored'] },
  wo_dao: { name: '倭刀适配', type: 'sword', rank: 'C', might: 6, hit: 85, weight: 5, crit: 30, range: [1, 1], maxDurability: 20 },
  devil_sword: { name: '反噬剑', type: 'sword', rank: 'D', might: 16, hit: 85, weight: 10, crit: 0, range: [1, 1], maxDurability: 25, backlash: true, note: '反噬：普通攻击／反击命中时有（31−幸运）% 改由自己承受，不朽盾照常保命' },
  lancereaver: { name: '逆枪剑', type: 'sword', rank: 'C', might: 8, hit: 75, weight: 9, crit: 0, range: [1, 1], maxDurability: 25, reaver: true, note: '逆克制：本次交战剑枪斧克制反转' },
  slim_lance: { name: '细枪', type: 'lance', rank: 'E', might: 4, hit: 95, weight: 5, crit: 5, range: [1, 1], maxDurability: 40 },
  heavy_spear: { name: '重破甲枪', type: 'lance', rank: 'C', might: 10, hit: 65, weight: 14, crit: 0, range: [1, 1], maxDurability: 25, effective: ['armored'] },
  poleaxe: { name: '斩马斧', type: 'axe', rank: 'D', might: 9, hit: 65, weight: 13, crit: 0, range: [1, 1], maxDurability: 30, effective: ['mounted'] },
  tomahawk: { name: '远投战斧', type: 'axe', rank: 'B', might: 12, hit: 60, weight: 15, crit: 0, range: [1, 2], maxDurability: 20 },
  magic_bow: { name: '魔法弓', type: 'bow', rank: 'B', might: 10, hit: 75, weight: 9, crit: 0, range: [2, 2], maxDurability: 25, effective: FLYING, magic: true, note: '魔力对魔防；弓类飞行特效；普攻免费，战技耗耐久' },
  poison_dagger: { name: '毒短刀', type: 'sword', rank: 'C', might: 5, hit: 80, weight: 4, crit: 0, range: [1, 2], maxDurability: 30, onHit: { statuses: ['poison'] }, note: '普通攻击／反击命中附毒，毒抗免疫' },
  silver_dagger: { name: '银短刀', type: 'sword', rank: 'A', might: 10, hit: 85, weight: 5, crit: 5, range: [1, 2], maxDurability: 20 },
  steel_gauntlet: { name: '钢拳套', type: 'fist', rank: 'D', might: 6, hit: 80, weight: 6, crit: 0, range: [1, 1], maxDurability: 35, brave: true },
  killer_gauntlet: { name: '必杀拳套', type: 'fist', rank: 'C', might: 5, hit: 80, weight: 5, crit: 25, range: [1, 1], maxDurability: 25, brave: true },
  beastkiller: { name: '猎兽剑', type: 'sword', rank: 'D', might: 6, hit: 80, weight: 7, crit: 0, range: [1, 1], effectiveRoutes: ['beast'], note: '对兽人特效' },
  dragonslayer: { name: '屠龙剑', type: 'sword', rank: 'D', might: 6, hit: 80, weight: 7, crit: 0, range: [1, 1], effectiveRoutes: ['dragon'], note: '对龙人特效，不针对龙骑士' },
  gauntlet: { name: '铁拳套', type: 'fist', rank: 'E', might: 4, hit: 90, weight: 3, crit: 0, range: [1, 1], brave: true },
  dagger: { name: '短刀', type: 'sword', rank: 'E', might: 5, hit: 90, weight: 3, crit: 5, range: [1, 1] },
  beast_claw: { name: '兽爪', type: 'beast', rank: 'E', might: 8, hit: 80, weight: 7, crit: 0, range: [1, 1] },
  dragonstone: { name: '龙石', type: 'dragon', rank: 'E', might: 7, hit: 80, weight: 8, crit: 0, range: [1, 1], note: '魔力对魔防' },
  iron_sword: { name: '铁剑', type: 'sword', rank: 'E', might: 5, hit: 90, weight: 5, crit: 0, range: [1, 1] },
  steel_sword: { name: '钢剑', type: 'sword', rank: 'D', might: 8, hit: 75, weight: 10, crit: 0, range: [1, 1] },
  horseslayer: { name: '斩马刀', type: 'sword', rank: 'D', might: 6, hit: 70, weight: 9, crit: 0, range: [1, 1], effective: ['mounted'], note: '对骑乘特效' },
  killing_edge: { name: '杀手剑', type: 'sword', rank: 'C', might: 7, hit: 75, weight: 7, crit: 30, range: [1, 1] },
  silver_sword: { name: '银剑', type: 'sword', rank: 'A', might: 13, hit: 80, weight: 8, crit: 0, range: [1, 1] },
  brave_sword: { name: '勇者之剑', type: 'sword', rank: 'A', might: 9, hit: 75, weight: 12, crit: 0, range: [1, 1], brave: true, note: '连击' },
  levin_sword: { name: '雷电剑', type: 'sword', rank: 'B', might: 8, hit: 80, weight: 9, crit: 5, range: [1, 2], magic: true, note: '魔法剑：普通攻击魔力对魔防，仍需剑权限' },
  short_spear: { name: '短枪', type: 'lance', rank: 'D', might: 6, hit: 75, weight: 9, crit: 0, range: [1, 2] },
  hammer: { name: '战锤', type: 'axe', rank: 'D', might: 8, hit: 55, weight: 15, crit: 5, range: [1, 1], effective: ['armored'] },
  silver_gauntlet: { name: '银手甲', type: 'fist', rank: 'A', might: 10, hit: 85, weight: 5, crit: 5, range: [1, 1] },
  beaststone_plus: { name: '高阶兽媒介', type: 'beast', rank: 'B', might: 12, hit: 80, weight: 10, crit: 0, range: [1, 1], maxDurability: 25, note: '兽人本族限定，仍有兽弱点' },
  dragonstone_plus: { name: '高阶龙媒介', type: 'dragon', rank: 'B', might: 11, hit: 80, weight: 11, crit: 0, range: [1, 1], maxDurability: 25, note: '龙人本族限定，魔力对魔防' },
  beast_fang: { name: '兽牙', type: 'beast', rank: 'D', might: 9, hit: 85, weight: 6, crit: 0, range: [1, 1] },
  dragon_breath: { name: '龙息', type: 'dragon', rank: 'A', might: 13, hit: 80, weight: 10, crit: 0, range: [1, 1] },
  iron_blade: { name: '铁刃', type: 'sword', rank: 'E', might: 6, hit: 85, weight: 6, crit: 0, range: [1, 1] },
  steel_blade: { name: '钢刃', type: 'sword', rank: 'D', might: 9, hit: 75, weight: 10, crit: 0, range: [1, 1] },
  silver_blade: { name: '银刃', type: 'sword', rank: 'A', might: 14, hit: 80, weight: 9, crit: 0, range: [1, 1] },
  brave_lance: { name: '勇者枪', type: 'lance', rank: 'A', might: 10, hit: 70, weight: 14, crit: 0, range: [1, 1], maxDurability: 20, brave: true, note: '连击；普攻连击不额外扣耐久' },
  brave_axe: { name: '勇者斧', type: 'axe', rank: 'A', might: 11, hit: 60, weight: 16, crit: 0, range: [1, 1], maxDurability: 20, brave: true, note: '连击' },
  brave_bow: { name: '勇者弓', type: 'bow', rank: 'A', might: 9, hit: 75, weight: 10, crit: 0, range: [2, 2], maxDurability: 20, effective: FLYING, brave: true, note: '飞行特效、连击' },
  thunder_fang: { name: '雷牙', type: 'beast', rank: 'B', might: 11, hit: 80, weight: 7, crit: 5, range: [1, 1] },
  ice_breath: { name: '冰息', type: 'dragon', rank: 'B', might: 12, hit: 80, weight: 10, crit: 0, range: [1, 1] },
  killer_blade: { name: '必杀刃', type: 'sword', rank: 'C', might: 8, hit: 75, weight: 8, crit: 30, range: [1, 1], grants: { skill: 'keen' } },
  master_lance: { name: '统率枪', type: 'lance', rank: 'S', might: 16, hit: 80, weight: 11, crit: 5, range: [1, 1] },
  royal_sword: { name: '王权剑', type: 'sword', rank: 'SS', might: 16, hit: 85, weight: 7, crit: 10, range: [1, 1], note: 'SS 熟练度武器', grants: { skill: 'opening', growth: { spd: 5 } } },
  iron_lance: { name: '铁枪', type: 'lance', rank: 'E', might: 7, hit: 80, weight: 8, crit: 0, range: [1, 1] },
  steel_lance: { name: '钢枪', type: 'lance', rank: 'D', might: 10, hit: 70, weight: 13, crit: 0, range: [1, 1] },
  javelin: { name: '投枪', type: 'lance', rank: 'D', might: 6, hit: 65, weight: 11, crit: 0, range: [1, 2] },
  armorslayer: { name: '破甲枪', type: 'lance', rank: 'D', might: 7, hit: 70, weight: 12, crit: 0, range: [1, 1], effective: ['armored'], note: '对重甲特效' },
  killer_lance: { name: '杀手枪', type: 'lance', rank: 'C', might: 8, hit: 70, weight: 9, crit: 30, range: [1, 1] },
  silver_lance: { name: '银枪', type: 'lance', rank: 'A', might: 14, hit: 75, weight: 10, crit: 0, range: [1, 1] },
  divine_lance: { name: '神授枪', type: 'lance', rank: 'SSS', might: 18, hit: 85, weight: 9, crit: 10, range: [1, 2], note: 'SSS 熟练度武器', grants: { skill: 'steadfast' } },
  iron_axe: { name: '铁斧', type: 'axe', rank: 'E', might: 8, hit: 75, weight: 10, crit: 0, range: [1, 1] },
  steel_axe: { name: '钢斧', type: 'axe', rank: 'D', might: 11, hit: 65, weight: 15, crit: 0, range: [1, 1] },
  hand_axe: { name: '手斧', type: 'axe', rank: 'D', might: 7, hit: 60, weight: 12, crit: 0, range: [1, 2] },
  killer_axe: { name: '杀手斧', type: 'axe', rank: 'C', might: 9, hit: 65, weight: 11, crit: 30, range: [1, 1] },
  silver_axe: { name: '银斧', type: 'axe', rank: 'A', might: 15, hit: 70, weight: 12, crit: 0, range: [1, 1] },
  iron_bow: { name: '铁弓', type: 'bow', rank: 'E', might: 6, hit: 85, weight: 5, crit: 0, range: [2, 2], effective: FLYING },
  steel_bow: { name: '钢弓', type: 'bow', rank: 'D', might: 9, hit: 70, weight: 9, crit: 0, range: [2, 2], effective: FLYING },
  killer_bow: { name: '杀手弓', type: 'bow', rank: 'C', might: 9, hit: 75, weight: 7, crit: 30, range: [2, 2], effective: FLYING },
  longbow: { name: '长弓', type: 'bow', rank: 'B', might: 5, hit: 65, weight: 10, crit: 0, range: [2, 3], effective: FLYING },
  silver_bow: { name: '银弓', type: 'bow', rank: 'A', might: 13, hit: 75, weight: 6, crit: 0, range: [2, 2], effective: FLYING },
  fire: { name: '火焰', type: 'tome', rank: 'E', might: 5, hit: 90, weight: 4, crit: 0, range: [1, 2] },
  thunder: { name: '雷霆', type: 'tome', rank: 'D', might: 8, hit: 80, weight: 6, crit: 5, range: [1, 2], maxCharges: 15 },
  wind: { name: '风刃', type: 'tome', rank: 'C', might: 6, hit: 85, weight: 3, crit: 0, range: [1, 2], maxCharges: 15, effective: FLYING, note: '对飞行特效', grants: { skill: 'nimble' } },
  flame_lance: { name: '炎枪', type: 'tome', rank: 'B', might: 12, hit: 75, weight: 10, crit: 0, range: [1, 2] },
  heal: { name: '治疗杖', type: 'staff', rank: 'E', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 1], heal: 'mag10', note: '回复 魔 + 10' },
  recover: { name: '恢复杖', type: 'staff', rank: 'C', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 1], heal: 'full', note: '回复全部 HP' },
  restore: { name: '复原杖', type: 'staff', rank: 'C', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 1], heal: 'mag10', cure: true, note: '解除睡眠/沉默/混乱' },
  fortify: { name: '群疗杖', type: 'staff', rank: 'A', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 3], maxCharges: 5, heal: 'mag10', healBase: 5, area: true, note: '1–3 格内受伤友军各回复 魔 + 5' },
  rescue_staff: { name: '救援杖', type: 'staff', rank: 'B', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 4], maxCharges: 5, note: '把 1–4 格内友军拉到施法者相邻空格' },
  warp_staff: { name: '传送杖', type: 'staff', rank: 'A', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 1], maxCharges: 3, note: '把相邻友军送到施法者 4 格内的空格；不刷新目标行动' },
  silence_staff: { name: '沉默杖', type: 'staff', rank: 'B', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 4], maxCharges: 5, status: { kind: 'silence', hit: 60 }, note: '命中后 2 个目标阶段不能施法／用杖；首领命中减半' },
  sleep_staff: { name: '睡眠杖', type: 'staff', rank: 'B', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 4], maxCharges: 5, status: { kind: 'sleep', hit: 60 }, note: '命中后睡过目标的下 1 个阶段，受伤即醒；首领命中减半' },
  physic: { name: '远疗杖', type: 'staff', rank: 'B', might: 0, hit: 0, weight: 0, crit: 0, range: [1, 1], heal: 'mag10', magRange: true, note: '射程 1–魔÷2，回复 魔 + 10' },
} satisfies Record<string, Weapon>;

// Keep canonical series labels here: expanded-weapons.ts is generated by
// tools/build/expanded-weapons.py from the audited expansion catalog.
const SERIES_LABELS = {
  fw_weapon_1: { ...EXPANDED_WEAPONS.fw_weapon_1, name: '木剑' },
  fw_weapon_2: { ...EXPANDED_WEAPONS.fw_weapon_2, name: '铜剑' },
  fw_weapon_24: { ...EXPANDED_WEAPONS.fw_weapon_24, name: '木枪' },
  fw_weapon_25: { ...EXPANDED_WEAPONS.fw_weapon_25, name: '铜枪' },
  fw_weapon_52: { ...EXPANDED_WEAPONS.fw_weapon_52, name: '木斧' },
  fw_weapon_53: { ...EXPANDED_WEAPONS.fw_weapon_53, name: '铜斧' },
  fw_weapon_72: { ...EXPANDED_WEAPONS.fw_weapon_72, name: '木弓' },
  fw_weapon_73: { ...EXPANDED_WEAPONS.fw_weapon_73, name: '铜弓' },
  fw_weapon_89: { ...EXPANDED_WEAPONS.fw_weapon_89, name: '木拳套' },
  fw_weapon_90: { ...EXPANDED_WEAPONS.fw_weapon_90, name: '铜拳套' },
} satisfies Record<string, Weapon>;

export const TABLE = { ...BASE_TABLE, ...EXPANDED_WEAPONS, ...SERIES_LABELS } satisfies Record<string, Weapon>;
export type WeaponId = keyof typeof TABLE;
export const WEAPONS: Record<WeaponId, Weapon> = Object.fromEntries(
  (Object.entries(TABLE) as [string, Weapon][]).map(([id, base]) => {
    const arts = EQUIPMENT_ART_LINKS.filter(link => link.projectWeaponId === id)
      .map(link => ({ art: link.artId, minimumRefinement: link.minimumRefinement }));
    const w = arts.length ? { ...base, grants: { ...base.grants, arts } } : base;
    if (w.type === 'tome') return [id, { ...w, maxCharges: w.maxCharges ?? 20 }];
    if (w.type === 'staff') return [id, { ...w, maxCharges: w.maxCharges ?? 10 }];
    return [id, { ...w, maxDurability: w.maxDurability ?? 40 }];
  }),
) as Record<WeaponId, Weapon>;

// Material tiers are independent of proficiency rank. Existing IDs retain their stats.
export const WEAPON_SERIES: Record<'sword' | 'lance' | 'axe' | 'bow' | 'fist', readonly [WeaponId, WeaponId, WeaponId, WeaponId, WeaponId]> = {
  sword: ['fw_weapon_1', 'fw_weapon_2', 'iron_sword', 'steel_sword', 'silver_sword'],
  lance: ['fw_weapon_24', 'fw_weapon_25', 'iron_lance', 'steel_lance', 'silver_lance'],
  axe: ['fw_weapon_52', 'fw_weapon_53', 'iron_axe', 'steel_axe', 'silver_axe'],
  bow: ['fw_weapon_72', 'fw_weapon_73', 'iron_bow', 'steel_bow', 'silver_bow'],
  fist: ['fw_weapon_89', 'fw_weapon_90', 'gauntlet', 'steel_gauntlet', 'silver_gauntlet'],
};

export function weaponSeriesTier(id: WeaponId): number | undefined {
  for (const series of Object.values(WEAPON_SERIES)) {
    const index = series.indexOf(id);
    if (index !== -1) return index + 1;
  }
  return undefined;
}

export function weapon(id: WeaponId): Weapon {
  return WEAPONS[id];
}

// Sword beats axe, axe beats lance, lance beats sword; bows, tomes and staves sit outside the triangle.
const BEATS: Partial<Record<WeaponType, WeaponType>> = { sword: 'axe', axe: 'lance', lance: 'sword' };

export function triangle(mine: WeaponType, theirs: WeaponType): -1 | 0 | 1 {
  if (BEATS[mine] === theirs) return 1;
  if (BEATS[theirs] === mine) return -1;
  return 0;
}

export const ITEMS = {
  vulnerary: { name: '伤药', heal: 10, uses: 3 },
  // 不朽盾（docs/00 §7.2）：不是治疗道具，只在致死时自动触发；shield 标记让它不出现在道具菜单。
  immortal_shield: { name: '不朽盾', heal: 0, uses: 1, shield: true },
  // 特效药：回复全部 HP（受每名角色 HP 上限约束，实际回复 min(缺口, heal)）。
  elixir: { name: '特效药', heal: 999, uses: 1 },
  // 解毒药：解除战技造成的中毒（cure 列出可解除的战技异常状态）；不回复 HP。
  antidote: { name: '解毒药', heal: 0, uses: 2, cure: ['poison'] },
} as const;
export type ItemId = keyof typeof ITEMS;
