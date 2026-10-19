import { nextU32, seedRng } from '../engine/rng.ts';

export type MinigameKind = 'dice' | 'frogs';
export type DiceChoice = 'big' | 'small';
export const MINIGAME_BETS = [20, 50, 100] as const;
export const MINIGAME_PLAYS_PER_QUARTER = 6;
// 致敬《重装机兵》初代酒馆的青蛙赛跑：用历史人物命名（初代第四只是车名，这里换成同系列出现过的汉尼拔）。
export const FROG_NAMES = ['凯撒', '克利奥帕特拉', '拿破仑', '汉尼拔'] as const;
// 固定强弱、赔率对应（2026-10-19 确认，数值为首稿）：夺冠权重（合计 100 = 百分比）与押中返还（十分之一倍，含本金）。
// 每只的期望返还都是 96%；返还 × 20/50/100 都能整除，没有小数金币。
export const FROG_CHANCE = [40, 20, 30, 10] as const;
export const FROG_RETURN_TENTHS = [24, 48, 32, 96] as const;

export interface DiceResult { dice: [number, number, number]; total: number; triple: boolean; big: boolean }
export interface FrogResult { order: number[]; winner: number }

export function rollDice(seed: string): DiceResult {
  const rng = seedRng(`minigame:dice:${seed}`);
  const dice = [rng[0] % 6 + 1, rng[1] % 6 + 1, rng[2] % 6 + 1] as [number, number, number];
  const total = dice[0] + dice[1] + dice[2];
  return { dice, total, triple: dice[0] === dice[1] && dice[1] === dice[2], big: total >= 11 };
}

// 按夺冠权重逐名抽出完整名次（不放回）：冠军的概率正好是 FROG_CHANCE，其余名次按剩余权重排。
export function frogRace(seed: string): FrogResult {
  const rng = seedRng(`minigame:frogs:${seed}`);
  const left = [0, 1, 2, 3];
  const order: number[] = [];
  while (left.length) {
    const total = left.reduce((n, frog) => n + FROG_CHANCE[frog], 0);
    let roll = Math.floor(nextU32(rng) / 4294967296 * total);
    const at = left.findIndex(frog => (roll -= FROG_CHANCE[frog]) < 0);
    order.push(...left.splice(at, 1));
  }
  return { order, winner: order[0] };
}

export function dicePayout(bet: number, choice: DiceChoice, result: DiceResult): number {
  if (result.triple) return 0;
  return (choice === 'big') === result.big ? bet * 2 : 0;
}

export function frogPayout(bet: number, pick: number, result: FrogResult): number {
  return pick === result.winner ? bet * FROG_RETURN_TENTHS[pick] / 10 : 0;
}
