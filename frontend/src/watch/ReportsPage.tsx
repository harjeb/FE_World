import { useState } from 'react';
import { CLASSES } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import { DAYS_PER_SEASON, DAYS_PER_YEAR } from '@common/game/calendar.ts';
import { session, useSession } from '../api/session.ts';
import type { ReplayActivity, ReplayFilter, ServerReplay, ServerReplayDetail } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { HistoryIcon } from '../ui/icons.tsx';
import { plainDate, realDateTime } from '../ui/calendar.ts';
import { Face } from '../pages/SystemParts.tsx';
import { battleReport } from './report.ts';

type Range = 'all' | 'season' | 'year';
const RANGES: [Range, string][] = [['all', '全部日期'], ['season', '本季'], ['year', '今年']];
const ACTIVITY_TAG: Record<ReplayActivity, string> = { field: 'tag-grey', quest: 'tag-blue', dungeon: 'tag-blue', challenge: 'tag-red', arena: 'tag-brass', annual: 'tag-brass', sparring: 'tag-grey' };

// 战报 (TODO UI-03): every finished battle of mine (field, quest, dungeon, tower, arena, annual, practice)
// plus other legions' published arena matches. First-release scope: filter by activity, result, scope
// and personal date; each report lists casualties, what was used up and what was gained, and links to
// the battles of the same expedition or annual entry. PvE reports stay private (publish time undecided).
export function ReportsPage() {
  const { state } = useSession();
  const [activity, setActivity] = useState<ReplayActivity | null>(null);
  const [result, setResult] = useState<'won' | 'lost' | null>(null);
  const [mine, setMine] = useState(true);
  const [range, setRange] = useState<Range>('all');
  const [picked, setPicked] = useState<string | null>(null);
  const day = state?.day ?? 0;
  const filter: ReplayFilter = {
    activity, result, mine, limit: 100,
    ...(range === 'season' ? { fromDay: Math.floor(day / DAYS_PER_SEASON) * DAYS_PER_SEASON } : range === 'year' ? { fromDay: Math.floor(day / DAYS_PER_YEAR) * DAYS_PER_YEAR } : {}),
  };
  const { data, error } = useServerData(() => session.replays(filter), [activity, result, mine, range]);
  const { data: everything } = useServerData(() => session.replays({ mine: true, limit: 200 }), []);
  const rows = data?.replays ?? [];
  const selected = rows.find(r => r.id === picked) ?? rows[0] ?? null;
  const filtered = activity !== null || result !== null || range !== 'all' || !mine;

  return (
    <Shell current="reports">
      <div className="brief-head">
        <div>
          <div className="eyebrow">战报</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>战报与回放</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>每场结束的战斗都会留下战报：伤亡、消耗、收获，以及可以逐步回看的回放。竞技场与年度大竞技场结束即公开；野外、任务、副本、挑战塔与练习只有你自己能看。</p>
        </div>
        <div style={{ fontSize: 13, color: '#4E473D', textAlign: 'right' }}>{data ? `符合条件 ${data.total} 场` : '读取中…'}<div><a href={links.spectate}>实时观战 ›</a></div></div>
      </div>

      <div className="report-filters panel" role="group" aria-label="筛选战报">
        <div className="chips" role="radiogroup" aria-label="活动">
          <button type="button" role="radio" aria-checked={activity === null} className="chip" onClick={() => setActivity(null)}>全部活动</button>
          {(data?.activities ?? []).map(a => <button key={a.id} type="button" role="radio" aria-checked={activity === a.id} className="chip" onClick={() => setActivity(a.id)}>{a.name}</button>)}
        </div>
        <div className="chips" role="radiogroup" aria-label="结果">
          {([[null, '全部结果'], ['won', '胜利'], ['lost', '失败']] as const).map(([v, label]) => <button key={label} type="button" role="radio" aria-checked={result === v} className="chip" onClick={() => setResult(v)}>{label}</button>)}
        </div>
        <div className="chips" role="radiogroup" aria-label="日期">
          {RANGES.map(([v, label]) => <button key={v} type="button" role="radio" aria-checked={range === v} className="chip" onClick={() => setRange(v)}>{label}</button>)}
        </div>
        <label className="inline-flex items-center gap-1.5" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={!mine} onChange={e => setMine(!e.target.checked)} />含其他军团公开的竞技场对局
        </label>
      </div>

      <div className="reports">
        <section className="panel" aria-labelledby="rl-h">
          <div className="ph"><h2 id="rl-h">战报列表</h2><span style={{ fontSize: 12, color: '#6A6256' }}>新的在前</span></div>
          {error && <p className="sys-note">读不到战报：{error}</p>}
          <ul className="report-list">
            {rows.map(r => <ReportRow key={r.id} row={r} current={r.id === selected?.id} activities={data?.activities ?? []} onPick={() => setPicked(r.id)} />)}
            {data && rows.length === 0 && (
              <li className="empty-row">{filtered ? '没有符合条件的战报，换个筛选试试。' : '还没有战报：打完第一场战斗（出击、任务或竞技场）后会出现在这里。'}</li>
            )}
          </ul>
        </section>
        {selected ? <ReportDetail key={selected.id} row={selected} all={everything?.replays ?? rows} /> : (
          <section className="panel"><p className="sys-note">选择左侧的一场战斗查看战报。</p></section>
        )}
      </div>
    </Shell>
  );
}

