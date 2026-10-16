import type { AnyRequest, Mutation } from '../../../backend/common/protocol/v2.ts';
import { ClientError } from './errors.ts';
import { isRecord, mutations } from './transport.ts';

export type WriteRequest = Extract<AnyRequest, { op: Mutation }>;
export interface PendingCommand { request: WriteRequest }
export interface CommandJournal {
  read(scope: string): PendingCommand | null;
  write(scope: string, command: PendingCommand): void;
  clear(scope: string): void;
}

export class MemoryJournal implements CommandJournal {
  private readonly entries = new Map<string, PendingCommand>();
  read(scope: string): PendingCommand | null { return structuredClone(this.entries.get(scope) ?? null); }
  write(scope: string, command: PendingCommand): void { this.entries.set(scope, structuredClone(command)); }
  clear(scope: string): void { this.entries.delete(scope); }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Store pending intents only. Authoritative assets and credentials never go into this journal.
export class StorageJournal implements CommandJournal {
  private readonly storage: StorageLike;
  private readonly namespace: string;
  constructor(storage: StorageLike, namespace = 'agent-tactics.commands.v2') {
    this.storage = storage;
    this.namespace = namespace;
  }
  private key(scope: string): string { return `${this.namespace}:${encodeURIComponent(scope)}`; }
  read(scope: string): PendingCommand | null {
    try {
      const raw = this.storage.getItem(this.key(scope));
      if (raw === null) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed) || parsed.version !== 2 || parsed.scope !== scope || !isRecord(parsed.command)
        || !isRecord(parsed.command.request)) throw new Error('Invalid journal record');
      const request = parsed.command.request;
      if (request.protocolVersion !== 2 || !mutations.has(request.op as Mutation)
        || typeof request.commandId !== 'string' || request.commandId.length === 0
        || !Number.isSafeInteger(request.seq) || Number(request.seq) < 1
        || !Number.isSafeInteger(request.expectedPlayerVersion) || Number(request.expectedPlayerVersion) < 0
        || (request.expectedBattleVersion !== undefined && (!Number.isSafeInteger(request.expectedBattleVersion) || Number(request.expectedBattleVersion) < 0))
        || !isRecord(request.data)) throw new Error('Invalid pending command');
      return parsed.command as unknown as PendingCommand;
    } catch {
      // A damaged journal must not silently disappear and allow a second payment.
      throw new ClientError('JOURNAL_UNREADABLE', 'Pending command journal cannot be read; synchronize before resolving storage');
    }
  }
  write(scope: string, command: PendingCommand): void {
    try { this.storage.setItem(this.key(scope), JSON.stringify({ version: 2, scope, command })); }
    catch { throw new ClientError('JOURNAL_UNAVAILABLE', 'Pending command could not be persisted to storage'); }
  }
  clear(scope: string): void {
    try { this.storage.removeItem(this.key(scope)); }
    catch { throw new ClientError('JOURNAL_UNAVAILABLE', 'Committed command journal could not be cleared'); }
  }
}
