import type { CharacterId } from '../data/characters.ts';
import { classicMap } from './classic-catalog.ts';
import type { ItemKey } from './items.ts';
import type { Quest, QuestKind } from './quests.ts';

// 主线任务与伙伴任务（docs/38）。两者都是单图经典地图任务，沿用任务系统的出征、结算和奖励键：
// - 主线任务：八章各一，章节开放（每年末 18 日起）后可接；完成即完成该章事件，线索来自地图里的隐藏箱。
// - 伙伴任务：地区固定人物（雷恩／伊格／米拉）加入名册后解锁；人物之后阵亡不影响任务。
// 地图物件的改编（村庄、宝箱挪位和线索箱）在 content/scenarios/classic-maps-v1/adaptations.json 里，
// 按任务 ID 隔离，只在对应任务里出现。

// 一章的前置任务（docs/38 §3.4）：先派遣探索，再提交材料，最后才是收尾战。
//  - dispatch：章节开放后出发的一次派遣满 days 日、返程时自动完成，地区不限；
//  - submit：从仓库提交 count 份材料（扣除），需要先完成派遣。
export type StoryStep =
  | { id: string; kind: 'dispatch'; name: string; briefing: string; days: number }
  | { id: string; kind: 'submit'; name: string; briefing: string; item: ItemKey; count: number };

export interface StoryChapterQuest {
  chapter: number;
  mapId: string;
  name: string;
  briefing: string;
  clue: { name: string; note: string };
  steps: StoryStep[];
}

export const storyStepId = (chapter: number, part: 'a' | 'b'): string => `story-${chapter}-${part}`;
const dispatchStep = (chapter: number, name: string, briefing: string, days: number): StoryStep =>
  ({ id: storyStepId(chapter, 'a'), kind: 'dispatch', name, briefing, days });
const submitStep = (chapter: number, name: string, briefing: string, item: ItemKey, count: number): StoryStep =>
  ({ id: storyStepId(chapter, 'b'), kind: 'submit', name, briefing, item, count });

