import type { AiDifficulty } from '@common/engine/types.ts';
import { DifficultyChoice, difficultyLabel } from '../battle/DifficultyChoice.tsx';
import { useEffect, useRef, useState } from 'react';
import { REPUTATION_TIERS } from '@common/game/reputation.ts';
import { REGION_EXPLORATION_GAIN } from '@common/game/region-map.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ChallengeFloor, QuestRegion, QuestView } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { annualLive, busyReason } from '../model/roster.ts';
import { featuresOf } from '../model/access.ts';
import { filterCounts, ITEM_FILTERS, kindOrder, matchItemFilter } from '../model/item-filter.ts';
import type { ItemFilter } from '../model/item-filter.ts';
import { go, links, regionInHash } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { LockIcon } from '../ui/icons.tsx';
import { RegionExploration } from '../ui/RegionExploration.tsx';
import { advance, dateLabel } from '../ui/calendar.ts';
import { itemName, TeamPicker, useAct } from './SystemParts.tsx';
import { CrossTimeEnemyPreview } from './CrossTimeEnemyPreview.tsx';
import { CrossTimeBrief } from './CrossTimeBrief.tsx';
import { crossTimeReward, isCrossTime, questsInRegion } from './cross-time.ts';
import { itemSpec } from './PrepParts.tsx';

type Phase = 'locked' | 'ongoing' | 'available' | 'done' | 'claimed';
const phaseOf = (q: QuestView): Phase => (q.inProgress ? 'ongoing' : !q.available && !q.done ? 'locked' : !q.done ? 'available' : isCrossTime(q) || q.claimed ? 'claimed' : 'done');
const PHASE_TAG: Record<Phase, [string, string]> = {
  ongoing: ['进行中', 'tag-brass'], locked: ['未解锁', 'tag-grey'], available: ['可接取', 'tag-blue'], done: ['奖励待领取', 'tag-green'], claimed: ['已完成', 'tag-brass'],
};
const KIND_TEXT: Record<QuestView['kind'], string> = { rout: '讨伐', seize: '占领/抵达', defend: '坚守', escape: '撤离', gather: '抢物资', escort: '护送' };
const TIER_TEXT: Record<QuestView['tier'], string> = { short: '短任务', standard: '标准任务', region: '地区远征' };

const items = (list: [string, number][] | undefined) => (list ?? []).map(([item, count]) => `${itemName(item)} ×${count}`);
const rewardText = (q: QuestView) => isCrossTime(q) ? crossTimeReward('normal', q.done) : [`${q.reward.gold.toLocaleString()} 金币`, `${q.reward.reputation} 声望`, ...items(q.reward.items), ...(q.exclusive ? [`专属实物：${q.exclusive.name}`] : [])].join(' · ');

function FirstClearLoot({ reward }: { reward: NonNullable<QuestView['firstClearRewards']>['normal'] }) {
  if (!reward) return null;
  return <>
    {reward.items.map(({ item, count }) => `${itemName(item)} ×${count}`).join(' · ')} · 本难度首通：{reward.available ? '未完成' : '已完成'}
    <br /><span className="muted">本难度首次完整通关自动入库；普通、困难各一次固定奖励，探索度仍只增加一次</span>
  </>;
}

function Tabs({ current }: { current: 'regions' | 'tower' }) {
  const { state } = useSession();
  const tower = featuresOf(state).tower;
  return (
    <nav className="ptabs field-tabs" aria-label="任务分类">
      <a className="ptab" href={links.quests} aria-current={current === 'regions' ? 'page' : undefined}>地区任务 <span className="tag tag-grey">声望与固定人物</span></a>
      {tower && <a className="ptab" href={links.tower} aria-current={current === 'tower' ? 'page' : undefined}>挑战塔 <span className="tag tag-grey">通关后内容</span></a>}
    </nav>
  );
}

export function QuestsPage({ tab }: { tab: 'regions' | 'tower' }) {
  const { state } = useSession();
  return (
    <Shell current="quests">
      <div className="prep">
        <Tabs current={tab} />
        {state && (tab === 'tower' ? <TowerTab /> : <RegionsTab />)}
      </div>
    </Shell>
  );
}

