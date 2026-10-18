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


def wave_events(map_data: dict, asset: dict, used: set[tuple[int, int]]) -> list[dict]:
    median = sorted(e['level'] for e in map_data['enemies'])[len(map_data['enemies']) // 2]
    groups: list[tuple[int, dict]] = []
    for group in asset.get('unitGroups', []):
        turns = [int(r['kind'].split(':', 1)[1]) for r in group.get('references', [])
                 if isinstance(r.get('kind'), str) and r['kind'].startswith('turn:') and r['kind'][5:].isdigit()]
        turns = [t for t in turns if 2 <= t <= map_data['turnLimit']]
        enemies = [u for u in group.get('units', [])
                   if u.get('faction') == 'enemy' and u.get('positionStatus') == 'on-map']
        if turns and enemies:
            groups.append((min(turns), group))
    groups.sort(key=lambda pair: (pair[0], pair[1].get('id', '')))
    events: list[dict] = []
    for turn, group in groups[:2]:
        units = []
        for unit in group['units']:
            if unit.get('faction') != 'enemy' or unit.get('positionStatus') != 'on-map':
                continue
            pos = unit.get('position') or unit.get('entryPosition')
            if not pos:
                continue
            x, y = int(pos[0]), int(pos[1])
            if not passable(map_data['terrain'], x, y) or (x, y) in used:
                continue
            class_id = bc.project_class(unit, asset['source']['game'])
            units.append({'classId': class_id, 'pos': [x, y],
                          'levelOffset': max(-2, min(2, int(unit.get('level', median)) - median)),
                          'boss': False})
            used.add((x, y))
            if len(units) >= 3:
                break
        if units:
            events.append({
                'id': f'wave-{group.get("id", turn)}',
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
        sha = hashlib.sha256(source_path.read_bytes()).hexdigest() if source_path else None
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
            'adapterVersion': 'classic-adaptation-v1',
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