function ReportRow({ row, current, activities, onPick }: { row: ServerReplay; current: boolean; activities: { id: ReplayActivity; name: string }[]; onPick: () => void }) {
  const won = row.winner === 'player';
  return (
    <li>
      <button type="button" className="rp-row" aria-pressed={current} onClick={onPick}>
        <span className={`res ${won ? 'win' : 'lose'}`}>{won ? '胜' : '负'}</span>
        <span className="min-w-0">
          <b>{row.name}</b>
          <span className="rm-sub">
            {row.day !== null ? plainDate(row.day) : realDateTime(row.createdAt)} · {row.turns} 回合{row.fallen > 0 ? ` · 阵亡 ${row.fallen}` : ''}{!row.mine ? ' · 其他军团' : ''}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className={`tag ${ACTIVITY_TAG[row.activity]}`}>{activities.find(a => a.id === row.activity)?.name ?? row.activity}</span>
          {!row.public && <span className="tag tag-grey">仅自己可见</span>}
        </span>
      </button>
    </li>
  );
}

function ReportDetail({ row, all }: { row: ServerReplay; all: ServerReplay[] }) {
  const { state } = useSession();
  const { data, error } = useServerData<ServerReplayDetail>(() => session.replay(row.id), [row.id]);
  const hero = state?.units.find(u => u.isProtagonist)?.id;
  const related = all.filter(r => r.id !== row.id && ((row.runId && r.runId === row.runId) || (row.annualId && r.annualId === row.annualId)))
    .sort((a, b) => (a.stageIndex ?? 0) - (b.stageIndex ?? 0) || a.createdAt - b.createdAt);
  if (error) return <section className="panel"><p className="sys-note">{/没有公开|找不到/.test(error) ? '这场对局还没有公开，或已经无法读取。' : `读不到这场战报：${error}`}</p></section>;
  if (!data) return <section className="panel"><p className="sys-note">读取战报…</p></section>;
  const report = battleReport(data.battle);
  const won = report.winner === 'player';
  const fallen = report.units.filter(u => u.fallen);
  const used = report.units.filter(u => u.items.length > 0 || u.durability.length > 0 || u.charges.length > 0 || u.shieldUsed);
  const grown = report.units.filter(u => u.levels > 0);
  return (
    <section className="panel report" aria-labelledby="rd-h">
      <div className="ph">
        <h2 id="rd-h">{row.name}</h2>
        <span className={`tag ${won ? 'tag-green' : 'tag-red'}`}>{won ? '胜利' : '失败'} · {report.reason ?? '—'}</span>
      </div>
      <dl className="facts">
        <dt>日期</dt><dd>{row.day !== null ? plainDate(row.day) : '—'} · {realDateTime(row.createdAt)}</dd>
        <dt>战况</dt><dd>{report.turns} 回合 · 我方出战 {report.units.length} 人 · 击败敌军 {report.enemiesDefeated} / {report.enemies}</dd>
        {row.questName && <><dt>任务</dt><dd>{row.questName} · <a href={links.quests}>任务页 ›</a></dd></>}
        {row.activity === 'arena' && <><dt>竞技场</dt><dd>{row.arenaDay !== null ? `${plainDate(row.arenaDay)}的进攻` : '普通竞技场'} · <a href={links.arena}>竞技场 ›</a></dd></>}
        {row.activity === 'challenge' && <><dt>挑战塔</dt><dd><a href={links.tower}>挑战塔 ›</a></dd></>}
        {!data.compatible && <><dt>规则版本</dt><dd className="risk">{data.reason ?? '旧规则记录'}：回放只显示终局，不按新规则重算。</dd></>}
      </dl>

      <div className="grp">伤亡</div>
      <ul className="roster-mini">
        {fallen.map(u => (
          <li key={u.id} className="fallen">
            <Face character={u.portrait ?? u.character ?? u.id} classId={u.classId} portrait={u.portrait} size={32} dim />
            <span className="min-w-0"><b>{u.name}</b><span className="muted"> · {CLASSES[u.classId as ClassId]?.name ?? u.classId}</span><span className="rm-sub">第 {u.fallenTurn ?? '?'} 回合倒下</span></span>
            <span className={`tag ${u.id === hero || data.battle.kind === 'arena' ? 'tag-grey' : 'tag-red'}`}>{data.battle.kind === 'arena' ? '模拟战 · 无伤亡' : u.id === hero ? '主角撤退' : '永久死亡'}</span>
          </li>
        ))}
        {fallen.length === 0 && <li className="empty-row">没有人倒下。</li>}
      </ul>

      <div className="grp">消耗</div>
      <ul className="roster-mini">
        {used.map(u => (
          <li key={u.id}>
            <Face character={u.portrait ?? u.character ?? u.id} classId={u.classId} portrait={u.portrait} size={32} />
            <span className="min-w-0">
              <b>{u.name}</b>
              <span className="rm-sub">{[
                ...u.items.map(i => `${i.name} ${i.used} 次`),
                ...u.durability.map(d => `${d.name}耐久 −${d.spent}（剩 ${d.left}/${d.max}）`),
                ...u.charges.map(c => `${c.name} −${c.spent} 次（剩 ${c.left}/${c.max}）`),
                ...(u.shieldUsed ? ['不朽盾 ×1'] : []),
              ].join('、')}</span>
            </span>
            <span />
          </li>
        ))}
        {used.length === 0 && <li className="empty-row">没有消耗道具、耐久或次数。</li>}
      </ul>

      <div className="grp">收获</div>
      <ul className="roster-mini">
        {grown.map(u => <li key={u.id}><span className="tag tag-green">升级</span><span className="min-w-0"><b>{u.name}</b><span className="muted"> 升 {u.levels} 级 → Lv {u.levelTo}</span></span><span /></li>)}
        {report.loot.map(l => <li key={l.name}><span className="tag tag-brass">宝物</span><span className="min-w-0"><b>{l.name}</b> ×{l.count}</span><span /></li>)}
        {grown.length === 0 && report.loot.length === 0 && <li className="empty-row">{data.battle.kind === 'arena' ? '竞技场是模拟战，不发等级经验；积分与金币在竞技场页结算。' : '这场没有升级或宝物；通关金币与掉落见军营事件。'}</li>}
      </ul>

      <div className="grp">出手统计</div>
      <div className="tbl-scroll">
        <table className="st cmp">
          <thead><tr><th scope="col">角色</th><th scope="col">击败</th><th scope="col">造成伤害</th><th scope="col">承受伤害</th><th scope="col">结束 HP</th></tr></thead>
          <tbody>{report.units.map(u => <tr key={u.id}><th scope="row">{u.name}</th><td>{u.kills}</td><td>{u.damageDealt}</td><td>{u.damageTaken}</td><td>{u.fallen ? '—' : `${u.hp[0]} / ${u.hp[1]}`}</td></tr>)}</tbody>
        </table>
      </div>

      {data.notes.length > 0 && <>
        <div className="grp">Agent 说明</div>
        <ul className="sys-rules">{data.notes.map((n, i) => <li key={i}>{n.kind === 'comment' ? '点评' : `第 ${n.turn ?? '?'} 回合`}：{n.text}</li>)}</ul>
      </>}

      {related.length > 0 && <>
        <div className="grp">{row.runId ? '同一次远征的其他图' : '同一届大竞技场的其他比赛'}</div>
        <ul className="lr">{related.map(r => <li key={r.id}><span>{r.name} · {r.winner === 'player' ? '胜' : '负'}</span><a className="btn btn-sm" href={links.replay(r.id)}>回放</a></li>)}</ul>
      </>}

      <div className="go-bar">
        <a className="btn btn-primary" href={links.replay(row.id)}><HistoryIcon />{data.compatible ? '逐步回放' : '查看终局'}</a>
      </div>
    </section>
  );
}
