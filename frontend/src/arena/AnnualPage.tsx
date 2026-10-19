import { useEffect, useMemo, useState } from 'react';
import { ARENA_MAPS } from '@common/arena/maps.ts';
import { unitById } from '@common/engine/index.ts';
import type { BattleState } from '@common/engine/index.ts';
import { annualIndexFor, nextFestivalRound } from '@common/game/annual.ts';
import type { AnnualEntry } from '@common/game/annual.ts';
import { festivalMapId } from '@common/game/battles.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ActionQuote, ServerAnnual } from '../api/session.ts';
import { BattlePage } from '../battle/BattlePage.tsx';
import { fallenLine } from '../battle/Dialogs.tsx';
import type { BattleSession } from '../battle/session.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { QuoteBox, TeamPicker, UnitFace, useAct } from '../pages/SystemParts.tsx';
import { ANNUAL_STATE, Bracket, isLive, nextMatchLabel } from './AnnualParts.tsx';
import { busyReason } from '../model/roster.ts';

type Entry = NonNullable<ServerAnnual['entry']>;

function goalOf(state: BattleState): string {
  if (state.goal.kind === 'boss') return `击败主将 · ${unitById(state, state.goal.target).name}`;
  if (state.goal.kind === 'seize') return '我方主将压制王座';
  return `全灭对手 ${state.units.filter(u => u.side === 'enemy').length} 人`;
}

// The map the next match is played on, from the same rule the server uses (game/battles.ts).
const nextMap = (entry: Entry) => ARENA_MAPS[festivalMapId(nextFestivalRound(entry as unknown as AnnualEntry))];

function festivalSession(state: BattleState, label: string, back: () => void): BattleSession {
  return {
    key: state.id,
    initial: state,
    meta: { region: `大竞技场 · ${label}`, goal: goalOf(state), extraLabel: '赛制', extraValue: '真实死亡 · 局间只恢复存活者 HP' },
    surrender: true,
    apply: action => session.applyBattle(state.id, action),
    exit: { label: '暂离（战斗保留）', href: links.camp },
    result: end => {
      const won = end.result?.winner === 'player';
      return {
        title: won ? '本场胜利' : '本场落败',
        won,
        lines: [
          fallenLine(end),
          won ? '存活者下一场开打前恢复 HP；用掉的道具不补，阵亡的角色不会回来。' : '海选打满 3 场后按胜场判断是否晋级；正赛输一场即结束本届。',
          '回放已保存，可以在「战报」里看。',
        ],
        action: { label: '返回赛程', run: back },
      };
    },
  };
}

// 年度大竞技场 (docs/00 §9.4): register once a year, three qualifiers needing two wins, then six
// single-elimination rounds. Every match costs 2 days and is lethal; the page plays the match itself.
export function AnnualPage() {
  const { annual } = useSession();
  const [check, setCheck] = useState(0);
  const [battle, setBattle] = useState<BattleState | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setBattle(undefined);
    session.activeBattle().then(b => { if (alive) setBattle(b && b.mode === 'festival' ? b.state : null); });
    return () => { alive = false; };
  }, [check]);

  const live = annual?.entry && isLive(annual.entry) ? annual.entry : null;
  const built = useMemo<BattleSession | null>(
    () => (battle ? festivalSession(battle, live ? `第 ${live.annualIndex} 届 · ${nextMatchLabel(live)}` : battle.name, () => setCheck(c => c + 1)) : null),
    // Built once per match: later refreshes must not remount the battle page.
    [battle?.id],
  );

  if (battle === undefined) return <Shell current="arena"><p style={{ color: '#4E473D' }}>正在读取大竞技场…</p></Shell>;
  if (built) return <BattlePage key={built.key} session={built} />;
  return <AnnualOverview onStarted={() => setCheck(c => c + 1)} />;
}

