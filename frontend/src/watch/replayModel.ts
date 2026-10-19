// What the 回放 page shows around the board: the event list with its filters, where each step sits
// on the turn timeline, and the result line (winner and the stored reason).
import { describe } from '../battle/log.ts';
import type { LogEntry } from '../battle/log.ts';
import type { Recording } from './recording.ts';

export type ItemType = 'kill' | 'retreat' | 'level' | 'end' | 'other';
export interface ReplayItem { step: number; entry: LogEntry; type: ItemType }

export function replayItems(rec: Recording): ReplayItem[] {
  return rec.steps.flatMap((s, i) => describe(s.events, rec.states[i]).map(entry => {
    const type: ItemType = entry.t === 'end' ? 'end' : entry.t === 'levelUp' ? 'level'
      : entry.t === 'defeated' ? (entry.kind === 'a' ? 'retreat' : 'kill') : 'other';
    return { step: i, entry, type };
  }));
}

export const isKey = (item: ReplayItem) => item.type !== 'other';

export interface Timeline {
  turns: number;
  // Position of a step (its middle) or of the play head after `pos` steps, from 0 to 1.
  at: (step: number) => number;
  head: (pos: number) => number;
  // 第 k / n 步 within the step's phase, counting only unit actions.
  count: (step: number) => { k: number; n: number } | null;
}

export function timeline(rec: Recording): Timeline {
  const { steps } = rec;
  const turns = rec.states[rec.states.length - 1].turn;
  const groups = new Map<string, number[]>();
  steps.forEach((s, i) => {
    const key = `${s.turn}:${s.side}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const group = (i: number) => groups.get(`${steps[i].turn}:${steps[i].side}`)!;
  const place = (i: number, offset: number) => {
    const list = group(i), s = steps[i];
    const frac = (list.indexOf(i) + offset) / list.length;
    return (s.turn - 1 + (s.side === 'enemy' ? 0.5 : 0) + frac * 0.5) / turns;
  };
  return {
    turns,
    at: i => place(i, 0.5),
    head: pos => (pos === 0 ? 0 : place(pos - 1, 1)),
    count: i => {
      const acts = group(i).filter(j => steps[j].actor);
      return steps[i].actor ? { k: acts.indexOf(i) + 1, n: acts.length } : null;
    },
  };
}

// The steps that start each turn's player phase (turn 1 starts at 0).
export function turnStarts(rec: Recording): Map<number, number> {
  const starts = new Map<number, number>([[1, 0]]);
  rec.steps.forEach((s, i) => {
    if (!s.actor && s.side === 'player' && !starts.has(s.turn)) starts.set(s.turn, i + 1);
  });
  return starts;
}

// The stored outcome: who won and, for a loss, the server's reason (全军撤退, 主将阵亡, ...).
export function resultLine(rec: Recording): { won: boolean; reason: string | null } {
  const end = rec.states[rec.states.length - 1];
  const won = end.result?.winner === 'player';
  return { won, reason: won ? null : end.result?.reason ?? null };
}
