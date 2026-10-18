"""Check the design inventory without importing it into the combat engine."""

import argparse
import collections
import hashlib
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / 'docs/data/fw-weapon-arts.json'
EXPECTED_WEAPONS = {'sword': 77, 'lance': 58, 'axe': 56, 'bow': 49, 'fist': 43}
SOURCE_WEAPONS = {'剑': 'sword', '枪': 'lance', '斧': 'axe', '弓': 'bow', '手甲': 'fist'}
EXPECTED_UPGRADES = {
    172: 34, 325: 35, 259: 165, 319: 218,
    330: 47, 326: 152, 272: 197, 305: 201,
    275: 193, 320: 185, 307: 217, 311: 115,
    327: 130, 288: 96, 277: 213, 287: 73,
    266: 82, 238: 209, 296: 128, 283: 84,
    21: 20, 176: 203, 212: 18, 268: 26, 271: 174, 290: 102, 322: 202,
    243: 137, 267: 98, 285: 45, 286: 179, 298: 43, 318: 44, 332: 150,
    251: 57, 273: 54, 294: 216, 297: 111, 312: 114, 315: 159, 323: 196,
    234: 71, 246: 189, 253: 104, 282: 72, 302: 188, 313: 182,
    236: 77, 254: 79, 261: 204, 279: 214, 301: 195, 321: 194,
    222: 99, 223: 28, 224: 29, 225: 36, 226: 151, 227: 169, 228: 48,
    229: 46, 230: 52, 231: 190, 232: 207, 233: 343, 235: 125, 241: 170,
    242: 42, 244: 199, 248: 31, 252: 67, 256: 163, 257: 164, 258: 162,
    260: 168, 262: 171, 263: 59, 264: 173, 265: 160, 269: 101, 270: 24,
    274: 192, 276: 65, 280: 177, 281: 215, 289: 149, 291: 25, 292: 180,
    295: 198, 299: 100, 300: 147, 303: 107, 304: 126, 306: 109, 309: 97,
    310: 181, 314: 184, 316: 205, 317: 138, 324: 200, 329: 70, 331: 206, 339: 338,
}
SAMPLES = {34, 35, 47, 64, 74, 86, 130}
REFERENCE_FIELDS = ('cost', 'might', 'hit', 'crit', 'avo', 'ddg', 'eff', 'sup', 'range', 'learn', 'chars', 'note')
SEQUENCES = {
    'speed_follow_up', 'no_speed_follow_up', 'follow_up_before_counter',
    'counter_first', 'forced_follow_up', 'conditional_forced_follow_up',
    'steal_foe_follow_up', 'fixed_2_hits', 'fixed_3_hits', 'fixed_4_hits', 'fixed_5_hits',
}


def check(condition, message):
    if not condition:
        raise ValueError(message)


def signed(value):
    return '+' + str(value) if value > 0 else str(value)


def example_rows(text):
    section = text.split('## 5. ')[1].split('## 6. ')[0]
    result = {}
    for line in section.splitlines():
        if re.match(r'^\| `', line):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            identity = re.fullmatch(r'`([^`]+)` (.+)', cells[0])
            check(identity is not None, 'Malformed example identity')
            result[identity[1]] = (identity[2], cells)
    return result


