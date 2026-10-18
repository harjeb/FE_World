import { useState } from 'react';
import { CLASSES, classUnavailableReason, hasClassQualification } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { promotionsFor } from '@common/data/promotions.ts';
import type { Promotion } from '@common/data/promotions.ts';
import { MOVE_TYPE_NAMES, STAT_KEYS, STAT_NAMES, WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import type { WeaponType } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { OP } from '@common/protocol/ops.ts';
import { weaponIcon } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { ClassMarketRow, ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { busyReason } from '../model/roster.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { CheckIcon } from '../ui/icons.tsx';
import { toast } from '../ui/toast.tsx';
import { asUnit, combatLine } from './profile.ts';
import { ProfileTabs } from './RosterParts.tsx';
import { UnitFace } from './SystemParts.tsx';

const trend = (d: number) => (d > 0 ? <i className="d-up">▲{d}</i> : d < 0 ? <i className="d-dn">▼{-d}</i> : <i className="d-eq">=</i>);

function OptionCard({ unit, option, market, chosen, onPick }: { unit: ServerUnit; option: Promotion; market: ClassMarketRow[] | null; chosen: boolean; onPick: () => void }) {
  const cls = CLASSES[unit.classId as ClassId];
  const after = { ...unit.snapshot, classId: option.to, stats: { ...unit.snapshot.stats } };
  const line = combatLine(asUnit(after), option.mods);
  // 合计成长：服务端按该职业重算的数值（含个人、分配、装备与年龄修正），转职前后都用同一来源。
  const next = market?.find(c => c.id === option.to)?.growth ?? null;
  const owned = hasClassQualification(unit.classQualifications as ClassId[], option.to);
  return (
    <section className={`opt${chosen ? ' on' : ''}`} aria-label={option.name}>
      <div className="o-head">
        <img className="px" src={weaponIcon(Object.keys(option.weapons)[0] as WeaponType)} width={48} height={48} alt="" />
        <div className="min-w-0 flex-1">
          <h2 className="serif o-name">{option.name}</h2>
          <div className="o-tag">{option.tagline} · {owned ? <b style={{ color: '#45603B' }}>已拥有资格</b> : '尚未购买资格'}</div>
        </div>
        <button type="button" className="btn pick" aria-pressed={chosen} onClick={onPick}>{chosen ? '✓ 已选择' : `选择${option.name}`}</button>
      </div>
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
        <div className="o-k"><span>今后的合计成长</span><span style={{ fontWeight: 500 }}>与{cls.name}相比</span></div>
        {next
          ? <div className="grow">
            {STAT_KEYS.map(k => <div key={k}><span>{STAT_NAMES[k]}</span><b>{next[k]}% {trend(next[k] - (unit.totalGrowth[k] ?? 0))}</b></div>)}
          </div>
          : <p style={{ fontSize: 13, color: '#6A6256' }}>读取服务端成长…</p>}
      </div>
      <div className="o-sec" style={{ fontSize: 13, color: '#4E473D' }}>
        {line
          ? <div>转职后（{WEAPONS[line.weapon].name}）：<b>攻击 {line.attack} · 命中 {line.hit} · 必杀 {line.crit} · 攻速 {line.attackSpeed}</b></div>
          : <div>转职后治疗量：<b>{after.stats.mag + 10}</b>（魔 + 10）</div>}
      </div>
    </section>
  );
}

// Five class stages share one character level, from 1 through 99. Promotion is SWITCH_CLASS to the next
// stage: it needs the qualification, keeps level, experience and attributes, and only changes later growth.
export function PromotePage({ unit: wanted }: { unit: string }) {
  const { state, annual } = useSession();
  const active = state?.units.filter(u => u.status === 'active') ?? [];
  const unit = active.find(u => u.id === wanted) ?? active.find(u => u.character === wanted);
  const { data: market } = useServerData(() => (unit ? session.classMarket(unit.id) : Promise.resolve(null)), [unit?.id]);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  if (!unit) return <Shell current="roster"><p style={{ color: '#4E473D' }}>找不到这名角色。</p></Shell>;
  const options = promotionsFor(unit.classId as ClassId);
  const chosen = options[Math.min(pick, options.length - 1)];
  const cls = CLASSES[unit.classId as ClassId];
  const qualified = !!chosen && hasClassQualification(unit.classQualifications as ClassId[], chosen.to);
  const away = busyReason(unit, annual);
  const ready = !!chosen && qualified && !classUnavailableReason(chosen.to) && !away;
  return (
    <Shell current="roster">
      <section className="panel" aria-labelledby="who-h">
        <div className="flex flex-wrap items-center gap-3.5" style={{ padding: '12px 16px' }}>
          <UnitFace unit={unit} size={64} />
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h1 id="who-h" className="serif" style={{ fontSize: 24 }}>{unit.name} · 转职</h1>
              <span className="tag tag-grey">{cls.name} · {cls.stage} 阶 · Lv {unit.level}</span>
              <span className="tag tag-grey">{unit.growthTypeName}</span>
            </div>
            <div style={{ fontSize: 13, color: '#4E473D', marginTop: 2 }}>推荐的下一阶职业；转职保留总等级与经验。人物最高 Lv99，HP 上限 150，其他属性上限 99。</div>
          </div>
        </div>
        <ProfileTabs unit={unit} current="promote" />
        <div className="cond">
          <span className={ready ? 'ok' : 'no'}>{ready && <CheckIcon />}{chosen ? (qualified ? '已拥有资格，可以转职' : '需要先购买资格') : '这条路线没有后续职业，可在职业资格里选择其他职业。'}</span>
          <span>任何职业都能升到 Lv99。转职保留等级、经验和已有属性，只改变之后的成长与武器上限。</span>
          {away && <span>{unit.name}{away}，现在不能换职。</span>}
          {chosen && !qualified && <a href={links.roster(unit.id, 'classes')}>前往职业资格购买「{chosen.name}」。</a>}
        </div>
      </section>

      <div className="opts">
        {options.map((o, i) => <OptionCard key={o.to} unit={unit} option={o} market={market?.classes ?? null} chosen={o === chosen} onPick={() => setPick(i)} />)}
      </div>

      {chosen && <section className="panel promo-confirm" aria-label="确认转职">
        <img className="px" src={weaponIcon(Object.keys(chosen.weapons)[0] as WeaponType)} width={32} height={32} alt="" />
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>已选择：{cls.name} → {chosen.name}</div>
          <div style={{ fontSize: 13, color: '#4E473D' }}>转职不会补发属性或经验，也可以保持当前职业一直升到 Lv99。</div>
        </div>
        <a className="btn btn-ghost" href={links.roster(unit.id)}>暂不转职</a>
        <button type="button" className="btn btn-primary btn-lg" disabled={!ready || busy} onClick={async () => {
          setBusy(true);
          try { await session.run(OP.PROMOTE, { unitId: unit.id, promotion: chosen.to }); setPick(0); toast(`已转职为${chosen.name}`); }
          catch (e) { toast(`转职失败：${e instanceof Error ? e.message : String(e)}`); }
          finally { setBusy(false); }
        }}>确认转职为{chosen.name}</button>
      </section>}
    </Shell>
  );
}
