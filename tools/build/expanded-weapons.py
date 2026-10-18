#!/usr/bin/env python3
"""Generate runtime weapon entries from docs/data/fw-equipment-expansion.json."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
data=json.loads((ROOT/'docs/data/fw-equipment-expansion.json').read_text(encoding='utf-8'))
rows=[]
for w in data['weapons']:
    p=w['project']
    rows.append({'id':w['id'],'name':w['name'],'type':w['type'],'rank':p.get('rank','E'),
      'might':p.get('might',0),'hit':p.get('hit',0),'weight':p.get('weight',0),'crit':p.get('crit',0),
      'range':p.get('range',[1,1]),'maxDurability':p.get('maxDurability',40),
      'note':w.get('effectSummary','')})
lines=['// Generated from docs/data/fw-equipment-expansion.json. Do not hand-edit.','import type { Weapon } from \'./weapons.ts\';','','export const EXPANDED_WEAPONS = {']
for r in rows:
    lines.append('  '+repr(r['id'])+': { name: '+repr(r['name'])+', type: '+repr(r['type'])+', rank: '+repr(r['rank'])+', might: '+str(r['might'])+', hit: '+str(r['hit'])+', weight: '+str(r['weight'])+', crit: '+str(r['crit'])+', range: ['+str(r['range'][0])+', '+str(r['range'][1])+'] as const, maxDurability: '+str(r['maxDurability'])+', note: '+repr(r['note'])+' },')
lines += ['} as const satisfies Record<string, Weapon>;','']
(ROOT/'backend/common/data/expanded-weapons.ts').write_text('\n'.join(lines),encoding='utf-8')
print(f'expanded weapons: {len(rows)}')
