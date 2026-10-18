import { useState } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import { SPELLBOOK_BY_ID } from '@common/data/spellbooks.ts';
import { spellBlock } from '@common/engine/index.ts';
import { STAT_KEYS, STAT_NAMES, WEAPON_TYPE_NAMES, rankAtLeast } from '@common/data/types.ts';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import type { ItemId, WeaponId } from '@common/data/weapons.ts';
import { DRUG_LIMIT_PER_STAT, DRUG_LIMIT_TOTAL, GAME_ITEMS, spellbookItem } from '@common/game/items.ts';
import type { GameItem, ItemKey } from '@common/game/items.ts';
import { OP } from '@common/protocol/ops.ts';
import { ICONS, weaponIcon } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { BookInstance, ServerUnit } from '../api/session.ts';
import { annualLive } from '../model/roster.ts';
import { toast } from '../ui/toast.tsx';
import { instanceFor, ResourceBar, weaponSpec } from './RosterParts.tsx';
import { stock, UnitFace } from './SystemParts.tsx';

// Carry limits as TRANSFER_ITEM enforces them: weapons, battle items and spellbooks are counted separately.
export const CARRY = 5;

export const itemOf = (key: string): GameItem | undefined => GAME_ITEMS[key as ItemKey];

export function itemIcon(key: string): string {
  const item = itemOf(key);
  if (item?.kind === 'weapon' && item.weapon) return weaponIcon(WEAPONS[item.weapon].type);
  if (item?.kind === 'consumable') return ICONS.vulnerary;
  if (item?.kind === 'stat') return ICONS.elixir;
  if (item?.kind === 'food') return ICONS.herb;
  if (item?.kind === 'material') return ICONS[key as 'herb' | 'ore' | 'wood' | 'seed'] ?? ICONS.seal;
  if (item?.kind === 'spellbook') return weaponIcon(SPELLBOOK_BY_ID.get(item.spell ?? '')?.study === 'whiteMagic' ? 'staff' : 'tome');
  return ICONS.seal;
}

// One line on what the item does, in the backend's own terms (game/items.ts, data/weapons.ts).
export function itemSpec(key: string): string {
  const item = itemOf(key);
  if (!item) return '';
  switch (item.kind) {
    case 'weapon': return item.weapon ? weaponSpec(item.weapon) : '';
    case 'consumable': return item.note ?? (item.item ? `回复 ${ITEMS[item.item].heal} HP · 每件 ${item.uses} 次` : '');
    case 'stat': return `${item.stat ? STAT_NAMES[item.stat] : ''}永久 +${item.amount} · 每人每项最多 ${DRUG_LIMIT_PER_STAT} 次，合计 ${DRUG_LIMIT_TOTAL} 次`;
    case 'seal': return item.note ?? '转职印';
    case 'food': return `${item.note ?? '恢复法术书次数'} · 在角色的书旁使用，不推进日期`;
    case 'material': return item.note ?? '生产材料：在「生产」里播种、炼药或锻造，也可以出售';
    case 'spellbook': return `${item.note ?? ''} · 交给角色后可施法，剩余次数随书走`;
    case 'manual': return item.note ?? '';
  }
}

// Why the selected unit could not cast a spellbook it is given (it can still carry it).
export function cannotCast(unit: ServerUnit, spell: string): string | null {
  const book = SPELLBOOK_BY_ID.get(spell);
  return book ? spellBlock({ classId: unit.classId as never, ranks: unit.ranks, learnedSpells: unit.learnedSpells }, book) : null;
}

// Why a manual could not teach this unit (USE_ITEM refuses the same cases).
export function cannotLearn(unit: ServerUnit, spell: string): string | null {
  const book = SPELLBOOK_BY_ID.get(spell);
  if (!book) return '没有这门法术';
  if (unit.learnedSpells.includes(spell)) return '已经学会';
  const type = book.study === 'whiteMagic' ? 'staff' : 'tome';
  return CLASSES[unit.classId as keyof typeof CLASSES]?.weapons[type] ? null : `${unit.className}没有${type === 'staff' ? '白魔法' : '黑魔法'}权限`;
}

