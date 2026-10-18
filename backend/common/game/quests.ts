import type { ItemKey } from './items.ts';
import { manualItem, spellbookItem } from './items.ts';
import type { CharacterId } from '../data/characters.ts';
import { regionById } from './calendar.ts';

const regionName = (id: number) => regionById(id).name;

// 地区任务（docs/20「地区任务、战斗目标与声望」）。完整核心链三地：希尔瓦林地(2)、托尔加丘陵(3)、莱斯米尔湖镇(5)。
//
// 目标类型：讨伐(rout)、占领(seize)、坚守(defend)、撤离(escape)、抢物资(gather)、护送(escort)。
export type QuestKind = 'rout' | 'seize' | 'defend' | 'escape' | 'gather' | 'escort';
export type QuestTier = 'short' | 'standard' | 'region';

export interface QuestReward { gold: number; reputation: number; items?: [ItemKey, number][] }

export interface Quest {
  id: string;
  region: number;
  name: string;
  objective: string;
  kind: QuestKind;
  tier: QuestTier;
  turnLimit: number;
  // 逐图敌军等级上限；不填按难度档默认。
  enemyLevelCap?: number;
  // 逐图出战人数上限；不填按 8 人。
  maxUnits?: number;
  // escape/gather 需要撤离的人数／箱子数（默认 1）。
  need?: number;
  requires?: { quest?: string; reputation?: number };
  reward: QuestReward;
  // 固定人物加入（docs/20 §5）：领取奖励时加入名册；已拥有则跳过（唯一性）。
  recruit?: CharacterId;
  // 经典地图任务：单图 scenarioId，或连续副本 scenarioIds（按顺序逐图创建战斗）。
  scenarioId?: string;
  scenarioIds?: string[];
  // 覆盖默认耗日；连续副本按 stageDays × 图数计算。
  costDays?: number;
  stageDays?: number;
  // 护送 NPC 的固定路线；不填则由战斗按撤离点寻路。
  npcRoute?: { x: number; y: number }[];
  nextObjective?: string;
  stageGoals?: ('seize' | 'rout' | 'boss')[];
  betweenMapHeal?: number;
  // 专属武器：任务首次领取时以实物入库，不进入普通商店。
  exclusive?: ItemKey;
  // 本任务简报／当地事件，不依赖随机文献。
  event?: string;
  classic?: { game: string; mapName: string; stageCount: number; adapted?: boolean };
}

// 耗日：短 1 / 标准 2 / 地区远征每图 2（普通 3 图共 6；经典副本按 3–4 图覆盖 costDays）。
export const QUEST_DAY_COST: Record<QuestTier, number> = { short: 1, standard: 2, region: 6 };
export const QUEST_LEVEL_CAP: Record<QuestTier, number> = { short: 30, standard: 50, region: 80 };
export const QUEST_MAX_UNITS: Record<QuestTier, number> = { short: 6, standard: 8, region: 8 };

const short = (id: string, region: number, name: string, objective: string, kind: QuestKind, requires?: Quest['requires'], need?: number): Quest =>
  ({ id, region, name, objective, kind, tier: 'short', turnLimit: 12, need, requires, reward: { gold: 800, reputation: 20 } });
const standard = (id: string, region: number, name: string, objective: string, kind: QuestKind, requires?: Quest['requires'], need?: number): Quest =>
  ({ id, region, name, objective, kind, tier: 'standard', turnLimit: 20, need, requires, reward: { gold: 1_600, reputation: 40 } });
const region6 = (id: string, region: number, name: string, objective: string, items: [ItemKey, number][], requires: Quest['requires'], recruit?: CharacterId): Quest =>
  ({ id, region, name, objective, kind: 'rout', tier: 'region', turnLimit: 24, requires, recruit, stageGoals: region % 2 === 0 ? ['seize', 'rout', 'boss'] : ['rout', 'seize', 'boss'], betweenMapHeal: 25, reward: { gold: 4_000, reputation: 100, items } });
const core = (id: string, region: number, name: string, objective: string, items: [ItemKey, number][], requires: Quest['requires']): Quest =>
  ({ ...region6(id, region, name, objective, items, requires), reward: { gold: 5_000, reputation: 80, items } });

