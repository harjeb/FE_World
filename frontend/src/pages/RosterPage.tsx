import { useState } from 'react';
import { CATALOG_CLASS_IDS, CLASSES, canonicalClassId } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { GROWTH_TYPE_NAMES } from '@common/data/growth-types.ts';
import type { GrowthType } from '@common/data/growth-types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { OP } from '@common/protocol/ops.ts';
import { weaponIcon } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { canPromote, rosterOrder, unitStatus } from '../model/roster.ts';
import { go, links } from '../router.ts';
import type { RosterTab } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { toast } from '../ui/toast.tsx';
import { EquipmentPanel, GrowthPanels, MasteryPanel, ProfileHeader, StatsPanel, StatusTag, StoryPanel, WeaponRanksPanel } from './RosterParts.tsx';
import { ClassMarketPanel, RetireTab } from './RosterLegacy.tsx';
import { UnitFace } from './SystemParts.tsx';

type Filter = 'all' | 'ready' | 'away' | 'promotable' | 'aging';
type Sort = 'roster' | 'lvDesc' | 'lvAsc' | 'class' | 'joined';

const FILTERS: [Filter, string][] = [['all', '全部'], ['ready', '可出战'], ['away', '活动占用'], ['promotable', '可转职'], ['aging', '寿命预警']];

