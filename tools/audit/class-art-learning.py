"""Audit shared teaching plans, configured mastery thresholds and learning channels."""

import argparse
import collections
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / 'docs/data/fw-weapon-arts.json'
DOCUMENT = ROOT / 'docs/28-class-art-learning.md'
RETIRED = {'warrior', 'master_ninja', 'mechanist', 'war_cleric', 'elephant_rider'}
STUDY_WEAPON = {
    'sword': 'sword', 'lance': 'lance', 'axe': 'axe', 'bow': 'bow',
    'fist': 'fist', 'whiteMagic': 'staff', 'blackMagic': 'tome',
}
SUPPLEMENT_WEAPONS = {
    'wrath_cut': 'sword', 'ground_cut': 'sword', 'wind_sweep': 'sword',
    'tempest_thrust': 'lance', 'swift_thrusts': 'lance',
    'helm_breaker': 'axe', 'smash_blow': 'axe', 'axe_sweep': 'axe',
    'curved_shot': 'bow', 'deadeye_shot': 'bow', 'hunter_volley': 'bow',
    'armor_fist': 'fist', 'chariot_line': 'bow', 'spellblade_cut': 'sword',
    'dagger_disarm': 'dagger', 'beast_pounce': 'beast', 'dragon_pressure': 'dragon',
}
BANDS = ('foundation', 'core', 'advanced', 'upgrade')


def check(condition, message):
    if not condition:
        raise ValueError(message)


def load_classes():
    source = (ROOT / 'backend/common/data/classes.ts').read_text(encoding='utf-8')
    references = (ROOT / 'backend/common/data/class-reference.ts').read_text(encoding='utf-8')
    route_block = source.split('const REFERENCE_ROUTES:')[1].split('const PENDING_MECHANICS:')[0]
    routes = dict(re.findall(r"(\w+): '(\w+)'", route_block))
    classes = {}
    for line in re.findall(r'^  (\{.*\}),?$', references, re.M):
        row = json.loads(line)
        if row['id'] not in RETIRED:
            classes[row['id']] = {
                'name': row['name'], 'stage': row['stage'], 'route': routes[row['id']],
                'weapons': [STUDY_WEAPON[s] for s in row['skills'] if s in STUDY_WEAPON],
            }
    extra = source.split('const EXTRA_CLASSES = {')[1].split('} satisfies Record<string, ExtraClass>;')[0]
    pattern = r"^  (\w+): \{ name: '([^']+)', stage: (\d), route: '([^']+)'.*?weapons: \[([^\]]+)\]"
    for match in re.finditer(pattern, extra, re.M):
        identity, name, stage, route, weapons = match.groups()
        if identity not in RETIRED:
            classes[identity] = {
                'name': name, 'stage': int(stage), 'route': route,
                'weapons': re.findall(r"'(\w+)'", weapons),
            }
    check(len(classes) == 77, 'Runtime class catalog no longer contains 77 classes')
    return classes


def learned_rows(catalog):
    for row in catalog['arts']:
        if row['project']['unlock']['kind'] == 'class_mastery':
            yield row, row['project']['unlock'], row['weapon']
    for row in catalog['supplements']:
        yield row, row['learning'], SUPPLEMENT_WEAPONS[row['id']]
    for row in catalog.get('originalArts', []):
        yield row, row['project']['unlock'], row['weapon']


def compatible_weapons(row, weapon, adaptations):
    return set(row.get('project', {}).get('weaponCompatibility',
               [weapon, *adaptations.get(row['id'], {}).get('additionalWeaponTypes', [])]))


