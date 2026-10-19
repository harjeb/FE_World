import { useState } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import type { WeaponType } from '@common/data/types.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import { DAYS_PER_YEAR } from '@common/game/calendar.ts';
import { GAME_ITEMS } from '@common/game/items.ts';
import type { ItemKey } from '@common/game/items.ts';
import { OP } from '@common/protocol/ops.ts';
import { ICONS } from '../assets.ts';
import { session, useSession } from '../api/session.ts';
import type { PendingRecruit, ServerToday, ServerUnit, TodayAction } from '../api/session.ts';
import { annualLive, busyReason } from '../model/roster.ts';
import { featuresOf } from '../model/access.ts';
import { links } from '../router.ts';
import { advance, arenaTodayWarning, dateLabel } from '../ui/calendar.ts';
import { toast } from '../ui/toast.tsx';
import { Face } from './SystemParts.tsx';

const ICON: Record<TodayAction['key'], string> = { sortie: ICONS.sortie, sweep: ICONS.sweep, train: ICONS.train, rest: ICONS.rest, recruit: ICONS.travel };
const REST_MAX = 500;
const SPECIES = { human: '人类', beast: '兽人', dragon: '龙人' } as const;

type Region = ServerToday['sortieRegions'][number];
interface SweepResult { items: { item: ItemKey; count: number }[] }
interface TrainResult { weaponType: WeaponType; rankBefore: string; rankAfter: string }
interface RestResult { days: number }
interface RecruitResult { success: boolean; fails?: number; pending?: { candidate: { name: string; classId: string }; level: number } }

const weaponTypes = (unit: ServerUnit | undefined): WeaponType[] =>
  unit ? [...new Set(unit.snapshot.weapons.map(w => WEAPONS[w].type))].filter(t => CLASSES[unit.classId as ClassId]?.weapons[t]) : [];

