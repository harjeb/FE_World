import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { MY_LEGION, MY_POINTS, OPPONENTS, SNAPSHOT_LABEL } from '@common/arena/demo.ts';
import type { ArenaMap } from '@common/arena/maps.ts';
import type { Defense } from '@common/arena/rules.ts';
import type { Point } from '@common/engine/index.ts';
import { CRESTS, MAPS } from '../assets.ts';
import { BossFlag } from '../ui/icons.tsx';

const LETTER_CRESTS: Record<string, [string, string]> = { maple: ['赤', '#B0563A'], white: ['白', '#6E7C8A'] };

export function Crest({ id, size = 48 }: { id: string; size?: 40 | 48 }) {
  if (id === 'mine') return <img className="px" src={CRESTS.raven} width={size} height={size} alt="" />;
  if (CRESTS[id]) return <img className="px" src={CRESTS[id]} width={size} height={size} alt="" />;
  const [letter, color] = LETTER_CRESTS[id] ?? ['?', '#5E666C'];
  return <span className="crest" style={{ background: color, width: size, height: size }} aria-hidden="true">{letter}</span>;
}

export const attackIndex = (id: string) => OPPONENTS.findIndex(o => o.id === id) + 1;

export function SnapshotTag({ text = `双方使用${SNAPSHOT_LABEL}` }: { text?: string }) {
  return (
    <span className="snap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
      {text}
    </span>
  );
}

// Attacker on the left (us), defender on the right.
export function Versus({ defense }: { defense: Defense }) {
  return (
    <div className="versus" aria-label="对阵">
      <div className="vs-side me">
        <Crest id="mine" />
        <div><div className="vs-name">{MY_LEGION} <span className="tag tag-blue">● 进攻方 · 我方</span></div><div className="vs-sub num">积分 {MY_POINTS.toLocaleString()}</div></div>
      </div>
      <div className="vs-mid">
        <div style={{ fontSize: 13, color: '#4E473D' }}>第 6 月竞技场 · 进攻 <b>{attackIndex(defense.id)}</b> / {OPPONENTS.length}</div>
        <div style={{ marginTop: 4 }}><SnapshotTag /></div>
      </div>
      <div className="vs-side foe">
        <Crest id={defense.id} />
        <div><div className="vs-name"><span className="tag tag-red">◆ 防守方</span> {defense.legion}</div><div className="vs-sub num">积分 {defense.points.toLocaleString()} · {defense.record}</div></div>
      </div>
    </div>
  );
}

const FLOW = ['查看对手', '禁用角色', '揭晓阵容', '我方部署', '开始战斗'];

export function Flow({ current }: { current: number }) {
  return (
    <ol className="flow" aria-label="对局流程">
      {FLOW.map((label, i) => (
        <li key={label} className="flex items-center gap-1">
          <span className={`flow-step${i < current ? ' done' : i === current ? ' cur' : ''}`} aria-current={i === current ? 'step' : undefined}>
            <b>{i < current ? '✓' : i + 1}</b>{label}
          </span>
          {i < FLOW.length - 1 && <span className="flow-sep" aria-hidden="true">›</span>}
        </li>
      ))}
    </ol>
  );
}

export function RulesGrid({ map }: { map: ArenaMap }) {
  return (
    <div className="rules">
      <div><span>出战</span><b>{map.deploy} 人</b></div>
      <div><span>禁用</span><b>各 {map.bans} 人</b></div>
      <div><span>回合上限</span><b>{map.turnLimit}</b></div>
      <div><span>胜利条件</span><b style={{ fontSize: 13 }}>{map.goalText}</b></div>
    </div>
  );
}

// Largest whole-number tile size whose map fits the container's width (pixel art is never scaled
// by fractions); on very narrow screens the smallest size is used and the container scrolls.
export function useFitCell(columns: number, sizes: (32 | 48)[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(sizes[0]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => setCell(sizes.find(size => size * columns <= el.clientWidth - 22) ?? sizes[sizes.length - 1]);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
    // sizes is a literal at each call site
  }, [columns]);
  return [ref, cell] as const;
}

export interface PreviewUnit {
  key: string;
  sprite: string;
  side: 'player' | 'enemy';
  pos: Point;
  boss?: boolean;
  lead?: boolean;
  selected?: boolean;
}

interface PreviewProps {
  map: ArenaMap;
  cell: 32 | 48;
  mine?: Point[];
  foe?: Point[];
  units?: PreviewUnit[];
  cursor?: Point | null;
  label: string;
  onCell?: (at: Point) => void;
  onHover?: (at: Point | null) => void;
  children?: ReactNode;
}

// Static map with spawn zones and units, used before the battle starts (ban and deploy steps).
export function MapPreview({ map, cell, mine = [], foe = [], units = [], cursor, label, onCell, onHover, children }: PreviewProps) {
  const width = map.rows[0].length * cell, height = map.rows.length * cell;
  const at = (e: MouseEvent<HTMLDivElement>): Point | null => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - box.left) / cell), y = Math.floor((e.clientY - box.top) / cell);
    return x >= 0 && y >= 0 && x < map.rows[0].length && y < map.rows.length ? [x, y] : null;
  };
  return (
    <div className="mapbox" style={{ width, height, '--cell': `${cell}px`, cursor: onCell ? 'pointer' : undefined } as CSSProperties}
      role="img" aria-label={label}
      onClick={onCell ? e => { const p = at(e); if (p) onCell(p); } : undefined}
      onMouseMove={onHover ? e => onHover(at(e)) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}>
      <img className="px" src={MAPS[map.name]} width={width} height={height} alt="" draggable={false} />
      {mine.map(([x, y]) => <span key={`m${x},${y}`} className="zc me" style={{ left: x * cell, top: y * cell }} />)}
      {foe.map(([x, y]) => <span key={`f${x},${y}`} className="zc foe" style={{ left: x * cell, top: y * cell }} />)}
      {units.map(u => (
        <div key={u.key} className={`unit ${u.side === 'player' ? 'ally' : 'enemy'}${u.selected ? ' active' : ''}`} style={{ left: u.pos[0] * cell, top: u.pos[1] * cell }}>
          <span className="base" />
          <img className="px spr" src={u.sprite} width={cell} height={cell} alt="" />
          {u.boss && <BossFlag />}
          {u.lead && <span className="lead" aria-hidden="true">★</span>}
        </div>
      ))}
      {cursor && (
        <div className="cursor" style={{ left: cursor[0] * cell, top: cursor[1] * cell }} aria-hidden="true"><i /><i /><i /><i /></div>
      )}
      {children}
    </div>
  );
}
