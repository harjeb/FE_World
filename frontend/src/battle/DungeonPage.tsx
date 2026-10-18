import { useEffect, useMemo, useState } from 'react';
import type { BattleState } from '@common/engine/index.ts';
import { regionById } from '@common/game/calendar.ts';
import { DUNGEON_STAGES, DUNGEON_STAGE_DAYS } from '@common/game/expedition.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ActionQuote, ServerRun } from '../api/session.ts';
import { links, regionInHash } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { advance, arenaTodayWarning, dateLabel } from '../ui/calendar.ts';
import { itemName, QuoteBox, TeamPicker, UnitFace, useAct } from '../pages/SystemParts.tsx';
import { BattlePage } from './BattlePage.tsx';
import { fallenLine } from './Dialogs.tsx';
import { goalLabel } from './names.ts';
import type { BattleSession } from './session.ts';
import { FieldTabs } from './SortiePrep.tsx';
import { busyReason } from '../model/roster.ts';

const RUN_STATE: Record<ServerRun['state'], [string, string]> = {
  battle: ['战斗中', 'tag-blue'], between_maps: ['两图之间', 'tag-brass'], completed: ['完整通关', 'tag-green'], failed: ['失败', 'tag-red'], withdrawn: ['已撤离', 'tag-grey'],
};
const lootLine = (loot: ServerRun['pendingLoot']) => (loot.length > 0 ? loot.map(l => `${itemName(l.item)} ×${l.count}`).join('、') : '还没有');

function dungeonSession(state: BattleState, run: ServerRun, back: () => void): BattleSession {
  const n = run.stageIndex + 1;
  const count = run.stageCount ?? DUNGEON_STAGES;
  const last = n >= count;
  return {
    key: state.id,
    initial: state,
    meta: {
      region: `${run.stageName ?? regionById(run.region).name} · ${n} / ${count} 图`,
      goal: goalLabel(state),
      extraLabel: '跨图', extraValue: 'HP 与道具不恢复',
    },
    surrender: false,
    apply: action => session.applyBattle(state.id, action),
    exit: { label: '暂离（战斗保留）', href: links.camp },
    result: end => {
      const won = end.result?.winner === 'player';
      return {
        title: !won ? '远征失败' : last ? '大副本完整通关' : `第 ${n} 图胜利`,
        won,
        lines: [
          fallenLine(end),
          !won ? '远征结束：阵亡与消耗保留，未带回的掉落作废。'
            : last ? '掉落与金币已带回仓库；首次完整通关会讨伐这个地区。'
              : `存活者带着现在的 HP 与剩余道具进入第 ${n + 1} 图；也可以撤离，但会放弃未带回的掉落。`,
        ],
        action: { label: won && !last ? '查看远征' : '返回大副本', run: back },
      };
    },
  };
}

// 大副本 (docs/00 §8.1.3): three maps in a row with one fixed team. Each map is paid when entered, HP and
// supplies carry over without recovery, deaths are permanent, and only a full clear brings the loot home.
export function DungeonPage() {
  const { run } = useSession();
  const [check, setCheck] = useState(0);
  const [battle, setBattle] = useState<BattleState | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setBattle(undefined);
    session.activeBattle().then(b => {
      if (alive) setBattle(b && b.state.kind === 'field' && session.get().run?.battleId === b.state.id ? b.state : null);
    });
    return () => { alive = false; };
  }, [check]);
  const built = useMemo<BattleSession | null>(
    () => (battle && run ? dungeonSession(battle, run, () => setCheck(c => c + 1)) : null),
    // Built once per map: later refreshes must not remount the battle page.
    [battle?.id],
  );

  if (battle === undefined) return <Shell current="field"><p style={{ color: '#4E473D' }}>正在读取远征状态…</p></Shell>;
  if (built) return <BattlePage key={built.key} session={built} />;
  if (run?.state === 'between_maps') return <RunBetween run={run} onContinued={() => setCheck(c => c + 1)} />;
  return <DungeonPrep onStarted={() => setCheck(c => c + 1)} />;
}

