import { CATALOG_CLASS_IDS, CLASS_ALIASES, CLASSES, canonicalClassId, classUnavailableReason } from '../data/classes.ts';
import { CATALOG_VERSION } from './version.ts';
import { CHARACTER_STORIES } from '../data/character-stories.ts';
import { CHARACTERS } from '../data/characters.ts';
import { PROMOTIONS } from '../data/promotions.ts';
import { SKILLS } from '../data/skills.ts';
import { MOVE_TYPE_NAMES, RANKS, STAT_NAMES, WEAPON_TYPE_NAMES } from '../data/types.ts';
import { WEAPONS, WEAPON_SERIES } from '../data/weapons.ts';
import { MATERIALS } from './materials.ts';
import { RECIPES } from './production.ts';
import { WEAPON_ARTS } from '../data/weapon-arts.ts';
import equipment from '../../../docs/data/fw-equipment-expansion.json' with { type: 'json' };
import { CLASS_ABILITIES } from '../data/class-abilities.ts';
import { SPELLS } from '../data/spells.ts';
import { SPELLBOOKS } from '../data/spellbooks.ts';
import { ARENA_MAPS } from '../arena/maps.ts';
import { TERRAINS } from '../maps/map.ts';
import { GAME_ITEMS } from './items.ts';
import { REGIONS } from './calendar.ts';
import { AGE_BANDS, GROWTH_BONUS, GROWTH_TYPE_NAMES, GROWTH_TYPE_NOTES } from '../data/growth-types.ts';

// Static data (docs/06 op 23): versioned so an Agent can cache it and only refetch on change.
export { CATALOG_VERSION } from './version.ts';

export function catalog() {
  return {
    version: CATALOG_VERSION,
    stats: STAT_NAMES,
    ranks: RANKS,
    moveTypes: MOVE_TYPE_NAMES,
    weaponTypes: WEAPON_TYPE_NAMES,
    classIds: CATALOG_CLASS_IDS,
    classAliases: CLASS_ALIASES,
    classes: Object.fromEntries(Object.entries(CLASSES).map(([id, c]) => [id, {
      name: c.name, tier: c.tier, stage: c.stage, route: c.route, moveType: c.moveType, move: c.move, weapons: c.weapons,
      growth: c.growth, caps: c.caps, maxLevel: c.maxLevel,
      canonicalId: canonicalClassId(id as keyof typeof CLASSES), source: c.source, sourceUrl: c.sourceUrl,
      armored: c.armored, studies: c.studies, trainingBonus: c.trainingBonus,
      unavailableReason: classUnavailableReason(id as keyof typeof CLASSES),
    }])),
    weapons: Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [id, { ...w }])),
    weaponArts: WEAPON_ARTS,
    classAbilities: CLASS_ABILITIES,
    spells: SPELLS,
    spellbooks: SPELLBOOKS,
    equipmentCatalog: { counts: (equipment as { counts: unknown }).counts, weapons: (equipment as { weapons: unknown[] }).weapons, spells: (equipment as { spells: unknown[] }).spells },
    skills: SKILLS,
    characters: Object.fromEntries(Object.entries(CHARACTERS).map(([id, c]) => [id, {
      name: c.name, classId: c.classId, level: c.level, growthType: c.growthType, con: c.con,
      base: c.base, growth: c.growth, skill: c.skill,
    }])),
    promotions: PROMOTIONS,
    growthTypes: Object.fromEntries(Object.entries(GROWTH_TYPE_NAMES).map(([id, name]) => [id, {
      name, note: GROWTH_TYPE_NOTES[id as keyof typeof GROWTH_TYPE_NOTES], bonus: GROWTH_BONUS[id as keyof typeof GROWTH_BONUS],
    }])),
    ageBands: AGE_BANDS,
    terrains: Object.fromEntries(Object.entries(TERRAINS).map(([id, t]) => [id, {
      name: t.name, glyph: t.glyph, costs: t.costs, avoid: t.avoid, def: t.def, heal: t.heal,
      ...(id === 'snow' ? { effect: '以此格开始行动时移动力−1，飞行不受影响' }
        : id === 'ice' ? { effect: '以此格开始行动时移动力+1，飞行不受影响；重甲经过或落脚即碎为水域，无额外伤害' } : {}),
    }])),
    items: GAME_ITEMS,
    materials: MATERIALS,
    weaponSeries: WEAPON_SERIES,
    recipes: RECIPES,
    characterStories: CHARACTER_STORIES,
    regions: REGIONS,
    arenaMaps: Object.fromEntries(Object.entries(ARENA_MAPS).map(([id, m]) => [id, {
      name: m.name, deploy: m.deploy, bans: m.bans, turnLimit: m.turnLimit, goal: m.goal,
      goalText: m.goalText, feature: m.feature,
    }])),
  };
}
