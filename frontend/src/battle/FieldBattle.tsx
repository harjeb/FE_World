import { useEffect, useState } from 'react';
import type { BattleState } from '@common/engine/index.ts';
import { session } from '../api/session.ts';
import { go, links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { BattlePage } from './BattlePage.tsx';
import { fallenLine } from './Dialogs.tsx';
import type { BattleSession } from './session.ts';
import { SortiePrep } from './SortiePrep.tsx';

const GOAL_TEXT: Record<BattleState['goal']['kind'], (s: BattleState) => string> = {
  boss: () => '击败敌方主将或全灭',
  rout: () => '全灭敌军',
  seize: () => '主将压制目标点',
  defend: s => `坚守 ${s.turnLimit} 回合`,
  escape: s => `撤离 ${s.goal.kind === 'escape' ? s.goal.need : 1} 人到撤离点`,
  gather: s => `带 ${s.goal.kind === 'gather' ? s.goal.need : 1} 箱物资撤离`,
  escort: () => '护送对象抵达撤离点',
};

// 出击 is a real server battle (docs/00 §8.1.2). The page resumes an unfinished field battle; otherwise
// it shows 出征准备 and spends nothing until the player confirms there. Every command then goes
// through UNIT_ACT, and the result writes back to the roster.
export function FieldBattle() {
  const [check, setCheck] = useState(0);
  const [stage, setStage] = useState<'loading' | 'prep' | 'battle'>('loading');
  const [built, setBuilt] = useState<BattleSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = (state: BattleState, costDays?: number | null): BattleSession => {
    const cost = costDays ?? session.get().today?.actions.find(a => a.key === 'sortie')?.costDays;
    return {
      key: state.id,
      initial: state,
      meta: { region: state.name.split(' · ')[0], goal: GOAL_TEXT[state.goal.kind](state), extraLabel: '行动日消耗', extraValue: cost ? `${cost} 日` : '—' },
      surrender: false,
      apply: action => session.applyBattle(state.id, action),
      exit: { label: '返回军营', href: links.camp },
      result: end => {
        const won = end.result?.winner === 'player';
        return {
          title: won ? '胜利' : '战败',
          won,
          lines: [fallenLine(end), won ? '战后经验、武器熟练度与战利品已结算到名册。' : '撤退保留已获得的经验；阵亡的普通单位不会归来。'],
          // Back to 出征准备, never straight into another 8-day sortie.
          action: { label: '再次出击', run: () => setCheck(c => c + 1) },
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
        setBuilt(build(active.state, active.costDays));
        setStage('battle');
      } else {
        setStage('prep');
      }
    });
    return () => { alive = false; };
  }, [check]);

  async function start(region: number, unitIds: string[]) {
    setBusy(true);
    setError(null);
    try {
      const { state } = await session.sortie(region, unitIds);
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
  return <SortiePrep busy={busy} error={error} onStart={(region, unitIds) => void start(region, unitIds)} />;
}
