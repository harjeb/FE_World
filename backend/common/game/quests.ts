import type { ItemKey } from './items.ts';
import { manualItem, spellbookItem } from './items.ts';
import type { CharacterId } from '../data/characters.ts';
import { regionById } from './calendar.ts';
import { COMPANION_QUESTS, STORY_QUESTS } from './story-quests.ts';
import { chapterAvailable } from './story.ts';

const regionName = (id: number) => regionById(id).name;

// 地区任务（docs/20「地区任务、战斗目标与声望」）。十二地均有九项一次性任务、500 声望与 32 日预算。
//
// 目标类型：讨伐(rout)、占领(seize)、坚守(defend)、撤离(escape)、抢物资(gather)、护送(escort)。
export type QuestKind = 'rout' | 'seize' | 'defend' | 'escape' | 'gather' | 'escort';
export type QuestTier = 'short' | 'standard' | 'region';

export interface QuestReward { gold: number; reputation: number; items?: [ItemKey, number][] }

export interface Quest {
  id: string;
  // Archived entries remain addressable for existing runs and unclaimed rewards.
  archived?: boolean;
  dungeonOnly?: boolean;
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
  // item：仓库里持有该任务物品时才出现（隐藏副本）；不消耗。
  // chapter：主线章节已开放（docs/38）；character：该固定人物已通过地区远征加入过名册（阵亡后仍算）。
  requires?: { quest?: string; reputation?: number; item?: ItemKey; chapter?: number; character?: CharacterId };
  // 主线任务所属章节（region 0，不属于任何地区）与伙伴任务所属人物。
  story?: number;
  companion?: CharacterId;
  reward: QuestReward;
  // 固定人物加入（docs/20 §5）：领取奖励时加入名册；已拥有则跳过（唯一性）。
  recruit?: CharacterId;
  // 仅原三地核心任务开放账号传承；新增地区终章不增加稀缺资源来源。
  unlocksLegacy?: boolean;
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
const core = (id: string, region: number, name: string, objective: string, items: [ItemKey, number][], requires: Quest['requires'], unlocksLegacy = false): Quest =>
  ({ ...region6(id, region, name, objective, items, requires), unlocksLegacy, reward: { gold: 5_000, reputation: 80, items } });

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
  core('gw9', 2, `${regionName(2)}·核心`, '击败侵蚀守林者', [['legacy_stone_growth', 1], ['immortal_shield', 1]], { quest: 'gw8', reputation: 250 }, true),
  // 托尔加丘陵：矿、重甲、破甲（docs/20 §6）。
  short('ih1', 3, '矿道清障', '讨伐矿道敌兵', 'rout'),
  standard('ih2', 3, '占领矿道入口', '压制入口', 'seize', { quest: 'ih1' }),
  standard('ih3', 3, '防守运输站', '坚守运输站', 'defend', { quest: 'ih2' }),
  short('ih4', 3, '撤离被困矿工', '护送矿工抵达撤离点', 'escort', { quest: 'ih3', reputation: 100 }),
  standard('ih5', 3, '抢运矿石', '带至少 1 箱矿石撤离', 'gather', { quest: 'ih4', reputation: 100 }, 1),
  region6('ih6', 3, '矿区远征', '清剿矿场守军', [['killer_lance', 1], ['ore', 8]], { quest: 'ih5', reputation: 100 }, 'ig'),
  core('ih7', 3, '深井回声', '压制深井入口', [], { quest: 'ih6', reputation: 250 }),
  core('ih8', 3, '熔炉守卫', '守住熔炉', [], { quest: 'ih7', reputation: 250 }),
  core('ih9', 3, `${regionName(3)}·核心`, '击败熔炉巨像', [['legacy_stone_numeric', 1], ['immortal_shield', 1]], { quest: 'ih8', reputation: 250 }, true),
  // 莱斯米尔湖镇：药草、恢复、治疗（docs/20 §6）。
  short('wl1', 5, '渡口求援', '全队抵达撤离点', 'escape'),
  standard('wl2', 5, '护送伤员撤离', '护送伤员抵达撤离点', 'escort', { quest: 'wl1' }),
  standard('wl3', 5, '保卫药草田', '坚守药草田', 'defend', { quest: 'wl2' }),
  short('wl4', 5, '抢救补给箱', '带至少 1 箱补给撤离', 'gather', { quest: 'wl3', reputation: 100 }, 1),
  standard('wl5', 5, '占领被封渡口', '压制渡口', 'seize', { quest: 'wl4', reputation: 100 }),
  region6('wl6', 5, '渡口远征', '清剿渡口守军', [['recover', 1], ['herb', 8]], { quest: 'wl5', reputation: 100 }, 'mira'),
  core('wl7', 5, '潮汐碑文', '夺回潮汐碑', [], { quest: 'wl6', reputation: 250 }),
  core('wl8', 5, '药田长夜', '守住药田', [], { quest: 'wl7', reputation: 250 }),
  core('wl9', 5, `${regionName(5)}·核心`, '击败潮汐祭司', [['reincarnation_core', 1], ['immortal_shield', 1]], { quest: 'wl8', reputation: 250 }, true),
];

