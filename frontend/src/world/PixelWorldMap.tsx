import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LANDMARK_PX, paintWorld, siteCenterPx, WORLD_ART_H, WORLD_ART_W } from '@common/maps/world-art.ts';
import type { WorldMapView, WorldMapNode } from '@common/game/region-map.ts';

// 像素世界地图（街机大地图风格）：240×160 格、每格 4 像素的画布，最近邻放大；拖动平移、滚轮缩放。
// 点地区地标选中，双击已开通地区直接进入；未开通地区蒙着迷雾，可选路线的地标上有铜色闪框。
// 地图本身由 common/maps 的确定性生成器画出，这里只叠加状态（迷雾、旗帜、名字、选中框）。
const STATE_COLOUR: Record<WorldMapNode['state'], string> = { cleared: '#4fbf5a', unlocked: '#4a90e0', available: '#e6b04a', locked: '#8c8273' };
const ZOOMS = [2, 3, 4, 6];

let baseCanvas: HTMLCanvasElement | null = null;
function baseMap(): HTMLCanvasElement {
  if (baseCanvas) return baseCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_ART_W;
  canvas.height = WORLD_ART_H;
  const pixels = paintWorld();
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
  baseCanvas = canvas;
  return canvas;
}

// 未开通地区的迷雾：整图大小的透明层，在地区周围铺深色的棋盘点阵，越靠外越稀。
function fogLayer(nodes: WorldMapNode[]): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_ART_W;
  canvas.height = WORLD_ART_H;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(WORLD_ART_W, WORLD_ART_H);
  const radius = 58;
  for (const node of nodes) {
    if (node.state !== 'locked') continue;
    const [cx, cy] = siteCenterPx(node.id);
    for (let y = Math.max(0, cy - radius); y < Math.min(WORLD_ART_H, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x < Math.min(WORLD_ART_W, cx + radius); x++) {
        const d = Math.hypot(x - cx, y - cy) / radius;
        if (d >= 1) continue;
        const checker = (x + y) & 1;
        const solid = d < 0.45 || (d < 0.75 && checker === 0) || (d < 1 && (x & 1) === 0 && (y & 1) === 0);
        if (!solid) continue;
        const i = (y * WORLD_ART_W + x) * 4;
        image.data[i] = 18; image.data[i + 1] = 22; image.data[i + 2] = 44; image.data[i + 3] = d < 0.45 ? 190 : 150;
      }
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

export interface PixelWorldProps {
  world: WorldMapView;
  picked: number | null;
  onPick: (id: number) => void;
  onEnter: (id: number) => void;
}

export function PixelWorldMap({ world, picked, onPick, onEnter }: PixelWorldProps) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef({ scale: 2, x: 0, y: 0 });
  const hover = useRef<number | null>(null);
  const drag = useRef<{ px: number; py: number; vx: number; vy: number; moved: boolean } | null>(null);
  const frame = useRef(0);
  const [zoom, setZoom] = useState(2);
  const fog = useMemo(() => fogLayer(world.nodes), [world.nodes]);
  const latest = useRef({ world, picked, fog });
  latest.current = { world, picked, fog };

  const clamp = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const v = view.current;
    const viewW = canvas.width / v.scale, viewH = canvas.height / v.scale;
    v.x = viewW >= WORLD_ART_W ? (WORLD_ART_W - viewW) / 2 : Math.max(0, Math.min(WORLD_ART_W - viewW, v.x));
    v.y = viewH >= WORLD_ART_H ? (WORLD_ART_H - viewH) / 2 : Math.max(0, Math.min(WORLD_ART_H - viewH, v.y));
  }, []);

  const draw = useCallback((time = 0) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const { world: current, picked: pickedId, fog: fogCanvas } = latest.current;
    const v = view.current;
    const dpr = canvas.width / (canvas.clientWidth || canvas.width);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#1b3a6b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sx = Math.max(0, v.x), sy = Math.max(0, v.y);
    const sw = Math.min(WORLD_ART_W - sx, canvas.width / v.scale - Math.max(0, -v.x)), sh = Math.min(WORLD_ART_H - sy, canvas.height / v.scale - Math.max(0, -v.y));
    const dx = (sx - v.x) * v.scale, dy = (sy - v.y) * v.scale;
    for (const layer of [baseMap(), fogCanvas]) ctx.drawImage(layer, sx, sy, sw, sh, dx, dy, sw * v.scale, sh * v.scale);

    const toScreen = (id: number): [number, number] => { const [cx, cy] = siteCenterPx(id); return [(cx - v.x) * v.scale, (cy - v.y) * v.scale]; };
    const half = (LANDMARK_PX / 2) * v.scale;
    const entries: { id: number; name: string; state: WorldMapNode['state'] | 'capital' }[] = [{ id: 0, name: current.capital.name, state: 'capital' }, ...current.nodes.map(n => ({ id: n.id, name: n.name, state: n.state }))];
    const pulse = 0.5 + 0.5 * Math.sin(time / 260);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `bold ${Math.round(12 * dpr)}px sans-serif`;
    for (const entry of entries) {
      const [x, y] = toScreen(entry.id);
      if (x < -80 || y < -80 || x > canvas.width + 80 || y > canvas.height + 80) continue;
      const colour = entry.state === 'capital' ? '#e8c040' : STATE_COLOUR[entry.state];
      // 旗帜：已开通蓝、已讨伐绿、可选路线铜色；迷雾里的地区没有旗。
      if (entry.state !== 'locked') {
        const pole = Math.max(1, Math.round(v.scale / 2));
        ctx.fillStyle = '#1a1420';
        ctx.fillRect(x - half - pole, y - half - 7 * v.scale, pole, 8 * v.scale);
        ctx.fillStyle = colour;
        ctx.fillRect(x - half, y - half - 7 * v.scale, 5 * v.scale, 3 * v.scale);
      }
      if (entry.state === 'available') {
        ctx.strokeStyle = `rgba(230, 176, 74, ${0.55 + 0.45 * pulse})`;
        ctx.lineWidth = Math.max(2, v.scale);
        ctx.setLineDash([3 * v.scale, 2 * v.scale]);
        ctx.strokeRect(x - half - 3 * v.scale, y - half - 3 * v.scale, 2 * half + 6 * v.scale, 2 * half + 6 * v.scale);
        ctx.setLineDash([]);
      }
      if (entry.id === pickedId || entry.id === hover.current) {
        ctx.strokeStyle = entry.id === pickedId ? '#ffffff' : 'rgba(255,255,255,0.6)';
        ctx.lineWidth = Math.max(2, v.scale);
        ctx.strokeRect(x - half - v.scale, y - half - v.scale, 2 * half + 2 * v.scale, 2 * half + 2 * v.scale);
      }
      const label = entry.state === 'locked' ? `${entry.name}（未开通）` : entry.name;
      const ty = y + half + 13 * dpr;
      ctx.lineWidth = 3 * dpr;
      ctx.strokeStyle = 'rgba(16, 12, 24, 0.9)';
      ctx.strokeText(label, x, ty);
      ctx.fillStyle = entry.state === 'locked' ? '#b9b2a4' : '#fff8e6';
      ctx.fillText(label, x, ty);
    }
    if (current.nodes.some(n => n.state === 'available')) frame.current = requestAnimationFrame(draw);
  }, []);

  const redraw = useCallback(() => { cancelAnimationFrame(frame.current); frame.current = requestAnimationFrame(draw); }, [draw]);

  const centerOn = useCallback((id: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const [cx, cy] = siteCenterPx(id);
    view.current.x = cx - canvas.width / view.current.scale / 2;
    view.current.y = cy - canvas.height / view.current.scale / 2;
    clamp();
    redraw();
  }, [clamp, redraw]);

  // 画布大小跟随容器（按设备像素）；首次显示居中王都，缩放取能看全大陆的最大整数档。
  useEffect(() => {
    const box = wrap.current, canvas = canvasRef.current;
    if (!box || !canvas) return;
    let first = true;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(box.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(box.clientHeight * dpr));
      if (first) {
        first = false;
        // 初始至少放大到 1 个设备像素，地标和旗帜才看得清；窗口再大就取能铺满的档，并居中王都。
        const fit = Math.min(canvas.width / WORLD_ART_W, canvas.height / WORLD_ART_H);
        view.current.scale = Math.max(fit, dpr, 0.25);
        setZoom(view.current.scale);
        const [cx, cy] = siteCenterPx(0);
        view.current.x = cx - canvas.width / view.current.scale / 2;
        view.current.y = cy - canvas.height / view.current.scale / 2;
      }
      clamp();
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(box);
    return () => { observer.disconnect(); cancelAnimationFrame(frame.current); };
  }, [clamp, redraw]);

  useEffect(() => { redraw(); }, [world, picked, redraw]);

  const zoomTo = (scale: number, anchor?: [number, number]) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const v = view.current;
    const [ax, ay] = anchor ?? [canvas.width / 2, canvas.height / 2];
    const mx = v.x + ax / v.scale, my = v.y + ay / v.scale;
    v.scale = scale;
    v.x = mx - ax / scale;
    v.y = my - ay / scale;
    clamp();
    setZoom(scale);
    redraw();
  };
  const fitScale = () => { const c = canvasRef.current; return c ? Math.min(c.width / WORLD_ART_W, c.height / WORLD_ART_H) : 1; };
  const steps = () => [fitScale(), ...ZOOMS.map(z => z * (window.devicePixelRatio || 1))].sort((a, b) => a - b).filter((s, i, all) => i === 0 || s - all[i - 1] > 0.01);
  const zoomBy = (direction: 1 | -1, anchor?: [number, number]) => {
    const list = steps();
    const now = view.current.scale;
    const next = direction > 0 ? list.find(s => s > now + 0.01) : [...list].reverse().find(s => s < now - 0.01);
    if (next) zoomTo(next, anchor);
  };

  const siteAt = (event: { clientX: number; clientY: number }): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    const px = (event.clientX - rect.left) * dpr, py = (event.clientY - rect.top) * dpr;
    const v = view.current;
    const reach = (LANDMARK_PX / 2 + 4) * v.scale;
    let best: number | null = null, bestD = Infinity;
    for (const id of [0, ...latest.current.world.nodes.map(n => n.id)]) {
      const [cx, cy] = siteCenterPx(id);
      const d = Math.hypot((cx - v.x) * v.scale - px, (cy - v.y) * v.scale - py);
      if (d < reach && d < bestD) { best = id; bestD = d; }
    }
    return best;
  };

  const canEnter = (id: number) => { const n = latest.current.world.nodes.find(node => node.id === id); return !!n && (n.state === 'unlocked' || n.state === 'cleared'); };

  return (
    <div className="pw" ref={wrap}>
      <canvas ref={canvasRef} className="pw-canvas" tabIndex={0} role="application"
        aria-label="像素世界地图。拖动平移，滚轮缩放，点地标选择地区，双击已开通的地区进入；也可以用下方地区列表。方向键平移，加减号缩放。"
        onPointerDown={event => {
          (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
          drag.current = { px: event.clientX, py: event.clientY, vx: view.current.x, vy: view.current.y, moved: false };
        }}
        onPointerMove={event => {
          const d = drag.current;
          const canvas = canvasRef.current;
          if (d && canvas) {
            const dpr = canvas.width / canvas.getBoundingClientRect().width;
            if (Math.hypot(event.clientX - d.px, event.clientY - d.py) > 4) d.moved = true;
            if (d.moved) {
              view.current.x = d.vx - (event.clientX - d.px) * dpr / view.current.scale;
              view.current.y = d.vy - (event.clientY - d.py) * dpr / view.current.scale;
              clamp();
              redraw();
            }
            return;
          }
          const over = siteAt(event);
          if (over !== hover.current) {
            hover.current = over;
            if (canvas) canvas.style.cursor = over === null ? 'grab' : 'pointer';
            redraw();
          }
        }}
        onPointerUp={event => {
          const d = drag.current;
          drag.current = null;
          if (d && !d.moved) {
            const hit = siteAt(event);
            // 迷雾里的地区不可选择（与列表一致）：相连路线开通前不能提交。
            if (hit !== null && hit > 0 && latest.current.world.nodes.find(n => n.id === hit)?.state !== 'locked') onPick(hit);
          }
        }}
        onPointerLeave={() => { if (hover.current !== null) { hover.current = null; redraw(); } }}
        onDoubleClick={event => { const hit = siteAt(event); if (hit && canEnter(hit)) onEnter(hit); }}
        onWheel={event => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const rect = canvas.getBoundingClientRect();
          const dpr = canvas.width / rect.width;
          zoomBy(event.deltaY < 0 ? 1 : -1, [(event.clientX - rect.left) * dpr, (event.clientY - rect.top) * dpr]);
        }}
        onKeyDown={event => {
          const step = 24 / view.current.scale * (window.devicePixelRatio || 1);
          const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          if (move[event.key]) { event.preventDefault(); view.current.x += move[event.key][0]; view.current.y += move[event.key][1]; clamp(); redraw(); }
          else if (event.key === '+' || event.key === '=') zoomBy(1);
          else if (event.key === '-') zoomBy(-1);
        }} />
      <div className="pw-tools" role="group" aria-label="地图缩放">
        <button type="button" className="btn btn-sm" onClick={() => zoomBy(1)} aria-label="放大">＋</button>
        <button type="button" className="btn btn-sm" onClick={() => zoomBy(-1)} aria-label="缩小">－</button>
        <button type="button" className="btn btn-sm" onClick={() => centerOn(0)}>王都</button>
        <button type="button" className="btn btn-sm" disabled={picked === null} onClick={() => picked !== null && centerOn(picked)}>定位所选</button>
      </div>
      <span className="pw-zoom" aria-hidden="true">{zoom.toFixed(2)}×</span>
    </div>
  );
}
