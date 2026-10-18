import { useEffect, useRef, useState } from 'react';
import { REPUTATION_TIERS } from '@common/game/reputation.ts';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { ChallengeFloor, QuestRegion, QuestView } from '../api/session.ts';
import { useServerData } from '../api/useServerData.ts';
import { annualLive, busyReason } from '../model/roster.ts';
import { go, links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { LockIcon } from '../ui/icons.tsx';
import { advance, dateLabel } from '../ui/calendar.ts';
import { itemName, TeamPicker, useAct } from './SystemParts.tsx';

type Phase = 'locked' | 'available' | 'done' | 'claimed';
const phaseOf = (q: QuestView): Phase => (!q.available && !q.done ? 'locked' : !q.done ? 'available' : !q.claimed ? 'done' : 'claimed');
const PHASE_TAG: Record<Phase, [string, string]> = {
  locked: ['未解锁', 'tag-grey'], available: ['可接取', 'tag-blue'], done: ['奖励待领取', 'tag-green'], claimed: ['已完成', 'tag-brass'],
};
const KIND_TEXT: Record<QuestView['kind'], string> = { rout: '讨伐', seize: '占领/抵达', defend: '坚守', escape: '撤离', gather: '抢物资', escort: '护送' };
const TIER_TEXT: Record<QuestView['tier'], string> = { short: '短任务', standard: '标准任务', region: '地区远征' };

const items = (list: [string, number][] | undefined) => (list ?? []).map(([item, count]) => `${itemName(item)} ×${count}`);
const rewardText = (q: QuestView) => [`${q.reward.gold.toLocaleString()} 金币`, `${q.reward.reputation} 声望`, ...items(q.reward.items)].join(' · ');

function Tabs({ current }: { current: 'regions' | 'tower' }) {
  return (
    <nav className="ptabs field-tabs" aria-label="任务分类">
      <a className="ptab" href={links.quests} aria-current={current === 'regions' ? 'page' : undefined}>地区任务 <span className="tag tag-grey">声望与固定人物</span></a>
      <a className="ptab" href={links.tower} aria-current={current === 'tower' ? 'page' : undefined}>挑战塔 <span className="tag tag-grey">通关后内容</span></a>
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
  const { quests, state, annual } = useSession();
  const { busy, act } = useAct();
  const [regionId, setRegionId] = useState<number | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  const prepRef = useRef<HTMLElement>(null);
  useEffect(() => { if (selected) prepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [selected]);
  if (!quests || !state) return <p style={{ color: '#4E473D' }}>暂时读不到地区任务（GET_QUESTS），刷新页面再试。</p>;
  const region = quests.regions.find(r => r.region === regionId)
    ?? quests.regions.find(r => r.quests.some(q => phaseOf(q) === 'done'))
    ?? quests.regions.find(r => r.quests.some(q => phaseOf(q) === 'available'))
    ?? quests.regions[0];
  const quest = region.quests.find(q => q.id === selected) ?? null;
  const allQuests = quests.regions.flatMap(r => r.quests);
  const questName = (id: string) => allQuests.find(q => q.id === id)?.name ?? id;
  const active = state.units.filter(u => u.status === 'active');
  const locked = annualLive(annual);

  const pick = (q: QuestView) => {
    setSelected(q.id);
    setTeam(active.filter(u => !busyReason(u, annual)).slice(0, q.maxUnits).map(u => u.id));
  };
  const start = (q: QuestView) => act(`s${q.id}`, async () => {
    await session.run(OP.START_QUEST, { questId: q.id, unitIds: team }, false);
    await session.refresh();
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
          <div className="ph"><h2 id="rgl-h">地区</h2><span style={{ fontSize: 12, color: '#6A6256' }}>{quests.regions.length} 个</span></div>
          <ul className="region-list">
            {quests.regions.map(r => <RegionRow key={r.region} region={r} current={r.region === region.region} onPick={() => { setRegionId(r.region); setSelected(null); }} />)}
          </ul>
        </section>

        <div className="colstack">
          {quest && (
            <section ref={prepRef} className="panel quest-prep" aria-label="任务出征确认">
              <div className="ph"><h2>{quest.name} · 出征准备</h2><button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(null)}>收起</button></div>
              <dl className="facts">
                <dt>目标</dt><dd>{KIND_TEXT[quest.kind]} · {quest.objective} · 回合上限 {quest.turnLimit}</dd>
                <dt>出战</dt><dd>本图最多 {quest.maxUnits} 人 · 敌军 Lv {quest.enemyLevel}{quest.enemyLevelCap ? `（本图上限 ${quest.enemyLevelCap}）` : ''}</dd>
                <dt>日期</dt><dd>推进 {quest.costDays} 日 → {advance(state.day, quest.costDays).label}{(quest.classic?.stageCount ?? 1) > 1 || quest.tier === 'region' ? '（连战按每图支付，整本合计）' : ''}</dd>
                <dt>奖励</dt><dd>{rewardText(quest)}{quest.optionalReward ? `；带回 1 箱即可完成，之后每多 1 箱再得${itemName(quest.optionalReward.item)} ×${quest.optionalReward.perExtraBox}` : ''}</dd>
                <dt>阵亡</dt><dd className="risk">倒下的普通角色永久死亡，主角只撤退；失败或撤退不发通关奖励，已发生的伤亡和消耗保留。</dd>
              </dl>
              <TeamPicker units={active} team={team} max={quest.maxUnits} protagonist={state.player.protagonist} onChange={setTeam} why={u => busyReason(u, annual)} />
              <div className="go-bar">
                {locked && <span className="why" style={{ marginRight: 'auto' }}>大竞技场进行中，暂时不能接任务</span>}
                <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)}>取消</button>
                <button type="button" className="btn btn-primary btn-lg" disabled={busy !== null || team.length === 0 || locked} onClick={() => void start(quest)}>
                  {busy === `s${quest.id}` ? '出发中…' : `确认出征 · ${team.length} 人`}
                </button>
              </div>
            </section>
          )}
          <RegionPanel region={region} busy={busy} questName={questName} onStart={pick} onClaim={q => void claim(q)} onBuy={(r, item) => void buy(r, item)} />
        </div>
      </div>
    </>
  );
}

function RegionRow({ region, current, onPick }: { region: QuestRegion; current: boolean; onPick: () => void }) {
  const done = region.quests.filter(q => q.done).length;
  const due = region.quests.filter(q => q.done && !q.claimed).length;
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

function RegionPanel({ region, busy, questName, onStart, onClaim, onBuy }: {
  region: QuestRegion; busy: string | null; questName: (id: string) => string;
  onStart: (q: QuestView) => void; onClaim: (q: QuestView) => void; onBuy: (region: number, item: string) => void;
}) {
  const next = region.tier.next;
  return (
    <section className="panel" aria-labelledby={`rg-${region.region}`}>
      <div className="ph">
        <h2 id={`rg-${region.region}`}>{region.name}</h2>
        <span style={{ fontSize: 12, color: '#6A6256' }}>声望 <b className="num">{region.reputation}</b> · {region.tier.name}{next !== null ? ` · 距下一档 ${next - region.reputation}` : ''}</span>
      </div>
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
                {phase === 'locked' && q.requires && (
                  <p className="ch-sub ch-req"><LockIcon /> 需要{q.requires.quest ? `先完成「${questName(q.requires.quest)}」` : ''}{q.requires.quest && q.requires.reputation ? '、' : ''}{q.requires.reputation ? `声望 ${q.requires.reputation}` : ''}</p>
                )}
              </div>
              <div className="ch-acts">
                {phase === 'available' && (
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => onStart(q)}>准备出征</button>
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
        <ul className="eq">
          {region.shop.map(s => (
            <li key={s.item}>
              <span className="slot-free" aria-hidden="true" />
              <div className="min-w-0"><div className="nm">{s.name} <span className="cnt">{s.price.toLocaleString()} 金</span></div><div className="sp">需要声望 {s.reputation}</div></div>
              {s.unlocked
                ? <button type="button" className="btn btn-sm" disabled={busy !== null} onClick={() => onBuy(region.region, s.item)}>{busy === `b${region.region}-${s.item}` ? '购买中…' : '购买'}</button>
                : <span className="tag tag-grey">声望不足</span>}
            </li>
          ))}
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
  const claim = (f: ChallengeFloor) => act(`c${f.id}`, () => session.run<{ key: string; gold: number; items: [string, number][] }>(OP.CLAIM_CHALLENGE_REWARD, { floorId: f.id }),
    r => `领取${r.key.endsWith('first') ? '首通' : '重复'}奖励：金币 +${r.gold}${r.items.length ? `、${items(r.items).join('、')}` : ''}`);
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
          const claimable = f.cleared && (!f.claimedFirst || !f.claimedRepeat);
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
                <dt>阵亡</dt><dd className="risk">普通角色永久死亡</dd>
              </dl>
              <div className="go-bar">
                {claimable && <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void claim(f)}>{busy === `c${f.id}` ? '领取中…' : `领取${f.claimedFirst ? '重复' : '首通'}奖励`}</button>}
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
