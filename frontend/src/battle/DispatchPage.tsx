import { useState } from 'react';
import { CHARACTERS } from '@common/data/characters.ts';
import { CLASSES, canonicalClassId, classEntryReason, classUnavailableReason } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { WEAPON_TYPE_NAMES } from '@common/data/types.ts';
import type { WeaponType } from '@common/data/types.ts';
import { regionById } from '@common/game/calendar.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { DispatchView, ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { annualLive, busyReason } from '../model/roster.ts';
import { itemName, TeamPicker, UnitFace, useAct } from '../pages/SystemParts.tsx';
import { links, regionInHash } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { FieldTabs } from './SortiePrep.tsx';

// Classes every picked unit may train as: its current class, its home class or a bought qualification
// (handlers.ts START_DISPATCH checks the same for each unit).
function sharedClasses(units: ServerUnit[]): ClassId[] {
  if (units.length === 0) return [];
  const own = (u: ServerUnit) => new Set([canonicalClassId(u.classId as ClassId), canonicalClassId((u.homeClassId ?? CHARACTERS[u.character].classId) as ClassId), ...u.classQualifications.map(c => canonicalClassId(c as ClassId))]);
  const [first, ...rest] = units.map(own);
  return [...first].filter(id => rest.every(set => set.has(id)) && !classUnavailableReason(id)
    && units.every(u => !classEntryReason({ ...u, classId: u.classId as ClassId, homeClassId: u.homeClassId as ClassId }, id, (u.homeClassId ?? CHARACTERS[u.character].classId) as ClassId)));
}

function Report({ dispatch, units }: { dispatch: DispatchView; units: ServerUnit[] }) {
  const result = dispatch.result;
  const name = (id: string) => units.find(u => u.id === id)?.name ?? id;
  return (
    <li className="dispatch">
      <div className="dp-h">
        <b>{regionById(dispatch.region).name} · {dispatch.durationDays} 日</b>
        <span className="muted">{CLASSES[dispatch.classId as ClassId]?.name ?? dispatch.classId} · {WEAPON_TYPE_NAMES[dispatch.weaponType]}</span>
        <span className={`tag ${dispatch.state === 'running' ? 'tag-blue' : 'tag-green'}`}>{dispatch.state === 'running' ? `${plainDate(dispatch.returnDay)}返程` : `${plainDate(result?.day ?? dispatch.returnDay)}已返程`}</span>
      </div>
      <div className="dp-s">{dispatch.unitIds.map(name).join('、')}</div>
      {result && <>
        <div className="dp-s">带回：{[...result.materials, ...result.weapons].map(r => `${itemName(r.item)} ×${r.count}`).join('、') || '无'}</div>
        <ul className="dp-rows">
          {result.unitRewards.map(r => (
            <li key={r.unitId}>
              <b>{name(r.unitId)}</b> 经验 +{r.exp}{r.levelUps.length > 0 ? `（升 ${r.levelUps.length} 级）` : ''} · 精通 +{r.mastery}{r.unlocked.length > 0 ? `，学会 ${r.unlocked.join('、')}` : ''}{r.weaponRank ? ` · ${WEAPON_TYPE_NAMES[r.weaponType]}升到 ${r.weaponRank}` : ''}
            </li>
          ))}
        </ul>
      </>}
    </li>
  );
}

