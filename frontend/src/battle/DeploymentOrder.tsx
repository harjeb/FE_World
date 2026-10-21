import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ServerUnit } from '../api/session.ts';
import { UnitFace } from '../pages/SystemParts.tsx';

interface Drag {
  id: string; pointer: number; startX: number; startY: number; offsetX: number; offsetY: number;
  width: number; active: boolean; order: string[];
}
interface DragView { id: string; left: number; top: number; width: number }

function moveToSlot(ids: string[], id: string, target: string): string[] {
  const from = ids.indexOf(id), to = ids.indexOf(target);
  if (from < 0 || to < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(from, 1); next.splice(to, 0, id);
  return next;
}

export function DeploymentOrder({ units, busy, onChange }: {
  units: ServerUnit[]; busy: boolean; onChange: (ids: string[]) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const drag = useRef<Drag | null>(null);
  const handlers = useRef<{ move: (event: globalThis.PointerEvent) => void; finish: (event: globalThis.PointerEvent) => void } | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [ghost, setGhost] = useState<DragView | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const instructions = useId();
  const ids = units.map(unit => unit.id);
  const orderKey = JSON.stringify(ids);
  const byId = new Map(units.map(unit => [unit.id, unit]));
  const ordered = (preview ?? ids).flatMap(id => byId.has(id) ? [byId.get(id)!] : []);

  const release = () => {
    const pointer = drag.current?.pointer;
    drag.current = null;
    if (pointer !== undefined && list.current?.hasPointerCapture(pointer)) list.current.releasePointerCapture(pointer);
  };
  const reset = () => { release(); setPreview(null); setGhost(null); };
  const announceOrder = (order: string[], id: string) => setAnnouncement(`${byId.get(id)?.name}已移到第 ${order.indexOf(id) + 1} 位，主将为${byId.get(order[0])?.name}`);

  // A changed roster or a submitted departure cancels an unfinished drag.
  useEffect(() => { reset(); }, [orderKey, busy]);
  useEffect(() => {
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !drag.current) return;
      event.preventDefault(); reset(); setAnnouncement('已取消调整部署顺序');
    };
    // Keep following and releasing outside the list, including after a browser loses capture.
    const pointerMove = (event: globalThis.PointerEvent) => handlers.current?.move(event);
    const pointerUp = (event: globalThis.PointerEvent) => handlers.current?.finish(event);
    const cancel = () => { if (drag.current) reset(); };
    window.addEventListener('keydown', escape);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      release();
    };
  }, []);

  const start = (event: PointerEvent<HTMLButtonElement>, id: string) => {
    if (busy || units.length < 2 || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { id, pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, width: rect.width, active: false, order: [...ids] };
    list.current?.setPointerCapture(event.pointerId);
  };
  const move = (event: globalThis.PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId || busy || !list.current) return;
    if (!current.active && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < 6) return;
    current.active = true;
    event.preventDefault();
    setGhost({ id: current.id, left: event.clientX - current.offsetX, top: event.clientY - current.offsetY, width: current.width });
    const rect = list.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    // Nearest slot also handles gaps and wrapped rows on small screens.
    const slots = [...list.current.querySelectorAll<HTMLElement>('li[data-unit-id]')];
    const target = slots.map(slot => {
      const bounds = slot.getBoundingClientRect();
      return { id: slot.dataset.unitId!, distance: Math.hypot(event.clientX - bounds.left - bounds.width / 2, event.clientY - bounds.top - bounds.height / 2) };
    }).sort((a, b) => a.distance - b.distance)[0];
    if (target) {
      current.order = moveToSlot(current.order, current.id, target.id);
      setPreview(current.order);
    }
  };
  const finish = (event: globalThis.PointerEvent) => {
    const current = drag.current;
    if (!current || current.pointer !== event.pointerId || !list.current) return;
    const rect = list.current.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    reset();
    if (current.active && inside && !busy && JSON.stringify(current.order) !== orderKey) {
      onChange(current.order); announceOrder(current.order, current.id);
    }
  };
  handlers.current = { move, finish };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (busy || drag.current) return;
    const index = ids.indexOf(id);
    const to = event.key === 'ArrowLeft' ? index - 1 : event.key === 'ArrowRight' ? index + 1
      : event.key === 'Home' ? 0 : event.key === 'End' ? ids.length - 1 : null;
    if (to === null) return;
    event.preventDefault();
    if (to < 0 || to >= ids.length || to === index) return;
    const next = moveToSlot(ids, id, ids[to]);
    onChange(next); announceOrder(next, id);
    const button = event.currentTarget;
    requestAnimationFrame(() => button.focus({ preventScroll: true }));
  };
  const face = (unit: ServerUnit, index: number) => <>
    <UnitFace unit={unit} size={56} order={index + 1} />
    <span className="deployment-name">{unit.name}</span>
    {index === 0 && <span className="deployment-lead">主将</span>}
  </>;
  const floating = ghost && byId.get(ghost.id);

  return <section className="panel deployment-order" aria-label="部署顺序">
    <h2>部署顺序</h2>
    <p id={instructions} className="sr-only">拖动头像调整顺序，第一位为主将。也可聚焦头像后按左右方向键调整，Home 移到首位，End 移到末位，Escape 取消拖动。</p>
    <ol ref={list} className="deployment-list" onDragStart={event => event.preventDefault()}>
      {ordered.map((unit, index) => <li key={unit.id} data-unit-id={unit.id} className={ghost?.id === unit.id ? 'is-dragging' : undefined}>
        <button className="deployment-unit" type="button" disabled={busy} data-lead={index === 0 || undefined}
          aria-label={`${unit.name}，部署第 ${index + 1} 位${index === 0 ? '，主将' : ''}`} aria-describedby={instructions}
          title={`${unit.name} · 拖动调整顺序`} onPointerDown={event => start(event, unit.id)} onKeyDown={event => keyboard(event, unit.id)}>
          {face(unit, index)}
        </button>
      </li>)}
    </ol>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {ghost && floating && createPortal(<div className="deployment-unit deployment-ghost" aria-hidden="true"
      style={{ left: ghost.left, top: ghost.top, width: ghost.width }}>
      {face(floating, ordered.findIndex(unit => unit.id === floating.id))}
    </div>, document.body)}
  </section>;
}
