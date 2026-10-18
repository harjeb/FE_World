#!/usr/bin/env python3
"""Generate runtime weapons and equipment-art links from the audited catalog."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
data = json.loads((ROOT / 'docs/data/fw-equipment-expansion.json').read_text(encoding='utf-8'))
rows = []
for weapon in data['weapons']:
    project = weapon['project']
    rows.append((weapon['id'], {
        'name': weapon['name'], 'type': weapon['type'], 'rank': project['rank'],
        **{key: project[key] for key in ['might', 'hit', 'weight', 'crit', 'range', 'maxDurability']},
        'note': weapon.get('effectSummary', ''),
    }))
links = [{key: link[key] for key in ['artId', 'projectWeaponId', 'minimumRefinement']}
         for link in data['equipmentArtLinks']]
assert len(links) == len({row['artId'] for row in links}) == 36
assert all(isinstance(row['minimumRefinement'], int) and row['minimumRefinement'] >= 0 for row in links)
lines = [
    '// Generated from docs/data/fw-equipment-expansion.json. Do not hand-edit.',
    "import type { Weapon } from './weapons.ts';", '',
    'export const EQUIPMENT_ART_LINKS = ' + json.dumps(links, ensure_ascii=False) + ' as const;', '',
    'export const EXPANDED_WEAPONS = {',
]
lines += ['  ' + json.dumps(identity) + ': ' + json.dumps(row, ensure_ascii=False) + ',' for identity, row in rows]
lines += ['} as const satisfies Record<string, Weapon>;', '']
(ROOT / 'backend/common/data/expanded-weapons.ts').write_text('\n'.join(lines), encoding='utf-8')
print(f'expanded weapons: {len(rows)}, equipment-art grants: {len(links)}')
