import { useState } from 'react';
import { createPinepassBattle, PINEPASS_META } from '@common/battles/pinepass.ts';
import { BattlePage } from './BattlePage.tsx';
import { fallenLine } from './Dialogs.tsx';
import type { BattleSession } from './session.ts';

const randomSeed = () => Math.random().toString(36).slice(2, 10);

// ?seed=… replays the same battle (useful for sharing a situation and for browser tests).
function seedFromUrl(): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get('seed') || undefined;
  } catch {
    return undefined;
  }
}

// The PvE demo: 黑松隘口, with retreat, three-star condition and unlimited restarts.
export function FieldBattle() {
  const [session] = useState<BattleSession>(() => ({
    key: 'field',
    initial: createPinepassBattle(seedFromUrl() ?? randomSeed()),
    meta: { region: PINEPASS_META.region, goal: PINEPASS_META.goal, extraLabel: '三星评价', extraValue: PINEPASS_META.stars },
    surrender: false,
    restart: () => createPinepassBattle(randomSeed()),
    result: (state, restart) => {
      const won = state.result?.winner === 'player';
      const flawless = state.units.every(u => u.side !== 'player' || u.alive);
      return {
        title: won ? '胜利' : '战败',
        won,
        lines: [fallenLine(state), ...(won ? [`三星条件：12 回合内且无人被击败 —— ${state.turn <= 12 && flawless ? '已达成' : '未达成'}。`] : [])],
        action: { label: '再战一次', run: restart },
      };
    },
  }));
  return <BattlePage session={session} />;
}
