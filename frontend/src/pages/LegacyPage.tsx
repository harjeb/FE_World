import { useState } from 'react';
import type { CharacterId } from '@common/data/characters.ts';
import { CLASSES } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { STAT_KEYS, STAT_NAMES } from '@common/data/types.ts';
import type { StatKey, Stats } from '@common/data/types.ts';
import { previewInheritance } from '@common/game/legacy.ts';
import { regionById } from '@common/game/calendar.ts';
import type { LegacyRecord } from '@common/game/legacy.ts';
import type { UnitRecord } from '@common/game/model.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ServerLegacy, ServerMemorial, ServerUnit } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { ORIGIN_TEXT } from '../model/roster.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { dateLabel, plainDate } from '../ui/calendar.ts';
import { personalGrowth } from './RosterParts.tsx';
import { Checks, Face, itemName, stock, UnitFace, useAct } from './SystemParts.tsx';

type Mode = 'growth' | 'numeric';
const CAUSE: Record<ServerLegacy['cause'], [string, string]> = { death: ['战死', 'tag-red'], age: ['寿终', 'tag-grey'], retired: ['退役', 'tag-brass'] };
const STONE: Record<Mode, string> = { growth: 'legacy_stone_growth', numeric: 'legacy_stone_numeric' };
const MODE_NAME: Record<Mode, string> = { growth: '成长传承', numeric: '数值传承' };

const statLine = (s: Partial<Stats>) => STAT_KEYS.filter(k => s[k] !== undefined).map(k => `${STAT_NAMES[k]} ${s[k]}`).join(' · ');
const total = (s: Partial<Stats>) => STAT_KEYS.reduce((n, k) => n + (s[k] ?? 0), 0);

// Who may take a legacy (game/legacy.ts::canClaim): an active level-1 unit that never inherited one.
function heirProblem(legacy: ServerLegacy, unit: ServerUnit): string | null {
  if (unit.status !== 'active') return '不在现役名册';
  if (unit.lineageDepth !== 0) return '已经接受过遗产';
  if (unit.level !== 1) return `Lv ${unit.level}，只有 1 级角色可以接受`;
  if (unit.id === legacy.sourceUnitId) return '不能继承自己';
  return null;
}

