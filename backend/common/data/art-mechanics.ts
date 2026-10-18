import { WEAPON_ARTS } from './weapon-arts.ts';

type Mods = Partial<Record<'attack' | 'hit' | 'crit' | 'avoid' | 'dodge' | 'def' | 'res' | 'as', number>>;
export interface ArtMechanics {
  mods?: Mods; foeMods?: Mods;
  conditions?: { when: 'foe_half' | 'foe_poison' | 'foe_full' | 'self_full' | 'terrain' | 'foe_as_lead' | 'foe_magic' | 'foe_sword' | 'foe_lance' | 'foe_bow' | 'foe_mounted' | 'foe_armored' | 'foe_flying' | 'foe_large'; mods?: Mods; incomingScale?: number; hits?: number; scale?: number }[];
  magic?: boolean; effective?: ('flying' | 'armored' | 'mounted' | 'dragon' | 'beast' | 'demon')[];
  scale?: number; incomingScale?: number; ignoreTerrain?: boolean; fixedHit?: number;
  sureHit?: 'first' | 'all'; minimumDamage?: number; nonlethal?: boolean;
  rangeWeaponRequired?: boolean; rangePenalty?: number; followUpAttack?: number; followUpCrit?: number; adjacentAttack?: number;
  proc?: { stat?: 'str' | 'mag' | 'skl' | 'spd' | 'lck' | 'res'; divisor?: number; plus?: number; chance?: number; attack: number; followUp?: boolean; when?: 'foe_full' };
  refund?: { stat?: 'skl'; divisor?: number; critical?: boolean };
  drain?: number; drainPoisonOnly?: boolean; noCounter?: boolean; sealFollowUp?: boolean;
  counterBlockOnHit?: number; counterBlockOnMiss?: boolean; hitAfterMiss?: number;
  forceChance?: { stat: 'mag'; divisor: number }; foeHitZeroThreshold?: number;
  onHit?: { statuses?: ('poison' | 'root' | 'silence' | 'confusion')[]; chance?: number; movePenalty?: number; onlyFlying?: boolean; debuff?: { stat: 'def' | 'spd' | 'avoid'; amount: number; duration: 'phase' | 'exchange' }; stripProtection?: boolean };
  postBuff?: { trigger: 'after' | 'kill'; stat: 'str' | 'skl' | 'spd' | 'lck' | 'def' | 'res' | 'avoid' | 'dodge' | 'as'; amount: number; cap?: number; duration: 'map' | 'next_phase' | 'exchange' }[];
  postHeal?: { trigger: 'after' | 'kill'; percent: number };
  afterDebuff?: { stat: 'avoid'; amount: number; duration: 'exchange' };
  postMove?: number; support?: boolean; push?: boolean; destructive?: boolean; area?: 'square' | 'adjacent_two' | 'line';
}

