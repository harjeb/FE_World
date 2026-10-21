import { useState } from 'react';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { StoryQuest, StoryStep } from '../api/session.ts';
import { annualLive, busyReason } from '../model/roster.ts';
import { go, links } from '../router.ts';
import { advance } from '../ui/calendar.ts';
import { StoryDialogue } from './StoryDialogue.tsx';
import { itemName, TeamPicker, useAct } from './SystemParts.tsx';

const rewardLine = (q: StoryQuest) => [`${q.reward.gold.toLocaleString()} 金币`, ...(q.reward.items ?? []).map(([item, count]) => `${itemName(item)} ×${count}`)].join(' · ');

// 前置任务（每章两个，类型各章不同）：派遣、提交材料、副本宝箱找物品、单挑、竞技场胜场、酒馆小游戏胜次。
function StepRow({ step, index, readOnly = false }: { step: StoryStep; index: number; readOnly?: boolean }) {
  const { state, annual } = useSession();
  const { busy, act } = useAct();
  const [pickDuel, setPickDuel] = useState(false);
  const [duelist, setDuelist] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const submit = () => act(`step-${step.id}`, () => session.run(OP.COMPLETE_STORY_STEP, { step: step.id }),
    () => `提交了「${step.name}」所需的 ${step.count} 份${step.itemName}`);
  const fight = () => act(`duel-${step.id}`, async () => { await session.run(OP.START_STORY_DUEL, { step: step.id, unitId: duelist }); go(links.field); return step.enemy; },
    enemy => `单挑「${enemy}」开始，进入战斗。`);
  const enough = (step.held ?? 0) >= (step.count ?? 0);
  const fighters = (state?.units ?? []).filter(u => u.status === 'active' && !busyReason(u, annual));
  // 对手按队伍最高等级生成：应战者比对手低 3 级以上时要先确认风险（真实死亡）。
  const chosen = fighters.find(u => u.id === duelist);
  const gap = chosen && step.level !== undefined ? step.level - chosen.level : 0;
  const risky = gap >= 3;
  return (
    <li className={`ch-step${step.done ? ' done' : ''}`} data-step={step.id} data-kind={step.kind}>
      <p className="ch-learned">
        <span className={`tag ${step.done ? 'tag-green' : step.available ? 'tag-blue' : 'tag-grey'}`}>前置 {index + 1}</span>
        <b className="serif">{step.name}</b>
        <span className="tag tag-grey">{KIND_LABEL[step.kind]}</span>
        {step.done ? <span className="tag tag-brass">已完成</span> : step.optional && <span className="tag tag-grey">可选</span>}
      </p>
      <p className="ch-sub">{step.briefing}</p>
      <StoryDialogue scenes={step.scenes} expanded={readOnly ? undefined : step.scenes.at(-1)?.id} />
      {step.reward && <p className="ch-sub"><span className="tag tag-grey">{step.done ? '已发放' : '完成奖励'}</span> {stepRewardLine(step.reward)}</p>}
      {!readOnly && !step.done && step.kind === 'dispatch' && (
        <p className="ch-sub">在<a href={links.dispatch}>后台派遣</a>里派一支队伍探索（任何已开通地区），<b>本章开放之后出发</b>、一次满 {step.days} 日，返程时自动完成。</p>
      )}
      {!readOnly && !step.done && step.kind === 'submit' && (
        <p className="ch-sub">
          需要 {step.count} 份{step.itemName}，仓库里有 <b>{step.held ?? 0}</b> 份；提交后从仓库扣除。
          <button type="button" className="btn btn-sm btn-primary" style={{ marginLeft: 8 }} disabled={!step.available || !enough || busy !== null} title={!enough ? '材料不足' : undefined} onClick={() => void submit()}>
            {busy === `step-${step.id}` ? '提交中…' : '提交材料'}
          </button>
        </p>
      )}
      {!readOnly && !step.done && step.kind === 'find' && (
        <p className="ch-sub">
          在「{step.where}」里（{step.mapName}）找到被藏起来的箱子，取得{step.itemName}；<b>本章开放之后</b>进入副本才会出现，整趟完整通关后入库，每个账号一次。<a href={links.quests}>前往任务</a>
        </p>
      )}
      {!readOnly && !step.done && step.kind === 'arena' && (
        <p className="ch-sub">在<a href={links.arena}>普通竞技场</a>赢 {step.wins} 场（本章开放之后的胜场才计）：<b>{step.have ?? 0} / {step.wins}</b></p>
      )}
      {!readOnly && !step.done && step.kind === 'tavern' && (
        <p className="ch-sub">在<a href={links.tavern}>酒馆</a>的小游戏里赢 {step.wins} 次（返还高于下注，本章开放之后才计）：<b>{step.have ?? 0} / {step.wins}</b></p>
      )}
      {!readOnly && !step.done && step.kind === 'duel' && (
        <>
          <p className="ch-sub">对手是 {step.enemy}：等级 Lv {step.level}，按你队伍里的最高等级来；职业与你选的应战者同阶级（具体职业随机）。只有你选的一名角色应战，<b>真实死亡</b>；输了可以再来，推进 1 日。</p>
          {!pickDuel
            ? <button type="button" className="btn btn-sm btn-primary" disabled={!step.available || busy !== null} onClick={() => { setPickDuel(true); setDuelist(fighters[0]?.id ?? ''); }}>选人应战</button>
            : (
              <>
              <p className="ch-sub">
                <select value={duelist} onChange={e => { setDuelist(e.target.value); setAcknowledged(false); }} aria-label="应战的角色">
                  {fighters.map(u => <option key={u.id} value={u.id}>{u.name} · {u.className} Lv {u.level}</option>)}
                </select>
                <button type="button" className="btn btn-sm btn-primary" style={{ marginLeft: 8 }} disabled={!duelist || busy !== null || (risky && !acknowledged)} onClick={() => void fight()}>
                  {busy === `duel-${step.id}` ? '出战中…' : '开始单挑'}
                </button>
                <button type="button" className="btn btn-sm btn-ghost" style={{ marginLeft: 6 }} onClick={() => setPickDuel(false)}>取消</button>
              </p>
              {risky && (
                <label className="ch-sub ch-req" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />
                  {chosen?.name} 比对手低 {gap} 级，战败会<b>永久死亡</b>。我确认要派他应战。
                </label>
              )}
              </>
            )}
        </>
      )}
    </li>
  );
}

