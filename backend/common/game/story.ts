// 八章主线（docs/00 §9.4.2、docs/13 §6.3）：按个人日历开放，名次／海选／地区通关都不阻挡章节。
// 赛事奖励与主线奖励使用不同唯一键；完成章节与领取奖励分开。

export const STORY_CHAPTERS = 8;
// 团队公共经验奖励（docs/00 §9.4.2）；数值待校准。
export const CHAPTER_BEXP = 1350;

export function chapterOpenDay(chapter: number): number {
  return chapter * 120;
}

export function chapterAvailable(chapter: number, day: number): boolean {
  return chapter >= 1 && chapter <= STORY_CHAPTERS && day >= chapterOpenDay(chapter);
}

export function chapterRewardKey(chapter: number): string {
  return `chapter:${chapter}`;
}
