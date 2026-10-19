// Widgets pinned to the map viewport: terrain window, minimap, zoom, phase banner.
import { MOVE_TYPE_NAMES } from '@common/data/types.ts';
import { classOf, terrainAt } from '@common/engine/index.ts';
import type { BattleState, Point, Side, UnitState } from '@common/engine/index.ts';
import { MOVEMENT, TERRAINS } from '@common/maps/map.ts';
import { MinusIcon, PlusIcon } from '../ui/icons.tsx';

export function TerrainWindow({ state, at, mover }: { state: BattleState; at: Point; mover: UnitState | null }) {
  const terrain = TERRAINS[terrainAt(state, at)];
  const moveType = mover ? classOf(mover).moveType : 'foot';
  const cost = terrain.costs[MOVEMENT[moveType].index];
  const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <div className="widget terrain-win" aria-label={`地形：${terrain.name}`}>
      <div className="t"><span>{terrain.name}</span><span className="pixel" style={{ fontSize: 10, color: '#6A6256' }}>X{at[0]} Y{at[1]}</span></div>
      <div className="r"><span>回避</span><b>{sign(terrain.avoid)}</b></div>
      <div className="r"><span>防御</span><b>{sign(terrain.def)}</b></div>
      <div className="r"><span>{MOVE_TYPE_NAMES[moveType]}消耗</span><b>{cost ?? '不可进入'}</b></div>
      {terrain.heal > 0 && <div className="r"><span>阶段开始</span><b>回复 {terrain.heal}%</b></div>}
    </div>
  );
}

const MINI = 6;

interface MinimapProps {
  state: BattleState;
  image: string;
  view: { left: number; top: number; width: number; height: number };
  cell: number;
  onJump: (at: Point) => void;
}

export function Minimap({ state, image, view, cell, onJump }: MinimapProps) {
  const w = state.map.width * MINI, h = state.map.height * MINI;
  const scale = MINI / cell;
  return (
    <div className="widget minimap">
      <div className="mm" style={{ width: w, height: h }} role="button" tabIndex={-1} aria-label="小地图，点击跳转视野"
        onClick={e => {
          const box = e.currentTarget.getBoundingClientRect();
          onJump([Math.floor((e.clientX - box.left) / MINI), Math.floor((e.clientY - box.top) / MINI)]);
        }}>
        <img className="px" src={image} width={w} height={h} alt="" />
        {state.units.filter(u => u.alive).map(u => (
          <span key={u.id} className="dot" style={{
            left: u.pos[0] * MINI + 1, top: u.pos[1] * MINI + 1,
            background: u.side === 'player' ? '#86b8da' : '#e58474', boxShadow: '0 0 0 1px #2B2421',
          }} />
        ))}
        <span className="view" style={{
          left: view.left * scale, top: view.top * scale,
          width: Math.min(w, view.width * scale), height: Math.min(h, view.height * scale),
        }} />
      </div>
      <div style={{ fontSize: 11, color: '#4E473D', textAlign: 'center', marginTop: 2 }}>
        全图 {state.map.width}×{state.map.height} · 拖动平移
      </div>
    </div>
  );
}

export function ZoomControls({ zoom, onZoom }: { zoom: 2 | 3; onZoom: (z: 2 | 3) => void }) {
  return (
    <div className="widget zoom" role="group" aria-label="地图缩放">
      <button type="button" aria-label="放大" onClick={() => onZoom(3)} disabled={zoom === 3}><PlusIcon /></button>
      <span className="lv">{zoom}×</span>
      <button type="button" aria-label="缩小" onClick={() => onZoom(2)} disabled={zoom === 2}><MinusIcon /></button>
    </div>
  );
}

export function PhaseBanner({ side, turn }: { side: Side; turn: number }) {
  return (
    <div className="phase-banner" role="status">
      <div className={side}>
        {side === 'player' ? '己方阶段' : '敌方阶段'}
        <small>第 {turn} 回合</small>
      </div>
    </div>
  );
}
