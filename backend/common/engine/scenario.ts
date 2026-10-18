import { createEnemy } from '../game/enemies.ts';
import { MOVEMENT, TERRAINS } from '../maps/map.ts';
import { attackWeapons, cellKey, classOf, inBounds, living, samePoint, unitAt } from './units.ts';
import { WEAPONS } from '../data/weapons.ts';
import { EngineError } from './types.ts';
import type {
  BattleEvent, BattleObject, BattleState, Point, ScenarioAction, ScenarioEvent, ScenarioMapChange, UnitState,
} from './types.ts';

// 经典地图物件与声明式事件（QUEST-07）。所有状态都放在 BattleState 里，回放只靠 initial + actions。
export const SCENARIO_EVENT_LIMIT = 32;

const ADJACENT: Point[] = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];

function objectById(state: BattleState, id: string): BattleObject {
  const object = state.objects?.find(entry => entry.id === id);
  if (!object) throw new EngineError('UNKNOWN_OBJECT', `没有物件 ${id}`);
  return object;
}

export function objectAt(state: BattleState, point: Point): BattleObject | undefined {
  return state.objects?.find(object => samePoint(object.pos, point));
}

// Closed doors and intact walls block movement; chests, villages and switches sit on passable ground.
export function objectBlocks(state: BattleState, point: Point): boolean {
  const object = objectAt(state, point);
  if (!object) return false;
  return (object.kind === 'door' && object.state === 'closed') || (object.kind === 'wall' && object.state === 'intact');
}

function adjacent(to: Point, object: BattleObject): boolean {
  return ADJACENT.some(([dx, dy]) => object.pos[0] === to[0] + dx && object.pos[1] === to[1] + dy);
}

function interactionState(object: BattleObject): boolean {
  if (object.kind === 'door') return object.state === 'closed';
  if (object.kind === 'chest') return object.state === 'closed';
  if (object.kind === 'village') return object.state === 'idle';
  if (object.kind === 'switch') return object.state === 'idle';
  return object.kind === 'wall' && object.state === 'intact';
}

const LABELS: Record<BattleObject['kind'], string> = {
  door: '开门', chest: '开箱', village: '访问村庄', wall: '破坏墙壁', switch: '启动机关', ballista: '炮台',
};

// Objects adjacent to the planned destination that this unit could use.
export function interactionOptions(state: BattleState, unit: UnitState, to: Point): { object: string; kind: BattleObject['kind']; label: string }[] {
  if (unit.side !== 'player') return [];
  return (state.objects ?? []).filter(object => interactionState(object) && adjacent(to, object))
    .map(object => ({ object: object.id, kind: object.kind, label: LABELS[object.kind] }));
}

function addLoot(state: BattleState, id: string, item: string, count: number): boolean {
  state.loot ??= [];
  if (state.loot.some(entry => entry.id === id)) return false;
  state.loot.push({ id, item, count });
  return true;
}

function addFlag(state: BattleState, flag: string): void {
  state.scenario ??= { id: 'scenario', adapterVersion: 'inline', sourceSha256: null, baseLevel: 1, events: [], mapChanges: [], fired: [], flags: [] };
  if (!state.scenario.flags.includes(flag)) state.scenario.flags.push(flag);
}

function markObject(state: BattleState, object: BattleObject, next: BattleObject['state'], events: BattleEvent[], by: string): void {
  object.state = next;
  events.push({ t: 'object', object: object.id, by, state: next });
  addFlag(state, `object:${object.id}:${next}`);
}

function objectTreasure(state: BattleState, unit: UnitState, object: BattleObject, events: BattleEvent[]): void {
  if (!object.loot) return;
  if (!addLoot(state, `object:${object.id}`, object.loot.item, object.loot.count)) return;
  events.push({ t: 'treasure', unit: unit.id, object: object.id, item: object.loot.item, count: object.loot.count });
}

