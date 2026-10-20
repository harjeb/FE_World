import type { ClassLook, Layer } from './battle.ts';
import type { WeaponType } from '../data/types.ts';

export type BattlePose = 'idle' | 'windup' | 'strike' | 'recover' | 'hurt' | 'dodge';
type Grid = { rows: string[]; x: number; y: number };

// Inverse nearest-neighbour sampling leaves no holes in rotated pixel grids.
function warp(rows: string[], x: number, y: number, a: number, b: number, c: number, d: number): Grid {
  const width = Math.max(...rows.map(row => row.length)), height = rows.length;
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const xs = corners.map(([u, v]) => x + a * u + c * v), ys = corners.map(([u, v]) => y + b * u + d * v);
  const left = Math.floor(Math.min(...xs)), top = Math.floor(Math.min(...ys));
  const right = Math.ceil(Math.max(...xs)), bottom = Math.ceil(Math.max(...ys));
  const det = a * d - b * c;
  return { x: left, y: top, rows: Array.from({ length: bottom - top + 1 }, (_, j) =>
    Array.from({ length: right - left + 1 }, (_, i) => {
      const dx = left + i - x, dy = top + j - y;
      return rows[Math.round((a * dy - b * dx) / det)]?.[Math.round((d * dx - c * dy) / det)] ?? '.';
    }).join('')) };
}

export function poseLayers(look: ClassLook, parts: Record<string, string[]>, weapon: { rows: string[]; grip: [number, number] } | undefined,
  kind: WeaponType | null, pose: BattlePose, frame: number): { layers: Layer[]; weapon?: Grid } {
  const active = pose !== 'idle' || Math.abs(Math.trunc(frame)) % 2 === 1;
  if (!active) return { layers: look.layers, weapon: weapon && { rows: weapon.rows, x: look.hand[0] - weapon.grip[0], y: look.hand[1] - weapon.grip[1] } };
  const slash = kind === 'sword' || kind === 'axe';
  const cast = kind === 'tome' || kind === 'staff' || kind === 'dragon';
  const lean = { idle: 1, windup: -1, strike: 2, recover: 1, hurt: -2, dodge: -3 }[pose];
  const neck = look.hand[1] - 5, waist = look.hand[1] + 8;
  const shift = (y: number) => Math.round(lean * Math.max(0, Math.min(1, (waist - y) / (waist - neck))));
  const armAngle = pose === 'windup' ? (slash || cast ? -65 : 25) : pose === 'strike' ? (cast ? -45 : -20) : pose === 'hurt' ? 30 : pose === 'dodge' ? 40 : pose === 'recover' ? 12 : -8;
  const angle = armAngle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  // Explicit exceptions cover the cub and the rogue's longer custom forearm.
  const origin = look.forearm ?? [look.hand[0] - 5, look.hand[1] - 3];
  const arm = look.layers.find(layer => layer.x === origin[0] && layer.y === origin[1]);
  if (!arm) throw new Error('Battle look needs a front forearm at its declared grip');
  const sx = arm.x + shift(arm.y), sy = arm.y;
  const hx = look.hand[0] - arm.x, hy = look.hand[1] - arm.y;
  let handX = Math.round(sx + hx * cos - hy * sin), handY = Math.round(sy + hx * sin + hy * cos);
  let held: Grid | undefined;
  if (weapon) {
    const degrees = slash ? (pose === 'windup' ? -80 : pose === 'strike' ? 65 : pose === 'recover' ? 30 : 0)
      : cast ? (pose === 'windup' ? -25 : pose === 'strike' ? 15 : 0) : 0;
    const r = degrees * Math.PI / 180, co = Math.cos(r), si = Math.sin(r);
    let rows = weapon.rows;
    // Pull the string back toward the archer while the bow hand stays on the grip.
    if (kind === 'bow' && pose === 'windup') rows = rows.map((row, y) => {
      const string = row.indexOf('K');
      if (string < 0) return row;
      const chars = [...row]; chars[string] = '.';
      const target = Math.max(0, string - Math.round(4 * (1 - Math.abs(y - 7) / 7)));
      if (chars[target] === '.') chars[target] = 'K';
      return chars.join('');
    });
    held = warp(rows, handX - co * weapon.grip[0] + si * weapon.grip[1], handY - si * weapon.grip[0] - co * weapon.grip[1], co, si, -si, co);
    // Reserve a pixel for the outline, moving the hand with the entire weapon.
    const width = Math.max(...held.rows.map(row => row.length));
    const dx = Math.max(1 - held.x, Math.min(0, 46 - (held.x + width - 1)));
    const dy = Math.max(1 - held.y, Math.min(0, 46 - (held.y + held.rows.length - 1)));
    held.x += dx; held.y += dy; handX += dx; handY += dy;
  }
  const layers = look.layers.map(layer => {
    let rows = typeof layer.part === 'string' ? parts[layer.part] : layer.part;
    if (layer.flip) rows = rows.map(row => [...row].reverse().join(''));
    if (layer === arm) {
      // Map shoulder and grip exactly with a uniform scale and rotation.
      const length = hx * hx + hy * hy, dx = handX - sx, dy = handY - sy;
      const a = (dx * hx + dy * hy) / length, b = (dy * hx - dx * hy) / length;
      const grid = warp(rows, sx, sy, a, b, -b, a);
      return { part: grid.rows, x: grid.x, y: grid.y };
    }
    if (layer.fixed) return layer;
    // Heads and their accessories share a rigid shift above the neck; the torso
    // eases back to its original waist so boots and seated riders remain grounded.
    const shifts = rows.map((_, y) => shift(layer.y + y)), min = Math.min(...shifts), max = Math.max(...shifts);
    return { part: rows.map((row, y) => '.'.repeat(shifts[y] - min) + row + '.'.repeat(max - shifts[y])), x: layer.x + min, y: layer.y };
  });
  return { layers, weapon: held };
}
