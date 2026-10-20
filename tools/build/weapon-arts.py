#!/usr/bin/env python3
"""Generate the runtime art catalog from the audited design data."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
catalog = json.loads((ROOT / 'docs/data/fw-weapon-arts.json').read_text(encoding='utf-8'))
arts = []

for row in catalog['arts'] + catalog['originalArts']:
    project = row['project']
    arts.append({
        'id': row['id'], 'name': row['name'], 'weapon': row['weapon'],
        'weaponCompatibility': project.get('weaponCompatibility', [row['weapon']]),
        'variant': row.get('variant', 'base'), 'original': row.get('origin') == 'project_original',
        'cost': project['cost'], 'might': project['might'], 'hit': project['hit'], 'crit': project['crit'],
        'range': project['range'], 'sequence': project['sequence'], 'rank': project['unlock']['weaponRank'],
        'unlock': project['unlock'], 'overrides': project.get('overrides', []),
        'effect': row.get('effectSummary', ''), 'sourceId': row.get('sourceId'),
    })

weapon_types = {'剑': 'sword', '枪': 'lance', '斧': 'axe', '弓': 'bow', '拳': 'fist',
                '战车': 'bow', '短刀': 'sword', '兽爪': 'beast', '龙石': 'dragon'}
for row in catalog['supplements']:
    weapon = weapon_types[row['weaponLabel'].split('／')[0]]
    distances = [int(n) for n in re.findall(r'\d+', row['weaponLabel'])]
    effect = row['effectSummary']
    modifiers = {}
    for label, key in [('威力', 'might'), ('命中', 'hit'), ('必杀', 'crit')]:
        match = re.search(label + r'[＋+]([0-9]+)', effect)
        modifiers[key] = int(match[1]) if match else 0
    arts.append({
        'id': row['id'], 'name': row['name'], 'weapon': weapon, 'weaponCompatibility': [weapon],
        'variant': 'supplement', 'original': False, 'cost': row['cost'], **modifiers,
        'range': [min(distances), max(distances)],
        'sequence': 'fixed_2_hits' if '连续2击' in effect or '本次2击' in effect else 'single',
        'unlock': row['learning'], 'overrides': [], 'effect': effect, 'sourceId': row['id'],
    })

assert len(arts) == len({a['id'] for a in arts}) == 315
assert all(a['cost'] > 0 and 1 <= a['range'][0] <= a['range'][1] for a in arts)
lines = [
    '// Generated from docs/data/fw-weapon-arts.json by tools/build/weapon-arts.py. Do not hand-edit.',
    "import type { Rank, WeaponType } from './types.ts';",
    "import type { CatalogClassId } from './classes.ts';", '',
    'export interface WeaponArt {',
    '  id: string; name: string; weapon: WeaponType; weaponCompatibility: WeaponType[]; variant: string; original: boolean;',
    '  cost: number; might: number; hit: number; crit: number; range: [number, number]; sequence: string; rank?: Rank;',
    '  unlock: { kind: string; [key: string]: unknown }; overrides: unknown[]; effect: string; sourceId: string | null;',
    '}', '', 'export const WEAPON_ARTS: readonly WeaponArt[] = [',
]
lines += ['  ' + json.dumps(art, ensure_ascii=False) + ',' for art in arts]
lines += ['];', '', "export type WeaponArtId = WeaponArt['id'];",
          'export const WEAPON_ART_BY_ID = new Map<string, WeaponArt>(WEAPON_ARTS.map(art => [art.id, art]));', '',
          'export const CLASS_ART_MASTERY: Partial<Record<CatalogClassId, readonly { id: string; art: string; threshold: number }[]>> = {']
links = 0
for plan in catalog['classMasteryPlans']:
    nodes = []
    for node in plan['nodes']:
        assert node['artId'] in {a['id'] for a in arts}
        assert isinstance(node['masteryThreshold'], int) and node['masteryThreshold'] > 0
        nodes.append({'id': node['id'], 'art': node['artId'], 'threshold': node['masteryThreshold']})
    if nodes:
        lines.append('  ' + json.dumps(plan['classId']) + ': ' + json.dumps(nodes, ensure_ascii=False) + ',')
        links += len(nodes)
assert links == 408
lines += ['};', '', 'export interface ArtTraining { art: string; requires: string; days: number; gold: number }',
          'export const ART_TRAINING: readonly ArtTraining[] = [']
training = []
for row in catalog['arts']:
    unlock = row['project']['unlock']
    if unlock['kind'] == 'art_training':
        assert unlock['requiresArtId'] in {a['id'] for a in arts}
        cost = unlock['trainingCost']
        assert all(isinstance(cost[key], int) and cost[key] > 0 for key in ['days', 'gold'])
        training.append({'art': row['id'], 'requires': unlock['requiresArtId'], **cost})
assert len(training) == 103
lines += ['  ' + json.dumps(row, ensure_ascii=False) + ',' for row in training]
lines += ['];', '']
(ROOT / 'backend/common/data/weapon-arts.ts').write_text('\n'.join(lines), encoding='utf-8')
print(f'weapon arts: {len(arts)} (15 original, 283 reference, 17 supplement), {links} mastery links, {len(training)} training upgrades')
