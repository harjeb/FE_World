// The demo shows controls for systems that are not designed yet (docs/04 养成, 整备 …). Using one
// says so instead of pretending to work.
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

// An action whose rules are still open: nothing changes.
export const notWired = (action: string) => show(`演示版：「${action}」要等玩法系统确定后再接入，现在不会改变任何数据。`);
// A page with no design yet.
export const notBuilt = (page: string) => show(`演示版没有「${page}」页面：还没有对应的设计稿。`);
// A real result or error from a server op.
export const toast = (text: string) => show(text);

export function Toasts() {
  const toast = useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => current,
  );
  return <div className="toast-slot" role="status" aria-live="polite">{toast && <div key={toast.id} className="toast">{toast.text}</div>}</div>;
}
