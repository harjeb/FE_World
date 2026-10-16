// Pieces shared by 观战 and 回放: who is acting, what they are doing, Agent intent quotes.
import { CLASSES } from '@common/data/classes.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { unitById } from '@common/engine/index.ts';
import type { ActAction, BattleState, Point } from '@common/engine/index.ts';
import { Cursor, MapTag } from '../battle/MapLayers.tsx';
import { displayName } from '../battle/names.ts';
import { HpLine, Portrait, SideTag } from '../battle/UnitCard.tsx';

// One line for a command, e.g. 攻击 灰岩弓兵 · 钢枪.
export function describeAction(state: BattleState, action: ActAction): string {
  const unit = unitById(state, action.unit);
  const moved = unit.pos[0] !== action.to[0] || unit.pos[1] !== action.to[1];
  switch (action.act) {
    case 'attack': return `${moved ? '移动后' : ''}攻击 ${displayName(state, action.target)} · ${WEAPONS[action.weapon].name}`;
    case 'heal': return `${moved ? '移动后' : ''}治疗 ${displayName(state, action.target)} · ${WEAPONS[action.weapon].name}`;
    case 'item': return '使用伤药';
    case 'seize': return '压制王座';
    default: return moved ? `移动到 (${action.to[0]},${action.to[1]})，待机` : '原地待机';
  }
}

export function ActingMark({ view, unit, cell, label }: { view: BattleState; unit: string; cell: number; label: string }) {
  const u = view.units.find(x => x.id === unit);
  if (!u?.alive) return null;
  return (
    <>
      <Cursor at={u.pos} cell={cell} />
      <MapTag at={u.pos} cell={cell} view={view} className="mt-brass" prefer="below">{label} · {displayName(view, unit)}</MapTag>
    </>
  );
}

// The path a unit just walked, as a dotted trail.
export function Trail({ path, cell }: { path: Point[]; cell: number }) {
  if (path.length < 2) return null;
  const points = path.map(([x, y]) => `${(x + 0.5) * cell},${(y + 0.5) * cell}`).join(' ');
  return (
    <svg className="trail" aria-hidden="true">
      <polyline points={points} fill="none" stroke="#2B2421" strokeWidth={cell / 5} strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
      <polyline points={points} fill="none" stroke="#F5EEDF" strokeWidth={cell / 12} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`1 ${cell / 6}`} opacity="0.9" />
    </svg>
  );
}

export function UnitNow({ state, unit, doing }: { state: BattleState; unit: string; doing: string }) {
  const u = unitById(state, unit);
  return (
    <div className="flex items-center gap-3" style={{ padding: '12px 14px' }}>
      <Portrait unit={u} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2" style={{ fontSize: 17, fontWeight: 700 }}>
          {u.name} <span className="tag tag-grey">{CLASSES[u.classId].name} · Lv {u.level}</span> <SideTag unit={u} />
        </div>
        <div style={{ marginTop: 4 }}><HpLine unit={u} /></div>
        <div style={{ fontSize: 13, color: '#4E473D', marginTop: 2 }}>{doing}</div>
      </div>
    </div>
  );
}

export function IntentQuote({ text, meta }: { text: string; meta?: string[] }) {
  return (
    <blockquote className="intent">
      <q>{text}</q>
      {meta && <div className="meta">{meta.map(m => <span key={m}>{m}</span>)}</div>}
    </blockquote>
  );
}
