import { decide } from './ai.ts';
import { step } from './step.ts';
import { living, unitById } from './units.ts';
import type { BattleState } from './types.ts';

// Plays a battle to the end with the rule AI on both sides (simulations, defense trials, tests).
export function autoplay(start: BattleState): BattleState {
  let state = start;
  while (!state.result) {
    for (const unit of living(state, 'player')) {
      const current = unitById(state, unit.id);
      if (state.result || !current.alive || current.acted) continue;
      state = step(state, decide(state, current)).state;
    }
    if (!state.result) state = step(state, { type: 'endPhase' }).state;
  }
  return state;
}
