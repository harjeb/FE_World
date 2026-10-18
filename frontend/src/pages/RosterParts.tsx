import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { SnapshotUnit } from '@common/arena/rules.ts';
import { CHARACTERS } from '@common/data/characters.ts';
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
import { OP } from '@common/protocol/ops.ts';
import { ICONS, weaponIcon } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { ServerSnapshot, ServerUnit, ServerUnitDetail } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { canPromote, expLine, LIFESPAN_TEXT, ORIGIN_TEXT, STATUS_TAG, STATUS_TEXT, unitStatus, weaponProgress } from '../model/roster.ts';
import { links } from '../router.ts';
import type { RosterTab } from '../router.ts';
import { plainDate, shortDate } from '../ui/calendar.ts';
import { asUnit, combatLine } from './profile.ts';
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
      {tab('mastery', links.roster(unit.id, 'mastery'), '精通与技能', unit.learnedSkills.length > 0 ? <span className="tag tag-grey">{unit.equippedSkills.length} / {SLOTS}</span> : undefined)}
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

// 个人基础成长：成长传承或自捏主角写入的向量优先，否则用角色表（随机招募取形象锚点的角色表）。
export function personalGrowth(unit: ServerUnit, key: (typeof STAT_KEYS)[number]): number {
  return (unit.inheritedGrowth?.[key] ?? CHARACTERS[unit.character].growth[key]) + (unit.growthAllocation[key] ?? 0);
}

