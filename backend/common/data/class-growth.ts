import type { CatalogClassId } from './classes.ts';
import { FW_CLASS_REFERENCE } from './class-reference.ts';
import type { Stats } from './types.ts';

export type GrowthVector = readonly [number, number, number, number, number, number, number, number, number];
export type GrowthRole = 'duelist' | 'striker' | 'marksman' | 'guardian' | 'skirmisher' | 'arcanist' | 'healer' | 'hybrid' | 'support' | 'dragon';
interface GrowthProfile { role: GrowthRole; values: GrowthVector }

export const CLASS_GROWTH_VERSION = 'source-targeted-v6-pruned-20261016';
// Order: HP, strength, magic, dexterity, speed, luck, defense, resistance, charm.
type SourceClassId = (typeof FW_CLASS_REFERENCE)[number]['id'];
// Positive deltas from the untouched source. Unlisted stats and classes remain unchanged.
export const SOURCE_GROWTH_BUFFS: Partial<Record<SourceClassId, Partial<Stats>>> = {
  hunter: { str: 5 },
  ornius_rider: { str: 5 },
  swordsman: { str: 5 },
  archer: { str: 5 },
  rogue: { str: 5 },
  cavalier: { str: 5, skl: 5 },
  armored_ornius: { str: 5 },
  pegasus: { str: 5, spd: 10 },
  shido: { str: 5, skl: 5, spd: 5 },
  paladin: { hp: 5, str: 5, skl: 5 },
  cataphract: { hp: 5, spd: 5, def: 10 },
  battlemaster: { skl: 10, lck: 5 },
  monk: { mag: 10, skl: 5 },
  fortress: { spd: 5 },
  orichaldia: { skl: 5, spd: 5 },
  great_knight: { hp: 5, def: 10, res: 5 },
  dragon_commander: { hp: 5, str: 5, skl: 5, def: 5 },
  wiseman: { mag: 5, skl: 5 },
  valkyrie: { mag: 5 },
  fist_deity: { str: 5, mag: 5, skl: 5 },
};
const SOURCE_ROLES: Record<SourceClassId, GrowthRole> = {
  commoner: 'support', noble: 'support', gladiator: 'striker', hunter: 'marksman', lancer: 'guardian',
  ornius_rider: 'skirmisher', adept: 'arcanist', swordsman: 'duelist', fighter: 'striker', brawler: 'striker',
  archer: 'marksman', rogue: 'skirmisher', knight: 'guardian', cavalier: 'skirmisher', charioteer: 'marksman',
  armored_ornius: 'skirmisher', pegasus: 'skirmisher', mage: 'arcanist', cleric: 'healer', shido: 'duelist',
  warrior: 'striker', sniper: 'marksman', forest_knight: 'marksman', dreadnought: 'guardian', paladin: 'skirmisher',
  sage: 'arcanist', bishop: 'healer', divine_ornius: 'hybrid', dragon_knight: 'striker', troubadour: 'healer',
  guardian: 'guardian', blacksmith: 'hybrid', cataphract: 'guardian', ranger: 'skirmisher', dancer: 'support',
  elephant_rider: 'guardian', swordmaster: 'duelist', high_epitaph: 'hybrid', battlemaster: 'striker', monk: 'hybrid',
  marksman: 'marksman', bow_knight: 'marksman', shadow_seeker: 'skirmisher', sentinel: 'guardian', fortress: 'guardian',
  orichaldia: 'skirmisher', great_knight: 'guardian', falcon: 'skirmisher', dragon_commander: 'striker', druid: 'arcanist',
  wiseman: 'healer', valkyrie: 'healer', blade: 'duelist', apsara: 'support', everlord: 'striker', fist_deity: 'hybrid',
  calamity: 'skirmisher', storm_lancer: 'guardian', divine_cavalier: 'skirmisher', saint: 'healer',
};
const sourceProfiles = Object.fromEntries(FW_CLASS_REFERENCE.map(ref => {
  const raw = ref.growth, buff = SOURCE_GROWTH_BUFFS[ref.id] ?? {};
  const values: GrowthVector = [raw[0] + (buff.hp ?? 0), raw[1] + (buff.str ?? 0), raw[2] + (buff.mag ?? 0),
    raw[4] + (buff.skl ?? 0), raw[3] + (buff.spd ?? 0), raw[7] + (buff.lck ?? 0),
    raw[5] + (buff.def ?? 0), raw[6] + (buff.res ?? 0), raw[8] + (buff.cha ?? 0)];
  return [ref.id, { role: SOURCE_ROLES[ref.id], values }];
})) as Record<SourceClassId, GrowthProfile>;
// Extensions have no source row here. Retired profiles remain for old saves and replays.
// Active extensions use a provisional zero for charm.
export const CLASS_GROWTH: Record<CatalogClassId, GrowthProfile> = {
  ...sourceProfiles,

  mercenary: { role: 'duelist', values: [15,10,0,10,10,0,5,0,0] },
  hero: { role: 'duelist', values: [20,15,0,15,10,0,10,0,0] },
  berserker: { role: 'striker', values: [25,25,-5,5,10,0,0,-5,0] },
  thief: { role: 'skirmisher', values: [10,5,0,10,15,10,0,0,0] },
  assassin: { role: 'duelist', values: [15,10,0,20,20,5,0,0,0] },
  ninja: { role: 'skirmisher', values: [10,5,0,10,15,5,0,10,0] },
  master_ninja: { role: 'skirmisher', values: [15,10,0,15,20,5,0,15,0] },
  mechanist: { role: 'marksman', values: [20,15,0,20,5,5,10,0,0] },
  general: { role: 'guardian', values: [25,15,0,10,-5,0,25,0,0] },
  mage_knight: { role: 'hybrid', values: [15,15,15,10,5,0,5,5,0] },
  dark_knight: { role: 'hybrid', values: [20,10,15,10,0,5,10,5,0] },
  war_cleric: { role: 'hybrid', values: [20,15,10,5,5,5,10,10,0] },

  beast_cub: { role: 'striker', values: [15,10,-5,5,5,0,5,0,0] },
  beast_fighter: { role: 'striker', values: [20,15,-5,5,10,0,10,-5,0] },
  beast_hero: { role: 'striker', values: [25,20,-5,10,10,0,10,-5,0] },
  beast_guard: { role: 'striker', values: [25,25,-5,10,10,0,20,-5,0] },
  beast_lord: { role: 'striker', values: [30,30,-5,15,20,0,25,-5,0] },
  awakened: { role: 'dragon', values: [15,0,10,0,-5,0,5,10,0] },
  dragonkin: { role: 'dragon', values: [20,0,15,5,-5,0,10,10,0] },
  ancient_guard: { role: 'dragon', values: [25,0,20,5,-5,0,15,15,0] },
  dragon_sage: { role: 'dragon', values: [25,0,25,10,-5,0,20,20,0] },
  dragon_lord: { role: 'dragon', values: [30,0,30,15,-5,0,25,25,0] },
} as const satisfies Record<CatalogClassId, GrowthProfile>;
