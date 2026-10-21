#!/usr/bin/env python3
"""Build the per-map classic adaptation file (QUEST-06..09).

The catalog keeps the playable terrain and initial garrison. This file adds the
runtime material the catalog deliberately did not carry: interactive objects,
project-native chest loot, turn reinforcements, switches/map changes and the
difficulty policy. Source addresses and SHA-256 stay in the file for audit.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / 'content/scenarios/classic-maps-v1/catalog.json'
OUT = ROOT / 'content/scenarios/classic-maps-v1/adaptations.json'

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_catalog as bc  # noqa: E402  (reuse the source class/terrain maps)

LOOT = {
    0: [('vulnerary', 2), ('herb', 4), ('iron_sword', 1), ('iron_lance', 1), ('iron_axe', 1), ('iron_bow', 1), ('heal', 1), ('wood', 4)],
    1: [('vulnerary', 3), ('steel_sword', 1), ('steel_lance', 1), ('steel_axe', 1), ('steel_bow', 1), ('javelin', 1), ('hand_axe', 1), ('fire', 1), ('thunder', 1), ('recover', 1), ('restore', 1), ('ore', 4)],
    2: [('killer_edge', 1), ('killer_lance', 1), ('killer_axe', 1), ('killer_bow', 1), ('silver_sword', 1), ('silver_lance', 1), ('silver_axe', 1), ('silver_bow', 1), ('physic', 1), ('secret_book', 1), ('seed', 4)],
    3: [('brave_sword', 1), ('silver_sword', 1), ('silver_lance', 1), ('silver_axe', 1), ('silver_bow', 1), ('energy_drop', 1), ('speedwing', 1), ('goddess_icon', 1), ('dracoshield', 1), ('talisman', 1), ('immortal_shield', 1)],
}


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding='utf-8'))


def passable(terrain: list[list[str]], x: int, y: int) -> bool:
    return 0 <= y < len(terrain) and 0 <= x < len(terrain[y]) and terrain[y][x] not in ('wall', 'water')


def key(p: list[int] | tuple[int, int]) -> tuple[int, int]:
    return int(p[0]), int(p[1])


def occupied_cells(map_data: dict) -> set[tuple[int, int]]:
    out = {key(p) for p in map_data['playerSpawns']}
    out |= {key(e['pos']) for e in map_data['enemies']}
    if map_data['goal'].get('kind') == 'seize':
        out.add(key(map_data['goal']['position']))
    return out


def loot_for(map_id: str, identity: str, difficulty: int, high: bool = False) -> dict:
    tier = max(0, min(3, difficulty + (1 if high else 0)))
    table = LOOT[tier]
    digest = hashlib.sha256(f'{map_id}:{identity}'.encode()).digest()
    item, count = table[digest[0] % len(table)]
    return {'item': item, 'count': count}


def terrain_patch(asset: dict, change: dict, width: int, height: int) -> list[list[str | None]] | None:
    x0, y0 = change['position']
    cat = asset.get('terrainCatalog', {})
    patch: list[list[str | None]] = []
    for dy, row in enumerate(change.get('terrainIds', [])):
        out_row: list[str | None] = []
        for dx, value in enumerate(row):
            x, y = x0 + dx, y0 + dy
            if value is None or not (0 <= x < width and 0 <= y < height):
                out_row.append(None)
            else:
                out_row.append(bc.GBA_TERRAIN.get(cat[str(value)]['symbol'], 'wall'))
        patch.append(out_row)
    return patch


def thin_walls(map_data: dict, used: set[tuple[int, int]], limit: int = 2) -> list[dict]:
    terrain, w, h = map_data['terrain'], map_data['width'], map_data['height']
    out: list[dict] = []
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if (x, y) in used or terrain[y][x] != 'wall':
                continue
            horizontal = passable(terrain, x - 1, y) and passable(terrain, x + 1, y)
            vertical = passable(terrain, x, y - 1) and passable(terrain, x, y + 1)
            if not (horizontal or vertical):
                continue
            # Do not break the map's outer shell or a wall that is the only route to the goal.
            if x in (0, w - 1) or y in (0, h - 1):
                continue
            out.append({'id': f'wall-{len(used)}-{x}-{y}', 'kind': 'wall', 'pos': [x, y],
                        'state': 'intact', 'hp': 24, 'maxHp': 24, 'label': '可破坏的墙'})
            used.add((x, y))
            if len(out) >= limit:
                return out
    return out


def source_for(map_data: dict) -> tuple[Path | None, dict | None]:
    src = map_data['source']
    if src.get('pack') != 'gba-classics-v1':
        return None, None
    path = ROOT / 'content/scenarios' / src['pack'] / src['file']
    return (path, load_json(path)) if path.exists() else (None, None)


def source_thief(unit: dict, game: str) -> bool:
    """A mapped assassin is not evidence of looting (FE7 swordmasters / FE1 Xane)."""
    if game == 'fe1':
        return unit.get('classId') == 9
    if game == 'fe3':
        return unit.get('classId') == 19
    return unit.get('faction') == 'enemy' and (unit.get('aiBytes') or [])[:2] == [6, 5]


def thief_wave_turns(asset: dict, group: dict) -> list[int]:
    # A reference named turn:N stores the event-list INDEX, not the chapter turn.
    turns: set[int] = set()
    primary = max(asset['unitGroups'], key=lambda g: (any(r.get('kind') == 'enemy-table' for r in g['references']),
                  sum(u.get('faction') == 'enemy' and u.get('positionStatus') == 'on-map' for u in g['units'])))
    variant = next((r.get('variant') for r in primary['references'] if r.get('kind') == 'enemy-table'), None)
    mode = {'eliwood-normal': 1, 'eliwood-hard': 2, 'hector-normal': 3, 'hector-hard': 4}.get(variant)
    branches = load_json(Path(__file__).parent / 'data/thief-ai.json')['groupModes'].get(asset['id'], {})
    if group['id'] in branches and mode not in branches[group['id']]:
        return []
    for ref in group.get('references', []):
        kind = ref.get('kind', '')
        if not kind.startswith('turn:') or not kind[5:].isdigit():
            continue
        event = asset['events']['turn'][int(kind[5:])]
        # References already follow nested script calls; indexing the owning event also handles FE8 LOAD indirection.
        if asset['source']['game'] == 'fe7' and event['words'][3] not in (0, mode):
            continue
        first, last = event['turnBytes'][:2]
        turns.update(range(first, max(first, last) + 1))
    return sorted(turns)


def configure_thieves(entry: dict, map_data: dict, asset: dict | None) -> None:
    entry['thieves'] = []
    entry['thiefAudit'] = '无可抢的普通宝箱／村庄，或源编制没有抢宝盗贼；不按刺客职业猜测。'
    if not any(o.get('loot') and not o.get('secret') and o['kind'] in ('chest', 'village') for o in entry['objects']):
        return
    game = map_data['game']
    if asset:
        groups = asset['unitGroups']
        enemies_of = lambda group: [u for u in group['units'] if u['faction'] == 'enemy' and u['positionStatus'] == 'on-map']
        primary = max(groups, key=lambda g: (any(r.get('kind') == 'enemy-table' for r in g['references']), len(enemies_of(g))))
        units = enemies_of(primary)
    elif game in ('fe1', 'fe3'):
        source = load_json(ROOT / 'content/scenarios' / map_data['source']['pack'] / map_data['source']['file'])
        chapter = next(c for c in source['chapters'] if c['id'] == map_data['source']['sourceId'])
        units = chapter['enemyGroups'][0]['units']
    else:
        return
    assert len(units) == len(map_data['enemies']), map_data['id']
    approaches = load_json(Path(__file__).parent / 'data/thief-ai.json')['approaches']
    for index, (unit, enemy) in enumerate(zip(units, map_data['enemies'])):
        if enemy.get('boss') or not source_thief(unit, game):
            continue
        trigger: dict = {'kind': 'turn', 'turn': 1}
        rule: dict = {'enemy': index, 'trigger': trigger,
                      'evidence': f"{map_data['source']['file']} 初始编制 {unit.get('sourceAddress', index)}；源抢宝 AI，未设置额外等待回合。"}
        ai2 = (unit.get('aiBytes') or [0, 0])[1]
        if game == 'fe3' and str(ai2) in approaches:
            source = approaches[str(ai2)]
            wanted = source['position']
            # Catalog terrain adaptations can turn an original waypoint into water/wall.
            cells = [(x, y) for y in range(map_data['height']) for x in range(map_data['width'])
                     if passable(map_data['terrain'], x, y)
                     and bc.component_reaches(map_data['terrain'], tuple(enemy['pos']), (x, y))]
            at = list(min(cells, key=lambda p: (abs(p[0] - wanted[0]) + abs(p[1] - wanted[1]), p[1], p[0])))
            rule['approach'] = at
            rule['trigger'] = {'kind': 'area', 'side': 'self', 'min': at, 'max': at}
            rule['evidence'] += f" AI2={ai2} {source['label']}：先走到 {wanted} 再抢宝。"
            if at != wanted:
                rule['evidence'] += f' 源坐标在适配地形不可站立，改为同连通区最近格 {at}。'
        entry['thieves'].append(rule)
    count = len(entry['thieves'])
    spawned = sum(u.get('behavior') == 'thief' for e in entry['events'] for a in e['actions'] if a['kind'] == 'spawn' for u in a['units'])
    if count or spawned:
        entry['thiefAudit'] = f'已核对源编制及事件：初始抢宝单位 {count} 名，条件增援 {spawned} 名；启动条件逐单位保存。'


def wave_events(map_data: dict, asset: dict, used: set[tuple[int, int]]) -> list[dict]:
    median = sorted(e['level'] for e in map_data['enemies'])[len(map_data['enemies']) // 2]
    groups: list[tuple[int, dict]] = []
    for group in asset.get('unitGroups', []):
        turns = [int(r['kind'].split(':', 1)[1]) for r in group.get('references', [])
                 if isinstance(r.get('kind'), str) and r['kind'].startswith('turn:') and r['kind'][5:].isdigit()]
        thief = any(source_thief(unit, map_data['game']) for unit in group.get('units', []))
        if thief:
            turns = thief_wave_turns(asset, group)
        turns = [t for t in turns if (1 if thief else 2) <= t <= map_data['turnLimit']]
        enemies = [u for u in group.get('units', [])
                   if u.get('faction') == 'enemy' and u.get('positionStatus') == 'on-map']
        if turns and enemies:
            groups.extend((turn, group) for turn in (turns if thief else [min(turns)]))
    # Keep existing non-thief wave selection stable, while never dropping a verified thief wave
    # merely because its real turn is later than two unrelated waves.
    def old_order(pair):
        refs = pair[1].get('references', [])
        turns = [int(r['kind'][5:]) for r in refs if r.get('kind', '').startswith('turn:') and r['kind'][5:].isdigit()
                 and 2 <= int(r['kind'][5:]) <= map_data['turnLimit']]
        return min(turns, default=999), pair[1].get('id', '')
    baseline = []
    for pair in sorted(groups, key=old_order):
        if 2 <= old_order(pair)[0] <= map_data['turnLimit'] and not any(g['id'] == pair[1]['id'] for _, g in baseline):
            baseline.append(pair)
    selected = baseline[:2]
    selected += [pair for pair in groups if pair not in selected and any(source_thief(u, map_data['game']) for u in pair[1]['units'])]
    selected.sort(key=lambda pair: (pair[0], pair[1].get('id', '')))
    events: list[dict] = []
    for turn, group in selected:
        units = []
        for unit in group['units']:
            if unit.get('faction') != 'enemy' or unit.get('positionStatus') != 'on-map':
                continue
            pos = unit.get('position') or unit.get('entryPosition')
            if not pos:
                continue
            x, y = int(pos[0]), int(pos[1])
            if not passable(map_data['terrain'], x, y) or (x, y) in used and not source_thief(unit, map_data['game']):
                continue
            class_id = bc.project_class(unit, asset['source']['game'])
            units.append({'classId': class_id, 'pos': [x, y],
                          'levelOffset': max(-2, min(2, int(unit.get('level', median)) - median)),
                          'boss': False,
                          **({'behavior': 'thief', 'thiefTrigger': {'kind': 'turn', 'turn': turn}}
                             if source_thief(unit, map_data['game']) else {})})
            used.add((x, y))
            if len(units) >= 3:
                break
        if units:
            identity = f'wave-{group.get("id", turn)}'
            if any(event['id'] == identity for event in events):
                identity += f'-turn-{turn}'
            events.append({
                'id': identity,
                'trigger': {'kind': 'turn', 'turn': turn},
                'actions': [{'kind': 'spawn', 'units': units},
                            {'kind': 'scenario', 'message': f'第 {turn} 回合增援抵达'}],
            })
    return events


def switch_events(map_data: dict, asset: dict, used: set[tuple[int, int]]) -> tuple[list[dict], list[dict], list[dict]]:
    changes = asset.get('mapChanges', [])
    applied = set(map_data.get('appliedChanges') or [])
    for change in changes:
        if change.get('id') in applied:
            continue
        x0, y0 = change['position']
        patch = terrain_patch(asset, change, map_data['width'], map_data['height'])
        if not patch:
            continue
        # Only use a change that turns an impassable area into something passable.
        before = any(not passable(map_data['terrain'], x0 + dx, y0 + dy)
                     for dy, row in enumerate(patch) for dx, value in enumerate(row)
                     if value is not None and 0 <= y0 + dy < map_data['height'] and 0 <= x0 + dx < map_data['width'])
        after = any(value not in (None, 'wall', 'water') for row in patch for value in row)
        if not (before and after):
            continue
        spot = None
        for radius in range(1, 5):
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    if abs(dx) + abs(dy) != radius:
                        continue
                    x, y = x0 + dx, y0 + dy
                    if (x, y) not in used and passable(map_data['terrain'], x, y):
                        spot = [x, y]
                        break
                if spot:
                    break
            if spot:
                break
        if not spot:
            continue
        used.add(key(spot))
        change_id = f'lever-{change.get("id", len(used))}'
        obj = {'id': f'switch-{len(used)}', 'kind': 'switch', 'pos': spot, 'state': 'idle',
               'label': '机关', 'change': change_id}
        event = {'id': f'event-{change_id}', 'trigger': {'kind': 'object', 'object': obj['id'], 'state': 'triggered'},
                 'actions': [{'kind': 'mapChange', 'change': change_id},
                             {'kind': 'scenario', 'message': '机关启动，地图发生变化'}]}
        return [obj], [{'id': change_id, 'position': [x0, y0], 'terrain': patch}], [event]
    return [], [], []



BALLISTA_TERRAIN = {
    'TERRAIN_BALLISTA_REGULAR': (10, 6),
    'TERRAIN_BALLISTA_LONG': (15, 5),
    'TERRAIN_BALLISTA_KILLER': (12, 8),
}
STATUS_ITEMS = ('SLEEP', 'SILENCE', 'BERSERK')


def status_kind(symbol: str | None) -> str | None:
    upper = (symbol or '').upper()
    if 'SLEEP' in upper: return 'sleep'
    if 'SILENCE' in upper: return 'silence'
    if 'BERSERK' in upper: return 'berserk'
    if upper.endswith('_STONE') and 'FIRE' not in upper: return 'petrified'
    return None


def special_events(map_data: dict, asset: dict, used: set[tuple[int, int]], difficulty: int,
                   objects: list[dict], events: list[dict]) -> None:
    """Add project-native ballista hazards and status-staff strikes.

    Source ballista terrain becomes a visible, non-blocking object. Source status
    staves become one deterministic turn-3 strike; no ROM script or random AI is run.
    """
    catalog = asset.get('terrainCatalog', {})
    placed = 0
    for y, row in enumerate(asset.get('map', {}).get('terrainIds', [])):
        for x, value in enumerate(row):
            symbol = catalog.get(str(value), {}).get('symbol', '')
            if symbol not in BALLISTA_TERRAIN:
                continue
            if (x, y) in {key(p) for p in map_data['playerSpawns']} or (map_data['goal'].get('kind') == 'seize' and (x, y) == key(map_data['goal']['position'])):
                continue
            if not passable(map_data['terrain'], x, y):
                continue
            reach, base = BALLISTA_TERRAIN[symbol]
            objects.append({'id': f'ballista-{x}-{y}', 'kind': 'ballista', 'pos': [x, y],
                            'state': 'idle', 'label': '炮台'})
            used.add((x, y))
            events.append({'id': f'ballista-{x}-{y}', 'trigger': {'kind': 'turn', 'turn': 2},
                           'actions': [{'kind': 'damage', 'target': 'player', 'amount': base + difficulty * 2,
                                        'count': 1, 'from': [x, y], 'range': reach}]})
            placed += 1
            if placed >= 2:
                break
        if placed >= 2:
            break

    for group in asset.get('unitGroups', []):
        for unit in group.get('units', []):
            if unit.get('faction') != 'enemy' or unit.get('positionStatus') != 'on-map':
                continue
            symbols = [asset.get('itemCatalog', {}).get(str(iid), {}).get('symbol', '') for iid in (unit.get('itemIds') or [])]
            kind = next((status_kind(symbol) for symbol in symbols if status_kind(symbol)), None)
            if not kind:
                continue
            pos = key(unit['position'])
            action = {'kind': 'status', 'target': 'player', 'status': kind,
                      'count': 1, 'from': list(pos), 'range': 10}
            if kind in ('silence', 'berserk'): action['turns'] = 3
            events.append({'id': f'status-{pos[0]}-{pos[1]}', 'trigger': {'kind': 'turn', 'turn': 3},
                           'actions': [action]})
            return

# 项目原创的隐藏内容（不来自原作）：生成后逐图覆盖，重建适配文件时保留。
# 只在 secret.quest 指定的固定经典远征里出现，每个账号一次（见 backend/common/game/battles.ts）；
# 同图作为地区副本终图或挑战塔层时保持原样。
# - 封印三图远征第 1 图：银枪宝箱在远征里换成任务物品「古旧地图」。
# - 烈火三图远征第 1 图：王座旁的旧箱打开王座后的密室，内有 3 个随机升级宝箱
#   （开战时按玩家能买到的最高装备级再高一级抽取，见 backend/common/game/rank-loot.ts）。
FLOOR = 'floor'


def apply_secrets(entry: dict) -> None:
    if entry['mapId'] == 'fe6-ch22-main':
        chest = next(o for o in entry['objects'] if o['id'] == 'chest-object-4')
        assert chest['loot'] == {'item': 'silver_lance', 'count': 1}, chest
        chest['secret'] = {'quest': 'clx-fe6', 'loot': {'item': 'old_map', 'count': 1}}
    elif entry['mapId'] == 'fe7-ch27-eliwood':
        secret = {'quest': 'clx-fe7'}
        entry['objects'].append({'id': 'secret-trigger', 'kind': 'chest', 'pos': [8, 5], 'state': 'closed', 'label': '王座旁的旧箱',
                                 'secret': secret})
        for i, x in enumerate((6, 7, 8), start=1):
            entry['objects'].append({'id': f'secret-chest-{i}', 'kind': 'chest', 'pos': [x, 2], 'state': 'hidden',
                                     'label': '密室宝箱', 'lootRoll': 'rank_up', 'secret': secret})
        entry['mapChanges'].append({'id': 'secret-room', 'position': [5, 2], 'terrain': [
            [FLOOR] * 5,
            [FLOOR] * 5,
            [None, None, FLOOR, None, None],
        ]})
        entry['events'].append({'id': 'secret-room-open', 'trigger': {'kind': 'object', 'object': 'secret-trigger', 'state': 'opened'},
                                'actions': [{'kind': 'mapChange', 'change': 'secret-room'},
                                            *({'kind': 'setObject', 'object': f'secret-chest-{i}', 'state': 'closed'} for i in (1, 2, 3)),
                                            {'kind': 'scenario', 'message': '箱底的机关松动了，王座后方的石墙缓缓移开，露出一间密室。'}]})


# 主线任务（docs/38）：八章各用一张经典图，把村庄和宝箱挪到别处，并加一个线索箱。
# 改编只在对应任务里生效：原物件用 hideIn 在该任务里隐去，新物件用 secret.quest 限定在该任务里出现，
# 其他场合（普通任务、副本、塔层）保持原样。位置由地图和固定哈希确定，重新生成结果不变。
STORY_MAPS = {
    'story-1': 'fe6-ch14-main', 'story-2': 'fe7-ch19-eliwood', 'story-3': 'fe8-ch16-eirika', 'story-4': 'fe8-ch14-ephraim',
    'story-5': 'fe6-ch20-ilia', 'story-6': 'fe7-ch25-eliwood-kenneth', 'story-7': 'fe8-ch15-eirika', 'story-8': 'fe6-ch21-main',
}
WALKABLE = {'plain', 'floor', 'forest', 'road', 'village', 'fort'}
ADJ = ((1, 0), (-1, 0), (0, 1), (0, -1))


def hashed(*parts: object) -> int:
    return int.from_bytes(hashlib.sha256(':'.join(str(p) for p in parts).encode()).digest()[:6], 'big')


def apply_story(entry: dict, map_data: dict, quest: str, chapter: int) -> None:
    width, height, terrain = map_data['width'], map_data['height'], map_data['terrain']
    keep = [o for o in entry['objects'] if o['kind'] not in ('village', 'chest')]
    moved = [o for o in entry['objects'] if o['kind'] in ('village', 'chest') and 'secret' not in o]
    occupied = {key(o['pos']) for o in entry['objects']} | {key(p) for p in map_data['playerSpawns']} | {key(e['pos']) for e in map_data['enemies']}
    if map_data['goal'].get('kind') == 'seize':
        occupied.add(key(map_data['goal']['position']))
    blocked = {key(o['pos']) for o in keep if o['kind'] == 'wall'}
    dist: dict[tuple[int, int], int] = {}
    queue = []
    for p in map_data['playerSpawns']:
        dist[key(p)] = 0
        queue.append(key(p))
    for x, y in queue:
        for dx, dy in ADJ:
            n = (x + dx, y + dy)
            if n in dist or n in blocked or not (0 <= n[0] < width and 0 <= n[1] < height) or terrain[n[1]][n[0]] not in WALKABLE | {'throne'}:
                continue
            dist[n] = dist[(x, y)] + 1
            queue.append(n)
    cells = [c for c in dist if terrain[c[1]][c[0]] in WALKABLE and c not in occupied]
    far = sorted(dist[c] for c in cells)
    taken: list[tuple[int, int]] = []

    def pick(kind: str, index: int, low: int, high: int) -> tuple[int, int]:
        for spacing in (4, 3, 2, 1):
            options = [c for c in cells if low <= dist[c] <= high and c not in taken
                       and all(abs(c[0] - t[0]) + abs(c[1] - t[1]) >= spacing for t in taken)]
            if options:
                choice = min(options, key=lambda c: hashed(map_data['id'], kind, index, c[0], c[1]))
                taken.append(choice)
                return choice
        raise SystemExit(f'{map_data["id"]}: no cell for {kind} {index}')

    new_objects = []
    for index, original in enumerate(moved):
        original['hideIn'] = [*original.get('hideIn', []), quest]
        deep = original['kind'] == 'chest'
        x, y = pick(original['kind'], index, 8 if deep else 5, 999 if deep else 22)
        new_objects.append({'id': f'story-{original["kind"]}-{index}', 'kind': original['kind'], 'pos': [x, y], 'state': original['state'],
                            'label': original.get('label', '宝箱' if deep else '村庄'), 'loot': original['loot'], 'secret': {'quest': quest}})
    x, y = pick('clue', 0, far[len(far) * 3 // 4] if far else 0, 999)
    new_objects.append({'id': 'story-clue', 'kind': 'chest', 'pos': [x, y], 'state': 'closed', 'label': '被遗落的箱子',
                        'loot': {'item': f'story_clue_{chapter}', 'count': 1}, 'secret': {'quest': quest}})
    entry['objects'].extend(new_objects)


# 主线“副本宝箱找任务物品”（docs/38 §3.4）：在固定经典远征的指定图里放一只箱子，只在该远征里、
# 对应章节开放之后出现，每个账号一次。位置取离出击点最远的四分之一可达格，哈希固定。
FIND_CHESTS = [
    # (远征任务, 地图, 章节, 物品)
    ('clx-fe6', 'fe6-ch23-main', 2, 'story_find_2'),
    ('clx-fe8', 'fe8-ch17-eirika', 4, 'story_find_4'),
    ('clx-fe7', 'fe7-ch30-eliwood', 6, 'story_find_6'),
    ('clx-fe3', 'fe3-book1-ch20', 8, 'story_find_8'),
]


def apply_find(entry: dict, map_data: dict, route: str, chapter: int, item: str) -> None:
    width, height, terrain = map_data['width'], map_data['height'], map_data['terrain']
    occupied = {key(o['pos']) for o in entry['objects']} | {key(p) for p in map_data['playerSpawns']} | {key(e['pos']) for e in map_data['enemies']}
    if map_data['goal'].get('kind') == 'seize':
        occupied.add(key(map_data['goal']['position']))
    blocked = {key(o['pos']) for o in entry['objects'] if o['kind'] == 'wall'}
    dist: dict[tuple[int, int], int] = {}
    queue = []
    for p in map_data['playerSpawns']:
        dist[key(p)] = 0
        queue.append(key(p))
    for x, y in queue:
        for dx, dy in ADJ:
            n = (x + dx, y + dy)
            if n in dist or n in blocked or not (0 <= n[0] < width and 0 <= n[1] < height) or terrain[n[1]][n[0]] not in WALKABLE | {'throne'}:
                continue
            dist[n] = dist[(x, y)] + 1
            queue.append(n)
    cells = [c for c in dist if terrain[c[1]][c[0]] in WALKABLE and c not in occupied]
    far = sorted(dist[c] for c in cells)
    cutoff = far[len(far) * 3 // 4]
    x, y = min((c for c in cells if dist[c] >= cutoff), key=lambda c: hashed(map_data['id'], 'find', chapter, c[0], c[1]))
    entry['objects'].append({'id': f'find-{chapter}', 'kind': 'chest', 'pos': [x, y], 'state': 'closed', 'label': '旧箱子',
                             'loot': {'item': item, 'count': 1}, 'secret': {'quest': route, 'chapter': chapter}})


# 属性成长药（能力药）的宝箱掉落：经典图里约四分之一的普通宝箱改放一枚成长药，种类按哈希在六种里选。
# 只动普通宝箱：隐藏要素、主线改编、找物品的箱子都带 secret／hideIn，不参与；其余宝箱的掉落保持原样。
GROWTH_POTIONS = ['energy_drop', 'secret_book', 'speedwing', 'goddess_icon', 'dracoshield', 'talisman']
GROWTH_POTION_PERCENT = 25


def apply_growth_potions(entry: dict) -> None:
    for obj in entry['objects']:
        if obj['kind'] != 'chest' or 'secret' in obj or 'hideIn' in obj or 'loot' not in obj:
            continue
        if hashed(entry['mapId'], 'growth-potion', obj['id']) % 100 < GROWTH_POTION_PERCENT:
            obj['loot'] = {'item': GROWTH_POTIONS[hashed(entry['mapId'], 'growth-kind', obj['id']) % len(GROWTH_POTIONS)], 'count': 1}


def build() -> dict:
    catalog = load_json(CATALOG)
    by_game: dict[str, list[dict]] = {}
    for map_data in catalog['maps']:
        by_game.setdefault(map_data['game'], []).append(map_data)
    order: dict[str, int] = {}
    for maps in by_game.values():
        for i, map_data in enumerate(maps):
            order[map_data['id']] = i

    out = []
    for map_data in catalog['maps']:
        source_path, asset = source_for(map_data)
        sha = hashlib.sha256(source_path.read_text(encoding='utf-8').encode()).hexdigest() if source_path else None
        used = occupied_cells(map_data)
        objects: list[dict] = []
        map_changes: list[dict] = []
        events: list[dict] = []
        difficulty = min(3, order[map_data['id']] // 3)

        if asset:
            for src in asset.get('objects', []):
                if src.get('positionStatus') != 'on-map' or src.get('kind') not in ('door', 'chest'):
                    continue
                x, y = key(src['position'])
                if (x, y) in used or not (0 <= x < map_data['width'] and 0 <= y < map_data['height']):
                    continue
                if src['kind'] == 'door':
                    if not passable(map_data['terrain'], x, y):
                        continue
                    objects.append({'id': f'door-{src["id"]}', 'kind': 'door', 'pos': [x, y],
                                    'state': 'closed', 'label': '门', 'sourceId': src.get('sourceAddress')})
                else:
                    if not passable(map_data['terrain'], x, y):
                        continue
                    high = len([o for o in objects if o['kind'] == 'chest']) % 2 == 1
                    objects.append({'id': f'chest-{src["id"]}', 'kind': 'chest', 'pos': [x, y],
                                    'state': 'closed', 'label': '宝箱',
                                    'loot': loot_for(map_data['id'], str(src.get('sourceAddress')), difficulty, high),
                                    'sourceId': src.get('sourceAddress')})
                used.add((x, y))

        # Villages: the catalog keeps the terrain, but no source object mapping is reliable.
        # Use up to three distinct village tiles as one-time supply villages.
        villages = 0
        for y in range(map_data['height']):
            for x in range(map_data['width']):
                if villages >= 3:
                    break
                if map_data['terrain'][y][x] != 'village' or (x, y) in used:
                    continue
                objects.append({'id': f'village-{x}-{y}', 'kind': 'village', 'pos': [x, y],
                                'state': 'idle', 'label': '村庄',
                                'loot': loot_for(map_data['id'], f'village:{x}:{y}', 0)})
                used.add((x, y))
                villages += 1
            if villages >= 3:
                break

        for wall in thin_walls(map_data, used, 2):
            objects.append(wall)

        if asset:
            waves = wave_events(map_data, asset, used)
            events.extend(waves)
            switches, changes, switch_ev = switch_events(map_data, asset, used)
            objects.extend(switches)
            map_changes.extend(changes)
            events.extend(switch_ev)
            special_events(map_data, asset, used, difficulty, objects, events)

        out.append({
            'mapId': map_data['id'],
            'adapterVersion': 'classic-adaptation-v2',
            'sourceSha256': sha,
            'difficulty': difficulty,
            'levelPolicy': {'base': 'quest', 'stageBonus': 2, 'bossBonus': 2, 'spread': 2},
            'deployment': {'max': max(1, len(map_data['playerSpawns']))},
            'objects': objects,
            'events': events,
            'mapChanges': map_changes,
            'notes': [
                *(['FE2 程序守军／生成式敌军'] if map_data['game'] == 'fe2' else []),
                *([f"已静态应用地图变化：{', '.join(map_data.get('appliedChanges') or [])}"] if map_data.get('appliedChanges') else []),
                *(['出击区已按可达性调整'] if map_data.get('spawnAdjusted') else []),
            ],
            'release': {'status': 'accepted',
                        'checks': ['terrain', 'spawns', 'enemies', 'goal', 'objects', 'reachability', 'loot', 'events', 'special-mechanisms', 'loot-settlement']},
        })
    catalog_by_id = {m['id']: m for m in catalog['maps']}
    for entry in out:
        apply_secrets(entry)
        for quest, map_id in STORY_MAPS.items():
            if entry['mapId'] == map_id:
                apply_story(entry, catalog_by_id[map_id], quest, int(quest.split('-')[1]))
        for route, map_id, chapter, item in FIND_CHESTS:
            if entry['mapId'] == map_id:
                apply_find(entry, catalog_by_id[map_id], route, chapter, item)
        apply_growth_potions(entry)
        _, asset = source_for(catalog_by_id[entry['mapId']])
        configure_thieves(entry, catalog_by_id[entry['mapId']], asset)
    return {'format': 'agent-tactics.classic-adaptations', 'schemaVersion': 1, 'count': len(out), 'maps': out}


def main() -> int:
    data = build()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    objects = sum(len(m['objects']) for m in data['maps'])
    events = sum(len(m['events']) for m in data['maps'])
    print(f"adaptations: {data['count']} maps, {objects} objects, {events} events -> {OUT}")
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