import { CLASSIC_QUESTS } from './classic-quests.ts';

// 经典地图任务与地区任务共用同一任务/副本流程（docs/24）。
export const BASE_QUESTS: readonly Quest[] = QUESTS;
export const ALL_QUESTS: Quest[] = [...QUESTS, ...CLASSIC_QUESTS, ...COMPANION_QUESTS];

export const CROSS_TIME_QUEST: Quest = {
  id: 'cross-time-throne', region: 0, name: '时空试炼·终焉诸将',
  objective: '击败吕布并取得胜利', kind: 'rout', tier: 'standard',
  dungeonOnly: true, turnLimit: 40, maxUnits: 8, costDays: 8, enemyLevelCap: 52,
  reward: { gold: 2500, reputation: 0, items: [['silver_sword', 1], ['vulnerary', 2], ['cross_time_shard', 3]] },
};

export function questById(id: string): Quest | undefined {
  if (id === CROSS_TIME_QUEST.id) return CROSS_TIME_QUEST;
  return ALL_QUESTS.find(q => q.id === id) ?? STORY_QUESTS.find(q => q.id === id);
}

export function questsForRegion(region: number): Quest[] {
  return ALL_QUESTS.filter(q => q.region === region);
}

// 旧三任务链的 ID、门槛与实物奖励保留；新增支线允许在远征前达到 100，之后合流到核心链。
export const QUEST_REGIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const LOCAL_CHAINS: { region: number; material: ItemKey; escort: string; escape: string; defend: string; cores: [string, string, string] }[] = [
  { region: 1, material: 'herb', escort: '护送平原商队', escape: '接应边境斥候', defend: '守卫粮仓', cores: ['烽火驿道', '麦田防线', '平原盟约'] },
  { region: 4, material: 'ore', escort: '护送筑城工匠', escape: '接应城外守军', defend: '坚守城门', cores: ['失落哨堡', '城墙长夜', '要塞盟约'] },
  { region: 6, material: 'herb', escort: '护送遗迹学者', escape: '撤出古都斥候', defend: '守卫元素工坊', cores: ['沉寂书库', '元素回廊', '古都盟约'] },
  { region: 7, material: 'wood', escort: '护送山岭族人', escape: '接应山路猎手', defend: '守卫兽族营地', cores: ['祖灵山道', '群峰守夜', '山岭盟约'] },
  { region: 8, material: 'ore', escort: '护送风崖信使', escape: '接应落单飞骑', defend: '守卫崖顶哨站', cores: ['断翼高地', '风口防线', '风崖盟约'] },
  { region: 9, material: 'ore', escort: '护送荒原矿队', escape: '接应沙海斥候', defend: '守卫锻造营地', cores: ['旧炉遗址', '荒原烽火', '荒原盟约'] },
  { region: 10, material: 'ore', escort: '护送龙谷使者', escape: '撤出谷口探队', defend: '守卫龙石祭坛', cores: ['龙脉遗迹', '谷地守夜', '龙谷盟约'] },
  { region: 11, material: 'herb', escort: '护送王陵祭司', escape: '接应墓道探队', defend: '守卫仪式营地', cores: ['封印墓道', '王陵长夜', '王陵盟约'] },
  { region: 12, material: 'seed', escort: '护送神殿学徒', escape: '撤出门前哨兵', defend: '守卫轮回碑', cores: ['星门回廊', '黎明守望', '星门盟约'] },
];
for (const { region, material, escort, escape, defend, cores } of LOCAL_CHAINS) {
  const prefix = `r${region}`;
  const name = regionName(region);
  QUESTS.push(
    short(`${prefix}-1`, region, `${name}·边境巡逻`, '击败当地威胁', 'rout'),
    standard(`${prefix}-2`, region, `${name}·据点压制`, '压制当地据点', 'seize', { quest: `${prefix}-1` }),
    // 保留旧远征前置，已完成旧三项的玩家可以直接补支线。
    region6(`${prefix}-3`, region, `${name}·地区远征`, '清剿地区守军', [['ore', 6], ['herb', 6]], { quest: `${prefix}-2`, reputation: 60 }),
    standard(`${prefix}-4`, region, escort, '护送当地盟友抵达撤离点', 'escort', { quest: `${prefix}-2` }),
    short(`${prefix}-5`, region, escape, '全队抵达撤离点', 'escape', { quest: `${prefix}-4`, reputation: 100 }, 1),
    standard(`${prefix}-6`, region, defend, '坚守当地设施', 'defend', { quest: `${prefix}-5`, reputation: 100 }),
    core(`${prefix}-7`, region, cores[0], '夺回地区遗址', [[material, 6]], { quest: `${prefix}-3`, reputation: 250 }),
    core(`${prefix}-8`, region, cores[1], '守住地区防线', [[material, 8]], { quest: `${prefix}-7`, reputation: 250 }),
    core(`${prefix}-9`, region, cores[2], '击败侵蚀守将，缔结当地盟约', [[material, 10]], { quest: `${prefix}-8`, reputation: 250 }),
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

// 任务是否可接：前置任务已完成，当地声望达标（docs/20 §4），隐藏副本还要持有指定任务物品。
export function supportsHardQuest(quest: Pick<Quest, 'tier' | 'scenarioIds'>): boolean {
  return !!quest.scenarioIds?.length || quest.tier === 'region';
}

export interface QuestAvailability {
  done: ReadonlySet<string>;
  reputation: number;
  holds?: (item: ItemKey) => boolean;
  // 当前日期，用于主线章节是否已开放；缺省视为未开放。
  day?: number;
  // 已加入过名册的固定人物（含阵亡）；缺省视为没有。
  recruited?: ReadonlySet<CharacterId>;
}

// 固定人物经地区远征领取后永久记为“已招募”：来自已领取的招募奖励，不依赖名册里是否还活着。
export function recruitedCharacters(claimed: Iterable<string>): Set<CharacterId> {
  const set = new Set(claimed);
  return new Set(QUESTS.filter(q => q.recruit && set.has(q.id)).map(q => q.recruit!));
}

export function questAvailable(quest: Quest, state: QuestAvailability): boolean {
  if (state.done.has(quest.id)) return false;
  const req = quest.requires;
  if (!req) return true;
  if (req.quest && !state.done.has(req.quest)) return false;
  if (req.reputation !== undefined && state.reputation < req.reputation) return false;
  if (req.item && !state.holds?.(req.item)) return false;
  if (req.chapter !== undefined && (state.day === undefined || !chapterAvailable(req.chapter, state.day))) return false;
  if (req.character && !state.recruited?.has(req.character)) return false;
  return true;
}
