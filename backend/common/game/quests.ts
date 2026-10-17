import type { ItemKey } from './items.ts';

// 地区任务（docs/20「地区任务、战斗目标与声望」）。首版三地：绿林(2)、铁丘(3)、水乡(5)。
//
// 目标类型：讨伐(rout)、占领/抵达(seize)、坚守(defend)。护送、抢物资与地区远征目前先用
// 最接近的现有目标跑通（seize / boss），真正的 NPC 护送与物资携带另开战斗目标后再替换。
// shortcut: 护送/抢物资用 seize 代替、地区远征用单场 boss 代替，做出专属目标时替换。
export type QuestKind = 'rout' | 'seize' | 'defend';
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
  requires?: { quest?: string; reputation?: number };
  reward: QuestReward;
}

// 耗日：短 4 / 标准 8 / 地区远征 24（docs/20 §3）。
export const QUEST_DAY_COST: Record<QuestTier, number> = { short: 4, standard: 8, region: 24 };

const short = (id: string, region: number, name: string, objective: string, kind: QuestKind, requires?: Quest['requires']): Quest =>
  ({ id, region, name, objective, kind, tier: 'short', turnLimit: 12, requires, reward: { gold: 800, reputation: 20 } });
const standard = (id: string, region: number, name: string, objective: string, kind: QuestKind, requires?: Quest['requires']): Quest =>
  ({ id, region, name, objective, kind, tier: 'standard', turnLimit: 20, requires, reward: { gold: 1_600, reputation: 40 } });
const region6 = (id: string, region: number, name: string, objective: string, items: [ItemKey, number][], requires?: Quest['requires']): Quest =>
  ({ id, region, name, objective, kind: 'rout', tier: 'region', turnLimit: 24, requires, reward: { gold: 4_000, reputation: 100, items } });

export const QUESTS: Quest[] = [
  // 绿林：木、弓、轻装（docs/20 §6）。
  short('gw1', 2, '林道侦察', '击败哨兵', 'rout'),
  standard('gw2', 2, '护送采集队撤离', '抵达撤离点', 'seize', { quest: 'gw1' }),
  standard('gw3', 2, '抢回被截木材', '夺回并守住物资点', 'seize', { quest: 'gw2' }),
  short('gw4', 2, '接应落单猎手', '抵达接应点', 'seize', { quest: 'gw3', reputation: 100 }),
  standard('gw5', 2, '防守林间营地', '坚守营地', 'defend', { quest: 'gw4', reputation: 100 }),
  region6('gw6', 2, '林间远征', '清剿林中据点', [['killer_bow', 1], ['wood', 8]], { quest: 'gw5', reputation: 100 }),
  // 铁丘：矿、重甲、破甲（docs/20 §6）。
  short('ih1', 3, '矿道清障', '讨伐矿道敌兵', 'rout'),
  standard('ih2', 3, '占领矿道入口', '压制入口', 'seize', { quest: 'ih1' }),
  standard('ih3', 3, '防守运输站', '坚守运输站', 'defend', { quest: 'ih2' }),
  short('ih4', 3, '撤离被困矿工', '抵达撤离点', 'seize', { quest: 'ih3', reputation: 100 }),
  standard('ih5', 3, '抢运矿石', '夺回矿石点', 'seize', { quest: 'ih4', reputation: 100 }),
  region6('ih6', 3, '矿区远征', '清剿矿场守军', [['killer_lance', 1], ['ore', 8]], { quest: 'ih5', reputation: 100 }),
  // 水乡：药草、恢复、治疗（docs/20 §6）。
  short('wl1', 5, '渡口求援', '抵达求援点', 'seize'),
  standard('wl2', 5, '护送伤员撤离', '抵达撤离点', 'seize', { quest: 'wl1' }),
  standard('wl3', 5, '保卫药草田', '坚守药草田', 'defend', { quest: 'wl2' }),
  short('wl4', 5, '抢救补给箱', '夺回补给箱', 'seize', { quest: 'wl3', reputation: 100 }),
  standard('wl5', 5, '占领被封渡口', '压制渡口', 'seize', { quest: 'wl4', reputation: 100 }),
  region6('wl6', 5, '渡口远征', '清剿渡口守军', [['recover', 1], ['herb', 8]], { quest: 'wl5', reputation: 100 }),
];

export function questById(id: string): Quest | undefined {
  return QUESTS.find(q => q.id === id);
}

export function questsForRegion(region: number): Quest[] {
  return QUESTS.filter(q => q.region === region);
}

// 首版任务覆盖的地区（docs/20 §1）。
export const QUEST_REGIONS = [2, 3, 5];

// 任务是否可接：前置任务已完成，且当地声望达标（docs/20 §4）。
export function questAvailable(quest: Quest, state: { done: ReadonlySet<string>; reputation: number }): boolean {
  if (state.done.has(quest.id)) return false;
  const req = quest.requires;
  if (!req) return true;
  if (req.quest && !state.done.has(req.quest)) return false;
  if (req.reputation !== undefined && state.reputation < req.reputation) return false;
  return true;
}
