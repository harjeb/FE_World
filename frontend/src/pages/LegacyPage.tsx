import { useState } from 'react';
import { CHARACTERS } from '@common/data/characters.ts';
import type { CharacterId } from '@common/data/characters.ts';
import { CLASSES } from '@common/data/classes.ts';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import type { StatKey, Stats } from '@common/data/types.ts';
import { previewInheritance } from '@common/game/legacy.ts';
import type { LegacyRecord } from '@common/game/legacy.ts';
import type { UnitRecord } from '@common/game/model.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ServerLegacy, ServerMemorial, ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { Checks, Face, itemName, stock, UnitFace, useAct } from './SystemParts.tsx';

type Mode = 'growth' | 'numeric';
const CAUSE: Record<ServerLegacy['cause'], [string, string]> = { death: ['战死', 'tag-red'], age: ['寿终', 'tag-grey'], retired: ['退役', 'tag-brass'] };
const STONE: Record<Mode, string> = { growth: 'legacy_stone_growth', numeric: 'legacy_stone_numeric' };
const MODE_NAME: Record<Mode, string> = { growth: '成长传承', numeric: '数值传承' };

const statLine = (s: Partial<Stats>) => STAT_KEYS.filter(k => s[k] !== undefined).map(k => `${STAT_NAMES[k]} ${s[k]}`).join(' · ');
const personalGrowth = (u: ServerUnit, k: StatKey) => CHARACTERS[u.character].growth[k] + (u.growthAllocation[k] ?? 0);

// Who may take a legacy (game/legacy.ts::canClaim): an active level-1 unit that never inherited one.
function heirProblem(legacy: ServerLegacy, unit: ServerUnit): string | null {
  if (unit.status !== 'active') return '不在现役名册';
  if (unit.lineageDepth !== 0) return '已经接受过遗产';
  if (unit.level !== 1) return `Lv ${unit.level}，只有 1 级角色可以接受`;
  if (unit.id === legacy.sourceUnitId) return '不能继承自己';
  return null;
}