function AnnualOverview({ onStarted }: { onStarted: () => void }) {
  const { annual, state } = useSession();
  const { busy, act } = useAct();
  const active = state?.units.filter(u => u.status === 'active') ?? [];
  // 远征或派遣中的角色不能报名（REGISTER_ANNUAL 拒绝）。
  const [team, setTeam] = useState<string[]>(() => active.filter(u => !busyReason(u, annual)).map(u => u.id));
  const [quote, setQuote] = useState<ActionQuote | null>(null);
  const version = state?.version ?? 0;
  useEffect(() => setQuote(null), [version]);

  if (!annual || !state) {
    return <Shell current="arena"><p style={{ color: '#4E473D' }}>暂时读不到大竞技场，刷新页面再试。</p></Shell>;
  }
  const current = annual.entry && annual.entry.annualIndex === annual.annualIndex ? annual.entry : null;
  const previous = annual.entry && annual.entry.annualIndex !== annual.annualIndex ? annual.entry : null;
  const units = (ids: string[]) => ids.map(id => state.units.find(u => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  // Outside the window the page talks about the next edition (the server's nextOpenDay; 4000 = no more).
  const finished = !annual.windowOpen && annual.nextOpenDay >= 4000;
  const shownIndex = current?.annualIndex ?? (annual.windowOpen || finished ? annual.annualIndex : annualIndexFor(annual.nextOpenDay));
  const map = current && isLive(current) ? nextMap(current) : null;

  return (
    <Shell current="arena">
      <div className="brief-head">
        <div>
          <div className="eyebrow">竞技场 · 年度大竞技场 · {dateLabel(state.day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>第 {shownIndex} 届大竞技场</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>
            海选 {annual.qualifierMatches} 场至少 {annual.qualifierWins} 胜进入 64 强正赛，正赛单败 6 轮夺冠。每场推进 {annual.costDays} 日，倒下的普通角色永久死亡；当届出局或退赛不能重报。
          </p>
        </div>
        <a className="btn btn-sm btn-ghost" href={links.arena}>‹ 普通竞技场</a>
      </div>

      <div className="sys-cols">
        <div className="colstack">
          <section className="panel" aria-labelledby="br-h">
            <div className="ph">
              <h2 id="br-h">本届赛程</h2>
              {current ? <span className={`tag ${ANNUAL_STATE[current.state][1]}`}>{ANNUAL_STATE[current.state][0]}</span>
                : annual.windowOpen ? <span className="tag tag-blue">报名中</span> : <span className="tag tag-grey">{finished ? '八届已结束' : '未开放'}</span>}
            </div>
            {current && <Bracket entry={current} matches={annual.qualifierMatches} wins={annual.qualifierWins} />}

            {current && isLive(current) && map && (
              <div className="next-match">
                <div className="nm-title">下一场 · {nextMatchLabel(current)}</div>
                <dl className="facts">
                  <dt>地图</dt><dd>{map.name} · 出战 {map.deploy} 人 · {map.turnLimit} 回合 · {map.goalText}</dd>
                  <dt>出战</dt><dd>按名单顺序取前 {map.deploy} 名存活者，第 1 位担任主将。</dd>
                </dl>
                {quote && <QuoteBox quote={quote} />}
                <div className="go-bar">
                  <button type="button" className="btn btn-ghost" disabled={busy !== null}
                    onClick={() => { if (window.confirm('退出本届后不能重新报名，已发生的伤亡和消耗保留。确认退赛？')) void act('withdraw', () => session.run(OP.WITHDRAW_ANNUAL), () => '已退出本届赛事'); }}>
                    退出本届赛事
                  </button>
                  {!quote
                    ? <button type="button" className="btn" disabled={busy !== null}
                      onClick={() => void act('quote', () => session.quote('annual'), q => { setQuote(q); return q.blockers.length > 0 ? `现在不能开打：${q.blockers.join('；')}` : `报价：推进 ${q.costDays} 日 → ${q.date.label}`; })}>
                      {busy === 'quote' ? '预览中…' : '预览这一场'}
                    </button>
                    : <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null || quote.blockers.length > 0}
                      onClick={() => void act('start', () => session.execute(quote.quoteId), () => `开打：${nextMatchLabel(current)}`).then(ok => { if (ok) onStarted(); })}>
                      {busy === 'start' ? '入场中…' : `确认开打 · ${nextMatchLabel(current)}`}
                    </button>}
                </div>
              </div>
            )}

            {current && !isLive(current) && (
              <p className="sys-note">
                {current.state === 'champion' ? '本届夺冠！下一届仍从海选打起。' : current.state === 'withdrawn' ? '本届已退赛，下一届重新报名。' : '本届已经出局，下一届从海选重新开始。'}
                主线章节不受影响，可以在<a href={links.story}>主线</a>里完成当年的事件。
              </p>
            )}

            {!current && (annual.windowOpen
              ? <>
                <div className="grp">选择参赛名单 · 勾选顺序即出战顺序</div>
                <TeamPicker units={active} team={team} max={active.length} protagonist={state.player.protagonist} onChange={setTeam} ordered why={u => busyReason(u, annual)} />
                <div className="go-bar">
                  <span style={{ fontSize: 13, color: '#4E473D', marginRight: 'auto' }}>报名会锁定名单与当前快照；之后只能用名单里仍活着的人。</span>
                  <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null || team.length === 0}
                    onClick={() => void act('register', () => session.run(OP.REGISTER_ANNUAL, { unitIds: team }), () => `已报名第 ${annual.annualIndex} 届大竞技场（${team.length} 人）`)}>
                    {busy === 'register' ? '报名中…' : `报名第 ${annual.annualIndex} 届 · ${team.length} 人`}
                  </button>
                </div>
              </>
              : <p className="sys-note">{finished
                ? '八届大竞技场都已结束。'
                : `报名窗口是每年最后 18 日。第 ${shownIndex} 届在 ${plainDate(annual.nextOpenDay)} 开放报名（${annual.nextOpenDay - state.day} 日后）。`}</p>)}
          </section>

          {previous && (
            <section className="panel" aria-labelledby="prev-h">
              <div className="ph"><h2 id="prev-h">上一届 · 第 {previous.annualIndex} 届</h2><span className={`tag ${ANNUAL_STATE[previous.state][1]}`}>{ANNUAL_STATE[previous.state][0]}</span></div>
              <Bracket entry={previous} matches={annual.qualifierMatches} wins={annual.qualifierWins} />
            </section>
          )}
        </div>

        <div className="colstack">
          {current && (
            <section className="panel" aria-labelledby="team-h">
              <div className="ph"><h2 id="team-h">参赛名单</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{current.unitIds.length} 人 · 报名时锁定</span></div>
              <ul className="roster-mini">
                {units(current.unitIds).map((u, i) => {
                  const fallen = u.status !== 'active' || (current.survivingIds.length > 0 && !current.survivingIds.includes(u.id));
                  return (
                    <li key={u.id} className={fallen ? 'fallen' : undefined}>
                      <span className="tm-ord">{i + 1}</span>
                      <UnitFace unit={u} size={32} dim={fallen} />
                      <span className="min-w-0"><b>{u.name}</b><span className="muted"> · {u.className} Lv {u.level}</span></span>
                      <span className={`tag ${fallen ? 'tag-red' : 'tag-green'}`}>{fallen ? (u.status === 'dead' ? '阵亡' : '离队') : '可出战'}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          <section className="panel" aria-labelledby="ar-h">
            <div className="ph"><h2 id="ar-h">规则</h2></div>
            <ul className="sys-rules">
              <li>每届都从海选打起：{annual.qualifierMatches} 场里至少赢 {annual.qualifierWins} 场才进正赛，前冠军也不例外。</li>
              <li>报名锁定名单与快照，不能换入名单外的角色；每场按名单顺序出战。</li>
              <li>局间只恢复存活者的 HP；阵亡不复活，用掉的道具不补。</li>
              <li>当届出局或退赛不能重报，下一届重新海选。</li>
              <li>名次不影响<a href={links.story}>主线</a>章节。</li>
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}
