import { useState } from 'react';
import { MATERIAL_IDS, MATERIALS } from '@common/game/materials.ts';
import { MATERIAL_CATEGORY_NAMES, matchMaterialFilter, matchRecipeSearch, materialSourceLabel } from '../model/item-filter.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { OP } from '@common/protocol/ops.ts';
import { ICONS } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { ProductionOrder, ServerProduction } from '../api/session.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { advance, dateLabel, plainDate } from '../ui/calendar.ts';
import { itemIcon } from './PrepParts.tsx';
import { itemName, stock, useAct } from './SystemParts.tsx';

type Recipe = ServerProduction['recipes'][number];
type Facility = ServerProduction['facilities'][number];
// 完美锻造：额外 1,500 金币，产出的武器第一次交给角色时耐久 +10（handlers.ts START_PRODUCTION）。
const PERFECT_GOLD = 1_500;

// 生产 (docs/00 §9.2): 种子→药草→伤药，矿石＋木材→铁匠铺→武器. Orders ripen on the personal calendar;
// collecting never moves the date. Planting spends a day, brewing and forging only hold a slot.
export function WorkshopPage() {
  const { production, state, today } = useSession();
  const { busy, act } = useAct();
  const [category, setCategory] = useState('all');
  const [tier, setTier] = useState('all');
  const [query, setQuery] = useState('');
  const [recipeFilter, setRecipeFilter] = useState('all');
  const [perfect, setPerfect] = useState<Record<string, boolean>>({});
  if (!production || !state) {
    return <Shell current="workshop"><p style={{ color: '#4E473D' }}>暂时读不到生产信息，刷新页面再试。</p></Shell>;
  }
  const day = state.day;
  const regions = state.regions;
  const have = (item: string) => stock(state, item);
  const visibleMaterials = MATERIAL_IDS.filter(id => matchMaterialFilter(id, category, tier));
  const visibleRecipes = production.recipes.filter(r => matchRecipeSearch(r, query)
    && (recipeFilter !== 'unlocked' || r.unlocked)
    && (recipeFilter !== 'stocked' || (r.unlocked && r.input.every(i => have(i.item) >= i.count))));
  const ripe = production.orders.filter(o => o.state === 'ready');
  const growing = production.orders.filter(o => o.state === 'growing').sort((a, b) => a.readyDay - b.readyDay);

  // Plain render helpers, not components: defining components inside the page would remount them on every refresh.
  function orderRow(order: ProductionOrder) {
    const span = Math.max(1, order.readyDay - order.startedDay);
    const left = Math.max(0, order.readyDay - day);
    const recipe = production!.recipes.find(r => r.id === order.recipeId);
    return (
      <li key={order.id} className={`order ${order.state}`}>
        <img className="px" src={itemIcon(recipe?.output.item ?? '')} width={32} height={32} alt="" />
        <div className="min-w-0">
          <div className="nm">{order.recipe} <span className="muted">→ {order.output}</span>{order.quality === 'perfect' && <span className="tag tag-brass">完美锻造</span>}</div>
          {order.state === 'ready'
            ? <div className="sp">已成熟，领取不推进日期</div>
            : <div className="sp ord-prog"><span className="bar grow"><i style={{ width: `${((span - left) / span) * 100}%` }} /></span>还要 {left} 日 · {plainDate(order.readyDay)}</div>}
        </div>
        {order.state === 'ready'
          ? <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null}
            onClick={() => void act(order.id, () => session.run<{ item: string; count: number }>(OP.COLLECT_PRODUCTION, { orderId: order.id }), r => `领取了${itemName(r.item)} ×${r.count}`)}>
            {busy === order.id ? '领取中…' : '领取'}
          </button>
          : <span className="tag tag-grey">生长中</span>}
      </li>
    );
  }

  function recipeRow(recipe: Recipe, facility: Facility) {
    const full = facility.used >= facility.slots;
    const missing = recipe.input.filter(i => have(i.item) < i.count);
    const plant = recipe.kind === 'grow';
    const req = recipe.requires;
    const lockWhy = !recipe.unlocked && req
      ? `需要 ${regions.find(r => r.id === req.region)?.name ?? `地区${req.region}`} 声望 ${req.reputation}`
      : null;
    const forge = recipe.kind === 'forge' && WEAPONS[recipe.output.item as WeaponId] !== undefined;
    const fine = forge && !!perfect[recipe.id];
    const why = lockWhy ?? (full ? `${facility.name}工位已满` : missing.length > 0 ? `缺少${missing.map(i => itemName(i.item)).join('、')}`
      : fine && state!.gold < PERFECT_GOLD ? `完美锻造需要 ${PERFECT_GOLD.toLocaleString()} 金币` : null);
    const run = plant
      ? () => session.run<{ day: number }>(OP.PLANT, { recipeId: recipe.id })
      : () => session.run(OP.START_PRODUCTION, { recipeId: recipe.id, ...(fine ? { perfect: true } : {}) });
    return (
      <li key={recipe.id} className="recipe">
        <img className="px" src={itemIcon(recipe.output.item)} width={32} height={32} alt="" />
        <div className="min-w-0">
          <div className="nm">{recipe.name} <span className="muted">→ {itemName(recipe.output.item)} ×{recipe.output.count}</span></div>
          <div className="sp">
            {recipe.input.map(i => (
              <span key={i.item} className={have(i.item) < i.count ? 'short' : undefined}>{itemName(i.item)} ×{i.count}（有 {have(i.item)}）{have(i.item) < i.count && materialSourceLabel(i.item) && <span> · 来源：{materialSourceLabel(i.item)}</span>}</span>
            ))}
            <span>{recipe.days} 日成熟</span>
            {plant && <span className="cost"><img className="px" src={ICONS.hourglass} width={12} height={12} alt="" />播种 1 日 → {advance(day, 1).label}</span>}
          </div>
          {forge && (
            <label className="perfect">
              <input type="checkbox" checked={fine} onChange={e => setPerfect(p => ({ ...p, [recipe.id]: e.target.checked }))} />
              完美锻造 +{PERFECT_GOLD.toLocaleString()} 金：第一次交给角色时耐久 +10（如 40 → 50），维修回到新的上限
            </label>
          )}
          {why && <div className="why">{why}</div>}
        </div>
        <button type="button" className="btn btn-sm" disabled={busy !== null || !!why}
          onClick={() => void act(recipe.id, run, () => (plant ? `播下种子，${recipe.days} 日后收获${itemName(recipe.output.item)}` : `${facility.name}开工：${recipe.name}${fine ? '（完美锻造）' : ''}`))}>
          {busy === recipe.id ? '开工中…' : !recipe.unlocked ? '未解锁' : plant ? '播种' : '开工'}
        </button>
      </li>
    );
  }

  return (
    <Shell current="workshop">
      <div className="brief-head">
        <div>
          <div className="eyebrow">生产 · {dateLabel(day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>药草田与工坊</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>订单按个人日历的行动日成熟，成熟后领取不推进日期。播种要花 1 日；炼药和锻造开工不耗日，只占用工位。</p>
        </div>
        <div className="mats" aria-label="仓库材料">
          <span className="mat"><img className="px" src={ICONS.seed} width={24} height={24} alt="" />{itemName('seed')} <b className="num">{have('seed')}</b></span>
          <a className="btn btn-sm btn-ghost" href={links.prep()}>去整备买材料 ›</a>
        </div>
      </div>

      {(ripe.length > 0 || growing.length > 0) && (
        <p className="sys-strip" role="status">
          {ripe.length > 0 ? `${ripe.length} 件已成熟待领取。` : ''}
          {growing.length > 0 ? `下一件在${plainDate(growing[0].readyDay)}成熟（${growing[0].readyDay - day} 日后）；成熟靠推进日期，例如在军营休整。` : ''}
        </p>
      )}

      <details className="panel workshop-materials">
        <summary>材料仓库 · {MATERIAL_IDS.length} 种材料（展开查看持有数量、来源与配方）</summary>
        <div className="workshop-filters">
          <label>材料类别 <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="all">全部类别</option>
            {Object.entries(MATERIAL_CATEGORY_NAMES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          <label>材料阶级 <select value={tier} onChange={e => setTier(e.target.value)}>
            <option value="all">全部阶级</option>
            {[1, 2, 3, 4, 5, 6].map(t => <option key={t} value={t}>{t} 阶</option>)}
          </select></label>
          <span role="status">{visibleMaterials.length} 种材料</span>
        </div>
        <div className="workshop-material-grid">
          {visibleMaterials.map(id => {
            const material = MATERIALS[id];
            const uses = production.recipes.filter(r => r.input.some(i => i.item === id));
            return <details key={id} className="workshop-material">
              <summary><img className="px" src={itemIcon(id)} width={24} height={24} alt="" /> {material.name} · {material.tier} 阶{material.rare ? ' · 稀有' : ''} · 持有 <b className="num">{have(id)}</b></summary>
              <p>{material.note} · 参考价 {material.price} 金</p>
              <p>来源：{materialSourceLabel(id)}</p>
              <p>配方用途：{uses.length ? uses.map(r => r.name).join('、') : '暂无生产配方'}{id === 'ore' ? '；毒弓精炼' : ''}</p>
            </details>;
          })}
        </div>
      </details>
      <div className="workshop-filters" role="search" aria-label="配方筛选">
        <label>搜索配方 <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="配方、产物或材料名称" /></label>
        <label>配方状态 <select value={recipeFilter} onChange={e => setRecipeFilter(e.target.value)}>
          <option value="all">全部配方</option><option value="unlocked">已解锁</option><option value="stocked">已解锁且材料足够</option>
        </select></label>
        <span role="status">{visibleRecipes.length} 个配方</span>
      </div>
      <div className="work-cols">
        {production.facilities.map(f => {
          const orders = production.orders.filter(o => o.facilityId === f.id);
          return (
            <section key={f.id} className="panel" aria-labelledby={`f-${f.id}`} data-facility={f.id}>
              <div className="ph"><h2 id={`f-${f.id}`}>{f.name}</h2><span className={`tag ${f.used >= f.slots ? 'tag-brass' : 'tag-grey'}`}>工位 {f.used} / {f.slots}</span></div>
              <div className="grp">进行中</div>
              <ul className="eq orders">
                {orders.map(orderRow)}
                {Array.from({ length: Math.max(0, f.slots - orders.length) }, (_, i) => <li key={`free${i}`} className="empty-row">空闲工位</li>)}
              </ul>
              <div className="grp">{f.id === 'garden' ? '播种' : '配方'}</div>
              <ul className="eq recipes">
                {visibleRecipes.filter(r => r.facility === f.id).map(r => recipeRow(r, f))}
                {!visibleRecipes.some(r => r.facility === f.id) && <li className="empty-row">没有符合筛选的配方。</li>}
              </ul>
            </section>
          );
        })}
      </div>
      <section className="panel" aria-labelledby="refine-h">
        <div className="ph"><h2 id="refine-h">毒弓精炼</h2><span>不推进日期 · 最高 +3</span></div>
        <p className="sys-note">仅精炼携带的第一把毒弓；不恢复耐久，不增加属性。+3 解锁装备战技。</p>
        <ul className="eq">
          {state.units.filter(u => u.status === 'active' && u.snapshot.weapons.includes('fw_weapon_85')).map(unit => {
            const level = unit.weaponInstances.find(w => w.id === 'fw_weapon_85')?.refinement ?? 0;
            const next = level + 1;
            const key = `refine:${unit.id}`;
            const locked = !!unit.lockedRunId || !!unit.lockedDispatchId || !!today?.battle;
            return <li key={unit.id}>
              <div className="min-w-0"><div className="nm">{unit.name} · {WEAPONS.fw_weapon_85.name} +{level}</div><div className="sp">{locked ? '活动中，暂不可精炼' : level >= 3 ? '已达精炼上限' : `升至 +${next}：${300 * next} 金币 · ${itemName('ore')} ×${next}`}</div></div>
              <button type="button" className="btn btn-sm" disabled={busy !== null || locked || level >= 3 || state.gold < 300 * next || have('ore') < next}
                onClick={() => void act(key, () => session.run(OP.REFINE_WEAPON, { unitId: unit.id, item: 'fw_weapon_85' }), () => `${unit.name}的毒弓已精炼至 +${next}`)}>
                {busy === key ? '精炼中…' : level >= 3 ? '已满级' : `精炼 +${next}`}
              </button>
            </li>;
          })}
          {!state.units.some(u => u.status === 'active' && u.snapshot.weapons.includes('fw_weapon_85')) && <li className="empty-row">没有现役角色携带毒弓。</li>}
        </ul>
      </section>
      <RepairList />
      <p className="sys-note">产量、周期与工位数量是首版数值；配方按地区声望解锁。物理武器的战技消耗耐久，维修只恢复到它已有的上限；完美锻造的 +10 不会叠第二次。</p>
    </Shell>
  );
}

// 铁匠铺 · 维修（REPAIR_ITEM）：全名册里耐久没满的武器和次数没满的杖，在这里或整备里都能修。
function RepairList() {
  const { state } = useSession();
  const { busy, act } = useAct();
  if (!state) return null;
  interface Row { unit: typeof state.units[number]; id: string; now: number; max: number; cost: number; staff: boolean }
  const rows: Row[] = state.units.filter(u => u.status === 'active').flatMap(unit => {
    const seen = new Set<string>();
    return unit.snapshot.weapons.flatMap((id): Row[] => {
      if (seen.has(id)) return [];
      seen.add(id);
      const staff = WEAPONS[id as WeaponId].type === 'staff';
      if (staff) {
        const book = unit.bookInstances.find(b => b.id === id && b.charges < b.maxCharges);
        return book ? [{ unit, id, now: book.charges, max: book.maxCharges, cost: 150 + (book.maxCharges - book.charges) * 20, staff }] : [];
      }
      if (WEAPONS[id as WeaponId].type === 'tome') return [];
      const worn = unit.weaponInstances.filter(w => w.id === id && w.durability < w.maxDurability);
      if (worn.length === 0) return [];
      const max = Math.max(...worn.map(w => w.maxDurability));
      return [{ unit, id, now: Math.min(...worn.map(w => w.durability)), max, cost: 100 + max * 5, staff }];
    });
  });
  return (
    <section className="panel" aria-labelledby="rep-h">
      <div className="ph"><h2 id="rep-h">铁匠铺 · 维修</h2><span style={{ fontSize: 12, color: '#6A6256' }}>不推进日期</span></div>
      <ul className="eq">
        {rows.map(r => (
          <li key={`${r.unit.id}:${r.id}`}>
            <img className="px" src={itemIcon(r.id)} width={32} height={32} alt="" />
            <div className="min-w-0"><div className="nm">{r.unit.name} · {WEAPONS[r.id as WeaponId].name}</div><div className="sp">{r.staff ? '次数' : '耐久'} {r.now} / {r.max}</div></div>
            <button type="button" className="btn btn-sm" disabled={busy !== null || state.gold < r.cost}
              onClick={() => void act(`${r.unit.id}:${r.id}`, () => session.run(OP.REPAIR_ITEM, { unitId: r.unit.id, item: r.id }), () => `${r.unit.name}的${WEAPONS[r.id as WeaponId].name}已${r.staff ? '补满' : '修好'}，金币 −${r.cost}`)}>
              {busy === `${r.unit.id}:${r.id}` ? '维修中…' : `${r.staff ? '补充' : '维修'} ${r.cost} 金`}
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="empty-row">没有需要维修的武器或杖。</li>}
      </ul>
    </section>
  );
}