function RunMap({ run }: { run: ServerRun }) {
  const count = run.stageCount ?? DUNGEON_STAGES;
  const done = run.state === 'completed' ? count : run.stageIndex;
  return (
    <ol className="run-map" aria-label="远征进度">
      {Array.from({ length: count }, (_, i) => {
        const cls = i < done ? 'won' : i === run.stageIndex && run.state === 'failed' ? 'lost' : i === run.stageIndex && run.state !== 'withdrawn' ? 'next' : 'todo';
        const mark = cls === 'won' ? '已拿下' : cls === 'lost' ? '失败' : cls === 'next' ? (run.state === 'battle' ? '战斗中' : '下一张') : '';
        const name = run.stageNames?.[i] ?? (i === count - 1 ? '首领' : `第 ${i + 1} 图`);
        return <li key={i} className={cls}><b>{name}</b><span>{mark || `第 ${i + 1} 图`}</span></li>;
      })}
    </ol>
  );
}

function RunBetween({ run, onContinued }: { run: ServerRun; onContinued: () => void }) {
  const { state } = useSession();
  const { busy, act } = useAct();
  const [leaving, setLeaving] = useState(false);
  if (!state) return null;
  const region = regionById(run.region);
  const next = run.stageIndex + 1;
  const stageDays = run.stageDays ?? DUNGEON_STAGE_DAYS;
  const to = advance(state.day, stageDays);
  const warning = arenaTodayWarning();
  const members = run.unitIds.map(id => state.units.find(u => u.id === id)).filter((u): u is NonNullable<typeof u> => !!u);
  const alive = run.survivingIds.length;

  return (
    <Shell current="field">
      <div className="prep">
        <FieldTabs current="dungeon" />
        <div className="brief-head">
          <div>
            <div className="eyebrow">出击 · 大副本 · {dateLabel(state.day)}</div>
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>{region.name}大副本</h1>
            <p style={{ fontSize: 14, color: '#4E473D' }}>已拿下 {run.stageIndex} / {run.stageCount ?? DUNGEON_STAGES} 图。继续前确认队伍状态：HP 和道具都不会恢复，只有原名单里活着的人能进下一张图。</p>
          </div>
          <span className={`tag ${RUN_STATE[run.state][1]}`}>{RUN_STATE[run.state][0]}</span>
        </div>

        <div className="sys-cols">
          <div className="colstack">
            <section className="panel" aria-labelledby="run-h">
              <div className="ph"><h2 id="run-h">远征进度</h2><span style={{ fontSize: 12, color: '#6A6256' }}>敌 Lv {run.level}（出发时锁定）</span></div>
              <RunMap run={run} />
              <dl className="facts">
                <dt>待带回</dt><dd>{lootLine(run.pendingLoot)}<span className="muted">（完整通关才带回，撤离或失败作废）</span></dd>
                <dt>下一图</dt><dd>{run.nextStageName ?? `第 ${next} 图`} · 推进 {stageDays} 日 → {to.label}{to.passes ? `；${to.passes}` : ''}</dd>
                <dt>阵亡</dt><dd className="risk">倒下的普通角色永久死亡；全员倒下即远征失败。</dd>
              </dl>
              {warning && <p className="a-warn" role="note">{warning}</p>}
              {leaving && (
                <p className="a-warn" role="alert">撤离会放弃未带回的掉落；已经发生的阵亡与消耗不会撤销。确定撤离吗？</p>
              )}
              <div className="go-bar">
                {leaving
                  ? <>
                    <button type="button" className="btn btn-ghost" onClick={() => setLeaving(false)}>再想想</button>
                    <button type="button" className="btn btn-danger" disabled={busy !== null}
                      onClick={() => void act('withdraw', () => session.run(OP.WITHDRAW_RUN), () => `撤离${region.name}大副本，未带回的掉落作废`).then(ok => { if (ok) setLeaving(false); })}>
                      {busy === 'withdraw' ? '撤离中…' : '确认撤离'}
                    </button>
                  </>
                  : <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => setLeaving(true)}>撤离…</button>}
                <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null || alive === 0}
                  onClick={() => void act('continue', () => session.run(OP.CONTINUE_DUNGEON), () => `进入第 ${next} 图`).then(ok => { if (ok) onContinued(); })}>
                  {busy === 'continue' ? '出发中…' : `继续第 ${next} 图 · ${alive} 人`}
                </button>
              </div>
            </section>
          </div>

          <div className="colstack">
            <section className="panel" aria-labelledby="crew-h">
              <div className="ph"><h2 id="crew-h">队伍</h2><span style={{ fontSize: 12, color: '#6A6256' }}>存活 {alive} / {run.unitIds.length}</span></div>
              <ul className="roster-mini">
                {members.map(u => {
                  const carry = run.carry[u.id];
                  const fallen = !carry;
                  return (
                    <li key={u.id} className={fallen ? 'fallen' : undefined}>
                      <UnitFace unit={u} size={32} dim={fallen} />
                      <span className="min-w-0">
                        <b>{u.name}</b><span className="muted"> · {u.className} Lv {u.level}</span>
                        {carry && <span className="rm-sub">道具：{carry.items.length > 0 ? carry.items.map(i => `${itemName(i.id)}（${i.uses}）`).join('、') : '无'}</span>}
                      </span>
                      {carry
                        ? <span className="rm-hp"><span className="hpbar-thin"><i style={{ width: `${(carry.hp / u.maxHp) * 100}%`, background: '#4A7FA6' }} /></span><b className="num">{carry.hp} / {u.maxHp}</b></span>
                        : <span className="tag tag-red">{u.status === 'dead' ? '阵亡' : '退场'}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function DungeonPrep({ onStarted }: { onStarted: () => void }) {
  const { today, state, run, annual } = useSession();
  const { busy, act } = useAct();
  const active = state?.units.filter(u => u.status === 'active') ?? [];
  const max = today?.actions.find(a => a.key === 'sortie')?.maxUnits ?? 6;
  const [region, setRegion] = useState<number | null>(() => regionInHash(window.location.hash));
  // Same default as 出征准备: the first six, never more than the field allows.
  const [team, setTeam] = useState<string[]>(() => active.filter(u => !busyReason(u, annual)).slice(0, Math.min(6, max)).map(u => u.id));
  const [quote, setQuote] = useState<ActionQuote | null>(null);
  const version = state?.version ?? 0;
  const teamKey = team.join(',');
  useEffect(() => setQuote(null), [region, teamKey, version]);

  if (!today || !state) {
    return <Shell current="field"><p style={{ color: '#4E473D' }}>暂时读不到出击信息（GET_TODAY），刷新页面再试。</p></Shell>;
  }
  // 只在已开通的地区里选；没有可选地区时回世界地图开新路线。
  const target = today.sortieRegions.find(r => r.id === region) ?? today.sortieRegions[0];
  if (!target) {
    return (
      <Shell current="field">
        <div className="prep">
          <FieldTabs current="dungeon" />
          <section className="panel" style={{ padding: 16 }}>
            <h1 className="serif" style={{ fontSize: 24 }}>还没有已开通的地区</h1>
            <p style={{ fontSize: 14, color: '#4E473D', margin: '8px 0 12px' }}>先在世界地图上选择一条讨伐路线，开通后即可远征。</p>
            <a className="btn btn-primary" href={links.world}>打开世界地图</a>
          </section>
        </div>
      </Shell>
    );
  }
  const picked = active.filter(u => team.includes(u.id));
  const top = Math.max(0, ...picked.map(u => u.level));
  const total = advance(today.day, DUNGEON_STAGE_DAYS * DUNGEON_STAGES);
  const lead = active.find(u => u.isProtagonist);
  const finished = run && run.state !== 'battle' && run.state !== 'between_maps' ? run : null;

  return (
    <Shell current="field">
      <div className="prep">
        <FieldTabs current="dungeon" />
        <div className="brief-head">
          <div>
            <div className="eyebrow">出击 · 三图大副本</div>
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>大副本准备</h1>
            <p style={{ fontSize: 14, color: '#4E473D' }}>同一支队伍连打 {DUNGEON_STAGES} 张图，每进一张图推进 {DUNGEON_STAGE_DAYS} 日。只有拿下第 {DUNGEON_STAGES} 张图的首领，掉落和金币才会带回。</p>
          </div>
          <div style={{ fontSize: 13, color: '#4E473D' }}>今天 <b>{dateLabel(today.day)}</b></div>
        </div>

        {finished && (
          <section className="panel last-run" aria-label="上次远征">
            <span className={`tag ${RUN_STATE[finished.state][1]}`}>{RUN_STATE[finished.state][0]}</span>
            <span>上次远征：{regionById(finished.region).name} · 到达第 {Math.min(finished.stageIndex + 1, DUNGEON_STAGES)} 图 · 敌 Lv {finished.level}</span>
          </section>
        )}

        <div className="prep-cols">
          <section className="panel" aria-labelledby="drg-h">
            <div className="ph"><h2 id="drg-h">选择地区</h2><span style={{ fontSize: 12, color: '#6A6256' }}>敌人等级在出发时锁定</span></div>
            <div className="regions" role="radiogroup" aria-label="远征地区">
              {today.sortieRegions.map(r => (
                <button key={r.id} type="button" role="radio" aria-checked={r.id === target.id} className="rg" onClick={() => setRegion(r.id)}>
                  <span className="rg-n">{r.name}</span>
                  <span className="rg-l">敌 Lv {r.level}</span>
                  <span className="rg-r">{r.resource}</span>
                  <span className={`tag ${r.cleared ? 'tag-green' : 'tag-grey'}`}>{r.cleared ? '已讨伐' : '未讨伐'}</span>
                </button>
              ))}
            </div>
            <p className="pfoot">完整通关未讨伐的地区即讨伐该地区；中途撤离或失败不算讨伐。</p>
          </section>

          <section className="panel" aria-labelledby="dtm-h">
            <div className="ph"><h2 id="dtm-h">远征队伍 <span style={{ fontWeight: 500, color: '#6A6256' }}>{picked.length} / {max}</span></h2><span style={{ fontSize: 12, color: '#6A6256' }}>出发后名单固定，不能补人</span></div>
            <TeamPicker units={active} team={team} max={max} protagonist={state.player.protagonist} onChange={setTeam} why={u => busyReason(u, annual)} />
          </section>
        </div>

        <section className="panel prep-go" aria-label="确认出发">
          <dl className="facts">
            <dt>流程</dt><dd>{DUNGEON_STAGES} 张图连打；打完一张可以继续或撤离。HP、道具与武器沿用上一张图结束时的状态，出发后的整备改动不会带进远征。</dd>
            <dt>敌方等级</dt>
            <dd className={picked.length > 0 && target.level > top ? 'risk' : undefined}>{target.name} 敌 Lv {target.level}；我方最高 Lv {top}{picked.length > 0 && target.level > top ? `，敌方高出 ${target.level - top} 级` : ''}</dd>
            <dt>总耗时</dt><dd>打满 {DUNGEON_STAGES} 张共 {DUNGEON_STAGE_DAYS * DUNGEON_STAGES} 日 → {total.label}（每进一张图才支付那 {DUNGEON_STAGE_DAYS} 日）</dd>
            <dt>阵亡</dt><dd className="risk">倒下的角色永久死亡{lead ? `（主角${lead.name}倒下只撤退）` : ''}；撤离保留已发生的伤亡。</dd>
          </dl>
          {quote && <QuoteBox quote={quote} />}
          <div className="go-bar">
            <a className="btn btn-ghost" href={links.camp}>返回军营</a>
            {!quote
              ? <button type="button" className="btn" disabled={busy !== null || picked.length === 0}
                onClick={() => void act('quote', () => session.quote('dungeon', { region: target.id, unitIds: picked.map(u => u.id) }),
                  q => { setQuote(q); return q.blockers.length > 0 ? `现在不能出发：${q.blockers.join('；')}` : `报价：第 1 图推进 ${q.costDays} 日 → ${q.date.label}`; })}>
                {busy === 'quote' ? '预览中…' : '预览第 1 图'}
              </button>
              : <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null || quote.blockers.length > 0}
                onClick={() => void act('start', () => session.execute(quote.quoteId), () => `出发：${target.name}大副本第 1 图`).then(ok => { if (ok) onStarted(); })}>
                {busy === 'start' ? '出发中…' : `确认出发 · ${target.name} · ${picked.length} 人`}
              </button>}
          </div>
        </section>
      </div>
    </Shell>
  );
}