export const STORY_CHAPTER_QUESTS: readonly StoryChapterQuest[] = [
  { chapter: 1, mapId: 'fe6-ch14-main', name: '盛会·开幕夜',
    briefing: '开幕式的灯火尚未熄灭，城外的镇子被一伙带着古老纹章的人占住。夺回城镇，查明他们的来历。',
    clue: { name: '奖章拓片', note: '开幕式奖章上的纹路，与城外遗迹里的刻痕一模一样。' },
    steps: [
      dispatchStep(1, '城外的传闻', '开幕式后城外传出怪事。派一支队伍出城探访，满 3 日归来。', 3),
      submitStep(1, '安置伤者', '混乱中有人受伤，镇上缺药。提交 6 份药草。', 'herb', 6),
    ] },
  { chapter: 2, mapId: 'fe7-ch19-eliwood', name: '裂痕·龙之门',
    briefing: '遗迹周围的生物开始异常，探路队在龙之门一带失去联系。进入遗迹，查看侵蚀的源头。',
    clue: { name: '侵蚀碎屑', note: '从裂隙边缘取得的黑色碎屑，靠近奖章时会发出微光。' },
    steps: [
      dispatchStep(2, '遗迹外围', '探路队在遗迹附近失联。派队伍沿路搜寻，满 3 日归来。', 3),
      submitStep(2, '加固营地', '前线营地的栅栏被侵蚀的生物撞坏了。提交 8 份木材。', 'wood', 8),
    ] },
  { chapter: 3, mapId: 'fe8-ch16-eirika', name: '被抹去的名字·档案库',
    briefing: '旧档案所在的荒废王都里，有人在抹去冠军的名字。赶在他们之前进入档案库。',
    clue: { name: '被刮去的名册', note: '一页被同一把刀刮过的冠军名册，空白处隐约有压痕。' },
    steps: [
      dispatchStep(3, '寻访旧人', '几位老档案员知道冠军名册的来历。派队伍去寻访，满 4 日归来。', 4),
      submitStep(3, '修复卷宗', '破损的卷宗需要矿物粉修补。提交 8 份矿石。', 'ore', 8),
    ] },
  { chapter: 4, mapId: 'fe8-ch14-ephraim', name: '旧约·地下祭室',
    briefing: '地下祭室保存着诸神与凡人的旧约，守卫已被替换。穿过层层厅室，找到旧约的原件。',
    clue: { name: '旧约残页', note: '诸神与凡人共同署名的残页，记载冠军只是仪式的一部分。' },
    steps: [
      dispatchStep(4, '祭室入口', '地下祭室的入口埋在荒野里。派队伍去勘察，满 4 日归来。', 4),
      submitStep(4, '祭礼供品', '祭室里的旧约要用药草熏香后才能展开。提交 10 份药草。', 'herb', 10),
    ] },
  { chapter: 5, mapId: 'fe6-ch20-ilia', name: '渗入·暗仓',
    briefing: '追查赛事筹备处的物资账本，侵蚀材料正从一处仓库运出。截下这批货。',
    clue: { name: '筹备处账本', note: '记录侵蚀材料流向赛事筹备处的账本副页。' },
    steps: [
      dispatchStep(5, '追查货源', '侵蚀材料从哪里运来？派队伍沿商路追查，满 5 日归来。', 5),
      submitStep(5, '截下样品', '把可疑的矿石样品交给工坊检验。提交 10 份矿石。', 'ore', 10),
    ] },
  { chapter: 6, mapId: 'fe7-ch25-eliwood-kenneth', name: '夺取·封印节点',
    briefing: '赛程被人为改动，封印节点暴露在决赛场地下方。在对方完成改写之前压制节点所在的王座。',
    clue: { name: '改动的赛程', note: '被人为改动的赛程底稿，决赛场地下方标着一个封印节点。' },
    steps: [
      dispatchStep(6, '侦察场地', '决赛场地下方可能有封印节点。派队伍暗中侦察，满 5 日归来。', 5),
      submitStep(6, '加固封印', '节点周围需要木料架起临时支撑。提交 12 份木材。', 'wood', 12),
    ] },
  { chapter: 7, mapId: 'fe8-ch15-eirika', name: '重聚·黄沙集合点',
    briefing: '各地伙伴带着旧约的碎片赶往沙漠中的集合点，沿途有人拦截。接应他们汇合。',
    clue: { name: '旧约碎片', note: '各地伙伴保存的碎片，拼合后能补全守护阵的一角。' },
    steps: [
      dispatchStep(7, '迎接同伴', '各地同伴正带着旧约碎片赶来。派队伍沿途接应，满 6 日归来。', 6),
      submitStep(7, '沙漠补给', '穿越黄沙的同伴需要补给。提交 12 份药草。', 'herb', 12),
    ] },
  { chapter: 8, mapId: 'fe6-ch21-main', name: '守护·阵眼',
    briefing: '守护阵即将闭合，残余的力量涌向封印本身。击败守在阵眼的敌人，完成守护。',
    clue: { name: '守护阵图', note: '守护阵的完整阵图，边缘仍有尚未散去的侵蚀痕迹。' },
    steps: [
      dispatchStep(8, '巡视防线', '守护阵闭合前，要确认各处防线没有缺口。派队伍巡视，满 6 日归来。', 6),
      submitStep(8, '铸造阵眼', '阵眼的基座需要大量矿石。提交 14 份矿石。', 'ore', 14),
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
    reward: { gold: 2_400, reputation: 0, items: [['killing_edge', 1], ['vulnerary', 2]] } },
  { character: 'ig', region: 3, mapId: 'fe6-ch19-ilia', name: '伊格的矿坑',
    briefing: '伊格说矿区深处有他年轻时见过的刻痕，如今那里被人占了。跟他去看一眼。',
    epilogue: '伊格沉默了很久：「矿坑深处的刻痕，我年轻时见过。那时没人信我。」',
    reward: { gold: 2_400, reputation: 0, items: [['killer_axe', 1], ['vulnerary', 2]] } },
  { character: 'mira', region: 5, mapId: 'fe8-ch12-eirika', name: '米拉的祈祷',
    briefing: '渡口外的村子很久没有回音，米拉想去为那里的人祈祷。有人守在村口，不让外人进去。',
    epilogue: '米拉合上祈祷书：「静寂的村子里，每一块墓碑上都有同一个符号。」',
    reward: { gold: 2_400, reputation: 0, items: [['physic', 1], ['vulnerary', 2]] } },
];

export const companionQuestId = (character: CharacterId): string => `companion-${character}`;

export const COMPANION_QUESTS: Quest[] = COMPANION_QUEST_DEFS.map(row => ({
  id: companionQuestId(row.character), region: row.region, name: row.name, tier: 'standard', ...kindOf(row.mapId),
  companion: row.character, requires: { character: row.character }, costDays: 2,
  scenarioId: row.mapId, reward: row.reward, event: row.briefing,
  classic: { game: classicMap(row.mapId).game, mapName: classicMap(row.mapId).name, stageCount: 1, adapted: true },
}));

export const COMPANION_EPILOGUES: Record<string, string> = Object.fromEntries(COMPANION_QUEST_DEFS.map(row => [companionQuestId(row.character), row.epilogue]));
