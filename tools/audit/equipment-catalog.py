"""Validate historical provenance, current runtime templates and generated grant data (not combat)."""

import argparse
import collections
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def check(condition, message):
    if not condition:
        raise ValueError(message)


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def reference(row):
    return {key: value for key, value in row.items() if key not in {'id', 'name', 'type', 'text'}}


def table_rows(text):
    rows = {}
    for line in text.splitlines():
        if re.match(r'^\| `(?:fw_weapon_\d+|short_bow|fw_spell_\d+)`', line):
            cells = [v.strip() for v in line.strip('|').split('|')]
            identity = re.fullmatch(r'`([^`]+)` (.+)', cells[0])
            check(identity is not None and identity[1] not in rows, 'Duplicate rendered equipment ID')
            rows[identity[1]] = (identity[2], cells)
    return rows


def audit(items_path=None, skills_path=None):
    data = json.loads((ROOT / 'docs/data/fw-equipment-expansion.json').read_text(encoding='utf-8'))
    weapons, spells, baseline = (data[k] for k in ('weapons', 'spells', 'baseline'))
    check(data['counts'] == {'baseline': 69, 'runtime': 35, 'newWeapons': 61, 'newSpells': 40, 'weaponsAndMedia': 113, 'spellbooks': 48, 'staves': 9, 'total': 170}, 'Declared equipment counts differ')
    check((len(baseline), len(weapons), len(spells)) == (69, 61, 40), 'Incorrect baseline or expansion counts')
    ids = [r['id'] for r in baseline + weapons + spells]
    check(len(ids) == len(set(ids)) == 170, 'Duplicate equipment template IDs')
    check(sum(r['status'] == 'implemented' for r in baseline) == 35, 'Historical baseline status boundary changed')
    check(collections.Counter(w['type'] for w in weapons) == {'sword': 12, 'lance': 15, 'axe': 11, 'bow': 11, 'fist': 12}, 'Incorrect new weapon categories')
    check(collections.Counter(s['school'] for s in spells) == {'black': 13, 'white': 21, 'dark': 6}, 'Incorrect new magic schools')
    counts = collections.Counter(r['kind'] for r in baseline)
    check(counts['weapon'] + len(weapons) == 113 and counts['spellbook'] + len(spells) == 48 and counts['staff'] == 9, 'Merged inventory counts differ')
    runtime = (ROOT / 'backend/common/data/weapons.ts').read_text(encoding='utf-8')
    block = runtime.split('const BASE_TABLE = {')[1].split('} satisfies Record<string, Weapon>')[0]
    runtime_ids = set(re.findall(r'^  ([a-z_]+): \{', block, re.M))
    check({r['id'] for r in baseline if r['status'] == 'implemented'} <= runtime_ids, 'Runtime is missing an implemented baseline ID')
    expanded = (ROOT / 'backend/common/data/expanded-weapons.ts').read_text(encoding='utf-8')
    expanded_rows = dict((m[0], json.loads(m[1])) for m in re.findall(r'^  "([^"]+)": (\{.*\}),?$', expanded, re.M))
    check(set(expanded_rows) == {w['id'] for w in weapons}, 'Generated 61 weapon IDs differ')
    physical_ids = runtime_ids | set(expanded_rows)
    planned_physical = {r['id'] for r in baseline if r['kind'] != 'spellbook'} | {w['id'] for w in weapons}
    check(planned_physical <= physical_ids, 'Runtime is missing planned physical/staff IDs: ' + ', '.join(sorted(planned_physical - physical_ids)))
    check(len(physical_ids) == 137 and len(physical_ids - planned_physical) == 15, 'Legacy runtime weapon/alias boundary changed')
    spell_text = (ROOT / 'backend/common/data/spells.ts').read_text(encoding='utf-8')
    spell_ids = re.findall(r'^  \{"id": "([^"]+)"', spell_text, re.M)
    books = (ROOT / 'backend/common/data/spellbooks.ts').read_text(encoding='utf-8')
    base_books = re.findall(r"^  \{ id: '([^']+)'", books, re.M)
    check('...BASE_BOOKS' in books and '...SPELLS.map' in books, 'Runtime spellbook composition changed')
    check(len(spell_ids) == 40 and set(spell_ids) == {s['id'] for s in spells}, 'Generated spell IDs differ')
    planned_books = {r['id'] for r in baseline if r['kind'] == 'spellbook'} | set(spell_ids)
    check(planned_books <= set(base_books + spell_ids), 'Runtime is missing planned spellbook IDs')
    check(len(base_books + spell_ids) == len(set(base_books + spell_ids)) == 50, 'Runtime spellbook IDs/count differ')
    check('...BASE_TABLE, ...EXPANDED_WEAPONS' in runtime, 'Runtime weapon composition changed')
    baseline_ids = {r['id'] for r in baseline}
    for key, expected_count, prefix in [('reusedWeapons', 18, 'wp-'), ('reusedMagic', 4, 'mg-')]:
        check(len(data[key]) == expected_count, 'Wrong number of reused source aliases')
        check(all(r['projectId'] in baseline_ids and r['sourceId'].startswith(prefix) for r in data[key]), 'Reused source creates a new duplicate template')
    check({r['projectId'] for r in data['reusedMagic']} == {'fire', 'thunder', 'wind', 'bolting'}, 'Existing spell aliases must be reused')
    weapon_source_ids = [r['sourceId'] for r in weapons + data['reusedWeapons'] + data['excludedWeapons']]
    magic_source_ids = [r['sourceId'] for r in spells + data['reusedMagic'] + data['excludedMagic']]
    check(len(weapon_source_ids) == len(set(weapon_source_ids)) == 156, 'Equipment source partition is incomplete')
    check(len(magic_source_ids) == len(set(magic_source_ids)) == 45, 'Magic source partition is incomplete')
    check(data['excludedMagic'] == [{'sourceId': 'mg-51', 'name': '狂乱', 'reason': 'source_effect_unknown'}], 'Unknown-effect magic must not be filled in as verified')
    for row in weapons:
        p = row['project']
        check(p['status'] == 'not_implemented' and p['resource'] == 'weapon_durability' and p['normalAttackCost'] == 0, 'Incorrect weapon implementation or cost policy')
        check(all(type(p[k]) is int for k in ('might', 'hit', 'weight', 'crit', 'avoid', 'maxDurability')), 'Non-numeric proposed weapon attributes')
        check(p['maxDurability'] == {'E': 40, 'D': 35, 'C': 30, 'B': 25, 'A': 20, 'S': 15}[p['rank']], 'Weapon durability policy differs')
        check(p['range'] is not None and 1 <= p['range'][0] <= p['range'][1], 'Invalid weapon range')
        check(bool(p['rankRequirements']) and bool(p['acquisition']), 'Missing weapon acquisition or proficiency rules')
    short = next(w for w in weapons if w['id'] == 'short_bow')
    check(short['sourceId'] == 'wp-205' and short['project']['range'] == [1, 2], 'Missing short bow or adjacent counter range')
    check([short['project'][k] for k in ('might', 'hit', 'weight', 'crit', 'rank', 'maxDurability')] == [5, 75, 5, 0, 'D', 35], 'Short bow proposal changed')
    check(short['reference']['dur'] == '20' and '反馈' in short['reference']['note'], 'Short bow provenance or original durability lost')
    for row in spells:
        p = row['project']
        check(p['status'] == 'not_implemented' and p['resource'] == 'per_book_casts', 'Spellbook incorrectly uses shared MP or weapon durability')
        check(p['normalCastCost'] == 1 and p['maxCharges'] == int(row['reference']['uses']) > 0, 'Missing independent spellbook charges')
        check(p['recharge'] == ['inn', 'food'] and bool(p['acquisition']), 'Missing spellbook recovery or acquisition')
        check(p['requiredStudy'] == ('whiteMagic' if row['school'] == 'white' else 'blackMagic'), 'Wrong magic permission')
        check(p['range'] is not None and 0 <= p['range'][0] <= p['range'][1] <= 10, 'Invalid spell range')
        check(p['counterCastCost'] == (1 if row['role'] == 'attack' else 0), 'Support magic given an attack counter')
    by_spell = {r['sourceId']: r for r in spells}
    check(all(by_spell[k]['project']['damageDefense'] == 'def' for k in ('mg-8', 'mg-36', 'mg-37')), 'Physical-defense magic lost its distinct damage rule')
    check(by_spell['mg-36']['project']['fixedHits'] == 2 and not by_spell['mg-36']['project']['allowSpeedFollowUp'], 'Fixed double spell incorrectly stacks follow-ups')
    check(any(r['school'] == 'white' and r['role'] == 'attack' for r in spells), 'Offensive white magic omitted')

    arts = json.loads((ROOT / 'docs/data/fw-weapon-arts.json').read_text(encoding='utf-8'))['arts']
    by_art = {a['id']: a for a in arts}
    by_weapon = {w['id']: w for w in weapons}
    grants = {(link['artId'], link['referenceEquipment']) for link in data['equipmentArtLinks']}
    expected = {(a['id'], name) for a in arts for name in a['project']['unlock'].get('referenceEquipment', [])}
    check(grants == expected, 'Equipment-granted art references are missing')
    generated_links = json.loads(re.search(r'export const EQUIPMENT_ART_LINKS = (\[.*\]) as const;', expanded)[1])
    expected_links = [{k: link[k] for k in ('artId', 'projectWeaponId', 'minimumRefinement')} for link in data['equipmentArtLinks']]
    check(generated_links == expected_links and len(generated_links) == 36, 'Generated 36 grants/refinement differ from source')
    generated_arts_text = (ROOT / 'backend/common/data/weapon-arts.ts').read_text(encoding='utf-8')
    generated_arts = [json.loads(line.strip().rstrip(',')) for line in generated_arts_text.splitlines() if line.startswith('  {"id":')]
    grant_ids = {link['artId'] for link in generated_links}
    check(len(grant_ids) == 36 and grant_ids == {a['id'] for a in arts if a['project']['unlock']['kind'] == 'equipment_grant'} == {a['id'] for a in generated_arts if a['unlock']['kind'] == 'equipment_grant'}, 'Equipment grant art kind sets differ')
    for link in data['equipmentArtLinks']:
        check(link['projectWeaponId'] in set(ids) and link['artId'] in by_art, 'Equipment art link points outside either catalog')
    for w in weapons:
        check(all(a in by_art for a in w['project']['grantedArts']), 'Weapon grants a nonexistent art')
        check(all(by_art[a]['project']['unlock']['kind'] == 'equipment_grant' for a in w['project']['grantedArts']), 'Ordinary class-learned art incorrectly treated as an equipment grant')
        check(all(by_art[a]['project']['cost'] <= w['project']['maxDurability'] for a in w['project']['grantedArts']), 'Weapon cannot afford its own granted art')
    check(any(l['artId'] == 'fw_art_51' and l['sourceWeaponId'] == 'wp-44' for l in data['equipmentArtLinks']), 'Assal/Sacred Strike source correction missing')

    doc = (ROOT / 'docs/27-fortunes-weave-equipment-magic.md').read_text(encoding='utf-8')
    rendered = table_rows(doc)
    check(set(rendered) == {r['id'] for r in weapons + spells}, 'New Markdown catalog is incomplete')
    for row in weapons + spells:
        name, cells = rendered[row['id']]
        check(name == row['name'] and row['effectSummary'] in cells[5], 'Rendered name/effect differs')
        p = row['project']
        reach = str(p['range'][0]) if p['range'][0] == p['range'][1] else str(p['range'][0]) + '–' + str(p['range'][1])
        check(cells[3] == reach, 'Rendered range differs')
        if row['id'] in by_weapon:
            check(cells[2] == '／'.join(str(p[k]) for k in ('might', 'hit', 'weight', 'crit', 'avoid')) and cells[4].endswith('→' + str(p['maxDurability'])), 'Rendered weapon parameters differ')
        else:
            first = p['healingBase'] if row['role'] == 'heal' else p['might']
            expected_values = '／'.join('—' if v is None else str(v) for v in (first, p['hit'], p['weight'], p['crit']))
            check(cells[2] == expected_values and int(cells[4]) == p['maxCharges'], 'Rendered spell parameters differ')
    doc22 = (ROOT / 'docs/22-equipment-catalog.md').read_text(encoding='utf-8')
    check('short_bow' in table_rows(doc22), 'Short bow absent from the main equipment document')
    check(table_rows(doc22)['short_bow'][1][6] == '1–2', 'Main document short bow range drift')

    links = 0
    for filename in ('README.md', 'TODO.md', 'docs/00-game-design.md', 'docs/22-equipment-catalog.md', 'docs/26-weapon-art-catalog.md', 'docs/27-fortunes-weave-equipment-magic.md'):
        path = ROOT / filename
        text = path.read_text(encoding='utf-8')
        check('\ufffd' not in text and all(s == s.rstrip() for s in text.splitlines()), 'Encoding or whitespace issue: ' + filename)
        width = None
        for line in text.splitlines():
            if line.startswith('|'):
                check(width is None or len(line.split('|')) == width, 'Malformed Markdown table')
                width = len(line.split('|'))
            else:
                width = None
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if re.match(r'^[a-zA-Z]+:', target) or target.startswith('#'):
                continue
            check((path.parent / target.split('#')[0]).exists(), 'Broken relative link: ' + target)
            links += 1
    for source_path, key, entries, reused, excluded, hash_key in [
        (items_path, 'weapons', weapons, data['reusedWeapons'], data['excludedWeapons'], 'weaponsSha256'),
        (skills_path, 'magic', spells, data['reusedMagic'], data['excludedMagic'], 'magicSha256'),
    ]:
        if source_path:
            original = json.loads(source_path.read_text(encoding='utf-8-sig'))[key]
            check(fingerprint(original) == data['sources'][hash_key], 'Source snapshot differs; review changes')
            original_ids = {r['id']: r for r in original}
            check(set(original_ids) == {r['sourceId'] for r in entries + reused + excluded}, 'Source IDs not fully accounted for')
            for row in entries + reused:
                check(row['name'] == original_ids[row['sourceId']]['name'] and row['reference'] == reference(original_ids[row['sourceId']]), 'Source values or provenance changed')
            print('PASS: all ' + str(len(original)) + ' source ' + key + ' records accounted for; selected/reused fields match')
    print('PASS: all 170 design template IDs present; 187 runtime rows include 11 additional old weapons, 2 old spellbooks and 4 legacy tome aliases (effects not certified)')
    print('PASS: short bow, per-book charges, ' + str(len(expected)) + ' equipment/art links, rendered parameters and ' + str(links) + ' local links')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--items-source', type=Path)
    parser.add_argument('--skills-source', type=Path)
    args = parser.parse_args()
    try:
        audit(args.items_source, args.skills_source)
    except (ValueError, KeyError, IndexError, StopIteration) as error:
        raise SystemExit('FAIL: ' + str(error)) from error
