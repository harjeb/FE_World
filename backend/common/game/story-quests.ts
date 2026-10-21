import type { CharacterId } from '../data/characters.ts';
import { classicMap } from './classic-catalog.ts';
import type { ItemKey } from './items.ts';
import { materialDrops } from './materials.ts';
import type { Quest, QuestKind } from './quests.ts';

// 主线任务与伙伴任务（docs/38）。两者都是单图经典地图任务，沿用任务系统的出征、结算和奖励键：
// - 主线任务：八章各一，章节开放（每年末 18 日起）后可接；完成即完成该章事件，线索来自地图里的隐藏箱。
// - 伙伴任务：地区固定人物（雷恩／伊格／米拉）加入名册后解锁；人物之后阵亡不影响任务。
// 地图物件的改编（村庄、宝箱挪位和线索箱）在 content/scenarios/classic-maps-v1/adaptations.json 里，
// 按任务 ID 隔离，只在对应任务里出现。

// 一章的前置任务（docs/38 §3.4）：每章两个，类型各章不同，全部完成后才能接收尾战：
//  - dispatch：章节开放后出发的一次派遣满 days 日，返程时自动完成，地区不限；
//  - submit：从仓库提交 count 份材料（扣除）；
//  - find：在指定固定经典副本（route）的宝箱里找到任务物品，持有即完成，不扣除；
//  - duel：单挑，指定一名己方角色对一名强敌，真实死亡，获胜完成；
//  - arena：章节开放后在普通竞技场赢 wins 场；
//  - tavern：章节开放后在酒馆小游戏里赢 wins 次（返还高于下注）。
interface StepBase { id: string; name: string; briefing: string }
export type StoryStep = StepBase & (
  | { kind: 'dispatch'; days: number }
  | { kind: 'submit'; item: ItemKey; count: number }
  | { kind: 'find'; item: ItemKey; route: string; mapId: string }
  | { kind: 'duel'; mapId: string; enemy: string; levelBonus: number }
  | { kind: 'arena'; wins: number }
  | { kind: 'tavern'; wins: number }
);

export interface StoryChapterQuest {
  chapter: number;
  mapId: string;
  name: string;
  briefing: string;
  clue: { name: string; note: string };
  steps: StoryStep[];
}

// 前置任务本身的奖励（docs/38 §3.4）：完成的那一刻自动发放，每个前置任务一次。每个任务单独指定，
// 以战斗用的消耗品和武器为主（伤药、特效药、解毒药、各档武器），金币只给一点；风险最高的单挑
// 另给公共经验。数值待校准。
export interface StepReward { gold: number; bexp?: number; items?: [ItemKey, number][] }
const STEP_REWARDS: Record<string, StepReward> = {
  'story-1-a': { gold: 150, items: [['antidote', 2], ['vulnerary', 2]] },
  'story-1-b': { gold: 150, items: [['vulnerary', 3], ['elixir', 1]] },
  'story-2-a': { gold: 200, items: [['killer_lance', 1], ['antidote', 1]] },
  'story-2-b': { gold: 200, items: [['vulnerary', 3]] },
  'story-3-a': { gold: 300, bexp: 300, items: [['killing_edge', 1], ['elixir', 1], ['vulnerary', 2], ['secret_book', 1]] },
  'story-3-b': { gold: 250, items: [['elixir', 1], ['vulnerary', 2]] },
  'story-4-a': { gold: 300, items: [['longbow', 1], ['antidote', 2], ['talisman', 1]] },
  'story-4-b': { gold: 300, items: [['elixir', 2], ['vulnerary', 2]] },
  'story-5-a': { gold: 350, items: [['vulnerary', 4], ['antidote', 2]] },
  'story-5-b': { gold: 400, bexp: 300, items: [['levin_sword', 1], ['elixir', 1], ['antidote', 1], ['speedwing', 1]] },
  'story-6-a': { gold: 350, items: [['antidote', 3], ['elixir', 1]] },
  'story-6-b': { gold: 400, items: [['silver_sword', 1], ['elixir', 1], ['goddess_icon', 1]] },
  'story-7-a': { gold: 450, items: [['elixir', 2], ['ether_ration', 2]] },
  'story-7-b': { gold: 450, items: [['elixir', 2], ['vulnerary', 3]] },
  'story-8-a': { gold: 600, bexp: 400, items: [['brave_lance', 1], ['elixir', 2], ['antidote', 2], ['dracoshield', 1]] },
  'story-8-b': { gold: 500, items: [['brave_axe', 1], ['elixir', 1], ['energy_drop', 1]] },
};
export const STORY_STEP_REWARDS: Readonly<Record<string, StepReward>> = STEP_REWARDS;
export function stepReward(step: StoryStep, _chapter?: number): StepReward {
  const reward = STEP_REWARDS[step.id];
  if (!reward) throw new Error(`前置任务 ${step.id} 没有配置奖励`);
  return reward;
}

