import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BattleMap } from '../battle/BattleMap.tsx';
import { BattleController } from '../battle/controller.ts';
import { playEvents } from '../battle/playback.ts';
import type { PlaybackHost } from '../battle/playback.ts';
import { links } from '../router.ts';
import { BackIcon, HistoryIcon, NextIcon, PlayIcon, PrevIcon } from '../ui/icons.tsx';
import { session } from '../api/session.ts';
import type { BattleNote, ServerReplayData, ServerReplayDetail } from '../api/session.ts';
import { replayFrom } from './recording.ts';
import type { Recording } from './recording.ts';
import { MARK, ReplayTrack, StepMarks } from './ReplayParts.tsx';
import { isKey, replayItems, starLine, timeline, turnStarts } from './replayModel.ts';
import type { ReplayItem } from './replayModel.ts';
import { realDateTime } from '../ui/calendar.ts';
import { IntentQuote } from './WatchParts.tsx';

type Filter = 'all' | 'key' | 'kill' | 'retreat' | 'level';
const FILTERS: [Filter, string, (i: ReplayItem) => boolean][] = [
  ['all', '全部', () => true], ['key', '关键事件', isKey], ['kill', '击败', i => i.type === 'kill'],
  ['retreat', '撤退', i => i.type === 'retreat'], ['level', '升级', i => i.type === 'level'],
];
const SPEEDS = [1, 2, 4] as const;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface Prepared {
  rec: Recording;
  ctl: BattleController;
  items: ReplayItem[];
  line: ReturnType<typeof timeline>;
  starts: Map<number, number>;
  stars: { won: boolean; stars: number; missed: string | null };
}

// Older rules cannot be re-simulated safely (TODO DATA-03): show only the stored final board.
function finalOnly(data: ServerReplayData): Recording {
  return { steps: [], states: [data.state], last: data.state };
}

// Builds the viewer from a stored battle: the recorded commands reproduce the exact board.
function prepare(data: ServerReplayData, compatible: boolean): Prepared {
  const rec = compatible ? replayFrom(data.initial, data.actions) : finalOnly(data);
  const ctl = new BattleController({
    key: 'replay', initial: rec.states[0], readOnly: true, surrender: false,
    meta: { region: data.name, goal: data.goalText, extraLabel: data.kind === 'field' ? '三星评价' : '结果', extraValue: '' },
    result: () => ({ title: '', won: false, lines: [], action: { label: '', run: () => {} } }),
  });
  ctl.set({ settings: { ...ctl.get().settings, scenes: 'off', threat: false, grid: true } });
  const items = replayItems(rec);
  return { rec, ctl, items, line: timeline(rec), starts: turnStarts(rec), stars: starLine(rec, items) };
}

// 历史回放: a stored battle from the server (GET_REPLAY), step by step. Nothing here changes any result.
export function ReplayPage({ id }: { id: string }) {
  const [detail, setDetail] = useState<ServerReplayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDetail(null);
    void session.replay(id).then(setDetail).catch(e => setError(String(e?.message ?? e)));
  }, [id]);
  if (error) return <Frame title="回放" message={/没有公开|找不到/.test(error) ? '找不到这场回放，或这场对局还没有公开。' : `读取回放失败：${error}`} />;
  if (!detail) return <Frame title="回放" message="正在读取回放…" />;
  return <ReplayView key={detail.replayId} detail={detail} />;
}

export function Frame({ title, message }: { title: string; message: string }) {
  return (
    <div className="app-bg battle-shell">
      <header className="hud" aria-label="回放状态栏">
        <a className="btn btn-sm btn-dark" href={links.reports}><BackIcon />返回战报</a>
        <span className="rp-badge"><HistoryIcon />历史回放</span>
        <span className="ml-auto" style={{ fontSize: 13, color: '#DCE5EB' }}>{title}</span>
      </header>
      <main className="stage">
        <section className="panel" style={{ margin: 24, maxWidth: 640 }}>
          <div className="ph"><h2>回放</h2></div>
          <p className="sys-note">{message}</p>
          <div className="go-bar"><a className="btn" href={links.reports}>打开战报列表</a></div>
        </section>
      </main>
    </div>
  );
}

const ACTIVITY_NAME: Record<string, string> = { field: '野外战斗', quest: '地区任务', dungeon: '连续副本', challenge: '挑战塔', arena: '普通竞技场', annual: '年度大竞技场', sparring: '练习' };

