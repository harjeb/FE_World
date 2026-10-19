import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { StoryChapter } from '../api/session.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { LockIcon } from '../ui/icons.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { ANNUAL_STATE } from '../arena/AnnualParts.tsx';
import { useAct } from './SystemParts.tsx';

type Phase = 'locked' | 'open' | 'done' | 'claimed';
const phaseOf = (c: StoryChapter): Phase => (!c.available ? 'locked' : !c.completed ? 'open' : !c.claimed ? 'done' : 'claimed');
const PHASE_TAG: Record<Phase, [string, string]> = {
  locked: ['未开放', 'tag-grey'], open: ['可完成', 'tag-blue'], done: ['奖励待领取', 'tag-green'], claimed: ['已完成', 'tag-brass'],
};

// 主线 · 八届大竞技场 (docs/00 §9.4.2): one chapter a year on the personal calendar. Rank, qualifiers and
// regions never gate a chapter; completing its event and claiming its shared experience are separate,
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
  const next = chapters.find(c => !c.available);
  const entry = annual?.entry && annual.entry.annualIndex === annual.annualIndex ? annual.entry : null;

  return (
    <Shell current="story">
      <div className="brief-head">
        <div>
          <div className="eyebrow">主线 · {dateLabel(day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>八届大竞技场</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>每年开放一章。比赛名次、海选和地区进度都不会挡住章节；完成本章事件后，可以领一次团队公共经验 {story.bexp}。</p>
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
          <div className="ph"><h2 id="ch-h">章节</h2><span style={{ fontSize: 12, color: '#6A6256' }}>完成后可回看本章事件、认识与发现</span></div>
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
                    {c.finalBoss && (
                      <p className="ch-learned">
                        <span className={`tag ${c.finalBoss.defeated ? 'tag-green' : c.finalBoss.available ? 'tag-red' : 'tag-grey'}`}>最终首领</span>
                        {c.finalBoss.defeated ? '已在挑战塔终层击败。' : c.finalBoss.available ? <>挑战塔终层已开放：<a href={links.tower}>前往挑战塔 ›</a></> : '完成第八章后，挑战塔终层开放。不要求夺冠，也不要求牺牲伙伴。'}
                      </p>
                    )}
                  </div>
                  <div className="ch-acts">
                    {phase === 'open' && (
                      <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null}
                        onClick={() => void act(`c${c.chapter}`, () => session.run(OP.COMPLETE_STORY_EVENT, { chapter: c.chapter }), () => `完成主线第 ${c.chapter} 章「${c.title}」`)}>
                        {busy === `c${c.chapter}` ? '记录中…' : '完成本章事件'}
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
                  <p style={{ marginTop: 6, fontSize: 13, color: '#4E473D' }}>主线章节不看名次：出局、退赛或夺冠，都能完成当年的章节事件。</p>
                </>
                : <p style={{ fontSize: 13, color: '#6A6256' }}>暂时读不到大竞技场信息。</p>}
            </div>
          </section>

          <section className="panel" aria-labelledby="sr-h">
            <div className="ph"><h2 id="sr-h">规则</h2></div>
            <ul className="sys-rules">
              <li>每章在新一年的第 1 日开放{next ? `；下一章（第 ${next.chapter} 章）在${plainDate(next.openDay)}开放` : '；八章都已开放'}。</li>
              <li>完成章节与领取奖励分开：先完成本章事件，再领取团队公共经验。</li>
              <li>每章的奖励只发一次，重复领取会被拒绝。</li>
              <li>公共经验在<a href={links.prep()}>整备</a>里分给角色，分配不推进日期。</li>
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
