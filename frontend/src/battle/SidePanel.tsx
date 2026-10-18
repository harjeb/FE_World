import { classOf, living, unitAt, unitById } from '@common/engine/index.ts';
import type { BattleState, UnitState } from '@common/engine/index.ts';
import { ActionPanel } from './ActionPanel.tsx';
import type { BattleController, Snapshot } from './controller.ts';
import { CommandConfirm, CommandPreview, ConfirmPanel, ForecastPanel, HealPreview } from './Forecast.tsx';
import { isCommand } from './commands.ts';
import { stepIndex } from './selection.ts';
import { HpLine, Portrait, Steps, UnitCard } from './UnitCard.tsx';

function RosterList({ title, units, onPick, state }: { title: string; units: UnitState[]; onPick: (id: string) => void; state: BattleState }) {
  return (
    <section className="panel" aria-label={title}>
      <div className="ph" style={{ minHeight: 38 }}><h2>{title}</h2><span className="tag tag-grey">{units.length} 人</span></div>
      <ul className="roster">
        {units.map(u => {
          const marks = [u.statuses?.sleep && '睡眠', u.statuses?.silence && '沉默', u.statuses?.berserk && '混乱', u.statuses?.regen && '再生', u.petrified && '石化', u.npc && '护送对象'].filter(Boolean).join('·');
          const base = u.side !== 'player' ? (u.boss ? '主将' : '') : u.acted && state.phase === 'player' ? '已行动' : '未行动';
          const status = [base, marks].filter(Boolean).join(' · ');
          return (
            <li key={u.id}>
              <button type="button" className="who" onClick={() => onPick(u.id)}>
                <Portrait unit={u} size={32} flip={u.side === 'enemy'} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <b>{u.name}</b>
                    <span style={{ fontSize: 12, color: '#6A6256' }}>{classOf(u).name} · Lv {u.level}{status && ` · ${status}`}</span>
                  </span>
                  <HpLine unit={u} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Right column: what is selected and the next decision. With nothing selected it lists both armies,
// which is also the keyboard-friendly way to pick a unit.
export function SidePanel({ snap, ctl }: { snap: Snapshot; ctl: BattleController }) {
  const { view, mode, hover } = snap;
  const state = view;
  const ownFlow = mode.kind === 'move' || mode.kind === 'action' || mode.kind === 'attack' || mode.kind === 'heal' || mode.kind === 'item' || isCommand(mode);
  const focusId = 'unit' in mode ? mode.unit : hover ? unitAt(state, hover)?.id : undefined;
  const focus = focusId ? unitById(state, focusId) : null;
  const weapon = mode.kind === 'attack' || mode.kind === 'heal' ? mode.weapon : null;

  return (
    <>
      {focus && focus.alive && <UnitCard state={state} unit={focus} weapon={weapon} compact={ownFlow && mode.kind !== 'move'} />}
      {ownFlow && <Steps index={stepIndex(mode)} />}
      {mode.kind === 'move' && (
        <p className="panel" style={{ padding: '10px 14px', fontSize: 13 }}>
          点蓝色格预览落点（显示路线），或直接点红色范围内的敌人。<span className="muted">Esc 取消选择。</span>
        </p>
      )}
      {(mode.kind === 'action' || mode.kind === 'attack' || mode.kind === 'heal' || mode.kind === 'item' || isCommand(mode)) && (
        <ActionPanel state={state} mode={mode} ctl={ctl} />
      )}
      {isCommand(mode) && <CommandPreview state={state} mode={mode} />}
      {isCommand(mode) && <CommandConfirm state={state} mode={mode} onConfirm={() => ctl.confirm()} onCancel={() => ctl.cancel()} />}
      {mode.kind === 'attack' && mode.target && (
        <ForecastPanel state={state} unitId={mode.unit} to={mode.to} weapon={mode.weapon} targetId={mode.target} />
      )}
      {mode.kind === 'heal' && mode.target && (
        <HealPreview state={state} unitId={mode.unit} targetId={mode.target} weapon={mode.weapon} to={mode.to} />
      )}
      {(mode.kind === 'attack' || mode.kind === 'heal') && mode.target && (
        <ConfirmPanel state={state} to={mode.to} kind={mode.kind} onConfirm={() => ctl.confirm()} onCancel={() => ctl.cancel()} />
      )}
      {snap.notice && <p role="alert" className="panel" style={{ padding: '10px 14px', color: '#93392F' }}>{snap.notice}</p>}
      {!ownFlow && (
        <>
          <RosterList title="我方单位" units={living(state, 'player')} onPick={id => ctl.select(id)} state={state} />
          <RosterList title="敌方单位" units={living(state, 'enemy')} onPick={id => ctl.select(id)} state={state} />
        </>
      )}
    </>
  );
}