// 传承 (docs/00 §7): what qualifying units left behind when they died or retired, the 纪念名册, and the
// free recruit after heavy losses. The claim preview uses the shared rules (game/legacy.ts); the server
// re-checks everything and returns the authoritative result.
export function LegacyPage() {
  const { legacies, state } = useSession();
  const { data: memorial } = useServerData(() => session.memorial(), []);
  const [picked, setPicked] = useState<string | null>(null);
  if (!state) return null;
  const list = legacies?.legacies ?? [];
  const available = list.filter(l => l.state === 'available');
  const selected = available.find(l => l.id === picked) ?? available[0] ?? null;
  const unitOf = (id: string) => state.units.find(u => u.id === id);

  return (
    <Shell current="legacy">
      <div className="brief-head">
        <div>
          <div className="eyebrow">传承 · {dateLabel(state.day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>遗产与纪念</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>达到 {legacies?.minLevel ?? 15} 级的普通角色战死、寿终或退役时，会留下一份遗产，可以交给一名 1 级新角色。传承只有一代：接受过遗产的人不能再传下去。</p>
        </div>
        <div style={{ fontSize: 13, color: '#4E473D', textAlign: 'right' }}>
          可兑现 <b className="num">{available.length}</b> 份 · 已兑现 <b className="num">{list.length - available.length}</b> 份
        </div>
      </div>

      <div className="sys-cols">
        <div className="colstack">
          <section className="panel" aria-labelledby="lg-h">
            <div className="ph"><h2 id="lg-h">遗产</h2><span style={{ fontSize: 12, color: '#6A6256' }}>来源在死亡或退役时冻结，装备回到仓库</span></div>
            <ul className="legacies">
              {list.map(l => {
                const source = unitOf(l.sourceUnitId);
                return (
                  <li key={l.id} className={l.state}>
                    <button type="button" className="lg-row" aria-pressed={selected?.id === l.id} disabled={l.state !== 'available'} onClick={() => setPicked(l.id)}>
                      {source ? <UnitFace unit={source} size={40} dim /> : <span className="pf" style={{ width: 40, height: 40 }} />}
                      <span className="min-w-0">
                        <span className="lg-n">{l.sourceName}<span className={`tag ${CAUSE[l.cause][1]}`}>{CAUSE[l.cause][0]}</span><span className="muted">Lv {l.sourceLevel} · 属性总和 {l.sourceTotal}</span></span>
                        <span className="lg-s">成长：{statLine(l.sourceGrowth)}</span>
                      </span>
                      <span className={`tag ${l.state === 'available' ? 'tag-green' : 'tag-grey'}`}>
                        {l.state === 'available' ? '可兑现' : `已由${l.recipientName ?? '继承者'}以${l.mode ? MODE_NAME[l.mode] : ''}兑现`}
                      </span>
                    </button>
                  </li>
                );
              })}
              {list.length === 0 && <li className="empty-row">还没有遗产。普通角色达到 {legacies?.minLevel ?? 15} 级后战死、寿终或退役才会留下遗产。</li>}
            </ul>
          </section>

          <MemorialPanel memorials={memorial?.memorials ?? null} legacies={list} />
        </div>

        <div className="colstack">
          {selected ? <ClaimPanel key={selected.id} legacy={selected} /> : (
            <section className="panel" aria-labelledby="cl-h">
              <div className="ph"><h2 id="cl-h">兑现遗产</h2></div>
              <p className="sys-note">没有可兑现的遗产。角色可以在<a href={links.roster()}>名册</a>的「退役与轮回」里正常退役。</p>
            </section>
          )}
          <EmergencyPanel status={memorial?.emergency ?? null} />
        </div>
      </div>
    </Shell>
  );
}

function ClaimPanel({ legacy }: { legacy: ServerLegacy }) {
  const { state } = useSession();
  const { busy, act } = useAct();
  const units = state?.units.filter(u => u.status === 'active') ?? [];
  const heirs = units.filter(u => !heirProblem(legacy, u));
  const [heirId, setHeirId] = useState<string>(heirs[0]?.id ?? '');
  const [mode, setMode] = useState<Mode>('growth');
  const [weights, setWeights] = useState<Record<StatKey, number>>(() => Object.fromEntries(STAT_KEYS.map(k => [k, 1])) as Record<StatKey, number>);
  if (!state) return null;
  const heir = heirs.find(u => u.id === heirId) ?? heirs[0];
  const stones = stock(state, STONE[mode]);
  const preview = heir
    ? previewInheritance({ sourceStats: legacy.sourceStats, sourceLevel: legacy.sourceLevel } as LegacyRecord,
      { classId: heir.classId, stats: heir.snapshot.stats } as unknown as UnitRecord)
    : null;
  const marks = preview ? [...new Set([1, 5, 10, 15, 20, 30, 40, 50, legacy.sourceLevel].filter(l => l <= legacy.sourceLevel))] : [];
  const weighted = STAT_KEYS.some(k => weights[k] > 0);

  return (
    <section className="panel" aria-labelledby="cl-h">
      <div className="ph"><h2 id="cl-h">兑现 {legacy.sourceName} 的遗产</h2><span style={{ fontSize: 12, color: '#6A6256' }}>每人一生只能接受一次</span></div>
      <div className="claim">
        {heirs.length > 0 && (
          <label className="field">继承者
            <select value={heir?.id ?? ''} onChange={e => setHeirId(e.target.value)}>
              {heirs.map(u => <option key={u.id} value={u.id}>{u.name} · {u.className} Lv {u.level}</option>)}
            </select>
          </label>
        )}
        {heirs.length === 0 && <p className="why">没有符合条件的继承者：需要一名还没接受过遗产的 1 级现役角色（例如刚招募的新人）。</p>}

        <div className="mode-cards" role="radiogroup" aria-label="传承方式">
          {(['growth', 'numeric'] as Mode[]).map(m => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className="mode" onClick={() => setMode(m)}>
              <b>{MODE_NAME[m]}</b>
              <span>{m === 'growth' ? '用来源的成长率替换继承者的个人成长率；职业成长照常另算。' : '继承者每次升级后，属性总和至少补到按等级换算的保底，最终追平来源。'}</span>
              <span className="muted">消耗{itemName(STONE[m])} ×1（仓库 {stock(state, STONE[m])}）</span>
            </button>
          ))}
        </div>

        {heir && mode === 'growth' && (
          <table className="st cmp">
            <thead><tr><th scope="col">个人成长</th>{STAT_KEYS.map(k => <th key={k} scope="col">{STAT_NAMES[k]}</th>)}</tr></thead>
            <tbody>
              <tr><th scope="row">{heir.name}现在</th>{STAT_KEYS.map(k => <td key={k}>{personalGrowth(heir, k)}%</td>)}</tr>
              <tr><th scope="row">兑现后</th>{STAT_KEYS.map(k => {
                const after = legacy.sourceGrowth[k] + (heir.growthAllocation[k] ?? 0);
                const d = after - personalGrowth(heir, k);
                return <td key={k}>{after}%{d !== 0 && <i className={d > 0 ? 'd-up' : 'd-dn'}>{d > 0 ? `+${d}` : `−${-d}`}</i>}</td>;
              })}</tr>
            </tbody>
          </table>
        )}

        {heir && mode === 'numeric' && preview && (
          <>
            <dl className="facts">
              <dt>属性总和</dt><dd>{heir.name}现在 {preview.initialTotal} → 目标 {preview.clippedTarget}（来源 {preview.sourceTotal}）</dd>
              {preview.lost > 0 && <><dt>损失</dt><dd className="risk">超出{CLASSES[heir.classId as keyof typeof CLASSES]?.name ?? ''}上限 {preview.capacity} 的 {preview.lost} 点不会保留</dd></>}
            </dl>
            <table className="st cmp">
              <thead><tr><th scope="col">等级</th>{marks.map(l => <th key={l} scope="col">Lv {l}</th>)}</tr></thead>
              <tbody><tr><th scope="row">保底总和</th>{marks.map(l => <td key={l}>{preview.floors[l - 1]?.total ?? '—'}</td>)}</tr></tbody>
            </table>
            <div className="weights" aria-label="补点权重">
              <span className="muted">补点权重：数字越大分得越多，0 表示这一项不补</span>
              {STAT_KEYS.map(k => (
                <label key={k}>{STAT_NAMES[k]}
                  <input type="number" min={0} max={9} value={weights[k]} onChange={e => setWeights(w => ({ ...w, [k]: Math.max(0, Math.min(9, Math.floor(Number(e.target.value)) || 0)) }))} />
                </label>
              ))}
            </div>
          </>
        )}

        <Checks items={[
          [!!heir, heir ? `继承者：${heir.name}（1 级、没接受过遗产）` : '需要一名符合条件的继承者'],
          [stones > 0, stones > 0 ? `${itemName(STONE[mode])}：仓库 ${stones} 枚` : `缺少${itemName(STONE[mode])}：仓库里没有，商店也不卖`],
          ...(mode === 'numeric' ? [[weighted, weighted ? '补点权重已设置' : '至少给一项属性设置权重'] as [boolean, string]] : []),
        ]} />
        <div className="go-bar">
          <button type="button" className="btn btn-primary" disabled={busy !== null || !heir || stones === 0 || (mode === 'numeric' && !weighted)}
            onClick={() => heir && void act('claim', () => session.run(OP.CLAIM_LEGACY, { legacyId: legacy.id, unitId: heir.id, mode, weights: mode === 'numeric' ? weights : {} }),
              () => `${heir.name}以${MODE_NAME[mode]}接受了${legacy.sourceName}的遗产`)}>
            {busy === 'claim' ? '兑现中…' : `以${MODE_NAME[mode]}交给${heir?.name ?? '继承者'}`}
          </button>
        </div>
      </div>
    </section>
  );
}

function MemorialPanel({ memorials, legacies }: { memorials: ServerMemorial[] | null; legacies: ServerLegacy[] }) {
  return (
    <section className="panel" aria-labelledby="mem-h">
      <div className="ph"><h2 id="mem-h">纪念名册</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{memorials ? `${memorials.length} 人` : '读取中…'}</span></div>
      <ul className="roster-mini memorial">
        {(memorials ?? []).map(m => {
          const left = legacies.find(l => l.sourceUnitId === m.unitId);
          return (
            <li key={m.unitId}>
              <Face character={m.character as CharacterId} classId={m.classId} size={32} dim={m.cause !== 'retired'} />
              <span className="min-w-0">
                <b>{m.name}</b><span className="muted"> · {CLASSES[m.classId as keyof typeof CLASSES]?.name ?? m.classId} Lv {m.level}</span>
                <span className="rm-sub">{plainDate(m.atDay)} · {left ? '留下了遗产' : '没有留下遗产'}{m.lineageDepth > 0 ? ' · 曾接受遗产' : ''}</span>
              </span>
              <span className={`tag ${CAUSE[m.cause][1]}`}>{CAUSE[m.cause][0]}</span>
            </li>
          );
        })}
        {memorials && memorials.length === 0 && <li className="empty-row">还没有人离开军团。</li>}
      </ul>
    </section>
  );
}

function EmergencyPanel({ status }: { status: { deaths: number; claimedFor: number; survivors: number; threshold: number; units: number; room: number; available: boolean; blocker: string | null } | null }) {
  const { busy, act } = useAct();
  return (
    <section className="panel" aria-labelledby="em-h">
      <div className="ph"><h2 id="em-h">酒馆 · 紧急补员</h2>{status && <span className={`tag ${status.available ? 'tag-green' : 'tag-grey'}`}>{status.available ? '可以领取' : '未开放'}</span>}</div>
      <p className="sys-note">真实伤亡使现役存活人数降到 {status?.threshold ?? 2} 人及以下（含主角）时，可以在酒馆免费招募随机 {status?.units ?? 2} 人：不花金币、不推进日期。解雇、退役与派遣都不算新伤亡；每次新的真实损失只能领一次。</p>
      {status && (
        <>
          <Checks items={[
            [status.deaths > status.claimedFor, `新的真实伤亡（已领取到第 ${status.claimedFor} 次）`],
            [status.survivors <= status.threshold, `现役存活 ${status.survivors} 人（需要 ≤${status.threshold}）`],
            [status.room >= status.units, `名册空位 ${status.room}（需要 ${status.units} 个）`],
          ]} />
          <div className="go-bar">
            <button type="button" className="btn btn-primary" disabled={busy !== null || !status.available}
              onClick={() => void act('recruit', () => session.run<{ units: { name: string; className: string; level: number }[] }>(OP.EMERGENCY_RECRUIT),
                r => `酒馆补员：${r.units.map(u => `${u.name}（${u.className} Lv ${u.level}）`).join('、')} 加入了名册`)}>
              {busy === 'recruit' ? '招募中…' : `免费招募 ${status.units} 人`}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
