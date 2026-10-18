// Fire-Emblem style contextual menu, pinned beside the planned destination tile while the unit is
// in the generic action stage. Choices come from the shared menu source (menu.ts), the same engine
// data the sidebar panel and the server use. The menu never covers its own destination tile, so a
// click on that tile still reaches the board and quick-confirms 移动后待机.
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import type { BattleState, Point } from '@common/engine/index.ts';
import { VULNERARY } from '../assets.ts';
import type { BattleController } from './controller.ts';
import { actionMenu, carried } from './menu.ts';
import type { MenuEntry } from './menu.ts';

export type MenuPlace = (to: Point, size: { w: number; h: number }) => CSSProperties;

function EntryButton({ entry, onClick }: { entry: MenuEntry; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" data-action={entry.action.id} className={`ctx-item${entry.tone === 'primary' ? ' ctx-hot' : ''}`} onClick={onClick}>
      {entry.label}
    </button>
  );
}

export function ContextMenu({ state, unitId, to, ctl, place, page }: {
  state: BattleState;
  unitId: string;
  to: Point;
  ctl: BattleController;
  place: MenuPlace;
  page: 'root' | 'bag';
}) {
  const [size, setSize] = useState({ w: 132, h: 220 });
  const ref = useRef<HTMLDivElement>(null);
  // Measure after every render (page switches resize the menu) so the placement math clamps
  // against the real size instead of an estimate. Bail out when unchanged to avoid a render loop.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize(prev => prev.w === el.offsetWidth && prev.h === el.offsetHeight ? prev : { w: el.offsetWidth, h: el.offsetHeight });
  });

  useLayoutEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [page, unitId, to[0], to[1]]);

  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
        : (current + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus({ preventScroll: true });
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      ctl.cancel();
    } else if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };
  const run = (entry: MenuEntry) => {
    const id = entry.action.id;
    if (id === 'move') ctl.cancel();
    else if (id === 'interact') ctl.interact(entry.action.object);
    else ctl.chooseAction(id);
  };

  const bag = carried(state, unitId, to);
  let body: ReactNode;
  if (page === 'root') {
    body = actionMenu(state, unitId, to).map(entry => (
      <EntryButton key={entry.action.id === 'interact' ? `i:${entry.action.object}` : entry.action.id}
        entry={entry} onClick={() => run(entry)} />
    ));
  } else {
    body = <>
      {bag.weapons.map((w, i) => (
        <div key={`w${i}`} className="ctx-row"><b>{w.name}</b><span>{w.detail}</span></div>
      ))}
      {bag.consumables.map(c => c.usable
        ? (
          // Only potions the engine currently allows (unit hurt, non-shield); committing goes
          // through the existing item flow, exactly like the sidebar panel.
          <button key={`c${c.index}`} type="button" className="ctx-item"
            onClick={() => { ctl.chooseAction('item'); ctl.useItem(c.index!); }}>
            <img className="px" src={VULNERARY} width={20} height={20} alt="" />使用{c.name}
            <span className="ctx-sub">{c.detail}</span>
          </button>
        )
        : <div key={`c${c.index}`} className="ctx-row ctx-off"><b>{c.name}</b><span>{c.detail}</span></div>
      )}
    </>;
  }

  return (
    <div ref={ref} className="ctx-menu" style={place(to, size)} data-own-enter=""
      role={page === 'root' ? 'menu' : 'dialog'} aria-label={page === 'root' ? '行动菜单' : '持有物'}
      // Keep pointer events out of the board handlers: no pan, no accidental cell clicks, and the
      // global Enter shortcut must not double-submit (data-own-enter, see BattlePage).
      onPointerDown={stop} onPointerMove={stop} onPointerUp={stop} onKeyDown={onKeyDown}
      onContextMenu={e => { e.stopPropagation(); e.preventDefault(); ctl.cancel(); }}>
      <div className="ctx-head"><span>{page === 'root' ? '行动' : '持有物'}</span>
        {page === 'root'
          ? <span className="ctx-hint">点落点格＝待机</span>
          : <button type="button" className="ctx-mini" onClick={() => ctl.cancel()}>返回</button>}
      </div>
      {body}
    </div>
  );
}
