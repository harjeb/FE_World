import { useState } from 'react';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import type { ItemId, WeaponId } from '@common/data/weapons.ts';
import { portraitFor, spriteFor } from '../assets.ts';
import { useSession } from '../api/session.ts';
import type { ServerUnit } from '../api/session.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { advance, arenaTodayWarning, dateLabel } from '../ui/calendar.ts';

const DEFAULT_TEAM = 6;

function UnitRow({ unit, picked, locked, protagonist, onToggle }: { unit: ServerUnit; picked: boolean; locked: boolean; protagonist: boolean; onToggle: () => void }) {
  const looks = { classId: unit.snapshot.classId, side: 'player' as const, character: unit.character };
  const items = unit.snapshot.items.map(i => `${ITEMS[i.id as ItemId]?.name ?? i.id}（${i.uses}）`);
  return (
    <li>
      <label className={`tm${picked ? ' on' : ''}${locked ? ' off' : ''}`}>
        <input type="checkbox" checked={picked} disabled={locked} onChange={onToggle} />
        <span className="pf ally" style={{ width: 40, height: 40 }}><img className="px" src={portraitFor(looks) ?? spriteFor(looks)} width={48} height={48} alt="" /></span>
        <span className="min-w-0">
          <span className="tm-n">{unit.name}{protagonist && <span className="tag tag-brass">主角</span>}</span>
          <span className="tm-s">{unit.className} · Lv {unit.level} · HP {unit.maxHp}{unit.equipped ? ` · ${WEAPONS[unit.equipped as WeaponId].name}` : ''}</span>
          <span className="tm-s">携带：{items.length > 0 ? items.join('、') : '无'}</span>
        </span>
      </label>
    </li>
  );
}

// The two ways out of camp: one field battle, or a three-map dungeon with a fixed team.
export function FieldTabs({ current }: { current: 'field' | 'dungeon' }) {
  return (
    <nav className="ptabs field-tabs" aria-label="出击方式">
      <a className="ptab" href={links.field} aria-current={current === 'field' ? 'page' : undefined}>野外遭遇战 <span className="tag tag-grey">单场</span></a>
      <a className="ptab" href={links.dungeon} aria-current={current === 'dungeon' ? 'page' : undefined}>三图大副本 <span className="tag tag-grey">连续 3 图</span></a>
    </nav>
  );
}