export function interactObject(state: BattleState, unit: UnitState, objectId: string, events: BattleEvent[]): void {
  const object = objectById(state, objectId);
  if (!interactionState(object)) throw new EngineError('OBJECT_ALREADY_USED', `${object.label ?? object.id} 已经使用过`);
  if (!adjacent(unit.pos, object)) throw new EngineError('TARGET_OUT_OF_RANGE', '物件不在相邻格');
  if (object.kind === 'door') {
    markObject(state, object, 'open', events, unit.id);
  } else if (object.kind === 'chest') {
    markObject(state, object, 'opened', events, unit.id);
    objectTreasure(state, unit, object, events);
  } else if (object.kind === 'village') {
    markObject(state, object, 'visited', events, unit.id);
    objectTreasure(state, unit, object, events);
  } else if (object.kind === 'switch') {
    markObject(state, object, 'triggered', events, unit.id);
  } else {
    const weapon = attackWeapons(unit)[0];
    if (!weapon) throw new EngineError('WEAPON_RANK_TOO_LOW', `${unit.name} 没有可用的攻击武器`);
    const damage = Math.max(1, unit.stats.str + WEAPONS[weapon].might - 10);
    object.hp = Math.max(0, (object.hp ?? 1) - damage);
    if (object.hp === 0) {
      markObject(state, object, 'destroyed', events, unit.id);
      state.map.tiles[object.pos[1]][object.pos[0]] = 'floor';
    } else {
      events.push({ t: 'object', object: object.id, by: unit.id, state: 'intact' });
    }
  }
  runScenarioEvents(state, events);
}

function freePoint(state: BattleState, wanted: Point, leader: UnitState | undefined): Point | null {
  const fits = (p: Point) => inBounds(state, p) && !objectBlocks(state, p) && !unitAt(state, p)
    && TERRAINS[state.map.tiles[p[1]][p[0]]].costs[0] !== null;
  if (fits(wanted)) return [wanted[0], wanted[1]];
  const queue: Point[] = [[wanted[0], wanted[1]]];
  const seen = new Set<number>([cellKey(state, wanted)]);
  for (let i = 0; i < queue.length && i < 80; i++) {
    const [x, y] = queue[i];
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Point[]) {
      const p: Point = [nx, ny];
      if (!inBounds(state, p) || seen.has(cellKey(state, p))) continue;
      seen.add(cellKey(state, p));
      if (fits(p)) return p;
      queue.push(p);
    }
  }
  // Last resort: stay near the commander's spawn or any free tile.
  return leader && fits(leader.pos) ? [leader.pos[0], leader.pos[1]] : null;
}

function applyMapChange(state: BattleState, change: ScenarioMapChange, events: BattleEvent[], eventId: string): void {
  const touches: { unit: UnitState; tile: number }[] = [];
  for (let dy = 0; dy < change.terrain.length; dy++) {
    for (let dx = 0; dx < change.terrain[dy].length; dx++) {
      const tile = change.terrain[dy][dx];
      if (tile === null) continue;
      const p: Point = [change.position[0] + dx, change.position[1] + dy];
      if (!inBounds(state, p)) continue;
      const unit = unitAt(state, p);
      if (unit) touches.push({ unit, tile: TERRAINS[tile].costs[MOVEMENT[classOf(unit).moveType].index] ?? 99 });
    }
  }
  // 不压死单位：只要有一个单位会被改成不可通行地形，整块变化延后（本事件仍只触发一次）。
  if (touches.some(({ tile }) => tile === null || tile === 99)) {
    events.push({ t: 'scenario', event: eventId, message: '地图变化被单位占据，暂时跳过' });
    return;
  }
  for (let dy = 0; dy < change.terrain.length; dy++) {
    for (let dx = 0; dx < change.terrain[dy].length; dx++) {
      const tile = change.terrain[dy][dx];
      if (tile === null) continue;
      const p: Point = [change.position[0] + dx, change.position[1] + dy];
      if (inBounds(state, p)) state.map.tiles[p[1]][p[0]] = tile;
    }
  }
  events.push({ t: 'scenario', event: eventId, message: '地图发生变化' });
}

