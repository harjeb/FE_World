// Agent 阶段意图 for the demo. The rule AI stands in for the Agent, so each player phase gets a note
// written from the commands it is about to give (targets, heals, who holds), never from their
// results, the way an Agent reports its plan before acting (AGENT_PHASE_NOTE, docs/06).
import { unitById } from '@common/engine/index.ts';
import type { Recording } from './recording.ts';

export interface PhaseNote { turn: number; text: string; at: string }

export function phaseNotes(rec: Recording, model = 'claude-opus-5-5'): Map<number, PhaseNote & { model: string }> {
  const notes = new Map<number, PhaseNote & { model: string }>();
  const turns = [...new Set(rec.steps.filter(s => s.side === 'player' && s.action).map(s => s.turn))];
  for (const turn of turns) {
    const attacks = new Map<string, string[]>();
    const heals: string[] = [];
    const advance: string[] = [];
    const hold: string[] = [];
    rec.steps.forEach((s, i) => {
      if (s.side !== 'player' || s.turn !== turn || !s.action) return;
      const state = rec.states[i];
      const me = unitById(state, s.action.unit).name;
      if (s.action.act === 'attack') {
        const target = unitById(state, s.action.target).name;
        attacks.set(target, [...(attacks.get(target) ?? []), me]);
      } else if (s.action.act === 'heal') heals.push(`${me}治疗${unitById(state, s.action.target).name}`);
      else {
        const from = unitById(state, s.action.unit).pos;
        (from[0] === s.action.to[0] && from[1] === s.action.to[1] ? hold : advance).push(me);
      }
    });
    const parts = [...attacks].map(([target, by]) => (by.length > 1 ? `${by.join('、')}集火${target}` : `${by[0]}压制${target}`));
    parts.push(...heals);
    if (advance.length > 0) parts.push(`${advance.join('、')}向前推进`);
    if (hold.length > 0) parts.push(`${hold.join('、')}原地待命`);
    const minutes = 30 + turn * 3;
    notes.set(turn, { turn, text: `${parts.join('；')}。`, at: `10:${String(minutes).padStart(2, '0')}:${String((turn * 17) % 60).padStart(2, '0')}`, model });
  }
  return notes;
}
