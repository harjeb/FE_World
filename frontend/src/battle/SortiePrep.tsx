import { DeploymentOrder } from './DeploymentOrder.tsx';
import { defaultOrder, normalizeOrder, loadDeploymentOrder, saveDeploymentOrder } from './deployment-order.ts';
import type { AiDifficulty } from '@common/engine/types.ts';
import { DifficultyChoice, difficultyLabel } from './DifficultyChoice.tsx';
import { useEffect, useState } from 'react';
import { EncounterPreview, EncounterSummary } from './EncounterPreview.tsx';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import type { ItemId, WeaponId } from '@common/data/weapons.ts';
import { UnitFace } from '../pages/SystemParts.tsx';
import { session, useSession } from '../api/session.ts';
import type { ActionQuote } from '../api/session.ts';
import type { ServerUnit } from '../api/session.ts';
import { featuresOf } from '../model/access.ts';
import { links, regionInHash } from '../router.ts';
import type { FieldTab } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { advance, arenaTodayWarning, dateLabel } from '../ui/calendar.ts';
import { RegionExploration } from '../ui/RegionExploration.tsx';
import { busyReason } from '../model/roster.ts';

const DEFAULT_TEAM = 6;

function UnitRow({ unit, picked, locked, protagonist, why, order, onToggle }: { unit: ServerUnit; picked: boolean; locked: boolean; protagonist: boolean; why: string | null; order: number; onToggle: () => void }) {
  const items = unit.snapshot.items.map(i => `${ITEMS[i.id as ItemId]?.name ?? i.id}（${i.uses}）`);
  return (
    <li>
      <label className={`tm${picked ? ' on' : ''}${locked ? ' off' : ''}`}>
        <input type="checkbox" checked={picked} disabled={locked} onChange={onToggle} />
        <UnitFace unit={unit} order={order} />
        <span className="min-w-0">
          <span className="tm-n">{unit.name}{protagonist && <span className="tag tag-brass">主角</span>}</span>
          <span className="tm-s">{unit.className} · Lv {unit.level} · HP {unit.maxHp}{unit.equipped ? ` · ${WEAPONS[unit.equipped as WeaponId].name}` : ''}{why ? ` · ${why}` : ''}</span>
          <span className="tm-s">携带：{items.length > 0 ? items.join('、') : '无'}</span>
        </span>
      </label>
    </li>
  );
}

// The ways out of camp: one field battle, a three-map dungeon with a fixed team, or a background dispatch.
// 被旗标锁住的方式不显示；页面本身已在 App 层按旗标门禁。
export function FieldTabs({ current }: { current: FieldTab }) {
  const { state } = useSession();
  const f = featuresOf(state);
  return (
    <nav className="ptabs field-tabs" aria-label="出击方式">
      <a className="ptab" href={links.field} aria-current={current === 'field' ? 'page' : undefined}>野外遭遇战 <span className="tag tag-grey">单场</span></a>
      {f.dungeon && <a className="ptab" href={links.dungeon} aria-current={current === 'dungeon' ? 'page' : undefined}>三图大副本 <span className="tag tag-grey">连续 3 图</span></a>}
      {f.dispatch && <a className="ptab" href={links.dispatch} aria-current={current === 'dispatch' ? 'page' : undefined}>后台派遣 <span className="tag tag-grey">不耗日</span></a>}
    </nav>
  );
}

