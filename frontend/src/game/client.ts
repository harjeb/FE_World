import type {
  AnyRequest, Battle, Capabilities, Mutation, MutationResult, Operation, OperationMap, PlayerState,
  Response,
} from '../../../backend/common/protocol/v2.ts';
import { ApiError, ClientError, displayError, TransportError } from './errors.ts';
import { MemoryJournal } from './journal.ts';
import type { CommandJournal, PendingCommand, WriteRequest } from './journal.ts';
import { GameStore } from './store.ts';
import { decodeResponse, isRecord, mutations } from './transport.ts';
import type { Transport } from './transport.ts';

export type Query = Exclude<Operation, Mutation>;
export interface Versioned<T> { data: T; playerVersion: number }
export interface CommandOptions { expectedPlayerVersion?: number; expectedBattleVersion?: number }
export interface ClientOptions {
  transport: Transport; store?: GameStore; journal?: CommandJournal;
  createId?: () => string; scopePrefix?: string;
}

function validatePlayer(value: unknown): asserts value is PlayerState {
  if (!isRecord(value) || typeof value.playerId !== 'string' || value.protocolVersion !== 2
    || !Number.isSafeInteger(value.playerVersion) || Number(value.playerVersion) < 0
    || !isRecord(value.calendar) || !Number.isSafeInteger(value.calendar.day)
    || !('activeRun' in value) || !isRecord(value.features)) {
    throw new TransportError('protocol', 'Invalid player state');
  }
}

function isBattle(value: unknown): value is Battle {
  return isRecord(value) && typeof value.id === 'string' && typeof value.runId === 'string'
    && Number.isSafeInteger(value.version) && Array.isArray(value.units) && isRecord(value.map);
}

export class GameClient {
  readonly store: GameStore;
  readonly mode: Transport['mode'];
  private readonly transport: Transport;
  private readonly journal: CommandJournal;
  private readonly createId: () => string;
  private readonly scopePrefix: string;
  private seq = 0;
  private scope: string | null = null;
  private pending: PendingCommand | null = null;
  private writing = false;
  private disposed = false;
  private initializing: Promise<void> | null = null;

  constructor(options: ClientOptions) {
    this.transport = options.transport;
    this.mode = options.transport.mode;
    this.store = options.store ?? new GameStore();
    this.journal = options.journal ?? new MemoryJournal();
    this.createId = options.createId ?? (() => globalThis.crypto.randomUUID());
    this.scopePrefix = options.scopePrefix ?? this.mode;
  }

  initialize(): Promise<void> {
    if (this.initializing) return this.initializing;
    this.initializing = this.bootstrap().finally(() => { this.initializing = null; });
    return this.initializing;
  }

  private async bootstrap(): Promise<void> {
    this.assertOpen();
    if (this.writing) throw new ClientError('COMMAND_BUSY', 'Wait for the current command before initializing');
    this.store.update({ status: 'loading', error: null });
    try {
      const [capabilities, player] = await Promise.all([
        this.query('GET_CAPABILITIES', {}), this.query('GET_STATE', {}),
      ]);
      this.assertOpen();
      this.store.update({ capabilities });
      this.scope = `${this.scopePrefix}:${player.playerId}`;
      this.pending = this.journal.read(this.scope);
      this.store.update({
        status: 'ready', connection: this.mode === 'mock' ? 'mock' : 'polling', error: null,
        pending: this.pending ? this.pendingSummary('uncertain') : null,
      });
      this.store.resetCursor(this.store.getSnapshot().player?.lastEventCursor ?? null);
      await this.synchronize();
    } catch (error) {
      if (!this.disposed) this.store.update({ status: 'error', error: displayError(error) });
      throw error;
    }
  }

