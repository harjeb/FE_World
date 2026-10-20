import { OP } from '@common/protocol/ops.ts';
import { session } from '../api/session.ts';
import type { BoardEntry } from '../api/session.ts';
import { links } from '../router.ts';
import { itemName, useAct } from './SystemParts.tsx';

const STATE_TAG: Record<BoardEntry['state'], [string, string]> = {
  turnin: ['可交任务', 'tag-green'], doing: ['进行中', 'tag-brass'], ready: ['可以去做', 'tag-blue'], wait: ['未开放', 'tag-grey'],
};

function hrefOf(entry: BoardEntry): string {
  const { page, region } = entry.link;
  if (page === 'quests') return region ? `${links.quests}?region=${region}` : links.quests;
  return links[page];
}

// 任务板：把现在能做、能交的任务放在一起，每条标明“主线”或“支线”。目标类支线不用接取：打对应的战斗就会自动计数，
// 打完在这里直接交任务（也可以去各地区任务页交）。
export function QuestBoard({ board }: { board: BoardEntry[] }) {
  const { busy, act } = useAct();
  if (board.length === 0) return null;
  const claim = (entry: BoardEntry) => act(`board-${entry.id}`, () => session.run<{ gold: number; items: [string, number][] }>(OP.CLAIM_QUEST_REWARD, { questId: entry.claim }),
    r => `交付「${entry.title}」：金币 +${r.gold}${r.items.length ? `、${r.items.map(([item, count]) => `${itemName(item)} ×${count}`).join('、')}` : ''}`);
  return (
    <section className="panel quest-board" aria-labelledby="qb-h">
      <div className="ph"><h2 id="qb-h">任务板</h2><span style={{ fontSize: 12, color: '#6A6256' }}>现在能做、能交的任务 · {board.length} 条</span></div>
      <ul className="board-list">
        {board.map(entry => {
          const [stateText, stateTag] = STATE_TAG[entry.state];
          return (
            <li key={entry.id} className={`board-row ${entry.label} ${entry.state}`} data-board={entry.id} data-label={entry.label}>
              <span className={`tag ${entry.label === 'main' ? 'tag-red' : 'tag-grey'} board-label`}>{entry.label === 'main' ? '主线' : '支线'}</span>
              <div className="min-w-0">
                <div className="nm">{entry.title} <span className={`tag ${stateTag}`}>{stateText}</span></div>
                <div className="sp">{entry.summary}</div>
                {entry.progress && entry.progress.need > 0 && (
                  <div className="board-progress">
                    <progress value={entry.progress.have} max={entry.progress.need} aria-label={`${entry.title} 进度`} />
                    <b className="num">{entry.progress.have} / {entry.progress.need}</b>
                  </div>
                )}
              </div>
              <span className="acts">
                {entry.claim
                  ? <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void claim(entry)}>{busy === `board-${entry.id}` ? '交付中…' : '交任务'}</button>
                  : entry.state !== 'wait' && <a className="btn btn-sm" href={hrefOf(entry)}>前往</a>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