// 出征准备 (docs/00 §11「出征前展示胜负条件、回合截止、真实死亡风险及携带保命道具」): nothing is
// spent until 确认出征. Every number here comes from GET_TODAY / GET_STATE.
export function SortiePrep({ busy, error, onStart }: { busy: boolean; error: string | null; onStart: (quoteId: string) => void }) {
  const { today, state, annual } = useSession();
  const active = state?.units.filter(u => u.status === 'active') ?? [];
  const sortie = today?.actions.find(a => a.key === 'sortie');
  const fallbackMax = sortie?.maxUnits ?? DEFAULT_TEAM;
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('normal');
  const [regionId, setRegionId] = useState<number | null>(() => regionInHash(window.location.hash));
  const [team, setTeam] = useState<string[]>(() => defaultOrder(loadDeploymentOrder(state?.player.id), active.filter(u => !busyReason(u, annual)).map(u => u.id), fallbackMax));

  const target = today?.sortieRegions.find(r => r.id === regionId) ?? today?.sortieRegions[0];
  const hardUnlocked = !!target && state?.hardUnlocks?.regions?.includes(target.id) === true;
  const effectiveDifficulty = hardUnlocked ? aiDifficulty : 'normal';
  const plan = target?.encounters?.[effectiveDifficulty];
  const max = plan?.maxUnits ?? fallbackMax;
  const available = active.filter(u => !busyReason(u, annual));
  const selectedIds = normalizeOrder(team, available.map(u => u.id), max);
  const picked = selectedIds.map(id => available.find(u => u.id === id)!);
  const selectionKey = JSON.stringify(selectedIds);
  useEffect(() => setTeam(t => JSON.stringify(t) === selectionKey ? t : selectedIds), [selectionKey]);
  const reorder = (ids: string[]) => {
    setTeam(ids);
    if (state) saveDeploymentOrder(state.player.id, ids);
  };

  const quoteKey = JSON.stringify([target?.id, picked.map(u => u.id), state?.version, effectiveDifficulty, plan]);
  const [quoted, setQuoted] = useState<{ key: string; quote: ActionQuote } | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const quote = quoted?.key === quoteKey ? quoted.quote : null;
  useEffect(() => {
    let alive = true;
    setQuoted(null);
    setQuoteError(null);
    if (target && picked.length && sortie?.available) {
      session.quote('sortie', { region: target.id, unitIds: picked.map(u => u.id), aiDifficulty: effectiveDifficulty }).then(q => {
        if (alive) setQuoted({ key: quoteKey, quote: q });
      }).catch(e => { if (alive) setQuoteError(e instanceof Error ? e.message : String(e)); });
    }
    return () => { alive = false; };
  }, [quoteKey, sortie?.available]);

  if (!today || !state || !sortie) {
    return (
      <Shell current="field">
        <section className="panel" style={{ padding: 16 }}>
          <p style={{ fontSize: 14 }}>暂时读不到出击信息，刷新页面再试。</p>
          <a className="btn btn-ghost" href={links.camp} style={{ marginTop: 10 }}>返回军营</a>
        </section>
      </Shell>
    );
  }

  // 只在已开通的地区里选（today.sortieRegions 就是已开通清单）；没有可选地区时回世界地图开新路线。
  if (!target) {
    return (
      <Shell current="field">
        <div className="prep">
          <FieldTabs current="field" />
          <section className="panel" style={{ padding: 16 }}>
            <h1 className="serif" style={{ fontSize: 24 }}>还没有已开通的地区</h1>
            <a className="btn btn-primary" href={links.world}>打开世界地图</a>
          </section>
        </div>
      </Shell>
    );
  }
  const exploration = state.world.nodes.find(node => node.id === target.id);
  const cleared = today.sortieRegions.filter(r => r.cleared).length;
  const top = Math.max(0, ...picked.map(u => u.level));
  const avg = picked.length > 0 ? Math.round(picked.reduce((sum, u) => sum + u.level, 0) / picked.length) : 0;
  const lead = active.find(u => u.isProtagonist);
  const to = advance(today.day, sortie.costDays);
  const warning = arenaTodayWarning();
  const toggle = (id: string) => setTeam(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : selectedIds.length < max ? [...selectedIds, id] : selectedIds);

  return (
    <Shell current="field">
      <div className="prep">
        <FieldTabs current="field" />
        <div className="brief-head">
          <div>
            <div className="eyebrow">出击 · 野外遭遇战</div>
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>出征准备</h1>
          </div>
          <div style={{ fontSize: 13, color: '#4E473D' }}>今天 <b>{dateLabel(today.day)}</b></div>
        </div>

        {!sortie.available && <p className="a-warn panel" role="alert">{sortie.note}</p>}

        <div className="prep-cols">
          <section className="panel" aria-labelledby="rg-h">
            <div className="ph"><h2 id="rg-h">选择地区</h2><span style={{ fontSize: 12, color: '#6A6256' }}>已讨伐 {cleared} · 已开通 {today.sortieRegions.length} 个地区</span></div>
            <div className="regions" role="radiogroup" aria-label="出征地区">
              {today.sortieRegions.map(r => (
                <button key={r.id} type="button" role="radio" aria-checked={r.id === target.id} className="rg" disabled={busy} onClick={() => { setRegionId(r.id); setAiDifficulty('normal'); }}>
                  <span className="rg-n">{r.name}</span>
                  <span className="rg-l">敌 Lv {r.level}</span>
                  <span className="rg-r">{r.resource}</span>
                  <span className={`tag ${r.cleared ? 'tag-green' : 'tag-grey'}`}>{r.cleared ? '已讨伐' : '未讨伐'}</span>
                </button>
              ))}
            </div>
            {exploration && <div style={{ padding: '0 16px 12px' }}><RegionExploration region={exploration} /></div>}
          </section>

          <section className="panel" aria-labelledby="tm-h">
            <div className="ph">
              <h2 id="tm-h">出战队伍 <span style={{ fontWeight: 500, color: '#6A6256' }}>{picked.length} / {max}</span></h2>
              <span style={{ fontSize: 12, color: '#6A6256' }}>本图最多 {max} 人 · 敌军 {plan?.enemyCount ?? '—'} 人</span>
            </div>
            <ul className="team" aria-label="现役单位">
              {active.map(u => {
                const why = busyReason(u, annual);
                return (
                  <UnitRow key={u.id} unit={u} order={selectedIds.indexOf(u.id) + 1} picked={selectedIds.includes(u.id)} locked={busy || !!why || (!selectedIds.includes(u.id) && selectedIds.length >= max)}
                    protagonist={u.isProtagonist} why={why} onToggle={() => toggle(u.id)} />
                );
              })}
            </ul>
          </section>
        </div>

        <DeploymentOrder units={picked} busy={busy} onChange={reorder} />

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
          <DifficultyChoice value={effectiveDifficulty} hardUnlocked={hardUnlocked} unlockReason="以普通难度赢得本地区野外遭遇战后解锁，仅限本地区野外。" onChange={setAiDifficulty} disabled={busy} />
          {plan && <EncounterSummary plan={plan} />}
          {quote?.encounter && <EncounterPreview encounter={quote.encounter} names={picked.map(u => u.name)} />}
          {quoteError && <p role="alert">{quoteError}</p>}
          {quote?.blockers.map(text => <p role="alert" key={text}>{text}</p>)}
          {warning && <p className="a-warn" role="note">{warning}</p>}
          {error && <p role="alert" style={{ padding: '0 16px', fontSize: 13, color: '#93392F' }}>{error}</p>}
          <div className="go-bar">
            <a className="btn btn-ghost" href={links.camp}>返回军营</a>
            <button type="button" className="btn btn-primary btn-lg" disabled={busy || !sortie.available || picked.length === 0 || !quote?.encounter || quote.blockers.length > 0}
              onClick={() => quote && onStart(quote.quoteId)}>
              {busy ? '出征中…' : `确认出征 · ${target.name} · ${picked.length} 人 · ${difficultyLabel(effectiveDifficulty)}`}
            </button>
          </div>
        </section>
      </div>
    </Shell>
  );
}
