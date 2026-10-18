// 战技／法术／功能杖／舞蹈 on the battle page. Options, targets and landing cells all come from the
// engine (actionOptions, destinationCells), the same functions the server validates UNIT_ACT with.
import { SPELLBOOK_BY_ID } from '@common/data/spellbooks.ts';
import { WEAPON_ART_BY_ID } from '@common/data/weapon-arts.ts';
import { WEAPONS } from '@common/data/weapons.ts';
import type { WeaponId } from '@common/data/weapons.ts';
import { actionOptions, areaHealTargets, artForecast, destinationCells, healAmount, spellForecast, spellKind, statusChance, unitById, withSpellWeapon } from '@common/engine/index.ts';
import type { ActAction, BattleState, DestinationRule, Point, StatusChance, UnitState } from '@common/engine/index.ts';
import type { Forecast } from '@common/engine/index.ts';
import type { Mode } from './selection.ts';

export type CommandMode = Extract<Mode, { kind: 'art' | 'cast' | 'staff' | 'dance' }>;
export const isCommand = (mode: Mode): mode is CommandMode => mode.kind === 'art' || mode.kind === 'cast' || mode.kind === 'staff' || mode.kind === 'dance';

export const STAFF_EFFECT_TEXT = { heal: '回复', cure: '解除异常', sleep: '睡眠', silence: '沉默', warp: '传送', rescue: '救援' } as const;

export function commandOptions(state: BattleState, mode: { unit: string; to: Point }) {
  const unit = unitById(state, mode.unit);
  const options = actionOptions(state, unit, mode.to);
  return {
    unit,
    arts: options.arts.filter(o => o.targets.length > 0 || o.objects.length > 0),
    casts: options.casts.filter(o => o.targets.length > 0),
    // Healing staves keep the existing 治疗 flow; this menu is for the status and utility staves.
    staves: options.staff.filter(o => o.targets.length > 0 && o.effect !== 'heal' && o.effect !== 'cure'),
    dance: options.dance.map(id => unitById(state, id)),
  };
}

// Valid targets for the option chosen in the mode (empty until an option is picked).
export function commandTargets(state: BattleState, mode: CommandMode): UnitState[] {
  const o = commandOptions(state, mode);
  if (mode.kind === 'art') return o.arts.find(a => a.art === mode.art && a.weapon === mode.weapon)?.targets ?? [];
  if (mode.kind === 'cast') return o.casts.find(c => c.spell === mode.spell)?.targets ?? [];
  if (mode.kind === 'staff') return o.staves.find(s => s.weapon === mode.weapon)?.targets ?? [];
  return o.dance;
}

// The landing rule for a cast / staff that moves a unit or places a wall, and the cells allowed.
export function commandDest(state: BattleState, mode: CommandMode): { rule: DestinationRule; cells: Point[] } | null {
  if (mode.kind !== 'cast' && mode.kind !== 'staff') return null;
  const o = commandOptions(state, mode);
  const rule = mode.kind === 'cast' ? o.casts.find(c => c.spell === mode.spell)?.dest ?? null : o.staves.find(s => s.weapon === mode.weapon)?.dest ?? null;
  return rule ? { rule, cells: destinationCells(state, o.unit, mode.to, rule) } : null;
}

// The UNIT_ACT this mode submits, or null while something is still missing.
export function commandAction(state: BattleState, mode: CommandMode): ActAction | null {
  if (!mode.target) return null;
  const base = { type: 'act' as const, unit: mode.unit, to: mode.to };
  if (mode.kind === 'dance') return { ...base, act: 'dance', target: mode.target };
  if (mode.kind === 'art') {
    const option = commandOptions(state, mode).arts.find(a => a.art === mode.art && a.weapon === mode.weapon);
    if (!option?.usable || !mode.art || !mode.weapon || (!option.targets.some(t => t.id === mode.target) && !option.objects.includes(mode.target))) return null;
    if (mode.ally && !option.allies.includes(mode.ally)) return null;
    if (mode.secondary && !option.secondaries[mode.target]?.includes(mode.secondary)) return null;
    if (mode.postTo && !option.postMoves.some(p => p[0] === mode.postTo![0] && p[1] === mode.postTo![1])) return null;
    if (mode.support && !option.supportOptions.some(s => s.target === mode.support!.target && s.spell === mode.support!.spell && s.weapon === mode.support!.weapon && JSON.stringify(s.dest) === JSON.stringify(mode.support!.dest))) return null;
    return { ...base, ...(mode.postTo ? { postTo: mode.postTo } : {}), ...(mode.support ? { support: mode.support } : {}), act: 'art', target: mode.target, weapon: mode.weapon, art: mode.art, ...(mode.ally ? { ally: mode.ally } : {}), ...(mode.secondary ? { secondary: mode.secondary } : {}) };
  }
  const dest = commandDest(state, mode);
  if (dest?.rule.required && !mode.dest) return null;
  const at = mode.dest ? { dest: mode.dest } : {};
  if (mode.kind === 'cast') return mode.spell ? { ...base, act: 'cast', target: mode.target, spell: mode.spell, ...at } : null;
  return mode.weapon ? { ...base, act: 'staff', target: mode.target, weapon: mode.weapon, ...at } : null;
}

