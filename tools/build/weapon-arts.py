#!/usr/bin/env python3
"""Generate backend/common/data/weapon-arts.ts from the audited JSON catalog."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
d=json.loads((ROOT/'docs/data/fw-weapon-arts.json').read_text(encoding='utf-8'))
arts=[]
for a in d['arts']:
    p=a.get('project',{})
    arts.append({'id':a['id'],'name':a['name'],'weapon':a.get('weapon'),'variant':a.get('variant','base'),
        'cost':p.get('cost',3),'might':p.get('might',0),'hit':p.get('hit',0),'crit':p.get('crit',0),
        'range':p.get('range',[1,1]),'sequence':p.get('sequence','single'),'unlock':p.get('unlock',{}),
        'overrides':p.get('overrides',[]),'effect':a.get('effectSummary',''),'sourceId':a.get('sourceId')})
for s in d['supplements']:
    arts.append({'id':s['id'],'name':s['name'],'weapon':'sword','variant':'supplement','cost':s.get('cost',3),
        'might':4,'hit':10,'crit':0,'range':[1,1],'sequence':'single','unlock':{},'overrides':[],
        'effect':s.get('effectSummary',''),'sourceId':s.get('id')})
lines=['// Generated from docs/data/fw-weapon-arts.json by tools/build/weapon-arts.py. Do not hand-edit.',
'export interface WeaponArt {','  id: string; name: string; weapon: string; variant: string; cost: number; might: number; hit: number; crit: number;',
'  range: [number, number]; sequence: string; unlock: unknown; overrides: unknown[]; effect: string; sourceId: string | null;','}','',
'export const WEAPON_ARTS = [']
for a in arts: lines.append('  '+repr(a).replace("'",'"')+',')
lines += ['] as const;','','export type WeaponArtId = (typeof WEAPON_ARTS)[number][\'id\'];',
'export const WEAPON_ART_BY_ID = new Map(WEAPON_ARTS.map(art => [art.id, art]));','']
(ROOT/'backend/common/data/weapon-arts.ts').write_text('\n'.join(lines),encoding='utf-8')
print(f'weapon arts: {len(arts)}')
