// One short notice at a time at the bottom of the page: the result or error of a server op.
import { useSyncExternalStore } from 'react';

let current: { id: number; text: string } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function show(text: string): void {
  current = { id: (current?.id ?? 0) + 1, text };
  for (const listener of listeners) listener();
  clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    for (const listener of listeners) listener();
  }, 3600);
}

export const toast = (text: string) => show(text);

export function Toasts() {
  const toast = useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
  );
  return <div className="toast-slot" role="status" aria-live="polite">{toast && <div key={toast.id} className="toast">{toast.text}</div>}</div>;
}
