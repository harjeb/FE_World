// 八章主线（docs/00 §9.4.2、docs/13 §6.3）：按个人日历开放，名次／海选／地区通关都不阻挡章节。
// 赛事奖励与主线奖励使用不同唯一键；完成章节与领取奖励分开。
import { DAYS_PER_YEAR } from './calendar.ts';

export const STORY_CHAPTERS = 8;
// 团队公共经验奖励（docs/00 §9.4.2）；数值待校准。
export const CHAPTER_BEXP = 1350;

export function chapterOpenDay(chapter: number): number {
  return chapter * DAYS_PER_YEAR - 18;
}

export function chapterAvailable(chapter: number, day: number): boolean {
  return chapter >= 1 && chapter <= STORY_CHAPTERS && day >= chapterOpenDay(chapter);
}

export function chapterRewardKey(chapter: number): string {
  return `chapter:${chapter}`;
}

// 章节标题与完成后得到的认识（docs/00「八届主线的线索推进」）。标题在章节开放后才下发，
// 认识在完成本章事件后才下发，免得提前剧透；对白与任务仍待制作。
export interface StoryChapterDef { title: string; learned: string; event: string; discoveries: string[] }
export const CHAPTERS: StoryChapterDef[] = [
  { title: '盛会', learned: '大竞技场是各地共同尊重的传统，但主角认出了奖章上的古老神纹。', event: '开幕式上，奖章在灯下显出与遗迹相同的纹路。', discoveries: ['古老神纹'] },
  { title: '裂痕', learned: '竞技场外的遗迹出现了与奖章相同的符号，附近生物开始异常。', event: '赛后在城外遗迹发现新的侵蚀痕迹。', discoveries: ['侵蚀痕迹'] },
  { title: '被抹去的名字', learned: '某些往届冠军的记录被删改，他们曾被授予比赛之外的职责。', event: '旧档案里，几名冠军的名字被同一把刀刮去。', discoveries: ['被删改的冠军记录'] },
  { title: '旧约', learned: '竞技场曾是诸神与凡人共同守护封印的地方，冠军只是仪式的一部分。', event: '地下祭室保存着诸神与凡人的旧约。', discoveries: ['旧约祭室'] },
  { title: '渗入', learned: '有人借锻造、物资交易或赛事筹备运送被侵蚀的材料。', event: '追查物资账本，发现侵蚀材料被送进赛事筹备处。', discoveries: ['侵蚀材料账本'] },
  { title: '夺取', learned: '某个势力正在改动仪式，试图把封印中的力量据为己有。', event: '赛程被人为改动，封印节点暴露在决赛场地下方。', discoveries: ['被改动的赛程'] },
  { title: '重聚', learned: '各地仍保存着旧约的碎片，主角与伙伴开始修复守护关系。', event: '各地伙伴带来旧约碎片，重新组成守护阵。', discoveries: ['旧约碎片'] },
  { title: '守护', learned: '主角与各地伙伴揭露并阻止了这次夺取封印的行动；世界仍有残留的侵蚀。', event: '决赛之后，守护阵重新闭合，但远处仍有侵蚀的回声。', discoveries: ['守护阵'] },
];
