// A battle played by the rule AI (standing in for the Agent), cut into steps the viewer can walk
// through: one per player command, one per enemy unit, one per phase start. The engine resolves the
// whole enemy phase in one call, so its events are split by acting unit, and every step's board is
// rebuilt from events exactly as the battle page animates them.
import { decide, living, step, unitById } from '@common/engine/index.ts';
import type { ActAction, Action, BattleEvent, BattleState, Side } from '@common/engine/index.ts';
import type { StatKey } from '@common/data/types.ts';

export interface Step {
  turn: number;
  side: Side;
  // Acting unit; null for a phase start.
  actor: string | null;
  action: ActAction | null;
  events: BattleEvent[];
}

export interface Recording {
  steps: Step[];
  // states[i] is the board before steps[i]; the last entry is where the recording stopped.
  states: BattleState[];
  // The engine's own state at that point (with its RNG), to keep playing from.
  last: BattleState;
}

// The unit an event starts acting with, if it is an action event.
function actorOf(e: BattleEvent): string | null {
  switch (e.t) {
    case 'terrain': case 'move': case 'wait': case 'seize': case 'spawn': case 'dance': case 'cast': case 'statusRoll': return e.unit;
    case 'object': return e.by;
    case 'treasure': case 'hazard': case 'status': return e.unit;
    case 'combat': return e.attacker;
    case 'heal': return e.source === 'terrain' ? null : e.by;
    default: return null;
  }
}

function splitPhase(events: BattleEvent[], turn: number): Step[] {
  const steps: Step[] = [];
  let current: Step | null = null;
  let side: Side = 'player';
  for (const e of events) {
    if (e.t === 'phase') {
      side = e.side;
      turn = e.turn;
      current = { turn, side, actor: null, action: null, events: [e] };
      steps.push(current);
      continue;
    }
    const actor = actorOf(e);
    if (actor && (!current || current.actor !== actor || (e.t === 'move' && current.events.some(x => x.t === 'move')))) {
      current = { turn, side, actor, action: null, events: [] };
      steps.push(current);
    }
    if (!current) { current = { turn, side, actor: null, action: null, events: [] }; steps.push(current); }
    current.events.push(e);
  }
  return steps;
}

// The board after events, mirroring battle/playback.ts without animation.
export function applyEvents(before: BattleState, events: BattleEvent[]): BattleState {
  const d = structuredClone(before);
  const unit = (id: string) => d.units.find(u => u.id === id)!;
  for (const e of events) {
    switch (e.t) {
      case 'phase':
        d.phase = e.side;
        d.turn = e.turn;
        for (const u of d.units) u.acted = false;
        break;
      case 'move': {
        const u = unit(e.unit);
        u.pos = [...e.path[e.path.length - 1]];
        u.movedTurn = d.turn;
        break;
      }
      case 'terrain':
        d.map.tiles[e.at[1]][e.at[0]] = e.terrain;
        break;
      case 'combat':
        for (const s of e.strikes) {
          unit(s.target).hp = s.hpAfter;
          if (s.byHpAfter !== undefined) unit(s.by).hp = s.byHpAfter;
        }
        unit(e.attacker).acted = true;
        break;
      case 'defeated':
        unit(e.unit).alive = false;
        break;
      case 'heal':
        unit(e.target).hp = e.hpAfter;
        if (e.by && e.source !== 'terrain') unit(e.by).acted = true;
        break;
      case 'exp': {
        const u = unit(e.unit);
        u.exp = e.exp;
        u.level = e.level;
        break;
      }
      case 'levelUp': {
        const u = unit(e.unit);
        for (const [key, gain] of Object.entries(e.gains) as [StatKey, number][]) {
          u.stats[key] += gain;
          if (key === 'hp') u.hp += gain;
        }
        break;
      }
      case 'wait': case 'seize': case 'cast': case 'art':
        unit(e.unit).acted = true;
        break;
      case 'dance':
        unit(e.unit).acted = true;
        unit(e.target).acted = false;
        break;
      case 'shield':
        unit(e.unit).petrified = true;
        break;
      case 'object': {
        const object = d.objects?.find(o => o.id === e.object);
        if (object) { object.state = e.state; if (e.hpAfter !== undefined) object.hp = e.hpAfter; }
        if (e.state === 'destroyed' && object) d.map.tiles[object.pos[1]][object.pos[0]] = 'floor';
        break;
      }
      case 'spawn':
        if (!d.units.some(u => u.id === e.unit)) d.units.push(structuredClone(e.spawned));
        break;
      case 'treasure': case 'scenario':
        break;
      case 'hazard': {
        const u = unit(e.unit);
        u.hp = e.hpAfter;
        if (e.kind === 'petrified') u.petrified = true;
        break;
      }
      case 'status': {
        const u = unit(e.unit);
        if (e.status === 'petrified') u.petrified = e.active;
        else {
          u.statuses ??= {};
          if (e.status === 'sleep') u.statuses.sleep = e.active || undefined;
          else if (e.active) u.statuses[e.status] = e.turns ?? 3;
          else delete u.statuses[e.status];
          if (Object.keys(u.statuses).length === 0) delete u.statuses;
        }
        break;
      }
      case 'artState':
        unit(e.unit).artEffects = structuredClone(e.effects);
        break;
      case 'embers':
        d.embers = structuredClone(e.cells);
        break;
      case 'end':
        d.result = { winner: e.winner, reason: e.reason };
        break;
    }
  }
  return d;
}

// Rebuilds a recording from a stored battle (GET_REPLAY): the opening board plus the recorded
// commands reproduce exactly what happened, because the engine is deterministic.
export function replayFrom(initial: BattleState, actions: Action[]): Recording {
  let state = initial;
  const steps: Step[] = [];
  for (const action of actions) {
    const result = step(state, action);
    if (action.type === 'endPhase') {
      steps.push(...splitPhase(result.events, state.turn));
    } else {
      steps.push({
        turn: state.turn, side: 'player', actor: action.type === 'act' ? action.unit : null,
        action: action.type === 'act' ? action : null, events: result.events,
      });
    }
    state = result.state;
  }
  const states = [initial];
  for (const s of steps) states.push(applyEvents(states[states.length - 1], s.events));
  return { steps, states, last: state };
}

// Plays from `start` until the battle ends (or `until` says stop before a player command).
export function record(start: BattleState, until?: (state: BattleState) => boolean): Recording {
  let state = start;
  const steps: Step[] = [];
  outer: while (!state.result) {
    for (const u of living(state, 'player')) {
      if (until?.(state)) break outer;
      const current = unitById(state, u.id);
      if (state.result || !current.alive || current.acted) continue;
      const action = decide(state, current);
      const result = step(state, action);
      steps.push({ turn: state.turn, side: 'player', actor: current.id, action, events: result.events });
      state = result.state;
    }
    if (state.result) break;
    if (until?.(state)) break;
    const result = step(state, { type: 'endPhase' });
    steps.push(...splitPhase(result.events, state.turn));
    state = result.state;
  }
  const states = [start];
  for (const s of steps) states.push(applyEvents(states[states.length - 1], s.events));
  return { steps, states, last: state };
}