def audit_originals(catalog, classes):
    rows = catalog['originalArts']
    check(len(rows) == 15 and collections.Counter(r['weapon'] for r in rows) == {'dagger': 5, 'beast': 5, 'dragon': 5}, 'Expected five original arts per native weapon family')
    check(catalog['originalArtPolicy'] == {
        'provenance': 'project_original', 'balanceStatus': 'design_proposal',
        'durabilityPayment': 'once_per_valid_activation', 'invalidActivationCost': 0,
        'damageRounding': 'floor', 'grantNewWeaponPermissions': False,
        'grantExtraActions': False, 'petrifiedUnitsReceiveHealing': False,
        'petrifiedUnitsReceiveStatuses': False, 'deadOrPetrifiedStopsSequence': True,
        'triggerNestedAttackSkills': False,
    }, 'Original art resource/action/petrification boundary changed')
    effects = set()
    expected_effects = {
        'terrain_avoid_pierce', 'movement_debuff', 'ally_position_exchange',
        'counter_damage_reduction', 'speed_follow_up_suppression',
        'flanking_defense_pierce', 'faction_scent_mark', 'stationary_counter_guard',
        'movement_might_bonus', 'consume_scent_defense_pierce', 'ally_scale_barrier',
        'nonlethal_ember_tile', 'stationary_ranged_breath', 'split_breath_targets',
        'orthogonal_line_breath',
    }
    document = ROOT / 'docs/29-original-weapon-arts.md'
    text = document.read_text(encoding='utf-8')
    table = {}
    for line in text.splitlines():
        if line.startswith('| `fe_art_'):
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            identity = re.match(r'`([^`]+)` ', cells[0])[1]
            check(identity not in table, 'Duplicate original art table row')
            table[identity] = cells
    sections = re.split(r'^### `([^`]+)` ([^\n]+)\n', text, flags=re.M)
    details = {sections[i]: (sections[i + 1], sections[i + 2]) for i in range(1, len(sections), 3)}
    check(set(table) == set(details) == {r['id'] for r in rows}, 'Original art detail/table inventory differs')
    names = {'dagger': '短刀', 'sword': '剑', 'beast': '兽爪／兽石', 'dragon': '龙石／龙息'}
    for row in rows:
        identity = row['id']; p = row['project']; m = row['mechanics']
        check(re.fullmatch(r'fe_art_[a-z_]+', identity) and row['origin'] == 'project_original' and 'sourceId' not in row and 'reference' not in row, 'Original art falsely attributed to reference source')
        check(row['variant'] == 'base' and p['status'] == 'implemented', 'Original art implementation/upgrade claim differs')
        check(p['unlock']['weaponRank'] in ['E', 'D', 'C', 'B', 'A', 'S'], 'Unknown original art weapon proficiency')
        check(p['resource'] == 'weapon_durability' and type(p['cost']) is int and 1 <= p['cost'] <= 8, 'Original art durability must be one positive activation cost')
        check(all(type(p[k]) is int for k in ['might', 'hit', 'crit']) and -2 <= p['might'] <= 4 and -15 <= p['hit'] <= 15 and p['crit'] == 0, 'Original art baseline parameters exceed proposal bounds')
        check(len(p['range']) == 2 and all(type(n) is int for n in p['range']) and 1 <= p['range'][0] <= p['range'][1] <= 2, 'Original art range exceeds native proposal')
        expected = ['dagger', 'sword'] if row['weapon'] == 'dagger' else [row['weapon']]
        check(p['weaponCompatibility'] == expected, 'Original compatibility grants unrelated/spellbook weapons')
        check(p['sequence'] == 'no_speed_follow_up' and m['strikesPerTarget'] == 1 and m['rangeMode'] == 'weapon_intersection' and m['respectImmunity'] is True, 'Original art bypasses follow-up, range or immunity limits')
        check(m['maximumTargets'] in [1, 2] and m['critical'] in ['normal', 'disabled'] and m['counterPolicy'] in ['normal_primary_target', 'normal_nearest_target'], 'Original target/critical/counter policy invalid')
        if m['maximumTargets'] == 2:
            check(m['critical'] == 'disabled' and m['effect'] in ['split_breath_targets', 'orthogonal_line_breath'], 'Area art permits criticals or unbounded targeting')
        check(m['effect'] not in effects, 'Original art is only a renamed mechanic')
        effects.add(m['effect'])
        for field, value in m.items():
            if field.endswith('Percent'):
                check(type(value) is int and 0 <= value <= 100, 'Effect percentage outside 0-100')
        if 'defenseIgnorePercent' in m:
            check(0 < m['defenseIgnoredMax'] <= 12, 'Missing bounded defense pierce')
        if m['effect'] == 'nonlethal_ember_tile':
            check(m['damage'] == 3 and m['minimumRemainingHp'] == 1 and m['maximumTriggersPerUnitAction'] == 1 and m['stacking'] == 'refresh_only' and all(m[k] is False for k in ['affectsAllies', 'grantsExperience', 'triggersAttackSkills']), 'Ember can kill, stack or farm rewards')
        if m['effect'] == 'ally_position_exchange':
            check(m['refreshAction'] is False and m['requiresMobileSurvivors'] is True and m['destinationValidation'] == 'both_units' and m['selectionTiming'] == 'before_activation', 'Swap refreshes actions or bypasses mobility')
        if m['effect'] == 'speed_follow_up_suppression':
            check(m['duration'] == 'current_combat' and m['requiresHit'] is True and all(m[k] is False for k in ['cancelCounter', 'cancelFixedStrikes', 'cancelForcedFollowUp']), 'Follow-up suppression cancels unrelated attacks')
        if m['effect'] == 'consume_scent_defense_pierce':
            check(m['requiresFactionScentMark'] is True and m['consumeTiming'] == 'activation_before_accuracy' and m['receiveConsumedMarkBonus'] is False, 'Finisher no longer spends faction mark on miss')
        if 'reductionPercent' in m:
            check(m['affectedCounterHits'] == 1 and m['stacking'] == 'strongest_only' and m['combinedReductionCapPercent'] == 50, 'Counter reduction stacks or shields multiple hits')
        if m['effect'] == 'orthogonal_line_breath':
            check(m['lineLength'] == 2 and m['blocksOnWall'] is True and m['rejectFriendlyInLine'] is True and m['additionalWeaponEffects'] is False, 'Line breath bypasses terrain/friendly/effect limits')
        if m['effect'] == 'split_breath_targets':
            check(m['primaryDamagePercent'] == 100 and m['secondaryDamagePercent'] == 50 and m['secondaryAdjacentToPrimary'] is True and m['validateEveryTargetRange'] is True and m['secondaryWeaponEffects'] is False, 'Split breath target/damage limits changed')
        cells = table[identity]; learning = p['unlock']
        label = row['name'] + ('【限学】' if learning.get('learningScope') == 'restricted' else '')
        signed = lambda n: '+' + str(n) if n > 0 else str(n)
        reach = str(p['range'][0]) if p['range'][0] == p['range'][1] else str(p['range'][0]) + '–' + str(p['range'][1])
        check(cells == ['`' + identity + '` ' + label, '／'.join(names[w] for w in expected), learning['weaponRank'], str(p['cost']), '／'.join(signed(p[k]) for k in ['might', 'hit', 'crit']), reach, '、'.join(classes[c]['name'] for c in learning['classIds'])], 'Rendered original art parameters or teachers differ: ' + identity)
        name, body = details[identity]
        check(name == row['name'] and all(bool(row[k]) and row[k] in body for k in ['effectSummary', 'designIntent', 'balanceNotes']), 'Original effect/counterplay detail differs: ' + identity)
    check(effects == expected_effects, 'Original mechanical toolkit inventory differs')


