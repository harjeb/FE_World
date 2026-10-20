import type { Player, Store } from './store.ts';
import { bountyRows } from './bounties.ts';
import { storyQuestView } from './story.ts';
import { chapterAvailable, chapterOpenDay, STORY_CHAPTERS } from '../common/game/story.ts';
import { CHAPTERS } from '../common/game/story.ts';

// 任务板（docs/38 §3.7）：把现在能做、能交的任务摆在一起，一般 4～7 条，每条标明“主线”或“支线”。
// 优先级：可交付的 > 主线（当前章的前置任务和收尾战，最多 3 条）> 进行中的目标类支线 > 可接取的伙伴任务／地区任务。
export const BOARD_MAX = 7;
export const BOARD_MIN = 4;

export type BoardPage = 'story' | 'quests' | 'tavern' | 'arena' | 'dispatch' | 'field' | 'dungeon';
export interface BoardEntry {
  id: string;
  label: 'main' | 'side';
  // turnin：做完了，可以交；doing：进行中（有进度）；ready：现在就能去做／接取；wait：还没开放（只给预告）。
  state: 'turnin' | 'doing' | 'ready' | 'wait';
  title: string;
  summary: string;
  progress?: { have: number; need: number };
  link: { page: BoardPage; region?: number };
  // 可以直接在任务板上交付的任务 ID（CLAIM_QUEST_REWARD）。
  claim?: string;
}

export interface BoardRegion {
  region: number; name: string;
  quests: { id: string; name: string; objective: string; available: boolean; done: boolean; claimed: boolean; inProgress: boolean; companion?: string | null; archived?: boolean; dungeonOnly?: boolean }[];
}

const STEP_PAGE: Record<string, BoardPage> = { dispatch: 'dispatch', submit: 'story', find: 'story', duel: 'story', arena: 'arena', tavern: 'tavern' };

function stepSummary(step: ReturnType<typeof storyQuestView> extends infer Q ? Q extends { steps: (infer S)[] } ? S : never : never): { text: string; progress?: { have: number; need: number } } {
  const s = step as { kind: string; days?: number; itemName?: string; count?: number; held?: number | null; where?: string; enemy?: string; wins?: number; have?: number };
  switch (s.kind) {
    case 'dispatch': return { text: `派遣一支队伍探索，一次满 ${s.days} 日（本章开放后出发）` };
    case 'submit': return { text: `提交 ${s.count} 份${s.itemName}（仓库里有 ${s.held ?? 0}）` };
    case 'find': return { text: `在「${s.where}」的宝箱里找到「${s.itemName}」` };
    case 'duel': return { text: `单挑「${s.enemy}」，真实死亡，输了可重来` };
    case 'arena': return { text: `在普通竞技场赢 ${s.wins} 场`, progress: { have: s.have ?? 0, need: s.wins ?? 0 } };
    default: return { text: `在酒馆小游戏里赢 ${s.wins} 次`, progress: { have: s.have ?? 0, need: s.wins ?? 0 } };
  }
}

