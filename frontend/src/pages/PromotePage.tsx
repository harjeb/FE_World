import { useState } from 'react';
import { CHARACTERS } from '@common/data/characters.ts';
import { CLASSES, classUnavailableReason, hasClassQualification } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { GROWTH_TYPE_NAMES } from '@common/data/growth-types.ts';
import { MOVE_TYPE_NAMES, STAT_KEYS, STAT_NAMES, WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import type { WeaponType } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { OP } from '@common/protocol/ops.ts';
import { weaponIcon } from '../assets.ts';
import { session } from '../api/session.ts';
import { promotionsFor } from '../demo/promotions.ts';
import { serverUnit, UNIT_TRAITS } from '../demo/live.ts';
import type { Promotion } from '../demo/promotions.ts';
import { ROSTER, rosterEntry } from '../demo/roster.ts';
import type { RosterEntry } from '../demo/roster.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { CheckIcon } from '../ui/icons.tsx';
import { toast } from '../ui/toast.tsx';
import { asUnit, combatLine } from './profile.ts';
import { Portrait, ProfileTabs } from './RosterParts.tsx';

const delta = (d: number) => (d > 0 ? <i className="d-up">+{d}</i> : d < 0 ? <i className="d-dn">−{-d}</i> : <i className="d-eq">—</i>);
const trend = (d: number) => (d > 0 ? <i className="d-up">▲{d}</i> : d < 0 ? <i className="d-dn">▼{-d}</i> : <i className="d-eq">=</i>);

function OptionCard({ entry, option, chosen, onPick }: { entry: RosterEntry; option: Promotion; chosen: boolean; onPick: () => void }) {
  const { unit } = entry;
  const def = CHARACTERS[unit.character], cls = CLASSES[unit.classId];
  const after = { ...unit, classId: option.to, stats: { ...unit.stats }, con: unit.con + option.con };
  // 成长类型/年龄修正与职业无关，转职前后都一样 (docs/02)。
  const bonus = UNIT_TRAITS[unit.id ?? unit.character]?.growthBonus ?? 0;
  for (const key of STAT_KEYS) after.stats[key] += option.bonus[key];
  const line = combatLine(asUnit(after), option.mods);
  // 转职不赠送即时属性或体格 (docs/00 §5)；转职表里真有加成时才列出来。
  const gains: [string, number, number][] = [
    ...STAT_KEYS.map(k => [STAT_NAMES[k], unit.stats[k], option.bonus[k]] as [string, number, number]),
    ['体格', unit.con, option.con],
  ].filter(([, , d]) => d !== 0) as [string, number, number][];
  return (
    <section className={`opt${chosen ? ' on' : ''}`} aria-label={option.name}>
      <div className="o-head">
        <img className="px" src={weaponIcon(Object.keys(option.weapons)[0] as WeaponType)} width={48} height={48} alt="" />
        <div className="min-w-0 flex-1">
          <h2 className="serif o-name">{option.name}</h2>
          <div className="o-tag">{option.tagline}</div>
        </div>
        <button type="button" className="btn pick" aria-pressed={chosen} onClick={onPick}>{chosen ? '✓ 已选择' : `选择${option.name}`}</button>
      </div>
      {gains.length > 0 && <div className="o-sec">
        <div className="o-k"><span>立即获得 · 转职加成</span><span style={{ fontWeight: 500 }}>当前 → 转职后</span></div>
        <div className="gain">
          {gains.map(([k, from, d]) => <div key={k}><span>{k}</span><b>{from} → {from + d}</b>{delta(d)}</div>)}
        </div>
      </div>}
      <div className="o-sec">
        <dl className="perm">
          <dt>武器</dt>
          <dd>
            {(Object.entries(option.weapons) as [WeaponType, string][]).map(([type, cap], i) => (
              <span key={type}>{i > 0 && '；'}{WEAPON_TYPE_NAMES[type]} · 上限 <b>{cap}</b>{unit.ranks[type] ? `（当前 ${unit.ranks[type]}，${cls.name}上限 ${cls.weapons[type] ?? '—'}）` : '（新武器，从 E 开始）'}</span>
            ))}
          </dd>
          <dt>移动</dt><dd><b>{option.move}</b>（{MOVE_TYPE_NAMES[option.moveType]}{option.moveType !== cls.moveType ? `，原为${MOVE_TYPE_NAMES[cls.moveType]}` : ''}{option.move !== cls.move ? `，${option.move > cls.move ? '+' : ''}${option.move - cls.move}` : ''}）</dd>
        </dl>
      </div>
      <div className="o-sec">
        <div className="o-k"><span>今后成长率 · 合计（个人 + 职业）</span><span style={{ fontWeight: 500 }}>与{cls.name}相比</span></div>
        <div className="grow">
          {STAT_KEYS.map(k => {
            const now = Math.max(0, def.growth[k] + cls.growth[k] + bonus), next = Math.max(0, def.growth[k] + option.growth[k] + bonus);
            return <div key={k}><span>{STAT_NAMES[k]}</span><b>{next}% {trend(next - now)}</b></div>;
          })}
        </div>
      </div>
      <div className="o-sec" style={{ fontSize: 13, color: '#4E473D' }}>
        {line
          ? <div>转职后（{WEAPONS[line.weapon].name}）：<b>攻击 {line.attack} · 命中 {line.hit} · 必杀 {line.crit} · 攻速 {line.attackSpeed}</b></div>
          : <div>转职后治疗量：<b>{after.stats.mag + 10}</b>（魔 + 10）</div>}
      </div>
    </section>
  );
}

// Five class stages share one character level, from 1 through 99.
export function PromotePage({ unit }: { unit: string }) {
  const entry = rosterEntry(unit) ?? ROSTER[0];
  const options = promotionsFor(entry.unit.classId);
  const [pick, setPick] = useState(0);
  const chosen = options[Math.min(pick, options.length - 1)];
  const cls = CLASSES[entry.unit.classId];
  const name = entry.unit.name;
  const [busy, setBusy] = useState(false);
  const live = serverUnit(entry.unit.id ?? entry.unit.character);
  const qualified = !!live && !!chosen && hasClassQualification(live.classQualifications as ClassId[], chosen.to);
  const ready = !!live && live.status === 'active' && !!chosen && qualified && !classUnavailableReason(chosen.to);
  return (
    <Shell current="roster">
      <section className="panel" aria-labelledby="who-h">
        <div className="flex flex-wrap items-center gap-3.5" style={{ padding: '12px 16px' }}>
          <div className="pf ally" style={{ width: 66, height: 66 }}><Portrait entry={entry} size={64} /></div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h1 id="who-h" className="serif" style={{ fontSize: 24 }}>{name} · 转职</h1>
              <span className="tag tag-grey">{cls.name} · {cls.stage} 阶 · Lv {entry.unit.level}</span>
              <span className="tag tag-grey">{UNIT_TRAITS[entry.unit.id ?? entry.unit.character]?.growthTypeName ?? GROWTH_TYPE_NAMES[CHARACTERS[entry.unit.character].growthType]}</span>
            </div>
            <div style={{ fontSize: 13, color: '#4E473D', marginTop: 2 }}>查看推荐职业，保留总等级与经验。人物最高 Lv99，HP 上限150，其他属性上限99。</div>
          </div>
        </div>
        <ProfileTabs entry={entry} current="promote" />
        <div className="cond">
          <span className={ready ? 'ok' : 'no'}>{ready && <CheckIcon />}{chosen ? '可预览推荐职业' : '此推荐路径暂无后续职业，可在职业资格中选择其他职业。'}</span>
          <span>任何职业均可升至 Lv99。转职保留等级、经验和已有属性，只改变后续成长。</span>
          <span>按年份开放后购买资格，已购资格可免费切换；推荐路径不是购买其他职业的前置条件。</span>
          {chosen && !qualified && <a href={links.roster(entry.unit.id ?? entry.unit.character, 'classes')}>尚未拥有该资格，前往职业资格购买。</a>}
        </div>
      </section>

      <div className="opts">
        {options.map((o, i) => <OptionCard key={o.name} entry={entry} option={o} chosen={o === chosen} onPick={() => setPick(i)} />)}
      </div>

      {chosen && <section className="panel promo-confirm" aria-label="确认转职">
        <img className="px" src={weaponIcon(Object.keys(chosen.weapons)[0] as WeaponType)} width={32} height={32} alt="" />
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>已选择：{cls.name} → {chosen.name}</div>
          <div style={{ fontSize: 13, color: '#4E473D' }}>
            转职不会补发属性或经验。可以保持当前职业一直升到 Lv99。
          </div>
        </div>
        <a className="btn btn-ghost" href={links.roster(entry.unit.id ?? entry.unit.character)}>暂不转职</a>
        <button type="button" className="btn btn-primary btn-lg" disabled={!ready || busy} onClick={async () => {
          const u = serverUnit(entry.unit.id ?? entry.unit.character);
          if (!u) return;
          setBusy(true);
          try { await session.run(OP.PROMOTE, { unitId: u.id, promotion: chosen.to }); setPick(0); toast(`已转职为${chosen.name}`); }
          catch (e) { toast(`转职失败：${e instanceof Error ? e.message : String(e)}`); }
          finally { setBusy(false); }
        }}>确认转职为{chosen.name}</button>
      </section>}
    </Shell>
  );
}
