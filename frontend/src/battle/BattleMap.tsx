import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent, ReactNode, SyntheticEvent } from 'react';
import { living, unitById } from '@common/engine/index.ts';
import type { Point } from '@common/engine/index.ts';
import { mapArt } from '../assets.ts';
import { SeizeIcon } from '../ui/icons.tsx';
import type { BattleController, Snapshot } from './controller.ts';
import { CellLayer, Cursor, Floats, Ghost, MapTag, ObjectLayer, PathArrow, ThreatLayer, UnitLayer } from './MapLayers.tsx';
import { Minimap, PhaseBanner, TerrainWindow, ZoomControls } from './MapWidgets.tsx';
import { displayName } from './names.ts';
import { overlaysFor, threatCells } from './overlays.ts';
import { ContextMenu } from './ContextMenu.tsx';
import { isCommand } from './commands.ts';

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
  const [scroll, setScroll] = useState({ left: 0, top: 0, width: 0, height: 0, offX: 0, offY: 0 });
  const [dragging, setDragging] = useState(false);

  const overlays = useMemo(() => (busy ? null : overlaysFor(state, mode, hover)), [busy, state, mode, hover]);
  const threat = useMemo(() => (settings.threat && !busy ? threatCells(state) : null), [settings.threat, busy, state]);

  const readScroll = () => {
    const el = viewport.current;
    // offX/offY: where the board sits inside the viewport when it is smaller than the view
    // (margin auto centers it); visible board coordinates = scroll − offset.
    const board = el?.querySelector<HTMLElement>(':scope > .board');
    if (el) setScroll({
      left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight,
      offX: board?.offsetLeft ?? 0, offY: board?.offsetTop ?? 0,
    });
  };

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const observer = new ResizeObserver(readScroll);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
  // 右键 = 火纹的取消键：back one step (or drop the selection), never spends the move.
  const onContextMenu = (e: SyntheticEvent<HTMLDivElement>) => {
    e.preventDefault();
    ctl.cancel();
  };

  // Position the contextual menu next to the destination tile, flipped/clamped to stay inside the
  // VISIBLE part of the viewport (works at any zoom / scroll position), and kept fully off its own
  // tile so a click on that tile still quick-confirms 移动后待机.
  const placeMenu = (to: Point, size: { w: number; h: number }): CSSProperties => {
    const pad = 4, gap = 3;
    const visL = scroll.left - scroll.offX, visR = visL + scroll.width;
    const visT = scroll.top - scroll.offY, visB = visT + scroll.height;
    const tileL = to[0] * cell, tileR = tileL + cell;
    const tileT = to[1] * cell, tileB = tileT + cell;
    let left = tileR + gap;
    if (left + size.w > visR - pad) left = tileL - size.w - gap; // flip to the left edge of the tile
    left = Math.max(visL + pad, Math.min(left, visR - pad - size.w));
    let top = Math.max(visT + pad, Math.min(tileT, visB - pad - size.h));
    // Degenerate narrow viewports: if clamping pushed the menu over the tile, go above or below.
    if (left < tileR && left + size.w > tileL && top < tileB && top + size.h > tileT) {
      top = tileT - size.h - gap >= visT + pad ? tileT - size.h - gap : Math.max(visT + pad, tileB + gap);
    }
    return { left, top, maxHeight: Math.max(60, scroll.height - pad * 2), maxWidth: Math.max(100, scroll.width - pad * 2) };
  };
  // The menu is only the player's live decision tool: never over enemy / AI playback, dialogs,
  // 结果画面 or read-only sessions.
  const menuOpen = (mode.kind === 'action' || mode.kind === 'item') && state.phase === 'player' && !state.result
    && !snap.combat && !snap.levelUp && !snap.dialog && !ctl.session.readOnly;

  const selectedId = 'unit' in mode ? mode.unit : null;
  const selected = selectedId ? unitById(view, selectedId) : null;
  const target = (mode.kind === 'attack' || mode.kind === 'heal' || isCommand(mode)) && mode.target ? unitById(view, mode.target) : null;
  const destAt = (mode.kind === 'cast' || mode.kind === 'staff') ? mode.dest : null;
  const ghost = overlays?.ghost ?? null;
  const ghostElsewhere = !!ghost && !!selected && (ghost.at[0] !== selected.pos[0] || ghost.at[1] !== selected.pos[1]);
  const infoAt = target?.pos ?? hover ?? selected?.pos ?? null;
  const W = view.map.width;
  const image = mapArt(view.name, view.map.tiles);
  // 王座: always framed; named while hovered or while our commander is selected, unless the
  // planned destination already sits there.
  const goal = view.goal;
  const throne = goal.kind === 'seize' ? goal.throne : null;
  const exits = goal.kind === 'escape' || goal.kind === 'gather' || goal.kind === 'escort' ? goal.exits : [];
  const boxes = view.boxes ?? [];
  const isThrone = (at: Point | null | undefined) => !!throne && !!at && at[0] === throne[0] && at[1] === throne[1];
  const throneTag = !!throne && !(ghostElsewhere && isThrone(ghost?.at))
    && (isThrone(hover) || (!!selected && selected.side === 'player' && !!selected.boss));

  return (
    <div className="viewport-shell">
      <div ref={viewport} className={`viewport${dragging ? ' dragging' : ''}`} tabIndex={0} role="application"
        aria-label={`战术地图：${view.name}`} aria-describedby="map-help"
        onScroll={readScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        onContextMenu={onContextMenu}
        onPointerLeave={() => { if (!press.current) ctl.hoverCell(null); }}>
        <div className="board" style={{ width, height, '--cell': `${cell}px` } as CSSProperties}>
          <img className="px terrain" src={image} width={width} height={height} alt="" draggable={false} />
          {overlays && <CellLayer cells={overlays.move} width={W} cell={cell} className="mv" />}
          {overlays && <CellLayer cells={overlays.attack} width={W} cell={cell} className="atk" />}
          {overlays && <CellLayer cells={overlays.heal} width={W} cell={cell} className="healz" />}
          {overlays && <CellLayer cells={overlays.dest} width={W} cell={cell} className="dest" />}
          {threat && <ThreatLayer cells={threat} width={W} cell={cell} />}
          {settings.grid && <div className="gridlines" />}
          {overlays?.path && <PathArrow path={overlays.path} cell={cell} width={width} height={height} />}
          {throne && <span className="throne-mark" style={{ left: throne[0] * cell, top: throne[1] * cell }} aria-hidden="true" />}
          {exits.map(([x, y], i) => <span key={`exit-${i}`} className="throne-mark" style={{ left: x * cell, top: y * cell }} aria-hidden="true" />)}
          {boxes.map(([x, y], i) => (
            <span key={`box-${i}`} aria-hidden="true" style={{ position: 'absolute', left: x * cell + cell / 4, top: y * cell + cell / 4, width: cell / 2, height: cell / 2, background: '#C08A3A', border: '2px solid #2B2421', borderRadius: 3, boxSizing: 'border-box' }} />
          ))}
          <ObjectLayer state={view} cell={cell} />
          <UnitLayer view={view} cell={cell} selected={selectedId} ghostElsewhere={ghostElsewhere} fading={snap.fading} />
          {ghost && ghostElsewhere && <Ghost unit={ghost.unit} at={ghost.at} cell={cell} />}
          {ghost && ghostElsewhere && !target && mode.kind !== 'move' && <MapTag at={ghost.at} cell={cell} view={view} className="mt-brass">已选落点</MapTag>}
          {throne && throneTag && <MapTag at={throne} cell={cell} view={view} className="mt-throne"><SeizeIcon size={14} />王座 · 压制目标</MapTag>}
          {hover && !busy && <Cursor at={hover} cell={cell} kind={snap.cursor ? 'kbd-cursor' : ''} />}
          {target && <Cursor at={target.pos} cell={cell} kind="tgt" />}
          {destAt && <Cursor at={destAt} cell={cell} kind="tgt" />}
          {destAt && <MapTag at={destAt} cell={cell} view={view} className="mt-brass" prefer="below">落点</MapTag>}
          {target && (
            <MapTag at={target.pos} cell={cell} view={view} className={target.side === 'enemy' ? 'mt-red' : 'mt-green'} prefer="below">
              {target.side === 'enemy' ? '目标' : mode.kind === 'heal' ? '治疗' : '目标'} · {displayName(view, target.id)}
            </MapTag>
          )}
          {overlay?.(cell)}
          {menuOpen && (mode.kind === 'action' || mode.kind === 'item')
            && <ContextMenu state={state} unitId={mode.unit} to={mode.to} ctl={ctl} place={placeMenu} page={mode.kind === 'item' ? 'bag' : 'root'} />}
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
        点击己方单位选中，再点蓝色格选择落点并打开行动菜单；再点一次落点格直接待机，点红色范围内的敌人查看交战预测。方向键移动光标，空格选择，Enter 确认，Esc 或右键返回上一步。
      </p>
    </div>
  );
}
