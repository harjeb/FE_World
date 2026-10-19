import type { Point } from './map.ts';

export type EncounterLayout = 'skirmish' | 'pincer' | 'convergence';
export const LAYOUTS: Record<EncounterLayout, { name: string; description: string }> = {
  skirmish: { name: '遭遇战', description: '交错的对角阵形在中央交锋。' },
  pincer: { name: '分进合击', description: '两支队伍绕过隔墙，在上方通道会合。' },
  convergence: { name: '多路汇合', description: '分散的小队争夺相连的中央据点。' },
};

// Design in local coordinates, then rotate/reflect the entire geometry together.
export function designLayout(layout: EncounterLayout, width: number, height: number, random: () => number) {
  const transpose = random() < 0.5;
  const w = transpose ? height : width, h = transpose ? width : height;
  const mirror = random() < 0.5;
  const transform = ([x, y]: Point): Point => {
    if (mirror) x = w - 1 - x;
    return transpose ? [y, x] : [x, y];
  };
  const mid = Math.floor(w / 2) + Math.floor(random() * 3) - 1;
  const gap = Math.max(2, Math.floor(h / 4) - 1 + Math.floor(random() * 2));
  const split = layout === 'pincer' && Math.min(w, h) >= 20;
  const walls: Point[] = [];
  if (split) for (let y = gap + 1; y < h; y++) walls.push([mid, y]);
  if (layout === 'convergence' && Math.min(w, h) >= 20) {
    for (let x = mid - 3; x <= mid + 3; x++) if (x !== mid) walls.push([x, Math.floor(h / 2)]);
  }
  const jitter = Math.floor(random() * 2);
  const anchors: Point[] = split
    ? [[Math.floor(w / 4), h - 3], [Math.floor(3 * w / 4), h - 3]]
    : layout === 'convergence' && Math.min(w, h) >= 20
    ? [[2, h - 4], [w - 3, 3]]
    : [[2 + jitter, h - 3]];
  const enemyAnchors: Point[] = layout === 'convergence' && Math.min(w, h) >= 20
    ? [[2, 3], [w - 3, h - 4], [mid, Math.floor(h / 2) - 3]]
    : [[w - 3, 2], [mid - 2, 2]];
  const objective: Point = [layout === 'convergence' && Math.min(w, h) >= 20 ? 2 : w - 3, 1];
  const used = new Set([objective.join(',')]);
  const wallKeys = new Set(walls.map(p => p.join(',')));
  function slots(anchor: Point, count: number, group?: number): Point[] {
    const candidates: Point[] = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      if ((x + y) % 2 || used.has(`${x},${y}`) || wallKeys.has(`${x},${y}`)) continue;
      if (split && group !== undefined && (group === 0 ? x >= mid : x <= mid)) continue;
      candidates.push([x, y]);
    }
    candidates.sort((a, b) => (Math.abs(a[0] - anchor[0]) + Math.abs(a[1] - anchor[1])) - (Math.abs(b[0] - anchor[0]) + Math.abs(b[1] - anchor[1])));
    const result = candidates.slice(0, count);
    result.forEach(p => used.add(p.join(',')));
    return result;
  }
  const groups = anchors.map((anchor, i) => slots(anchor, 8 / anchors.length, i));
  const player: Point[] = [], playerGroups: number[] = [];
  for (let i = 0; i < groups[0].length; i++) groups.forEach((group, index) => {
    player.push(transform(group[i])); playerGroups.push(index);
  });
  const enemyGroups = enemyAnchors.map((anchor, i) => slots(anchor, Math.floor(16 / enemyAnchors.length) + (i < 16 % enemyAnchors.length ? 1 : 0)));
  const enemy: Point[] = [];
  for (let i = 0; i < Math.max(...enemyGroups.map(group => group.length)); i++) {
    for (const group of enemyGroups) if (group[i]) enemy.push(transform(group[i]));
  }
  return { player, playerGroups, enemy, objective: transform(objective), walls: walls.map(transform) };
}
