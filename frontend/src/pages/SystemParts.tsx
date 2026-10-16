import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ClassId } from '@common/data/classes.ts';
import { GAME_ITEMS } from '@common/game/items.ts';
import type { ItemKey } from '@common/game/items.ts';
import { portraitFor, spriteFor } from '../assets.ts';
import type { ActionQuote, ServerState, ServerUnit } from '../api/session.ts';
import { CheckIcon } from '../ui/icons.tsx';
import { plainDate } from '../ui/calendar.ts';
import { toast } from '../ui/toast.tsx';

// Shared pieces of the 永久军团 pages (生产、主线、传承、远征、年度大竞技场).

export const itemName = (key: string): string => GAME_ITEMS[key as ItemKey]?.name ?? key;

// How many of an item sit in the warehouse, over every stack.
export function stock(state: ServerState | null, item: string): number {
  return (state?.inventory ?? []).filter(r => r.item === item).reduce((n, r) => n + r.count, 0);
}

// One op at a time per page: the button that started it shows busy, the result or error is toasted.
export function useAct(): { busy: string | null; act: <T>(key: string, run: () => Promise<T>, done: (result: T) => string) => Promise<boolean> } {
  const [busy, setBusy] = useState<string | null>(null);
  async function act<T>(key: string, run: () => Promise<T>, done: (result: T) => string): Promise<boolean> {
    setBusy(key);
    try {
      toast(done(await run()));
      return true;
    } catch (e) {
      toast(`操作失败：${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setBusy(null);
    }
  }
  return { busy, act };
}

export function Face({ character, classId, size = 40, dim = false }: { character: string; classId: string; size?: number; dim?: boolean }) {
  const looks = { classId: classId as ClassId, side: 'player' as const, character };
  return (
    <span className={`pf ally${dim ? ' dim' : ''}`} style={{ width: size, height: size }}>
      <img className="px" src={portraitFor(looks) ?? spriteFor(looks)} width={size + 8} height={size + 8} alt="" style={{ margin: '-4px 0 0 -4px' }} />
    </span>
  );
}

export const UnitFace = ({ unit, size, dim }: { unit: ServerUnit; size?: number; dim?: boolean }) =>
  <Face character={unit.character} classId={unit.classId} size={size} dim={dim} />;

// Check-box team list (出征准备 look). `max` caps the picks; `why` explains a row that cannot be picked.
// With `ordered`, picks are numbered in the order they were ticked and the first one leads.
export function TeamPicker({ units, team, max, protagonist, onChange, why, ordered = false }: {
  units: ServerUnit[]; team: string[]; max: number; protagonist: string; onChange: (team: string[]) => void;
  why?: (unit: ServerUnit) => string | null; ordered?: boolean;
}) {
  const toggle = (id: string) => onChange(team.includes(id) ? team.filter(x => x !== id) : team.length < max ? [...team, id] : team);
  return (
    <ul className="team" aria-label="可选单位">
      {units.map(u => {
        const picked = team.includes(u.id);
        const blocked = why?.(u) ?? null;
        const locked = !picked && (team.length >= max || !!blocked);
        const order = team.indexOf(u.id);
        return (
          <li key={u.id}>
            <label className={`tm${picked ? ' on' : ''}${locked ? ' off' : ''}`}>
              <input type="checkbox" checked={picked} disabled={locked} onChange={() => toggle(u.id)} />
              <UnitFace unit={u} />
              <span className="min-w-0">
                <span className="tm-n">
                  {ordered && picked && <span className="tm-ord">{order + 1}</span>}
                  {u.name}{u.character === protagonist && <span className="tag tag-brass">主角</span>}{ordered && order === 0 && <span className="tag tag-blue">主将</span>}
                </span>
                <span className="tm-s">{u.className} · Lv {u.level} · HP {u.maxHp}{blocked ? ` · ${blocked}` : ''}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

// Requirements read top to bottom; the action below them only unlocks when every line is met.
export function Checks({ items }: { items: [boolean, ReactNode][] }) {
  return (
    <ul className="checks">
      {items.map(([ok, text], i) => (
        <li key={i} className={ok ? 'ok' : 'no'}><span className="mk" aria-hidden="true">{ok ? <CheckIcon /> : '✕'}</span><span>{text}</span><span className="sr-only">{ok ? '（已满足）' : '（未满足）'}</span></li>
      ))}
    </ul>
  );
}

const EVENT_NAMES = { arena: '竞技场日', month: '换季补货', annual: '新的一年 · 主线开新章' } as const;

// What the server quoted for an action (PREVIEW_ACTION): days, landing date, risk, dates passed on the
// way and anything that blocks it. Executing re-checks the quote, so a stale one fails instead.
export function QuoteBox({ quote }: { quote: ActionQuote }) {
  const passes = quote.events.filter(e => e.day < quote.toDay);
  return (
    <dl className="facts quote" aria-label="服务器报价">
      <dt>日期</dt>
      <dd>推进 {quote.costDays} 日 → {quote.date.label}{quote.costGold > 0 ? ` · ${quote.costGold} 金币` : ''}</dd>
      {passes.length > 0 && <><dt>途经</dt><dd>{passes.map(e => `${EVENT_NAMES[e.kind] ?? e.kind}（${plainDate(e.day)}）`).join('、')}</dd></>}
      <dt>风险</dt>
      <dd className={quote.risk === 'permadeath' ? 'risk' : undefined}>{quote.risk === 'permadeath' ? '倒下的普通角色永久死亡，主角只撤退' : '模拟战，没有真实伤亡'}</dd>
      {quote.blockers.length > 0 && <><dt>不能出发</dt><dd className="risk">{quote.blockers.join('；')}</dd></>}
    </dl>
  );
}
