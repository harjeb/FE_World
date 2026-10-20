import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { StoryChapter } from '../api/session.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { LockIcon } from '../ui/icons.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { ANNUAL_STATE } from '../arena/AnnualParts.tsx';
import { useAct } from './SystemParts.tsx';
import { StoryQuestPanel } from './StoryQuestPanel.tsx';

type Phase = 'locked' | 'open' | 'done' | 'claimed';
const phaseOf = (c: StoryChapter): Phase => (!c.available ? 'locked' : !c.completed ? 'open' : !c.claimed ? 'done' : 'claimed');
const PHASE_TAG: Record<Phase, [string, string]> = {
  locked: ['未开放', 'tag-grey'], open: ['可完成', 'tag-blue'], done: ['奖励待领取', 'tag-green'], claimed: ['已完成', 'tag-brass'],
};

// 主线 · 八届大竞技场 (docs/00 §9.4.2): one chapter a year on the personal calendar. Rank, qualifiers and
// regions never gate a chapter; each chapter's main quest (docs/38) completes it, and claiming its shared experience is separate,
// and each reward key pays once (GET_STORY / COMPLETE_STORY_EVENT / CLAIM_REWARD).
export function StoryPage() {
  const { story, state, annual } = useSession();
  const { busy, act } = useAct();
  const day = state?.day ?? 0;

  if (!story) {
    return <Shell current="story"><p style={{ color: '#4E473D' }}>暂时读不到主线进度，刷新页面再试。</p></Shell>;
  }
  // 防御性过滤：GET_STORY 已只返回已开放或已完成的章节，这里再过一次，不显示未开放章节。
  const chapters = story.chapters.filter(c => c.available || c.completed);
  const done = chapters.filter(c => c.completed).length;
  const claimed = chapters.filter(c => c.claimed).length;
  const entry = annual?.entry && annual.entry.annualIndex === annual.annualIndex ? annual.entry : null;

  return (
    <Shell current="story">
      <div className="brief-head">
        <div>
          <div className="eyebrow">主线 · {dateLabel(day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>八届大竞技场</h1>
        </div>
        <div style={{ textAlign: 'right', fontSize: 13, color: '#4E473D' }}>
          已完成 <b className="num">{done}</b> / {chapters.length} 章 · 已领奖 <b className="num">{claimed}</b> 章
          <div className="seasons" aria-hidden="true">
            {chapters.map(c => <i key={c.chapter} className={c.completed ? 'past' : c.available ? 'cur' : ''} />)}
          </div>
        </div>
      </div>

      <div className="sys-cols">
        <section className="panel" aria-labelledby="ch-h">
          <div className="ph"><h2 id="ch-h">章节</h2></div>
          <ol className="chapters">
            {chapters.map(c => {
              const phase = phaseOf(c);
              const [label, tag] = PHASE_TAG[phase];
              return (
                <li key={c.chapter} className={`chap ${phase}`} data-chapter={c.chapter}>
                  <span className="ch-no"><span>第</span><b>{c.chapter}</b><span>章</span></span>
                  <div className="min-w-0">
                    <div className="ch-title">
                      {c.title ? <span className="serif">{c.title}</span> : <span className="muted inline-flex items-center gap-1"><LockIcon />尚未开放</span>}
                      <span className={`tag ${tag}`}>{label}</span>
                    </div>
                    <div className="ch-sub">
                      {c.available ? `${plainDate(c.openDay)}开放` : `${plainDate(c.openDay)}开放 · 还有 ${c.openDay - day} 日`}
                    </div>
                    {c.event && <p className="ch-learned"><span className="tag tag-grey">事件</span>{c.event}</p>}
                    {c.learned && <p className="ch-learned"><span className="tag tag-grey">本章所得</span>{c.learned}</p>}
                    {(c.discoveries ?? []).length > 0 && <ul className="ch-disc">{c.discoveries!.map(d => <li key={d}>{d}</li>)}</ul>}
                    {c.quest && <StoryQuestPanel quest={c.quest} />}
                    {c.finalBoss && (
                      <p className="ch-learned">
                        <span className={`tag ${c.finalBoss.defeated ? 'tag-green' : c.finalBoss.available ? 'tag-red' : 'tag-grey'}`}>最终首领</span>
                        {c.finalBoss.defeated ? '已在挑战塔终层击败。' : c.finalBoss.available ? <>挑战塔终层已开放：<a href={links.tower}>前往挑战塔 ›</a></> : ''}
                      </p>
                    )}
                  </div>
                  <div className="ch-acts">
                    {phase === 'open' && c.quest?.done && (
                      <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null}
                        onClick={() => void act(`c${c.chapter}`, () => session.run(OP.COMPLETE_STORY_EVENT, { chapter: c.chapter }), () => `完成主线第 ${c.chapter} 章「${c.title}」`)}>
                        {busy === `c${c.chapter}` ? '记录中…' : '记录本章完成'}
                      </button>
                    )}
                    {phase === 'done' && (
                      <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null}
                        onClick={() => void act(`r${c.chapter}`, () => session.run<{ bexp: number; total: number }>(OP.CLAIM_REWARD, { rewardKey: `chapter:${c.chapter}` }),
                          r => `领取第 ${c.chapter} 章奖励：公共经验 +${r.bexp}（库存 ${r.total}）`)}>
                        {busy === `r${c.chapter}` ? '领取中…' : `领取 ${story.bexp} 公共经验`}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        <div className="colstack">
          <section className="panel" aria-labelledby="an-h">
            <div className="ph"><h2 id="an-h">本届大竞技场</h2><a className="btn btn-sm btn-ghost" href={links.annual}>赛程 ›</a></div>
            <div style={{ padding: '10px 16px 12px', fontSize: 14 }}>
              {annual
                ? <>
                  <div><b>第 {annual.annualIndex} 届</b>{entry ? <span className={`tag ${ANNUAL_STATE[entry.state][1]}`} style={{ marginLeft: 8 }}>{ANNUAL_STATE[entry.state][0]}</span> : <span className="tag tag-grey" style={{ marginLeft: 8 }}>未报名</span>}</div>
                  {story.annualSummary && <p style={{ marginTop: 6, fontSize: 13 }}>最近：{story.annualSummary.text}</p>}
                </>
                : <p style={{ fontSize: 13, color: '#6A6256' }}>暂时读不到大竞技场信息。</p>}
            </div>
          </section>

          {(story.companions ?? []).length > 0 && (
            <section className="panel" aria-labelledby="co-h">
              <div className="ph"><h2 id="co-h">伙伴任务</h2><a className="btn btn-sm btn-ghost" href={links.quests}>地区任务 ›</a></div>
              <ul className="sys-rules">
                {story.companions!.map(co => (
                  <li key={co.character}>
                    <b>{co.name}</b>
                    <span className={`tag ${co.done ? 'tag-brass' : co.recruited ? 'tag-blue' : 'tag-grey'}`} style={{ marginLeft: 6 }}>{co.done ? '已完成' : co.recruited ? '可接取' : '尚未加入'}</span>
                    {co.recruited ? <> · {co.questName}{co.epilogue ? <><br /><span className="muted">{co.epilogue}</span></> : ''}</>
                      : ' · 通过地区远征招募后解锁'}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}
