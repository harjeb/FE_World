import { useEffect, useRef } from 'react';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import { canFinishGather, classOf, living } from '@common/engine/index.ts';
import type { BattleState } from '@common/engine/index.ts';
import type { Dialog, LevelShow } from './controller.ts';
import type { BattleResultView } from './session.ts';
import { Portrait } from './UnitCard.tsx';

// Focus the primary button when a dialog opens so Enter / Space act on it.
function useAutofocus() {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return ref;
}

export function LevelUpDialog({ show }: { show: LevelShow }) {
  const { unit, event } = show;
  const ok = useAutofocus();
  const gained = Object.keys(event.gains).length;
  return (
    <div className="overlay light" role="dialog" aria-modal="true" aria-labelledby="lv-title">
      <section className="modal">
        <header>
          <Portrait unit={unit} />
          <div>
            <h2 id="lv-title" className="serif" style={{ fontSize: 20, fontWeight: 700 }}>{unit.name} 升级</h2>
            <div className="muted">{classOf(unit).name} · Lv {event.level - 1} → <b style={{ color: '#302D28' }}>Lv {event.level}</b></div>
          </div>
        </header>
        <div className="body">
          <div className="lv-grid">
            {STAT_KEYS.map(key => {
              const gain = event.gains[key] ?? 0;
              return (
                <div key={key} className={gain > 0 ? 'up' : ''}>
                  <span>{STAT_NAMES[key]}</span>
                  <span><b>{(unit.stats[key] ?? 0) + gain}</b>{gain > 0 && <em>+{gain}</em>}</span>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 13, color: '#4E473D' }}>
            {gained > 0 ? `${gained} 项属性提升。` : '这一级没有属性提升。'}
            {event.rerolls > 0 && ` 空级保护已重掷 ${event.rerolls} 次。`}
            <span className="muted"> 每项按成长率独立判定。</span>
          </p>
        </div>
        <footer><button ref={ok} type="button" className="btn btn-primary" onClick={show.done}>继续 <span className="kbd">ENTER</span></button></footer>
      </section>
    </div>
  );
}

export function ConfirmDialog({ kind, state, surrender, onConfirm, onCancel }: { kind: Exclude<Dialog, null>; state: BattleState; surrender: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ok = useAutofocus();
  const waiting = living(state, 'player').filter(u => !u.acted);
  const endPhase = kind === 'endPhase';
  const gathered = canFinishGather(state);
  const title = endPhase ? '结束己方阶段？' : surrender ? '投降？' : gathered ? '带回物资并结束任务？' : '全军撤退？';
  return (
    <div className="overlay light" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <section className="modal">
        <header><h2 id="dlg-title" style={{ fontSize: 17, fontWeight: 700 }}>{title}</h2></header>
        <div className="body" style={{ fontSize: 14 }}>
          {endPhase && <p>还有 {waiting.length} 人未行动：{waiting.map(u => u.name).join('、')}。结束后他们原地待机，随后进入对方阶段。</p>}
          {!endPhase && surrender && <p>投降后本场进攻按落败计（0 分），不能再次进攻这名对手。</p>}
          {!endPhase && !surrender && <p>{gathered ? '已带回至少1箱，任务按成功结算。仍在战场的物资不会带回，已发生的伤亡和消耗保留。' : '撤退后本场战斗按失败结算，无法继续。已经获得的经验保留。'}</p>}
        </div>
        <footer>
          <button type="button" className="btn" onClick={onCancel}>{endPhase ? '继续行动' : '取消'} <span className="kbd">ESC</span></button>
          <button ref={ok} type="button" className={`btn ${endPhase ? 'btn-primary' : 'btn-danger'}`} onClick={onConfirm}>
            {endPhase ? '结束阶段' : surrender ? '确认投降' : gathered ? '带回物资并结束' : '确认撤退'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ResultDialog({ state, view }: { state: BattleState; view: BattleResultView }) {
  const ok = useAutofocus();
  return (
    <div className="overlay light" role="dialog" aria-modal="true" aria-labelledby="res-title">
      <section className="modal">
        <header>
          <h2 id="res-title" className="serif" style={{ fontSize: 24, fontWeight: 700, color: view.won ? '#22394A' : '#93392F' }}>{view.title}</h2>
          <span className={`tag ${view.won ? 'tag-blue' : 'tag-red'}`}>{state.result?.reason}</span>
        </header>
        <div className="body" style={{ fontSize: 14 }}>
          {view.lines.map(line => <p key={line}>{line}</p>)}
        </div>
        <footer><button ref={ok} type="button" className="btn btn-primary" onClick={view.action.run}>{view.action.label}</button></footer>
      </section>
    </div>
  );
}

// 「第 N 回合结束。被击败：…」 shared by every result screen.
export function fallenLine(state: BattleState): string {
  const fallen = state.units.filter(u => u.side === 'player' && !u.alive);
  return `第 ${state.turn} 回合结束。${fallen.length > 0 ? `我方被击败：${fallen.map(u => u.name).join('、')}。` : '我方无人被击败。'}`;
}
