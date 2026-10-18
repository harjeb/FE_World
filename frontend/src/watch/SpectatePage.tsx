import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { BattleEvent, BattleState } from '@common/engine/index.ts';
import { session, useSession } from '../api/session.ts';
import type { BattleNote, ServerBattleView } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { BattleMap } from '../battle/BattleMap.tsx';
import { BattleController } from '../battle/controller.ts';
import { describe } from '../battle/log.ts';
import type { LogEntry } from '../battle/log.ts';
import { playEvents } from '../battle/playback.ts';
import { links } from '../router.ts';
import { agentOnline } from '../shell/Shell.tsx';
import { goalLabel } from '../battle/names.ts';
import { clockTime } from '../ui/calendar.ts';
import { BackIcon, HistoryIcon } from '../ui/icons.tsx';
import { IntentQuote } from './WatchParts.tsx';

const POLL_MS = 1500;
const MAX_BACKOFF_MS = 10_000;

// Agent 实时观战 (TODO UI-02): the battle in progress on this account, read-only. It polls GET_BATTLE
// for the events after the last one shown (sinceEvent), animates them, then adopts the server's state;
// after a dropped connection it backs off and resumes from the same event count. Nothing here is
// simulated locally — when no battle is running the page says so and points to the reports.
export function SpectatePage() {
  const [first, setFirst] = useState<ServerBattleView | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    session.battle(null).then(view => { if (alive) setFirst(view.result ? null : view); }, () => { if (alive) setFirst(null); });
    return () => { alive = false; };
  }, []);
  if (first === undefined) return <Idle message="正在查找进行中的战斗…" />;
  if (first === null) return <Idle message="现在没有进行中的战斗。Agent 或你开始一场战斗后，这里会实时显示它的每一步。" showReports />;
  return <LiveView key={first.battleId} first={first} />;
}

function Idle({ message, showReports = false }: { message: string; showReports?: boolean }) {
  const { data } = useServerData(() => (showReports ? session.replays({ mine: true, limit: 5 }) : Promise.resolve(null)), [showReports]);
  return (
    <div className="app-bg battle-shell">
      <header className="hud" aria-label="观战状态栏">
        <a className="btn btn-sm btn-dark" href={links.camp}><BackIcon />返回军营</a>
        <span className="live-badge off"><i aria-hidden="true" />实时观战</span>
        <span className="ml-auto" style={{ fontSize: 13, color: '#DCE5EB' }}>只读：观战不会改变战局</span>
      </header>
      <main className="stage">
        <section className="panel" style={{ margin: 24, maxWidth: 720, alignSelf: 'start' }}>
          <div className="ph"><h2>实时观战</h2></div>
          <p className="sys-note">{message}</p>
          {data && data.replays.length > 0 && (
            <>
              <div className="grp">最近的战报（历史回放，不是实时）</div>
              <ul className="lr">
                {data.replays.map(r => <li key={r.id}><span>{r.name} · {r.winner === 'player' ? '胜利' : '失败'} · {r.turns} 回合</span><a className="btn btn-sm" href={links.replay(r.id)}><HistoryIcon />回放</a></li>)}
              </ul>
            </>
          )}
          <div className="go-bar"><a className="btn" href={links.reports}>打开战报</a></div>
        </section>
      </main>
    </div>
  );
}

