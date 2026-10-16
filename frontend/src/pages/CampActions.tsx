import { useState } from 'react';
import { WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import type { WeaponType } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { GAME_ITEMS } from '@common/game/items.ts';
import type { ItemKey } from '@common/game/items.ts';
import { OP } from '@common/protocol/ops.ts';
import { ICONS } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { ServerToday, ServerUnit, TodayAction } from '../api/session.ts';
import { links } from '../router.ts';
import { advance, arenaTodayWarning, dateLabel } from '../ui/calendar.ts';
import { toast } from '../ui/toast.tsx';

const ICON: Record<TodayAction['key'], string> = { sortie: ICONS.sortie, sweep: ICONS.sweep, train: ICONS.train, rest: ICONS.rest, recruit: ICONS.travel };
const REST_MAX = 120;

type Region = ServerToday['sortieRegions'][number];
interface SweepResult { items: { item: ItemKey; count: number }[] }
interface TrainResult { weaponType: WeaponType; rankBefore: string; rankAfter: string }
interface RestResult { days: number }
interface RecruitResult { success: boolean; fails?: number; unit?: { name: string; className: string; level: number } }

const weaponTypes = (unit: ServerUnit | undefined): WeaponType[] =>
  unit ? [...new Set(unit.snapshot.weapons.map(w => WEAPONS[w].type))] : [];

// 军营 · 行动 (docs/00 §9.1): GET_TODAY's list with the real day and gold costs. Every action moves the
// personal date, so each row says where it lands before anything is spent (docs/00 §11).
export function CampActions() {
  const { today, state } = useSession();
  const [sweepRegion, setSweepRegion] = useState<number | null>(null);
  const [times, setTimes] = useState(1);
  const [unitId, setUnitId] = useState('');
  const [weapon, setWeapon] = useState<WeaponType | null>(null);
  const [restDays, setRestDays] = useState(1);
  const [travelRegion, setTravelRegion] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!today || !state) {
    return (
      <section className="panel" aria-labelledby="acts-h">
        <div className="ph"><h2 id="acts-h">行动</h2></div>
        <p style={{ padding: '12px 16px', fontSize: 13, color: '#6A6256' }}>暂时读不到今天的行动（GET_TODAY），刷新页面再试。</p>
      </section>
    );
  }

  const regions = today.sortieRegions;
  const cleared = regions.filter(r => r.cleared);
  const sweepId = cleared.some(r => r.id === sweepRegion) ? sweepRegion : cleared[0]?.id ?? null;
  const active = state.units.filter(u => u.status === 'active');
  const trainee = active.find(u => u.id === unitId) ?? active[0];
  const types = weaponTypes(trainee);
  const trainType = weapon && types.includes(weapon) ? weapon : types[0];
  const warning = arenaTodayWarning();

  async function act<T>(key: string, op: number, data: Record<string, unknown>, done: (result: T) => string) {
    setBusy(key);
    setError(null);
    try {
      toast(done(await session.run<T>(op, data)));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast(`操作失败：${message}`);
    } finally {
      setBusy(null);
    }
  }

  const spend = (a: TodayAction): number => (a.key === 'sweep' ? a.costDays * times : a.key === 'rest' ? restDays : a.costDays);
  const regionSelect = (label: string, value: number | null, list: Region[], onChange: (id: number) => void) => (
    <select aria-label={label} value={value ?? ''} onChange={e => onChange(Number(e.target.value))}>
      {list.map(r => <option key={r.id} value={r.id}>{r.name}（Lv {r.level}）</option>)}
    </select>
  );

  function controls(a: TodayAction) {
    switch (a.key) {
      case 'sweep':
        return cleared.length > 0 && <>
          {regionSelect('扫荡地区', sweepId, cleared, setSweepRegion)}
          <select aria-label="扫荡次数" value={times} onChange={e => setTimes(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => <option key={i} value={i + 1}>× {i + 1}</option>)}
          </select>
        </>;
      case 'train':
        return <>
          <select aria-label="训练单位" value={trainee?.id ?? ''} onChange={e => { setUnitId(e.target.value); setWeapon(null); }}>
            {active.map(u => <option key={u.id} value={u.id}>{u.name} · {u.className}</option>)}
          </select>
          {types.length > 1 && (
            <select aria-label="训练武器" value={trainType} onChange={e => setWeapon(e.target.value as WeaponType)}>
              {types.map(t => <option key={t} value={t}>{WEAPON_TYPE_NAMES[t]}（{trainee?.snapshot.ranks[t] ?? 'E'}）</option>)}
            </select>
          )}
        </>;
      case 'rest':
        return (
          <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>
            <input type="number" aria-label="休整天数" min={1} max={REST_MAX} value={restDays}
              onChange={e => setRestDays(Math.max(1, Math.min(REST_MAX, Math.floor(Number(e.target.value)) || 1)))} />日
          </label>
        );
      case 'recruit':
        return regionSelect('游历地区', travelRegion, regions, setTravelRegion);
      default:
        return null;
    }
  }

  function button(a: TodayAction) {
    const off = busy !== null || !a.available;
    switch (a.key) {
      case 'sortie':
        return <a className="btn btn-sm" href={links.field}>{a.available ? '选择地区与队伍' : '继续战斗'}</a>;
      case 'sweep':
        return <button type="button" className="btn btn-sm" disabled={off || sweepId === null}
          onClick={() => act<SweepResult>('sweep', OP.SWEEP, { region: sweepId, times },
            r => `扫荡完成：${r.items.map(i => `${GAME_ITEMS[i.item]?.name ?? i.item} ×${i.count}`).join('、')}`)}>扫荡</button>;
      case 'train':
        return <button type="button" className="btn btn-sm" disabled={off || !trainee || state!.gold < (a.costGold ?? 0)}
          onClick={() => act<TrainResult>('train', OP.TRAIN, { unitId: trainee!.id, weaponType: trainType },
            r => `${trainee!.name}完成${WEAPON_TYPE_NAMES[r.weaponType]}训练（${r.rankBefore} → ${r.rankAfter}）`)}>训练</button>;
      case 'rest':
        return <button type="button" className="btn btn-sm" disabled={off}
          onClick={() => act<RestResult>('rest', OP.REST, { days: restDays }, r => `休整了 ${r.days} 日`)}>休整</button>;
      case 'recruit':
        return <button type="button" className="btn btn-sm" disabled={off}
          onClick={() => act<RecruitResult>('recruit', OP.RECRUIT, { region: travelRegion },
            r => (r.success && r.unit ? `遇到了${r.unit.name}（${r.unit.className} Lv ${r.unit.level}），已加入名册` : `这次没有遇到新人（已连续 ${r.fails ?? 1} 次）`))}>游历</button>;
    }
  }

  return (
    <section className="panel" aria-labelledby="acts-h">
      <div className="ph">
        <h2 id="acts-h">行动 <span style={{ fontSize: 13, fontWeight: 400, color: '#6A6256' }}>· 每项都会推进个人日期</span></h2>
        <span style={{ fontSize: 13, color: '#4E473D' }}>今天 <b>{dateLabel(today.day)}</b></span>
      </div>
      {warning && <p className="a-warn" role="note">{warning}</p>}
      <ul>
        {today.actions.map(a => {
          const to = advance(today.day, spend(a));
          const poor = a.key === 'train' && state.gold < (a.costGold ?? 0);
          return (
            <li key={a.key} className="act" data-action={a.key}>
              <img className="px" src={ICON[a.key]} width={32} height={32} alt="" />
              <div className="min-w-0">
                <div>
                  <span className="a-name">{a.name}</span>
                  <span className={a.available && !poor ? 'a-desc' : 'a-why'}>{poor ? `金币不足，需要 ${a.costGold}` : a.note}{a.costGold && !poor ? ` · 每次 ${a.costGold} 金币` : ''}</span>
                </div>
                <div className="a-opts">
                  {controls(a)}
                  <span className="cost"><img className="px" src={ICONS.hourglass} width={12} height={12} alt="" />{spend(a)} 日 → {to.label}</span>
                  {to.passes && <span className="a-pass">{to.passes}</span>}
                </div>
              </div>
              {button(a)}
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" style={{ padding: '0 14px 10px', fontSize: 13, color: '#93392F' }}>{error}</p>}
    </section>
  );
}