const stepRewardLine = (reward: NonNullable<StoryStep['reward']>) => [`${reward.gold.toLocaleString()} 金币`, ...(reward.bexp ? [`公共经验 ${reward.bexp}`] : []), ...(reward.items ?? []).map(([item, count]) => `${itemName(item)} ×${count}`)].join(' · ');

const KIND_LABEL: Record<StoryStep['kind'], string> = { dispatch: '派遣', submit: '提交材料', find: '副本找物品', duel: '单挑', arena: '竞技场', tavern: '酒馆' };

// 一章的主线任务 (docs/38)：简报、改编地图、线索与出征。任务走地区任务同一套出征和领奖入口，
// 胜利即完成本章事件；章节公共经验仍在上方单独领取。
export function StoryQuestPanel({ quest }: { quest: StoryQuest }) {
  const { state, annual, today, run } = useSession();
  const { busy, act } = useAct();
  const [open, setOpen] = useState(false);
  const [team, setTeam] = useState<string[]>([]);
  if (!state) return null;
  const active = state.units.filter(u => u.status === 'active');
  const locked = annualLive(annual);
  const battleLocked = !!today?.battle || run?.state === 'battle' || run?.state === 'between_maps' || quest.inProgress;

  const prepare = () => {
    setTeam(active.filter(u => !busyReason(u, annual)).slice(0, quest.maxUnits).map(u => u.id));
    setOpen(true);
  };
  const start = () => act(`s${quest.id}`, async () => {
    await session.run(OP.START_QUEST, { questId: quest.id, unitIds: team });
    go(links.field);
    return quest.name;
  }, name => `开始主线任务「${name}」，进入战斗。`);
  const claim = () => act(`c${quest.id}`, () => session.run<{ gold: number; items: [string, number][] }>(OP.CLAIM_QUEST_REWARD, { questId: quest.id }),
    r => `领取「${quest.name}」：金币 +${r.gold}${r.items.length ? `、${r.items.map(([item, count]) => `${itemName(item)} ×${count}`).join('、')}` : ''}`);

  return (
    <div className="ch-quest" data-story-quest={quest.id}>
      <p className="ch-learned">
        <span className="tag tag-blue">主线任务</span><b className="serif">{quest.name}</b>
        {quest.done && <span className={`tag ${quest.claimed ? 'tag-brass' : 'tag-green'}`}>{quest.claimed ? '已完成' : '奖励待领取'}</span>}
        {quest.inProgress && <span className="tag tag-brass">进行中</span>}
      </p>
      <p className="story-background">{quest.background}</p>
      <StoryDialogue scenes={quest.scenes.slice(0, 1)} expanded={quest.done ? undefined : quest.scenes[0]?.id} />
      {quest.steps.length > 0 && (quest.done
        ? <details className="story-investigation"><summary>回看调查经过</summary><ul className="ch-steps" aria-label="调查记录">{quest.steps.map((step, index) => <StepRow key={step.id} step={step} index={index} readOnly />)}</ul></details>
        : <ul className="ch-steps" aria-label="前置任务">{quest.steps.map((step, index) => <StepRow key={step.id} step={step} index={index} />)}</ul>)}
      <StoryDialogue scenes={quest.scenes.slice(1)} expanded={quest.scenes.at(-1)?.id} />
      <p className="ch-sub">{quest.briefing}</p>
      <p className="ch-sub">
        改编自经典地图「{quest.mapName}」· {quest.objective} · {quest.costDays} 日 · 最多 {quest.maxUnits} 人 · 敌 Lv {quest.enemyLevel} · 倒下的普通角色永久死亡
      </p>
      {quest.blocker && !quest.done && <p className="ch-sub ch-req">{quest.blocker}。</p>}
      {quest.prerequisite && !quest.done && <p className="ch-sub ch-req">收尾战要先完成前置任务「{quest.prerequisite}」。</p>}
      <p className="ch-learned"><span className="tag tag-grey">报酬</span>{rewardLine(quest)}</p>
      <p className="ch-learned">
        <span className="tag tag-grey">线索</span>
        {quest.clue.held && quest.clue.note
          ? <><b>「{quest.clue.name}」</b>　{quest.clue.note}</>
          : '这张图里的某个角落藏着一只被遗落的箱子，里面也许有线索。线索不影响通关，每个账号只能取得一次。'}
      </p>
      {open && quest.available && (
        <div className="panel" style={{ margin: '8px 0' }}>
          <TeamPicker units={active} team={team} max={quest.maxUnits} protagonist={state.player.protagonist} onChange={setTeam} why={u => busyReason(u, annual)} />
          <div className="go-bar">
            <span className="muted" style={{ marginRight: 'auto', fontSize: 13 }}>推进 {quest.costDays} 日 → {advance(state.day, quest.costDays).label}</span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>收起</button>
            <button type="button" className="btn btn-primary" disabled={busy !== null || team.length === 0 || locked || battleLocked} onClick={() => void start()}>
              {busy === `s${quest.id}` ? '出征中…' : `出征（${team.length} / ${quest.maxUnits}）`}
            </button>
          </div>
          {locked && <p className="why">大竞技场进行中，暂时不能接任务</p>}
          {battleLocked && <p className="why">已有战斗或远征进行中，暂时不能出征</p>}
        </div>
      )}
      <div className="ch-acts">
        {quest.inProgress && <a className="btn btn-sm btn-primary" href={links.field}>继续任务</a>}
        {!quest.done && !quest.inProgress && !open && (
          <button type="button" className="btn btn-sm btn-primary" disabled={!quest.available || busy !== null} title={quest.blocker ?? (quest.prerequisite ? `先完成前置任务「${quest.prerequisite}」` : quest.available ? undefined : '先结束进行中的战斗、远征或大竞技场')} onClick={prepare}>准备出征</button>
        )}
        {quest.done && !quest.claimed && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void claim()}>{busy === `c${quest.id}` ? '领取中…' : '领取任务报酬'}</button>
        )}
      </div>
    </div>
  );
}
