import { useSyncExternalStore } from 'react';
import type { Query } from './client.ts';
import type { QueryResource } from './resource.ts';
import type { GameStore } from './store.ts';

export function useGameSnapshot(store: GameStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useResourceSnapshot<K extends Query>(resource: QueryResource<K>) {
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
}