export const QUESTS: Quest[] = [
  // 希尔瓦林地：木、弓、轻装（docs/20 §6）。
  short('gw1', 2, '林道侦察', '击败哨兵', 'rout'),
  standard('gw2', 2, '护送采集队撤离', '护送采集队抵达撤离点', 'escort', { quest: 'gw1' }),
  standard('gw3', 2, '抢回被截木材', '带至少 1 箱木材撤离', 'gather', { quest: 'gw2' }, 1),
  short('gw4', 2, '接应落单猎手', '全队抵达撤离点', 'escape', { quest: 'gw3', reputation: 100 }, 1),
  standard('gw5', 2, '防守林间营地', '坚守营地', 'defend', { quest: 'gw4', reputation: 100 }),
  region6('gw6', 2, '林间远征', '清剿林中据点', [['killer_bow', 1], ['wood', 8]], { quest: 'gw5', reputation: 100 }, 'ren'),
  core('gw7', 2, '古林界标', '夺回被侵蚀的界标', [], { quest: 'gw6', reputation: 250 }),
  core('gw8', 2, '林心守夜', '守住林心祭坛', [], { quest: 'gw7', reputation: 250 }),
  core('gw9', 2, `${regionName(2)}·核心`, '击败侵蚀守林者', [['legacy_stone_growth', 1], ['immortal_shield', 1]], { quest: 'gw8', reputation: 250 }),
  // 托尔加丘陵：矿、重甲、破甲（docs/20 §6）。
  short('ih1', 3, '矿道清障', '讨伐矿道敌兵', 'rout'),
  standard('ih2', 3, '占领矿道入口', '压制入口', 'seize', { quest: 'ih1' }),
  standard('ih3', 3, '防守运输站', '坚守运输站', 'defend', { quest: 'ih2' }),
  short('ih4', 3, '撤离被困矿工', '护送矿工抵达撤离点', 'escort', { quest: 'ih3', reputation: 100 }),
  standard('ih5', 3, '抢运矿石', '带至少 1 箱矿石撤离', 'gather', { quest: 'ih4', reputation: 100 }, 1),
  region6('ih6', 3, '矿区远征', '清剿矿场守军', [['killer_lance', 1], ['ore', 8]], { quest: 'ih5', reputation: 100 }, 'ig'),
  core('ih7', 3, '深井回声', '压制深井入口', [], { quest: 'ih6', reputation: 250 }),
  core('ih8', 3, '熔炉守卫', '守住熔炉', [], { quest: 'ih7', reputation: 250 }),
  core('ih9', 3, `${regionName(3)}·核心`, '击败熔炉巨像', [['legacy_stone_numeric', 1], ['immortal_shield', 1]], { quest: 'ih8', reputation: 250 }),
  // 莱斯米尔湖镇：药草、恢复、治疗（docs/20 §6）。
  short('wl1', 5, '渡口求援', '全队抵达撤离点', 'escape'),
  standard('wl2', 5, '护送伤员撤离', '护送伤员抵达撤离点', 'escort', { quest: 'wl1' }),
  standard('wl3', 5, '保卫药草田', '坚守药草田', 'defend', { quest: 'wl2' }),
  short('wl4', 5, '抢救补给箱', '带至少 1 箱补给撤离', 'gather', { quest: 'wl3', reputation: 100 }, 1),
  standard('wl5', 5, '占领被封渡口', '压制渡口', 'seize', { quest: 'wl4', reputation: 100 }),
  region6('wl6', 5, '渡口远征', '清剿渡口守军', [['recover', 1], ['herb', 8]], { quest: 'wl5', reputation: 100 }, 'mira'),
  core('wl7', 5, '潮汐碑文', '夺回潮汐碑', [], { quest: 'wl6', reputation: 250 }),
  core('wl8', 5, '药田长夜', '守住药田', [], { quest: 'wl7', reputation: 250 }),
  core('wl9', 5, `${regionName(5)}·核心`, '击败潮汐祭司', [['reincarnation_core', 1], ['immortal_shield', 1]], { quest: 'wl8', reputation: 250 }),
];

import { CLASSIC_QUESTS } from './classic-quests.ts';