function LiveView({ first }: { first: ServerBattleView }) {
  const { state: account } = useSession();
  const [ctl] = useState(() => new BattleController({
    key: `live-${first.battleId}`, initial: first.state!, readOnly: true, surrender: false,
    meta: { region: first.name, goal: first.state ? goalLabel(first.state) : first.goal, extraLabel: '模式', extraValue: '' },
    result: () => ({ title: '', won: false, lines: [], action: { label: '', run: () => {} } }),
  }));
  const snap = useSyncExternalStore(ctl.subscribe, ctl.get);
  const [view, setView] = useState(first);
  const [notes, setNotes] = useState<BattleNote[]>(first.notes ?? []);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [link, setLink] = useState<{ ok: boolean; at: number; retryIn: number | null }>({ ok: true, at: Date.now(), retryIn: null });
  const [follow, setFollow] = useState(true);
  const count = useRef(first.eventCount);
  const shown = useRef<BattleState>(first.state!);

  useEffect(() => { ctl.follow = follow; }, [ctl, follow]);
  useEffect(() => {
    ctl.set({ settings: { ...ctl.get().settings, scenes: 'off', threat: false } });
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let backoff = POLL_MS;
    const tick = async () => {
      if (!alive) return;
      if (document.hidden) { timer = setTimeout(tick, POLL_MS); return; }
      try {
        const next = await session.battle(first.battleId, count.current);
        if (!alive) return;
        const events: BattleEvent[] = next.events ?? [];
        if (events.length > 0 && next.state) {
          const before = shown.current;
          await playEvents(ctl, events, before);
          setLog(l => [...describe(events, before).reverse(), ...l].slice(0, 80));
        }
        if (next.state) { shown.current = next.state; ctl.set({ state: next.state, view: next.state }); }
        count.current = next.eventCount;
        setView(next);
        setNotes(next.notes ?? []);
        setLink({ ok: true, at: Date.now(), retryIn: null });
        backoff = POLL_MS;
        if (!next.result) timer = setTimeout(tick, POLL_MS);
      } catch {
        if (!alive) return;
        backoff = Math.min(MAX_BACKOFF_MS, backoff * 2);
        setLink(l => ({ ...l, ok: false, retryIn: Math.round(backoff / 1000) }));
        timer = setTimeout(tick, backoff);
      }
    };
    timer = setTimeout(tick, POLL_MS);
    return () => { alive = false; clearTimeout(timer); };
  }, [ctl, first.battleId]);

  const turnNotes = notes.filter(n => n.kind === 'phase').sort((a, b) => b.at - a.at);
  const current = turnNotes.find(n => n.turn === view.turn) ?? null;
  const comments = notes.filter(n => n.kind === 'comment');
  const ended = !!view.result;
  const online = agentOnline(account);
  const mode = view.mode === 'festival' ? '年度大竞技场' : view.mode === 'arena' ? '普通竞技场' : view.mode === 'sparring' ? '练习' : view.challengeId ? '挑战塔' : view.questId ? '地区任务' : '野外战斗';

  return (
    <div className="app-bg battle-shell">
      <header className="hud" aria-label="观战状态栏">
        <a className="btn btn-sm btn-dark" href={links.camp}><BackIcon />返回军营</a>
        <span className={`live-badge${ended ? ' off' : ''}`}><i aria-hidden="true" />{ended ? '已结束' : '实时观战'}</span>
        <div className="flex flex-col">
          <span className="hud-k">{mode}</span>
          <span className="hud-v serif" style={{ fontSize: 18 }}>{view.name}</span>
        </div>
        <span className="hud-sep" aria-hidden="true" />
        <div className="flex flex-col">
          <span className="hud-k">回合</span>
          <span className="hud-v num">第 {view.turn} / {view.turnLimit} 回合 · {view.phase === 'player' ? '我方阶段' : '敌方阶段'}</span>
        </div>
        <div className="flex flex-col">
          <span className="hud-k">胜利条件</span>
          <span className="hud-v">{view.state ? goalLabel(view.state) : view.goal}</span>
        </div>
        <span className="ml-auto flex flex-col items-end" style={{ fontSize: 12, color: '#DCE5EB' }}>
          <span>{link.ok ? `同步于 ${clockTime(link.at)}` : `连接中断，${link.retryIn ?? 1} 秒后重试（会从第 ${count.current} 个事件续上）`}</span>
          <span>只读观战 · Agent {online ? '在线' : '离线'}</span>
        </span>
      </header>

      <main className="stage">
        <div className="mapcol">
          <BattleMap snap={snap} ctl={ctl} />
          <section className="panel" aria-label="观战选项" style={{ padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
            <button type="button" className="toggle" aria-pressed={follow} onClick={() => setFollow(f => !f)}><span className="knob" aria-hidden="true" />镜头跟随行动单位</button>
            <span style={{ fontSize: 13, color: '#4E473D' }}>新事件每 {POLL_MS / 1000} 秒拉取一次；切到后台时暂停，回来后从断点续上。</span>
            {ended && <a className="btn btn-sm btn-primary ml-auto" href={links.replay(view.battleId)}><HistoryIcon />看完整回放</a>}
          </section>
        </div>
        <aside className="side" aria-label="观战信息">
          {ended && (
            <section className="panel watch-end" aria-label="战斗结果">
              <b style={{ fontSize: 16 }}>{view.result!.winner === 'player' ? '我方胜利' : '我方失败'} · {view.result!.reason}</b>
              <span>战斗已结束，结算已写入名册；可以在战报里逐步回看。</span>
            </section>
          )}
          <section className="panel" aria-labelledby="ai-h">
            <div className="ph"><h2 id="ai-h">Agent 的阶段意图</h2><span className="tag tag-brass">计划描述</span></div>
            <div className="intent-k">第 {view.turn} 回合</div>
            {current ? <IntentQuote text={current.text} meta={[`${clockTime(current.at)} 上报`]} /> : <div className="intent-empty">这一回合 Agent 还没有上报意图。</div>}
            {turnNotes.filter(n => n !== current).slice(0, 4).map((n, i) => (
              <IntentQuote key={i} text={n.text} meta={[`第 ${n.turn ?? '?'} 回合`, clockTime(n.at)]} />
            ))}
            {comments.length > 0 && <div className="intent-k">点评</div>}
            {comments.map((n, i) => <IntentQuote key={`c${i}`} text={n.text} meta={[clockTime(n.at)]} />)}
          </section>
          <section className="panel" aria-labelledby="lv-h">
            <div className="ph"><h2 id="lv-h">实时战况</h2><span style={{ fontSize: 12, color: '#6A6256' }}>打开页面之后发生的事件</span></div>
            <ol className="ev">
              {log.map(entry => (
                <li key={entry.id}><span className="lt">第 {entry.turn} 回合 · {entry.side === 'player' ? '我方' : '敌方'}</span><span>{entry.text}</span><span /></li>
              ))}
              {log.length === 0 && <li><span className="lt">等待</span><span>还没有新的行动。</span><span /></li>}
            </ol>
          </section>
        </aside>
      </main>
    </div>
  );
}
