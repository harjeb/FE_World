import type { AnyRequest, Battle, Event, Operation, PlayerState, Run, Unit, WorldAction } from '../../../backend/common/protocol/v2.ts';
import { sampleBattle, sampleLegacyPreview, sampleRun, sampleState, sampleUnit, sampleWorld } from '../../../backend/common/protocol/v2.examples.ts';
import { compareCursors } from './store.ts';
import type { Transport } from './transport.ts';

export type MockScenario = 'camp' | 'dungeon' | 'battle';
const queryOperations: Operation[] = [
  'GET_CAPABILITIES', 'GET_STATE', 'GET_WORLD', 'GET_ROSTER', 'GET_UNIT', 'GET_INVENTORY',
  'GET_ACTIVE_RUN', 'GET_RUN', 'GET_BATTLE', 'GET_EVENTS', 'GET_COMMAND_STATUS',
  'GET_LEGACIES', 'GET_QUESTS', 'GET_DISCOVERIES', 'GET_PRODUCTION', 'GET_ARENA',
  'GET_ARENA_HISTORY', 'PREVIEW_ACTION', 'PREVIEW_LEGACY',
];
const writeOperations: Operation[] = ['EXECUTE_ACTION', 'DEPLOY', 'WITHDRAW_RUN'];
const regionNames = ['晨原', '绿林', '铁丘', '边关', '水乡', '古城', '兽岭', '风崖', '荒漠', '龙谷', '旧王陵', '天门'];
const positions: [number, number][] = [[535,625],[705,485],[355,500],[525,360],[655,730],[825,385],[220,405],[470,245],[845,745],[930,240],[135,240],[610,145]];

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(',')}}`;
  return JSON.stringify(value);
}

// Deliberately limited UI fixtures. No engine-v2 combat, inheritance or economic rewards are faked.
export class MockTransport implements Transport {
  readonly mode = 'mock' as const;
  private player: PlayerState = structuredClone(sampleState);
  private units: Unit[];
  private battle: Battle | null = null;
  private readonly events: Event[] = [];
  private readonly receipts = new Map<string, { payload: string; response: unknown }>();
  private readonly quotes = new Map<string, { action: WorldAction; playerVersion: number; expires: number }>();
  private sequence = 317;
  private quoteSequence = 0;
  private readonly now: () => number;
  constructor(scenario: MockScenario = 'camp', now: () => number = Date.now) {
    this.now = now;
    this.units = [structuredClone(sampleUnit), {
      ...structuredClone(sampleUnit), id: 'unit-demo-02', name: '旧日伙伴', status: scenario === 'camp' ? 'active' : 'dead',
    }, { ...structuredClone(sampleUnit), id: 'unit-demo-03', name: '无名之神', isProtagonist: true, lifespanEndDay: null }];
    this.player.roster.active = scenario === 'camp' ? 3 : 2;
    if (scenario !== 'camp') {
      this.player.activeRun = structuredClone(sampleRun);
      for (const unit of this.units) if (unit.status === 'active') unit.lockedByRunId = sampleRun.id;
      if (scenario === 'battle') {
        this.player.activeRun.state = 'battle';
        this.player.activeRun.battleId = sampleBattle.id;
        this.battle = structuredClone(sampleBattle);
      }
    }
    this.player.features = {
      mock: { enabled: true, reason: 'Isolated in-memory fixture data; not a backend.' },
      combat: { enabled: false, reason: 'Server engine v2 has not been implemented.' },
      annual_arena: { enabled: false, reason: 'Read-only fixtures; no annual tournament simulation.' },
      refinement: { enabled: false, reason: 'Timing and latency rules require a backend prototype.' },
    };
  }

  private ok(request: AnyRequest, data: unknown) {
    return structuredClone({ protocolVersion: 2, op: request.op, seq: request.seq, ok: true, playerVersion: this.player.playerVersion, data });
  }
  private fail(request: AnyRequest, code: string, message: string, retry = 'none') {
    return { protocolVersion: 2, op: request.op, seq: request.seq, ok: false, playerVersion: this.player.playerVersion,
      error: { code, message, retry, details: null } };
  }

  async send(request: AnyRequest, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    switch (request.op) {
      case 'GET_CAPABILITIES': return this.ok(request, { protocolVersion: 2, operations: [...queryOperations, ...writeOperations], features: this.player.features });
      case 'GET_STATE': return this.ok(request, this.player);
      case 'GET_ACTIVE_RUN': return this.ok(request, this.player.activeRun);
      case 'GET_RUN': return this.player.activeRun?.id === request.data.runId ? this.ok(request, this.player.activeRun) : this.fail(request, 'NOT_FOUND', 'No such mock activity');
      case 'GET_WORLD': return this.ok(request, {
        clearedRegions: 1, activeRunId: this.player.activeRun?.id ?? null,
        regions: regionNames.map((name, index) => {
          const offset = index < 2 || index === 4 ? 0 : index < 8 ? 1 : 2;
          const level = index === 0 ? 5 : 13 + offset;
          return { ...sampleWorld.regions[0], id: `region-${String(index + 1).padStart(2,'0')}`, name,
            location: positions[index], neighborIds: ['capital'], offset,
            cleared: index === 0, firstClearLevel: index === 0 ? 5 : null,
            nextEncounter: { baseLevel: level, normalRange: [level - 2, level + 2], bossLevel: level + 4 } };
        }),
      });
      case 'GET_ROSTER': return this.ok(request, { items: this.units.filter(unit => unit.status === request.data.status), nextCursor: null });
      case 'GET_UNIT': {
        const unit = this.units.find(unit => unit.id === request.data.unitId);
        return unit ? this.ok(request, unit) : this.fail(request, 'NOT_FOUND', 'No such mock unit');
      }
      case 'GET_INVENTORY': return this.ok(request, {
        items: this.units.filter(unit => unit.status === 'active').map((unit, index) => ({
          ...sampleBattle.units[0].inventory[0], id: `item-demo-0${index + 1}`, ownerUnitId: unit.id,
          location: this.player.activeRun ? 'run' : 'unit', lockedByRunId: unit.lockedByRunId,
        })), materials: [{ templateId: 'iron_ore', quantity: 12 }], capacity: { used: 2, maximum: 100 },
      });
      case 'GET_BATTLE': return this.battle?.id === request.data.battleId ? this.ok(request, this.battle) : this.fail(request, 'NOT_FOUND', 'No such mock battle');
      case 'GET_EVENTS': {
        const available = this.events.filter(event => request.data.after === null || compareCursors(event.cursor, request.data.after) > 0);
        const items = available.slice(0, request.data.limit);
        return this.ok(request, { items, nextCursor: available.length > items.length ? items.at(-1)!.cursor : null, resyncRequired: false });
      }
      case 'GET_COMMAND_STATUS': {
        const receipt = this.receipts.get(request.data.commandId);
        return this.ok(request, { state: receipt ? 'committed' : 'unknown', response: receipt?.response ?? null });
      }
      case 'GET_PRODUCTION': return this.ok(request, []);
      case 'GET_QUESTS': case 'GET_DISCOVERIES': case 'GET_LEGACIES': case 'GET_ARENA_HISTORY': return this.ok(request, { items: [], nextCursor: null });
      case 'GET_ARENA': return this.ok(request, { annualAvailable: false, entry: null, history: [] });
      case 'PREVIEW_LEGACY': return this.ok(request, { ...sampleLegacyPreview, legacyId: request.data.legacyId, recipientUnitId: request.data.recipientUnitId, mode: request.data.mode });
      case 'PREVIEW_ACTION': return this.preview(request);
    }
    if (!writeOperations.includes(request.op) || !('commandId' in request) || typeof request.commandId !== 'string') return this.fail(request, 'FEATURE_DISABLED', `${request.op} is not implemented by this mock`);
    const payload = canonical({ op: request.op, data: request.data, expectedPlayerVersion: request.expectedPlayerVersion, expectedBattleVersion: request.expectedBattleVersion });
    const old = this.receipts.get(request.commandId);
    if (old) return old.payload === payload ? { ...structuredClone(old.response as object), seq: request.seq } : this.fail(request, 'IDEMPOTENCY_CONFLICT', 'Command ID already used with different data');
    if (request.expectedPlayerVersion !== this.player.playerVersion) return this.fail(request, 'STALE_PLAYER_VERSION', 'Refresh the mock state', 'refresh');

    let value: unknown;
    if (request.op === 'EXECUTE_ACTION') {
      const quote = this.quotes.get(request.data.quoteId);
      if (!quote || quote.expires <= this.now() || quote.playerVersion !== this.player.playerVersion) return this.fail(request, 'QUOTE_STALE', 'Request a new mock quote', 'refresh');
      const action = quote.action;
      let days: number;
      if (action.kind === 'wait') {
        days = action.days;
        value = { runId: null, entityId: null };
      } else if (action.kind === 'continue_run') {
        const run = this.player.activeRun!;
        run.stageIndex++;
        run.state = 'deployment';
        days = 8;
        value = { runId: run.id, entityId: null };
      } else if (action.kind === 'start_field' || action.kind === 'start_dungeon') {
        const run: Run = {
          ...structuredClone(sampleRun), id: `mock-run-${this.player.playerVersion}`, kind: action.kind === 'start_dungeon' ? 'dungeon' : 'field',
          state: 'deployment', regionId: action.regionId, registrationDay: this.player.calendar.day,
          lockedUnitIds: [...action.unitIds], survivingUnitIds: [...action.unitIds], lockedItemIds: [...action.itemIds],
          stageIndex: 0, stageCount: action.kind === 'start_dungeon' ? 3 : 1, battleId: null, pendingLoot: [],
        };
        this.player.activeRun = run;
        for (const unit of this.units) if (action.unitIds.includes(unit.id)) unit.lockedByRunId = run.id;
        days = 8;
        value = { runId: run.id, entityId: null };
      } else return this.fail(request, 'FEATURE_DISABLED', 'This action is outside the mock scope');
      this.player.calendar.day += days;
      this.player.calendar.year = Math.floor(this.player.calendar.day / 120) + 1;
      this.player.calendar.quarter = Math.floor((this.player.calendar.day % 120) / 30) + 1;
      this.player.calendar.dayOfYear = this.player.calendar.day % 120 + 1;
      this.quotes.delete(request.data.quoteId);
    } else if (request.op === 'DEPLOY') {
      const run = this.player.activeRun;
      if (!run || run.id !== request.data.runId || run.state !== 'deployment') return this.fail(request, 'RUN_STATE_INVALID', 'No mock deployment is pending');
      if (!request.data.deployment.length || request.data.deployment.some(slot => !run.survivingUnitIds.includes(slot.unitId))) return this.fail(request, 'UNIT_DEAD', 'Only locked survivors can deploy');
      this.battle = { ...structuredClone(sampleBattle), id: `${run.id}-map-${run.stageIndex}`, runId: run.id, version: 0, turn: 1 };
      this.battle.units = [
        ...request.data.deployment.map(slot => {
          const unit = this.units.find(unit => unit.id === slot.unitId)!;
          return { ...structuredClone(sampleBattle.units[0]), id: unit.id, persistentUnitId: unit.id,
            name: unit.name, hp: unit.currentHp, stats: { ...unit.stats }, position: slot.position, statuses: structuredClone(sampleBattle.units[0].statuses) };
        }), structuredClone(sampleBattle.units[1]),
      ];
      run.state = 'battle';
      run.battleId = this.battle.id;
      value = this.battle;
    } else if (request.op === 'WITHDRAW_RUN') {
      const run = this.player.activeRun;
      if (!run || run.id !== request.data.runId) return this.fail(request, 'RUN_STATE_INVALID', 'No matching mock activity');
      value = { ...structuredClone(run), state: 'withdrawn', battleId: null, pendingLoot: [] };
      this.player.activeRun = null;
      this.battle = null;
      for (const unit of this.units) unit.lockedByRunId = null;
    } else return this.fail(request, 'FEATURE_DISABLED', 'Mutation not supported by this mock');

    this.player.playerVersion++;
    const event: Event = { cursor: String(++this.sequence), type: 'MOCK_STATE_CHANGED', entityId: this.player.playerId,
      playerVersion: this.player.playerVersion, battleVersion: this.battle?.version ?? null, payload: { op: request.op } };
    this.player.lastEventCursor = event.cursor;
    this.events.push(event);
    const response = this.ok(request, { value, state: this.player, events: [event] });
    this.receipts.set(request.commandId, { payload, response });
    return response;
  }

  private preview(request: Extract<AnyRequest, { op: 'PREVIEW_ACTION' }>) {
    const action = request.data.action;
    const run = this.player.activeRun;
    if (action.kind === 'continue_run') {
      if (!run || run.id !== action.runId || run.state !== 'between_maps' || !run.canContinue || run.stageIndex + 1 >= run.stageCount) return this.fail(request, 'RUN_STATE_INVALID', 'No next mock dungeon map');
    } else if (run) return this.fail(request, 'ACTIVE_RUN_EXISTS', 'Finish or withdraw the current mock activity');
    else if (action.kind === 'wait') {
      if (!Number.isSafeInteger(action.days) || action.days < 1 || action.days > 120) return this.fail(request, 'VALIDATION_FAILED', 'Wait must be 1 to 120 days');
    } else if (action.kind === 'start_field' || action.kind === 'start_dungeon') {
      if (!action.unitIds.length || action.unitIds.some(id => !this.units.some(unit => unit.id === id && unit.status === 'active'))) return this.fail(request, 'UNIT_DEAD', 'Select available mock units');
    } else return this.fail(request, 'FEATURE_DISABLED', 'This action is outside the mock scope');
    const id = `mock-quote-${++this.quoteSequence}`;
    const expires = this.now() + 60_000;
    this.quotes.set(id, { action: structuredClone(action), playerVersion: this.player.playerVersion, expires });
    const days = action.kind === 'wait' ? action.days : 8;
    return this.ok(request, {
      id, action, playerVersion: this.player.playerVersion, rulesetVersion: 'mock-v2',
      cost: { days, gold: 0, materials: [] }, startDay: this.player.calendar.day,
      endDay: this.player.calendar.day + days, expiresAt: new Date(expires).toISOString(),
      encounteredEvents: [], risk: action.kind === 'wait' ? 'none' : 'permadeath', blockers: [],
      enemyLevels: action.kind === 'wait' ? null : { minimum: 12, maximum: 18 },
    });
  }
}