// Numeric might/hit/crit, range, cost and English attack sequences live in WEAPON_ARTS.
// Empty entries deliberately mean those fields are the complete mechanics, not unknown effects.
const table: Record<string, ArtMechanics> = Object.fromEntries(WEAPON_ARTS.filter(a => !a.original).map(a => [a.id, {}]));
function patch(ids: readonly (number | string)[], mechanics: ArtMechanics): void {
  for (const id of ids) {
    const key = typeof id === 'number' ? `fw_art_${id}` : id;
    if (!Object.hasOwn(table, key)) throw new Error(`Unknown/non-reference art mechanics: ${key}`);
    table[key] = { ...table[key], ...mechanics };
  }
}
patch([16, 'ground_cut'], { effective: ['flying'] });
patch([101,269,114,312,194,321,355,'helm_breaker','armor_fist'], { effective: ['armored'] });
patch([109,306], { effective: ['mounted'] });
patch([32], { effective: ['dragon'] });
patch([122], { effective: ['beast','dragon'] });
patch([49], { effective: ['demon'] });
patch([22,33,117,205,316,348,49,169,227,356,119,166,173,264,199,244,357,76,85,87,167,344,345,'spellblade_cut','dragon_pressure'], { magic: true });
patch([22], { area: 'square', scale: .5 });
patch([29,224,326,344], { scale: .8 });
patch([34,172,116,97,309,191,163,256], { scale: .5 });
patch([152,353,'armor_fist'], { scale: .7 });
patch([216,294,338,339], { scale: .9 });
patch([64], { scale: 1.5 });
patch([35,107,303,325], { ignoreTerrain: true });
patch([171,262], { fixedHit: 10 });
patch([359], { fixedHit: 50 });
patch([202], { sureHit: 'first' }); patch([322], { sureHit: 'all' });
patch([176,203], { minimumDamage: 10 }); patch([351], { minimumDamage: 20 });
patch([206,331,195,301], { nonlethal: true });
patch([40,45,162,179,258,285,286,356,192,196,199,244,274,323], { rangeWeaponRequired: true });
patch([26,98,54,65,104,82,177,280], { mods: { avoid: 10 } });
patch([268,267,273,276,266], { mods: { avoid: 15 } });
patch([163,256,253,214,279], { mods: { avoid: 20 } });
patch([42,242], { mods: { def: 3 } }); patch([43,298], { mods: { def: 7 } });
patch([190,231], { mods: { def: 10 } });
patch([150,165], { mods: { dodge: 20 } }); patch([332,259], { mods: { dodge: 30 } });
patch([170,241], { mods: { as: 5 } }); patch([156,174,271], { mods: { as: 3 } });
patch([126], { mods: { res: 7 } }); patch([304], { mods: { res: 10 } }); patch([160,265], { mods: { res: 5 } });
patch([215,281], { foeMods: { hit: -20, avoid: -20, crit: -20 } });
patch([174], { followUpAttack: 7 }); patch([271], { followUpAttack: 10 });
patch([111], { followUpAttack: 5 }); patch([297], { followUpAttack: 8 });
patch([177,280], { followUpCrit: 10 }); patch([272], { followUpCrit: 5 });
patch([87], { adjacentAttack: 2 });
patch([102], { conditions: [{ when: 'foe_half', mods: { attack: 5, crit: 10 } }] });
patch([290], { conditions: [{ when: 'foe_half', mods: { attack: 7, crit: 15 } }] });
patch([213], { conditions: [{ when: 'foe_half', mods: { attack: 3, hit: 10 } }] });
patch([277], { conditions: [{ when: 'foe_half', mods: { attack: 5, hit: 20 } }] });
patch([164,257], { conditions: [{ when: 'foe_large', incomingScale: .5 }] });
patch([162,258], { conditions: [{ when: 'foe_as_lead', mods: { hit: 20 } }] });
patch([113], { conditions: [{ when: 'foe_mounted', mods: { attack: 15 } }] });
patch([353], { conditions: [{ when: 'foe_mounted', mods: { hit: 10 } }] });
patch([120], { conditions: [{ when: 'foe_magic', mods: { attack: 15, hit: 10 } }] });
patch([346], { conditions: [{ when: 'foe_magic', mods: { attack: 12 } }] });
patch([340], { conditions: [{ when: 'foe_sword', mods: { attack: 8 } }] });
patch([193], { conditions: [{ when: 'foe_lance', mods: { attack: 7 } }] });
patch([275], { conditions: [{ when: 'foe_lance', mods: { attack: 7, hit: 20 } }] });
patch([74], { conditions: [{ when: 'foe_flying', mods: { hit: 50 } }] });
patch([321], { conditions: [{ when: 'foe_armored', mods: { crit: 10 } }] });
patch([200,324], { conditions: [{ when: 'self_full', mods: { attack: 3 } }] });
patch([182], { conditions: [{ when: 'terrain', mods: { attack: 5, hit: 10, crit: 10 } }] });
patch([313], { conditions: [{ when: 'terrain', mods: { attack: 5, hit: 15, crit: 15 } }] });
patch([220], { conditions: [{ when: 'foe_poison', mods: { attack: 8 } }] });
patch([336], { conditions: [{ when: 'foe_poison', mods: { attack: 8, hit: 20 } }] });
// The conditional hit count replaces (rather than adds to) the generated fixed sequence.
patch([350], { conditions: [{ when: 'foe_bow', hits: 2, scale: .9 }] });
patch([24,270], { proc: { stat: 'spd', divisor: 2, attack: 5 } });
patch([99,222,125,235], { proc: { stat: 'skl', divisor: 2, attack: 5 } });
patch([110], { proc: { stat: 'str', plus: 2, attack: 5 } });
patch([147,300,138,317], { proc: { stat: 'str', divisor: 2, attack: 5 } });
patch([218], { proc: { stat: 'skl', divisor: 2, attack: 8 } });
patch([319], { proc: { stat: 'skl', divisor: 2, attack: 12 } });
patch([217], { proc: { stat: 'spd', divisor: 2, attack: 5, followUp: true } });
patch([307], { proc: { stat: 'spd', divisor: 2, attack: 8, followUp: true } });
patch([209], { proc: { stat: 'res', divisor: 2, attack: 5 } });
patch([238], { proc: { stat: 'res', divisor: 2, attack: 10 } });
patch([70,329], { proc: { chance: 50, attack: 15 } });
patch([128], { proc: { chance: 5, attack: 10 } }); patch([296], { proc: { chance: 10, attack: 10 } });
patch([96], { proc: { chance: 30, attack: 5, when: 'foe_full' } });
patch([288], { proc: { chance: 50, attack: 5, when: 'foe_full' } });
patch([112], { refund: { stat: 'skl' } }); patch([151,226], { refund: { stat: 'skl', divisor: 2 } });
patch([347], { refund: { critical: true } });
patch([62,134,219], { drain: .5 }); patch([219], { drainPoisonOnly: true });
patch([47,330], { sealFollowUp: true });
patch([28,223], { counterBlockOnHit: 20 }); patch([123], { counterBlockOnHit: 10 });
patch([191], { counterBlockOnMiss: true }); patch([184,314], { hitAfterMiss: 10 });
patch([358], { forceChance: { stat: 'mag', divisor: 2 } });
patch([201], { foeHitZeroThreshold: 20 }); patch([305], { foeHitZeroThreshold: 30 });
patch([33], { onHit: { statuses: ['poison'] } });
patch([106], { onHit: { statuses: ['silence','root'] } });
patch([349], { onHit: { statuses: ['silence'] } }); patch([81], { onHit: { statuses: ['root'] } });
patch([115,341], { onHit: { statuses: ['confusion'], chance: 5 } });
patch([311], { onHit: { statuses: ['confusion'], chance: 10 } });
patch([20,21], { onHit: { movePenalty: 3, onlyFlying: true } });
patch([72,282], { onHit: { movePenalty: 3 } });
patch([188,302], { onHit: { debuff: { stat: 'avoid', amount: -20, duration: 'exchange' } } });
// Named Hades protection only; never bypass immortal shield.
patch([204,261], { onHit: { stripProtection: true } });
patch([108], { afterDebuff: { stat: 'avoid', amount: -20, duration: 'exchange' } });
function buff(ids: number[], trigger: 'after' | 'kill', stat: NonNullable<ArtMechanics['postBuff']>[number]['stat'], amount: number, duration: 'map' | 'next_phase' | 'exchange', cap?: number): void {
  patch(ids, { postBuff: [{ trigger, stat, amount, duration, ...(cap === undefined ? {} : { cap }) }] });
}
buff([18,212,159,315], 'after','skl',2,'map',10);
buff([57,251], 'after','str',1,'map',5); buff([84], 'after','spd',1,'map',10); buff([283], 'after','spd',2,'map',10);
buff([133], 'kill','lck',2,'map',10); buff([149,289], 'kill','avoid',20,'next_phase');
buff([165], 'after','dodge',20,'next_phase'); buff([259], 'after','dodge',30,'next_phase');
buff([44,318], 'kill','def',3,'next_phase'); buff([118], 'kill','def',10,'next_phase');
buff([46,229], 'kill','res',7,'next_phase'); buff([61], 'kill','as',10,'next_phase');
buff([185], 'kill','def',10,'exchange'); buff([320], 'kill','def',20,'exchange');
buff([73], 'kill','avoid',30,'exchange'); buff([287], 'kill','avoid',40,'exchange');
patch([50,243], { postHeal: { trigger: 'after', percent: .2 } });
patch([137], { postHeal: { trigger: 'after', percent: .1 } });
patch([51,135], { postHeal: { trigger: 'kill', percent: .2 } });
patch([69,103], { postMove: 1 }); patch([342], { postMove: 2 });
patch([86], { support: true }); patch([60], { destructive: true });
patch(['wind_sweep'], { noCounter: true }); patch(['deadeye_shot'], { rangePenalty: 10 });
patch(['chariot_line'], { area: 'line' }); patch(['axe_sweep'], { area: 'adjacent_two', scale: .75 });
patch(['dagger_disarm'], { onHit: { debuff: { stat: 'def', amount: -3, duration: 'phase' } } });
patch(['dragon_pressure'], { onHit: { debuff: { stat: 'spd', amount: -3, duration: 'phase' } } });
patch(['beast_pounce'], { push: true });
if (Object.keys(table).length !== 300 || WEAPON_ARTS.some(a => !a.original && !Object.hasOwn(table, a.id))) {
  throw new Error('Art mechanics must cover exactly the 300 non-original arts');
}
export const ART_MECHANICS: Readonly<Record<string, ArtMechanics>> = Object.freeze(table);