def audit(catalog_path, source_path=None):
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    rows, supplements, excluded = (catalog[key] for key in ('arts', 'supplements', 'excluded'))
    check(catalog['schemaVersion'] == 1, 'Unexpected schema version')
    check(len(rows) == 283 and len(supplements) == 17, 'Expected 283 reference arts and 17 supplements')
    check(catalog['counts'] == {'selectedReferenceWeaponArts': 283, 'base': 180, 'upgrades': 103, 'supplements': 17, 'totalWeaponArts': 300}, 'Incorrect declared counts')
    identities = [row['id'] for row in rows + supplements]
    check(len(identities) == len(set(identities)) == 300, 'Duplicate project art IDs')
    check(len({row['name'] for row in rows}) == 283, 'Duplicate reference art names')
    check(collections.Counter(row['weapon'] for row in rows) == EXPECTED_WEAPONS, 'Weapon distribution changed or support/Blaze counted')
    check(collections.Counter(row['variant'] for row in rows) == {'base': 180, 'upgrade': 103}, 'Incorrect basic/upgrade counts')
    source_ids = [row['sourceId'] for row in rows + excluded]
    check(len(source_ids) == len(set(source_ids)) == catalog['source']['recordCount'] == 345, 'Source partition must contain 345 unique IDs')
    check(collections.Counter(row['reason'] for row in excluded) == {'support': 29, 'blaze': 15, 'missing_effect': 1, 'unselected_upgrade': 17}, 'Incorrect exclusion reasons')
    check(any(row['sourceId'] == 'art-158' and row['reason'] == 'missing_effect' for row in excluded), 'Unknown effect counted as an art')
    check(sum(catalog['source']['byWeapon'].values()) == 345, 'Incorrect source category totals')
    check(re.fullmatch(r'[0-9a-f]{64}', catalog['source']['canonicalArtsSha256']) is not None, 'Invalid source fingerprint')
    by_id = {row['id']: row for row in rows}
    upgrade_pairs = {}
    class_refs = [json.loads(row) for row in re.findall(r'^  (\{.*\}),?$', (ROOT / 'backend/common/data/class-reference.ts').read_text(encoding='utf-8'), re.M)]
    active_classes = {row['id'] for row in class_refs if row['id'] not in {'warrior', 'elephant_rider'}}
    for row in rows:
        number = int(row['sourceId'].removeprefix('art-'))
        check(row['id'] == 'fw_art_' + str(number), 'Mismatched source/project ID')
        check(bool(row['name']) and bool(row['effectSummary']), 'Empty name or effect')
        check(set(row['reference']) == set(REFERENCE_FIELDS), 'Missing reference fields')
        project = row['project']
        check(project['status'] == 'not_implemented' and project['resource'] == 'weapon_durability', 'Incorrect implementation/resource claim')
        check(type(project['cost']) is int and project['cost'] > 0, 'Missing positive durability cost')
        check(all(type(project[field]) is int for field in ('might', 'hit', 'crit')), 'Non-numeric attack parameters')
        check(len(project['range']) == 2 and all(type(n) is int for n in project['range']) and 1 <= project['range'][0] <= project['range'][1] <= 10, 'Invalid project range')
        check(project['sequence'] in SEQUENCES, 'Unknown attack sequence')
        unlock = project['unlock']
        check(len(unlock['weaponRank']) == 1 and unlock['weaponRank'] in 'EDCBAS', 'Unknown weapon rank')
        check(unlock['kind'] in {'weapon_node', 'class_mastery', 'equipment_grant', 'upgrade_node'}, 'Missing learning channel')
        if unlock['kind'] == 'class_mastery':
            check(set(unlock['classIds']) <= active_classes, 'Deleted or unknown class reward')
            check(bool(row['referenceClassIds']), 'Missing reference class provenance')
        if unlock['kind'] == 'equipment_grant':
            check(bool(unlock['referenceEquipment']), 'Missing equipment grant source')
        if row['variant'] == 'upgrade':
            parent = by_id.get(unlock.get('requiresArtId'))
            check(parent is not None and parent['variant'] == 'base', 'Missing basic upgrade prerequisite')
            check(parent['weapon'] == row['weapon'] and unlock['weaponRank'] in 'AS', 'Invalid upgrade weapon/rank')
            upgrade_pairs[number] = int(parent['sourceId'].removeprefix('art-'))
            check(row['effectSummary'] != parent['effectSummary'] or any(project[k] != parent['project'][k] for k in ('might', 'hit', 'crit', 'range')) or project['cost'] < parent['project']['cost'], 'Upgrade has no effect/parameter change or durability saving')
        if row['reference']['cost'] == '-':
            check(bool(project['overrides']), 'Unknown source cost silently converted')
    check(upgrade_pairs == EXPECTED_UPGRADES, 'Upgrade selection or prerequisite changed')

    skills = (ROOT / 'docs/23-skill-catalog.md').read_text(encoding='utf-8')
    examples = example_rows(skills)
    check(len(examples) == 24, 'Expected 24 retained examples, not the full scope')
    check(set(examples) == {row['id'] for row in supplements} | {'fw_art_' + str(n) for n in SAMPLES}, 'Examples and complete catalog disagree')
    for row in rows + supplements:
        if row['id'] in examples:
            cost = row.get('cost') if 'cost' in row else row['project']['cost']
            check(int(examples[row['id']][1][3]) == cost, 'Example durability differs: ' + row['id'])
    for row in supplements:
        name, cells = examples[row['id']]
        check([row['name'], row['weaponLabel'], row['effectSummary'], row['unlock']] == [name, cells[1], cells[2], cells[4]], 'Supplement specification drift')

    doc = (ROOT / 'docs/26-weapon-art-catalog.md').read_text(encoding='utf-8')
    check('总计' + str(len(rows) + len(supplements)) in doc, 'Published total differs from the catalog')
    table_rows = {}
    for line in doc.splitlines():
        if re.match(r'^\| `fw_art_\d+`', line):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            identity = re.fullmatch(r'`([^`]+)` (.+)', cells[0])
            check(identity is not None and identity[1] not in table_rows, 'Duplicate/malformed rendered table ID')
            table_rows[identity[1]] = (identity[2], cells)
    check(set(table_rows) == set(by_id), 'Markdown table must list all 283 selected reference arts')
    for row in rows:
        name, cells = table_rows[row['id']]
        project, reference = row['project'], row['reference']
        reach = str(project['range'][0]) if project['range'][0] == project['range'][1] else str(project['range'][0]) + '–' + str(project['range'][1])
        check(name == row['name'], 'Rendered name drift')
        check(cells[2] == '／'.join(signed(project[k]) for k in ('might', 'hit', 'crit')) and cells[3] == reach, 'Rendered parameter drift')
        check(cells[4].endswith('→' + str(project['cost'])) and row['effectSummary'] in cells[5], 'Rendered cost/effect drift')
        if row['variant'] == 'upgrade':
            parent_cost = by_id[project['unlock']['requiresArtId']]['project']['cost']
            if project['cost'] < parent_cost:
                check('相对基础版耐久'+str(parent_cost)+'→'+str(project['cost']) in cells[5], 'Durability-saving upgrade not documented')
        check(bool(cells[6]), 'Missing rendered learning channel')

    link_count = 0
    files = ['README.md', 'TODO.md', 'docs/00-game-design.md', 'docs/15-class-catalog.md', 'docs/22-equipment-catalog.md', 'docs/23-skill-catalog.md', 'docs/25-fortunes-weave-skills.md', 'docs/26-weapon-art-catalog.md']
    for name in files:
        path = ROOT / name
        text = path.read_text(encoding='utf-8')
        check('\ufffd' not in text and all(line == line.rstrip() for line in text.splitlines()), 'Encoding/whitespace issue: ' + name)
        table_width = None
        for line in text.splitlines():
            if line.startswith('|'):
                width = len(line.split('|'))
                check(table_width is None or width == table_width, 'Malformed Markdown table: ' + name)
                table_width = width
            else:
                table_width = None
        for target in re.findall(r'\]\(([^)]+)\)', text):
            if re.match(r'^[A-Za-z]+:', target) or target.startswith('#'):
                continue
            target = target.split('#')[0]
            check((path.parent / target).exists(), 'Missing local link: ' + name + ' -> ' + target)
            link_count += 1
    todo = (ROOT / 'TODO.md').read_text(encoding='utf-8')
    todo_ids = re.findall(r'^- \[[ x]\] \*\*([A-Z]+-\d+)\uFF5C', todo, re.M)
    check(len(todo_ids) == len(set(todo_ids)) == 60, 'Stable TODO IDs changed')
    if source_path:
        source = json.loads(source_path.read_text(encoding='utf-8-sig'))['arts']
        fingerprint = hashlib.sha256(json.dumps(source, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()
        check(fingerprint == catalog['source']['canonicalArtsSha256'], 'Source version differs; review rather than overwrite')
        source_by_id = {row['id']: row for row in source}
        check(set(source_by_id) == set(source_ids), 'Selected/excluded source IDs do not match the source')
        for row in rows:
            original = source_by_id[row['sourceId']]
            check(row['name'] == original['name'] and row['weapon'] == SOURCE_WEAPONS[original['weapon']], 'Source identity mismatch')
            check(row['reference'] == {key: original[key] for key in REFERENCE_FIELDS}, 'Source numeric/learning fields changed: ' + row['id'])
        print('PASS: 345 source IDs and all 283 original parameter/learning records match')
    print('PASS: 283 reference weapon arts (180 basic + 103 upgrades), 17 supplements, 300 total')
    print('PASS: prerequisites, costs, parameters, source gaps, examples, Markdown, ' + str(link_count) + ' local links and 60 TODO IDs')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=CATALOG)
    parser.add_argument('--source', type=Path)
    args = parser.parse_args()
    try:
        audit(args.catalog, args.source)
    except (ValueError, KeyError, IndexError) as error:
        raise SystemExit('FAIL: ' + str(error)) from error
