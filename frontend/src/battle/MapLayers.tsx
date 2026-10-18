// Everything drawn on the board in tile coordinates. Overlays never hide units: they sit under the
// sprites, use texture as well as color, and the threat zone adds a dashed outline (docs/08).
import type { ReactNode } from 'react';
import { TERRAINS } from '@common/maps/map.ts';
import type { BattleState, Point, UnitState } from '@common/engine/index.ts';
import { spriteFor } from '../assets.ts';
import { BossFlag } from '../ui/icons.tsx';
import type { FloatText } from './controller.ts';

export function TileColors({ state, cell }: { state: BattleState; cell: number }) {
  return (
    <div className="tilegrid" style={{ gridTemplateColumns: `repeat(${state.map.width}, ${cell}px)` }} aria-hidden="true">
      {state.map.tiles.flat().map((tile, i) => <div key={i} style={{ width: cell, height: cell, background: TERRAINS[tile].color }} />)}
    </div>
  );
}

export function CellLayer({ cells, width, cell, className }: { cells: Set<number>; width: number; cell: number; className: string }) {
  return (
    <>
      {[...cells].map(key => (
        <div key={key} className={`ov ${className}`} style={{ left: (key % width) * cell, top: Math.floor(key / width) * cell }} />
      ))}
    </>
  );
}

export function ThreatLayer({ cells, width, cell }: { cells: Set<number>; width: number; cell: number }) {
  return (
    <>
      {[...cells].map(key => {
        const x = key % width, y = Math.floor(key / width);
        const has = (dx: number, dy: number) => {
          const nx = x + dx;
          return nx >= 0 && nx < width && cells.has((y + dy) * width + nx);
        };
        const edges = `${has(0, -1) ? '' : ' bt'}${has(1, 0) ? '' : ' br'}${has(0, 1) ? '' : ' bb'}${has(-1, 0) ? '' : ' bl'}`;
        return <div key={key} className={`ov tz${edges}`} style={{ left: x * cell, top: y * cell }} />;
      })}
    </>
  );
}