export const artInfo = (id: string) => WEAPON_ART_BY_ID.get(id as never);
export const spellInfo = (id: string) => SPELLBOOK_BY_ID.get(id);

// Combat numbers for an art or an attack spell, from the engine's forecast.
export function commandForecast(state: BattleState, mode: CommandMode): (Forecast & { targets?: { target: string; forecast: Forecast }[] }) | null {
  if (!mode.target) return null;
  if (mode.kind === 'art' && mode.art && mode.weapon) {
    const art = artInfo(mode.art);
    if (!state.units.some(u => u.id === mode.target)) return null;
    return art && commandAction(state, mode) ? artForecast(state, unitById(state, mode.unit), mode.to, mode.weapon, art, unitById(state, mode.target), mode.secondary, mode.ally) : null;
  }
  if (mode.kind === 'cast' && mode.spell) {
    const book = spellInfo(mode.spell);
    if (!book || spellKind(book) !== 'attack') return null;
    // 与服务端同一预测：本书剩余次数决定能否追击。
    return spellForecast(state, mode.unit, mode.to, book.id, mode.target);
  }
  return null;
}

// 状态杖与敌方控场法术的命中率（首领减半、免疫为 0），与服务端掷骰同一公式。
export function commandStatus(state: BattleState, mode: CommandMode): StatusChance | null {
  if (!mode.target || (mode.kind !== 'cast' && mode.kind !== 'staff')) return null;
  const caster = unitById(state, mode.unit), target = unitById(state, mode.target);
  if (mode.kind === 'cast' && mode.spell) {
    const book = spellInfo(mode.spell);
    return book && spellKind(book) === 'status' ? statusChance(state, caster, target, book.effects.status!, book.hit) : null;
  }
  const status = mode.kind === 'staff' && mode.weapon ? WEAPONS[mode.weapon].status : undefined;
  return status ? statusChance(state, caster, target, status.kind, status.hit) : null;
}

// HP a healing spell restores: 魔 + 本书的回复基值（圣治另有 10% 额外回复，不计入预览）。
export function spellHeal(state: BattleState, mode: CommandMode): number | null {
  if (mode.kind !== 'cast' || !mode.spell || !mode.target) return null;
  const book = spellInfo(mode.spell);
  if (!book || spellKind(book) !== 'heal' || book.effects.area) return null;
  const healer = unitById(state, mode.unit), target = unitById(state, mode.target);
  return withSpellWeapon(book, () => healAmount({ ...healer, pos: mode.to }, target, book.id as WeaponId));
}

// 范围治疗（群体圣疗、群疗杖）：落点射程内每名受伤友军各回复多少。
export function areaHeals(state: BattleState, unitId: string, to: Point, weapon: WeaponId, spell?: string): { unit: UnitState; amount: number }[] {
  const healer = { ...unitById(state, unitId), pos: to };
  const run = () => areaHealTargets(state, healer, weapon, to).map(unit => ({ unit, amount: healAmount(healer, unit, weapon) }));
  const book = spell ? spellInfo(spell) : undefined;
  return book ? withSpellWeapon(book, run) : run();
}

// Names for combat events whose "weapon" is a spellbook (only registered while the spell resolves).
export function weaponLabel(id: string): string {
  return WEAPONS[id as WeaponId]?.name ?? SPELLBOOK_BY_ID.get(id)?.name ?? id;
}
