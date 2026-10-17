import type { ItemKey } from './items.ts';
import type { CharacterId } from '../data/characters.ts';

// 地区任务（docs/20「地区任务、战斗目标与声望」）。首版三地：绿林(2)、铁丘(3)、水乡(5)。
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
  // escape/gather 需要撤离的人数／箱子数（默认 1）。
  need?: number;
  requires?: { quest?: string; reputation?: number };
  reward: QuestReward;
  // 固定人物加入（docs/20 §5）：领取奖励时加入名册；已拥有则跳过（唯一性）。
  recruit?: CharacterId;
}

// 耗日：短 1 / 标准 2 / 地区远征每图 2（共 6）（用户定案：任务只带 1–2 天耗时，每年不止 8 张图）。
export const QUEST_DAY_COST: Record<QuestTier, number> = { short: 1, standard: 2, region: 6 };

const short = (id: string, region: number, name: string, objective: string, kind: QuestKind, requires?: Quest['requires'], need?: number): Quest =>
  ({ id, region, name, objective, kind, tier: 'short', turnLimit: 12, need, requires, reward: { gold: 800, reputation: 20 } });
const standard = (id: string, region: number, name: string, objective: string, kind: QuestKind, requires?: Quest['requires'], need?: number): Quest =>
  ({ id, region, name, objective, kind, tier: 'standard', turnLimit: 20, need, requires, reward: { gold: 1_600, reputation: 40 } });
const region6 = (id: string, region: number, name: string, objective: string, items: [ItemKey, number][], requires: Quest['requires'], recruit?: CharacterId): Quest =>
  ({ id, region, name, objective, kind: 'rout', tier: 'region', turnLimit: 24, requires, recruit, reward: { gold: 4_000, reputation: 100, items } });

export const QUESTS: Quest[] = [
  // 绿林：木、弓、轻装（docs/20 §6）。
  short('gw1', 2, '林道侦察', '击败哨兵', 'rout'),
  standard('gw2', 2, '护送采集队撤离', '护送采集队抵达撤离点', 'escort', { quest: 'gw1' }),
  standard('gw3', 2, '抢回被截木材', '带至少 1 箱木材撤离', 'gather', { quest: 'gw2' }, 1),
  short('gw4', 2, '接应落单猎手', '全队抵达撤离点', 'escape', { quest: 'gw3', reputation: 100 }, 1),
  standard('gw5', 2, '防守林间营地', '坚守营地', 'defend', { quest: 'gw4', reputation: 100 }),
  region6('gw6', 2, '林间远征', '清剿林中据点', [['killer_bow', 1], ['wood', 8]], { quest: 'gw5', reputation: 100 }, 'ren'),
  // 铁丘：矿、重甲、破甲（docs/20 §6）。
  short('ih1', 3, '矿道清障', '讨伐矿道敌兵', 'rout'),
  standard('ih2', 3, '占领矿道入口', '压制入口', 'seize', { quest: 'ih1' }),
  standard('ih3', 3, '防守运输站', '坚守运输站', 'defend', { quest: 'ih2' }),
  short('ih4', 3, '撤离被困矿工', '护送矿工抵达撤离点', 'escort', { quest: 'ih3', reputation: 100 }),
  standard('ih5', 3, '抢运矿石', '带至少 1 箱矿石撤离', 'gather', { quest: 'ih4', reputation: 100 }, 1),
  region6('ih6', 3, '矿区远征', '清剿矿场守军', [['killer_lance', 1], ['ore', 8]], { quest: 'ih5', reputation: 100 }, 'ig'),
  // 水乡：药草、恢复、治疗（docs/20 §6）。
  short('wl1', 5, '渡口求援', '全队抵达撤离点', 'escape'),
  standard('wl2', 5, '护送伤员撤离', '护送伤员抵达撤离点', 'escort', { quest: 'wl1' }),
  standard('wl3', 5, '保卫药草田', '坚守药草田', 'defend', { quest: 'wl2' }),
  short('wl4', 5, '抢救补给箱', '带至少 1 箱补给撤离', 'gather', { quest: 'wl3', reputation: 100 }, 1),
  standard('wl5', 5, '占领被封渡口', '压制渡口', 'seize', { quest: 'wl4', reputation: 100 }),
  region6('wl6', 5, '渡口远征', '清剿渡口守军', [['recover', 1], ['herb', 8]], { quest: 'wl5', reputation: 100 }, 'mira'),
];

export function questById(id: string): Quest | undefined {
  return QUESTS.find(q => q.id === id);
}

export function questsForRegion(region: number): Quest[] {
  return QUESTS.filter(q => q.region === region);
}

// 首版任务覆盖的地区（docs/20 §1）。
export const QUEST_REGIONS = [2, 3, 5];

// 剧情奖励人物（地区远征）：开局自选同伴时排除，避免与奖励重复。
export const QUEST_RECRUITS: CharacterId[] = QUESTS.flatMap(q => (q.recruit ? [q.recruit] : []));

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
