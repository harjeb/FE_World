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
const MATERIALS = ['seed', 'herb', 'ore', 'wood'] as const;

// 生产 (docs/00 §9.2): 种子→药草→伤药，矿石＋木材→铁匠铺→武器. Orders ripen on the personal calendar;
// collecting never moves the date. Planting spends a day, brewing and forging only hold a slot.
export function WorkshopPage() {
  const { production, state } = useSession();
  const { busy, act } = useAct();
  if (!production || !state) {
    return <Shell current="workshop"><p style={{ color: '#4E473D' }}>暂时读不到生产信息（GET_PRODUCTION），刷新页面再试。</p></Shell>;
  }
  const day = state.day;
  const have = (item: string) => stock(state, item);
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
          <div className="nm">{order.recipe} <span className="muted">→ {order.output}</span></div>
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
    const why = full ? `${facility.name}工位已满` : missing.length > 0 ? `缺少${missing.map(i => itemName(i.item)).join('、')}` : null;
    const run = plant
      ? () => session.run<{ day: number }>(OP.PLANT)
      : () => session.run(OP.START_PRODUCTION, { recipeId: recipe.id });
    return (
      <li key={recipe.id} className="recipe">
        <img className="px" src={itemIcon(recipe.output.item)} width={32} height={32} alt="" />
        <div className="min-w-0">
          <div className="nm">{recipe.name} <span className="muted">→ {itemName(recipe.output.item)} ×{recipe.output.count}</span></div>
          <div className="sp">
            {recipe.input.map(i => (
              <span key={i.item} className={have(i.item) < i.count ? 'short' : undefined}>{itemName(i.item)} ×{i.count}（有 {have(i.item)}）</span>
            ))}
            <span>{recipe.days} 日成熟</span>
            {plant && <span className="cost"><img className="px" src={ICONS.hourglass} width={12} height={12} alt="" />播种 1 日 → {advance(day, 1).label}</span>}
          </div>
          {why && <div className="why">{why}</div>}
        </div>
        <button type="button" className="btn btn-sm" disabled={busy !== null || !!why}
          onClick={() => void act(recipe.id, run, () => (plant ? `播下种子，${recipe.days} 日后收获药草` : `${facility.name}开工：${recipe.name}`))}>
          {busy === recipe.id ? '开工中…' : plant ? '播种' : '开工'}
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
          {MATERIALS.map(m => (
            <span key={m} className="mat"><img className="px" src={ICONS[m]} width={24} height={24} alt="" />{itemName(m)} <b className="num">{have(m)}</b></span>
          ))}
          <a className="btn btn-sm btn-ghost" href={links.prep()}>去整备买材料 ›</a>
        </div>
      </div>

      {(ripe.length > 0 || growing.length > 0) && (
        <p className="sys-strip" role="status">
          {ripe.length > 0 ? `${ripe.length} 件已成熟待领取。` : ''}
          {growing.length > 0 ? `下一件在${plainDate(growing[0].readyDay)}成熟（${growing[0].readyDay - day} 日后）；成熟靠推进日期，例如在军营休整。` : ''}
        </p>
      )}

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
                {production.recipes.filter(r => r.facility === f.id).map(r => recipeRow(r, f))}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="sys-note">首版两条生产链；产量、周期与工位数量仍是草案。完美锻造与耐久、维修尚未启用。</p>
    </Shell>
  );
}