export const storyStepId = (chapter: number, part: 'a' | 'b'): string => `story-${chapter}-${part}`;
type StepInput = StoryStep extends infer S ? S extends StoryStep ? Omit<S, 'id'> : never : never;
const step = (chapter: number, part: 'a' | 'b', spec: StepInput): StoryStep => ({ id: storyStepId(chapter, part), ...spec }) as StoryStep;

// 副本宝箱里的任务物品：只在对应的固定经典远征里、章节开放之后出现，每个账号一次。
export const STORY_FIND_NOTES: Record<string, { name: string; note: string }> = {
  story_find_2: { name: '裂隙晶片', note: '北道车辙里出现过的黑色晶片，接近神之子的力量时会朝王城方向发光。' },
  story_find_4: { name: '旧约封蜡', note: '旧礼仪使用的通行封蜡，背面留着铸器师维洛的私印。' },
  story_find_6: { name: '封印节点图', note: '竞技场地下的旧底图，原本向内闭合的封印线路被改成了向外开启。' },
  story_find_8: { name: '阵眼钥石', note: '能够关闭竞技场祭台回路的旧钥石，已经送往北地的力量却无法由它收回。' },
};

export const STORY_CHAPTER_QUESTS: readonly StoryChapterQuest[] = [
  { chapter: 1, mapId: 'fe6-ch14-main', name: '盛会·空缺的冠军席',
    briefing: '连胜冠军阿尔维恩被宣布身亡，葬礼上却没有遗体。城外旧镇的驿站正遭人占据，赶在来往信件被烧尽前夺回那里。',
    clue: { name: '送信回执', note: '半张带归灯印记的求援信回执，日期比教会公布的冠军出城日早三天。' },
    steps: [
      step(1, 'a', { kind: 'tavern', name: '杯底的酒钱', briefing: '酒馆老板记得冠军最后一晚的客人。赢 2 次小游戏，让老客愿意谈起那封口信。', wins: 2 }),
      step(1, 'b', { kind: 'arena', name: '冠军的旧识', briefing: '一名老斗士知道冠军出城前去过哪里。在普通竞技场赢 2 场，取得他的信任。', wins: 2 }),
    ] },
  { chapter: 2, mapId: 'fe7-ch19-eliwood', name: '裂痕·北道关门',
    briefing: '追查冠军收到的求援信，朝圣道尽头的废弃关门出现异常车队。进入关门，查明车队往返王城所运送的东西。',
    clue: { name: '医护车运单', note: '货物登记为“圣物”，附单却反复领取绷带，并注明不得耽搁回城。' },
    steps: [
      step(2, 'a', { kind: 'find', name: '裂隙里的晶片', briefing: '封印之剑的三图远征里，有人在遗迹的角落藏了一只箱子。取回箱中的「裂隙晶片」。', item: 'story_find_2', route: 'clx-fe6', mapId: 'fe6-ch23-main' }),
      step(2, 'b', { kind: 'dispatch', name: '北道的剑刻', briefing: '巡路队在废关门附近失踪。派队伍沿路搜寻，满 3 日归来，辨认冠军是否经过。', days: 3 }),
    ] },
  { chapter: 3, mapId: 'fe8-ch16-eirika', name: '被抹去的名字·档案库',
    briefing: '冠军远行前后的记录正被人替换。进入王城旧档案库，夺回那辆医护车的原始底册。',
    clue: { name: '第七号底册', note: '阿尔维恩被宣告死亡后，“第七号”仍持续领取维生药物；求援调令的原文并非冠军自请。' },
    steps: [
      step(3, 'a', { kind: 'duel', name: '刮名人', briefing: '受雇的剑客拦在档案馆外，要求你派一人应战。赢得单挑，赶在另一批人焚卷前进入。', mapId: 'fe2-map-03', enemy: '刮名人', levelBonus: 1 }),
      step(3, 'b', { kind: 'submit', name: '修复卷宗', briefing: '破损的卷宗需要矿物粉修补。提交 8 份铁矿。', item: 'ore', count: 8 }),
    ] },
  { chapter: 4, mapId: 'fe8-ch14-ephraim', name: '旧约·地下慈济室',
    briefing: '药物底册指向旧礼拜堂的地下慈济室。持旧式通行印进入，查清被转移的伤者和铸器师之间的关系。',
    clue: { name: '神裔病历', note: '伤者的左肩骨裂与旧剑伤和冠军一致，病历注明神裔反应持续，转移由铸器师维洛签收。' },
    steps: [
      step(4, 'a', { kind: 'find', name: '旧约封蜡', briefing: '圣魔之光石的三图远征里，一只旧箱子装着旧约的封蜡。取回「旧约封蜡」。', item: 'story_find_4', route: 'clx-fe8', mapId: 'fe8-ch17-eirika' }),
      step(4, 'b', { kind: 'arena', name: '慈济室的护卫名单', briefing: '慈济室借普通竞技场挑选护卫。在擂台赢 3 场，混入轮值名单。', wins: 3 }),
    ] },
  { chapter: 5, mapId: 'fe6-ch20-ilia', name: '渗入·暗仓',
    briefing: '药物与黑色导晶被送进河边暗仓。追查真正的收货人，找到那名从未公开露面的伤者。',
    clue: { name: '供体账本', note: '维生药物与导晶损耗共同记账，批注写着“不得使供体提前死亡”，签字人为维洛。' },
    steps: [
      step(5, 'a', { kind: 'dispatch', name: '追查货源', briefing: '药物与导晶从同一商路送走。派队伍沿车辙追踪，满 5 日归来。', days: 5 }),
      step(5, 'b', { kind: 'duel', name: '押车人的赌约', briefing: '押车头目不肯直接出卖货主，却答应在单挑落败后交出账本副页。派一人应战。', mapId: 'fe2-map-05', enemy: '走私头目', levelBonus: 1 }),
    ] },
  { chapter: 6, mapId: 'fe7-ch25-eliwood-kenneth', name: '夺取·封印节点',
    briefing: '沿装置管线追到竞技场地下。分离维生回路，切断向外输送神力的节点，夺下铸器师保存的记录。',
    clue: { name: '供能记录板', note: '神力被送往禁忌之地，两道枷锁已断裂；每页供能记录均有祭仪院最高印章。' },
    steps: [
      step(6, 'a', { kind: 'tavern', name: '散场后的工单', briefing: '筹备处的人常在酒馆赌钱。赢 3 次小游戏，借机查问授冠台下新装置的用途。', wins: 3 }),
      step(6, 'b', { kind: 'find', name: '封印节点图', briefing: '烈火之剑的三图远征里藏着一份被撕下的底图。取回「封印节点图」。', item: 'story_find_6', route: 'clx-fe7', mapId: 'fe7-ch30-eliwood' }),
    ] },
  { chapter: 7, mapId: 'fe8-ch15-eirika', name: '重聚·黄沙证人',
    briefing: '逃亡教士带着关键档案前往黄沙驿站，追兵也已赶到。接应证人，护住能揭开王城阴谋的证据。',
    clue: { name: '归灯契约副本', note: '教首洛德里克以神裔之力换取亡妻艾蕾娜复生，契约另一方是受缚于北地的魔神阿扎赫。' },
    steps: [
      step(7, 'a', { kind: 'submit', name: '沙漠补给', briefing: '送病床和档案的教士有人负伤。提交 15 份止血草，让他们能继续护送证人。', item: 'herb', count: 15 }),
      step(7, 'b', { kind: 'arena', name: '引开耳目', briefing: '保管契约副本的退役护卫被人盯上。在普通竞技场赢 3 场，替他引开追查者的注意。', wins: 3 }),
    ] },
  { chapter: 8, mapId: 'fe6-ch21-main', name: '守护·无人的授冠礼',
    briefing: '第八届竞技场散场后，祭台仍未熄灯。率队进入地下，阻止最后的交换，击败接入装置后邪神化的教首洛德里克。',
    clue: { name: '最后的交换手札', note: '教首准备亲自接入装置完成交换，亡妻却从未真正回应。已经流向北地的神力正在唤醒禁忌之地。' },
    steps: [
      step(8, 'a', { kind: 'duel', name: '祭台前的守卫', briefing: '守在旧通道的护卫不肯相信指控，只接受一人应战。赢下单挑，打通撤离观众后进入祭台的路。', mapId: 'fe2-map-07', enemy: '阵眼守卫', levelBonus: 2 }),
      step(8, 'b', { kind: 'find', name: '阵眼钥石', briefing: '黑暗龙与光之剑的三图远征里，有一只箱子压着阵眼的钥石。取回「阵眼钥石」。', item: 'story_find_8', route: 'clx-fe3', mapId: 'fe3-book1-ch20' }),
    ] },
];

