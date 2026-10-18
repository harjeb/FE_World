"""Audit task IDs, evidence links and honest release-validation status."""

import collections
import json
import re
from pathlib import Path
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[2]
COUNTS = {
    'SETUP': 6, 'CLASS': 7, 'ITEM': 7, 'QUEST': 9, 'ARENA': 5, 'STORY': 3,
    'UI': 4, 'AGENT': 4, 'DATA': 5, 'BAL': 4, 'DESIGN': 9, 'DOC': 2,
}
BEADS = {
    'SETUP': 'fe-world-8n4', 'CLASS': 'fe-world-bwo', 'ITEM': 'fe-world-07k',
    'QUEST': 'fe-world-v8x', 'ARENA': 'fe-world-z2w', 'STORY': 'fe-world-lzy',
    'UI': 'fe-world-ilq', 'AGENT': 'fe-world-7rv', 'DATA': 'fe-world-7m0',
    'BAL': 'fe-world-gwd', 'DESIGN': 'fe-world-mze', 'DOC': 'fe-world-mze',
}
EXTERNAL = {'LOAD-01': 'fe-world-load', 'PLAY-01': 'fe-world-play', 'OPS-01': 'fe-world-ops'}


def check(condition, message):
    if not condition:
        raise ValueError(message)


def audit():
    todo = (ROOT / 'TODO.md').read_text(encoding='utf-8')
    items = re.findall(r'^- \[([ x])\] \*\*([A-Z]+-\d{2})[｜|]', todo, re.M)
    expected = {f'{group}-{i:02}' for group, count in COUNTS.items() for i in range(1, count + 1)}
    check(len(items) == len(expected) == 65, 'Expected exactly 65 implementation/design/documentation IDs')
    check({identity for _, identity in items} == expected, 'Task IDs are missing, duplicated or unexpected')
    check({identity for status, identity in items if status == ' '} == {'BAL-04'}, 'BAL-04 must remain partial; all other first-release items have evidence')
    check(collections.Counter(identity.split('-')[0] for _, identity in items) == COUNTS, 'Per-group task counts differ')

    closure = (ROOT / 'docs/34-task-closure.md').read_text(encoding='utf-8')
    for group, count in COUNTS.items():
        pattern = rf'^\| {group} \| {count} \| `{BEADS[group]}` \|'
        check(re.search(pattern, closure, re.M), f'Missing evidence matrix row: {group}')
    for commit in ('8c70086', 'dca536b', 'f0232c3'):
        check(commit in closure, f'Missing delivered commit: {commit}')

    rows = [json.loads(line) for line in (ROOT / '.beads/issues.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    issues = {row['id']: row for row in rows}
    check(len(issues) == len(rows), 'Duplicate Beads issue ID')
    for group, identity in BEADS.items():
        expected_status = 'open' if group == 'BAL' else 'closed'
        issue = issues.get(identity, {})
        check(issue.get('status') == expected_status, f'{identity} must be {expected_status}')
        if expected_status == 'closed':
            check(issue.get('closed_at') and issue.get('close_reason'), f'Missing closure evidence: {identity}')
    for row in rows:
        for dependency in row.get('dependencies', []):
            target = dependency.get('depends_on_id', dependency.get('id'))
            check(target in issues, f'Dangling dependency in {row["id"]}')

    record = (ROOT / 'docs/35-release-validation-record.md').read_text(encoding='utf-8')
    for identity, bead in EXTERNAL.items():
        check(issues.get(bead, {}).get('status') == 'open', f'Actual validation remains unexecuted: {bead}')
        check(re.search(rf'^\| {identity} [^|]+\| `{bead}` \| 未执行 \| 0 \|', record, re.M), f'Missing honest execution record: {identity}')
    check({row['id'] for row in rows if row['status'] != 'closed'} == {'fe-world-gwd', *EXTERNAL.values()}, 'Unexpected open issues: reconcile the task/evidence records')

    links = 0
    paths = [ROOT / 'README.md', ROOT / 'TODO.md', *sorted((ROOT / 'docs').glob('*.md'))]
    for path in paths:
        for target in re.findall(r'\[[^\]\n]*\]\(([^)\n]+)\)', path.read_text(encoding='utf-8')):
            target = target.split(' "')[0].strip('<>')
            if re.match(r'^[a-zA-Z][\w+.-]*:', target) or target.startswith(('#', '//')):
                continue
            relative = unquote(target.split('#')[0].split('?')[0])
            if not relative:
                continue
            check((path.parent / relative).exists(), f'Broken local file link in {path.relative_to(ROOT)}: {target}')
            links += 1
    print('PASS: 65 stable IDs, 64 completed first-release items, BAL-04 partial; 12 evidence groups')
    print('PASS: Beads closures/dependencies and three unexecuted release-validation records agree')
    print(f'PASS: {links} local file links in {len(paths)} Markdown documents')


if __name__ == '__main__':
    audit()
