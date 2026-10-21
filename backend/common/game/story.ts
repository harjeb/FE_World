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

// 章节标题在开放后下发，结论和发现仅在完成章节后下发。
export interface StoryChapterDef { title: string; learned: string; event: string; discoveries: string[] }
export const CHAPTERS: StoryChapterDef[] = [
  { title: '盛会', learned: '阿尔维恩的死没有遗体作证。他最后一次远行前收到过带归灯印记的求援信，公布的出城日期也与驿站回执不符。', event: '冠军席空着，旧镇的驿站记录却正在被人焚毁。', discoveries: ['没有遗体的葬礼', '半张送信回执'] },
  { title: '裂痕', learned: '冠军确实去过禁忌之地，归途却只有运送“圣物”的医护车。车上的血迹、绷带与神力感应晶片，让死亡告示变得更加可疑。', event: '北道关门的空车上，留下了反复修补的束带。', discoveries: ['通往禁忌之地的剑刻', '带血的医护车'] },
  { title: '被抹去的名字', learned: '阿尔维恩并非自请远行：调令曾被修改。死亡名册写下他的名字后，代号“第七号”的伤者仍在领取药物。', event: '档案馆底册里，死者的名字与仍在使用的编号并列。', discoveries: ['篡改过的求援调令', '未注销的第七号'] },
  { title: '旧约', learned: '地下慈济室的伤者有着与冠军一致的旧伤和神裔反应。铸器师维洛参与运送；教首仍年年为亡妻艾蕾娜守着一盏灯。', event: '病房已经搬空，病历来不及一同带走。', discoveries: ['铸器师的私印', '神裔伤者的病历'] },
  { title: '渗入', learned: '阿尔维恩仍然活着。维洛救回了他，却将他接入装置，靠药物维持生命并持续抽取神力；这不是治疗，而是囚禁。', event: '暗仓深处，失踪冠军终于睁开双眼。', discoveries: ['仍活着的阿尔维恩', '维生与取力并存的装置'] },
  { title: '夺取', learned: '阿尔维恩被引往禁忌之地与受缚之物交战，受伤后被维洛带回。装置把神力送往北地，逐步打开枷锁，祭仪院的最高印章批准了这一切。', event: '外送管线被切断，已经断裂的两道枷锁却无法复原。', discoveries: ['反向开启的封印线路', '祭仪院批准的供能记录'] },
  { title: '重聚', learned: '教首洛德里克为复活亡妻，与魔神阿扎赫订约，派人诱使冠军赴战，再默许维洛持续汲取他的神力。第八届授冠礼将是最后一次交换。', event: '逃亡教士带来了契约副本与教首亲笔签发的求援信。', discoveries: ['以神力换取复生的契约', '教首亲签的诱敌求援信'] },
  { title: '守护', learned: '竞技场落幕后，教首接入装置并邪神化，最终在祭台前被击败。阿尔维恩获救，王城阴谋告破；魔神已松脱枷锁，禁忌之地成为下一段征途。', event: '黎明到来，阿尔维恩的名字被重新写回活着的名单。', discoveries: ['邪神化教首的败亡', '通往禁忌之地的道路'] },
];
