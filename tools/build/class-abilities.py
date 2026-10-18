#!/usr/bin/env python3
"""Parse docs/25 class ability table into a runtime catalog."""
import re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
text=(ROOT/'docs/25-fortunes-weave-skills.md').read_text(encoding='utf-8')
rows=[]
for line in text.splitlines():
    m=re.match(r'\|\s*[^|]+/\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|',line)
    if not m: continue
    class_id, ref, inherent, mastery = m.groups()
    rows.append({'classId':class_id,'referenceId':ref,'inherent':inherent,'mastery':mastery,
                 'inherentIds':re.findall(r'`(sk-\d+|art-\d+)`',inherent),
                 'masteryIds':re.findall(r'`(sk-\d+|art-\d+)`',mastery)})
lines=['// Generated from docs/25-fortunes-weave-skills.md by tools/build/class-abilities.py. Do not hand-edit.',
'export interface ClassAbilityDef { classId: string; referenceId: string; inherent: string; mastery: string; inherentIds: string[]; masteryIds: string[] }',
'',
'export const CLASS_ABILITIES = [']
for r in rows: lines.append('  '+repr(r).replace("'",'"')+',')
lines += ['] as const;','','export const CLASS_ABILITY_BY_ID = new Map(CLASS_ABILITIES.map(row => [row.classId, row]));','']
(ROOT/'backend/common/data/class-abilities.ts').write_text('\n'.join(lines),encoding='utf-8')
print(f'class abilities: {len(rows)}')