def audit(catalog_path=CATALOG, document_path=DOCUMENT):
    catalog = json.loads(catalog_path.read_text(encoding='utf-8'))
    classes = load_classes()
    policy = catalog['learningPolicy']
    check(catalog['schemaVersion'] == 4, 'Expected original mastery catalog schema version 4')
    audit_originals(catalog, classes)
    check(policy['ordinarySource'] == 'class_mastery' and policy['upgradeSource'] == 'art_training', 'Mastery and training learning channels differ')
    check(policy['perClassArtRange'] == [4, 6] and policy['counting'] == 'individual_art_ids', 'Every basic and upgrade ID must count separately')
    check(policy['useRequiresLearningClass'] is False and policy['learnedSlotLimit'] == 5, 'Class-independent use or five slots changed')
    check(policy['masteryThresholds'] == 'stage_order_v1' and policy['classAssignments'] == 'implemented' and policy['trainingCosts'] == 'durability_v1', 'Mastery/training implementation status differs')
    check(policy['spellbookArts'] is False and 'specificClassLevels' not in policy, 'Spellbook adaptation or obsolete level learning remains')
    check(policy['minimumTeacherClasses'] == 2 and policy['restrictedTeacherRange'] == [1, 2] and policy['restrictionScope'] == 'learning_sources_only', 'Shared/restricted learning policy changed')
    rows = list(learned_rows(catalog))
    by_id = {row['id']: (row, learning, weapon) for row, learning, weapon in rows}
    check(len(rows) == len(by_id) == 176, 'Expected 176 distinct mastery art IDs')
    training = {row['id']: row for row in catalog['arts'] if row['project']['unlock']['kind'] == 'art_training'}
    grants = {row['id'] for row in catalog['arts'] if row['project']['unlock']['kind'] == 'equipment_grant'}
    check(len(training) == 103 and len(grants) == 36 and len(set(by_id) | set(training) | grants) == 315, 'Learning channels must partition 315 unique IDs')
    rules = {rule['baseArtId']: rule for rule in catalog['restrictedLearning']}
    check(len(rules) == len(catalog['restrictedLearning']) == 31 and set(rules) <= set(by_id), 'Restricted basic art inventory differs')
    for identity, rule in rules.items():
        check(rule['includeUpgrades'] is True and bool(rule['reason']), 'Missing upgrade prerequisite restriction or reason')
        check(1 <= len(rule['classIds']) == len(set(rule['classIds'])) <= 2 and set(rule['classIds']) <= set(classes), 'Powerful arts require one or two teachers')
    adaptations = {entry['baseArtId']: entry for entry in catalog['weaponAdaptations']}
    check(not adaptations and not catalog['weaponAdaptations'], 'Withdrawn generic adaptations reintroduced')
    check(all('weaponCompatibility' not in r['project'] for r in catalog['arts']), 'Reference art still has withdrawn native compatibility')
    topics = [identity for group in catalog['teachingGroups'] for identity in group['artIds']]
    check(len(topics) == len(set(topics)) == len(by_id) and set(topics) == set(by_id), 'Mastery topic groups omit or duplicate arts')
    for identity, adaptation in adaptations.items():
        extra = set(adaptation['additionalWeaponTypes'])
        check(bool(extra) and extra <= {'dagger', 'beast', 'dragon'}, 'Spellbook/staff or unrelated weapon adaptation added')
        check(set(adaptation['displayNames']) == extra and all(adaptation['displayNames'].values()), 'Missing adapted display name')
        check(adaptation['resource'] == 'weapon_durability' and adaptation['applyToUpgrade'] is True, 'Adaptation resource or upgrade compatibility changed')
    exceptions = {(entry['artId'], entry['classId']) for entry in catalog['crossTraining']}
    check(exceptions == {('dagger_disarm', 'thief')}, 'Unexpected cross-training exception')
    plans = {plan['classId']: plan for plan in catalog['classMasteryPlans']}
    check(len(plans) == len(catalog['classMasteryPlans']) == 77 and set(plans) == set(classes), 'Mastery plans must cover every canonical class')
    per_class = {}
    teachers = collections.defaultdict(list)
    for class_id, plan in plans.items():
        nodes = plan['nodes'];identities = [node['artId'] for node in nodes]
        if class_id in {'troubadour', 'valkyrie'}:
            check(not nodes and plan['reason'] == 'spellbook_arts_excluded', 'Pure spellbook class must not receive weapon arts')
        else:
            check(4 <= len(nodes) <= 6, 'Class has fewer than four or more than six individual arts: ' + class_id)
        check(len(identities) == len(set(identities)) and set(identities) <= set(by_id), 'Upgrade, grant or duplicate hidden in mastery plan: ' + class_id)
        for index, node in enumerate(nodes, 1):
            identity = node['artId']
            check(node['id'] == class_id + '-art-' + identity and node['order'] == index and node['masteryThreshold'] == 10 * max(1, classes[class_id]['stage']) * index, 'Mastery node identity/order/threshold differs')
            row, learning, weapon = by_id[identity]
            allowed = compatible_weapons(row, weapon, adaptations)
            check(bool(allowed & set(classes[class_id]['weapons'])) or (identity, class_id) in exceptions, 'Class lacks weapon compatibility: ' + class_id + '/' + identity)
            if weapon in {'beast', 'dragon'}:
                check(classes[class_id]['route'] == weapon, 'Species learning boundary violated')
            teachers[identity].append(class_id)
        per_class[class_id] = identities
    for identity, (row, learning, weapon) in by_id.items():
        check(learning['kind'] == 'class_mastery' and learning['masteryThresholdSource'] == 'classMasteryPlans' and learning['assignmentStatus'] == 'implemented', 'Invalid mastery learning metadata: ' + identity)
        check('classLevel' not in learning and 'requiresArtId' not in learning and row.get('variant') != 'upgrade', 'Level or upgrade counted in class mastery')
        check(len(learning['classIds']) == len(set(learning['classIds'])) and set(learning['classIds']) == set(teachers[identity]), 'Inverse teacher list differs from bounded plans: ' + identity)
        if identity in rules:
            rule = rules[identity]
            check(learning.get('learningScope') == 'restricted' and set(learning['classIds']) == set(rule['classIds']) and learning['restrictionReason'] == rule['reason'], 'Powerful art escaped its restricted teachers')
        else:
            check(learning.get('learningScope', 'shared') == 'shared' and len(learning['classIds']) >= 2, 'Common art has only one teacher or an undeclared restriction')
        if identity in adaptations:
            expected = [weapon, *adaptations[identity]['additionalWeaponTypes']]
            check(row['project']['weaponCompatibility'] == expected, 'Basic compatibility differs from explicit adaptation')
    for identity, row in training.items():
        learning = row['project']['unlock'];parent = learning['requiresArtId']
        check(row['variant'] == 'upgrade' and parent in by_id, 'Training upgrade lacks a mastery-learned prerequisite')
        check('classIds' not in learning and 'classLevel' not in learning, 'Training is incorrectly a class mastery reward')
        check(learning['originClassIds'] == by_id[parent][1]['classIds'], 'Training prerequisite teaching provenance differs')
        days = max(2, (row['project']['cost'] + 1) // 2)
        check(all(type(v) is int and v > 0 for v in learning['trainingCost'].values()), 'Training costs must be positive integers')
        check(learning['trainingCost'] == {'days': days, 'gold': days * 200} and learning['assignmentStatus'] == 'implemented', 'Training durability_v1 costs/status differ')
        if parent in rules:
            check(learning.get('learningScope') == 'restricted' and learning['restrictionReason'] == rules[parent]['reason'], 'Powerful training upgrade bypasses the restricted prerequisite')
        if parent in adaptations:
            expected = [row['weapon'], *adaptations[parent]['additionalWeaponTypes']]
            check(row['project']['weaponCompatibility'] == expected, 'Training upgrade lost physical weapon compatibility')

    text = document_path.read_text(encoding='utf-8')
    sections = re.split(r'^### ([^\n]+) / `([^`]+)`\n', text, flags=re.M)
    rendered = {}
    for index in range(1, len(sections), 3):
        name, class_id, body = sections[index:index + 3]
        body = body.split('\n## ')[0]
        check(class_id not in rendered and class_id in classes and name == classes[class_id]['name'], 'Unknown or duplicate rendered class')
        listed = re.findall(r'^\| (\d+) \| `([^`]+)` ([^|]+) \| [^|]+ \| 精通 (\d+) 点[^|]*\|$', body, re.M)
        check([identity for _, identity, _, _ in listed] == per_class[class_id], 'Rendered mastery reward list differs: ' + class_id)
        for ordinal, identity, label, threshold in listed:
            check(int(ordinal) <= len(per_class[class_id]), 'Invalid rendered mastery node')
            check(int(threshold) == plans[class_id]['nodes'][int(ordinal) - 1]['masteryThreshold'], 'Rendered mastery threshold differs: ' + class_id)
            row, _, weapon = by_id[identity]
            labels = {row['name'], *adaptations.get(identity, {}).get('displayNames', {}).values()}
            check(any(label.strip().startswith(candidate) for candidate in labels), 'Rendered mastery art label differs')
        rendered[class_id] = listed
    check(set(rendered) == set(classes), 'Missing canonical class section')
    index_text = text.split('## 4. ')[1].split('## 5. ')[0]
    index_rows = re.findall(r'^\| [^|]+ \| ([^|]+) `(\w+)` \| (\d+) \|$', index_text, re.M)
    check(len(index_rows) == 77 and {identity for _, identity, _ in index_rows} == set(classes), 'Class index differs')
    for name, identity, total in index_rows:
        check(name == classes[identity]['name'] and int(total) == len(per_class[identity]), 'Class index count differs')
    check('408条精通教学关联' in index_text and '176项职业精通' in text and '103项战技研修' in text, 'Learning route totals differ')
    restricted_text = text.split('### 强力战技的限制学习清单')[1].split('## 3. ')[0]
    restricted_lines = {m[1]: line for line in restricted_text.splitlines() if (m := re.match(r'^\| `([^`]+)`', line))}
    check(set(restricted_lines) == set(rules), 'Restricted overview differs')
    for identity, line in restricted_lines.items():
        check(rules[identity]['reason'] in line and '| ' + '、'.join(classes[c]['name'] for c in rules[identity]['classIds']) + ' |' in line, 'Restricted overview reason/teachers differ')
    width = None
    for line in text.splitlines():
        if line.startswith('|'):
            check(width is None or len(line.split('|')) == width, 'Malformed mastery table')
            width = len(line.split('|'))
        else:
            width = None
    check('\ufffd' not in text and all(line == line.rstrip() for line in text.splitlines()), 'Encoding or whitespace issue')
    for target in re.findall(r'\]\(([^)]+)\)', text):
        if re.match(r'^[A-Za-z]+:', target) or target.startswith('#'):
            continue
        check((document_path.parent / target.split('#')[0]).exists(), 'Broken document link: ' + target)
    counts = collections.Counter(len(identities) for identities in per_class.values())
    check(counts == {4: 7, 5: 28, 6: 40, 0: 2}, 'Unexpected bounded mastery distribution')
    check(sum(map(len, per_class.values())) == 408, 'Mastery teaching link total differs')
    print('PASS: 75 weapon/species classes each teach 4-6 distinct art IDs; two spellbook-only classes excluded')
    print('PASS: 176 mastery arts / 408 teaching links; 103 separate training upgrades; 36 equipment grants; 315 total')
    print('PASS: 15 original mechanics, native weapon limits, 31 restricted arts, common sharing, five slots and rendered plans')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--catalog', type=Path, default=CATALOG)
    parser.add_argument('--document', type=Path, default=DOCUMENT)
    args = parser.parse_args()
    try:
        audit(args.catalog, args.document)
    except (ValueError, KeyError, IndexError) as error:
        raise SystemExit('FAIL: ' + str(error)) from error