function mainEntries(store: Store, player: Player): BoardEntry[] {
  const out: BoardEntry[] = [];
  const done = new Set(player.flags.questsDone ?? []);
  // 已打完收尾战、还没领的奖励：主线可交付。
  for (let chapter = 1; chapter <= STORY_CHAPTERS; chapter++) {
    if (!chapterAvailable(chapter, player.day)) continue;
    const quest = storyQuestView(store, player, chapter);
    if (!quest) continue;
    if (done.has(quest.id) && !quest.claimed) {
      out.push({ id: `main-claim-${chapter}`, label: 'main', state: 'turnin', title: `第 ${chapter} 章：${quest.name}`, summary: '收尾战已通关，领取任务报酬', link: { page: 'story' }, claim: quest.id });
    }
  }
  // 当前章：第一个已开放、收尾战还没打的章节。
  for (let chapter = 1; chapter <= STORY_CHAPTERS; chapter++) {
    if (!chapterAvailable(chapter, player.day)) continue;
    const quest = storyQuestView(store, player, chapter);
    if (!quest || done.has(quest.id)) continue;
    const title = `第 ${chapter} 章「${CHAPTERS[chapter - 1].title}」`;
    for (const step of quest.steps.filter(s => !s.done)) {
      const { text, progress } = stepSummary(step);
      out.push({ id: step.id, label: 'main', state: progress && progress.have > 0 ? 'doing' : 'ready', title: `${title} · ${step.name}`, summary: text, ...(progress ? { progress } : {}), link: { page: STEP_PAGE[step.kind] } });
    }
    if (quest.steps.every(s => s.done) || quest.legacyCompleted) {
      out.push({ id: quest.id, label: 'main', state: quest.available ? 'ready' : 'wait', title: `${title} · ${quest.name}`, summary: `收尾战：${quest.objective}（${quest.mapName}）`, link: { page: 'story' } });
    }
    return out;
  }
  // 还没有开放的章节：只给预告，不剧透标题。
  const next = Array.from({ length: STORY_CHAPTERS }, (_, i) => i + 1).find(chapter => !chapterAvailable(chapter, player.day));
  if (next) out.push({ id: `main-next-${next}`, label: 'main', state: 'wait', title: `主线 第 ${next} 章`, summary: `将在第 ${chapterOpenDay(next)} 日开放（还有 ${Math.max(0, chapterOpenDay(next) - player.day)} 日）`, link: { page: 'story' } });
  return out;
}

export function questBoard(store: Store, player: Player, regions: readonly BoardRegion[]): BoardEntry[] {
  const turnin: BoardEntry[] = [], main = mainEntries(store, player), doing: BoardEntry[] = [], ready: BoardEntry[] = [];

  // 新开放章节的悬赏排在前面，免得被早期的挤出任务板。
  for (const row of bountyRows(player).sort((x, y) => (y.chapter ?? 0) - (x.chapter ?? 0))) {
    if (!row.available || row.claimed) continue;
    const entry: BoardEntry = {
      id: row.id, label: 'side', state: row.done ? 'turnin' : row.have > 0 ? 'doing' : 'ready', title: row.name, summary: `${row.objective}，不用接取，打完就能交`,
      progress: { have: row.have, need: row.need }, link: { page: row.type === 'dungeon' ? 'dungeon' : 'field' }, ...(row.done ? { claim: row.id } : {}),
    };
    (row.done ? turnin : row.have > 0 ? doing : ready).push(entry);
  }
  for (const region of regions) {
    const open = region.quests.filter(q => !q.archived && !q.dungeonOnly);
    for (const q of open.filter(q => q.done && !q.claimed)) {
      turnin.push({ id: q.id, label: 'side', state: 'turnin', title: q.name, summary: `${region.name} · 已完成，领取任务报酬`, link: { page: 'quests', region: region.region }, claim: q.id });
    }
    const first = open.find(q => q.available && !q.done);
    if (first) {
      const entry: BoardEntry = { id: first.id, label: 'side', state: first.inProgress ? 'doing' : 'ready', title: first.name, summary: `${region.name} · ${first.objective}`, link: { page: 'quests', region: region.region } };
      (first.companion ? doing : ready).push(entry);
    }
  }

  // 排序后截取：可交付全部保留（最多 7），再依次放主线（最多 3）、进行中的支线、可接取的支线。
  const picked: BoardEntry[] = [...turnin.slice(0, BOARD_MAX)];
  const take = (list: BoardEntry[], limit: number) => { for (const e of list.slice(0, limit)) if (picked.length < BOARD_MAX && !picked.some(p => p.id === e.id)) picked.push(e); };
  take(main, 3);
  take(doing, 3);
  take(ready, BOARD_MAX);
  take(doing.slice(3), BOARD_MAX);
  take(main.slice(3), BOARD_MAX);
  return picked;
}