export const storyQuestId = (chapter: number): string => `story-${chapter}`;
export const storyClueKey = (chapter: number): ItemKey => `story_clue_${chapter}` as ItemKey;
export const STORY_CLUE_KEYS: readonly ItemKey[] = STORY_CHAPTER_QUESTS.map(row => storyClueKey(row.chapter));

// 主线任务报酬（金币为主，数值待校准）：章节公共经验另由 CLAIM_REWARD 发放，二者互不替代。
const storyReward = (chapter: number): Quest['reward'] => ({
  gold: 2_000 + chapter * 500, reputation: 0, items: [['vulnerary', 2],
    ...materialDrops([1, 2, 3, 4, 6, 9, 8, 11][chapter - 1],
      [1, 10, 20, 35, 55, 55, 75, 75][chapter - 1], `story:${chapter}`, 5, 0)
      .map(({ item, count }): [ItemKey, number] => [item, count])],
});

function kindOf(mapId: string): { kind: QuestKind; objective: string; turnLimit: number } {
  const map = classicMap(mapId);
  return {
    kind: map.goal.kind === 'seize' ? 'seize' : 'rout', turnLimit: map.turnLimit,
    objective: map.goal.kind === 'seize' ? '压制王座' : map.goal.kind === 'boss' ? '击败敌军主将' : '消灭全部敌军',
  };
}

