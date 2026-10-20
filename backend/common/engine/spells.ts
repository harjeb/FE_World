import type { UnitState } from './types.ts';
import { directHealingRangeBonus } from './personal-traits.ts';
/** Shared by spell target validation, reach previews, and action legality. */
export function spellRange(unit: UnitState, book: { id: string; range: readonly [number, number] }): [number, number] {
  return [book.range[0], book.range[1] + directHealingRangeBonus(unit, book.id)];
}
