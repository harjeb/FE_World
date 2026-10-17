import { useState } from 'react';
import { canFinishGather } from '@common/engine/index.ts';
import { RetreatIcon, ChevronIcon, BossFlag } from '../ui/icons.tsx';
import type { BattleController, Snapshot } from './controller.ts';
import type { LogEntry } from './log.ts';
import type { ScenePolicy } from './settings.ts';

const SCENES: [ScenePolicy, string][] = [['all', '全部播放'], ['boss', '仅主将战'], ['off', '关闭']];

// Legend row under the map: 撤退 (kept apart from the confirm button), what each overlay means,
// and the display toggles.
export function Legend({ snap, ctl }: { snap: Snapshot; ctl: BattleController }) {
  const { settings, state, mode } = snap;
  const canRetreat = state.phase === 'player' && !state.result && mode.kind !== 'busy';
  return (
    <div className="legend">
      <button type="button" className="btn btn-sm btn-danger" onClick={() => ctl.requestRetreat()} disabled={!canRetreat}>
        <RetreatIcon />{ctl.session.surrender ? '投降…' : canFinishGather(state) ? '带回物资并结束…' : '撤退…'}
      </button>
      <span style={{ width: 1, height: 24, background: '#D5CAB4' }} aria-hidden="true" />
      <span className="lg"><span className="sw"><i className="mv" /></span>可移动</span>
      <span className="lg"><span className="sw"><i className="atk" /></span>攻击范围</span>
      <span className="lg"><span className="sw"><i className="healz" /></span>治疗范围</span>
      <span className="lg"><span className="sw"><i className="tz bt br bb bl" /></span>敌方威胁区</span>
      <span className="lg">
        <svg width="26" height="14" viewBox="0 0 26 14" aria-hidden="true">
          <path d="M2 7h16" stroke="#2B2421" strokeWidth="7" strokeLinecap="round" opacity=".5" />
          <path d="M2 7h16" stroke="#F0CF78" strokeWidth="4" strokeLinecap="round" />
          <path d="M16 2l8 5-8 5z" fill="#F0CF78" stroke="#2B2421" strokeWidth="1.2" />
        </svg>
        拟定路线
      </span>
      <span className="lg"><span className="acted-mark" style={{ position: 'static', width: 16, height: 16, boxShadow: 'none' }}>✓</span>已行动</span>
      <span className="lg"><span className="relative inline-block" style={{ width: 14, height: 18 }}><BossFlag size={14} /></span>敌方主将</span>
      {state.goal.kind === 'seize' && <span className="lg"><span className="throne-sw" aria-hidden="true" />王座：我方主将压制即胜</span>}
      {(state.goal.kind === 'escape' || state.goal.kind === 'gather' || state.goal.kind === 'escort') && <span className="lg"><span className="throne-sw" aria-hidden="true" />撤离点：站上去即可撤离</span>}
      {state.goal.kind === 'gather' && <span className="lg">物资箱：拾取并带出才算带回</span>}
      {state.goal.kind === 'escort' && <span className="lg">护卫对象：会自动走向撤离点，阵亡即败</span>}
      <span className="lg" style={{ color: '#6A6256' }}>底座：<b style={{ color: '#34556B' }}>● 己方</b> · <b style={{ color: '#A84940' }}>◆ 敌方</b></span>
      <span className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" className="toggle" aria-pressed={settings.threat} onClick={() => ctl.setSetting('threat', !settings.threat)}>
          <span className="knob" aria-hidden="true" />敌方威胁区 <span className="kbd">T</span>
        </button>
        <button type="button" className="toggle" aria-pressed={settings.grid} onClick={() => ctl.setSetting('grid', !settings.grid)}>
          <span className="knob" aria-hidden="true" />网格 <span className="kbd">G</span>
        </button>
        <span className="flex items-center gap-2" style={{ fontSize: 13, color: '#4E473D' }}>
          交战演出
          <span className="seg" role="group" aria-label="交战演出">
            {SCENES.map(([value, label]) => (
              <button key={value} type="button" aria-pressed={settings.scenes === value} onClick={() => ctl.setSetting('scenes', value)}>{label}</button>
            ))}
          </span>
        </span>
      </span>
    </div>
  );
}

export function BattleLog({ entries }: { entries: LogEntry[] }) {
  const [open, setOpen] = useState(true);
  const turns = entries.length > 0 ? [entries[entries.length - 1].turn, entries[0].turn] : null;
  const label = (e: LogEntry) => `第 ${e.turn} 回合 · ${e.side === 'player' ? '己方' : '敌方'}`;
  return (
    <section className="panel" aria-labelledby="log-h">
      <div className="ph" style={{ minHeight: 38, padding: '4px 14px' }}>
        <h2 id="log-h">
          战况记录
          {turns && <span className="tag tag-grey">{turns[0] === turns[1] ? `第 ${turns[0]} 回合` : `第 ${turns[0]} – ${turns[1]} 回合`}</span>}
        </h2>
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? '收起' : '展开'}<ChevronIcon up={open} />
        </button>
      </div>
      {open && (
        <ol className="log-list" style={{ maxHeight: 118, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' }} aria-live="polite">
          {entries.length === 0 && <li><span className="lt">第 1 回合 · 己方</span><span className="muted">战斗开始。选中一名己方单位开始行动。</span></li>}
          {entries.map(e => (
            <li key={e.id}>
              <span className="lt">{label(e)}</span>
              <span><i className={`mk ${e.kind}`}>{e.kind === 'a' ? '●' : e.kind === 'e' ? '◆' : '▲'}</i>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
