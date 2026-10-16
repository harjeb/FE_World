import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode } from 'react';
import { living, unitById } from '@common/engine/index.ts';
import type { Point } from '@common/engine/index.ts';
import { MAPS } from '../assets.ts';
import { SeizeIcon } from '../ui/icons.tsx';
import type { BattleController, Snapshot } from './controller.ts';
import { CellLayer, Cursor, Floats, Ghost, MapTag, PathArrow, ThreatLayer, TileColors, UnitLayer } from './MapLayers.tsx';
import { Minimap, PhaseBanner, TerrainWindow, ZoomControls } from './MapWidgets.tsx';
import { displayName } from './names.ts';
import { overlaysFor, threatCells } from './overlays.ts';

const DRAG_START = 6;

// The tactical map: a scrollable viewport over a board of --cell sized tiles. Click selects,
// drag pans, the keyboard cursor mirrors the mouse (arrow keys + Enter / Space, see BattlePage).
// `overlay` draws extra marks on the board (观战 / 回放: the acting unit, results of the last step).
export function BattleMap({ snap, ctl, overlay }: { snap: Snapshot; ctl: BattleController; overlay?: (cell: number) => ReactNode }) {
  const { view, state, mode, hover, settings } = snap;
  const cell = 16 * settings.zoom;
  const width = view.map.width * cell, height = view.map.height * cell;
  const busy = mode.kind === 'busy';
  const viewport = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; left: number; top: number; dragging: boolean } | null>(null);
  const keepCenter = useRef<Point | null>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);

  const overlays = useMemo(() => (busy ? null : overlaysFor(state, mode, hover)), [busy, state, mode, hover]);
  const threat = useMemo(() => (settings.threat && !busy ? threatCells(state) : null), [settings.threat, busy, state]);

  const readScroll = () => {
    const el = viewport.current;
    if (el) setScroll({ left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight });
  };

  const centerOn = (at: Point, smooth: boolean) => {
    const el = viewport.current;
    if (!el) return;
    el.scrollTo({ left: (at[0] + 0.5) * cell - el.clientWidth / 2, top: (at[1] + 0.5) * cell - el.clientHeight / 2, behavior: smooth ? 'smooth' : 'auto' });
  };

  // Animations call focus() to keep the acting unit at least two tiles inside the view.
  useEffect(() => {
    ctl.focus = (at: Point) => {
      const el = viewport.current;
      if (!el || !ctl.follow) return;
      const margin = cell * 2;
      const x = at[0] * cell, y = at[1] * cell;
      const outside = x < el.scrollLeft + margin || x + cell > el.scrollLeft + el.clientWidth - margin
        || y < el.scrollTop + margin || y + cell > el.scrollTop + el.clientHeight - margin;
      if (outside) centerOn(at, true);
    };
    return () => { ctl.focus = () => {}; };
  });

  // Start centered on our army; keep the center tile when the zoom changes.
  useLayoutEffect(() => {
    const target = keepCenter.current ?? living(state, 'player')[0]?.pos;
    if (target) centerOn(target, false);
    keepCenter.current = null;
    readScroll();
  }, [cell]);

  const cellAt = (e: PointerEvent): Point | null => {
    const box = e.currentTarget.querySelector('.board')!.getBoundingClientRect();
    const x = Math.floor((e.clientX - box.left) / cell), y = Math.floor((e.clientY - box.top) / cell);
    return x >= 0 && y >= 0 && x < view.map.width && y < view.map.height ? [x, y] : null;
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const el = viewport.current!;
    press.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, dragging: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (p) {
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_START) {
        p.dragging = true;
        setDragging(true);
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      if (p.dragging) {
        viewport.current!.scrollTo({ left: p.left - (e.clientX - p.x), top: p.top - (e.clientY - p.y) });
        return;
      }
    }
    const at = cellAt(e);
    if (!hover || !at || at[0] !== hover[0] || at[1] !== hover[1]) ctl.hoverCell(at);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    press.current = null;
    setDragging(false);
    if (p && !p.dragging) {
      const at = cellAt(e);
      if (at) ctl.click(at);
    }
  };

  const selectedId = 'unit' in mode ? mode.unit : null;
  const selected = selectedId ? unitById(view, selectedId) : null;
  const target = (mode.kind === 'attack' || mode.kind === 'heal') && mode.target ? unitById(view, mode.target) : null;
  const ghost = overlays?.ghost ?? null;
  const ghostElsewhere = !!ghost && !!selected && (ghost.at[0] !== selected.pos[0] || ghost.at[1] !== selected.pos[1]);
  const infoAt = target?.pos ?? hover ?? selected?.pos ?? null;
  const W = view.map.width;
  const image = MAPS[view.name];
  // 王座: always framed; named while hovered or while our commander is selected, unless the
  // planned destination already sits there.
  const goal = view.goal;
  const throne = goal.kind === 'seize' ? goal.throne : null;
  const isThrone = (at: Point | null | undefined) => !!throne && !!at && at[0] === throne[0] && at[1] === throne[1];
  const throneTag = !!throne && !(ghostElsewhere && isThrone(ghost?.at))
    && (isThrone(hover) || (!!selected && selected.side === 'player' && !!selected.boss));

  return (
    <div className="viewport-shell">
      <div ref={viewport} className={`viewport${dragging ? ' dragging' : ''}`} tabIndex={0} role="application"
        aria-label={`战术地图：${view.name}`} aria-describedby="map-help"
        onScroll={readScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onPointerLeave={() => { if (!press.current) ctl.hoverCell(null); }}>
        <div className="board" style={{ width, height, '--cell': `${cell}px` } as CSSProperties}>
          {image
            ? <img className="px terrain" src={image} width={width} height={height} alt="" draggable={false} />
            : <TileColors state={view} cell={cell} />}
          {overlays && <CellLayer cells={overlays.move} width={W} cell={cell} className="mv" />}
          {overlays && <CellLayer cells={overlays.attack} width={W} cell={cell} className="atk" />}
          {overlays && <CellLayer cells={overlays.heal} width={W} cell={cell} className="healz" />}
          {threat && <ThreatLayer cells={threat} width={W} cell={cell} />}
          {settings.grid && <div className="gridlines" />}
          {overlays?.path && <PathArrow path={overlays.path} cell={cell} width={width} height={height} />}
          {throne && <span className="throne-mark" style={{ left: throne[0] * cell, top: throne[1] * cell }} aria-hidden="true" />}
          <UnitLayer view={view} cell={cell} selected={selectedId} ghostElsewhere={ghostElsewhere} fading={snap.fading} />
          {ghost && ghostElsewhere && <Ghost unit={ghost.unit} at={ghost.at} cell={cell} />}
          {ghost && ghostElsewhere && !target && mode.kind !== 'move' && <MapTag at={ghost.at} cell={cell} view={view} className="mt-brass">预览落点</MapTag>}
          {throne && throneTag && <MapTag at={throne} cell={cell} view={view} className="mt-throne"><SeizeIcon size={14} />王座 · 压制目标</MapTag>}
          {hover && !busy && <Cursor at={hover} cell={cell} kind={snap.cursor ? 'kbd-cursor' : ''} />}
          {target && <Cursor at={target.pos} cell={cell} kind="tgt" />}
          {target && (
            <MapTag at={target.pos} cell={cell} view={view} className={target.side === 'enemy' ? 'mt-red' : 'mt-green'} prefer="below">
              {target.side === 'enemy' ? '目标' : '治疗'} · {displayName(view, target.id)}
            </MapTag>
          )}
          {overlay?.(cell)}
          <Floats floats={snap.floats} cell={cell} />
        </div>
      </div>
      {infoAt && <TerrainWindow state={view} at={infoAt} mover={selected} />}
      <Minimap state={view} image={image} view={scroll} cell={cell} onJump={at => centerOn(at, true)} />
      <ZoomControls zoom={settings.zoom} onZoom={zoom => {
        const el = viewport.current;
        if (el) keepCenter.current = [Math.floor((el.scrollLeft + el.clientWidth / 2) / cell), Math.floor((el.scrollTop + el.clientHeight / 2) / cell)];
        ctl.setSetting('zoom', zoom);
      }} />
      {snap.banner && <PhaseBanner side={snap.banner.side} turn={snap.banner.turn} />}
      <p id="map-help" className="sr-only">
        点击己方单位选中，再点蓝色格预览落点，点红色范围内的敌人查看交战预测。方向键移动光标，空格选择，Enter 确认，Esc 返回上一步。
      </p>
    </div>
  );
}