// Why the selected unit could not wield a weapon it is given (it can still carry it).
export function cannotWield(unit: ServerUnit, weapon: WeaponId): string | null {
  const w = WEAPONS[weapon];
  const cap = CLASSES[unit.classId as keyof typeof CLASSES]?.weapons[w.type];
  if (!cap) return `${unit.className}不能用${w.name}`;
  if (!rankAtLeast(unit.ranks[w.type], w.rank)) return `需要 ${w.rank} 级，现在 ${unit.ranks[w.type] ?? 'E'}`;
  const missing = (w.requires ?? []).find(req => !rankAtLeast(unit.ranks[req.type], req.rank));
  return missing ? `另需${WEAPON_TYPE_NAMES[missing.type]} ${missing.rank} 级，现在 ${unit.ranks[missing.type] ?? '无'}` : null;
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

export async function runOp<T>(op: number, data: Record<string, unknown>, done: (result: T) => string): Promise<boolean> {
  try {
    toast(done(await session.run<T>(op, data)));
    return true;
  } catch (e) {
    toast(`操作失败：${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export function UnitPicker({ units, selected, onPick }: { units: ServerUnit[]; selected: ServerUnit | undefined; onPick: (id: string) => void }) {
  return (
    <section className="panel" aria-labelledby="gu-h">
      <div className="ph"><h2 id="gu-h">选择角色</h2><span style={{ fontSize: 12, color: '#6A6256' }}>仓库里的按钮作用在选中的角色上</span></div>
      <div className="gear-units" role="radiogroup" aria-label="选择角色">
        {units.map(u => {
          const worn = u.weaponInstances.some(w => w.durability < w.maxDurability) || [...u.bookInstances, ...u.spellbooks].some(b => b.charges < b.maxCharges);
          return (
            <button key={u.id} type="button" role="radio" aria-checked={u.id === selected?.id} className="gu" onClick={() => onPick(u.id)}>
              <UnitFace unit={u} size={40} />
              <span className="n">{u.name}{worn && <i className="gu-dot" title="有装备需要维修或补充次数" />}</span>
              <span className="l">{u.className} · Lv {u.level}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// 维修费用与旅馆价格（handlers.ts REPAIR_ITEM / INN_REST 同一公式，服务端以执行时为准）。
const repairCost = (max: number) => 100 + max * 5;
const staffRefill = (missing: number) => 150 + missing * 20;
const innCost = (unit: ServerUnit) => 200 + unit.level * 10;

// 旅馆／食物不能在战斗、远征或年度赛事期间使用（服务端会拒绝）。
function upkeepBlock(): string | null {
  const { today, run, annual } = session.get();
  if (today?.battle) return '战斗进行中';
  if (run && (run.state === 'battle' || run.state === 'between_maps')) return '远征进行中';
  if (annualLive(annual)) return '大竞技场进行中';
  return null;
}

function BookActions({ unit, id, book, spellbook }: { unit: ServerUnit; id: string; book: BookInstance; spellbook: boolean }) {
  const { state } = useSession();
  const full = book.charges >= book.maxCharges;
  const blocked = upkeepBlock();
  const foods = (['ether_ration', 'full_meal'] as const).filter(f => stock(state, f) > 0);
  const name = spellbook ? SPELLBOOK_BY_ID.get(id)?.name ?? id : WEAPONS[id as WeaponId]?.name ?? id;
  if (full) return <span className="tag tag-green">次数已满</span>;
  return (
    <span className="acts">
      <button type="button" className="btn btn-sm" disabled={!!blocked || (state?.gold ?? 0) < innCost(unit)} title={blocked ?? `旅馆休息 1 日，补满次数，${innCost(unit)} 金币`}
        onClick={() => void runOp<{ charges: [number, number] }>(OP.INN_REST, { unitId: unit.id, book: id, spellbook }, r => `旅馆休息 1 日：${name}恢复到 ${r.charges[0]} / ${r.charges[1]}`)}>
        旅馆 {innCost(unit)} 金 · 1 日
      </button>
      {foods.map(food => (
        <button key={food} type="button" className="btn btn-sm btn-ghost" disabled={!!blocked} title={blocked ?? itemSpec(food)}
          onClick={() => void runOp<{ restored: number; charges: [number, number] }>(OP.USE_FOOD, { unitId: unit.id, book: id, item: food, spellbook }, r => `${GAME_ITEMS[food].name}：${name}恢复 ${r.restored} 次（${r.charges[0]} / ${r.charges[1]}）`)}>
          {GAME_ITEMS[food].name}（{stock(state, food)}）
        </button>
      ))}
    </span>
  );
}

export function CarriedPanel({ unit }: { unit: ServerUnit }) {
  const { state } = useSession();
  const weapons = unit.snapshot.weapons as WeaponId[];
  const items = unit.snapshot.items;
  const [busy, setBusy] = useState<string | null>(null);
  const gold = state?.gold ?? 0;
  const move = (item: string, action: 'equip' | 'toWarehouse', done: string) =>
    runOp(OP.TRANSFER_ITEM, { unitId: unit.id, item, action }, () => done);
  const repair = async (id: WeaponId, cost: number) => {
    setBusy(id);
    await runOp<{ repaired: number; gold: number }>(OP.REPAIR_ITEM, { unitId: unit.id, item: id }, r => `${WEAPONS[id].name}已修好${r.repaired > 1 ? `（${r.repaired} 件）` : ''}，金币 −${cost}`);
    setBusy(null);
  };
  return (
    <section className="panel" aria-labelledby="carry-h">
      <div className="ph">
        <h2 id="carry-h">{unit.name}的携带</h2>
        <span style={{ fontSize: 12, color: '#6A6256' }}>武器 {weapons.length} / {CARRY} · 道具 {items.length} / {CARRY}</span>
      </div>
      <div className="grp">武器（第一把是装备中的）· 物理武器的战技消耗耐久，魔道书与杖每次使用消耗次数</div>
      <ul className="eq">
        {weapons.map((id, i) => {
          const res = instanceFor(unit, weapons, i);
          const staff = WEAPONS[id].type === 'staff';
          const damaged = res && res.now < res.max;
          const cost = res ? (staff ? staffRefill(res.max - res.now) : repairCost(res.max)) : 0;
          const book = res?.kind === 'charges' ? unit.bookInstances.filter(b => b.id === id)[weapons.slice(0, i).filter(w => w === id).length] : null;
          return (
            <li key={`${id}${i}`}>
              <img className="px" src={weaponIcon(WEAPONS[id].type)} width={32} height={32} alt="" />
              <div className="min-w-0">
                <div className="nm">{WEAPONS[id].name}{i === 0 && <span className="tag tag-blue">✓ 装备中</span>}</div>
                <div className="sp">{weaponSpec(id)}</div>
                {res && <ResourceBar {...res} />}
                {book && WEAPONS[id].type === 'tome' && <BookActions unit={unit} id={id} book={book} spellbook={false} />}
              </div>
              <span className="acts">
                {damaged && (res.kind === 'durability' || staff) && (
                  <button type="button" className="btn btn-sm" disabled={busy !== null || gold < cost} title={staff ? `补满杖的次数：${cost} 金币` : `修到 ${res.max} / ${res.max}：${cost} 金币`}
                    onClick={() => void repair(id, cost)}>{busy === id ? '维修中…' : `${staff ? '补充' : '维修'} ${cost} 金`}</button>
                )}
                {i > 0 && <button type="button" className="btn btn-sm" onClick={() => void move(id, 'equip', `${unit.name}装备了${WEAPONS[id].name}`)}>装备</button>}
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => void move(id, 'toWarehouse', `${WEAPONS[id].name}放回了仓库`)}>放回仓库</button>
              </span>
            </li>
          );
        })}
        {weapons.length === 0 && <li className="empty-row">没有携带武器</li>}
      </ul>
      <div className="grp">道具</div>
      <ul className="eq">
        {items.map((stack, i) => (
          <li key={`${stack.id}${i}`}>
            <img className="px" src={ICONS.vulnerary} width={32} height={32} alt="" />
            <div className="min-w-0"><div className="nm">{ITEMS[stack.id as ItemId]?.name ?? stack.id}</div><div className="sp">{stack.id === 'immortal_shield' ? '致命时自动消耗，保留 1 HP 并石化；每人最多 1 枚' : `剩 ${stack.uses} / ${ITEMS[stack.id as ItemId]?.uses ?? stack.uses} 次`}</div></div>
            <span className="acts"><button type="button" className="btn btn-sm btn-ghost" onClick={() => void move(stack.id, 'toWarehouse', `${ITEMS[stack.id as ItemId]?.name ?? stack.id}放回了仓库，剩 ${stack.uses} 次`)}>放回仓库</button></span>
          </li>
        ))}
        {items.length === 0 && <li className="empty-row">没有携带道具</li>}
      </ul>
      {unit.spellbooks.length > 0 && <>
        <div className="grp">法术书 {unit.spellbooks.length} / {CARRY} · 每本独立次数，旅馆补满或用食物恢复；放回仓库时剩余次数随书走</div>
        <ul className="eq">
          {unit.spellbooks.map(book => {
            const def = SPELLBOOK_BY_ID.get(book.id);
            const blocked = cannotCast(unit, book.id);
            return (
              <li key={book.id}>
                <img className="px" src={weaponIcon(def?.study === 'whiteMagic' ? 'staff' : 'tome')} width={32} height={32} alt="" />
                <div className="min-w-0">
                  <div className="nm">{def?.name ?? book.id}{def && <span className="tag tag-grey">{def.study === 'whiteMagic' ? '白' : '黑'} {def.rank}</span>}</div>
                  <div className="sp">{def?.effect}</div>
                  {blocked && <div className="why">现在不能施放：{blocked}</div>}
                  <ResourceBar now={book.charges} max={book.maxCharges} kind="charges" />
                  <BookActions unit={unit} id={book.id} book={book} spellbook />
                </div>
                <span className="acts">
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => void move(spellbookItem(book.id), 'toWarehouse', `${def?.name ?? book.id}放回了仓库，剩 ${book.charges} 次`)}>放回仓库</button>
                </span>
              </li>
            );
          })}
        </ul>
      </>}
      {upkeepBlock() && <p className="pfoot">{upkeepBlock()}：旅馆和食物暂时不能用，维修仍可进行。</p>}
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
