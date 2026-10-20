import type { ServerUnit } from '../api/session.ts';
import { UnitFace } from '../pages/SystemParts.tsx';

export function DeploymentOrder({ units, busy, onChange }: {
  units: ServerUnit[]; busy: boolean; onChange: (ids: string[]) => void;
}) {
  const move = (index: number, delta: number) => {
    const ids = units.map(unit => unit.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    onChange(ids);
  };
  return <section className="panel" aria-label="部署顺序" style={{ padding: 16, minWidth: 0 }}>
    <h2>部署顺序</h2>
    <ol style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
      {units.map((unit, index) => <li key={unit.id} data-unit-id={unit.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <UnitFace unit={unit} order={index + 1} />
        <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{unit.name}{index === 0 ? ' · 主将' : ''}</span>
        <button className="btn btn-ghost" type="button" style={{ minWidth: 44, minHeight: 44, flexShrink: 0 }} aria-label={`上移${unit.name}（第${index + 1}位）`} disabled={busy || index === 0} onClick={() => move(index, -1)}>↑</button>
        <button className="btn btn-ghost" type="button" style={{ minWidth: 44, minHeight: 44, flexShrink: 0 }} aria-label={`下移${unit.name}（第${index + 1}位）`} disabled={busy || index === units.length - 1} onClick={() => move(index, 1)}>↓</button>
      </li>)}
    </ol>
  </section>;
}
