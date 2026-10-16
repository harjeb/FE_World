import type { Action, BattleEvent, BattleState } from '@common/engine/index.ts';

// What a battle page needs from whoever opened it: the starting state, how to label it, and what
// happens on save, exit and at the end. The field demo and arena attacks each provide one.
export interface BattleSession {
  key: string;
  initial: BattleState;
  meta: {
    region: string;
    goal: string;
    // Third HUD block: three-star condition for field battles, scoring for the arena.
    extraLabel: string;
    extraValue: string;
  };
  // Arena attacks surrender (counts as a loss); field battles retreat.
  surrender: boolean;
  // 观战 / 回放: the viewer cannot issue commands; something else drives the controller.
  readOnly?: boolean;
  // Server-authoritative battles run each command through the API and use the returned state.
  apply?: (action: Action) => Promise<{ state: BattleState; events: BattleEvent[] }>;
  // Field battles can start over; an arena attack cannot (docs/05: 一次进攻没有重来).
  restart?: () => BattleState;
  // Called with the authoritative state after every accepted command.
  onChange?: (state: BattleState) => void;
  exit?: { label: string; href: string };
  result: (state: BattleState, restart: () => void) => BattleResultView;
}

export interface BattleResultView {
  title: string;
  won: boolean;
  lines: string[];
  action: { label: string; run: () => void };
}
