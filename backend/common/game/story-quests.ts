import type { CharacterId } from '../data/characters.ts';
import { classicMap } from './classic-catalog.ts';
import type { ItemKey } from './items.ts';
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
  story_find_2: { name: '裂隙晶片', note: '从遗迹裂隙里掉出的晶片，贴近奖章时会微微发烫。' },
  story_find_4: { name: '旧约封蜡', note: '盖在旧约原件上的封蜡，印的是诸神与凡人并列的徽记。' },
  story_find_6: { name: '封印节点图', note: '标着决赛场地下方封印节点位置的底图。' },
  story_find_8: { name: '阵眼钥石', note: '守护阵阵眼的钥石，握在手里能感到一阵低沉的震动。' },
};

export const STORY_CHAPTER_QUESTS: readonly StoryChapterQuest[] = [
  { chapter: 1, mapId: 'fe6-ch14-main', name: '盛会·开幕夜',
    briefing: '开幕式的灯火尚未熄灭，城外的镇子被一伙带着古老纹章的人占住。夺回城镇，查明他们的来历。',
    clue: { name: '奖章拓片', note: '开幕式奖章上的纹路，与城外遗迹里的刻痕一模一样。' },
    steps: [
      step(1, 'a', { kind: 'tavern', name: '庆典前的热身', briefing: '开幕前酒馆里已经热闹起来。去玩几局小游戏、赢 2 次，听听城里的传闻。', wins: 2 }),
      step(1, 'b', { kind: 'arena', name: '擂台上的熟面孔', briefing: '有人在普通竞技场里亮出了与奖章相同的纹章。去擂台赢 2 场，会会他们。', wins: 2 }),
    ] },
  { chapter: 2, mapId: 'fe7-ch19-eliwood', name: '裂痕·龙之门',
    briefing: '遗迹周围的生物开始异常，探路队在龙之门一带失去联系。进入遗迹，查看侵蚀的源头。',
    clue: { name: '侵蚀碎屑', note: '从裂隙边缘取得的黑色碎屑，靠近奖章时会发出微光。' },
    steps: [
      step(2, 'a', { kind: 'find', name: '裂隙里的晶片', briefing: '封印之剑的三图远征里，有人在遗迹的角落藏了一只箱子。取回箱中的「裂隙晶片」。', item: 'story_find_2', route: 'clx-fe6', mapId: 'fe6-ch23-main' }),
      step(2, 'b', { kind: 'dispatch', name: '遗迹外围', briefing: '探路队在遗迹附近失联。派队伍沿路搜寻，满 3 日归来。', days: 3 }),
    ] },
  { chapter: 3, mapId: 'fe8-ch16-eirika', name: '被抹去的名字·档案库',
    briefing: '旧档案所在的荒废王都里，有人在抹去冠军的名字。赶在他们之前进入档案库。',
    clue: { name: '被刮去的名册', note: '一页被同一把刀刮过的冠军名册，空白处隐约有压痕。' },
    steps: [
      step(3, 'a', { kind: 'duel', name: '刮名人', briefing: '一个自称“刮名人”的剑客拦在档案馆门前，只肯和一个人单独较量。对手是个随机人物，实力按你队伍里最高等级来，职业与你选的应战者同阶级（具体职业随机）。选一名角色应战，获胜才能进门。', mapId: 'fe2-map-03', enemy: '刮名人', levelBonus: 1 }),
      step(3, 'b', { kind: 'submit', name: '修复卷宗', briefing: '破损的卷宗需要矿物粉修补。提交 8 份矿石。', item: 'ore', count: 8 }),
    ] },
  { chapter: 4, mapId: 'fe8-ch14-ephraim', name: '旧约·地下祭室',
    briefing: '地下祭室保存着诸神与凡人的旧约，守卫已被替换。穿过层层厅室，找到旧约的原件。',
    clue: { name: '旧约残页', note: '诸神与凡人共同署名的残页，记载冠军只是仪式的一部分。' },
    steps: [
      step(4, 'a', { kind: 'find', name: '旧约封蜡', briefing: '圣魔之光石的三图远征里，一只旧箱子装着旧约的封蜡。取回「旧约封蜡」。', item: 'story_find_4', route: 'clx-fe8', mapId: 'fe8-ch17-eirika' }),
      step(4, 'b', { kind: 'arena', name: '为旧约而战', briefing: '祭室的守卫只认擂台上的胜者。在普通竞技场赢 3 场。', wins: 3 }),
    ] },
  { chapter: 5, mapId: 'fe6-ch20-ilia', name: '渗入·暗仓',
    briefing: '追查赛事筹备处的物资账本，侵蚀材料正从一处仓库运出。截下这批货。',
    clue: { name: '筹备处账本', note: '记录侵蚀材料流向赛事筹备处的账本副页。' },
    steps: [
      step(5, 'a', { kind: 'dispatch', name: '追查货源', briefing: '侵蚀材料从哪里运来？派队伍沿商路追查，满 5 日归来。', days: 5 }),
      step(5, 'b', { kind: 'duel', name: '走私头目', briefing: '走私头目放话：只和一个人单挑，赢了就交出账本。选一名角色应战，对手的职业与你的应战者同阶级。', mapId: 'fe2-map-05', enemy: '走私头目', levelBonus: 1 }),
    ] },
  { chapter: 6, mapId: 'fe7-ch25-eliwood-kenneth', name: '夺取·封印节点',
    briefing: '赛程被人为改动，封印节点暴露在决赛场地下方。在对方完成改写之前压制节点所在的王座。',
    clue: { name: '改动的赛程', note: '被人为改动的赛程底稿，决赛场地下方标着一个封印节点。' },
    steps: [
      step(6, 'a', { kind: 'tavern', name: '酒桌上的消息', briefing: '赛事筹备处的人常在酒馆赌钱。去玩小游戏、赢 3 次，套出赛程被改的经过。', wins: 3 }),
      step(6, 'b', { kind: 'find', name: '封印节点图', briefing: '烈火之剑的三图远征里藏着一份被撕下的底图。取回「封印节点图」。', item: 'story_find_6', route: 'clx-fe7', mapId: 'fe7-ch30-eliwood' }),
    ] },
  { chapter: 7, mapId: 'fe8-ch15-eirika', name: '重聚·黄沙集合点',
    briefing: '各地伙伴带着旧约的碎片赶往沙漠中的集合点，沿途有人拦截。接应他们汇合。',
    clue: { name: '旧约碎片', note: '各地伙伴保存的碎片，拼合后能补全守护阵的一角。' },
    steps: [
      step(7, 'a', { kind: 'submit', name: '沙漠补给', briefing: '穿越黄沙的同伴需要补给。提交 15 份药草。', item: 'herb', count: 15 }),
      step(7, 'b', { kind: 'arena', name: '集合前的比试', briefing: '旧约碎片的持有者想先确认你的实力。在普通竞技场赢 3 场。', wins: 3 }),
    ] },
  { chapter: 8, mapId: 'fe6-ch21-main', name: '守护·阵眼',
    briefing: '守护阵即将闭合，残余的力量涌向封印本身。击败守在阵眼的敌人，完成守护。',
    clue: { name: '守护阵图', note: '守护阵的完整阵图，边缘仍有尚未散去的侵蚀痕迹。' },
    steps: [
      step(8, 'a', { kind: 'duel', name: '阵眼守卫', briefing: '阵眼的守卫按旧约的规矩，只接受单挑，对手实力按你队伍的最高等级来。选一名角色应战。', mapId: 'fe2-map-07', enemy: '阵眼守卫', levelBonus: 2 }),
      step(8, 'b', { kind: 'find', name: '阵眼钥石', briefing: '黑暗龙与光之剑的三图远征里，有一只箱子压着阵眼的钥石。取回「阵眼钥石」。', item: 'story_find_8', route: 'clx-fe3', mapId: 'fe3-book1-ch20' }),
    ] },
];

export const storyQuestId = (chapter: number): string => `story-${chapter}`;
export const storyClueKey = (chapter: number): ItemKey => `story_clue_${chapter}` as ItemKey;
export const STORY_CLUE_KEYS: readonly ItemKey[] = STORY_CHAPTER_QUESTS.map(row => storyClueKey(row.chapter));

// 主线任务报酬（金币为主，数值待校准）：章节公共经验另由 CLAIM_REWARD 发放，二者互不替代。
const storyReward = (chapter: number): Quest['reward'] => ({
  gold: 2_000 + chapter * 500, reputation: 0, items: [['vulnerary', 2]],
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
  scenarioId: row.mapId, reward: row.reward, event: row.briefing,
  classic: { game: classicMap(row.mapId).game, mapName: classicMap(row.mapId).name, stageCount: 1, adapted: true },
}));

export const COMPANION_EPILOGUES: Record<string, string> = Object.fromEntries(COMPANION_QUEST_DEFS.map(row => [companionQuestId(row.character), row.epilogue]));