// 经典地图任务与地区任务共用同一任务/副本流程（docs/24）。
export const BASE_QUESTS: readonly Quest[] = QUESTS;
export const ALL_QUESTS: Quest[] = [...QUESTS, ...CLASSIC_QUESTS];

export function questById(id: string): Quest | undefined {
  return ALL_QUESTS.find(q => q.id === id);
}

export function questsForRegion(region: number): Quest[] {
  return ALL_QUESTS.filter(q => q.region === region);
}

// 十二地区都可接到至少一条本地任务链；地区 2／3／5 另有完整核心链。
export const QUEST_REGIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

for (const region of [1, 4, 6, 7, 8, 9, 10, 11, 12]) {
  const prefix = `r${region}`;
  const name = regionName(region);
  QUESTS.push(
    short(`${prefix}-1`, region, `${name}·边境巡逻`, '击败当地威胁', 'rout'),
    standard(`${prefix}-2`, region, `${name}·据点压制`, '压制当地据点', 'seize', { quest: `${prefix}-1` }),
    // 前两项共 20+40 声望，远征门槛与之对齐，避免前置锁死（docs/20 §6）。
    region6(`${prefix}-3`, region, `${name}·地区远征`, '清剿地区守军', [['ore', 6], ['herb', 6]], { quest: `${prefix}-2`, reputation: 60 }),
  );
}
ALL_QUESTS.push(...QUESTS.filter(q => !ALL_QUESTS.includes(q)));
// 限量投放（docs/27）：短弓为前期任务首通奖励（另有当地商店资格）；三本最上级法术书连同教材只经
// 一次性核心／远征任务发放，不进普通商店。
const LIMITED_REWARDS: Record<string, [ItemKey, number][]> = {
  gw1: [['short_bow', 1]],
  ih8: [[spellbookItem('fw_spell_61'), 1], [manualItem('fw_spell_61'), 1]],
  wl8: [[spellbookItem('fw_spell_60'), 1], [manualItem('fw_spell_60'), 1]],
  'r11-3': [[spellbookItem('fw_spell_11'), 1], [manualItem('fw_spell_11'), 1]],
};
for (const quest of ALL_QUESTS) {
  quest.event ??= `${quest.name}：${quest.objective}。当地斥候已标出路线，完成后可领取本地资源。`;
  if (LIMITED_REWARDS[quest.id]) quest.reward = { ...quest.reward, items: [...(quest.reward.items ?? []), ...LIMITED_REWARDS[quest.id]] };
  if (quest.id === 'r9-3') quest.exclusive = 'royal_sword';
  if (quest.id === 'r10-3') quest.exclusive = 'divine_lance';
  if (quest.id === 'r11-3') quest.exclusive = 'master_lance';
  // 净化剑：潮汐碑文的固定专属实物，领取前在任务预览中显示。
  if (quest.id === 'wl7') quest.exclusive = 'fw_weapon_8';
  quest.enemyLevelCap ??= QUEST_LEVEL_CAP[quest.tier];
  if (!quest.scenarioId && !(quest.scenarioIds?.length)) quest.maxUnits ??= 8;
}

// 剧情奖励人物（地区远征）：开局自选同伴时排除，避免与奖励重复。
export const QUEST_RECRUITS: CharacterId[] = ALL_QUESTS.flatMap(q => (q.recruit ? [q.recruit] : []));

// 固定人物加入时的台词（docs/20 §5）。
export const RECRUIT_LINES: Partial<Record<CharacterId, string>> = {
  ren: '「我的剑从今往后听你调遣。」',
  ig: '「有仗打就叫我，别的不必多说。」',
  mira: '「愿我的祈祷护住你们每一个人。」',
};

// 任务是否可接：前置任务已完成，且当地声望达标（docs/20 §4）。
export function questAvailable(quest: Quest, state: { done: ReadonlySet<string>; reputation: number }): boolean {
  if (state.done.has(quest.id)) return false;
  const req = quest.requires;
  if (!req) return true;
  if (req.quest && !state.done.has(req.quest)) return false;
  if (req.reputation !== undefined && state.reputation < req.reputation) return false;
  return true;
}
