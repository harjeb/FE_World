import { useState } from 'react';
import { CHARACTERS } from '@common/data/characters.ts';
import { CATALOG_CLASS_IDS, CLASSES, canonicalClassId } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { OP } from '@common/protocol/ops.ts';
import { GROWTH_TYPE_NAMES } from '@common/data/growth-types.ts';
import type { GrowthType } from '@common/data/growth-types.ts';
import { weaponIcon } from '../assets.ts';
import { session } from '../api/session.ts';
import { serverUnit, UNIT_TRAITS } from '../demo/live.ts';
import { ROSTER, ROSTER_LIMIT, rosterEntry } from '../demo/roster.ts';
import type { RosterEntry, RosterStatus } from '../demo/roster.ts';
import { go, links } from '../router.ts';
import type { RosterTab } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { toast } from '../ui/toast.tsx';
import { charName, EquipmentPanel, GrowthPanels, Portrait, ProfileHeader, StatsPanel, StatusTag, WeaponRanksPanel } from './RosterParts.tsx';
import { ClassMarketPanel, RetireTab } from './RosterLegacy.tsx';

type Filter = 'all' | RosterStatus | 'promotable';
type Sort = 'lvDesc' | 'lvAsc' | 'class' | 'joined';

// The unit's own type can differ from the character default (recruits roll one), so read the server view.
const traitOf = (unit: RosterEntry['unit']): GrowthType => UNIT_TRAITS[unit.id ?? unit.character]?.growthType ?? CHARACTERS[unit.character].growthType;

const FILTERS: [Filter, string][] = [['all', '全部'], ['main', '主力'], ['reserve', '替补'], ['injured', '重伤'], ['promotable', '可转职']];
const CLASS_ORDER = CATALOG_CLASS_IDS;

function visible(filter: Filter, cls: ClassId | 'all', type: GrowthType | 'all', sort: Sort): RosterEntry[] {
  const list = ROSTER.filter(e => (filter === 'all' || (filter === 'promotable' ? e.promotable : e.status === filter))
    && (cls === 'all' || canonicalClassId(e.unit.classId) === cls) && (type === 'all' || traitOf(e.unit) === type));
  const by: Record<Sort, (a: RosterEntry, b: RosterEntry) => number> = {
    lvDesc: (a, b) => b.unit.level - a.unit.level || a.order - b.order,
    lvAsc: (a, b) => a.unit.level - b.unit.level || a.order - b.order,
    class: (a, b) => CLASS_ORDER.indexOf(canonicalClassId(a.unit.classId)) - CLASS_ORDER.indexOf(canonicalClassId(b.unit.classId)) || b.unit.level - a.unit.level,
    joined: (a, b) => a.order - b.order,
  };
  return list.sort(by[sort]);
}

// 名册 · 属性与装备 / 成长记录 (Roster artboard). Filters and equipment changes live on this page only.
export function RosterPage({ unit, tab }: { unit: string | null; tab: RosterTab }) {
  const entry = rosterEntry(unit) ?? ROSTER[0];
  const [filter, setFilter] = useState<Filter>('all');
  const [cls, setCls] = useState<ClassId | 'all'>('all');
  const [type, setType] = useState<GrowthType | 'all'>('all');
  const [sort, setSort] = useState<Sort>('lvDesc');
  const weapons = entry.unit.weapons;
  const srv = serverUnit(entry.unit.id ?? entry.unit.character);
  const list = visible(filter, cls, type, sort);
  const count = (f: Filter) => ROSTER.filter(e => f === 'all' || (f === 'promotable' ? e.promotable : e.status === f)).length;

  return (
    <Shell current="roster">
      <div className="roster-wrap">
        <section className="panel roster-list" aria-labelledby="list-h">
          <div className="ph"><h2 id="list-h">名册 <span style={{ fontWeight: 500, color: '#6A6256' }}>{ROSTER.length} / {ROSTER_LIMIT}</span></h2><span style={{ fontSize: 12, color: '#6A6256' }}>{list.length} 人</span></div>
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
                  {CLASS_ORDER.map(id => <option key={id} value={id}>{CLASSES[id].name}</option>)}
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
                  <option value="lvDesc">等级 高→低</option>
                  <option value="lvAsc">等级 低→高</option>
                  <option value="class">职业</option>
                  <option value="joined">加入顺序</option>
                </select>
              </label>
            </div>
          </div>
          <ul aria-label="角色列表">
            {list.map(e => {
              const c = e.unit.character;
              const main = e.unit.weapons.find(w => WEAPONS[w].type !== 'staff') ?? e.unit.weapons[0];
              return (
                <li key={e.unit.id ?? c}>
                  <button type="button" className="row" aria-current={e === entry} onClick={() => go(links.roster(e.unit.id ?? c, tab))}>
                    <span className="mark" aria-hidden="true" />
                    <span className="pf ally" style={{ width: 46, height: 46 }}><Portrait entry={e} size={64} /></span>
                    <span className="min-w-0">
                      <span className="r-name">{e.unit.name ?? CHARACTERS[c].name} <span className="gt">· {UNIT_TRAITS[e.unit.id ?? c]?.growthTypeName ?? GROWTH_TYPE_NAMES[CHARACTERS[c].growthType]}{UNIT_TRAITS[e.unit.id ?? c] ? ` · ${UNIT_TRAITS[e.unit.id ?? c].age} 岁` : ''}</span>{e.promotable && <span className="mini-up" title="可转职">✚</span>}</span>
                      <span className="r-sub">{main && <img className="px" src={weaponIcon(WEAPONS[main].type)} width={16} height={16} alt="" />}{CLASSES[e.unit.classId].name} · Lv {e.unit.level}</span>
                    </span>
                    <StatusTag entry={e} />
                  </button>
                </li>
              );
            })}
            {list.length === 0 && <li className="empty-row">没有符合条件的角色</li>}
          </ul>
        </section>

        <div className="roster-detail">
          <ProfileHeader entry={entry} current={tab} />
          {tab === 'stats' && (
            <div className="cols2">
              <StatsPanel entry={entry} weapons={weapons} />
              <div className="flex min-w-0 flex-col gap-3">
                <EquipmentPanel entry={entry} weapons={weapons}
                  onEquip={id => { const u = serverUnit(entry.unit.id ?? entry.unit.character); if (u) void session.run(OP.TRANSFER_ITEM, { unitId: u.id, item: id, action: 'equip' }); }} />
                <WeaponRanksPanel entry={entry} />
              </div>
            </div>
          )}
          {tab === 'growth' && <GrowthPanels entry={entry} />}
          {tab === 'classes' && srv && <ClassMarketPanel key={srv.id} unit={srv} />}
          {tab === 'retire' && srv && <RetireTab key={srv.id} unit={srv} />}
          {(tab === 'stats' || tab === 'growth') && <div className="flex justify-end">
            <button type="button" className="btn btn-sm btn-danger" onClick={async () => {
              const u = serverUnit(entry.unit.id ?? entry.unit.character);
              if (!u) return;
              try { await session.run(OP.DISMISS, { unitId: u.id }); toast(`已解雇${charName(entry)}`); }
              catch (e) { toast(`解雇失败：${e instanceof Error ? e.message : String(e)}`); }
            }}>解雇{charName(entry)}…</button>
          </div>}
        </div>
      </div>
    </Shell>
  );
}
