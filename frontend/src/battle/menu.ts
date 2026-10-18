// Shared source for the contextual action menu (地图上的火纹式菜单) and the sidebar 行动 panel.
// Both UIs render exactly what the engine offers at the planned destination (actionOptions +
// commandOptions — the same functions the server checks), so the two lists can never diverge.
// Pure data, no TSX, so tests can assert the legal choices directly.
import { SPELLBOOK_BY_ID } from '@common/data/spellbooks.ts';
import { ITEMS, WEAPONS } from '@common/data/weapons.ts';
import type { ItemId } from '@common/data/weapons.ts';
import { actionOptions, unitById } from '@common/engine/index.ts';
import type { BattleState, Point } from '@common/engine/index.ts';
import { commandOptions } from './commands.ts';

// What a menu entry does. Everything except 'move' and 'interact' maps 1:1 onto
// BattleController.chooseAction; 'move' returns to movement, 'interact' calls interact().
export type MenuAction =
  | { id: 'attack' } | { id: 'art' } | { id: 'cast' } | { id: 'heal' } | { id: 'staff' }
  | { id: 'dance' } | { id: 'seize' } | { id: 'escape' } | { id: 'item' }
  | { id: 'move' } | { id: 'wait' }
  | { id: 'interact'; object: string };

export interface MenuEntry {
  action: MenuAction;
  label: string;
  // 压制 / 撤离 win or end the battle immediately, so they read as primary choices.
  tone?: 'primary';
}

// The contextual choices for a unit standing at `to`, in fixed Fire-Emblem menu order.
// 持有物 is always offered (viewing the loadout is legal even at full HP); usable consumables
// are decided later by the engine's items list, not by this menu.
export function actionMenu(state: BattleState, unitId: string, to: Point): MenuEntry[] {
  const unit = unitById(state, unitId);
  const o = actionOptions(state, unit, to);
  const c = commandOptions(state, { unit: unitId, to });
  const entries: MenuEntry[] = [];
  if (o.attack.length > 0) entries.push({ action: { id: 'attack' }, label: '攻击' });
  if (c.arts.length > 0) entries.push({ action: { id: 'art' }, label: '战技' });
  if (c.casts.length > 0) entries.push({ action: { id: 'cast' }, label: '法术' });
  if (o.heal.length > 0) entries.push({ action: { id: 'heal' }, label: '治疗' });
  if (c.staves.length > 0) entries.push({ action: { id: 'staff' }, label: '杖' });
  // 舞蹈 only appears when the engine lists legal targets (dancer, acted ally adjacent).
  if (c.dance.length > 0) entries.push({ action: { id: 'dance' }, label: '跳舞' });
  for (const i of o.interactions) entries.push({ action: { id: 'interact', object: i.object }, label: i.label });
  if (o.seize) entries.push({ action: { id: 'seize' }, label: '压制', tone: 'primary' });
  if (o.escape) entries.push({ action: { id: 'escape' }, label: '撤离', tone: 'primary' });
  entries.push({ action: { id: 'item' }, label: '持有物' });
  entries.push({ action: { id: 'move' }, label: '移动' });
  entries.push({ action: { id: 'wait' }, label: '待机' });
  return entries;
}

export interface CarryEntry {
  kind: 'weapon' | 'consumable';
  name: string;
  detail: string;
  // Index into unit.items for consumables; undefined for weapons.
  index?: number;
  // True when the engine currently allows using it (injured unit, non-shield consumable).
  usable?: boolean;
}

// Everything the unit carries: weapons are informational, consumables are clickable when the
// engine's actionOptions.items lists them (HP 缺失且非自动触发的盾).
export function carried(state: BattleState, unitId: string, to: Point): { weapons: CarryEntry[]; consumables: CarryEntry[] } {
  const unit = unitById(state, unitId);
  const usable = new Set(actionOptions(state, unit, to).items);
  const weapons: CarryEntry[] = unit.weapons.map((id, index) => {
    const w = WEAPONS[id];
    const book = unit.bookInstances?.find(row => row.id === id);
    const instance = unit.weaponInstances?.[index]?.id === id ? unit.weaponInstances[index] : unit.weaponInstances?.find(row => row.id === id);
    const resource = book ? `次数 ${book.charges}/${book.maxCharges}` : instance ? `耐久 ${instance.durability}/${instance.maxDurability}` : '';
    return {
      kind: 'weapon', name: w.name,
      detail: [resource, `射程 ${w.range[0]}–${w.range[1]}`].filter(Boolean).join(' · '),
    };
  });
  for (const book of unit.spellbooks ?? []) weapons.push({
    kind: 'weapon', name: SPELLBOOK_BY_ID.get(book.id)?.name ?? book.id,
    detail: `次数 ${book.charges}/${book.maxCharges}`,
  });
  const consumables = unit.items.map((stack, index) => {
    const item = ITEMS[stack.id as ItemId] as { name: string; heal: number; uses?: number; shield?: boolean };
    return {
      kind: 'consumable' as const,
      name: item.name,
      detail: item.shield ? '致死时自动触发' : `回复 ${item.heal} · 剩 ${stack.uses} 次`,
      index,
      usable: usable.has(index),
    };
  });
  return { weapons, consumables };
}