export const STORY_QUESTS: Quest[] = STORY_CHAPTER_QUESTS.map(row => ({
  id: storyQuestId(row.chapter), region: 0, name: row.name, tier: 'standard', ...kindOf(row.mapId),
  story: row.chapter, requires: { chapter: row.chapter }, enemyLevelCap: 99, costDays: 2,
  ...(row.chapter === 8 ? { kind: 'rout' as const, objective: '击败邪神化教首·洛德里克' } : {}),
  scenarioId: row.mapId, reward: storyReward(row.chapter), event: row.briefing,
  classic: { game: classicMap(row.mapId).game, mapName: classicMap(row.mapId).name, stageCount: 1, adapted: true },
}));

export interface CompanionQuest {
  character: CharacterId;
  region: number;
  mapId: string;
  name: string;
  briefing: string;
  epilogue: string;
  reward: Quest['reward'];
}

// 伙伴任务：奖励从现有目录取，数值待校准。
export const COMPANION_QUEST_DEFS: readonly CompanionQuest[] = [
  { character: 'ren', region: 2, mapId: 'fe7-ch20-eliwood', name: '雷恩的旧剑',
    briefing: '雷恩认出了林中据点缴获的一柄旧剑，想把它送回原主的墓前。陪他走一趟。',
    epilogue: '雷恩把剑插在墓前：「这柄剑的主人，曾替竞技场守过一道不该打开的门。」',
    reward: { gold: 2_400, reputation: 0, items: [['killing_edge', 1], ['vulnerary', 2], ['secret_book', 1]] } },
  { character: 'ig', region: 3, mapId: 'fe6-ch19-ilia', name: '伊格的矿坑',
    briefing: '伊格说矿区深处有他年轻时见过的刻痕，如今那里被人占了。跟他去看一眼。',
    epilogue: '伊格沉默了很久：「矿坑深处的刻痕，我年轻时见过。那时没人信我。」',
    reward: { gold: 2_400, reputation: 0, items: [['killer_axe', 1], ['vulnerary', 2], ['dracoshield', 1]] } },
  { character: 'mira', region: 5, mapId: 'fe8-ch12-eirika', name: '米拉的祈祷',
    briefing: '渡口外的村子很久没有回音，米拉想去为那里的人祈祷。有人守在村口，不让外人进去。',
    epilogue: '米拉合上祈祷书：「静寂的村子里，每一块墓碑上都有同一个符号。」',
    reward: { gold: 2_400, reputation: 0, items: [['physic', 1], ['vulnerary', 2], ['talisman', 1]] } },
];

export const companionQuestId = (character: CharacterId): string => `companion-${character}`;

export const COMPANION_QUESTS: Quest[] = COMPANION_QUEST_DEFS.map(row => ({
  id: companionQuestId(row.character), region: row.region, name: row.name, tier: 'standard', ...kindOf(row.mapId),
  companion: row.character, requires: { character: row.character }, costDays: 2,
  scenarioId: row.mapId, reward: { ...row.reward, items: [...(row.reward.items ?? []),
    ...materialDrops(row.region, 20, `companion:${row.character}`, 5, 0)
      .map(({ item, count }): [ItemKey, number] => [item, count])] }, event: row.briefing,
  classic: { game: classicMap(row.mapId).game, mapName: classicMap(row.mapId).name, stageCount: 1, adapted: true },
}));

export const COMPANION_EPILOGUES: Record<string, string> = Object.fromEntries(COMPANION_QUEST_DEFS.map(row => [companionQuestId(row.character), row.epilogue]));
