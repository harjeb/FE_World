import { useEffect, useState } from 'react';
import type { BattleState } from '@common/engine/index.ts';
import { session } from '../api/session.ts';
import { go, links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { BattlePage } from './BattlePage.tsx';
import { fallenLine } from './Dialogs.tsx';
import { goalLabel } from './names.ts';
import type { BattleSession } from './session.ts';
import { SortiePrep } from './SortiePrep.tsx';

// 出击 is a real server battle (docs/00 §8.1.2). The page resumes an unfinished field battle; otherwise
// it shows 出征准备 and spends nothing until the player confirms there. Every command then goes
// through UNIT_ACT, and the result writes back to the roster.
export function FieldBattle() {
  const [check, setCheck] = useState(0);
  const [stage, setStage] = useState<'loading' | 'prep' | 'battle'>('loading');
  const [built, setBuilt] = useState<BattleSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = (state: BattleState, costDays?: number | null, from: { questId?: string | null; challengeId?: string | null } = {}): BattleSession => {
    const cost = costDays ?? session.get().today?.actions.find(a => a.key === 'sortie')?.costDays;
    // 任务与挑战塔的战斗也在这一页打；结束后回到各自的页面领奖。
    const back = from.challengeId ? { label: '返回挑战塔', href: links.tower } : from.questId ? { label: '返回任务', href: links.quests } : null;
    const where = from.challengeId ? '挑战塔' : from.questId ? '地区任务' : state.name.split(' · ')[0];
    return {
      key: state.id,
      initial: state,
      meta: { region: where, goal: goalLabel(state), extraLabel: '行动日消耗', extraValue: cost ? `${cost} 日` : '—' },
      surrender: false,
      apply: action => session.applyBattle(state.id, action),
      exit: { label: '返回军营', href: links.camp },
      result: end => {
        const won = end.result?.winner === 'player';
        return {
          title: won ? '胜利' : '战败',
          won,
          lines: [
            fallenLine(end),
            won ? '战后经验、武器熟练度与战利品已结算到名册。' : '撤退保留已获得的经验；阵亡的普通单位不会归来。',
            from.challengeId && won ? '塔层已记为通关：回到挑战塔领取首通／重复奖励。' : from.questId && won ? '任务已完成：回到任务页领取奖励。' : '战报已保存，可以在「战报」里回看。',
          ],
          // Back to 出征准备 (or the quest / tower page), never straight into another sortie.
          action: back ? { label: back.label, run: () => go(back.href) } : { label: '再次出击', run: () => setCheck(c => c + 1) },
        };
      },
    };
  };

  useEffect(() => {
    let alive = true;
    setStage('loading');
    setBuilt(null);
    session.activeBattle().then(active => {
      if (!alive) return;
      // A dungeon map and a 大竞技场 match continue on their own pages, an arena attack keeps its own
      // page too; only a plain field battle resumes here.
      if (active?.mode === 'festival') go(links.annual);
      else if (active?.state.kind === 'field' && session.get().run?.battleId === active.state.id) go(links.dungeon);
      else if (active?.state.kind === 'field') {
        setBuilt(build(active.state, active.costDays, { questId: active.questId, challengeId: active.challengeId }));
        setStage('battle');
      } else {
        setStage('prep');
      }
    });
    return () => { alive = false; };
  }, [check]);

  async function start(quoteId: string) {
    setBusy(true);
    setError(null);
    try {
      const { state } = await session.execute<{ state: BattleState }>(quoteId);
      setBuilt(build(state));
      setStage('battle');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'battle' && built) return <BattlePage key={built.key} session={built} />;
  if (stage === 'loading') {
    return <Shell current="field"><p style={{ color: '#4E473D' }}>正在读取出击状态…</p></Shell>;
  }
  return <SortiePrep busy={busy} error={error} onStart={quoteId => void start(quoteId)} />;
}
