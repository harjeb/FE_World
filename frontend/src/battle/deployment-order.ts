// Keep only available, unique IDs, retaining the caller's order.
export function normalizeOrder(order: unknown, available: readonly string[], max = available.length): string[] {
  const allowed = new Set(available);
  return [...new Set(Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string' && allowed.has(id)) : [])].slice(0, Math.max(0, max));
}

export function defaultOrder(saved: unknown, available: readonly string[], max: number): string[] {
  return normalizeOrder([...normalizeOrder(saved, available), ...available], available, Math.min(6, max));
}

const key = (playerId: string) => `agent-tactics.deployment-order.${playerId}`;
export function loadDeploymentOrder(playerId: string | undefined): unknown {
  try { return playerId ? JSON.parse(localStorage.getItem(key(playerId)) ?? 'null') : null; }
  catch { return null; }
}
export function saveDeploymentOrder(playerId: string, order: string[]): void {
  try { localStorage.setItem(key(playerId), JSON.stringify(order)); }
  catch { /* Blocked storage simply loses the preference. */ }
}