export function StatsPanel({ unit }: { unit: ServerUnit }) {
  const cls = CLASSES[unit.classId as ClassId];
  const stats = unit.snapshot.stats;
  const line = combatLine(asUnit(unit.snapshot));
  return (
    <section className="panel" aria-labelledby="st-h">
      <div className="ph"><h2 id="st-h">属性</h2><span style={{ fontSize: 12, color: '#6A6256' }}>成长率 = 每次升级该项 +1 的概率</span></div>
      <div className="tbl-scroll">
        <table className="st">
          <thead><tr><th scope="col" style={{ textAlign: 'left' }}>属性</th><th scope="col">当前</th><th scope="col">上限</th><th scope="col">个人</th><th scope="col">职业·{cls.name}</th><th scope="col">合计成长</th></tr></thead>
          <tbody>
            {STAT_KEYS.map(key => {
              const total = unit.totalGrowth[key] ?? 0;
              return (
                <tr key={key}>
                  <th scope="row">{STAT_NAMES[key]}</th>
                  <td className="v">{stats[key] ?? 0}</td>
                  <td className="cap">{cls.caps[key]}</td>
                  <td className="g">{pct(personalGrowth(unit, key))}</td>
                  <td className="g">{signed(cls.growth[key])}</td>
                  <td className="tot"><b>{total}%</b><span className="gbar" aria-hidden="true"><i style={{ width: `${Math.min(100, total)}%` }} /></span></td>
                </tr>
              );
            })}
            <tr><th scope="row">体格</th><td className="v">{unit.snapshot.con}</td><td className="cap">—</td><td colSpan={3} className="note">不随升级成长，转职也不改变</td></tr>
            <tr><th scope="row">移动</th><td className="v">{cls.move}</td><td className="cap">—</td><td colSpan={3} className="note">由职业决定（{cls.name} {cls.move}）</td></tr>
          </tbody>
        </table>
      </div>
      <div className="pfoot">
        {line
          ? <>装备{WEAPONS[line.weapon].name}时：攻击 <b>{line.attack}</b> · 命中 <b>{line.hit}</b> · 必杀 <b>{line.crit}</b> · 攻速 <b>{line.attackSpeed}</b> · 回避 <b>{line.avoid}</b></>
          : unit.snapshot.weapons.length === 0 ? <>没有携带武器，不能攻击。</> : <>不能攻击；治疗量 = 魔 + 10（当前 <b>{stats.mag + 10}</b>）。</>}
        <div style={{ color: '#6A6256', marginTop: 2 }}>合计成长是升级时实际使用的数值（含装备授予的成长）。成长为概率：整级无提升时自动重掷（最多 2 次）。</div>
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

export const artName = (id: string) => WEAPON_ART_BY_ID.get(id as never)?.name ?? id;
export const spellName = (id: string) => SPELLBOOK_BY_ID.get(id)?.name ?? id;
export const skillName = (id: string) => SKILLS[id as SkillId]?.name ?? id;

// 携带物品: weapons (the first is equipped) with their durability or charges, battle items, class
// spellbooks and the arts this unit can use. Moving things in or out of the warehouse, repairs, the inn
// and food happen on 整备.
export function EquipmentPanel({ unit, onEquip }: { unit: ServerUnit; onEquip: (id: WeaponId) => void }) {
  const weapons = unit.snapshot.weapons as WeaponId[];
  const items = unit.snapshot.items;
  const free = Math.max(0, SLOTS - items.length);
  const prep = links.prep(unit.id);
  const arts = [...new Set([...unit.learnedArts, ...weapons.flatMap(id => WEAPONS[id].grants?.art ? [WEAPONS[id].grants!.art!] : [])])];
  const granted = [...new Set(weapons.flatMap(id => WEAPONS[id].grants?.skill ? [WEAPONS[id].grants!.skill!] : []))];
  const row = (id: WeaponId, i: number, equipped: boolean) => {
    const res = instanceFor(unit, weapons, i);
    return (
      <li key={`${id}${i}`}>
        <img className="px" src={weaponIcon(WEAPONS[id].type)} width={32} height={32} alt="" />
        <div className="min-w-0">
          <div className="nm">{WEAPONS[id].name} {equipped && <span className="tag tag-blue">✓ 装备中</span>}{WEAPONS[id].grants?.skill && <span className="tag tag-brass">授予 {skillName(WEAPONS[id].grants!.skill!)}</span>}</div>
          <div className="sp">{weaponSpec(id)}</div>
          {res && <ResourceBar {...res} />}
        </div>
        {equipped ? <span /> : <button type="button" className="btn btn-sm" onClick={() => onEquip(id)}>装备</button>}
      </li>
    );
  };
  return (
    <section className="panel" aria-labelledby="eq-h">
      <div className="ph"><h2 id="eq-h">携带物品 <span style={{ fontWeight: 500, color: '#6A6256' }}>武器 {weapons.length} / {SLOTS} · 道具 {items.length} / {SLOTS}</span></h2><a className="btn btn-sm btn-ghost" href={prep}>整备 · 维修 ›</a></div>
      <div className="grp">武器（第一把是装备中的，也用来反击）</div>
      <ul className="eq">
        {weapons.map((id, i) => row(id, i, i === 0))}
        {weapons.length === 0 && (
          <li>
            <span className="slot-free" aria-hidden="true" />
            <div style={{ fontSize: 13, color: '#6A6256' }}>没有携带武器</div>
            <a className="btn btn-sm btn-ghost" href={prep}>去整备</a>
          </li>
        )}
      </ul>
      <div className="grp">消耗道具</div>
      <ul className="eq">
        {items.map((stack, i) => (
          <li key={i}>
            <img className="px" src={ICONS.vulnerary} width={32} height={32} alt="" />
            <div><div className="nm">{ITEMS[stack.id as ItemId]?.name ?? stack.id}</div><div className="sp">{stack.id === 'immortal_shield' ? '致命时自动消耗，保留 1 HP 并石化；每人最多 1 枚' : ITEMS[stack.id as ItemId] ? `回复 ${ITEMS[stack.id as ItemId].heal} HP · 剩余 ${stack.uses} / ${ITEMS[stack.id as ItemId].uses} 次` : `剩余 ${stack.uses} 次`}</div></div>
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
      {unit.spellbooks.length > 0 && <>
        <div className="grp">职业法术书（施法消耗每本独立次数；旅馆与食物恢复）</div>
        <ul className="eq">
          {unit.spellbooks.map(book => {
            const def = SPELLBOOK_BY_ID.get(book.id);
            return (
              <li key={book.id}>
                <img className="px" src={weaponIcon(def && (def.role === 'attack' || def.role === 'hostile_support') ? 'tome' : 'staff')} width={32} height={32} alt="" />
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
      <div className="grp">可用战技 · 装备技能</div>
      <div className="chips-list">
        {arts.map(id => {
          const art = WEAPON_ART_BY_ID.get(id as never);
          return <span key={id} className="chip-static" title={art?.effect}>{art?.name ?? id}<small>{art ? `${WEAPON_TYPE_NAMES[art.weapon as keyof typeof WEAPON_TYPE_NAMES] ?? art.weapon} · 耐久 ${art.cost}` : ''}</small></span>;
        })}
        {granted.map(id => <span key={id} className="chip-static" title={SKILLS[id].text}>{SKILLS[id].name}<small>装备授予</small></span>)}
        {arts.length === 0 && granted.length === 0 && <span className="muted" style={{ fontSize: 13 }}>还没有可用的战技；职业精通与特殊装备会授予。</span>}
      </div>
    </section>
  );
}

export function WeaponRanksPanel({ unit }: { unit: ServerUnit }) {
  const cls = CLASSES[unit.classId as ClassId];
  const rows = weaponProgress(unit);
  return (
    <section className="panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }} aria-label="武器等级">
      {rows.map(w => {
        const span = w.next !== null ? w.next - w.floor : 0;
        const done = w.next !== null ? Math.min(span, w.exp - w.floor) : 0;
        return (
          <div key={w.type} className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between"><b>武器等级 · {WEAPON_TYPE_NAMES[w.type]}</b><span className="pixel" style={{ fontSize: 18, color: w.cap ? '#22394A' : '#9C9486' }}>{w.rank}</span></div>
            <div className="bar"><i style={{ width: w.next !== null && !w.capped ? `${Math.round(100 * done / Math.max(1, span))}%` : '100%', background: w.capped ? '#9C9486' : undefined }} /></div>
            <div style={{ fontSize: 13, color: '#4E473D' }}>
              {!w.cap ? `${cls.name}不能使用这类武器；熟练度保留，换回可用的职业后继续累积。`
                : w.capped ? `已到${cls.name}上限 ${w.cap}；武器经验 ${w.exp}，换上上限更高的职业后继续提升。`
                  : `武器经验 ${w.exp} / ${w.next} → 升至 ${w.nextRank}；${cls.name}上限 ${w.cap}。`}
            </div>
          </div>
        );
      })}
      {rows.length === 0 && <p style={{ fontSize: 13, color: '#6A6256' }}>还没有武器等级。</p>}
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
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!data) return <section className="panel"><p className="sys-note">{error ? `读不到精通：${error}` : '读取职业精通…'}</p></section>;
  const equipped = picked ?? data.equippedSkills;
  const current = data.progress.find(p => p.classId === data.classId) ?? data.progress.find(p => p.name === unit.className);
  const others = data.progress.filter(p => p !== current && p.mastery > 0);
  const anchorSkill = CHARACTERS[unit.character]?.skill;
  const granted = [...new Set((unit.snapshot.weapons as WeaponId[]).flatMap(id => WEAPONS[id].grants?.skill ? [WEAPONS[id].grants!.skill!] : []))];
  const toggle = (skill: string) => setPicked(equipped.includes(skill) ? equipped.filter(s => s !== skill) : equipped.length < data.slots ? [...equipped, skill] : equipped);
  const dirty = picked !== null && (picked.length !== data.equippedSkills.length || picked.some(s => !data.equippedSkills.includes(s)));
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try { await session.run(OP.EQUIP_SKILLS, { unitId: unit.id, skills: equipped }); setPicked(null); setMessage('技能格已保存'); }
    catch (e) { setMessage(`保存失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(false); }
  };
  const nodeList = (p: NonNullable<typeof current>) => (
    <ol className="nodes">
      {p.nodes.map(node => (
        <li key={node.id} className={node.unlocked ? 'on' : undefined}>
          <span className="nd-t num">{node.threshold}</span>
          <span><b>{node.name}</b>　{SKILLS[node.skill as SkillId]?.text ?? node.skill}</span>
          <span className={`tag ${node.unlocked ? 'tag-green' : 'tag-grey'}`}>{node.unlocked ? '已学会' : `还差 ${Math.max(0, node.threshold - p.mastery)}`}</span>
        </li>
      ))}
    </ol>
  );
  return (
    <div className="cols2">
      <section className="panel" aria-labelledby="ms-h">
        <div className="ph"><h2 id="ms-h">职业精通 · {current?.name ?? unit.className}</h2><span className="num" style={{ fontSize: 13 }}>精通 {current?.mastery ?? 0}</span></div>
        <p className="sys-note">有效参战（含获胜加成）与派遣职业训练会积累当前职业的精通；达到门槛学会技能，学会的技能换职业后仍保留。普通竞技场与练习不计。</p>
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
        <div className="ph"><h2 id="sk-h">技能格 <span style={{ fontWeight: 500, color: '#6A6256' }}>{equipped.length} / {data.slots}</span></h2><span style={{ fontSize: 12, color: '#6A6256' }}>已学技能可跨职业自由装备</span></div>
        <div className="skill-slots">
          {Array.from({ length: data.slots }, (_, i) => {
            const skill = equipped[i];
            return <span key={i} className={`sslot${skill ? '' : ' empty'}`}>{skill ? <><b>{skillName(skill)}</b><small>{SKILLS[skill as SkillId]?.text}</small></> : '空格'}</span>;
          })}
        </div>
        <div className="grp">已学会 · 点选装上或卸下</div>
        <div className="chips-list">
          {data.learnedSkills.map(skill => (
            <button key={skill} type="button" className="chip" aria-pressed={equipped.includes(skill)} disabled={!equipped.includes(skill) && equipped.length >= data.slots} onClick={() => toggle(skill)} title={SKILLS[skill as SkillId]?.text}>
              {skillName(skill)}
            </button>
          ))}
          {data.learnedSkills.length === 0 && <span className="muted" style={{ fontSize: 13 }}>还没有学会技能：职业精通达到门槛后学会。</span>}
        </div>
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
    </div>
  );
}
