import { useEffect, useState } from 'react';
import { STAT_NAMES } from '@common/data/types.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ShopRow } from '../api/session.ts';
import { filterCounts, ITEM_FILTERS, kindOrder, matchItemFilter } from '../model/item-filter.ts';
import type { ItemFilter } from '../model/item-filter.ts';
import { go, links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { BexpPanel, CARRY, CarriedPanel, cannotCast, cannotLearn, cannotWield, drugBlock, DrugPanel, itemIcon, itemOf, itemSpec, runOp, UnitPicker } from './PrepParts.tsx';

const half = (key: string) => Math.floor((itemOf(key)?.price ?? 0) / 2);

// 整备 (docs/00 §9: 整理、买卖、装备、维修、分配公共经验都不耗日；旅馆休息耗 1 日). Warehouse and shop on
// the left; on the right, the character the warehouse buttons act on. Every change is a server op
// (TRANSFER_ITEM, USE_ITEM, BUY, SELL, REPAIR_ITEM, INN_REST, USE_FOOD, ASSIGN_BEXP) followed by a refresh.
export function PrepPage({ unit: wanted }: { unit: string | null }) {
  const { state } = useSession();
  const [filter, setFilter] = useState<ItemFilter>('all');
  const [shop, setShop] = useState<ShopRow[] | null>(null);
  const loadShop = () => session.shop().then(setShop).catch(() => setShop([]));
  useEffect(() => { void loadShop(); }, []);

  // 派遣中的角色不能搬运物品或使用道具（服务端拒绝），所以不列在这里。
  const active = state?.units.filter(u => u.status === 'active' && !u.lockedDispatchId) ?? [];
  const unit = active.find(u => u.id === wanted) ?? active.find(u => u.character === wanted) ?? active[0];
  const gold = state?.gold ?? 0;
  const day = state?.day ?? 0;
  const nextSeason = state?.nextMonthStart ?? day;
  // 分类过滤共用 helper（model/item-filter.ts）：武器按十类细分，计数覆盖仓库与商店。
  const allKeys = [...(state?.inventory ?? []).map(r => r.item), ...(shop ?? []).map(r => r.item)];
  const counts = filterCounts(allKeys);
  const stock = (state?.inventory ?? []).filter(r => matchItemFilter(r.item, filter)).sort((a, b) => kindOrder(a.item) - kindOrder(b.item) || b.uses - a.uses);
  const wares = (shop ?? []).filter(r => matchItemFilter(r.item, filter)).sort((a, b) => kindOrder(a.item) - kindOrder(b.item) || a.price - b.price);

  function warehouseActions(key: string, uses: number, count: number) {
    const item = itemOf(key);
    const sell = (n: number) => runOp<{ gained: number; count: number }>(OP.SELL, { item: key, count: n, ...((item?.kind === 'consumable' || item?.kind === 'spellbook') ? { uses } : {}) }, r => `卖出 ${item?.name ?? key} ×${r.count}，金币 +${r.gained}`);
    const acts = [];
    if (unit && item?.kind === 'weapon') {
      const full = unit.snapshot.weapons.length >= CARRY;
      acts.push(<button key="give" type="button" className="btn btn-sm" disabled={full} title={full ? '武器栏已满' : undefined}
        onClick={() => void runOp(OP.TRANSFER_ITEM, { unitId: unit.id, item: key, action: 'toUnit' }, () => `${item.name}交给了${unit.name}`)}>交给{unit.name}</button>);
    }
    if (unit && item?.kind === 'consumable') {
      const full = unit.snapshot.items.length >= CARRY;
      acts.push(<button key="give" type="button" className="btn btn-sm" disabled={full} title={full ? '道具栏已满' : undefined}
        onClick={() => void runOp(OP.TRANSFER_ITEM, { unitId: unit.id, item: key, action: 'toUnit', uses }, () => `${item.name}（${uses} 次）交给了${unit.name}`)}>交给{unit.name}</button>);
    }
    if (unit && item?.kind === 'spellbook' && item.spell) {
      const carried = unit.spellbooks.some(book => book.id === item.spell);
      const full = unit.spellbooks.length >= CARRY;
      acts.push(<button key="give" type="button" className="btn btn-sm" disabled={full || carried} title={carried ? '已经携带同一种书' : full ? '法术书栏已满' : undefined}
        onClick={() => void runOp(OP.TRANSFER_ITEM, { unitId: unit.id, item: key, action: 'toUnit', uses }, () => `${item.name}（${uses} 次）交给了${unit.name}`)}>交给{unit.name}</button>);
    }
    if (unit && item?.kind === 'manual' && item.spell) {
      const blocked = cannotLearn(unit, item.spell);
      acts.push(<button key="learn" type="button" className="btn btn-sm" disabled={!!blocked} title={blocked ?? undefined}
        onClick={() => void runOp(OP.USE_ITEM, { unitId: unit.id, item: key }, () => `${unit.name}学会了${item.name.replace('教材', '')}`)}>{unit.name}学习</button>);
    }
    if (unit && item?.kind === 'stat') {
      const blocked = drugBlock(unit, key);
      acts.push(<button key="use" type="button" className="btn btn-sm" disabled={!!blocked} title={blocked ?? undefined}
        onClick={() => void runOp<{ stat: keyof typeof STAT_NAMES; amount: number }>(OP.USE_ITEM, { unitId: unit.id, item: key }, r => `${unit.name}的${STAT_NAMES[r.stat]} +${r.amount}`)}>{unit.name}使用</button>);
    }
    // 任务物品不卖、不用，只在仓库里留着；唯一武器保留灰掉的出售按钮说明原因。
    if (item?.kind === 'key') return acts;
    const bound = item?.bound === true;
    acts.push(<button key="sell" type="button" className="btn btn-sm btn-ghost" disabled={bound} title={bound ? '唯一武器已绑定，不能出售' : undefined} onClick={() => void sell(1)}>卖 +{half(key)}</button>);
    if (item?.kind === 'material' && count > 1) {
      acts.push(<button key="sellAll" type="button" className="btn btn-sm btn-ghost" onClick={() => void sell(count)}>全卖 +{half(key) * count}</button>);
    }
    return acts;
  }

  return (
    <Shell current="prep">
      <div className="brief-head">
        <div>
          <div className="eyebrow">整备 · {dateLabel(day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>仓库与商店</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>整理、买卖、装备、维修和分配公共经验都不推进日期；旅馆休息推进 1 日。</p>
        </div>
        <div style={{ fontSize: 13, color: '#4E473D', textAlign: 'right' }}>
          金币 <b className="num">{gold.toLocaleString()}</b> · 商店在{plainDate(nextSeason)}补货（{nextSeason - day} 日后）
        </div>
      </div>

      <UnitPicker units={active} selected={unit} onPick={id => go(links.prep(id))} />

      <div className="chips" role="group" aria-label="物品分类">
        {ITEM_FILTERS.map(([f, label]) => (
          <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {label}{counts[f] ? <span className="cnt"> {counts[f]}</span> : null}
          </button>
        ))}
      </div>

      <div className="gear-cols">
        <div className="colstack">
          <section className="panel" aria-labelledby="wh-h">
            <div className="ph"><h2 id="wh-h">仓库</h2><span style={{ fontSize: 12, color: '#6A6256' }}>出售价为商店价的一半</span></div>
            <ul className="eq gear-list">
              {stock.map(r => {
                const item = itemOf(r.item);
                const wield = unit && item?.kind === 'weapon' && item.weapon ? cannotWield(unit, item.weapon as WeaponId)
                  : unit && item?.kind === 'spellbook' && item.spell ? cannotCast(unit, item.spell) : null;
                const perfect = state?.perfectWeapons[r.item] ?? 0;
                return (
                  <li key={`${r.item}:${r.uses}`}>
                    <img className="px" src={itemIcon(r.item)} width={32} height={32} alt="" />
                    <div className="min-w-0">
                      <div className="nm">{r.name} <span className="cnt">×{r.count}</span>{(item?.kind === 'consumable' || item?.kind === 'spellbook') && <span className="tag tag-grey">剩 {r.uses}{item.kind === 'spellbook' ? ` / ${item.uses}` : ''} 次</span>}{item?.kind === 'key' ? <span className="tag tag-brass" title="任务物品：不能出售，也不能带进战斗">任务</span> : item?.bound && <span className="tag tag-red" title="唯一武器已绑定，不能出售">绑定</span>}{perfect > 0 && <span className="tag tag-brass" title="交给角色时消耗一张，生成耐久 +10 的实例">完美锻造 ×{perfect}</span>}</div>
                      <div className="sp">{itemSpec(r.item)}</div>
                      {wield && <div className="why">{unit!.name}现在用不了：{wield}（仍可携带）</div>}
                    </div>
                    <span className="acts">{warehouseActions(r.item, r.uses, r.count)}</span>
                  </li>
                );
              })}
              {stock.length === 0 && <li className="empty-row">仓库里没有这类物品</li>}
            </ul>
          </section>

          <section className="panel" aria-labelledby="shop-h">
            <div className="ph"><h2 id="shop-h">商店</h2><span style={{ fontSize: 12, color: '#6A6256' }}>本季库存，每季第 1 日补货{wares.some(r => (r.discount ?? 0) > 0) ? ' · 庆典期间整店打折（每件 50%～65%）' : ''}</span></div>
            <ul className="eq gear-list gear-shop">
              {wares.map(r => (
                <li key={r.item}>
                  <img className="px" src={itemIcon(r.item)} width={32} height={32} alt="" />
                  <div className="min-w-0">
                    <div className="nm">{r.name} <span className="cnt">{r.price.toLocaleString()} 金</span>
                      {(r.discount ?? 0) > 0 && <><s className="cnt" style={{ marginLeft: 6 }}>{(r.basePrice ?? r.price).toLocaleString()}</s><span className="tag tag-red" title="庆典期间王都商店打折">庆典 −{r.discount}%</span></>}</div>
                    <div className="sp">{itemSpec(r.item)}</div>
                  </div>
                  <span className="acts">
                    <span className="stock">{r.stock > 0 ? `剩 ${r.stock}` : '售罄'}</span>
                    <button type="button" className="btn btn-sm" disabled={r.stock <= 0 || gold < r.price} title={gold < r.price ? '金币不足' : undefined}
                      onClick={() => void runOp<{ price: number }>(OP.BUY, { item: r.item, count: 1 }, b => `买下${r.name}，金币 −${b.price}`).then(loadShop)}>买</button>
                  </span>
                </li>
              ))}
              {shop !== null && wares.length === 0 && <li className="empty-row">商店里没有这类物品</li>}
              {shop === null && <li className="empty-row">读取商店…</li>}
            </ul>
          </section>
        </div>

        <div className="colstack">
          {unit && <CarriedPanel unit={unit} />}
          {unit && <DrugPanel unit={unit} />}
          {unit && <BexpPanel key={unit.id} unit={unit} bexp={state?.bexp ?? 0} />}
        </div>
      </div>
    </Shell>
  );
}
