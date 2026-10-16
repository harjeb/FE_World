import type {
  ActionQuote, Deployment, LegacyPreview, Stats, UnitAction, WorldAction,
} from '../../../backend/common/protocol/v2.ts';
import { GameClient } from './client.ts';
import type { Versioned } from './client.ts';
import { ClientError } from './errors.ts';

// Headless use cases. The UI decides when to ask for confirmation and render returned DTOs.
export class GameFlows {
  private readonly client: GameClient;
  private readonly now: () => number;
  constructor(client: GameClient, now: () => number = Date.now) {
    this.client = client;
    this.now = now;
  }

  previewAction(action: WorldAction) { return this.client.query('PREVIEW_ACTION', { action }); }

  async executeQuote(quote: ActionQuote) {
    const player = this.client.store.getSnapshot().player;
    if (!player || quote.playerVersion !== player.playerVersion) throw new ClientError('QUOTE_STALE', 'Action quote version changed; request a new preview');
    if (quote.blockers.length) throw new ClientError(quote.blockers[0].code, quote.blockers[0].message);
    const expires = Date.parse(quote.expiresAt);
    if (!Number.isFinite(expires) || expires <= this.now()) throw new ClientError('QUOTE_EXPIRED', 'Action quote expired; request a new preview');
    return this.client.command('EXECUTE_ACTION', { quoteId: quote.id }, { expectedPlayerVersion: quote.playerVersion });
  }

  previewContinue() {
    const run = this.client.store.getSnapshot().run;
    if (!run || !['between_maps', 'between_matches'].includes(run.state)) throw new ClientError('RUN_STATE_INVALID', 'The current activity is not between maps or matches');
    if (!run.canContinue || run.blockers.length) throw new ClientError(run.blockers[0]?.code ?? 'RUN_BLOCKED', run.blockers[0]?.message ?? 'The activity cannot continue');
    return this.previewAction({ kind: 'continue_run', runId: run.id });
  }

  deploy(deployment: Deployment[]) {
    const run = this.client.store.getSnapshot().run;
    if (!run || run.state !== 'deployment') throw new ClientError('RUN_STATE_INVALID', 'No activity is awaiting deployment');
    if (deployment.some(slot => !run.survivingUnitIds.includes(slot.unitId))) {
      throw new ClientError('UNIT_NOT_AVAILABLE', 'Deployment includes a dead unit or a unit outside the locked roster');
    }
    if (new Set(deployment.map(slot => slot.unitId)).size !== deployment.length) throw new ClientError('DUPLICATE_UNIT', 'A unit cannot be deployed twice');
    return this.client.command('DEPLOY', { runId: run.id, deployment });
  }

  private battle() {
    const battle = this.client.store.getSnapshot().battle;
    if (!battle || battle.result) throw new ClientError('BATTLE_OVER', 'Load an active battle first');
    if (battle.processing || battle.phase !== 'player') throw new ClientError('BATTLE_PROCESSING', 'Wait for the player phase');
    return battle;
  }

  reachable(unitId: string) { return this.client.query('GET_REACHABLE', { battleId: this.battle().id, unitId }); }
  forecast(action: Extract<UnitAction, { kind: 'attack' | 'heal' }>) {
    return this.client.query('PREVIEW_COMBAT', { battleId: this.battle().id, action });
  }
  act(action: UnitAction) {
    const battle = this.battle();
    const unit = battle.units.find(candidate => candidate.id === action.unitId);
    if (!unit || unit.side !== 'player' || unit.disposition !== 'active' || unit.acted) {
      throw new ClientError('UNIT_NOT_AVAILABLE', 'This unit cannot act in the current battle state');
    }
    return this.client.command('UNIT_ACT', { battleId: battle.id, action }, { expectedBattleVersion: battle.version });
  }
  endPhase() {
    const battle = this.battle();
    return this.client.command('END_PHASE', { battleId: battle.id }, { expectedBattleVersion: battle.version });
  }
  withdraw() {
    const { run, battle } = this.client.store.getSnapshot();
    if (!run) throw new ClientError('NO_ACTIVE_RUN', 'No activity to withdraw from');
    if (run.battleId && (!battle || battle.id !== run.battleId)) throw new ClientError('BATTLE_NOT_LOADED', 'Load the current battle before withdrawing');
    if (battle?.processing || (battle && battle.phase !== 'player')) throw new ClientError('BATTLE_PROCESSING', 'Wait for the player phase before withdrawing');
    return this.client.command('WITHDRAW_RUN', { runId: run.id }, { expectedBattleVersion: battle?.version });
  }

  previewLegacy(legacyId: string, recipientUnitId: string, mode: 'growth' | 'stats') {
    return this.client.queryResponse('PREVIEW_LEGACY', { legacyId, recipientUnitId, mode });
  }
  claimLegacy(preview: Versioned<LegacyPreview>, inheritanceItemId: string, weights: Stats | null) {
    if (preview.data.blockers.length) throw new ClientError(preview.data.blockers[0].code, preview.data.blockers[0].message);
    return this.client.command('CLAIM_LEGACY', {
      legacyId: preview.data.legacyId, recipientUnitId: preview.data.recipientUnitId,
      mode: preview.data.mode, inheritanceItemId, weights: preview.data.mode === 'stats' ? weights : null,
    }, { expectedPlayerVersion: preview.playerVersion });
  }
}