  async queryResponse<K extends Query>(op: K, data: OperationMap[K]['input'], signal?: AbortSignal): Promise<Versioned<OperationMap[K]['output']>> {
    this.assertOpen();
    if (mutations.has(op)) throw new ClientError('INVALID_OPERATION', 'Writes must use the command journal');
    const seq = ++this.seq;
    const request = { protocolVersion: 2, op, seq, data } as unknown as AnyRequest;
    const raw = await this.transport.send(request, signal);
    this.assertOpen();
    const response = decodeResponse(raw, op, seq);
    if (!response.ok) {
      if (response.error.code === 'AUTH_REQUIRED') this.store.update({ status: 'error', error: displayError(new ApiError(response.error)) });
      throw new ApiError(response.error);
    }
    if (op === 'GET_STATE') {
      validatePlayer(response.data);
      if (response.data.playerVersion !== response.playerVersion) throw new TransportError('protocol', 'Mismatched player versions');
      this.store.applyPlayer(response.data);
    } else if (op === 'GET_BATTLE') {
      if (!isBattle(response.data)) throw new TransportError('protocol', 'Invalid battle state');
      if (response.playerVersion >= (this.store.getSnapshot().player?.playerVersion ?? 0)) this.store.applyBattle(response.data);
    } else if (op === 'GET_CAPABILITIES') {
      const value: unknown = response.data;
      if (!isRecord(value) || value.protocolVersion !== 2 || !Array.isArray(value.operations)
        || !value.operations.every(operation => typeof operation === 'string') || !isRecord(value.features)) {
        throw new TransportError('protocol', 'Invalid backend capabilities');
      }
    }
    return { data: response.data, playerVersion: response.playerVersion };
  }

  async query<K extends Query>(op: K, data: OperationMap[K]['input'], signal?: AbortSignal): Promise<OperationMap[K]['output']> {
    return (await this.queryResponse(op, data, signal)).data;
  }

  async synchronize(): Promise<void> {
    await this.query('GET_STATE', {});
    const state = this.store.getSnapshot().player;
    if (state?.activeRun?.battleId) await this.query('GET_BATTLE', { battleId: state.activeRun.battleId });
  }

  supports(op: Operation): boolean {
    const capabilities: Capabilities | null = this.store.getSnapshot().capabilities;
    if (!capabilities?.operations.includes(op)) return false;
    if (op.endsWith('_REFINEMENT') && capabilities.features.refinement?.enabled === false) return false;
    return true;
  }

  async command<K extends Mutation>(op: K, data: OperationMap[K]['input'], options: CommandOptions = {}): Promise<OperationMap[K]['output']> {
    this.assertOpen();
    if (!mutations.has(op)) throw new ClientError('INVALID_OPERATION', 'Queries must use the query method');
    const player = this.store.getSnapshot().player;
    if (!this.scope || !player || this.store.getSnapshot().status !== 'ready') throw new ClientError('NOT_READY', 'Initialize the game client first');
    if (!this.supports(op)) throw new ClientError('FEATURE_DISABLED', `${op} is not enabled by this backend`);
    if (this.pending || this.writing) throw new ClientError('COMMAND_PENDING', 'Resolve the pending command before submitting another');
    if (options.expectedPlayerVersion !== undefined && options.expectedPlayerVersion !== player.playerVersion) {
      throw new ClientError('STALE_INTENT', 'The preview version changed; request a new preview');
    }
    this.writing = true;
    try {
      const request = {
        protocolVersion: 2, op, seq: ++this.seq, commandId: this.createId(),
        expectedPlayerVersion: player.playerVersion,
        ...(options.expectedBattleVersion !== undefined ? { expectedBattleVersion: options.expectedBattleVersion } : {}),
        data: structuredClone(data),
      } as unknown as WriteRequest;
      // Persist before sending. Failing storage must never produce an untraceable payment.
      try { this.journal.write(this.scope, { request }); }
      catch (error) { throw error instanceof ClientError ? error : new ClientError('JOURNAL_UNAVAILABLE', 'Cannot persist pending command journal'); }
      this.pending = { request };
      this.store.update({ pending: this.pendingSummary('sending'), error: null });
      return await this.sendPending() as OperationMap[K]['output'];
    } finally { this.writing = false; }
  }

