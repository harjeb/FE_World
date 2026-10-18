import { seedRng } from '../engine/rng.ts';

export type MinigameKind = 'dice' | 'frogs';
export type DiceChoice = 'big' | 'small';
export const MINIGAME_BETS = [20, 50, 100] as const;
export const MINIGAME_PLAYS_PER_QUARTER = 6;
export const FROG_NAMES = ['巴纳比', '莉莉帕', '托德里克', '弗洛丝'] as const;

export interface DiceResult { dice: [number, number, number]; total: number; triple: boolean; big: boolean }
export interface FrogResult { order: number[]; winner: number }

export function rollDice(seed: string): DiceResult {
  const rng = seedRng(`minigame:dice:${seed}`);
  const dice = [rng[0] % 6 + 1, rng[1] % 6 + 1, rng[2] % 6 + 1] as [number, number, number];
  const total = dice[0] + dice[1] + dice[2];
  return { dice, total, triple: dice[0] === dice[1] && dice[1] === dice[2], big: total >= 11 };
}

export function frogRace(seed: string): FrogResult {
  const rng = seedRng(`minigame:frogs:${seed}`);
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng[i % rng.length] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, winner: order[0] };
}

export function dicePayout(bet: number, choice: DiceChoice, result: DiceResult): number {
  if (result.triple) return 0;
  return (choice === 'big') === result.big ? bet * 2 : 0;
}

export function frogPayout(bet: number, pick: number, result: FrogResult): number {
  return pick === result.winner ? Math.floor(bet * 38 / 10) : 0;
}
