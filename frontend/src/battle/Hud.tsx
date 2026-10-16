import { living } from '@common/engine/index.ts';
import type { BattleController, Snapshot } from './controller.ts';

// Top bar (docs/08): map, turn, phase, victory condition and a third block (three-star condition or
// arena scoring); 结束阶段 sits far away from 确认攻击 and always says how many units have not acted.
export function Hud({ snap, ctl }: { snap: Snapshot; ctl: BattleController }) {
  const { view, state, mode } = snap;
  const { meta, exit } = ctl.session;
  const waiting = living(state, 'player').filter(u => !u.acted).length;
  const enemyPhase = view.phase === 'enemy';
  const canEnd = state.phase === 'player' && !state.result && mode.kind !== 'busy';
  return (
    <header className="hud" aria-label="战斗状态栏">
      {exit && (
        <a className="btn btn-sm btn-dark" href={exit.href} title={ctl.session.surrender ? '战斗会保留，可随时回来继续' : undefined}>
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
          {exit.label}
        </a>
      )}
      <div className="flex flex-col">
        <span className="hud-k">{meta.region}</span>
        <span className="hud-v serif" style={{ fontSize: 18 }}>{view.name}</span>
      </div>
      <span className="hud-sep" aria-hidden="true" />
      <div className="flex flex-col">
        <span className="hud-k">回合</span>
        <span className="hud-v num">第 {view.turn} / {view.turnLimit} 回合</span>
      </div>
      <span className={`phase-pill${enemyPhase ? ' enemy' : ''}`} aria-live="polite">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          {enemyPhase
            ? <path d="M6 1l5 5-5 5-5-5z" fill="#A84940" />
            : <circle cx="6" cy="6" r="5" fill="#34556B" />}
        </svg>
        {enemyPhase ? (view.kind === 'arena' ? '防守方阶段' : '敌方阶段') : (view.kind === 'arena' ? '进攻方阶段' : '己方阶段')}
      </span>
      <span className="hud-sep" aria-hidden="true" />
      <div className="flex flex-col">
        <span className="hud-k">胜利条件</span>
        <span className="hud-v">{meta.goal}</span>
      </div>
      <div className="flex flex-col">
        <span className="hud-k">{meta.extraLabel}</span>
        <span className="hud-v" style={{ fontWeight: 500 }}>{meta.extraValue}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button type="button" className="btn btn-dark" onClick={() => ctl.requestEndPhase()} disabled={!canEnd}>
          结束阶段
          {canEnd && (
            <span className="tag" style={{ background: '#F5EEDF', color: '#22394A', borderColor: '#F5EEDF' }}>
              {waiting > 0 ? `还有 ${waiting} 人未行动` : '全员已行动'}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