// 后台派遣 (docs/00 §9.1.1): send idle units out for a chosen number of days. It does not move the date;
// the dispatch settles once when the personal calendar reaches its return day.
export function DispatchPage() {
  const { state, annual } = useSession();
  const { data, error } = useServerData(() => session.dispatches(), []);
  const { busy, act } = useAct();
  const [region, setRegion] = useState<number | null>(() => regionInHash(window.location.hash));
  const [days, setDays] = useState(10);
  const [team, setTeam] = useState<string[]>([]);
  const [classId, setClassId] = useState<ClassId | ''>('');
  const [weapon, setWeapon] = useState<WeaponType | ''>('');
  if (!state) return null;
  const active = state.units.filter(u => u.status === 'active');
  const picked = active.filter(u => team.includes(u.id));
  const classes = sharedClasses(picked);
  const chosenClass = classId && classes.includes(classId) ? classId : classes[0] ?? null;
  const weapons = chosenClass ? Object.keys(CLASSES[chosenClass].weapons) as WeaponType[] : [];
  const chosenWeapon = weapon && weapons.includes(weapon) ? weapon : weapons[0] ?? null;
  const limits = data?.limits ?? { minDays: 1, maxDays: 30, maxUnits: 6 };
  const locked = annualLive(annual);
  // 只能派往已开通的地区（state.regions 就是已开通清单）；没有已开通地区时提示先开路线。
  const openRegions = state.regions;
  const regionId = openRegions.some(r => r.id === region) ? region : openRegions[0]?.id ?? null;

  return (
    <Shell current="field">
      <div className="prep">
        <FieldTabs current="dispatch" />
        <div className="brief-head">
          <div>
            <div className="eyebrow">出击 · 后台派遣 · {dateLabel(state.day)}</div>
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>自动探索与职业训练</h1>
            <p style={{ fontSize: 14, color: '#4E473D' }}>派出的人按自选天数在后台探索、训练，不推进日期。你的日历走到返程日时一次结算经验、精通、武器熟练度和带回的素材；途中这些人不能参加战斗、换职或整备。</p>
          </div>
        </div>
        {error && <p className="sys-strip">{error}</p>}
        <div className="prep-cols">
          <section className="panel" aria-labelledby="dp-h">
            <div className="ph"><h2 id="dp-h">派遣中</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{data ? `${data.running.length} 队` : '读取中…'}</span></div>
            <ul className="dispatches">
              {(data?.running ?? []).map(d => <Report key={d.id} dispatch={d} units={state.units} />)}
              {data && data.running.length === 0 && <li className="empty-row">现在没有派遣中的队伍。</li>}
            </ul>
            {data && data.history.length > 0 && <>
              <div className="grp">最近返程</div>
              <ul className="dispatches">{data.history.map(d => <Report key={d.id} dispatch={d} units={state.units} />)}</ul>
            </>}
          </section>

          <section className="panel" aria-labelledby="dpn-h">
            <div className="ph"><h2 id="dpn-h">安排派遣 <span style={{ fontWeight: 500, color: '#6A6256' }}>{picked.length} / {limits.maxUnits}</span></h2></div>
            <div className="a-opts" style={{ padding: '10px 14px 0' }}>
              <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>地区
                {openRegions.length === 0 ? <a href={links.world}>先在世界地图开通地区</a> : (
                  <select value={regionId ?? ''} onChange={e => setRegion(Number(e.target.value))} aria-label="派遣地区">
                    {openRegions.map(r => <option key={r.id} value={r.id}>{r.name}（{r.resource}）</option>)}
                  </select>
                )}
              </label>
              <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>天数
                <input type="number" min={limits.minDays} max={limits.maxDays} value={days} aria-label="派遣天数"
                  onChange={e => setDays(Math.max(limits.minDays, Math.min(limits.maxDays, Math.floor(Number(e.target.value)) || limits.minDays)))} />
                <span className="muted">（{limits.minDays}–{limits.maxDays} 日）</span>
              </label>
            </div>
            <TeamPicker units={active} team={team} max={limits.maxUnits} protagonist={state.player.protagonist} onChange={setTeam} why={u => busyReason(u, annual)} />
            <div className="a-opts" style={{ padding: '10px 14px' }}>
              <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>训练职业
                <select value={chosenClass ?? ''} onChange={e => setClassId(e.target.value as ClassId)} disabled={classes.length === 0} aria-label="训练职业">
                  {classes.length === 0 && <option value="">{picked.length === 0 ? '先勾选出发的人' : '没有共同职业'}</option>}
                  {classes.map(id => <option key={id} value={id}>{CLASSES[id].name}</option>)}
                </select>
              </label>
              <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>训练武器
                <select value={chosenWeapon ?? ''} onChange={e => setWeapon(e.target.value as WeaponType)} disabled={weapons.length === 0} aria-label="训练武器">
                  {weapons.length === 0 && <option value="">随职业而定</option>}
                  {weapons.map(t => <option key={t} value={t}>{WEAPON_TYPE_NAMES[t]}</option>)}
                </select>
              </label>
            </div>
            {picked.length > 0 && classes.length === 0 && <p className="pfoot why">所选角色没有共同可训练的职业：每人都要拥有该职业资格（或是当前／本命职业）。</p>}
            <dl className="facts">
              <dt>返程</dt><dd>{plainDate(state.day + days)}（{days} 日后，按你的日历推进）</dd>
              <dt>结算</dt><dd>素材与低概率武器带回仓库；每人获得经验、所选职业的精通与武器熟练度。派遣期间不会阵亡。</dd>
            </dl>
            <div className="go-bar">
              <div className="flex flex-wrap gap-1.5" style={{ marginRight: 'auto' }}>{picked.map(u => <UnitFace key={u.id} unit={u} size={28} />)}</div>
              <button type="button" className="btn btn-primary" disabled={busy !== null || picked.length === 0 || !chosenClass || !chosenWeapon || locked || regionId === null}
                onClick={() => void act('start', () => session.run(OP.START_DISPATCH, { region: regionId, durationDays: days, unitIds: team, classId: chosenClass, weaponType: chosenWeapon }),
                  () => `派出 ${picked.length} 人前往${regionById(regionId!).name}，${days} 日后返程`).then(ok => { if (ok) setTeam([]); })}>
                {busy === 'start' ? '出发中…' : `派遣 ${picked.length} 人 · ${days} 日`}
              </button>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
