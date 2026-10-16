import { GameClient } from './client.ts';
import { GameFlows } from './flows.ts';
import { MemoryJournal, StorageJournal } from './journal.ts';
import type { CommandJournal, StorageLike } from './journal.ts';
import { MockTransport } from './mock.ts';
import type { MockScenario } from './mock.ts';
import { QueryResource } from './resource.ts';
import type { Query } from './client.ts';
import { GameConnection } from './sync.ts';
import { HttpTransport } from './transport.ts';
import type { HttpTransportOptions, Transport } from './transport.ts';
import { ClientError } from './errors.ts';

export type RuntimeOptions = {
  journal?: CommandJournal; storage?: StorageLike; scopePrefix?: string;
} & ({ mode: 'mock'; scenario?: MockScenario; transport?: Transport }
  | { mode: 'http'; baseUrl: string; socketUrl?: string; fetch?: HttpTransportOptions['fetch']; timeoutMs?: number });

export function createGameRuntime(options: RuntimeOptions) {
  const transport = options.mode === 'mock' ? options.transport ?? new MockTransport(options.scenario)
    : new HttpTransport(options);
  if (transport.mode !== options.mode) throw new ClientError('MODE_MISMATCH', 'Transport and runtime modes must match');
  const journal = options.journal ?? (options.storage ? new StorageJournal(options.storage) : new MemoryJournal());
  const client = new GameClient({ transport, journal, scopePrefix: options.scopePrefix ?? (options.mode === 'http' ? options.baseUrl.replace(/\/+$/, '') || 'same-origin' : 'mock') });
  const connection = new GameConnection({ client, socketUrl: options.mode === 'http' ? options.socketUrl : undefined });
  const resources = new Set<{ dispose(): void }>();
  return {
    mode: options.mode,
    persistence: options.journal ? 'custom' as const : options.storage ? 'storage' as const : 'memory' as const,
    client, store: client.store, flows: new GameFlows(client),
    resource: <K extends Query>(op: K) => {
      const resource = new QueryResource(client, op, () => { resources.delete(resource); });
      resources.add(resource);
      return resource;
    },
    start: () => connection.start(),
    stop: () => connection.stop(),
    dispose: () => { connection.stop(); for (const resource of resources) resource.dispose(); client.dispose(); },
  };
}
export type GameRuntime = ReturnType<typeof createGameRuntime>;
