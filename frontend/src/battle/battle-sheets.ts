import { canonicalClassId } from '@common/data/classes.ts';
import type { ClassId } from '@common/data/classes.ts';
import type { WeaponType } from '@common/data/types.ts';
import { BASE_COLORS, FACTION_COLORS } from '@common/sprites/battle.ts';
import type { SpriteColors } from '@common/sprites/battle.ts';
import manifest from '../../../design/pixel-art/battle-sheets/animations.json' with { type: 'json' };
import converted from '../../../design/pixel-art/fe-anims/anims.json' with { type: 'json' };

// A run of atlas frames. Step indices mark what the scene reacts to: the windup, the release, the step
// that lands the hit (damage shows) and the start of the recovery. A critical without its own clip
// holds the charge step longer.
export interface SheetLoop { frames: number[]; durationsMs: number[] }
export interface SheetClip extends SheetLoop { windup: number; release: number; hit: number; recover: number; charge?: number }
export interface BattleSheet {
  id: string;
  classId: string;
  weapon: string;
  file: string;
  mask: string;
  frameSize: number[];
  columns: number;
  frames: number;
  origin: number[]; // ground point inside a cell, facing right
  stand?: number; // source pixels from the scene centre: converted FE fighters keep FE's spacing
  scale: number;
  projectile: boolean; // draws its own arrow, spell, knife or breath
  inPlace: boolean; // never lunges: the shot or the dash is drawn in its frames
  reacts: boolean; // keeps its own look while hurt or dodging
  contact?: boolean; // the attack clip lands up close; a tile away it needs a ranged clip
  idle: SheetLoop;
  attack: SheetClip;
  critical?: SheetClip;
  ranged?: SheetClip; // thrown or cast follow-up for a contact sheet
  rangedCritical?: SheetClip;
  dodge?: SheetLoop;
}

// 16-frame studies share one grid: the first row idles, frame 11 lands the hit.
const STEPS = Array.from({ length: 16 }, (_, i) => i);
const studies: BattleSheet[] = manifest.sprites.map(sheet => ({
  id: sheet.id, classId: sheet.classId, weapon: sheet.weapon, file: sheet.file, mask: sheet.mask,
  frameSize: manifest.frameSize, columns: manifest.grid[0], frames: STEPS.length, origin: manifest.origin, scale: 4,
  projectile: sheet.projectile, inPlace: sheet.projectile, reacts: false,
  idle: { frames: STEPS.slice(0, 4), durationsMs: sheet.durationsMs.slice(0, 4) },
  attack: { frames: STEPS, durationsMs: sheet.durationsMs, windup: 4, release: 8, hit: manifest.hitFrame, recover: 12, charge: 7 },
}));

// Converted FE-Repo animations take precedence over a study of the same class and weapon.
export const BATTLE_SHEETS: BattleSheet[] = [...converted.anims, ...studies];
// The community packs ask for credit (design/pixel-art/fe-anims/CREDITS.md has their credits verbatim).
export const ART_CREDITS = { repository: converted.repository, packs: converted.credits };

// A contact sheet a tile away plays its ranged clip, or gives way to the next sheet (or the layered sprite).
export function battleSheetSpec(classId: ClassId, weapon: WeaponType | null, distance = 1): BattleSheet | null {
  const id = canonicalClassId(classId);
  for (const sheet of BATTLE_SHEETS) {
    if (sheet.classId !== id || sheet.weapon !== weapon) continue;
    if (distance <= 1 || !sheet.contact) return sheet;
    if (sheet.ranged) return { ...sheet, attack: sheet.ranged, critical: sheet.rangedCritical };
  }
  return null;
}

// Roles come from source glyphs, never RGB: hair shares colors with leather and horses.
export function recolorBattleSheet(data: Uint8ClampedArray, mask: Uint8ClampedArray, colors: SpriteColors): void {
  if (data.length !== mask.length || data.length % 4) throw new Error('Battle sheet mask size mismatch');
  const palette: Record<string, string> = { ...BASE_COLORS, ...FACTION_COLORS[colors.side],
    ...(colors.skin ? { s: colors.skin[0], S: colors.skin[1] } : {}),
    ...(colors.hair ? { h: colors.hair[0], H: colors.hair[1] } : {}),
  };
  const roles = ['a', 'A', 'l', 's', 'S', 'h', 'H'].map(glyph => {
    const hex = palette[glyph];
    return [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
  });
  for (let i = 0; i < data.length; i += 4) {
    const rgb = roles[mask[i] - 1];
    if (rgb) data.set(rgb, i);
  }
}
