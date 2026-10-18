#!/usr/bin/env python3
"""Generate runtime spell metadata from docs/data/fw-equipment-expansion.json."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
d=json.loads((ROOT/'docs/data/fw-equipment-expansion.json').read_text(encoding='utf-8'))
rows=[]
for s in d['spells']:
    p=s['project']
    rows.append({'id':s['id'],'name':s['name'],'school':s['school'],'role':s['role'],
      'rank':p.get('rank','E'),'might':p.get('might',0),'healingBase':p.get('healingBase'),
      'hit':p.get('hit',0),'crit':p.get('crit',0),'weight':p.get('weight',0),'range':p.get('range',[1,1]),
      'maxCharges':p.get('maxCharges',6),'damageDefense':p.get('damageDefense','res'),
      'fixedHits':p.get('fixedHits',1),'allowSpeedFollowUp':p.get('allowSpeedFollowUp',True),
      'requiredStudy':p.get('requiredStudy'),'effects':p.get('effects',{}),'effect':s.get('effectSummary','')})
lines=['// Generated from docs/data/fw-equipment-expansion.json by tools/build/spells.py. Do not hand-edit.',
  "import type { Rank } from './types.ts';", "import type { SpellEffects } from './spellbooks.ts';",'',
  "export interface SpellDef { id: string; name: string; school: 'black' | 'white' | 'dark'; role: 'attack' | 'heal' | 'support' | 'hostile_support'; rank: Rank; might: number | null; healingBase: number | null; hit: number | null; crit: number | null; weight: number; range: readonly [number, number]; maxCharges: number; damageDefense: 'def' | 'res' | null; fixedHits: number; allowSpeedFollowUp: boolean; requiredStudy: 'blackMagic' | 'whiteMagic'; effects: SpellEffects; effect: string }",'','export const SPELLS = [']
for r in rows: lines.append('  '+json.dumps(r, ensure_ascii=False)+',')
lines += ['] as const satisfies readonly SpellDef[];','','export type SpellId = (typeof SPELLS)[number][\'id\'];','export const SPELL_BY_ID = new Map(SPELLS.map(spell => [spell.id, spell]));','']
(ROOT/'backend/common/data/spells.ts').write_text('\n'.join(lines),encoding='utf-8')
print(f'spells: {len(rows)}')