// 名册 (Roster artboard): the live roster from GET_STATE. Every tag comes from a real field; the number
// that can deploy is set by each map, the rest of the roster are the reserves (docs/00, TODO UI-01).
export function RosterPage({ unit: wanted, tab }: { unit: string | null; tab: RosterTab }) {
  const { state, annual } = useSession();
  const [filter, setFilter] = useState<Filter>('all');
  const [cls, setCls] = useState<ClassId | 'all'>('all');
  const [type, setType] = useState<GrowthType | 'all'>('all');
  const [sort, setSort] = useState<Sort>('roster');
  const [dismissing, setDismissing] = useState(false);
  const active = state?.units.filter(u => u.status === 'active') ?? [];
  const unit = active.find(u => u.id === wanted) ?? active.find(u => u.character === wanted) ?? rosterOrder(active, annual)[0];
  const { data: detail } = useServerData(() => (unit ? session.unit(unit.id) : Promise.resolve(null)), [unit?.id]);
  if (!state || !unit) return <Shell current="roster"><p style={{ color: '#4E473D' }}>名册还是空的。</p></Shell>;

  const match = (f: Filter, u: ServerUnit) => f === 'all' || (f === 'ready' ? unitStatus(u, annual) === 'ready'
    : f === 'away' ? unitStatus(u, annual) !== 'ready' : f === 'promotable' ? canPromote(u) : u.lifespanWarning !== 'none');
  const order = rosterOrder(active, annual);
  const by: Record<Sort, (a: ServerUnit, b: ServerUnit) => number> = {
    roster: (a, b) => order.indexOf(a) - order.indexOf(b),
    lvDesc: (a, b) => b.level - a.level,
    lvAsc: (a, b) => a.level - b.level,
    class: (a, b) => CATALOG_CLASS_IDS.indexOf(canonicalClassId(a.classId as ClassId)) - CATALOG_CLASS_IDS.indexOf(canonicalClassId(b.classId as ClassId)) || b.level - a.level,
    joined: (a, b) => a.joinedDay - b.joinedDay,
  };
  const list = active.filter(u => match(filter, u) && (cls === 'all' || canonicalClassId(u.classId as ClassId) === cls) && (type === 'all' || u.growthType === type)).sort(by[sort]);
  const count = (f: Filter) => active.filter(u => match(f, u)).length;
  const dismiss = async () => {
    try { await session.run(OP.DISMISS, { unitId: unit.id }); toast(`已解雇${unit.name}`); setDismissing(false); go(links.roster()); }
    catch (e) { toast(`解雇失败：${e instanceof Error ? e.message : String(e)}`); }
  };

  return (
    <Shell current="roster">
      <div className="roster-wrap">
        <section className="panel roster-list" aria-labelledby="list-h">
          <div className="ph"><h2 id="list-h">名册 <span style={{ fontWeight: 500, color: '#6A6256' }}>{active.length} / {state.rosterLimit}</span></h2><span style={{ fontSize: 12, color: '#6A6256' }}>{list.length} 人</span></div>
          <div className="filters">
            <div className="chips" role="group" aria-label="状态筛选">
              {FILTERS.map(([f, label]) => (
                <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{label} {count(f)}</button>
              ))}
            </div>
            <div className="selects">
              <label>职业
                <select value={cls} onChange={e => setCls(e.target.value as ClassId | 'all')}>
                  <option value="all">全部职业</option>
                  {[...new Set(active.map(u => canonicalClassId(u.classId as ClassId)))].map(id => <option key={id} value={id}>{CLASSES[id].name}</option>)}
                </select>
              </label>
              <label>成长类型
                <select value={type} onChange={e => setType(e.target.value as GrowthType | 'all')}>
                  <option value="all">全部类型</option>
                  {(Object.keys(GROWTH_TYPE_NAMES) as GrowthType[]).map(t => <option key={t} value={t}>{GROWTH_TYPE_NAMES[t]}</option>)}
                </select>
              </label>
              <label>排序
                <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
                  <option value="roster">可出战优先</option>
                  <option value="lvDesc">等级 高→低</option>
                  <option value="lvAsc">等级 低→高</option>
                  <option value="class">职业</option>
                  <option value="joined">加入顺序</option>
                </select>
              </label>
            </div>
          </div>
          <ul aria-label="角色列表">
            {list.map(u => {
              const main = u.snapshot.weapons.find(w => WEAPONS[w].type !== 'staff') ?? u.snapshot.weapons[0];
              return (
                <li key={u.id}>
                  <button type="button" className="row" aria-current={u.id === unit.id} onClick={() => go(links.roster(u.id, tab))}>
                    <span className="mark" aria-hidden="true" />
                    <UnitFace unit={u} size={46} />
                    <span className="min-w-0">
                      <span className="r-name">{u.name} <span className="gt">· {u.growthTypeName} · {u.age} 岁</span>{u.isProtagonist && <span className="mini-up" title="主角">★</span>}{canPromote(u) && <span className="mini-up" title="可转职">✚</span>}</span>
                      <span className="r-sub">{main && <img className="px" src={weaponIcon(WEAPONS[main].type)} width={16} height={16} alt="" />}{u.className} · Lv {u.level}{u.lifespanWarning !== 'none' && <span className="r-warn"> · 寿命预警</span>}</span>
                    </span>
                    <StatusTag unit={u} />
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="empty-row">没有符合条件的角色</li>}
          </ul>
          <p className="pfoot">名册上限 {state.rosterLimit} 人：每张地图规定出战人数，其余的人留作替补。</p>
        </section>

        <div className="roster-detail">
          <ProfileHeader unit={unit} current={tab} />
          {tab === 'stats' && (
            <div className="cols2">
              <div className="flex min-w-0 flex-col gap-3">
                <StatsPanel unit={unit} />
                <StoryPanel detail={detail} />
              </div>
              <div className="flex min-w-0 flex-col gap-3">
                <EquipmentPanel unit={unit}
                  onEquip={id => void session.run(OP.TRANSFER_ITEM, { unitId: unit.id, item: id, action: 'equip' }).then(() => toast(`${unit.name}装备了${WEAPONS[id].name}`), e => toast(`操作失败：${e instanceof Error ? e.message : String(e)}`))} />
                <WeaponRanksPanel unit={unit} />
              </div>
            </div>
          )}
          {tab === 'growth' && <GrowthPanels unit={unit} />}
          {tab === 'mastery' && <MasteryPanel key={unit.id} unit={unit} />}
          {tab === 'classes' && <ClassMarketPanel key={unit.id} unit={unit} />}
          {tab === 'retire' && <RetireTab key={unit.id} unit={unit} />}
          {(tab === 'stats' || tab === 'growth') && !unit.isProtagonist && <div className="flex flex-wrap items-center justify-end gap-2">
            {dismissing && <span className="a-warn" style={{ borderRadius: 6 }}>解雇后{unit.name}离开军团，不留下遗产，也不会写进纪念名册。确定吗？</span>}
            {dismissing && <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDismissing(false)}>再想想</button>}
            <button type="button" className="btn btn-sm btn-danger" onClick={() => (dismissing ? void dismiss() : setDismissing(true))}>{dismissing ? `确认解雇${unit.name}` : `解雇${unit.name}…`}</button>
          </div>}
        </div>
      </div>
    </Shell>
  );
}