function nearestTargets(state: BattleState, side: 'player' | 'enemy', from: Point | undefined, range: number, count: number): UnitState[] {
  return living(state, side).filter(unit => !unit.npc && (!from || Math.abs(unit.pos[0] - from[0]) + Math.abs(unit.pos[1] - from[1]) <= range))
    .sort((a, b) => {
      const da = from ? Math.abs(a.pos[0] - from[0]) + Math.abs(a.pos[1] - from[1]) : 0;
      const db = from ? Math.abs(b.pos[0] - from[0]) + Math.abs(b.pos[1] - from[1]) : 0;
      return da - db || a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(1, count));
}

function applyAction(state: BattleState, event: ScenarioEvent, action: ScenarioAction, events: BattleEvent[]): void {
  if (action.kind === 'spawn') {
    const leader = living(state, 'enemy')[0];
    action.units.forEach((spec, index) => {
      const pos = freePoint(state, spec.pos, leader);
      if (!pos) {
        events.push({ t: 'scenario', event: event.id, message: '增援没有可用的落脚点' });
        return;
      }
      let id = `scenario-${event.id}-${index}`;
      while (state.units.some(unit => unit.id === id)) id += '-x';
      const enemy = createEnemy(id, {
        classId: spec.classId, level: Math.max(1, Math.min(99, (state.scenario?.baseLevel ?? 1) + spec.levelOffset)),
        pos, boss: spec.boss, behavior: spec.behavior,
      });
      state.units.push(enemy);
      events.push({ t: 'spawn', unit: id, event: event.id, spawned: structuredClone(enemy) });
    });
  } else if (action.kind === 'setObject') {
    const object = objectById(state, action.object);
    markObject(state, object, action.state, events, 'event');
  } else if (action.kind === 'mapChange') {
    const change = state.scenario?.mapChanges.find(entry => entry.id === action.change);
    if (change) applyMapChange(state, change, events, event.id);
  } else if (action.kind === 'flag') {
    addFlag(state, action.flag);
  } else if (action.kind === 'loot') {
    if (addLoot(state, `event:${event.id}`, action.item, action.count)) {
      events.push({ t: 'scenario', event: event.id, message: `获得 ${action.item} ×${action.count}` });
    }
  } else if (action.kind === 'goal') {
    state.goal = action.goal;
  } else if (action.kind === 'end') {
    state.result = { winner: action.winner, reason: action.reason };
    events.push({ t: 'end', winner: action.winner, reason: action.reason });
  } else if (action.kind === 'damage' || action.kind === 'status') {
    const targets = nearestTargets(state, action.target, action.from, action.range ?? 99, action.count ?? 1);
    if (targets.length === 0) {
      events.push({ t: 'scenario', event: event.id, message: action.kind === 'damage' ? '炮台没有射程内的目标' : '状态杖没有射程内的目标' });
    }
    for (const target of targets) {
      if (action.kind === 'damage') {
        target.hp = Math.max(0, target.hp - Math.max(1, action.amount));
        if (target.statuses?.sleep) {
          delete target.statuses.sleep;
          if (Object.keys(target.statuses).length === 0) delete target.statuses;
          events.push({ t: 'status', unit: target.id, status: 'sleep', active: false });
        }
        if (target.hp === 0) {
          target.alive = false;
          events.push({ t: 'defeated', unit: target.id });
        }
        events.push({ t: 'hazard', unit: target.id, source: 'ballista', kind: 'damage', amount: Math.max(1, action.amount), hpAfter: target.hp });
      } else if (action.status === 'petrified') {
        target.petrified = true;
        events.push({ t: 'hazard', unit: target.id, source: 'status', kind: 'petrified', hpAfter: target.hp });
        events.push({ t: 'status', unit: target.id, status: 'petrified', active: true });
      } else {
        target.statuses ??= {};
        if (action.status === 'sleep') target.statuses.sleep = true;
        else target.statuses[action.status] = Math.max(target.statuses[action.status] ?? 0, action.turns ?? 3);
        events.push({ t: 'scenario', event: event.id, message: `状态杖命中 ${target.name}` });
        events.push({ t: 'status', unit: target.id, status: action.status, active: true, turns: action.turns ?? 3 });
      }
    }
  } else {
    events.push({ t: 'scenario', event: event.id, message: action.message });
  }
}

function triggered(state: BattleState, event: ScenarioEvent): boolean {
  const trigger = event.trigger;
  if (trigger.kind === 'turn') return state.phase === 'player' && state.turn >= trigger.turn;
  if (trigger.kind === 'object') {
    const object = state.objects?.find(entry => entry.id === trigger.object);
    return !!object && object.state === trigger.state;
  }
  return !!state.scenario?.flags.includes(trigger.flag);
}

export function runScenarioEvents(state: BattleState, events: BattleEvent[]): void {
  const runtime = state.scenario;
  if (!runtime || state.result) return;
  for (let guard = 0; guard < SCENARIO_EVENT_LIMIT; guard++) {
    const event = runtime.events.find(entry => !runtime.fired.includes(entry.id) && triggered(state, entry));
    if (!event) return;
    runtime.fired.push(event.id);
    for (const action of event.actions) {
      if (state.result) return;
      applyAction(state, event, action, events);
    }
  }
  events.push({ t: 'scenario', event: 'limit', message: '事件链超过上限，后续事件已停止' });
}

// Settlement ledger: stable id per chest/village/event, so replay and retries cannot double-pay.
export function scenarioLoot(state: BattleState): { id: string; item: string; count: number }[] {
  const seen = new Set<string>();
  return (state.loot ?? []).filter(entry => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}
