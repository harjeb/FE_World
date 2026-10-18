// 法术与状态杖的预测（docs/27 §2–3、docs/22 §6）。网页、Agent 的 PREVIEW_COMBAT 与 step.ts 结算共用这里的公式。
import { SPELLBOOK_BY_ID } from '../data/spellbooks.ts';
import type { WeaponId } from '../data/weapons.ts';
import { artBonus, artStats } from './art-effects.ts';
import { forecast, unitCombatStats } from './combat.ts';
import type { Forecast } from './combat.ts';
import { withSpellWeapon } from './support.ts';
import { equipped, unitById } from './units.ts';
import { EngineError } from './types.ts';
import type { BattleState, Point, UnitState } from './types.ts';

export type ControlStatus = 'sleep' | 'silence' | 'root';
export interface StatusChance { status: ControlStatus; chance: number; immune: boolean; boss: boolean }

// 状态命中（本作首稿）：基础命中 + 技×2 + 运÷2 − 目标回避，与普通攻击同式；首领减半，免疫为 0。
export function statusChance(state: BattleState, caster: UnitState, target: UnitState, status: ControlStatus, base: number): StatusChance {
  const immune = !!target.immunities?.includes(status);
  const s = artStats(caster), avoid = unitCombatStats(state, target, equipped(target)).avoid;
  const raw = immune ? 0 : Math.max(0, Math.min(100, base + s.skl * 2 + Math.floor(s.lck / 2) + artBonus(caster, 'hit') - avoid));
  return { status, chance: target.boss ? Math.floor(raw / 2) : raw, immune, boss: !!target.boss };
}

// 攻击法术的交战预测：按法术书数值、特效与本书剩余次数（追击另扣一次）。
export function spellForecast(state: BattleState, unitId: string, from: Point, spell: string, targetId: string): Forecast {
  const book = SPELLBOOK_BY_ID.get(spell);
  if (!book) throw new EngineError('NO_SUCH_ITEM', `没有法术 ${spell}`);
  if (!(unitById(state, unitId).spellbooks ?? []).some(row => row.id === spell)) throw new EngineError('NO_SUCH_ITEM', '没有携带这本法术书');
  return withSpellWeapon(book, () => forecast(state, unitId, from, book.id as WeaponId, targetId, undefined, true));
}
