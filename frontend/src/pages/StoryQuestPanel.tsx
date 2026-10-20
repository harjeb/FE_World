import { useState } from 'react';
import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { StoryQuest } from '../api/session.ts';
import { annualLive, busyReason } from '../model/roster.ts';
import { go, links } from '../router.ts';
import { advance } from '../ui/calendar.ts';
import { itemName, TeamPicker, useAct } from './SystemParts.tsx';

const rewardLine = (q: StoryQuest) => [`${q.reward.gold.toLocaleString()} 金币`, ...(q.reward.items ?? []).map(([item, count]) => `${itemName(item)} ×${count}`)].join(' · ');

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
      <p className="ch-sub">{quest.briefing}</p>
      <p className="ch-sub">
        改编自经典地图「{quest.mapName}」· {quest.objective} · {quest.costDays} 日 · 最多 {quest.maxUnits} 人 · 敌 Lv {quest.enemyLevel} · 倒下的普通角色永久死亡
      </p>
      <p className="ch-learned"><span className="tag tag-grey">报酬</span>{rewardLine(quest)}</p>
      <p className="ch-learned">
        <span className="tag tag-grey">线索</span>
        {quest.clue.held && quest.clue.note
          ? <><b>「{quest.clue.name}」</b>　{quest.clue.note}</>
          : '这张图里的某个角落藏着一只被遗落的箱子，里面也许有线索。线索不影响通关，每个账号只能取得一次。'}
      </p>
      {quest.legacyCompleted && <p className="ch-sub">这一章在旧版里已被记为完成；仍可补打主线任务，领取线索和报酬。</p>}
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
          <button type="button" className="btn btn-sm btn-primary" disabled={!quest.available || busy !== null} title={quest.available ? undefined : '先结束进行中的战斗、远征或大竞技场'} onClick={prepare}>准备出征</button>
        )}
        {quest.done && !quest.claimed && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null} onClick={() => void claim()}>{busy === `c${quest.id}` ? '领取中…' : '领取任务报酬'}</button>
        )}
      </div>
    </div>
  );
}