export function ReplayView({ detail }: { detail: ServerReplayDetail }) {
  const data = detail.battle;
  const [{ rec, ctl, items, line, starts, stars }] = useState(() => prepare(data, detail.compatible));
  const notes: BattleNote[] = detail.notes.filter(n => n.kind === 'phase');
  const snap = useSyncExternalStore(ctl.subscribe, ctl.get);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [filter, setFilter] = useState<Filter>('key');
  const posRef = useRef(0);
  const listRef = useRef<HTMLOListElement>(null);
  const token = useRef(0);
  const inflight = useRef<number | null>(null);
  const total = rec.steps.length;

  useEffect(() => { ctl.speed = speed; }, [ctl, speed]);

  const show = (p: number) => {
    const at = Math.max(0, Math.min(total, p));
    posRef.current = at;
    setPos(at);
    ctl.set({ state: rec.states[at], view: rec.states[at], floats: [], fading: new Set(), banner: null, levelUp: null });
  };

  const settle = () => {
    token.current++;
    if (inflight.current !== null) show(inflight.current + 1);
    inflight.current = null;
    setAnimating(false);
  };

  const host = (mine: number): PlaybackHost => ({
    speed: ctl.speed,
    get: ctl.get,
    set: patch => {
      if (token.current === mine) ctl.set(patch);
      else { patch.levelUp?.done(); patch.combat?.done(); }
    },
    focus: at => { if (token.current === mine) ctl.focus(at); },
    float: (at, text, kind) => { if (token.current === mine) ctl.float(at, text, kind); },
    showBanner: (side, turn) => (token.current === mine ? ctl.showBanner(side, turn) : Promise.resolve()),
  });

  const advance = async (mine: number): Promise<boolean> => {
    const p = posRef.current;
    if (p >= total || token.current !== mine) return false;
    inflight.current = p;
    setAnimating(true);
    await playEvents(host(mine), rec.steps[p].events, rec.states[p]);
    if (token.current !== mine) return false;
    inflight.current = null;
    setAnimating(false);
    show(p + 1);
    return true;
  };

  const focusStep = (p: number) => {
    if (p <= 0 || p > total) return;
    const step = rec.steps[p - 1];
    const combat = step.events.find(e => e.t === 'combat');
    const unit = combat ? rec.states[p - 1].units.find(u => u.id === combat.defender) : rec.states[p].units.find(u => u.id === step.actor);
    if (unit) ctl.focus(unit.pos);
  };
  const jump = (p: number) => { setPlaying(false); settle(); show(p); focusStep(Math.max(0, Math.min(total, p))); };
  const next = () => { setPlaying(false); settle(); void advance(token.current); };

  useEffect(() => {
    if (!playing) return;
    settle();
    const mine = token.current;
    void (async () => {
      if (posRef.current >= total) show(0);
      while (token.current === mine && posRef.current < total) {
        if (!(await advance(mine))) break;
        await sleep(260 / ctl.speed);
      }
      if (token.current === mine) setPlaying(false);
    })();
    return settle;
  }, [playing]);

  useEffect(() => {
    const up = snap.levelUp;
    if (!up) return;
    ctl.float(up.unit.pos, `▲ Lv ${up.event.level}`, 'exp');
    const timer = setTimeout(up.done, 900 / speed);
    return () => clearTimeout(timer);
  }, [ctl, snap.levelUp, speed]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [pos, filter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(e.target.tagName) && e.key === ' ') return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); jump(posRef.current - 1); }
      else if (e.key === ' ') { e.preventDefault(); setPlaying(p => !p); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const last = pos > 0 ? rec.steps[pos - 1] : null;
  const turn = last?.turn ?? 1, side = last?.side ?? 'player';
  const count = last ? line.count(pos - 1) : null;
  const note = notes.filter(n => n.turn === turn).at(-1) ?? null;
  const shown = items.filter(FILTERS.find(f => f[0] === filter)![2]);
  const field = data.kind === 'field';

  return (
    <div className="app-bg battle-shell">
      <header className="hud" aria-label="回放状态栏">
        <a className="btn btn-sm btn-dark" href={links.reports}><BackIcon />返回战报</a>
        <span className="rp-badge"><HistoryIcon />历史回放</span>
        <div className="flex flex-col">
          <span className="hud-k">{ACTIVITY_NAME[detail.summary.activity] ?? (field ? '野外战斗' : '竞技场')}{detail.public ? '' : ' · 仅自己可见'}</span>
          <span className="hud-v serif" style={{ fontSize: 18 }}>{data.name}</span>
        </div>
        <span className="hud-sep" aria-hidden="true" />
        <div className="flex flex-col">
          <span className="hud-k">结果</span>
          <span className="hud-v">
            {stars.won ? '胜利' : '战败'} · {line.turns} 回合
            {field && <> · <span style={{ color: '#E7C266' }}>{'★'.repeat(stars.stars)}</span><span style={{ color: '#8FA3B0' }}>{'★'.repeat(3 - stars.stars)}</span> {['零', '一', '二', '三'][stars.stars]}星</>}
          </span>
        </div>
        {field && stars.missed && (
          <div className="flex flex-col">
            <span className="hud-k">未达三星原因</span>
            <span className="hud-v" style={{ fontWeight: 500 }}>{stars.missed}</span>
          </div>
        )}
        <span className="ml-auto" style={{ fontSize: 13, color: '#DCE5EB' }}>{detail.compatible ? '回放只可浏览，不会影响任何结果' : `${detail.reason ?? '旧规则记录'}：只显示终局`}</span>
      </header>

      <main className="stage">
        <div className="mapcol">
          <BattleMap snap={snap} ctl={ctl} overlay={cell => !animating && <StepMarks rec={rec} pos={pos} view={snap.view} cell={cell} />} />
          <section className="panel rp-player" aria-label="回放控制">
            <div className="pctl">
              <button type="button" className="btn btn-sm" onClick={() => jump(pos - 1)} disabled={pos === 0}><PrevIcon />上一步</button>
              <button type="button" className="btn btn-primary" style={{ minWidth: 96 }} onClick={() => setPlaying(!playing)}>
                <PlayIcon paused={!playing} />{playing ? '暂停' : pos >= total ? '重播' : '播放'}
              </button>
              <button type="button" className="btn btn-sm" onClick={next} disabled={pos >= total}>下一步<NextIcon /></button>
              <span className="vsep" aria-hidden="true" />
              <span style={{ fontSize: 13, color: '#4E473D' }}>倍速</span>
              <div className="speed" role="group" aria-label="播放倍速">
                {SPEEDS.map(s => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
              </div>
              <span className="ml-auto" style={{ fontSize: 14 }}>
                <b>{pos === 0 ? '战斗开始' : `第 ${turn} 回合 · ${side === 'player' ? '己方' : '敌方'}阶段`}</b>{' '}
                <span style={{ color: '#6A6256' }}>· {count ? `第 ${count.k} / ${count.n} 步` : pos === 0 ? '第 0 步' : '阶段开始'} · {playing ? '播放中' : pos >= total ? '已结束' : '已暂停'}</span>
              </span>
            </div>
            <ReplayTrack rec={rec} items={items} line={line} starts={starts} pos={pos} onJump={jump} />
            <div className="flex flex-wrap gap-4" style={{ fontSize: 12, color: '#6A6256' }}>
              <span>色块左半为己方阶段、右半为敌方阶段</span>
              <span><b style={{ color: '#A84940' }}>✕</b> 击败</span><span><b style={{ color: '#536D49' }}>▲</b> 升级</span><span><b style={{ color: '#5C554A' }}>⚑</b> 撤退</span>
              <span>快捷键：← → 单步 · 空格 播放/暂停</span>
            </div>
          </section>
        </div>

        <aside className="side" aria-label="回放事件">
          <section className="panel" aria-labelledby="ev-h">
            <div className="ph"><h2 id="ev-h">事件列表</h2><span style={{ fontSize: 12, color: '#6A6256' }}>点击事件，地图跳到对应时刻</span></div>
            <div className="evf" role="group" aria-label="筛选事件">
              {FILTERS.map(([f, label, test]) => (
                <button key={f} type="button" className="btn btn-sm" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label} {items.filter(test).length}</button>
              ))}
            </div>
            <ol className="evl" ref={listRef}>
              {shown.map(item => {
                const [k, bg] = MARK[item.type === 'other' && item.entry.kind === 'e' ? 'other' : item.type];
                const c = line.count(item.step);
                return (
                  <li key={item.entry.id}>
                    <button type="button" aria-current={item.step === pos - 1} onClick={() => jump(item.step + 1)}>
                      <span className="k" style={{ background: item.type === 'other' && item.entry.kind === 'e' ? '#A84940' : bg }}>{item.type === 'other' && item.entry.kind === 'e' ? '◆' : k}</span>
                      <span>
                        <span className="t">第 {item.entry.turn} 回合 · {item.entry.side === 'player' ? '己方' : '敌方'}{c ? ` · 第 ${c.k} 步` : ''}</span><br />
                        {item.entry.text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
          <section className="panel" aria-labelledby="ai-h">
            <div className="ph"><h2 id="ai-h">Agent 当时上报的意图</h2><span className="tag tag-brass">计划描述</span></div>
            <div className="intent-k">第 {turn} 回合</div>
            {note ? <IntentQuote text={note.text} meta={[`${realDateTime(note.at)} 上报`]} /> : <div className="intent-empty">这一回合 Agent 没有上报意图（AGENT_PHASE_NOTE）。</div>}
          </section>
        </aside>
      </main>
    </div>
  );
}
