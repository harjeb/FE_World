import { useState } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import { STAT_KEYS, STAT_NAMES, rankAtLeast } from '@common/data/types.ts';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import type { ItemId, WeaponId } from '@common/data/weapons.ts';
import { DRUG_LIMIT_PER_STAT, DRUG_LIMIT_TOTAL, GAME_ITEMS } from '@common/game/items.ts';
import type { GameItem, ItemKey } from '@common/game/items.ts';
import { OP } from '@common/protocol/ops.ts';
import { ICONS, portraitFor, spriteFor, weaponIcon } from '../assets.ts';
import { session } from '../api/session.ts';
import type { ServerUnit } from '../api/session.ts';
import { toast } from '../ui/toast.tsx';
import { weaponSpec } from './RosterParts.tsx';

// Carry limits as TRANSFER_ITEM enforces them: weapons and battle items are counted separately.
export const CARRY = 5;

export const itemOf = (key: string): GameItem | undefined => GAME_ITEMS[key as ItemKey];

export function itemIcon(key: string): string {
  const item = itemOf(key);
  if (item?.kind === 'weapon' && item.weapon) return weaponIcon(WEAPONS[item.weapon].type);
  if (item?.kind === 'consumable') return ICONS.vulnerary;
  if (item?.kind === 'stat') return ICONS.elixir;
  if (item?.kind === 'material') return ICONS[key as 'herb' | 'ore' | 'wood' | 'seed'] ?? ICONS.seal;
  return ICONS.seal;
}

// One line on what the item does, in the backend's own terms (game/items.ts, data/weapons.ts).
export function itemSpec(key: string): string {
  const item = itemOf(key);
  if (!item) return '';
  switch (item.kind) {
    case 'weapon': return item.weapon ? weaponSpec(item.weapon) : '';
    case 'consumable': return item.item ? `回复 ${ITEMS[item.item].heal} HP · 每件 ${item.uses} 次` : '';
    case 'stat': return `${item.stat ? STAT_NAMES[item.stat] : ''}永久 +${item.amount} · 每人每项最多 ${DRUG_LIMIT_PER_STAT} 次，合计 ${DRUG_LIMIT_TOTAL} 次`;
    case 'seal': return '目前转职不消耗转职印（解锁规则待定）';
    case 'material': return item.note ?? '生产材料：在「生产」里播种、炼药或锻造，也可以出售';
  }
}

// Why the selected unit could not wield a weapon it is given (it can still carry it).
export function cannotWield(unit: ServerUnit, weapon: WeaponId): string | null {
  const w = WEAPONS[weapon];
  const cap = CLASSES[unit.classId as keyof typeof CLASSES]?.weapons[w.type];
  if (!cap) return `${unit.className}不能用${w.name}`;
  return rankAtLeast(unit.snapshot.ranks[w.type], w.rank) ? null : `需要 ${w.rank} 级，现在 ${unit.snapshot.ranks[w.type] ?? 'E'}`;
}

// Why a 能力药 would be refused for this unit (game/model.ts::useDrug), or null if it can be used.
export function drugBlock(unit: ServerUnit, key: string): string | null {
  const item = itemOf(key);
  if (item?.kind !== 'stat' || !item.stat) return null;
  const counts = unit.drugCounts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  if ((counts[item.stat] ?? 0) >= DRUG_LIMIT_PER_STAT) return `${STAT_NAMES[item.stat]}已用满 ${DRUG_LIMIT_PER_STAT} 次`;
  if (total >= DRUG_LIMIT_TOTAL) return `合计已用满 ${DRUG_LIMIT_TOTAL} 次`;
  const cap = CLASSES[unit.classId as keyof typeof CLASSES]?.caps[item.stat];
  if (cap !== undefined && unit.snapshot.stats[item.stat] >= cap) return `${STAT_NAMES[item.stat]}已到上限`;
  return null;
}