// 地区任务 (docs/20): pick a region, read its quests and shop, preview the party, date and risk before
// committing. Rewards are claimed separately; reputation never goes down when you buy.
function RegionsTab() {
  const { quests, state, annual, today, run } = useSession();
  const { busy, act } = useAct();
  const [regionId, setRegionId] = useState<number | null>(() => regionInHash(window.location.hash));
  const [selected, setSelected] = useState<string | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('normal');
  const prepRef = useRef<HTMLElement>(null);
  useEffect(() => { if (selected) prepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [selected]);
  if (!quests || !state) return <p style={{ color: '#4E473D' }}>暂时读不到地区任务，刷新页面再试。</p>;
  // 防御性过滤：GET_QUESTS 已只返回已开通地区，这里再按 state.regions 过一次，避免显示未开通地区。
  const openIds = new Set(state.regions.map(r => r.id));
  const openRegions = quests.regions.filter(r => openIds.has(r.region))
    .map(r => ({ ...r, quests: questsInRegion(quests, r.region) }));
  if (openRegions.length === 0) {
    return (
      <div className="prep">
        <Tabs current="regions" />
        <section className="panel" style={{ padding: 16 }}>
          <h1 className="serif" style={{ fontSize: 24 }}>还没有已开通的地区</h1>
          <p style={{ fontSize: 14, color: '#4E473D', margin: '8px 0 12px' }}>地区任务随讨伐路线逐区开放；先在世界地图上选择一条路线。</p>
          <a className="btn btn-primary" href={links.world}>打开世界地图</a>
        </section>
      </div>
    );
  }
  const region = openRegions.find(r => r.region === regionId)
    ?? openRegions.find(r => r.quests.some(q => phaseOf(q) === 'done'))
    ?? openRegions.find(r => r.quests.some(q => phaseOf(q) === 'available'))
    ?? openRegions[0];
  const quest = region.quests.find(q => q.id === selected) ?? null;
  const allQuests = openRegions.flatMap(r => r.quests);
  const questName = (id: string) => allQuests.find(q => q.id === id)?.name ?? id;
  const active = state.units.filter(u => u.status === 'active');
  const locked = annualLive(annual);
  const battleLocked = !!today?.battle || run?.state === 'battle' || run?.state === 'between_maps' || allQuests.some(q => q.inProgress);
  const hardUnlocked = quest?.hardAvailable === true && quest.hardUnlocked === true;
  const effectiveDifficulty = hardUnlocked ? aiDifficulty : 'normal';

  const pick = (q: QuestView) => {
    setAiDifficulty('normal');
    setSelected(q.id);
    setTeam(active.filter(u => !busyReason(u, annual)).slice(0, q.maxUnits).map(u => u.id));
  };
  const start = (q: QuestView) => act(`s${q.id}`, async () => {
    await session.run(OP.START_QUEST, { questId: q.id, region: region.region, unitIds: team, aiDifficulty: q.hardUnlocked === true ? effectiveDifficulty : 'normal' });
    // 远征／连续副本任务进入副本页；单图任务进入普通出击页。
    go(q.tier === 'region' || (q.classic?.stageCount ?? 1) > 1 ? links.dungeon : links.field);
    return q.name;
  }, name => `开始任务「${name}」，进入战斗。`);
  const claim = (q: QuestView) => act(`c${q.id}`, () => session.run<{ gold: number; items: [string, number][]; reputation: { after: number; tier: { name: string } }; recruited?: { name: string }[]; recruitLine?: string | null }>(OP.CLAIM_QUEST_REWARD, { questId: q.id }),
    r => `领取「${q.name}」：金币 +${r.gold}${r.items.length ? `、${items(r.items).join('、')}` : ''}，声望 ${r.reputation.after}（${r.reputation.tier.name}）${r.recruited?.length ? `，${r.recruited.map(u => u.name).join('、')} 加入名册` : ''}${r.recruitLine ? ` ${r.recruitLine}` : ''}`);
  const buy = (regionNo: number, item: string) => act(`b${regionNo}-${item}`, () => session.run<{ name: string; price: number }>(OP.BUY_QUEST_ITEM, { region: regionNo, item }),
    r => `购买 ${r.name}（−${r.price.toLocaleString()} 金币）`);

  return (
    <>
      <div className="brief-head">
        <div>
          <div className="eyebrow">地区任务 · {dateLabel(state.day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>地区任务与声望</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>每个地区一条本地任务链：短任务、标准任务与地区远征（连战多图）。胜利后任务标记完成，金币、物资与声望另行领取；倒下的普通角色永久死亡。</p>
        </div>
        <div style={{ fontSize: 13, color: '#4E473D', textAlign: 'right' }}>声望档：{REPUTATION_TIERS.map(t => `${t.name} ${t.at}`).join(' · ')}</div>
      </div>

      <div className="quest-cols">
        <section className="panel" aria-labelledby="rgl-h">
          <div className="ph"><h2 id="rgl-h">地区</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{openRegions.length} 个已开通</span></div>
          <ul className="region-list">
            {openRegions.map(r => <RegionRow key={r.region} region={r} current={r.region === region.region} onPick={() => { setRegionId(r.region); setSelected(null); }} />)}
          </ul>
        </section>

        <div className="colstack">
          {quest && (
            <section ref={prepRef} className="panel quest-prep" aria-label="任务出征确认">
              <div className="ph"><h2>{quest.name} · 出征准备</h2><button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>收起</button></div>
              <dl className="facts">
                <dt>目标</dt><dd>{KIND_TEXT[quest.kind]} · {quest.objective} · 回合上限 {quest.turnLimit}</dd>
                <dt>出战</dt><dd>本图最多 {quest.maxUnits} 人 · 敌军 Lv {isCrossTime(quest) ? effectiveDifficulty === 'hard' ? 52 : 48 : quest.enemyLevel}{isCrossTime(quest) ? '' : quest.enemyLevelCap ? `（本图上限 ${quest.enemyLevelCap}）` : ''}</dd>
                <dt>日期</dt><dd>推进 {quest.costDays} 日 → {advance(state.day, quest.costDays).label}{(quest.classic?.stageCount ?? 1) > 1 || quest.tier === 'region' ? '（连战按每图支付，整本合计）' : ''}</dd>
                <dt>奖励</dt><dd>{isCrossTime(quest) ? crossTimeReward(effectiveDifficulty, effectiveDifficulty === 'normal' ? quest.done : quest.firstClearRewards?.hard?.available === false) : rewardText(quest)}{quest.optionalReward ? `；带回 1 箱即可完成，之后每多 1 箱再得${itemName(quest.optionalReward.item)} ×${quest.optionalReward.perExtraBox}` : ''}</dd>
                {!isCrossTime(quest) && quest.firstClearRewards && <><dt>本难度首通</dt><dd><FirstClearLoot reward={quest.firstClearRewards[effectiveDifficulty]} /></dd></>}
                {quest.stageNames && <><dt>关卡顺序</dt><dd>{quest.stageNames.join(' → ')}</dd></>}
                <dt>阵亡</dt><dd className="risk">倒下的普通角色永久死亡，主角只撤退；失败或撤退不发通关奖励，已发生的伤亡和消耗保留。</dd>
              </dl>
              {isCrossTime(quest) && <><CrossTimeBrief /><CrossTimeEnemyPreview difficulty={effectiveDifficulty} day={state.day} /></>}
              {quest.done && !isCrossTime(quest) && <p className="pfoot">再次出征保留任务完成与领奖记录，固定任务奖励不会重复领取。</p>}
              {quest.hardAvailable && <DifficultyChoice value={effectiveDifficulty} hardUnlocked={hardUnlocked} unlockReason="以普通难度完整通关本副本后解锁，仅限本副本。" help={isCrossTime(quest) ? '固定17名敌军，普通48级、困难52级，面板见上方敌军详情；两档均消耗8日。困难使用更强的行动规划，奖励按本副本独立结算。出发后难度与敌军面板固定。' : undefined} onChange={setAiDifficulty} disabled={busy !== null || locked || battleLocked} />}
              <TeamPicker units={active} team={team} max={quest.maxUnits} protagonist={state.player.protagonist} onChange={setTeam} why={u => busyReason(u, annual)} />
              <div className="go-bar">
                {locked && <span className="why" style={{ marginRight: 'auto' }}>大竞技场进行中，暂时不能接任务</span>}
                {battleLocked && <span className="why">已有战斗或远征进行中，暂时不能出征</span>}
                <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>取消</button>
                <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null || team.length === 0 || locked || battleLocked || quest.inProgress || quest.archived || !quest.available} onClick={() => void start(quest)}>
                  {busy === `s${quest.id}` ? '出发中…' : `确认出征 · ${team.length} 人 · ${difficultyLabel(effectiveDifficulty)}`}
                </button>
              </div>
            </section>
          )}
          <RegionPanel region={region} busy={busy} startLocked={locked || battleLocked} questName={questName} onStart={pick} onClaim={q => void claim(q)} onBuy={(r, item) => void buy(r, item)} />
        </div>
      </div>
    </>
  );
}

function RegionRow({ region, current, onPick }: { region: QuestRegion; current: boolean; onPick: () => void }) {
  const done = region.quests.filter(q => q.done).length;
  const due = region.quests.filter(q => q.done && !q.claimed && !isCrossTime(q)).length;
  const open = region.quests.filter(q => phaseOf(q) === 'available').length;
  const next = region.tier.next;
  return (
    <li>
      <button type="button" className="rg-row" aria-pressed={current} onClick={onPick}>
        <span className="min-w-0">
          <b>{region.name}</b>
          <span className="rm-sub">声望 {region.reputation} · {region.tier.name}{next !== null ? ` · 下一档 ${next}` : ''}</span>
          <span className="rep-bar" aria-hidden="true"><i style={{ width: `${Math.min(100, (region.reputation / 500) * 100)}%` }} /></span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="num" style={{ fontSize: 12, color: '#6A6256' }}>{done} / {region.quests.length}</span>
          {due > 0 ? <span className="tag tag-green">待领 {due}</span> : open > 0 ? <span className="tag tag-blue">可接 {open}</span> : null}
        </span>
      </button>
    </li>
  );
}

function RegionPanel({ region, busy, startLocked, questName, onStart, onClaim, onBuy }: {
  region: QuestRegion; busy: string | null; startLocked: boolean; questName: (id: string) => string;
  onStart: (q: QuestView) => void; onClaim: (q: QuestView) => void; onBuy: (region: number, item: string) => void;
}) {
  const next = region.tier.next;
  const { state } = useSession();
  const exploration = state?.world.nodes.find(node => node.id === region.region);
  const [shopFilter, setShopFilter] = useState<ItemFilter>('all');
  // 声望商店按物品分类过滤（武器按剑/枪/斧/弓/拳/短刀/兽/龙/魔道书/杖细分），芯片带数量。
  const shopKeys = region.shop.map(s => s.item);
  const counts = filterCounts(shopKeys);
  const wares = region.shop
    .filter(s => matchItemFilter(s.item, shopFilter))
    .sort((a, b) => kindOrder(a.item) - kindOrder(b.item) || a.price - b.price);
  return (
    <section className="panel" aria-labelledby={`rg-${region.region}`}>
      <div className="ph">
        <h2 id={`rg-${region.region}`}>{region.name}</h2>
        <span style={{ fontSize: 12, color: '#6A6256' }}>声望 <b className="num">{region.reputation}</b> · {region.tier.name}{next !== null ? ` · 距下一档 ${next - region.reputation}` : ''}</span>
      </div>
      {exploration && <div style={{ padding: '12px 16px' }}>
        <RegionExploration region={exploration} />
        <p style={{ fontSize: 12, color: '#6A6256', marginTop: 6 }}>单图任务完成 +{REGION_EXPLORATION_GAIN.quest} 探索度，多图任务首次整本通关 +{REGION_EXPLORATION_GAIN.dungeon}；跨时空试炼不增加探索度。探索满后可在<a href={links.world}>世界地图</a>开通相邻新路线。</p>
      </div>}
      <ol className="chapters quest-list">
        {region.quests.map(q => {
          const phase = phaseOf(q);
          const [label, tag] = PHASE_TAG[phase];
          return (
            <li key={q.id} className={`chap ${phase}`} data-quest={q.id}>
              <div className="min-w-0">
                <div className="ch-title">
                  <span className="serif">{q.name}</span>
                  <span className={`tag ${tag}`}>{label}</span>
                  <span className="tag tag-grey">{TIER_TEXT[q.tier]}</span>
                </div>
                <div className="ch-sub">
                  {q.classic ? `经典 · ${q.classic.mapName}${q.classic.stageCount > 1 ? ` · ${q.classic.stageCount} 图连战` : ''}${q.classic.adapted ? ' · 经适配' : ''} · ` : ''}
                  {KIND_TEXT[q.kind]} · {q.objective} · {q.costDays} 日 · 最多 {q.maxUnits} 人 · 敌 Lv {q.enemyLevel}
                </div>
                <p className="ch-learned"><span className="tag tag-grey">奖励</span>{rewardText(q)}</p>
                {!isCrossTime(q) && q.firstClearRewards && <p className="ch-learned" aria-label="首通奖励"><span className="tag tag-grey">普通首通奖励</span><FirstClearLoot reward={q.firstClearRewards.normal} /></p>}
                {isCrossTime(q) && <p className="ch-sub">全账号通用 · 胜利自动发奖 · 不增加探索度或声望{q.done && <> · <a href={`${links.tavern}?panel=cross-time`}>前往跨时空兑换</a></>}</p>}
                {q.archived && <p className="ch-sub">已归档，仅保留进行中任务与待领取奖励，不能再次出征。</p>}
                {phase === 'locked' && q.requires && (
                  <p className="ch-sub ch-req"><LockIcon /> 需要{q.requires.quest ? `先完成「${questName(q.requires.quest)}」` : ''}{q.requires.quest && q.requires.reputation ? '、' : ''}{q.requires.reputation ? `声望 ${q.requires.reputation}` : ''}</p>
                )}
              </div>
              <div className="ch-acts">
                {phase === 'ongoing' && <a className="btn btn-sm btn-primary" href={q.tier === 'region' ? links.dungeon : links.field}>继续任务</a>}
                {phase === 'available' && !q.archived && (
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null || startLocked} onClick={() => onStart(q)}>准备出征</button>
                )}
                {q.hardAvailable && !q.archived && q.available && (phase === 'done' || phase === 'claimed') && (
                  <button type="button" className="btn btn-sm" disabled={busy !== null || startLocked} onClick={() => onStart(q)}>再次出征</button>
                )}
                {phase === 'done' && (
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => onClaim(q)}>
                    {busy === `c${q.id}` ? '领取中…' : '领取奖励'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {region.shop.length > 0 && <>
        <div className="grp">声望商店 · 达到档位才能买，购买不扣声望</div>
        <div className="chips" role="group" aria-label={`${region.name}商店分类`} style={{ padding: '0 14px' }}>
          {ITEM_FILTERS.map(([f, label]) => (
            <button key={f} type="button" className="chip" aria-pressed={shopFilter === f}
              onClick={() => setShopFilter(f)}>{label}{counts[f] ? ` ${counts[f]}` : ''}</button>
          ))}
        </div>
        <ul className="eq">
          {wares.map(s => (
            <li key={s.item}>
              <span className="slot-free" aria-hidden="true" />
              <div className="min-w-0"><div className="nm">{s.name} <span className="cnt">{s.price.toLocaleString()} 金</span></div><div className="sp">需要声望 {s.reputation} · {itemSpec(s.item)}</div></div>
              {s.unlocked
                ? <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => onBuy(region.region, s.item)}>{busy === `b${region.region}-${s.item}` ? '购买中…' : '购买'}</button>
                : <span className="tag tag-grey">声望不足</span>}
            </li>
          ))}
          {wares.length === 0 && <li className="empty-row">这个分类下没有在售的物品</li>}
        </ul>
      </>}
    </section>
  );
}

const rewardLine = (r: ChallengeFloor['first']) => [`${r.gold.toLocaleString()} 金币`, ...items(r.items)].join(' · ');

// 挑战塔 (docs/00 §9.6): classic maps at fixed high levels with real death; first and repeat rewards are
// claimed once each. The final floor opens after chapter 8.
function TowerTab() {
  const { state, annual } = useSession();
  const { data: floors, error } = useServerData(() => session.challenges(), []);
  const { busy, act } = useAct();
  const [selected, setSelected] = useState<string | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  if (!state) return null;
  const active = state.units.filter(u => u.status === 'active');
  const floor = floors?.find(f => f.id === selected) ?? null;
  const locked = annualLive(annual);
  const pick = (f: ChallengeFloor) => {
    setSelected(f.id);
    setTeam(active.filter(u => !busyReason(u, annual)).sort((a, b) => b.level - a.level).slice(0, f.maxUnits).map(u => u.id));
  };
  const start = (f: ChallengeFloor) => act('start', async () => {
    await session.run(OP.START_CHALLENGE, { floorId: f.id, unitIds: team });
    go(links.field);
    return f.name;
  }, name => `进入${name}`);
  const claim = (f: ChallengeFloor) => act(`c${f.id}`, () => session.run<{ key: string; gold: number; items: [string, number][]; equipment: string[] }>(OP.CLAIM_CHALLENGE_REWARD, { floorId: f.id }),
    r => `${r.key.endsWith('equipment-v1') ? '装备补领' : `领取${r.key.endsWith('first') ? '首通' : '重复'}奖励`}：金币 +${r.gold}${r.items.length ? `、${items(r.items).join('、')}` : ''}${r.equipment.length ? `、${r.equipment.map(itemName).join('、')}` : ''}`);
  const top = Math.max(0, ...active.map(u => u.level));
  return (
    <>
      <div className="brief-head">
        <div>
          <div className="eyebrow">挑战塔 · {dateLabel(state.day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>挑战塔</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>用经典地图与固定的高等级敌军检验军团；普通角色真实死亡。每层先通关，再分别领一次首通奖励与一次重复奖励。终层在主线第八章完成后开放。</p>
        </div>
      </div>
      {error && <p className="sys-strip">{error}</p>}
      <div className="tower">
        {(floors ?? []).map(f => {
          const claimable = f.available && f.cleared && (!f.claimedFirst || !f.claimedRepeat || !f.claimedEquipment);
          return (
            <section key={f.id} className={`panel floor${f.cleared ? ' cleared' : ''}${!f.available ? ' locked' : ''}`} aria-labelledby={`fl-${f.id}`}>
              <div className="ph">
                <h2 id={`fl-${f.id}`}>{f.name}</h2>
                <span className={`tag ${f.cleared ? 'tag-green' : f.available ? 'tag-blue' : 'tag-grey'}`}>{f.cleared ? '已通关' : f.available ? '可挑战' : '第八章后开放'}</span>
              </div>
              <dl className="facts">
                <dt>地图</dt><dd>{f.mapName} · 敌 Lv {f.level}{top < f.level ? <span className="risk">（我方最高 Lv {top}）</span> : ''}</dd>
                <dt>出战</dt><dd>最多 {f.maxUnits} 人 · 推进 {f.costDays} 日</dd>
                <dt>首通</dt><dd>{rewardLine(f.first)}{f.claimedFirst ? '（已领）' : ''}</dd>
                <dt>重复</dt><dd>{rewardLine(f.repeat)}{f.claimedRepeat ? '（已领）' : f.claimedFirst ? '' : '（首通领取后）'}</dd>
                <dt>首通装备</dt><dd>{f.equipment.map(itemName).join(' · ')}（{f.claimedEquipment ? '已领' : '未领'}）</dd>
                <dt>阵亡</dt><dd className="risk">普通角色永久死亡</dd>
              </dl>
              <div className="go-bar">
                {claimable && <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void claim(f)}>{busy === `c${f.id}` ? '领取中…' : f.claimedFirst && f.claimedRepeat ? '装备补领' : `领取${f.claimedFirst ? '重复' : '首通'}奖励`}</button>}
                <button type="button" className="btn btn-sm" disabled={!f.available || locked} onClick={() => pick(f)}>准备挑战</button>
              </div>
            </section>
          );
        })}
        {floors && floors.length === 0 && <p className="sys-note">没有塔层。</p>}
      </div>
      {floor && (
        <section className="panel" aria-label="挑战准备">
          <div className="ph"><h2>{floor.name} · 出战队伍 {team.length} / {floor.maxUnits}</h2><button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>收起</button></div>
          <TeamPicker units={active} team={team} max={floor.maxUnits} protagonist={state.player.protagonist} onChange={setTeam} why={u => busyReason(u, annual)} />
          <div className="go-bar">
            <span className="muted" style={{ marginRight: 'auto', fontSize: 13 }}>推进 {floor.costDays} 日 → {advance(state.day, floor.costDays).label}</span>
            <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null || team.length === 0 || locked} onClick={() => void start(floor)}>
              {busy === 'start' ? '进入中…' : `确认挑战 · ${team.length} 人`}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