// 出征准备 (docs/00 §11「出征前展示胜负条件、回合截止、真实死亡风险及携带保命道具」): nothing is
// spent until 确认出征. Every number here comes from GET_TODAY / GET_STATE.
export function SortiePrep({ busy, error, onStart }: { busy: boolean; error: string | null; onStart: (region: number, unitIds: string[]) => void }) {
  const { today, state } = useSession();
  const active = state?.units.filter(u => u.status === 'active') ?? [];
  const sortie = today?.actions.find(a => a.key === 'sortie');
  const max = sortie?.maxUnits ?? DEFAULT_TEAM;
  const [region, setRegion] = useState(1);
  const [team, setTeam] = useState<string[]>(() => active.slice(0, Math.min(DEFAULT_TEAM, max)).map(u => u.id));

  if (!today || !state || !sortie) {
    return (
      <Shell current="field">
        <section className="panel" style={{ padding: 16 }}>
          <p style={{ fontSize: 14 }}>暂时读不到出击信息（GET_TODAY），刷新页面再试。</p>
          <a className="btn btn-ghost" href={links.camp} style={{ marginTop: 10 }}>返回军营</a>
        </section>
      </Shell>
    );
  }

  const target = today.sortieRegions.find(r => r.id === region) ?? today.sortieRegions[0];
  const picked = active.filter(u => team.includes(u.id));
  const cleared = today.sortieRegions.filter(r => r.cleared).length;
  const top = Math.max(0, ...picked.map(u => u.level));
  const avg = picked.length > 0 ? Math.round(picked.reduce((sum, u) => sum + u.level, 0) / picked.length) : 0;
  const lead = active.find(u => u.character === state.player.protagonist);
  const to = advance(today.day, sortie.costDays);
  const warning = arenaTodayWarning();
  const toggle = (id: string) => setTeam(t => (t.includes(id) ? t.filter(x => x !== id) : t.length < max ? [...t, id] : t));

  return (
    <Shell current="field">
      <div className="prep">
        <FieldTabs current="field" />
        <div className="brief-head">
          <div>
            <div className="eyebrow">出击 · 野外遭遇战</div>
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>出征准备</h1>
            <p style={{ fontSize: 14, color: '#4E473D' }}>选好地区和队伍再确认。确认后立即推进 {sortie.costDays} 日并开战，撤退或战败也不退回日期。</p>
          </div>
          <div style={{ fontSize: 13, color: '#4E473D' }}>今天 <b>{dateLabel(today.day)}</b></div>
        </div>

        {!sortie.available && <p className="a-warn panel" role="alert">{sortie.note}</p>}

        <div className="prep-cols">
          <section className="panel" aria-labelledby="rg-h">
            <div className="ph"><h2 id="rg-h">选择地区</h2><span style={{ fontSize: 12, color: '#6A6256' }}>已讨伐 {cleared} / {today.sortieRegions.length}</span></div>
            <div className="regions" role="radiogroup" aria-label="出征地区">
              {today.sortieRegions.map(r => (
                <button key={r.id} type="button" role="radio" aria-checked={r.id === target.id} className="rg" onClick={() => setRegion(r.id)}>
                  <span className="rg-n">{r.name}</span>
                  <span className="rg-l">敌 Lv {r.level}</span>
                  <span className="rg-r">{r.resource}</span>
                  <span className={`tag ${r.cleared ? 'tag-green' : 'tag-grey'}`}>{r.cleared ? '已讨伐' : '未讨伐'}</span>
                </button>
              ))}
            </div>
            <p className="pfoot">首次获胜解锁地区。敌军按出发日期成长，前期快、后期慢：第一年结束约20级；同一场战斗内等级不变。</p>
          </section>

          <section className="panel" aria-labelledby="tm-h">
            <div className="ph">
              <h2 id="tm-h">出战队伍 <span style={{ fontWeight: 500, color: '#6A6256' }}>{picked.length} / {max}</span></h2>
              <span style={{ fontSize: 12, color: '#6A6256' }}>敌方人数与出战人数相同</span>
            </div>
            <ul className="team" aria-label="现役单位">
              {active.map(u => (
                <UnitRow key={u.id} unit={u} picked={team.includes(u.id)} locked={!team.includes(u.id) && team.length >= max}
                  protagonist={u.character === state.player.protagonist} onToggle={() => toggle(u.id)} />
              ))}
            </ul>
          </section>
        </div>

        <section className="panel prep-go" aria-label="确认出征">
          <dl className="facts">
            <dt>胜利条件</dt><dd>{sortie.goalText ?? '击败敌方主将'} · 回合上限 {sortie.turnLimit ?? '—'}</dd>
            <dt>敌方等级</dt>
            <dd className={picked.length > 0 && target.level > top ? 'risk' : undefined}>
              {target.name} 敌 Lv {target.level}；我方最高 Lv {top}、平均 Lv {avg}{picked.length > 0 && target.level > top ? `，敌方高出 ${target.level - top} 级` : ''}
            </dd>
            <dt>日期</dt><dd>{sortie.costDays} 日 → {to.label}{to.passes ? `；${to.passes}` : ''}</dd>
            {sortie.lethal && <><dt>阵亡</dt><dd className="risk">倒下的角色永久死亡，撤退只能保住还活着的人{lead ? `（主角${lead.name}倒下只撤退，不会死亡）` : ''}。</dd></>}
          </dl>
          {warning && <p className="a-warn" role="note">{warning}</p>}
          {error && <p role="alert" style={{ padding: '0 16px', fontSize: 13, color: '#93392F' }}>{error}</p>}
          <div className="go-bar">
            <a className="btn btn-ghost" href={links.camp}>返回军营</a>
            <button type="button" className="btn btn-primary btn-lg" disabled={busy || !sortie.available || picked.length === 0}
              onClick={() => onStart(target.id, picked.map(u => u.id))}>
              {busy ? '出征中…' : `确认出征 · ${target.name} · ${picked.length} 人`}
            </button>
          </div>
        </section>
      </div>
    </Shell>
  );
}
