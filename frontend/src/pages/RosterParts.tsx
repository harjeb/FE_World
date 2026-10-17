import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SnapshotUnit } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import { CLASSES } from '@common/data/classes.ts';
import { GROWTH_TYPE_NAMES } from '@common/data/growth-types.ts';
import { SKILLS } from '@common/data/skills.ts';
import { RANKS, STAT_KEYS, STAT_NAMES, WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { ICONS, portraitFor, weaponIcon } from '../assets.ts';
import { promotionsFor } from '../demo/promotions.ts';
import { serverUnit, UNIT_TRAITS } from '../demo/live.ts';
import { session } from '../api/session.ts';
import type { ServerSnapshot } from '../api/session.ts';
import { defenseSlot, levelHistory, STATUS_TEXT } from '../demo/roster.ts';
import type { RosterEntry } from '../demo/roster.ts';
import { links } from '../router.ts';
import { shortDate } from '../ui/calendar.ts';
import { asUnit, combatLine } from './profile.ts';

export type ProfileTab = 'stats' | 'growth' | 'promote' | 'classes' | 'retire';

const STATUS_TAG = { main: 'tag-blue', reserve: 'tag-grey', injured: 'tag-red' } as const;
export const SLOTS = 5;

export const charName = (e: RosterEntry) => e.unit.name ?? CHARACTERS[e.unit.character].name;

export function StatusTag({ entry }: { entry: RosterEntry }) {
  return <span className={`tag ${STATUS_TAG[entry.status]}`}>{entry.status === 'main' ? '● ' : ''}{STATUS_TEXT[entry.status]}</span>;
}

export function Portrait({ entry, size }: { entry: RosterEntry; size: number }) {
  const looks = { classId: entry.unit.classId, side: 'player' as const, character: entry.unit.character };
  return <img className="px" src={portraitFor(looks)!} width={size} height={size} alt="" />;
}

// The tab strip shared by 属性与装备 / 成长记录 / 转职.
export function ProfileTabs({ entry, current }: { entry: RosterEntry; current: ProfileTab }) {
  const c = entry.unit.id ?? entry.unit.character;
  const tab = (id: ProfileTab, href: string, label: string, extra?: ReactNode) => (
    <a className="ptab" href={href} aria-current={id === current ? 'page' : undefined}>{label}{extra}</a>
  );
  return (
    <nav className="ptabs" aria-label="档案分页">
      {tab('stats', links.roster(c), '属性与装备')}
      {tab('growth', links.roster(c, 'growth'), '成长记录')}
      {tab('promote', links.promote(c), '转职', entry.promotable ? <span className="tag tag-green">可转职</span> : <span className="tag tag-grey">职业路线</span>)}
      {tab('classes', links.roster(c, 'classes'), '职业资格')}
      {tab('retire', links.roster(c, 'retire'), '退役与轮回')}
    </nav>
  );
}

export function ProfileHeader({ entry, current }: { entry: RosterEntry; current: ProfileTab }) {
  const { unit } = entry;
  const def = CHARACTERS[unit.character];
  const slot = defenseSlot(unit.character);
  const skill = def.skill ? SKILLS[def.skill] : null;
  const srv = serverUnit(unit.id ?? unit.character);
  return (
    <section className="panel" aria-labelledby="who-h">
      <div className="hdr">
        <div className="pf ally" style={{ width: 100, height: 100 }}><Portrait entry={entry} size={96} /></div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 id="who-h" className="serif" style={{ fontSize: 28, lineHeight: 1.2 }}>{def.name}</h1>
            <span className="tag tag-grey">{CLASSES[unit.classId].name} · Lv {unit.level}</span>
            <span className="tag tag-grey">{UNIT_TRAITS[unit.id ?? unit.character]?.growthTypeName ?? GROWTH_TYPE_NAMES[def.growthType]}</span>
            <StatusTag entry={entry} />
            {entry.promotable && <span className="tag tag-green">✚ 可转职</span>}
            {srv?.isProtagonist && <span className="tag tag-brass">主角</span>}
            {srv?.cycle === 1 && <span className="tag tag-brass">已轮回</span>}
            {srv?.lineageDepth === 1 && <span className="tag tag-blue">已接受遗产</span>}
          </div>
          <div className="flex items-center gap-2.5" style={{ marginTop: 8, maxWidth: 420 }}>
            <span style={{ fontSize: 13, color: '#4E473D', whiteSpace: 'nowrap' }}>经验</span>
            <div className="bar grow"><i style={{ width: `${entry.exp}%`, background: '#A88445' }} /></div>
            <b className="num" style={{ whiteSpace: 'nowrap' }}>{entry.exp} / 100</b>
          </div>
          {skill && <div style={{ marginTop: 8, fontSize: 14 }}><span className="tag tag-brass" style={{ marginRight: 6 }}>个人技能</span><b>{skill.name}</b>：{skill.text}</div>}
        </div>
        <div className="flex flex-col items-end gap-1.5" style={{ fontSize: 13, color: '#4E473D' }}>
          <span>{slot ? `竞技场防守 · 第 ${slot.place} 位 · ${slot.behavior}` : '竞技场防守 · 未上场'}</span>
          <span>加入：{entry.joined}</span>
        </div>
      </div>
      <ProfileTabs entry={entry} current={current} />
    </section>
  );
}

const pct = (n: number) => `${n > 0 && n < 1 ? 0 : n}%`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}%`;

export function StatsPanel({ entry, weapons }: { entry: RosterEntry; weapons: WeaponId[] }) {
  const { unit } = entry;
  const def = CHARACTERS[unit.character], cls = CLASSES[unit.classId];
  const current = serverUnit(unit.id ?? unit.character);
  const line = combatLine(asUnit(unit, weapons));
  // 成长类型/年龄的全属性修正（docs/02）：合计成长率要含这一项。
  const bonus = UNIT_TRAITS[unit.id ?? unit.character]?.growthBonus ?? 0;
  return (
    <section className="panel" aria-labelledby="st-h">
      <div className="ph"><h2 id="st-h">属性</h2><span style={{ fontSize: 12, color: '#6A6256' }}>成长率 = 每次升级该项 +1 的概率</span></div>
      <div className="tbl-scroll">
        <table className="st">
          <thead><tr><th scope="col" style={{ textAlign: 'left' }}>属性</th><th scope="col">当前</th><th scope="col">上限</th><th scope="col">个人</th><th scope="col">职业·{cls.name}</th><th scope="col">合计成长</th></tr></thead>
          <tbody>
            {STAT_KEYS.map(key => {
              const personal = current?.inheritedGrowth ? current.inheritedGrowth[key] ?? 0 : def.growth[key];
              const allocated = current?.growthAllocation?.[key] ?? 0;
              const total = Math.max(0, Math.max(0, personal + allocated + cls.growth[key]) + bonus);
              return (
                <tr key={key}>
                  <th scope="row">{STAT_NAMES[key]}</th>
                  <td className="v">{unit.stats[key] ?? 0}</td>
                  <td className="cap">{cls.caps[key]}</td>
                  <td className="g">{pct(personal + allocated)}</td>
                  <td className="g">{signed(cls.growth[key])}</td>
                  <td className="tot"><b>{total}%</b><span className="gbar" aria-hidden="true"><i style={{ width: `${Math.min(100, total)}%` }} /></span></td>
                </tr>
              );
            })}
            <tr><th scope="row">体格</th><td className="v">{unit.con}</td><td className="cap">—</td><td colSpan={3} className="note">不随升级成长，转职也不改变</td></tr>
            <tr><th scope="row">移动</th><td className="v">{cls.move}</td><td className="cap">—</td><td colSpan={3} className="note">由职业决定（{cls.name} {cls.move}）</td></tr>
          </tbody>
        </table>
      </div>
      <div className="pfoot">
        {line
          ? <>装备{WEAPONS[line.weapon].name}时：攻击 <b>{line.attack}</b> · 命中 <b>{line.hit}</b> · 必杀 <b>{line.crit}</b> · 攻速 <b>{line.attackSpeed}</b> · 回避 <b>{line.avoid}</b></>
          : weapons.length === 0 ? <>没有携带武器，不能攻击。</> : <>不能攻击；治疗量 = 魔 + 10（当前 <b>{unit.stats.mag + 10}</b>）。</>}
        <div style={{ color: '#6A6256', marginTop: 2 }}>成长为概率：同样的成长率，每次升级的结果都可能不同；整级无提升时自动重掷（最多 2 次）。</div>
      </div>
    </section>
  );
}

export function weaponSpec(id: WeaponId): string {
  const w = WEAPONS[id];
  if (w.type === 'staff') return `杖 ${w.rank} · ${w.note ?? ''}`;
  const range = w.range[0] === w.range[1] ? `${w.range[0]}` : `${w.range[0]}–${w.range[1]}`;
  return `${WEAPON_TYPE_NAMES[w.type]} ${w.rank} · 威力 ${w.might} · 命中 ${w.hit} · 重量 ${w.weight} · 必杀 ${w.crit} · 射程 ${range}${w.note ? ` · ${w.note}` : ''}`;
}

// 携带物品: weapons (the first is equipped) and battle items, five of each as TRANSFER_ITEM allows.
// 装备 reorders through TRANSFER_ITEM; moving things in or out of the warehouse happens on 整备.
export function EquipmentPanel({ entry, weapons, onEquip }: { entry: RosterEntry; weapons: WeaponId[]; onEquip: (id: WeaponId) => void }) {
  const items = entry.unit.items;
  const free = Math.max(0, SLOTS - items.length);
  const prep = links.prep(entry.unit.id ?? entry.unit.character);
  return (
    <section className="panel" aria-labelledby="eq-h">
      <div className="ph"><h2 id="eq-h">携带物品 <span style={{ fontWeight: 500, color: '#6A6256' }}>武器 {weapons.length} / {SLOTS} · 道具 {items.length} / {SLOTS}</span></h2><span style={{ fontSize: 12, color: '#6A6256' }}>武器无耐久</span></div>
      <div className="grp">当前装备</div>
      <ul className="eq">
        {weapons.length > 0
          ? (
            <li>
              <img className="px" src={weaponIcon(WEAPONS[weapons[0]].type)} width={32} height={32} alt="" />
              <div><div className="nm">{WEAPONS[weapons[0]].name} <span className="tag tag-blue">✓ 装备中</span></div><div className="sp">{weaponSpec(weapons[0])}</div></div>
              <span />
            </li>
          )
          : (
            <li>
              <span className="slot-free" aria-hidden="true" />
              <div style={{ fontSize: 13, color: '#6A6256' }}>没有携带武器</div>
              <a className="btn btn-sm btn-ghost" href={prep}>去整备</a>
            </li>
          )}
      </ul>
      {weapons.length > 1 && (
        <>
          <div className="grp">其他武器</div>
          <ul className="eq">
            {weapons.slice(1).map(id => (
              <li key={id}>
                <img className="px" src={weaponIcon(WEAPONS[id].type)} width={32} height={32} alt="" />
                <div><div className="nm">{WEAPONS[id].name}</div><div className="sp">{weaponSpec(id)}</div></div>
                <button type="button" className="btn btn-sm" onClick={() => onEquip(id)}>装备</button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="grp">消耗道具</div>
      <ul className="eq">
        {items.map((stack, i) => (
          <li key={i}>
            <img className="px" src={ICONS.vulnerary} width={32} height={32} alt="" />
            <div><div className="nm">{ITEMS[stack.id]?.name ?? stack.id}</div><div className="sp">{ITEMS[stack.id] ? `回复 ${ITEMS[stack.id].heal} HP · 剩余 ${stack.uses} / ${ITEMS[stack.id].uses} 次` : `剩余 ${stack.uses} 次`}</div></div>
            <span />
          </li>
        ))}
        {Array.from({ length: free }, (_, i) => (
          <li key={`free${i}`}>
            <span className="slot-free" aria-hidden="true" />
            <div style={{ fontSize: 13, color: '#6A6256' }}>空位</div>
            {i === 0 ? <a className="btn btn-sm btn-ghost" href={prep}>从仓库放入</a> : <span />}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WeaponRanksPanel({ entry }: { entry: RosterEntry }) {
  const cls = CLASSES[entry.unit.classId];
  return (
    <section className="panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="武器等级">
      {entry.weapons.map(w => {
        const cap = cls.weapons[w.type];
        const promoCap = promotionsFor(entry.unit.classId).map(p => p.weapons[w.type]).filter(Boolean)
          .sort((a, b) => RANKS.indexOf(b!) - RANKS.indexOf(a!))[0];
        const nextRank = RANKS[RANKS.indexOf(w.rank) + 1];
        return (
          <div key={w.type} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between"><b>武器等级 · {WEAPON_TYPE_NAMES[w.type]}</b><span className="pixel" style={{ fontSize: 18, color: '#22394A' }}>{w.rank}</span></div>
            <div className="bar"><i style={{ width: w.next ? `${Math.round(100 * w.exp / w.next)}%` : '100%' }} /></div>
            <div style={{ fontSize: 13, color: '#4E473D' }}>
              {w.next ? `武器经验 ${w.exp} / ${w.next} → 升至 ${nextRank}` : '已到最高等级'}；{cls.name}上限 {cap ?? '—'}{promoCap ? `，转职后可达 ${promoCap}` : ''}。
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function GrowthPanels({ entry }: { entry: RosterEntry }) {
  const history = levelHistory(entry);
  const start = CHARACTERS[entry.unit.character].level;
  // 竞技场快照 (GET_SNAPSHOTS): the roster saved on each arena day, oldest first, then today's values.
  const [saved, setSaved] = useState<ServerSnapshot[] | null>(null);
  useEffect(() => {
    let alive = true;
    session.snapshots().then(list => { if (alive) setSaved(list); }).catch(() => { if (alive) setSaved([]); });
    return () => { alive = false; };
  }, []);
  const mine = (u: SnapshotUnit) => (entry.unit.id ? u.id === entry.unit.id : u.character === entry.unit.character);
  const snapshots = [
    ...[...(saved ?? [])].reverse().flatMap(s => {
      const unit = s.roster.find(mine);
      return unit ? [{ label: shortDate(s.day), unit }] : [];
    }),
    { label: '当前', unit: entry.unit },
  ];
  // Server units carry their real level-up log; only the offline preview falls back to made-up rows.
  const live = !!serverUnit(entry.unit.id ?? entry.unit.character);
  return (
    <div className="cols2">
      <section className="panel" aria-labelledby="lv-h">
        <div className="ph"><h2 id="lv-h">历次升级</h2><span style={{ fontSize: 12, color: '#6A6256' }}>实际增加的属性</span></div>
        <div className="tbl-scroll">
          <table className="lvt">
            <thead><tr><th scope="col" style={{ textAlign: 'left' }}>等级</th>{STAT_KEYS.map(k => <th key={k} scope="col">{STAT_NAMES[k]}</th>)}</tr></thead>
            <tbody>
              {history.map(h => (
                <tr key={h.level}>
                  <th scope="row">Lv {h.level}</th>
                  {STAT_KEYS.map(k => <td key={k}>{h.gains[k] ? <span className="plus">+{h.gains[k]}</span> : <span className="zero">·</span>}</td>)}
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={9} className="note" style={{ textAlign: 'left' }}>{live ? '还没有升级记录。' : '加入后还没有升过级。'}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pfoot">{live
          ? `共记录 ${history.length} 次升级；加入前的成长不在此列。`
          : `加入时 Lv ${start}，之后共升级 ${history.length} 次。演示数据：每级提升按成长率期望分配。`}</div>
      </section>
      <section className="panel" aria-labelledby="snap-h">
        <div className="ph"><h2 id="snap-h">竞技场快照对比</h2><span style={{ fontSize: 12, color: '#6A6256' }}>竞技场日报名时保存</span></div>
        <div className="tbl-scroll">
          <table className="lvt">
            <thead><tr><th scope="col" style={{ textAlign: 'left' }}>快照</th><th scope="col">Lv</th>{STAT_KEYS.map(k => <th key={k} scope="col">{STAT_NAMES[k]}</th>)}</tr></thead>
            <tbody>
              {snapshots.map((s, i) => {
                const now = i === snapshots.length - 1;
                return (
                  <tr key={s.label} className={now ? 'now' : undefined}>
                    <th scope="row">{s.label}</th>
                    <td>{now ? <b>{s.unit.level}</b> : s.unit.level}</td>
                    {STAT_KEYS.map(k => <td key={k}>{now ? <b>{s.unit.stats[k] ?? 0}</b> : s.unit.stats[k] ?? 0}</td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pfoot">{saved === null ? '读取快照中…'
          : snapshots.length > 1 ? '每到一个竞技场日自动保存当天的名册；同一天到达的其他军团会遇到这份快照。'
            : '还没有包含这名角色的竞技场快照；到达竞技场日时会自动保存。'}</div>
      </section>
    </div>
  );
}
