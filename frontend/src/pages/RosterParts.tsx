import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SnapshotUnit } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
import { CLASS_ABILITIES, CLASS_ABILITY_BY_ID } from '@common/data/class-abilities.ts';
import { CLASSES } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { SKILLS } from '@common/data/skills.ts';
import type { SkillId } from '@common/data/skills.ts';
import { SPELLBOOK_BY_ID } from '@common/data/spellbooks.ts';
import { STAT_KEYS, STAT_NAMES, WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import { WEAPON_ART_BY_ID } from '@common/data/weapon-arts.ts';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import type { ItemId, WeaponId } from '@common/data/weapons.ts';
import { regionById } from '@common/game/calendar.ts';
import { spellbookItem } from '@common/game/items.ts';
import { OP } from '@common/protocol/ops.ts';
import { itemIconFor, weaponIcon } from '../assets.ts';
import { Radar } from '../ui/Radar.tsx';
import { session, useSession } from '../api/session.ts';
import type { ServerSnapshot, ServerUnit, ServerUnitDetail } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { canPromote, expLine, LIFESPAN_TEXT, ORIGIN_TEXT, STATUS_TAG, STATUS_TEXT, unitStatus, weaponProgress } from '../model/roster.ts';
import { links } from '../router.ts';
import type { RosterTab } from '../router.ts';
import { plainDate, shortDate } from '../ui/calendar.ts';
import { asUnit, COMBAT_KEYS, combatProfile } from './profile.ts';
import type { CombatKey } from './profile.ts';
import { ArtTrainingPanel } from './ArtTrainingPanel.tsx';
import { UnitFace } from './SystemParts.tsx';

export type ProfileTab = RosterTab | 'promote';
export const SLOTS = 5;

// 一件武器在背包里的第 n 个副本对应第 n 个耐久实例（同名武器可以有多件）。
export function instanceFor(unit: Pick<ServerUnit, 'weaponInstances' | 'bookInstances'>, weapons: readonly string[], index: number): { now: number; max: number; kind: 'durability' | 'charges' } | null {
  const id = weapons[index];
  const nth = weapons.slice(0, index).filter(w => w === id).length;
  const book = unit.bookInstances.filter(b => b.id === id)[nth];
  if (book) return { now: book.charges, max: book.maxCharges, kind: 'charges' };
  const weapon = unit.weaponInstances.filter(w => w.id === id)[nth];
  return weapon ? { now: weapon.durability, max: weapon.maxDurability, kind: 'durability' } : null;
}

export function ResourceBar({ now, max, kind }: { now: number; max: number; kind: 'durability' | 'charges' }) {
  const low = now <= Math.max(1, Math.floor(max / 5));
  return (
    <span className={`res-bar${low ? ' low' : ''}`} title={kind === 'durability' ? '耐久：战技消耗，普通攻击不消耗；0 耐久时战技不可用' : '次数：每次施放／使用消耗 1 次'}>
      <span className="rb"><i style={{ width: `${max > 0 ? (now / max) * 100 : 0}%` }} /></span>
      <span className="num">{kind === 'durability' ? '耐久' : '次数'} {now} / {max}</span>
    </span>
  );
}

// The tab strip shared by 属性与装备 / 成长记录 / 精通与技能 / 转职 / 职业资格 / 退役与轮回.
export function ProfileTabs({ unit, current }: { unit: ServerUnit; current: ProfileTab }) {
  const tab = (id: ProfileTab, href: string, label: string, extra?: ReactNode) => (
    <a className="ptab" href={href} aria-current={id === current ? 'page' : undefined}>{label}{extra}</a>
  );
  return (
    <nav className="ptabs" aria-label="档案分页">
      {tab('stats', links.roster(unit.id), '属性与装备')}
      {tab('growth', links.roster(unit.id, 'growth'), '成长记录')}
      {tab('mastery', links.roster(unit.id, 'mastery'), '精通与技能', unit.learnedSkills.length + unit.learnedArts.length > 0 ? <span className="tag tag-grey">{unit.equippedSkills.length + unit.equippedArts.length} / {SLOTS}</span> : undefined)}
      {tab('promote', links.promote(unit.id), '转职', canPromote(unit) ? <span className="tag tag-green">可转职</span> : undefined)}
      {tab('classes', links.roster(unit.id, 'classes'), '职业资格')}
      {tab('retire', links.roster(unit.id, 'retire'), '退役与轮回')}
    </nav>
  );
}

export function StatusTag({ unit }: { unit: ServerUnit }) {
  const { annual } = useSession();
  const status = unitStatus(unit, annual);
  return <span className={`tag ${STATUS_TAG[status]}`}>{STATUS_TEXT[status]}</span>;
}

function ageLine(unit: ServerUnit): string {
  if (unit.isProtagonist) return `${unit.age} 岁 · 神主角不衰老`;
  return `${unit.age} 岁 · ${unit.daysUntilBirthday > 0 ? `距生日 ${unit.daysUntilBirthday} 日` : '今天生日'}`;
}

export function ProfileHeader({ unit, current }: { unit: ServerUnit; current: ProfileTab }) {
  const anchor = CHARACTERS[unit.character];
  const skill = anchor?.skill ? SKILLS[anchor.skill] : null;
  const exp = expLine(unit);
  const warning = LIFESPAN_TEXT[unit.lifespanWarning];
  return (
    <section className="panel" aria-labelledby="who-h">
      <div className="hdr">
        <UnitFace unit={unit} size={92} />
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 id="who-h" className="serif" style={{ fontSize: 28, lineHeight: 1.2 }}>{unit.name}</h1>
            <span className="tag tag-grey">{unit.className} · Lv {unit.level}</span>
            <span className="tag tag-grey">{unit.growthTypeName}</span>
            <span className={`tag ${unit.origin === 'protagonist' ? 'tag-brass' : 'tag-grey'}`}>{ORIGIN_TEXT[unit.origin]}</span>
            <StatusTag unit={unit} />
            {canPromote(unit) && <span className="tag tag-green">✚ 可转职</span>}
            {unit.cycle === 1 && <span className="tag tag-brass">已轮回</span>}
            {unit.lineageDepth === 1 && <span className="tag tag-blue">已接受遗产</span>}
            {unit.hasInheritance && <span className="tag tag-blue">数值传承保底中</span>}
            {warning && <span className="tag tag-red">{warning}</span>}
          </div>
          <div className="flex items-center gap-2.5" style={{ marginTop: 8, maxWidth: 420 }}>
            <span style={{ fontSize: 13, color: '#4E473D', whiteSpace: 'nowrap' }}>经验</span>
            <div className="bar grow"><i style={{ width: `${exp.exp}%`, background: '#A88445' }} /></div>
            <b className="num" style={{ whiteSpace: 'nowrap' }}>{exp.max ? '已满级' : `${exp.exp} / 100`}</b>
          </div>
          {skill && <div style={{ marginTop: 8, fontSize: 14 }}><span className="tag tag-brass" style={{ marginRight: 6 }}>个人技能</span><b>{skill.name}</b>：{skill.text}<span className="muted">（不占技能格）</span></div>}
        </div>
        <div className="flex flex-col items-end gap-1.5" style={{ fontSize: 13, color: '#4E473D' }}>
          <span>{ageLine(unit)}</span>
          {!unit.isProtagonist && unit.lifespanEndDay !== null && <span>可见寿命 {unit.lifespanYears} 岁（{plainDate(unit.lifespanEndDay)}）</span>}
          <span>加入：{plainDate(unit.joinedDay)}</span>
        </div>
      </div>
      <ProfileTabs unit={unit} current={current} />
    </section>
  );
}

const pct = (n: number) => `${Math.max(0, n)}%`;
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}%`;

// 个人基础成长：成长传承或单位自身掷定的向量优先；旧存档才回退到角色表。
export function personalGrowth(unit: ServerUnit, key: (typeof STAT_KEYS)[number]): number {
  return (unit.inheritedGrowth?.[key] ?? unit.personalGrowth?.[key] ?? CHARACTERS[unit.character].growth[key]) + (unit.growthAllocation[key] ?? 0);
}

const COMBAT_LABEL: Record<CombatKey, string> = {
  attack: '攻击', protection: '物防', attackSpeed: '攻速', resistance: '魔防', hit: '命中', avoid: '回避', crit: '必杀', dodge: '必避',
};
// 基本能力按两列成对排（力／防、魔／魔防、速／运、技／魅），雷达图按一圈的顺序。
const BASIC_PAIRS = [['str', 'def'], ['mag', 'res'], ['spd', 'lck'], ['skl', 'cha']] as const;
const BASIC_RING = ['str', 'mag', 'skl', 'spd', 'lck', 'def', 'res', 'cha'] as const;
const COMBAT_RING: CombatKey[] = ['attack', 'hit', 'crit', 'attackSpeed', 'avoid', 'dodge', 'resistance', 'protection'];
// 没有可攻击的武器时，攻击／命中／必杀不成立，只显示防守一侧。
const OFFENSE = new Set<CombatKey>(['attack', 'hit', 'crit']);

function engineUnit(unit: ServerUnit) {
  return { ...asUnit(unit.snapshot), weaponInstances: unit.weaponInstances.map(w => ({ ...w, id: w.id as WeaponId })), bookInstances: unit.bookInstances.map(b => ({ ...b, id: b.id as WeaponId })), spellbooks: unit.spellbooks };
}

function Up({ amount }: { amount: number }) {
  return amount > 0 ? <span className="ab-up" title={`含技能或装备加成 +${amount}`} aria-label={`加成 +${amount}`}>▲</span> : null;
}

// 属性页左栏：战斗能力（与交战公式同源，平地、未移动）与基本能力，各配一张雷达图。
// 基本能力可切到成长率，个人与职业成长的拆分在悬停提示里。
export function AbilityPanel({ unit }: { unit: ServerUnit }) {
  const [view, setView] = useState<'value' | 'growth'>('value');
  const cls = CLASSES[unit.classId as ClassId];
  const stats = unit.snapshot.stats;
  const p = combatProfile(engineUnit(unit), cls.caps);
  const armed = p.weapon !== null;
  const combatCell = (k: CombatKey) => {
    const offense = OFFENSE.has(k);
    const label = k === 'attack' ? (p.magic ? '魔攻' : '物攻') : COMBAT_LABEL[k];
    return (
      <div key={k} className="ab-cell">
        <span className="ab-k">{label}</span>
        <span className="ab-v">{offense && !armed ? '—' : p.now[k]}</span>
        {(!offense || armed) && <Up amount={p.bonus[k]} />}
      </div>
    );
  };
  const growth = (key: (typeof STAT_KEYS)[number]) => unit.totalGrowth[key] ?? 0;
  const basicCell = (key: (typeof BASIC_RING)[number]) => (
    <div key={key} className="ab-cell" title={view === 'value' ? `上限 ${cls.caps[key]}` : `个人 ${pct(personalGrowth(unit, key))} · 职业 ${signed(cls.growth[key])}`}>
      <span className="ab-k">{STAT_NAMES[key]}</span>
      <span className="ab-v">{view === 'value' ? stats[key] ?? 0 : `${growth(key)}%`}</span>
      {view === 'value' && <span className="ab-cap">/{cls.caps[key]}</span>}
    </div>
  );
  const total = BASIC_RING.reduce((n, k) => n + (stats[k] ?? 0), 0);
  const growthTotal = BASIC_RING.reduce((n, k) => n + growth(k), 0);
  return (
    <section className="panel ability" aria-labelledby="ab-h">
      <div className="ab-strip">
        <span><small>HP</small><b className="num">{view === 'value' ? stats.hp : `${growth('hp')}%`}</b>{view === 'value' && <span className="ab-cap">/{cls.caps.hp}</span>}</span>
        <span><small>移动</small><b className="num">{cls.move}</b></span>
        <span><small>体格</small><b className="num">{unit.snapshot.con}</b></span>
      </div>
      <div className="ph"><h2 id="ab-h">战斗能力</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{armed ? `装备 ${WEAPONS[p.weapon!].name}` : unit.snapshot.weapons.length ? '没有可攻击的武器' : '没有携带武器'}</span></div>
      <div className="ab-body">
        <div className="ab-grid">
          {COMBAT_KEYS.map(combatCell)}
          <div className="ab-cell wide"><span className="ab-k">射程</span><span className="ab-v">{p.range ? (p.range[0] === p.range[1] ? p.range[0] : `${p.range[0]}–${p.range[1]}`) : '—'}</span></div>
        </div>
        <Radar label="战斗能力（离职业上限）" axes={COMBAT_RING.map(k => ({ label: COMBAT_LABEL[k], value: armed || !OFFENSE.has(k) ? p.now[k] : 0, max: p.cap[k] }))} />
      </div>
      <div className="ph">
        <h2>基本能力</h2>
        <span className="flex items-center gap-2">
          <span style={{ fontSize: 12, color: '#6A6256' }}>{view === 'value' ? <>综合能力 <b className="num" style={{ color: '#302D28', fontSize: 15 }}>{total}</b></> : <>成长合计 <b className="num" style={{ color: '#302D28', fontSize: 15 }}>{growthTotal}%</b></>}</span>
          <span className="seg seg-sm" role="group" aria-label="基本能力显示">
            <button type="button" aria-pressed={view === 'value'} onClick={() => setView('value')}>数值</button>
            <button type="button" aria-pressed={view === 'growth'} onClick={() => setView('growth')}>成长率</button>
          </span>
        </span>
      </div>
      <div className="ab-body">
        <div className="ab-grid">{BASIC_PAIRS.flat().map(basicCell)}</div>
        <Radar label={view === 'value' ? '基本能力（离职业上限）' : '合计成长率'}
          axes={BASIC_RING.map(k => ({ label: STAT_NAMES[k], value: view === 'value' ? stats[k] ?? 0 : growth(k), max: view === 'value' ? cls.caps[k] : 100 }))} />
      </div>
      <div className="pfoot">
        {view === 'value'
          ? <>数值与交战公式相同（平地、未移动）；▲ 表示含技能或装备加成。雷达图按{cls.name}的能力上限画，外圈即上限。{!armed && unit.snapshot.weapons.length > 0 && <> 治疗量 = 魔 + 10（当前 <b>{stats.mag + 10}</b>）。</>}</>
          : <>合计成长 = 个人 + 职业（含装备授予），是每次升级该项 +1 的概率；整级无提升时自动重掷（最多 2 次）。体格不随升级成长。</>}
      </div>
    </section>
  );
}

export function weaponSpec(id: WeaponId): string {
  const w = WEAPONS[id];
  if (w.type === 'staff') return `杖 ${w.rank} · ${w.note ?? ''}`;
  const range = w.range[0] === w.range[1] ? `${w.range[0]}` : `${w.range[0]}–${w.range[1]}`;
  // 多熟练度武器另列的副类要求（全部达标才能用）。
  const extra = (w.requires ?? []).map(req => `＋${WEAPON_TYPE_NAMES[req.type]} ${req.rank}`).join('');
  return `${WEAPON_TYPE_NAMES[w.type]} ${w.rank}${extra} · 威力 ${w.might} · 命中 ${w.hit} · 重量 ${w.weight} · 必杀 ${w.crit} · 射程 ${range}${w.magic ? ' · 魔力伤害' : ''}${w.note ? ` · ${w.note}` : ''}`;
}

export const artName = (id: string) => WEAPON_ART_BY_ID.get(id as never)?.name ?? id;
export const spellName = (id: string) => SPELLBOOK_BY_ID.get(id)?.name ?? id;
// 职业固有／精通能力的名称写在 class-abilities 的说明里：「战技装备+1 (`sk-97`)；剑必杀+3 (`sk-114`)」。
const abilityEntries = (text: string) => text.split('；').flatMap(part => {
  const m = /^(.*?)\s*\(`(sk-\d+)`\)$/.exec(part.trim());
  return m ? [{ id: m[2], name: m[1] }] : [];
});
const ABILITY_NAMES = new Map(CLASS_ABILITIES.flatMap(row => [...abilityEntries(row.inherent), ...abilityEntries(row.mastery)]).map(e => [e.id, e.name]));
export const classAbilities = (classId: string) => abilityEntries(CLASS_ABILITY_BY_ID.get(classId as never)?.inherent ?? '');
export const skillName = (id: string) => SKILLS[id as SkillId]?.name ?? ABILITY_NAMES.get(id) ?? id;

// 携带物品: weapons (the first is equipped) with their durability or charges, battle items, class
// spellbooks and the arts this unit can use. Moving things in or out of the warehouse, repairs, the inn
// and food happen on 整备.
export function EquipmentPanel({ unit, onEquip }: { unit: ServerUnit; onEquip: (id: WeaponId) => void }) {
  const weapons = unit.snapshot.weapons as WeaponId[];
  const items = unit.snapshot.items;
  const free = Math.max(0, SLOTS - items.length);
  const prep = links.prep(unit.id);
  const row = (id: WeaponId, i: number, equipped: boolean) => {
    const res = instanceFor(unit, weapons, i);
    const refinement = unit.weaponInstances.find(w => w.id === id)?.refinement ?? 0;
    return (
      <li key={`${id}${i}`}>
        <img className="px" src={itemIconFor(id)} width={32} height={32} alt="" />
        <div className="min-w-0">
          <div className="nm">{WEAPONS[id].name}{(id === 'fw_weapon_85' || refinement > 0) && ` +${refinement}`} {equipped && <span className="tag tag-blue">✓ 装备中</span>}{WEAPONS[id].grants?.skill && <span className="tag tag-brass">授予 {skillName(WEAPONS[id].grants!.skill!)}</span>}</div>
          <div className="sp">{weaponSpec(id)}</div>
          {WEAPONS[id].grants?.arts?.map(grant => <div className="sp" key={grant.art}>装备授予：{artName(grant.art)}{grant.minimumRefinement > 0 && ` · 精炼 +${grant.minimumRefinement} 起`}{unit.equipmentArts.includes(grant.art) ? '（已激活）' : '（未激活）'}</div>)}
          {res && <ResourceBar {...res} />}
        </div>
        {equipped ? <span /> : <button type="button" className="btn btn-sm" onClick={() => onEquip(id)}>装备</button>}
      </li>
    );
  };
  return (
    <section className="panel" aria-labelledby="eq-h">
      <div className="ph"><h2 id="eq-h">携带物品</h2><a className="btn btn-sm btn-ghost" href={prep}>整备 · 维修 ›</a></div>
      <div className="grp">装备（也用来反击）</div>
      <ul className="eq">
        {weapons.length > 0 && row(weapons[0], 0, true)}
        {weapons.length === 0 && (
          <li>
            <span className="slot-free" aria-hidden="true" />
            <div style={{ fontSize: 13, color: '#6A6256' }}>没有携带武器</div>
            <a className="btn btn-sm btn-ghost" href={prep}>去整备</a>
          </li>
        )}
      </ul>
      {weapons.length > 1 && <>
        <div className="grp">持有武器 · 共 {weapons.length} / {SLOTS}</div>
        <ul className="eq">{weapons.slice(1).map((id, i) => row(id, i + 1, false))}</ul>
      </>}
      <div className="grp">持有道具 · {items.length} / {SLOTS}</div>
      <ul className="eq">
        {items.map((stack, i) => (
          <li key={i}>
            <img className="px" src={itemIconFor(stack.id)} width={32} height={32} alt="" />
            <div><div className="nm">{ITEMS[stack.id as ItemId]?.name ?? stack.id}</div><div className="sp">{stack.id === 'immortal_shield' ? '致命时自动消耗，保留 1 HP 并石化；每人最多 1 枚' : ITEMS[stack.id as ItemId] ? `回复 ${ITEMS[stack.id as ItemId].heal} HP · 剩余 ${stack.uses} / ${ITEMS[stack.id as ItemId].uses} 次` : `剩余 ${stack.uses} 次`}</div></div>
            <span />
          </li>
        ))}
        {free > 0 && (
          <li>
            <span className="slot-free" aria-hidden="true" />
            <div style={{ fontSize: 13, color: '#6A6256' }}>空位 × {free}</div>
            <a className="btn btn-sm btn-ghost" href={prep}>从仓库放入</a>
          </li>
        )}
      </ul>
      {unit.spellbooks.length > 0 && <>
        <div className="grp">职业法术书（施法消耗每本独立次数；旅馆与食物恢复）</div>
        <ul className="eq">
          {unit.spellbooks.map(book => {
            const def = SPELLBOOK_BY_ID.get(book.id);
            return (
              <li key={book.id}>
                <img className="px" src={itemIconFor(spellbookItem(book.id))} width={32} height={32} alt="" />
                <div className="min-w-0">
                  <div className="nm">{def?.name ?? book.id}</div>
                  <div className="sp">{def ? `${def.effect} · 射程 ${def.range[0]}–${def.range[1]}${def.might ? ` · 威力 ${def.might}` : ''}` : ''}</div>
                  <ResourceBar now={book.charges} max={book.maxCharges} kind="charges" />
                </div>
                <span />
              </li>
            );
          })}
        </ul>
      </>}
    </section>
  );
}

// 武器等级：每类一格（图标、等级、到下一级的进度），详细说明在悬停提示里。
export function WeaponRanksPanel({ unit }: { unit: ServerUnit }) {
  const cls = CLASSES[unit.classId as ClassId];
  const rows = weaponProgress(unit);
  return (
    <section className="panel" aria-labelledby="wr-h">
      <div className="ph"><h2 id="wr-h">武器等级</h2><span style={{ fontSize: 12, color: '#6A6256' }}>灰色为{cls.name}不能使用</span></div>
      <ul className="wr-grid">
        {rows.map(w => {
          const span = w.next !== null ? w.next - w.floor : 0;
          const done = w.next !== null ? Math.min(span, w.exp - w.floor) : 0;
          const tip = !w.cap ? `${cls.name}不能使用这类武器；熟练度保留，换回可用的职业后继续累积。`
            : w.capped ? `已到${cls.name}上限 ${w.cap}；武器经验 ${w.exp}，换上上限更高的职业后继续提升。`
              : `武器经验 ${w.exp} / ${w.next} → 升至 ${w.nextRank}；${cls.name}上限 ${w.cap}。`;
          return (
            <li key={w.type} className={w.cap ? '' : 'off'} title={tip}>
              <img className="px" src={weaponIcon(w.type)} width={24} height={24} alt="" />
              <span className="wr-r pixel">{w.rank}</span>
              <span className="wr-n">{WEAPON_TYPE_NAMES[w.type]}</span>
              <span className="wr-bar" aria-label={tip}><i style={{ width: w.next !== null && !w.capped ? `${Math.round(100 * done / Math.max(1, span))}%` : '100%' }} className={w.capped ? 'capped' : ''} /></span>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="pfoot">还没有武器等级。</p>}
    </section>
  );
}

// 技能，按来源分组（个人／职业固有／技能格／装备授予）。职业固有能力与装备授予不占技能格。
export function SkillsPanel({ unit }: { unit: ServerUnit }) {
  const cls = CLASSES[unit.classId as ClassId];
  const anchor = CHARACTERS[unit.character];
  const personal = anchor?.skill ? SKILLS[anchor.skill] : null;
  const classSkills = classAbilities(unit.classId);
  const weapons = unit.snapshot.weapons as WeaponId[];
  const granted = [...new Set(weapons.flatMap(id => WEAPONS[id].grants?.skill ? [WEAPONS[id].grants!.skill!] : []))];
  const row = (key: string, name: string, sub: string, kind: string, title?: string) => (
    <li key={key} title={title ?? sub}><span className={`sk-dot ${kind}`} aria-hidden="true" /><span className="min-w-0"><b>{name}</b>{sub && <small>{sub}</small>}</span></li>
  );
  const art = (id: string) => {
    const a = WEAPON_ART_BY_ID.get(id as never);
    return row(`a${id}`, a?.name ?? id, a ? `战技 · ${WEAPON_TYPE_NAMES[a.weapon as keyof typeof WEAPON_TYPE_NAMES] ?? a.weapon} · 耐久 ${a.cost}` : '战技', 'art', a?.effect);
  };
  const slotCount = unit.equippedSkills.length + unit.equippedArts.length;
  return (
    <section className="panel skills" aria-labelledby="sk2-h">
      <div className="ph"><h2 id="sk2-h">技能</h2><a className="btn btn-sm btn-ghost" href={links.roster(unit.id, 'mastery')}>调整技能格 ›</a></div>
      <div className="grp">个人技能</div>
      <ul className="sk-list">{personal ? row('p', personal.name, personal.text, 'personal') : <li className="muted">没有个人技能</li>}</ul>
      <div className="grp">职业技能 · {cls.name}</div>
      <ul className="sk-list">
        {classSkills.map(c => row(`c${c.id}`, c.name, '职业固有 · 不占格', 'class'))}
        {classSkills.length === 0 && <li className="muted">{cls.name}没有固有能力</li>}
      </ul>
      <div className="grp">技能格 {slotCount} / {SLOTS}</div>
      <ul className="sk-list">
        {unit.equippedSkills.map(id => row(`s${id}`, skillName(id), SKILLS[id as SkillId]?.text ?? '已装备技能', 'slot'))}
        {unit.equippedArts.map(art)}
        {slotCount === 0 && <li className="muted">还没有装上技能或战技</li>}
      </ul>
      <div className="grp">装备授予</div>
      <ul className="sk-list">
        {granted.map(id => row(`g${id}`, SKILLS[id].name, SKILLS[id].text, 'gear'))}
        {unit.equipmentArts.map(art)}
        {granted.length === 0 && unit.equipmentArts.length === 0 && <li className="muted">携带的武器没有授予技能或战技</li>}
      </ul>
    </section>
  );
}

// 固定人物的见闻（GET_UNIT.story）。随机招募与神主角没有这一栏。
export function StoryPanel({ detail }: { detail: ServerUnitDetail | null }) {
  const story = detail?.story;
  if (!story) return null;
  return (
    <section className="panel" aria-labelledby="sto-h">
      <div className="ph"><h2 id="sto-h">人物见闻</h2><span className="tag tag-grey">固定人物</span></div>
      <p className="sys-note">{story.profile}</p>
      <dl className="facts">
        <dt>个人任务</dt><dd><b>{story.personalQuest.name}</b> · {regionById(story.personalQuest.region).name}：{story.personalQuest.description}</dd>
        <dt>探索发现</dt><dd>{story.discovery}</dd>
        {story.tavern.length > 0 && <><dt>酒馆闲谈</dt><dd>{story.tavern.map((line, i) => <div key={i}>「{line}」</div>)}</dd></>}
      </dl>
    </section>
  );
}

export function GrowthPanels({ unit }: { unit: ServerUnit }) {
  const history = [...unit.growthLog].reverse();
  // 竞技场快照 (GET_SNAPSHOTS): the roster saved on each arena day, oldest first, then today's values.
  const [saved, setSaved] = useState<ServerSnapshot[] | null>(null);
  useEffect(() => {
    let alive = true;
    session.snapshots().then(list => { if (alive) setSaved(list); }).catch(() => { if (alive) setSaved([]); });
    return () => { alive = false; };
  }, []);
  const mine = (u: SnapshotUnit) => u.id === unit.id;
  const snapshots = [
    ...[...(saved ?? [])].reverse().flatMap(s => {
      const found = s.roster.find(mine);
      return found ? [{ label: shortDate(s.day), unit: found }] : [];
    }),
    { label: '当前', unit: unit.snapshot },
  ];
  return (
    <div className="cols2">
      <section className="panel" aria-labelledby="lv-h">
        <div className="ph"><h2 id="lv-h">历次升级</h2><span style={{ fontSize: 12, color: '#6A6256' }}>实际增加的属性</span></div>
        <div className="tbl-scroll">
          <table className="lvt">
            <thead><tr><th scope="col" style={{ textAlign: 'left' }}>等级</th>{STAT_KEYS.map(k => <th key={k} scope="col">{STAT_NAMES[k]}</th>)}</tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={`${h.level}-${i}`}>
                  <th scope="row">Lv {h.level}</th>
                  {STAT_KEYS.map(k => {
                    const gain = h.gains[k] ?? 0, kept = h.inherited?.[k] ?? 0;
                    return <td key={k}>{gain + kept > 0 ? <span className="plus" title={kept ? `其中数值传承补 ${kept}` : undefined}>+{gain + kept}{kept ? '*' : ''}</span> : <span className="zero">·</span>}</td>;
                  })}
                </tr>
              ))}
              {history.length === 0 && <tr><td colSpan={10} className="note" style={{ textAlign: 'left' }}>还没有升级记录。</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="pfoot">共记录 {history.length} 次升级；加入前与轮回前的成长不在此列。* 表示含数值传承的保底补点。</div>
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
                  <tr key={`${s.label}${i}`} className={now ? 'now' : undefined}>
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
          : snapshots.length > 1 ? '每次报名竞技场时保存当天的名册；同一天到达的其他军团会遇到这份快照。'
            : '还没有包含这名角色的竞技场快照；报名竞技场时会保存。'}</div>
      </section>
    </div>
  );
}

// 精通与技能 (GET_MASTERY / EQUIP_SKILLS): class mastery by class, the nodes, and the five shared slots.
export function MasteryPanel({ unit }: { unit: ServerUnit }) {
  const { data, error } = useServerData(() => session.mastery(unit.id), [unit.id]);
  const version = useSession().state?.version;
  const [picked, setPicked] = useState<{ skills: string[]; arts: string[] } | null>(null);
  useEffect(() => { setPicked(null); setMessage(null); }, [unit.id, version, data]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!data) return <section className="panel"><p className="sys-note">{error ? `读不到精通：${error}` : '读取职业精通…'}</p></section>;
  if (data.unit !== unit.id) return <section className="panel"><p className="sys-note">读取职业精通…</p></section>;
  const equipped = picked?.skills ?? data.equippedSkills;
  const arts = picked?.arts ?? data.equippedArts;
  const count = equipped.length + arts.length;
  const current = data.progress.find(p => p.classId === data.classId) ?? data.progress.find(p => p.name === unit.className);
  const others = data.progress.filter(p => p !== current && p.mastery > 0);
  const anchorSkill = CHARACTERS[unit.character]?.skill;
  const granted = [...new Set((unit.snapshot.weapons as WeaponId[]).flatMap(id => WEAPONS[id].grants?.skill ? [WEAPONS[id].grants!.skill!] : []))];
  const toggle = (id: string, art = false) => {
    const list = art ? arts : equipped;
    const next = list.includes(id) ? list.filter(s => s !== id) : count < data.slots ? [...list, id] : list;
    setPicked({ skills: art ? equipped : next, arts: art ? next : arts });
  };
  const changed = (a: string[], b: string[]) => a.length !== b.length || a.some(id => !b.includes(id));
  const dirty = picked !== null && (changed(equipped, data.equippedSkills) || changed(arts, data.equippedArts));
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try { await session.run(OP.EQUIP_SKILLS, { unitId: unit.id, skills: equipped, arts }); setPicked(null); setMessage('技能格已保存'); }
    catch (e) { setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  };
  const nodeList = (p: NonNullable<typeof current>) => (
    <ol className="nodes">
      {p.nodes.map(node => (
        <li key={node.id} className={node.unlocked ? 'on' : undefined}>
          <span className="nd-t num">{node.threshold}</span>
          <span><b>{node.name}</b>　{node.art ? `战技 · ${WEAPON_ART_BY_ID.get(node.art)?.effect ?? node.art}` : SKILLS[node.skill as SkillId]?.text ?? node.skill}</span>
          <span className={`tag ${node.unlocked ? 'tag-green' : 'tag-grey'}`}>{node.unlocked ? '已学会' : `还差 ${Math.max(0, node.threshold - p.mastery)}`}</span>
        </li>
      ))}
    </ol>
  );
  return (
    <div className="cols2">
      <section className="panel" aria-labelledby="ms-h">
        <div className="ph"><h2 id="ms-h">职业精通 · {current?.name ?? unit.className}</h2><span className="num" style={{ fontSize: 13 }}>精通 {current?.mastery ?? 0}</span></div>
        <p className="sys-note">有效参战（每场 8 点，获胜另加 4 点）与派遣职业训练（每日 3 点）积累精通；达到门槛学会技能或战技，换职业后保留。普通竞技场与练习不计。</p>
        {current && nodeList(current)}
        {others.length > 0 && <>
          <div className="grp">其他职业的精通</div>
          <ul className="roster-mini">
            {others.map(p => (
              <li key={p.classId}>
                <span className="tag tag-grey">{p.routeName}</span>
                <span className="min-w-0"><b>{p.name}</b><span className="rm-sub">{p.nodes.filter(n => n.unlocked).map(n => n.name).join('、') || '还没有学会节点'}</span></span>
                <b className="num">{p.mastery}</b>
              </li>
            ))}
          </ul>
        </>}
      </section>
      <section className="panel" aria-labelledby="sk-h">
        <div className="ph"><h2 id="sk-h">技能格 <span style={{ fontWeight: 500, color: '#6A6256' }}>{count} / {data.slots}</span></h2><span style={{ fontSize: 12, color: '#6A6256' }}>被动技能与已学战技共用</span></div>
        <div className="skill-slots">
          {Array.from({ length: data.slots }, (_, i) => {
            const skill = equipped[i];
            const art = arts[i - equipped.length];
            return <span key={i} className={`sslot${skill || art ? '' : ' empty'}`}>{skill ? <><b>{skillName(skill)}</b><small>{SKILLS[skill as SkillId]?.text}</small></> : art ? <><b>{artName(art)}</b><small>{WEAPON_ART_BY_ID.get(art)?.effect}</small></> : '空格'}</span>;
          })}
        </div>
        <div className="grp">已学会 · 点选装上或卸下</div>
        <div className="chips-list">
          {data.learnedSkills.map(skill => (
            <button key={skill} type="button" className="chip" aria-pressed={equipped.includes(skill)} disabled={busy || (!equipped.includes(skill) && count >= data.slots)} onClick={() => toggle(skill)} title={SKILLS[skill as SkillId]?.text}>
              {skillName(skill)} · {SKILLS[skill as SkillId]?.text}
            </button>
          ))}
          {data.learnedSkills.length === 0 && <span className="muted" style={{ fontSize: 13 }}>还没有学会技能：职业精通达到门槛后学会。</span>}
        </div>
        <div className="grp">已学战技 · {data.learnedArts.length} 项</div>
        <ul className="roster-mini">
          {data.learnedArts.map(id => {
            const art = WEAPON_ART_BY_ID.get(id);
            return <li key={id}><button type="button" className="chip" aria-pressed={arts.includes(id)} disabled={busy || !art || art.unlock.kind === 'equipment_grant' || (!arts.includes(id) && count >= data.slots)} onClick={() => toggle(id, true)}>{arts.includes(id) ? '卸下' : '装上'}</button><span className="min-w-0"><b>{art?.name ?? id}</b><span className="rm-sub">{art ? `${art.unlock.kind === 'art_training' ? '战技研习' : '职业精通'} · ${art.effect} · ${art.weaponCompatibility.map(type => WEAPON_TYPE_NAMES[type]).join('／')}${art.rank ? ` ${art.rank}` : ''} · 耐久 ${art.cost}` : ''}</span></span></li>;
          })}
        </ul>
        {data.learnedArts.length === 0 && <p className="sys-note">职业精通达到战技节点后学会；切换职业不会直接领取战技。</p>}
        <p className="sys-note">学会战技只加入永久库，不会自动装上。选中后仍须满足当前职业、兼容武器、熟练度与耐久／次数要求；基础战技与升级战技各占一格。装备授予战技、个人与职业固有能力不占格。</p>
        <dl className="facts">
          <dt>个人技能</dt><dd>{anchorSkill ? `${SKILLS[anchorSkill].name}：${SKILLS[anchorSkill].text}` : '无'}（不占格）</dd>
          <dt>装备授予</dt><dd>{granted.length > 0 ? granted.map(id => SKILLS[id].name).join('、') : '无'}（卸下即失效，不占格）</dd>
        </dl>
        {message && <p className="sys-note" role="status">{message}</p>}
        <div className="go-bar">
          {dirty && <button type="button" className="btn btn-ghost" onClick={() => setPicked(null)}>撤销</button>}
          <button type="button" className="btn btn-primary" disabled={!dirty || busy || unit.status !== 'active'} onClick={() => void save()}>{busy ? '保存中…' : '保存技能格'}</button>
        </div>
      </section>
      <ArtTrainingPanel unit={unit} />
    </div>
  );
}
