import { addArtBuff } from './art-effects.ts';
import { distance, living } from './units.ts';
import type { BattleEvent, BattleState, Side } from './types.ts';

// Freeze recipients and the source's level at phase start. Moving away does not remove the buff.
// next_phase lasts through the opposing phase and expires before the recipient's next phase.
export function applyTurnSkills(state: BattleState, side: Side, events: BattleEvent[]): void {
  const allies = living(state, side).filter(unit => unit.hp > 0 && !unit.petrified);
  for (const source of allies) {
    if (source.skill !== 'divine_inspiration') continue;
    const nearby = allies.filter(unit => unit.id !== source.id && distance(unit.pos, source.pos) <= 2);
    if (!nearby.length) continue;
    for (const target of [source, ...nearby]) {
      const amount = source.level >= 30 ? 6 : 3;
      addArtBuff(state, target, 'divine_inspiration', 'damage', amount, 'next_phase', events);
      addArtBuff(state, target, 'divine_inspiration', 'spd', amount, 'next_phase', events);
      if (source.level >= 60) addArtBuff(state, target, 'divine_inspiration', 'desperation', 1, 'next_phase', events);
    }
  }
}

export function initializeTurnSkills(state: BattleState): BattleState {
  applyTurnSkills(state, state.phase, []);
  return state;
}
