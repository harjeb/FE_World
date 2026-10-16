// 回放 pieces: what the last step did on the board, and the turn timeline under it.
import type { CSSProperties, MouseEvent } from 'react';
import type { BattleState } from '@common/engine/index.ts';
import { Cursor, MapTag } from '../battle/MapLayers.tsx';
import type { Recording } from './recording.ts';
import type { ItemType, ReplayItem, Timeline } from './replayModel.ts';
import { Trail } from './WatchParts.tsx';

export const MARK: Record<ItemType, [string, string]> = {
  kill: ['✕', '#A84940'], retreat: ['⚑', '#5C554A'], level: ['▲', '#536D49'], end: ['★', '#A88445'], other: ['●', '#34556B'],
};

// What the last step did, drawn on the board while paused: its trail, the actor, and result tags.
export function StepMarks({ rec, pos, view, cell }: { rec: Recording; pos: number; view: BattleState; cell: number }) {
  if (pos === 0) return null;
  const step = rec.steps[pos - 1], before = rec.states[pos - 1];
  const move = step.events.find(e => e.t === 'move');
  const combat = step.events.find(e => e.t === 'combat');
  const levelUp = step.events.find(e => e.t === 'levelUp');
  const actor = step.actor ? view.units.find(u => u.id === step.actor && u.alive) : undefined;
  let result = null;
  if (combat) {
    const target = before.units.find(u => u.id === combat.defender)!;
    const strikes = combat.strikes.filter(s => s.target === combat.defender);
    const dealt = strikes.reduce((sum, s) => sum + s.damage, 0);
    const killed = step.events.some(e => e.t === 'defeated' && e.unit === combat.defender);
    const crit = strikes.some(s => s.crit);
    const text = killed ? `✕ ${crit ? '必杀 · ' : ''}击败` : dealt > 0 ? `−${dealt} · ${crit ? '必杀' : '命中'}` : '未命中';
    result = <MapTag at={target.pos} cell={cell} view={view} className={killed ? 'mt-red' : 'mt-dark'} prefer="below">{text}</MapTag>;
  }
  const up = levelUp && view.units.find(u => u.id === levelUp.unit);
  return (
    <>
      {move && <Trail path={move.path} cell={cell} />}
      {actor && <Cursor at={actor.pos} cell={cell} />}
      {result}
      {up && <MapTag at={up.pos} cell={cell} view={view} className="mt-green">▲ {up.name} 升至 Lv {levelUp.level}</MapTag>}
    </>
  );
}

// Turn segments (player half, enemy half) filled up to the play head, with markers for kills,
// level-ups and units lost. Clicking jumps to the nearest step; the numbers jump to a turn.
export function ReplayTrack({ rec, items, line, starts, pos, onJump }: {
  rec: Recording; items: ReplayItem[]; line: Timeline; starts: Map<number, number>; pos: number; onJump: (pos: number) => void;
}) {
  const head = line.head(pos);
  const turn = pos > 0 ? rec.steps[pos - 1].turn : 1;
  const total = rec.steps.length;
  const marks = items.filter(i => i.type !== 'other' && i.type !== 'end')
    .filter((i, n, all) => all.findIndex(j => j.step === i.step && j.type === i.type) === n);
  const onTrack = (e: MouseEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    let best = 0;
    rec.steps.forEach((_, i) => { if (Math.abs(line.at(i) - x) < Math.abs(line.at(best) - x)) best = i; });
    onJump(best + 1);
  };
  return (
    <div className="track" role="slider" tabIndex={0} aria-label="回合定位" aria-valuemin={0} aria-valuemax={total} aria-valuenow={pos}
      aria-valuetext={`第 ${turn} 回合，共 ${line.turns} 回合`} onClick={onTrack}>
      {marks.map(m => (
        <span key={`${m.step}${m.type}`} className={`tmark mk-${m.type}`} style={{ left: `${line.at(m.step) * 100}%` }} title={`第 ${m.entry.turn} 回合 ${m.entry.text}`}>{MARK[m.type][0]}</span>
      ))}
      <div className="segs" style={{ gridTemplateColumns: `repeat(${line.turns}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length: line.turns }, (_, t) => {
          const fill = (from: number) => `${Math.max(0, Math.min(1, (head * line.turns - t - from) / 0.5)) * 100}%`;
          return (
            <span key={t} className="seg-t">
              <i style={{ '--fill': fill(0) } as CSSProperties} />
              <i className="foe" style={{ '--fill': fill(0.5) } as CSSProperties} />
            </span>
          );
        })}
      </div>
      <span className="head" style={{ left: `${head * 100}%` }} aria-hidden="true" />
      <div className="tlabels" style={{ gridTemplateColumns: `repeat(${line.turns}, minmax(0, 1fr))` }}>
        {Array.from({ length: line.turns }, (_, t) => (
          <button key={t} type="button" onClick={e => { e.stopPropagation(); onJump(starts.get(t + 1) ?? 0); }} aria-label={`跳到第 ${t + 1} 回合`}>{t + 1}</button>
        ))}
      </div>
    </div>
  );
}