// 游历候选（ACCEPT_RECRUIT／DECLINE_RECRUIT）：成功后先保存在服务端，接受前不会重掷，名册满时保留。
export function RecruitCard({ pending }: { pending: PendingRecruit }) {
  const { state } = useSession();
  const [busy, setBusy] = useState<string | null>(null);
  const full = (state?.units.filter(u => u.status === 'active').length ?? 0) >= (state?.rosterLimit ?? 18);
  const run = async (key: string, op: number, done: string) => {
    setBusy(key);
    try { await session.run(op, key === 'accept' ? { id: pending.id } : {}); toast(done); }
    catch (e) { toast(`操作失败：${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(null); }
  };
  return (
    <div className="recruit-card" id="recruit-card" role="group" aria-label="游历候选">
      <Face character={pending.portrait} classId={pending.classId} portrait={pending.portrait} size={48} />
      <div className="min-w-0">
        <div className="rc-n">{pending.name} <span className="tag tag-brass">{pending.className} · Lv {pending.level}</span></div>
        <div className="rc-s">{pending.sex === 'female' ? '女' : '男'} · {SPECIES[pending.species]} · 在{pending.regionName}遇到（{dateLabel(pending.day)}）</div>
        <div className="rc-s">{full ? `名册已满（${state?.rosterLimit} 人）：先解雇或退役一人再接受，候选会一直保留。` : '接受后以当前日期加入；拒绝不退还已花的日期，之后可以重新游历。'}</div>
      </div>
      <div className="rc-acts">
        <button type="button" className="btn btn-sm btn-ghost" disabled={busy !== null} onClick={() => void run('decline', OP.DECLINE_RECRUIT, `拒绝了${pending.name}`)}>{busy === 'decline' ? '处理中…' : '拒绝'}</button>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null || full} onClick={() => void run('accept', OP.ACCEPT_RECRUIT, `${pending.name}加入了名册`)}>{busy === 'accept' ? '加入中…' : '接受'}</button>
      </div>
    </div>
  );
}

// 军营 · 行动 (docs/00 §9.1): GET_TODAY's list with the real day and gold costs. Every action moves the
// personal date, so each row says where it lands before anything is spent (docs/00 §11).
export function CampActions() {
  const { today, state, annual } = useSession();
  const [sweepRegion, setSweepRegion] = useState<number | null>(null);
  const [times, setTimes] = useState(1);
  const [unitId, setUnitId] = useState('');
  const [weapon, setWeapon] = useState<WeaponType | null>(null);
  const [restDays, setRestDays] = useState(1);
  const [travelRegion, setTravelRegion] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!today || !state) {
    return (
      <section className="panel" aria-labelledby="acts-h">
        <div className="ph"><h2 id="acts-h">行动</h2></div>
        <p style={{ padding: '12px 16px', fontSize: 13, color: '#6A6256' }}>暂时读不到今天的行动，刷新页面再试。</p>
      </section>
    );
  }

  const regions = today.sortieRegions;
  const features = featuresOf(state);
  // 只显示仍开放的功能：出击入口（features.field）与后台派遣（features.dispatch）。
  const visible = today.actions.filter(a => a.key === 'sortie' ? features.field
    : a.key === 'sweep' ? regions.some(region => region.cleared)
      : a.key === 'recruit' ? state.day >= DAYS_PER_YEAR && regions.length > 0 : true);
  const cleared = regions.filter(r => r.cleared);
  const sweepId = cleared.some(r => r.id === sweepRegion) ? sweepRegion : cleared[0]?.id ?? null;
  // 游历地区只在已开通的地区里选；默认第一个已开通地区。
  const travel = regions.some(r => r.id === travelRegion) ? travelRegion : regions[0]?.id ?? null;
  // 派遣中的角色不能参加武器专项训练（TRAIN）。
  const trainees = state.units.filter(u => u.status === 'active' && !u.lockedDispatchId);
  const trainee = trainees.find(u => u.id === unitId) ?? trainees[0];
  const types = weaponTypes(trainee);
  const trainType = weapon && types.includes(weapon) ? weapon : types[0];
  const warning = arenaTodayWarning();
  const locked = annualLive(annual);

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
            {trainees.map(u => <option key={u.id} value={u.id}>{u.name} · {u.className}{busyReason(u, annual) ? `（${busyReason(u, annual)}）` : ''}</option>)}
          </select>
          {types.length > 1 && (
            <select aria-label="训练武器" value={trainType} onChange={e => setWeapon(e.target.value as WeaponType)}>
              {types.map(t => <option key={t} value={t}>{WEAPON_TYPE_NAMES[t]}（{trainee?.ranks[t] ?? 'E'}）</option>)}
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
        return !state!.pendingRecruit && regions.length > 0 && regionSelect('游历地区', travel, regions, setTravelRegion);
      default:
        return null;
    }
  }

  function button(a: TodayAction) {
    const off = busy !== null || !a.available || locked;
    switch (a.key) {
      case 'sortie':
        return <a className="btn btn-sm" href={links.field}>{today!.battle?.kind === 'field' ? '继续战斗' : '选择地区与队伍'}</a>;
      case 'sweep':
        return <button type="button" className="btn btn-sm" disabled={off || sweepId === null}
          onClick={() => act<SweepResult>('sweep', OP.SWEEP, { region: sweepId, times },
            r => `扫荡完成：${r.items.map(i => `${GAME_ITEMS[i.item]?.name ?? i.item} ×${i.count}`).join('、')}`)}>扫荡</button>;
      case 'train':
        return <button type="button" className="btn btn-sm" disabled={off || !trainee || !trainType || state!.gold < (a.costGold ?? 0)}
          onClick={() => act<TrainResult>('train', OP.TRAIN, { unitId: trainee!.id, weaponType: trainType },
            r => `${trainee!.name}完成${WEAPON_TYPE_NAMES[r.weaponType]}训练（${r.rankBefore} → ${r.rankAfter}）`)}>训练</button>;
      case 'rest':
        return <button type="button" className="btn btn-sm" disabled={off}
          onClick={() => act<RestResult>('rest', OP.REST, { days: restDays }, r => `休整了 ${r.days} 日`)}>休整</button>;
      case 'recruit':
        return <button type="button" className="btn btn-sm" disabled={off || travel === null}
          onClick={() => act<RecruitResult>('recruit', OP.RECRUIT, { region: travel },
            r => (r.success && r.pending ? `遇到了${r.pending.candidate.name}（Lv ${r.pending.level}），请决定是否接受` : `这次没有遇到新人（本地区已连续 ${r.fails ?? 1} 次）`))}>游历</button>;
    }
  }

  return (
    <section className="panel" aria-labelledby="acts-h">
      <div className="ph">
        <h2 id="acts-h">行动 <span style={{ fontSize: 13, fontWeight: 400, color: '#6A6256' }}>· 每项都会推进个人日期</span></h2>
        <span style={{ fontSize: 13, color: '#4E473D' }}>今天 <b>{dateLabel(today.day)}</b></span>
      </div>
      {locked && <p className="a-warn" role="note">大竞技场进行中，日历行动暂停；打完或退出本届后恢复。</p>}
      {!locked && warning && <p className="a-warn" role="note">{warning}</p>}
      <ul>
        {visible.map(a => {
          const to = advance(today.day, spend(a));
          const poor = a.key === 'train' && state.gold < (a.costGold ?? 0);
          const pending = a.key === 'recruit' ? state.pendingRecruit : null;
          return (
            <li key={a.key} className="act" data-action={a.key}>
              <img className="px" src={ICON[a.key]} width={32} height={32} alt="" />
              <div className="min-w-0">
                <div>
                  <span className="a-name">{a.name}</span>
                  <span className={a.available && !poor ? 'a-desc' : 'a-why'}>{poor ? `金币不足，需要 ${a.costGold}` : a.note}{a.costGold && !poor ? ` · 每次 ${a.costGold} 金币` : ''}</span>
                </div>
                {pending
                  ? <RecruitCard pending={pending} />
                  : (
                    <div className="a-opts">
                      {controls(a)}
                      <span className="cost"><img className="px" src={ICONS.hourglass} width={12} height={12} alt="" />{spend(a)} 日 → {to.label}</span>
                      {to.passes && <span className="a-pass">{to.passes}</span>}
                    </div>
                  )}
              </div>
              {pending ? <span /> : button(a)}
            </li>
          );
        })}
        <li className="act" data-action="art-training">
          <img className="px" src={ICONS.train} width={32} height={32} alt="" />
          <div className="min-w-0">
            <div><span className="a-name">战技研修</span><span className="a-desc">学会基础战技后，花费日期与金币研修进阶战技；在精通页查看前置、效果和报价</span></div>
            <div className="a-opts">{trainee ? `研修单位：${trainee.name}（使用上方训练单位选择）` : '暂无可研修单位'}</div>
          </div>
          {trainee && <a className="btn btn-sm" href={links.roster(trainee.id, 'mastery')}>查看研修</a>}
        </li>
        {features.dispatch && <li className="act" data-action="dispatch">
          <img className="px" src={ICONS.travel} width={32} height={32} alt="" />
          <div className="min-w-0">
            <div><span className="a-name">后台派遣</span><span className="a-desc">自动探索／职业训练：不推进日期，按返程日一次结算；派出期间这些人不能参加其他战斗</span></div>
          </div>
          <a className="btn btn-sm" href={links.dispatch}>安排派遣</a>
        </li>}
      </ul>
      {error && <p role="alert" style={{ padding: '0 14px 10px', fontSize: 13, color: '#93392F' }}>{error}</p>}
    </section>
  );
}