// 传承 (docs/00 §7, TODO UI-04): what qualifying units left behind when they died or retired, the
// 纪念名册, and every number the claim commits to before it runs. The preview uses the shared rules
// (game/legacy.ts::previewInheritance), the same ones CLAIM_LEGACY applies on the server.
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
      {!state.legacyUnlocked && <p className="sys-strip" role="status">传承尚未解锁：完成任一地区的核心任务（地区远征最后一档）并领奖后，账号永久开放兑现。遗产会一直保留。</p>}

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
                        <span className="lg-s">个人基础成长：{statLine(l.sourceGrowth)}</span>
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

          <MemorialPanel memorials={memorial?.memorials ?? null} />
        </div>

        <div className="colstack">
          {selected ? <ClaimPanel key={selected.id} legacy={selected} /> : (
            <section className="panel" aria-labelledby="cl-h">
              <div className="ph"><h2 id="cl-h">兑现遗产</h2></div>
              <p className="sys-note">没有可兑现的遗产。角色可以在<a href={links.roster()}>名册</a>的「退役与轮回」里正常退役。</p>
            </section>
          )}
          <section className="panel" aria-labelledby="emg-h">
            <div className="ph"><h2 id="emg-h">严重损失</h2></div>
            <p className="sys-note">真实伤亡让现役存活降到 {memorial?.emergency.threshold ?? 2} 人及以下时，可以在<a href={links.tavern}>酒馆</a>免费补员 {memorial?.emergency.units ?? 2} 人{memorial ? `（现在：${memorial.emergency.available ? '可以领取' : memorial.emergency.blocker ?? '未开放'}）` : ''}。</p>
          </section>
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
  const caps = heir ? CLASSES[heir.classId as ClassId].caps : null;
  const preview = heir
    ? previewInheritance({ sourceStats: legacy.sourceStats, sourceLevel: legacy.sourceLevel } as LegacyRecord,
      { classId: heir.classId, stats: heir.snapshot.stats } as unknown as UnitRecord)
    : null;
  const marks = preview ? [...new Set([1, 2, 5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, legacy.sourceLevel].filter(l => l <= legacy.sourceLevel))] : [];
  const weighted = STAT_KEYS.some(k => weights[k] > 0);
  const others = units.filter(u => heirProblem(legacy, u));

  return (
    <section className="panel" aria-labelledby="cl-h">
      <div className="ph"><h2 id="cl-h">兑现 {legacy.sourceName} 的遗产</h2><span style={{ fontSize: 12, color: '#6A6256' }}>每人一生只能接受一次</span></div>
      <div className="claim">
        {heirs.length > 0 && (
          <label className="field">继承者
            <select value={heir?.id ?? ''} onChange={e => setHeirId(e.target.value)}>
              {heirs.map(u => <option key={u.id} value={u.id}>{u.name} · {u.className} Lv {u.level} · {u.age} 岁 · {ORIGIN_TEXT[u.origin]}</option>)}
            </select>
          </label>
        )}
        {heirs.length === 0 && <p className="why">没有符合条件的继承者：需要一名还没接受过遗产的 1 级现役角色（例如刚招募的新人）。{others.length > 0 ? `现役的人都不满足：${others.slice(0, 3).map(u => `${u.name}（${heirProblem(legacy, u)}）`).join('、')}。` : ''}</p>}

        <div className="mode-cards" role="radiogroup" aria-label="传承方式">
          {(['growth', 'numeric'] as Mode[]).map(m => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className="mode" onClick={() => setMode(m)}>
              <b>{MODE_NAME[m]}</b>
              <span>{m === 'growth' ? '用来源冻结的个人基础成长替换继承者的个人基础成长；职业成长、年龄修正与之后的轮回分配另算。' : '记下来源的等级与属性总和：继承者每次升级后，属性总和至少补到当级保底，最终追平来源（受继承者上限截断）。'}</span>
              <span className="muted">消耗{itemName(STONE[m])} ×1（仓库 {stock(state, STONE[m])}）</span>
            </button>
          ))}
        </div>

        {heir && mode === 'growth' && (
          <>
            <div className="grp">{heir.name}的个人基础成长</div>
            <table className="st cmp">
              <thead><tr><th scope="col">属性</th><th scope="col">现在</th><th scope="col">兑现后</th><th scope="col">变化</th></tr></thead>
              <tbody>
                {STAT_KEYS.map(k => {
                  const now = personalGrowth(heir, k);
                  const after = legacy.sourceGrowth[k] + (heir.growthAllocation[k] ?? 0);
                  const d = after - now;
                  return (
                    <tr key={k}>
                      <th scope="row">{STAT_NAMES[k]}</th><td>{now}%</td><td><b>{after}%</b></td>
                      <td>{d === 0 ? <span className="muted">—</span> : <i className={d > 0 ? 'd-up' : 'd-dn'}>{d > 0 ? `+${d}` : `−${-d}`}</i>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <dl className="facts">
              <dt>来源</dt><dd>{legacy.sourceName}{CAUSE[legacy.cause][0]}时冻结的个人基础成长（含当时装备／被动提供的成长），不含职业修正。</dd>
              <dt>承诺</dt><dd>立即替换，之后每次升级按新的个人成长 + 当前职业修正掷点；轮回会保留这份成长，但不能再传给下一代。</dd>
            </dl>
          </>
        )}

        {heir && mode === 'numeric' && preview && caps && (
          <>
            <dl className="facts">
              <dt>属性总和</dt><dd>{heir.name}现在 {preview.initialTotal} → 目标 <b>{preview.clippedTarget}</b>（来源 {preview.sourceTotal}，Lv {preview.sourceLevel}）</dd>
              <dt>上限</dt><dd>{CLASSES[heir.classId as ClassId]?.name}九项上限合计 {preview.capacity}{preview.lost > 0 ? <span className="risk">；超出的 {preview.lost} 点不会保留</span> : '，可以完整追平'}</dd>
              <dt>承诺</dt><dd>之后每次升级先按成长掷点，若属性总和低于当级保底，就按下面的权重补到保底；补点只进未满上限的属性。保底合同在轮回时清除。</dd>
            </dl>
            <div className="tbl-scroll">
              <table className="st cmp">
                <thead><tr><th scope="col">属性上限</th>{STAT_KEYS.map(k => <th key={k} scope="col">{STAT_NAMES[k]}</th>)}</tr></thead>
                <tbody>
                  <tr><th scope="row">{heir.name}现在</th>{STAT_KEYS.map(k => <td key={k}>{heir.snapshot.stats[k] ?? 0}</td>)}</tr>
                  <tr><th scope="row">上限</th>{STAT_KEYS.map(k => <td key={k}>{caps[k]}</td>)}</tr>
                  <tr><th scope="row">来源</th>{STAT_KEYS.map(k => <td key={k}>{legacy.sourceStats[k] ?? 0}</td>)}</tr>
                </tbody>
              </table>
            </div>
            <div className="tbl-scroll">
              <table className="st cmp">
                <thead><tr><th scope="col">等级</th>{marks.map(l => <th key={l} scope="col">Lv {l}</th>)}</tr></thead>
                <tbody><tr><th scope="row">保底总和</th>{marks.map(l => <td key={l}>{preview.floors[l - 1]?.total ?? '—'}</td>)}</tr></tbody>
              </table>
            </div>
            <div className="weights" aria-label="补点权重">
              <span className="muted">补点权重：数字越大分得越多，0 表示这一项不补（全部补满后才会动用权重 0 的属性）</span>
              {STAT_KEYS.map(k => (
                <label key={k}>{STAT_NAMES[k]}
                  <input type="number" min={0} max={9} value={weights[k]} onChange={e => setWeights(w => ({ ...w, [k]: Math.max(0, Math.min(9, Math.floor(Number(e.target.value)) || 0)) }))} />
                </label>
              ))}
            </div>
          </>
        )}

        <Checks items={[
          [state.legacyUnlocked, state.legacyUnlocked ? '传承已解锁' : '传承尚未解锁：完成任一地区核心任务并领奖'],
          [!!heir, heir ? `继承者：${heir.name}（1 级、没接受过遗产）` : '需要一名符合条件的继承者'],
          [stones > 0, stones > 0 ? `${itemName(STONE[mode])}：仓库 ${stones} 枚` : `缺少${itemName(STONE[mode])}：${mode === 'growth' ? `${regionById(2).name}的核心任务或${regionById(12).name}的声望商店（盟友档）` : `${regionById(3).name}的核心任务或挑战塔第二层首通`}可以获得`],
          ...(mode === 'numeric' ? [[weighted, weighted ? '补点权重已设置' : '至少给一项属性设置权重'] as [boolean, string]] : []),
        ]} />
        <div className="go-bar">
          <button type="button" className="btn btn-primary" disabled={busy !== null || !heir || stones === 0 || !state.legacyUnlocked || (mode === 'numeric' && !weighted)}
            onClick={() => heir && void act('claim', () => session.run(OP.CLAIM_LEGACY, { legacyId: legacy.id, unitId: heir.id, mode, weights: mode === 'numeric' ? weights : {} }),
              () => `${heir.name}以${MODE_NAME[mode]}接受了${legacy.sourceName}的遗产`)}>
            {busy === 'claim' ? '兑现中…' : `以${MODE_NAME[mode]}交给${heir?.name ?? '继承者'}`}
          </button>
        </div>
      </div>
    </section>
  );
}

function MemorialPanel({ memorials }: { memorials: ServerMemorial[] | null }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="panel" aria-labelledby="mem-h">
      <div className="ph"><h2 id="mem-h">纪念名册</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{memorials ? `${memorials.length} 人` : '读取中…'}</span></div>
      <ul className="roster-mini memorial">
        {(memorials ?? []).map(m => {
          const expanded = open === m.unitId;
          return (
            <li key={m.unitId} className="mem-row">
              <button type="button" className="mem-h" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : m.unitId)}>
                <Face character={m.portrait ?? m.character as CharacterId} classId={m.classId} portrait={m.portrait} size={32} dim={m.cause !== 'retired'} />
                <span className="min-w-0">
                  <b>{m.name}</b><span className="muted"> · {m.className} Lv {m.level}{m.age !== null ? ` · ${m.age} 岁` : ''}</span>
                  <span className="rm-sub">{plainDate(m.atDay)} · {m.legacy ? (m.legacy.state === 'claimed' ? `遗产已由${m.legacy.recipientName ?? '继承者'}兑现` : '留下了遗产') : '没有留下遗产'}{m.inherited ? ` · 曾接受${m.inherited.sourceName}的遗产` : ''}</span>
                </span>
                <span className={`tag ${CAUSE[m.cause][1]}`}>{CAUSE[m.cause][0]}</span>
              </button>
              {expanded && (
                <dl className="facts mem-detail">
                  <dt>身份</dt><dd>{m.origin ? ORIGIN_TEXT[m.origin] : '—'}{m.joinedDay !== null ? ` · ${plainDate(m.joinedDay)}加入` : ''}{m.cycle ? ' · 已轮回' : ''}</dd>
                  <dt>经过</dt><dd>{m.cause === 'death' ? (m.battle ? <>在「{m.battle.name}」第 {m.battle.turn} 回合倒下（{m.battle.reason ?? '战斗结束'}）{m.battle.id && <> · <a href={links.replay(m.battle.id)}>战报</a></>}</> : '战死') : m.cause === 'age' ? '自然寿终' : '正常退役'}</dd>
                  <dt>最终状态</dt><dd>{m.className} Lv {m.level} · 属性总和 {total(m.stats)}<div className="muted" style={{ fontSize: 12 }}>{statLine(m.stats)}</div></dd>
                  <dt>参战记录</dt><dd>{m.record.battles > 0 ? `出场 ${m.record.battles} 场、胜 ${m.record.wins} 场、击败 ${m.record.kills} 名敌人` : '没有保存的战报'}<span className="muted">（按已保存的战报统计）</span></dd>
                  <dt>传承关系</dt><dd>{m.legacy ? (m.legacy.state === 'claimed' ? `留下的遗产由${m.legacy.recipientName ?? '继承者'}以${m.legacy.mode ? MODE_NAME[m.legacy.mode] : ''}兑现` : '留下的遗产尚未兑现') : m.lineageDepth > 0 ? '接受过遗产，不能再传' : '没有留下遗产'}{m.inherited ? `；本人曾以${m.inherited.mode ? MODE_NAME[m.inherited.mode] : ''}接受${m.inherited.sourceName}的遗产` : ''}</dd>
                </dl>
              )}
            </li>
          );
        })}
        {memorials && memorials.length === 0 && <li className="empty-row">还没有人离开军团。</li>}
      </ul>
    </section>
  );
}
