import { OP } from '@common/protocol/ops.ts';
import { session, useSession } from '../api/session.ts';
import type { QuestRegion, QuestView } from '../api/session.ts';
import { go, links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { LockIcon } from '../ui/icons.tsx';
import { dateLabel } from '../ui/calendar.ts';
import { useAct } from './SystemParts.tsx';

type Phase = 'locked' | 'available' | 'done' | 'claimed';
const phaseOf = (q: QuestView): Phase => (!q.available && !q.done ? 'locked' : !q.done ? 'available' : !q.claimed ? 'done' : 'claimed');
const PHASE_TAG: Record<Phase, [string, string]> = {
  locked: ['未解锁', 'tag-grey'], available: ['可接取', 'tag-blue'], done: ['奖励待领取', 'tag-green'], claimed: ['已完成', 'tag-brass'],
};
const KIND_TEXT: Record<QuestView['kind'], string> = { rout: '讨伐', seize: '占领/抵达', defend: '坚守' };

const rewardText = (q: QuestView) => [
  `${q.reward.gold} 金币`,
  `${q.reward.reputation} 声望`,
  ...(q.reward.items ?? []).map(([item, count]) => `${item} ×${count}`),
].join(' · ');

// 地区任务 (docs/20): 短/标准任务耗 4/8 日，胜利标记完成，奖励与声望分开领取；声望永久、不因购买扣除。
export function QuestsPage() {
  const { quests, state } = useSession();
  const { busy, act } = useAct();
  const day = state?.day ?? 0;

  if (!quests) {
    return <Shell current="quests"><p style={{ color: '#4E473D' }}>暂时读不到地区任务（GET_QUESTS），刷新页面再试。</p></Shell>;
  }

  const start = (q: QuestView) => act(`s${q.id}`, async () => {
    await session.run(OP.START_QUEST, { questId: q.id }, false);
    await session.refresh();
    go(links.field);
    return q.name;
  }, name => `开始任务「${name}」，进入战斗。`);

  const claim = (q: QuestView) => act(`c${q.id}`, () => session.run<{ gold: number; reputation: { after: number; tier: { name: string } } }>(OP.CLAIM_QUEST_REWARD, { questId: q.id }),
    r => `领取「${q.name}」：金币 +${r.gold}，声望 ${r.reputation.after}（${r.reputation.tier.name}）`);

  return (
    <Shell current="quests">
      <div className="brief-head">
        <div>
          <div className="eyebrow">地区任务 · {dateLabel(day)}</div>
          <h1 className="serif" style={{ fontSize: 28, lineHeight: 1.25 }}>地区任务与声望</h1>
          <p style={{ fontSize: 14, color: '#4E473D' }}>短任务 4 日、标准任务 8 日。胜利后任务标记完成，金币、物资与声望分开领取；声望永久保留，不因购买扣除。</p>
        </div>
      </div>

      <div className="sys-cols">
        {quests.regions.map(region => <RegionPanel key={region.region} region={region} busy={busy} onStart={start} onClaim={claim} />)}
        <div className="colstack">
          <section className="panel" aria-labelledby="qr-h">
            <div className="ph"><h2 id="qr-h">声望</h2></div>
            <ul className="sys-rules">
              <li>声望永久保留、不因购买扣除，表示当地对你的认可。</li>
              <li>四档：陌生 0 · 熟悉 100 · 信任 250 · 盟友 500。</li>
              <li>中段任务需要熟悉（100）；盟友档留给当地核心任务，不靠刷重复委托。</li>
              <li>首版开放绿林、铁丘、水乡三地；更多地区与声望商店后续接入。</li>
            </ul>
          </section>
        </div>
      </div>
    </Shell>
  );
}

function RegionPanel({ region, busy, onStart, onClaim }: {
  region: QuestRegion; busy: string | null;
  onStart: (q: QuestView) => void; onClaim: (q: QuestView) => void;
}) {
  const next = region.tier.next;
  return (
    <section className="panel" aria-labelledby={`rg-${region.region}`}>
      <div className="ph">
        <h2 id={`rg-${region.region}`}>{region.name}</h2>
        <span style={{ fontSize: 12, color: '#6A6256' }}>
          声望 <b className="num">{region.reputation}</b> · {region.tier.name}{next !== null ? ` · 下一档 ${next}` : ''}
        </span>
      </div>
      <ol className="chapters">
        {region.quests.map(q => {
          const phase = phaseOf(q);
          const [label, tag] = PHASE_TAG[phase];
          return (
            <li key={q.id} className={`chap ${phase}`} data-quest={q.id}>
              <div className="min-w-0">
                <div className="ch-title">
                  <span className="serif">{q.name}</span>
                  <span className={`tag ${tag}`}>{label}</span>
                </div>
                <div className="ch-sub">
                  {KIND_TEXT[q.kind]} · {q.objective} · {q.costDays} 日 · 回合上限 {q.turnLimit}
                </div>
                <p className="ch-learned"><span className="tag tag-grey">奖励</span>{rewardText(q)}</p>
                {phase === 'locked' && q.requires && (
                  <p className="ch-sub"><LockIcon /> 需要{q.requires.quest ? `完成任务 ${q.requires.quest}` : ''}{q.requires.quest && q.requires.reputation ? '、' : ''}{q.requires.reputation ? `声望 ${q.requires.reputation}` : ''}</p>
                )}
              </div>
              <div className="ch-acts">
                {phase === 'available' && (
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null}
                    onClick={() => onStart(q)}>
                    {busy === `s${q.id}` ? '开始中…' : '开始任务'}
                  </button>
                )}
                {phase === 'done' && (
                  <button type="button" className="btn btn-sm btn-primary" disabled={busy !== null}
                    onClick={() => onClaim(q)}>
                    {busy === `c${q.id}` ? '领取中…' : '领取奖励'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
