// The defense for the next arena (docs/00 §10: 随时可改，竞技场日报名时锁定). Reads GET_DEFENSE and writes through
// SET_DEFENSE; unsaved edits stay in this module until 保存.
import { useSyncExternalStore } from 'react';
import { validateDefense } from '@common/arena/rules.ts';
import type { Defense } from '@common/arena/rules.ts';
import { session } from '../api/session.ts';
import { MY_DEFENSE } from '../demo/live.ts';

let draft: Defense | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function current(): Defense {
  return draft ?? session.get().defense ?? MY_DEFENSE;
}

session.subscribe(() => {
  // A server refresh is the new truth; drop any stale local draft.
  if (!draft) emit();
});

export const defenseDraft = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  get: current,
  async save(defense: Defense): Promise<void> {
    const errors = validateDefense(defense);
    if (errors.length > 0) throw new Error(errors.join('；'));
    draft = defense;
    emit();
    await session.setDefense(defense);
    draft = null;
    emit();
  },
};

export function useSavedDefense(): Defense {
  return useSyncExternalStore(defenseDraft.subscribe, current);
}