  async resumePending(): Promise<unknown> {
    this.assertOpen();
    if (!this.pending || !this.scope) return null;
    if (this.writing) throw new ClientError('COMMAND_BUSY', 'A command is already being resolved');
    this.writing = true;
    try {
      const request = this.pending.request;
      const status = await this.query('GET_COMMAND_STATUS', { commandId: request.commandId });
      if (status.state === 'unknown') {
        // Only the correlation sequence changes. The intent and idempotency key stay unchanged.
        this.pending = { request: { ...request, seq: ++this.seq } as WriteRequest };
        this.journal.write(this.scope, this.pending);
        return await this.sendPending();
      }
      if (status.state !== 'committed' && status.state !== 'rejected') throw new TransportError('protocol', 'Invalid command status');
      const response = decodeResponse(status.response, request.op);
      if ((status.state === 'committed') !== response.ok) throw new TransportError('protocol', 'Receipt status contradicts its response');
      return this.acceptPending(response);
    } catch (error) {
      if (this.pending && !this.disposed) this.store.update({ pending: this.pendingSummary('uncertain'), error: displayError(error) });
      throw error;
    } finally { this.writing = false; }
  }

  private async sendPending(): Promise<unknown> {
    const request = this.pending!.request;
    try {
      const raw = await this.transport.send(request);
      this.assertOpen();
      return this.acceptPending(decodeResponse(raw, request.op, request.seq));
    } catch (error) {
      if (this.pending && !this.disposed) this.store.update({ pending: this.pendingSummary('uncertain'), error: displayError(error) });
      throw error;
    }
  }

  private acceptPending(response: Response<Mutation>): unknown {
    if (!this.pending || !this.scope) throw new ClientError('NO_PENDING_COMMAND', 'No pending command to resolve');
    if (!response.ok) {
      if (response.error.retry !== 'same_command') this.clearPending();
      this.store.update({ error: displayError(new ApiError(response.error)), ...(response.error.code === 'AUTH_REQUIRED' ? { status: 'error' as const } : {}) });
      throw new ApiError(response.error);
    }
    const result: unknown = response.data;
    if (!isRecord(result) || !Array.isArray(result.events) || !('value' in result)) throw new TransportError('protocol', 'Invalid mutation result');
    validatePlayer(result.state);
    if (result.state.playerVersion !== response.playerVersion || result.state.playerId !== this.store.getSnapshot().player?.playerId) {
      throw new TransportError('protocol', 'Mutation result belongs to a different player or version');
    }
    const mutation = result as unknown as MutationResult<unknown>;
    const previousVersion = this.store.getSnapshot().player!.playerVersion;
    const operation = this.pending.request.op;
    this.store.applyPlayer(mutation.state);
    if (response.playerVersion >= previousVersion) {
      if (isBattle(mutation.value)) this.store.applyBattle(mutation.value);
      if (operation === 'END_PHASE' && isRecord(mutation.value) && mutation.value.processing === true) {
        const battle = this.store.getSnapshot().battle;
        if (battle && battle.id === mutation.value.battleId) this.store.applyBattle({ ...battle, processing: true });
      }
    }
    this.store.appendEvents(mutation.events);
    this.clearPending();
    this.store.update({ error: null });
    return mutation;
  }

  private clearPending(): void {
    this.journal.clear(this.scope!);
    this.pending = null;
    this.store.update({ pending: null });
  }

  private pendingSummary(status: 'sending' | 'uncertain') {
    const request = this.pending!.request;
    return { commandId: request.commandId, op: request.op, status };
  }

  private assertOpen(): void {
    if (this.disposed) throw new ClientError('DISPOSED', 'Game client has been disposed');
  }

  dispose(): void {
    this.disposed = true;
    this.transport.dispose?.();
    this.store.update({ status: 'disposed', connection: 'offline', player: null, run: null, battle: null,
      capabilities: null, pending: null, eventCursor: null, recentEvents: [], error: null });
  }
}
