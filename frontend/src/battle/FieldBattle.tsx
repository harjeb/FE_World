import { useEffect, useState } from 'react';
import { OP } from '@common/protocol/ops.ts';
import type { BattleState } from '@common/engine/index.ts';
import { call } from '../api/client.ts';
import { session } from '../api/session.ts';
import { links } from '../router.ts';
import { Shell } from '../shell/Shell.tsx';
import { BattlePage } from './BattlePage.tsx';
import { fallenLine } from './Dialogs.tsx';
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

  const build = (state: BattleState): BattleSession => {
    const cost = session.get().today?.actions.find(a => a.key === 'sortie')?.costDays;
    return {
      key: state.id,
      initial: state,
      meta: { region: state.name.split(' · ')[0], goal: state.goal.kind === 'boss' ? '击败敌方主将或全灭' : '全灭敌军', extraLabel: '行动日消耗', extraValue: cost ? `${cost} 日` : '—' },
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
    call<{ state?: BattleState }>(OP.GET_BATTLE, { full: true }).catch(() => null).then(active => {
      if (!alive) return;
      // Only an unfinished field battle resumes here; an arena attack keeps its own page.
      if (active?.state && !active.state.result && active.state.kind === 'field') {
        setBuilt(build(active.state));
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