export function PathArrow({ path, cell, width, height }: { path: Point[]; cell: number; width: number; height: number }) {
  if (path.length < 2) return null;
  const pts = path.map(([x, y]) => [x * cell + cell / 2, y * cell + cell / 2]);
  const [ex, ey] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  const angle = Math.atan2(ey - py, ex - px) * 180 / Math.PI;
  const line = pts.map(p => p.join(',')).join(' ');
  const head = cell * 0.27;
  return (
    <svg width={width} height={height} className="absolute left-0 top-0 pointer-events-none" aria-hidden="true">
      <polyline points={line} fill="none" stroke="#2B2421" strokeWidth={cell * 0.23} strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <polyline points={line} fill="none" stroke="#F0CF78" strokeWidth={cell * 0.125} strokeLinecap="round" strokeLinejoin="round" />
      <polygon points={`${-head},${-head} ${head},0 ${-head},${head}`} transform={`translate(${ex},${ey}) rotate(${angle})`}
        fill="#F0CF78" stroke="#2B2421" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

interface UnitsProps {
  view: BattleState;
  cell: number;
  selected: string | null;
  ghostElsewhere: boolean;
  fading: ReadonlySet<string>;
}

export function ObjectLayer({ state, cell }: { state: BattleState; cell: number }) {
  const glyph: Record<string, string> = { door: '门', chest: '宝', village: '村', wall: '墙', switch: '机', ballista: '弩' };
  return (
    <>
      {(state.embers ?? []).map(ember => <span key={ember.pos.join(',')} className="map-object"
        title="余烬：敌方行动结束损失 3 HP，最低剩余 1 HP" aria-label="余烬"
        style={{ left: ember.pos[0] * cell, top: ember.pos[1] * cell, fontSize: Math.max(9, cell * 0.42), background: 'repeating-linear-gradient(45deg, #8C3C1ACC 0 4px, #D99042CC 4px 8px)' }}>烬</span>)}
      {(state.objects ?? []).map(object => {
        const done = object.state === 'open' || object.state === 'opened' || object.state === 'visited' || object.state === 'destroyed' || object.state === 'triggered';
        return (
          <span key={object.id} className={`map-object ${object.kind}${done ? ' done' : ''}`}
            title={`${object.label ?? object.kind}${object.hp !== undefined ? ` ${object.hp}/${object.maxHp ?? object.hp}` : ''}`}
            aria-label={object.label ?? object.kind}
            style={{ left: object.pos[0] * cell, top: object.pos[1] * cell, fontSize: Math.max(9, cell * 0.42) }}>
            {glyph[object.kind] ?? '?'}
          </span>
        );
      })}
    </>
  );
}

export function UnitLayer({ view, cell, selected, ghostElsewhere, fading }: UnitsProps) {
  return (
    <>
      {view.units.filter(u => u.alive || fading.has(u.id)).map(unit => {
        const ally = unit.side === 'player';
        const done = ally && unit.acted && view.phase === 'player';
        const marks = [unit.statuses?.sleep && '睡', unit.statuses?.silence && '默', unit.statuses?.berserk && '乱', unit.petrified && '石'].filter(Boolean).join('');
        const classes = ['unit', ally ? 'ally' : 'enemy'];
        if (done) classes.push('done');
        if (unit.id === selected) classes.push(ghostElsewhere ? 'origin' : 'active');
        if (fading.has(unit.id)) classes.push('fading');
        return (
          <div key={unit.id} className={classes.join(' ')}
            style={{ left: unit.pos[0] * cell, top: unit.pos[1] * cell, transition: 'left 70ms linear, top 70ms linear, opacity .4s' }}>
            <span className="base" />
            <img className="px spr" src={spriteFor(unit)} width={cell} height={cell} alt="" />
            <span className="hp"><i style={{ width: `${(unit.hp / unit.stats.hp) * 100}%` }} /></span>
            {done && <span className="acted-mark" aria-hidden="true">✓</span>}
            {marks && <span className="status-mark" aria-hidden="true">{marks}</span>}
            {unit.boss && <BossFlag />}
          </div>
        );
      })}
    </>
  );
}

export function Ghost({ unit, at, cell }: { unit: UnitState; at: Point; cell: number }) {
  return (
    <div className="ghost" style={{ left: at[0] * cell, top: at[1] * cell }}>
      <img className="px" src={spriteFor(unit)} width={cell} height={cell} alt="" />
    </div>
  );
}

export function Cursor({ at, cell, kind = '' }: { at: Point; cell: number; kind?: string }) {
  return (
    <div className={`cursor ${kind}`} style={{ left: at[0] * cell, top: at[1] * cell }} aria-hidden="true">
      <i /><i /><i /><i />
    </div>
  );
}

// Labels sit above or below their cell, whichever side has no unit, so they never hide a sprite.
export function MapTag({ at, cell, className, children, view, prefer = 'above' }: { at: Point; cell: number; className: string; children: ReactNode; view: BattleState; prefer?: 'above' | 'below' }) {
  const occupied = (y: number) => view.units.some(u => u.alive && u.pos[0] === at[0] && u.pos[1] === y);
  const other = prefer === 'above' ? 'below' : 'above';
  const blocked = (side: 'above' | 'below') => occupied(side === 'above' ? at[1] - 1 : at[1] + 1) || (side === 'above' ? at[1] === 0 : at[1] === view.map.height - 1);
  const side = blocked(prefer) && !blocked(other) ? other : prefer;
  // Near the left or right edge the tag hangs inward so it never sticks out of the board.
  const align = at[0] <= 1 ? 0 : at[0] >= view.map.width - 2 ? 1 : 0.5;
  return (
    <span className={`maptag ${className}`}
      style={{ left: (at[0] + align) * cell, top: side === 'below' ? (at[1] + 1) * cell + 2 : at[1] * cell - 26, transform: `translateX(${-align * 100}%)` }}>
      {children}
    </span>
  );
}

export function Floats({ floats, cell }: { floats: FloatText[]; cell: number }) {
  return (
    <>
      {floats.map(f => (
        <span key={f.id} className={`float-num ${f.kind}`}
          style={{ left: f.at[0] * cell + cell / 2, top: f.at[1] * cell - 6, transform: 'translateX(-50%)', fontSize: f.kind === 'exp' ? 12 : undefined }}>
          {f.text}
        </span>
      ))}
    </>
  );
}