export async function runOp<T>(op: number, data: Record<string, unknown>, done: (result: T) => string): Promise<void> {
  try {
    toast(done(await session.run<T>(op, data)));
  } catch (e) {
    toast(`操作失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

export function UnitPicker({ units, selected, onPick }: { units: ServerUnit[]; selected: ServerUnit | undefined; onPick: (id: string) => void }) {
  return (
    <section className="panel" aria-labelledby="gu-h">
      <div className="ph"><h2 id="gu-h">选择角色</h2><span style={{ fontSize: 12, color: '#6A6256' }}>仓库里的按钮作用在选中的角色上</span></div>
      <div className="gear-units" role="radiogroup" aria-label="选择角色">
        {units.map(u => {
          const looks = { classId: u.snapshot.classId, side: 'player' as const, character: u.character };
          return (
            <button key={u.id} type="button" role="radio" aria-checked={u.id === selected?.id} className="gu" onClick={() => onPick(u.id)}>
              <span className="pf ally" style={{ width: 40, height: 40 }}><img className="px" src={portraitFor(looks) ?? spriteFor(looks)} width={48} height={48} alt="" /></span>
              <span className="n">{u.name}</span>
              <span className="l">{u.className} · Lv {u.level}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CarriedPanel({ unit }: { unit: ServerUnit }) {
  const weapons = unit.snapshot.weapons as WeaponId[];
  const items = unit.snapshot.items;
  const move = (item: string, action: 'equip' | 'toWarehouse', done: string) =>
    runOp(OP.TRANSFER_ITEM, { unitId: unit.id, item, action }, () => done);
  return (
    <section className="panel" aria-labelledby="carry-h">
      <div className="ph">
        <h2 id="carry-h">{unit.name}的携带</h2>
        <span style={{ fontSize: 12, color: '#6A6256' }}>武器 {weapons.length} / {CARRY} · 道具 {items.length} / {CARRY}</span>
      </div>
      <div className="grp">武器（第一把是装备中的）</div>
      <ul className="eq">
        {weapons.map((id, i) => (
          <li key={`${id}${i}`}>
            <img className="px" src={weaponIcon(WEAPONS[id].type)} width={32} height={32} alt="" />
            <div className="min-w-0"><div className="nm">{WEAPONS[id].name}{i === 0 && <span className="tag tag-blue">✓ 装备中</span>}</div><div className="sp">{weaponSpec(id)}</div></div>
            <span className="acts">
              {i > 0 && <button type="button" className="btn btn-sm" onClick={() => void move(id, 'equip', `${unit.name}装备了${WEAPONS[id].name}`)}>装备</button>}
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => void move(id, 'toWarehouse', `${WEAPONS[id].name}放回了仓库`)}>放回仓库</button>
            </span>
          </li>
        ))}
        {weapons.length === 0 && <li className="empty-row">没有携带武器</li>}
      </ul>
      <div className="grp">道具</div>
      <ul className="eq">
        {items.map((stack, i) => (
          <li key={`${stack.id}${i}`}>
            <img className="px" src={ICONS.vulnerary} width={32} height={32} alt="" />
            <div className="min-w-0"><div className="nm">{ITEMS[stack.id as ItemId]?.name ?? stack.id}</div><div className="sp">剩 {stack.uses} / {ITEMS[stack.id as ItemId]?.uses ?? stack.uses} 次</div></div>
            <span className="acts"><button type="button" className="btn btn-sm btn-ghost" onClick={() => void move(stack.id, 'toWarehouse', `${ITEMS[stack.id as ItemId]?.name ?? stack.id}放回了仓库，剩 ${stack.uses} 次`)}>放回仓库</button></span>
          </li>
        ))}
        {items.length === 0 && <li className="empty-row">没有携带道具</li>}
      </ul>
    </section>
  );
}

export function DrugPanel({ unit }: { unit: ServerUnit }) {
  const counts = unit.drugCounts ?? {};
  const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <section className="panel" aria-labelledby="drug-h">
      <div className="ph"><h2 id="drug-h">能力药额度</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{unit.name} · 合计 {total} / {DRUG_LIMIT_TOTAL}</span></div>
      <div className="drugs">
        {STAT_KEYS.map(k => (
          <div key={k} className={(counts[k] ?? 0) >= DRUG_LIMIT_PER_STAT ? 'full' : undefined}>
            <span>{STAT_NAMES[k]}</span><b className="num">{counts[k] ?? 0} / {DRUG_LIMIT_PER_STAT}</b>
          </div>
        ))}
      </div>
      <p className="pfoot">每项最多 {DRUG_LIMIT_PER_STAT} 次、合计 {DRUG_LIMIT_TOTAL} 次，不会超过属性上限；用不了时道具不扣。</p>
    </section>
  );
}

export function BexpPanel({ unit, bexp }: { unit: ServerUnit; bexp: number }) {
  const [amount, setAmount] = useState(100);
  const max = CLASSES[unit.classId as keyof typeof CLASSES]?.maxLevel ?? 99;
  const spend = Math.max(1, Math.min(bexp, amount));
  const reach = Math.min(max, unit.level + Math.floor((unit.exp + spend) / 100));
  const capped = unit.level >= max;
  return (
    <section className="panel" aria-labelledby="bexp-h">
      <div className="ph"><h2 id="bexp-h">公共经验</h2><span style={{ fontSize: 12, color: '#6A6256' }}>库存 <b className="num">{bexp}</b></span></div>
      <div className="a-opts" style={{ padding: '10px 14px 0' }}>
        <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>
          分给{unit.name}
          <input type="number" aria-label="分配的公共经验" min={1} max={Math.max(1, bexp)} value={amount}
            onChange={e => setAmount(Math.max(1, Math.floor(Number(e.target.value)) || 1))} />
        </label>
        <span className="cost">Lv {unit.level} · 经验 {unit.exp} / 100 → {capped ? '已满级' : `Lv ${reach}`}</span>
      </div>
      <div className="flex items-center justify-between gap-2" style={{ padding: '10px 14px 12px' }}>
        <span style={{ fontSize: 12, color: '#6A6256' }}>每 100 经验升 1 级，升级的成长照常随机；不推进日期。</span>
        <button type="button" className="btn btn-sm btn-primary" disabled={bexp <= 0 || capped}
          onClick={() => void runOp<{ level: number; levelUps: unknown[] }>(OP.ASSIGN_BEXP, { unitId: unit.id, amount: spend },
            r => (r.levelUps.length > 0 ? `${unit.name}升到 Lv ${r.level}（升了 ${r.levelUps.length} 级）` : `${unit.name}获得 ${spend} 经验`))}>分配</button>
      </div>
    </section>
  );
}
