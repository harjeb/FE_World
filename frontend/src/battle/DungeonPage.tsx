import { DeploymentOrder } from './DeploymentOrder.tsx';
import { defaultOrder, normalizeOrder, loadDeploymentOrder, saveDeploymentOrder } from './deployment-order.ts';
import type { AiDifficulty } from '@common/engine/types.ts';
import { DifficultyChoice, difficultyLabel } from './DifficultyChoice.tsx';
import { useEffect, useMemo, useState } from 'react';
import type { BattleState } from '@common/engine/index.ts';
import { regionById } from '@common/game/calendar.ts';
import { DUNGEON_DAYS, DUNGEON_STAGES, runStageDays } from '@common/game/expedition.ts';
import { regionalDungeonName } from '@common/game/dungeon-names.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ActionQuote, ServerRun } from '../api/session.ts';
import { links, regionInHash } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { advance, arenaTodayWarning, dateLabel } from '../ui/calendar.ts';
import { RegionExploration } from '../ui/RegionExploration.tsx';
import { itemName, TeamPicker, UnitFace, useAct } from '../pages/SystemParts.tsx';
import { BattlePage } from './BattlePage.tsx';
import { fallenLine } from './Dialogs.tsx';
import { goalLabel } from './names.ts';
import type { BattleSession } from './session.ts';
import { EncounterPreview } from './EncounterPreview.tsx';
import { FieldTabs } from './SortiePrep.tsx';
import { annualLive, busyReason } from '../model/roster.ts';

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
  const { state, quests } = useSession();
  const { busy, act } = useAct();
  const [leaving, setLeaving] = useState(false);
  if (!state) return null;
  const region = regionById(run.region);
  const dungeonName = quests?.regions.flatMap(r => r.quests).find(q => q.id === run.questId)?.name ?? regionalDungeonName(run.region);
  const next = run.stageIndex + 1;
  const stageDays = runStageDays(run);
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
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>{dungeonName}</h1>
            <p style={{ fontSize: 14, color: '#4E473D' }}>已拿下 {run.stageIndex} / {run.stageCount ?? DUNGEON_STAGES} 图。</p>
          </div>
          <span className={`tag ${RUN_STATE[run.state][1]}`}>{RUN_STATE[run.state][0]}</span>
        </div>

        <div className="sys-cols">
          <div className="colstack">
            <section className="panel" aria-labelledby="run-h">
              <div className="ph"><h2 id="run-h">远征进度</h2><span style={{ fontSize: 12, color: '#6A6256' }}>副本等级 ≈ Lv {run.level}</span></div>
              <RunMap run={run} />
              <dl className="facts">
                <dt>战斗难度</dt><dd>{difficultyLabel(run.aiDifficulty)}（本次远征已锁定）</dd>
                {run.encounter && <><dt>生成战场配置</dt><dd>{run.encounter.name} · {run.encounter.width} × {run.encounter.height} · 最多 {run.encounter.maxUnits} 人 · 敌军 {run.encounter.enemyCount} 人（经典终章按对应地图布阵）</dd></>}
                <dt>下一图</dt><dd>{run.nextStageName ?? `第 ${next} 图`} · 推进 {stageDays} 日 → {to.label}{to.passes ? `；${to.passes}` : ''}</dd>
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
  const { today, state, run, annual, quests } = useSession();
  const { busy, act } = useAct();
  const active = state?.units.filter(u => u.status === 'active') ?? [];
  const fallbackMax = today?.actions.find(a => a.key === 'sortie')?.maxUnits ?? 6;
  const [region, setRegion] = useState<number | null>(() => regionInHash(window.location.hash));
  // Same default as 出征准备: the first six, never more than the field allows.
  const [team, setTeam] = useState<string[]>(() => defaultOrder(loadDeploymentOrder(state?.player.id), active.filter(u => !busyReason(u, annual)).map(u => u.id), fallbackMax));
  const [chainId, setChainId] = useState<string | null>(() => new URLSearchParams(window.location.hash.split('?')[1]).get('dungeon'));
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('normal');
  const [quoted, setQuoted] = useState<{ key: string; quote: ActionQuote } | null>(null);
  const setQuote = () => setQuoted(null);
  const target = today?.sortieRegions.find(r => r.id === region) ?? today?.sortieRegions[0];
  const chains = quests?.regions.find(r => r.region === target?.id)?.quests.filter(q => q.dungeonOnly) ?? [];
  const chain = chains.find(q => q.id === chainId) ?? null;
  const hardUnlocked = chain ? chain.hardUnlocked === true : !!target && state?.hardUnlocks?.dungeons?.includes(target.id) === true;
  const effectiveDifficulty = hardUnlocked ? aiDifficulty : 'normal';
  const plan = chain ? undefined : target?.dungeonEncounters?.[effectiveDifficulty];
  const max = chain?.maxUnits ?? plan?.maxUnits ?? fallbackMax;
  const available = active.filter(u => !busyReason(u, annual));
  const selectedIds = normalizeOrder(team, available.map(u => u.id), max);
  const picked = selectedIds.map(id => available.find(u => u.id === id)!);
  const selectionKey = JSON.stringify(selectedIds);
  useEffect(() => setTeam(t => JSON.stringify(t) === selectionKey ? t : selectedIds), [selectionKey]);
  const reorder = (ids: string[]) => {
    setTeam(ids);
    if (state) saveDeploymentOrder(state.player.id, ids);
  };
  const version = state?.version ?? 0;
  const teamKey = selectionKey;
  const quoteKey = JSON.stringify([target?.id, chain?.id, teamKey, version, effectiveDifficulty, plan]);
  const quote = quoted?.key === quoteKey ? quoted.quote : null;
  const [quoteError, setQuoteError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setQuoted(null);
    setQuoteError(null);
    if (target && picked.length && !chain?.archived) {
      session.quote(chain ? 'quest' : 'dungeon', { region: target.id, ...(chain ? { questId: chain.id } : {}), unitIds: selectedIds, aiDifficulty: effectiveDifficulty }).then(q => {
        if (alive) setQuoted({ key: quoteKey, quote: q });
      }).catch(error => { if (alive) setQuoteError(error instanceof Error ? error.message : String(error)); });
    }
    return () => { alive = false; };
  }, [quoteKey]);

  if (!today || !state) {
    return <Shell current="field"><p style={{ color: '#4E473D' }}>暂时读不到出击信息，刷新页面再试。</p></Shell>;
  }
  // 只在已开通的地区里选；没有可选地区时回世界地图开新路线。
  if (!target) {
    return (
      <Shell current="field">
        <div className="prep">
          <FieldTabs current="dungeon" />
          <section className="panel" style={{ padding: 16 }}>
            <h1 className="serif" style={{ fontSize: 24 }}>还没有已开通的地区</h1>
            <a className="btn btn-primary" href={links.world}>打开世界地图</a>
          </section>
        </div>
      </Shell>
    );
  }
  const exploration = state.world.nodes.find(node => node.id === target.id);

  const top = Math.max(0, ...picked.map(u => u.level));
  const baseEnemyLevel = chain?.enemyLevel ?? target.level;
  const enemies = quote?.encounter?.enemies ?? [];
  const averageLevel = enemies.length ? Math.round(enemies.reduce((sum, enemy) => sum + enemy.level, 0) / enemies.length * 10) / 10 : null;
  const enemyLevel = averageLevel ?? baseEnemyLevel;
  const levelLabel = (id: string | null, level: number) =>
    (chain?.id ?? null) === id && averageLevel !== null ? `Lv ${averageLevel}` : `≈ Lv ${level}`;
  const dungeonName = chain?.name ?? regionalDungeonName(target.id);
  const stageNames = chain?.stageNames ?? target.dungeonStages.map(s => s.name);
  const costDays = chain?.costDays ?? DUNGEON_DAYS;
  const total = advance(today.day, costDays);
  const reward = chain ? chain.firstClearRewards?.[effectiveDifficulty] : target.dungeonFirstClearRewards[effectiveDifficulty];
  const startLocked = annualLive(annual) || !!today.battle || run?.state === 'battle' || run?.state === 'between_maps' || !!quests?.regions.some(r => r.quests.some(q => q.inProgress));
  const finished = run && run.state !== 'battle' && run.state !== 'between_maps' ? run : null;
  const finishedName = finished ? quests?.regions.flatMap(r => r.quests).find(q => q.id === finished.questId)?.name ?? regionalDungeonName(finished.region) : '';

  return (
    <Shell current="field">
      <div className="prep">
        <FieldTabs current="dungeon" />
        <div className="brief-head">
          <div>
            <div className="eyebrow">出击 · 大副本</div>
            <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>大副本准备</h1>
          </div>
          <div style={{ fontSize: 13, color: '#4E473D' }}>今天 <b>{dateLabel(today.day)}</b></div>
        </div>

        {finished && (
          <section className="panel last-run" aria-label="上次远征">
            <span className={`tag ${RUN_STATE[finished.state][1]}`}>{RUN_STATE[finished.state][0]}</span>
            <span>上次远征：{finishedName} · 到达第 {Math.min(finished.stageIndex + 1, finished.stageCount ?? DUNGEON_STAGES)} 图 · 副本等级 ≈ Lv {finished.level}</span>
            {finished.state === 'completed' && <span>已入库：{lootLine(finished.pendingLoot)}</span>}
          </section>
        )}

        <div className="prep-cols">
          <section className="panel" aria-labelledby="drg-h">
            <div className="ph"><h2 id="drg-h">选择地区</h2></div>
            <div className="regions" role="radiogroup" aria-label="远征地区">
              {today.sortieRegions.map(r => (
                <button key={r.id} type="button" role="radio" aria-checked={r.id === target.id} className="rg" disabled={busy !== null} onClick={() => { setRegion(r.id); setChainId(null); setAiDifficulty('normal'); setQuote(); }}>
                  <span className="rg-n">{r.name}</span>
                  <span className="rg-l">敌 Lv {r.level}</span>
                  <span className="rg-r">{r.resource}</span>
                  <span className={`tag ${r.cleared ? 'tag-green' : 'tag-grey'}`}>{r.cleared ? '已讨伐' : '未讨伐'}</span>
                </button>
              ))}
            </div>
            {exploration && <div style={{ padding: '0 16px 12px' }}><RegionExploration region={exploration} /></div>}
          </section>

          <section className="panel" aria-labelledby="dtm-h">
            <div className="ph"><h2 id="dtm-h">远征队伍 <span style={{ fontWeight: 500, color: '#6A6256' }}>{picked.length} / {max}</span></h2></div>
            <fieldset disabled={busy !== null} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}><TeamPicker ordered units={active} team={selectedIds} max={max} protagonist={state.player.protagonist} onChange={setTeam} why={u => busyReason(u, annual)} /></fieldset>
          </section>
        </div>

        <section className="panel" aria-label="选择副本">
          <div className="ph"><h2>选择副本</h2></div>
          <div className="regions" role="radiogroup" aria-label="副本路线">
            <button type="button" className="rg" role="radio" aria-checked={!chain} disabled={busy !== null} onClick={() => { setChainId(null); setAiDifficulty('normal'); setQuote(); }}>
              <span className="rg-n">{regionalDungeonName(target.id)}</span><span className="rg-l" title="敌军平均等级">副本等级 {levelLabel(null, target.level)}</span>
            </button>
            {chains.map(q => <button key={q.id} type="button" className="rg" role="radio" aria-checked={chain?.id === q.id} disabled={busy !== null} onClick={() => { setChainId(q.id); setAiDifficulty('normal'); setQuote(); }}>
              <span className="rg-n">{q.name}</span><span className="rg-l" title="敌军平均等级">副本等级 {levelLabel(q.id, q.enemyLevel)}</span>
            </button>)}
          </div>
          {chain && <div style={{ padding: 16 }}>
            <p>{chain.objective}</p>
            <p>任务奖励：{chain.reward.gold} 金币 · {chain.reward.reputation} 声望{chain.reward.items?.map(([item, count]) => ` · ${itemName(item)} ×${count}`).join('')}（另行领取一次）</p>
            {chain.done && !chain.claimed && <button type="button" className="btn btn-primary" disabled={busy !== null} onClick={() => void act('claim', () => session.run(OP.CLAIM_QUEST_REWARD, { questId: chain.id }), () => `已领取「${chain.name}」任务奖励`)}>{busy === 'claim' ? '领取中…' : '领取任务奖励'}</button>}
            {chain.archived && <p className="pfoot">已归档，不能再次出征。</p>}
          </div>}
        </section>

        <DeploymentOrder units={picked} busy={busy !== null} onChange={reorder} />

        <section className="panel prep-go" aria-label="确认出发">
          <dl className="facts">
            <dt>副本等级</dt>
            <dd className={picked.length > 0 && enemyLevel > top ? 'risk' : undefined}>{dungeonName} {levelLabel(chain?.id ?? null, baseEnemyLevel)}（敌军平均等级）；我方最高 Lv {top}{picked.length > 0 && enemyLevel > top ? `，敌方高出 ${Math.round((enemyLevel - top) * 10) / 10} 级` : ''}</dd>
            {reward && <>
              <dt>本难度首通</dt><dd>{lootLine(reward.items)} · {reward.available ? '未完成' : '已完成'}</dd>
            </>}
            <dt>关卡顺序</dt><dd>{stageNames.join(' → ')}</dd>
            <dt>总耗时</dt><dd>共 {costDays} 日 → {total.label}{total.passes ? `；${total.passes}` : ''}</dd>
          </dl>
          {startLocked && <p className="a-warn" role="alert">已有战斗、远征或大竞技场进行中，暂时不能出发。</p>}
          {quoteError && <p role="alert">{quoteError}</p>}
          {quote?.blockers.map(text => <p role="alert" key={text}>{text}</p>)}
          <DifficultyChoice value={effectiveDifficulty} hardUnlocked={hardUnlocked} unlockReason={chain ? '以普通难度完整通关本副本后解锁，仅限本副本。' : '以普通难度完整通关本地区远征后解锁，仅限本地区远征。'} onChange={value => { setQuote(); setAiDifficulty(value); }} disabled={busy !== null} />
          {quote?.encounter && <EncounterPreview encounter={quote.encounter} names={picked.map(u => u.name)} />}
          <div className="go-bar">
            <a className="btn btn-ghost" href={links.camp}>返回军营</a>
            <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null || startLocked || !quote?.encounter || quote.blockers.length > 0 || (!!chain && (!chain.available || chain.archived))}
              onClick={() => quote && void act('start', () => session.execute(quote.quoteId), () => `出发：${dungeonName}`).then(ok => { if (ok) onStarted(); })}>
              {busy === 'start' ? '出发中…' : `确认出发 · ${dungeonName} · ${picked.length} 人 · ${difficultyLabel(effectiveDifficulty)}`}
            </button>
          </div>
        </section>
      </div>
    </Shell>
  );
}
