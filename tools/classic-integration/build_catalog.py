#!/usr/bin/env python3
"""Build one playable catalog from the extracted GBA / FC / SFC classic maps.

Source packs keep their own schemas. This script performs the documented adaptation:
terrain is mapped onto the project's terrain set, source classes are substituted with
project classes, and only the initial enemy group of a chapter becomes its garrison.
"""
from __future__ import annotations

import json
from pathlib import Path
import sys

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'content/scenarios/classic-maps-v1/catalog.json'
FE2_TILESET = ROOT / 'tools/classic-integration/data/fe2-buildings.png'

# GBA terrain symbols -> project terrain.
GBA_TERRAIN = {
    'TERRAIN_PLAINS': 'plain', 'TERRAIN_ROAD': 'road', 'TERRAIN_BRIDGE_REGULAR': 'bridge',
    'TERRAIN_BRIDGE_SNAG': 'bridge', 'TERRAIN_VILLAGE_REGULAR': 'village',
    'TERRAIN_VILLAGE_CLOSED': 'village', 'TERRAIN_HOUSE': 'village', 'TERRAIN_ARMORY': 'village',
    'TERRAIN_VENDOR': 'village', 'TERRAIN_ARENA_REGULAR': 'village', 'TERRAIN_FORT': 'fort',
    'TERRAIN_FOREST': 'forest', 'TERRAIN_THICKET': 'forest', 'TERRAIN_MOUNTAIN': 'mountain',
    'TERRAIN_PEAK': 'mountain', 'TERRAIN_CLIFF': 'mountain', 'TERRAIN_RIVER': 'water',
    'TERRAIN_LAKE': 'water', 'TERRAIN_SEA': 'water', 'TERRAIN_FLOOR_REGULAR': 'floor',
    'TERRAIN_FLOOR_MAGIC': 'floor', 'TERRAIN_STAIRS': 'floor', 'TERRAIN_RUINS_REGULAR': 'floor',
    'TERRAIN_RUINS_VILLAGE': 'village', 'TERRAIN_DECK': 'floor', 'TERRAIN_THRONE': 'throne',
    'TERRAIN_WALL_REGULAR': 'wall', 'TERRAIN_WALL_DAMAGED': 'wall', 'TERRAIN_PILLAR': 'wall',
    'TERRAIN_MAST': 'wall', 'TERRAIN_ROOF': 'wall', 'TERRAIN_FENCE_REGULAR': 'wall',
    'TERRAIN_SNAG': 'water', 'TERRAIN_BARREL': 'wall', 'TERRAIN_BONE': 'wall', 'TERRAIN_BRACE': 'wall',
    'TERRAIN_DOOR': 'floor', 'TERRAIN_GATE_CASTLE': 'floor', 'TERRAIN_GATE_REGULAR': 'floor',
    'TERRAIN_CHEST_FULL': 'floor', 'TERRAIN_CHEST_EMPTY': 'floor', 'TERRAIN_BALLISTA_REGULAR': 'floor',
    'TERRAIN_BALLISTA_LONG': 'floor', 'TERRAIN_BALLISTA_KILLER': 'floor', 'TERRAIN_TILE_2C': 'wall',
    'TERRAIN_TILE_2E': 'wall', 'TERRAIN_NONE': 'wall', 'TERRAIN_DARK': 'plain',
    'TERRAIN_DESERT': 'plain', 'TERRAIN_SAND': 'plain', 'TERRAIN_GLACIER': 'plain',
    'TERRAIN_GUNNELS': 'floor',
}

GBA_CLASS = {
    'ROY': 'swordsman', 'EIRIKA_LORD': 'swordsman', 'EPHRAIM_LORD': 'lancer',
    'EIRIKA_MASTER_LORD': 'swordmaster', 'EPHRAIM_MASTER_LORD': 'sentinel', 'LORD': 'swordsman',
    'MERCENARY': 'mercenary', 'HERO': 'hero', 'FIGHTER': 'fighter', 'WARRIOR': 'hero',
    'BRIGAND': 'fighter', 'PIRATE': 'fighter', 'BERSERKER': 'berserker', 'ARMOR': 'knight',
    'ARMOR_KNIGHT': 'knight', 'GENERAL': 'general', 'CAVALIER': 'cavalier', 'PALADIN': 'paladin',
    'GREAT_KNIGHT': 'great_knight', 'PEGASUS_KNIGHT': 'pegasus', 'FALCON_KNIGHT': 'falcon',
    'WYVERN_RIDER': 'dragon_knight', 'WYVERN_LORD': 'dragon_commander', 'DRACO_ZOMBIE': 'dragonkin',
    'ARCHER': 'archer', 'SNIPER': 'sniper', 'RANGER': 'forest_knight', 'NOMAD': 'bow_knight',
    'MAGE': 'mage', 'MAGE_KNIGHT': 'mage_knight', 'SAGE': 'sage', 'SHAMAN': 'druid', 'DRUID': 'druid',
    'CLERIC': 'cleric', 'PRIEST': 'cleric', 'MONK': 'cleric', 'BISHOP': 'bishop',
    'TROUBADOUR': 'valkyrie', 'VALKYRIE': 'valkyrie', 'THIEF': 'thief', 'ROGUE': 'assassin',
    'ASSASSIN': 'assassin', 'MYRMIDON': 'swordsman', 'SWORDMASTER': 'swordmaster',
    'DANCER': 'dancer', 'MANAKETE': 'dragonkin', 'MANAKETE_MYRRH': 'dragonkin',
    'MANAKETE_2': 'dragonkin', 'CIVILIAN_F1': 'commoner', 'CIVILIAN_F2': 'commoner',
    'CIVILIAN_F3': 'commoner', 'CIVILIAN_M1': 'commoner', 'CIVILIAN_M2': 'commoner',
    'SOLDIER': 'lancer', 'SUPPLY': 'commoner', 'QUEEN': 'sage', 'KING': 'general',
    'REVENANT': 'fighter', 'BONEWALKER': 'fighter', 'BONEWALKER_BOW': 'archer', 'WIGHT': 'fighter',
    'WIGHT_BOW': 'archer', 'BAEL': 'dragonkin', 'ELDER_BAEL': 'dragonkin', 'MAUTHEDOOG': 'dragonkin',
    'GARGOYLE': 'dragon_knight', 'DEATHGOYLE': 'dragon_knight', 'CYCLOPS': 'general',
    'GWYLLGI': 'dragonkin', 'MOGALL': 'mage', 'ARCH_MOGALL': 'mage', 'GORGON': 'druid',
    'NECROMANCER': 'druid', 'ENTOUMBED': 'fighter', 'FALLEN_PEER': 'general', 'MAELDUIN': 'dragon_lord',
    'ARCHSAGE': 'sage', 'PUPIL': 'mage', 'RECRUIT': 'lancer', 'TARVOS': 'lancer',
    'OBSTACLE': 'wall', 'CLERIC_F': 'cleric',
}

FE1_CLASS = {
    'Cavalier': 'cavalier', 'Knight': 'knight', 'Pegasus Knight': 'pegasus', 'Paladin': 'paladin',
    'Dracoknight': 'dragon_knight', 'Mercenary': 'mercenary', 'Fighter': 'fighter', 'Pirate': 'fighter',
    'Thief': 'thief', 'Hero': 'hero', 'Archer': 'archer', 'Hunter': 'archer',
    'Ballistician': 'archer', 'Horseman': 'bow_knight', 'Sniper': 'sniper', 'Commando': 'assassin',
    'Mamkute': 'dragonkin', 'Mage': 'mage', 'Priest': 'cleric', 'Bishop': 'bishop',
    'Lord': 'swordsman', 'General': 'general',
}

FE3_CLASS_ORDER = [
    'LORD', 'FIGHTER', 'SOLDIER', 'CAVALIER', 'PALADIN', 'KNIGHT', 'KNIGHT', 'ARMOUR_KNIGHT',
    'GENERAL', 'PEGASUS_KNIGHT', 'WYVERN_RIDER', 'HUNTER', 'SNIPER', 'ARCHER', 'HORSEMAN',
    'MANAKETE', 'FIRE_DRAGON', 'MERCENARY', 'HERO', 'THIEF', 'FREELANCER', 'DANCER', 'CLERIC',
    'MAGE', 'BISHOP', 'MAGE', 'BISHOP', 'BISHOP', 'MANAKETE', 'BRIGAND', 'PIRATE', 'BARBARIAN',
    'BERSERKER', 'DARK_KNIGHT', 'DARK_MAGE', 'BALLISTICIAN', 'EMPEROR', 'GUARDIAN', 'ICE_DRAGON',
    'SEA_DRAGON',
]
FE3_CLASS = {
    'LORD': 'swordsman', 'FIGHTER': 'fighter', 'SOLDIER': 'lancer', 'CAVALIER': 'cavalier',
    'PALADIN': 'paladin', 'KNIGHT': 'knight', 'ARMOUR_KNIGHT': 'knight', 'GENERAL': 'general',
    'PEGASUS_KNIGHT': 'pegasus', 'WYVERN_RIDER': 'dragon_knight', 'HUNTER': 'archer',
    'SNIPER': 'sniper', 'ARCHER': 'archer', 'HORSEMAN': 'bow_knight', 'MANAKETE': 'dragonkin',
    'FIRE_DRAGON': 'dragonkin', 'MERCENARY': 'mercenary', 'HERO': 'hero', 'THIEF': 'thief',
    'FREELANCER': 'mercenary', 'DANCER': 'dancer', 'CLERIC': 'cleric', 'MAGE': 'mage',
    'BISHOP': 'bishop', 'BRIGAND': 'fighter', 'PIRATE': 'fighter', 'BARBARIAN': 'fighter',
    'BERSERKER': 'berserker', 'DARK_KNIGHT': 'dark_knight', 'DARK_MAGE': 'druid',
    'BALLISTICIAN': 'archer', 'EMPEROR': 'general', 'GUARDIAN': 'general',
    'ICE_DRAGON': 'dragonkin', 'SEA_DRAGON': 'dragonkin',
}

FE3_TERRAIN = {
    'へいげん': 'plain', 'みち': 'road', 'かわ': 'water', 'もり': 'forest', 'はし': 'bridge',
    'たかいやま': 'mountain', 'やま': 'mountain', 'むら門': 'village', 'みんか': 'village',
    'うみ': 'water', 'さばく': 'plain', 'たき': 'water', 'マグマ': 'wall', 'とりで': 'fort',
    '城': 'fort', '地形26': 'wall', '地形27': 'wall', '地形28': 'wall', '地形29': 'wall',
    '地形30': 'wall', '地形31': 'wall',
}

# FE1 terrain ids: kept on the project side by nearest movement profile where the
# source label was not certain. These cover every id used by chapters 16-25.
FE1_TERRAIN = {
    0: 'road', 2: 'plain', 3: 'forest', 4: 'mountain', 5: 'mountain', 6: 'water', 7: 'water',
    8: 'bridge', 9: 'village', 10: 'fort', 11: 'plain', 12: 'floor', 13: 'wall', 15: 'wall',
    16: 'village', 17: 'village', 18: 'floor', 20: 'plain', 21: 'plain',
}


def apply_map_change(terrain, change, catalog):
    x0, y0 = change['position']
    for dy, row in enumerate(change['terrainIds']):
        for dx, value in enumerate(row):
            if value is None:
                continue
            y, x = y0 + dy, x0 + dx
            if 0 <= y < len(terrain) and 0 <= x < len(terrain[0]):
                terrain[y][x] = GBA_TERRAIN.get(catalog[str(value)]['symbol'], 'wall')


def change_contains(change, position):
    x0, y0 = change['position']
    x, y = position
    return x0 <= x < x0 + change['width'] and y0 <= y < y0 + change['height']



def load_gba() -> list[dict]:
    base = ROOT / 'content/scenarios/gba-classics-v1'
    manifest = json.loads((base / 'manifest.json').read_text(encoding='utf-8'))
    maps = []
    for entry in manifest['scenarios']:
        asset = json.loads((base / entry['file']).read_text(encoding='utf-8'))
        w, h = asset['map']['width'], asset['map']['height']
        cat = asset['terrainCatalog']
        terrain = [[GBA_TERRAIN.get(cat[str(v)]['symbol'], 'wall') for v in row] for row in asset['map']['terrainIds']]
        groups = asset['unitGroups']
        def enemies_of(group):
            return [u for u in group['units'] if u['faction'] == 'enemy' and u['positionStatus'] == 'on-map']
        primary = max(groups, key=lambda g: (any(r.get('kind') == 'enemy-table' for r in g['references']), len(enemies_of(g))))
        enemies = []
        for unit in enemies_of(primary):
            symbol = (unit['classSymbol'] or '').replace('JID_', '').replace('CLASS_', '')
            enemies.append({'classId': GBA_CLASS.get(symbol, 'fighter'), 'level': max(1, unit['level']),
                            'pos': list(unit['position'])})
        deploy = [u for g in groups for r in g['references'] if r.get('kind') == 'deployment-table'
                  for u in g['units'] if u['faction'] == 'player' and u['positionStatus'] == 'on-map']
        if not deploy:
            # 少数章节（如封印 22 章）的玩家组没有 deployment-table 引用，但单位本身带地图坐标。
            deploy = [u for g in groups for u in g['units']
                      if u['faction'] == 'player' and u['positionStatus'] == 'on-map']
        spawns = []
        for u in deploy:
            p = list(u['position'])
            if p not in spawns: spawns.append(p)
        spawns = spawns[:8]
        seize = next((o['position'] for o in asset['objects'] if o['kind'] == 'seize' and o['positionStatus'] == 'on-map'), None)
        applied_changes = []
        if seize and spawns and not any(component_reaches(terrain, tuple(spawn), tuple(seize)) for spawn in spawns):
            # 部分章节（如封印 22 章）初始图覆盖着屋顶，或王座区被门/墙隔开；
            # 集成版不执行门事件，因此尝试应用能打通道路的地图变化并记为适配。
            changes = list(asset.get('mapChanges', []))
            changes.sort(key=lambda change: not change_contains(change, seize))
            for change in changes:
                trial = [row[:] for row in terrain]
                apply_map_change(trial, change, cat)
                if any(component_reaches(trial, tuple(spawn), tuple(seize)) for spawn in spawns):
                    terrain = trial
                    applied_changes.append(change['id'])
                    break
        boss_index = 0
        if enemies:
            if seize:
                boss_index = min(range(len(enemies)), key=lambda i: abs(enemies[i]['pos'][0] - seize[0]) + abs(enemies[i]['pos'][1] - seize[1]))
            else:
                boss_index = max(range(len(enemies)), key=lambda i: enemies[i]['level'])
            enemies[boss_index]['boss'] = True
        maps.append({'id': asset['id'], 'game': asset['source']['game'],
                     'name': asset['name'], 'width': w, 'height': h, 'terrain': terrain,
                     'playerSpawns': spawns, 'enemies': enemies,
                     'goal': {'kind': 'seize', 'position': list(seize)} if seize else {'kind': 'boss'},
                     'turnLimit': 30, 'adapted': bool(applied_changes),
                     'appliedChanges': applied_changes or None,
                     'source': {'pack': 'gba-classics-v1', 'file': entry['file'], 'sourceId': asset['id']}})
    return maps


def load_fe1() -> list[dict]:
    path = ROOT / 'content/scenarios/classic-fc-sfc-v1/fe1/scenarios.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    names = {}
    class_list = ROOT / 'tools/classic-integration/data/fe1-class-list.txt'
    if class_list.exists():
        for line in class_list.read_text(encoding='utf-8', errors='replace').splitlines():
            bits = line.split(maxsplit=1)
            if len(bits) == 2:
                names[int(bits[0], 16)] = bits[1].strip()
    maps = []
    for chapter in data['chapters']:
        w, h = chapter['map']['width'], chapter['map']['height']
        terrain = [[FE1_TERRAIN.get(v, 'wall') for v in row] for row in chapter['map']['terrainIds']]
        units = chapter['enemyGroups'][0]['units'] if chapter['enemyGroups'] else []
        enemies = [{'classId': FE1_CLASS.get(names.get(u['classId'], ''), 'fighter'), 'level': max(1, u['level']),
                    'pos': list(u['position'])} for u in units]
        boss_index = max(range(len(enemies)), key=lambda i: enemies[i]['level']) if enemies else -1
        if boss_index >= 0:
            enemies[boss_index]['boss'] = True
        goal_pos = next((e['pos'] for e in enemies if e.get('boss')), None)
        spawns = free_spawns(terrain, enemies, 8, goal_pos)
        maps.append({'id': chapter['id'], 'game': 'fe1', 'name': chapter['name'],
                     'width': w, 'height': h, 'terrain': terrain, 'playerSpawns': spawns, 'enemies': enemies,
                     'goal': {'kind': 'boss'} if enemies else {'kind': 'rout'}, 'turnLimit': 30,
                     'source': {'pack': 'classic-fc-sfc-v1', 'file': 'fe1/scenarios.json', 'sourceId': chapter['id']}})
    return maps


def load_fe3() -> list[dict]:
    path = ROOT / 'content/scenarios/classic-fc-sfc-v1/fe3/scenarios.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    maps = []
    for chapter in data['chapters']:
        w, h = chapter['map']['width'], chapter['map']['height']
        cat = chapter['terrainCatalog']
        terrain = [[FE3_TERRAIN.get(cat[str(v)]['label'], 'wall') for v in row] for row in chapter['map']['terrainIds']]
        groups = chapter['enemyGroups']
        initial = next((group for group in groups if group.get('id') == 'initial'), None)
        units = initial['units'] if initial else (max((group['units'] for group in groups), key=len) if groups else [])
        enemies = []
        for unit in units:
            name = FE3_CLASS_ORDER[unit['classId']] if unit['classId'] < len(FE3_CLASS_ORDER) else 'FIGHTER'
            enemies.append({'classId': FE3_CLASS.get(name, 'fighter'), 'level': max(1, unit['level']),
                            'pos': list(unit['position'])})
        boss_index = max(range(len(enemies)), key=lambda i: enemies[i]['level']) if enemies else -1
        if boss_index >= 0:
            enemies[boss_index]['boss'] = True
        boss_pos = next((e['pos'] for e in enemies if e.get('boss')), None)
        goal = chapter['goal']
        if goal.get('kind') == 'seize':
            throne = next((b for b in chapter.get('buildings', []) if b.get('kind') == 4), None)
            goal = {'kind': 'seize', 'position': list(throne['position'])} if throne else {'kind': 'boss'}
        spawns = [list(u['position']) for u in chapter['playerUnits'] if u['position'] != [0, 0]][:8]
        goal_pos = goal.get('position') or boss_pos
        reachable = spawns and goal_pos and any(component_reaches(terrain, tuple(s), tuple(goal_pos)) for s in spawns)
        if len(spawns) < 4 or not reachable:
            spawns = free_spawns(terrain, enemies, 8, goal_pos)
        maps.append({'id': chapter['id'], 'game': 'fe3', 'name': chapter['name'],
                     'width': w, 'height': h, 'terrain': terrain, 'playerSpawns': spawns, 'enemies': enemies,
                     'goal': goal, 'turnLimit': 30,
                     'source': {'pack': 'classic-fc-sfc-v1', 'file': 'fe3/scenarios.json', 'sourceId': chapter['id']}})
    return maps


def passable(terrain: list[list[str]], x: int, y: int) -> bool:
    return 0 <= y < len(terrain) and 0 <= x < len(terrain[0]) and terrain[y][x] not in ('wall', 'water')


def component_reaches(terrain: list[list[str]], start, goal) -> bool:
    if not passable(terrain, start[0], start[1]) or not passable(terrain, goal[0], goal[1]):
        return False
    h, w = len(terrain), len(terrain[0])
    seen = {start}
    queue = [start]
    for cx, cy in queue:
        if (cx, cy) == goal:
            return True
        for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and passable(terrain, nx, ny):
                seen.add((nx, ny))
                queue.append((nx, ny))
    return False


def components(terrain: list[list[str]]) -> list[list[tuple[int, int]]]:
    h, w = len(terrain), len(terrain[0])
    seen: set[tuple[int, int]] = set()
    out = []
    for y in range(h):
        for x in range(w):
            if (x, y) in seen or not passable(terrain, x, y):
                continue
            comp, queue = [], [(x, y)]
            seen.add((x, y))
            for cx, cy in queue:
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and passable(terrain, nx, ny):
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            out.append(comp)
    return out


def free_spawns(terrain: list[list[str]], enemies: list[dict], count: int, goal=None) -> list[list[int]]:
    occupied = {tuple(e['pos']) for e in enemies}
    comps = components(terrain)
    target = None
    if goal and 0 <= goal[1] < len(terrain) and 0 <= goal[0] < len(terrain[0]) and passable(terrain, goal[0], goal[1]):
        target = next((comp for comp in comps if tuple(goal) in comp), None)
    if target is None and comps:
        target = max(comps, key=len)
    cells = [cell for cell in (target or []) if cell not in occupied]
    enemy_center = (sum(p['pos'][0] for p in enemies) / max(1, len(enemies)),
                    sum(p['pos'][1] for p in enemies) / max(1, len(enemies)))
    cells.sort(key=lambda p: -(abs(p[0] - enemy_center[0]) + abs(p[1] - enemy_center[1])))
    chosen = []
    for cell in cells:
        if all(abs(cell[0] - c[0]) + abs(cell[1] - c[1]) > 0 for c in chosen):
            chosen.append(cell)
        if len(chosen) >= count:
            break
    return [list(c) for c in chosen]



def fe2_color(px, tile_id: int) -> tuple[int, int, int]:
    x, y = (tile_id % 16) * 16, (tile_id // 16) * 16
    r = g = b = n = 0
    for yy in range(16):
        for xx in range(16):
            pr, pg, pb, pa = px[x + xx, y + yy]
            if pa > 128:
                r += pr; g += pg; b += pb; n += 1
    return (r // max(1, n), g // max(1, n), b // max(1, n))


def fe2_tile_terrain(px, tile_id: int) -> str:
    r, g, b = fe2_color(px, tile_id)
    high, low = max(r, g, b), min(r, g, b)
    if b > r + 20 and b > g + 10:
        return 'water'
    if high < 55:
        return 'wall'
    if g > r + 15 and g > b + 15:
        return 'plain'
    if high - low < 22:
        return 'floor'
    return 'plain'


def load_fe2() -> list[dict]:
    """FE2 只保留了地图格与图块编号：地形按图块颜色映射，守军是项目适配生成。"""
    path = ROOT / 'content/scenarios/classic-fc-sfc-v1/fe2/scenarios.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    image = Image.open(FE2_TILESET).convert('RGBA')
    px = image.load()
    classes = ['fighter', 'archer', 'knight', 'mercenary', 'mage', 'cavalier', 'pegasus']
    maps = []
    for index, chapter in enumerate(data['chapters']):
        w, h = chapter['map']['width'], chapter['map']['height']
        terrain = [[fe2_tile_terrain(px, value) for value in row] for row in chapter['map']['tileIds']]
        comps = components(terrain)
        if not comps:
            raise SystemExit(f"{chapter['id']}: no passable terrain")
        cells = max(comps, key=len)
        # 出击区放在可通行主区域的左上侧，守军从对侧进入，保证双方同一连通域。
        spawn_cells = sorted(cells, key=lambda p: p[0] + p[1])[:min(8, len(cells))]
        spawns = [list(c) for c in spawn_cells]
        occupied = {tuple(c) for c in spawn_cells}
        pool = [c for c in sorted(cells, key=lambda p: -(p[0] + p[1])) if c not in occupied]
        count = min(len(pool), 8 + index % 5)
        enemies = []
        for slot in range(count):
            cell = pool[slot * max(1, len(pool) // max(1, count)) % max(1, len(pool))]
            while cell in occupied:
                cell = pool[(pool.index(cell) + 1) % len(pool)]
            occupied.add(cell)
            boss = slot == 0
            enemies.append({'classId': 'general' if boss else classes[slot % len(classes)],
                            'level': 5 + index * 2 + (2 if boss else slot % 3), 'pos': list(cell), 'boss': boss})
        maps.append({'id': chapter['id'], 'game': 'fe2', 'name': f'外传 · 古战场 {index + 1:02d}',
                     'width': w, 'height': h, 'terrain': terrain, 'playerSpawns': spawns, 'enemies': enemies,
                     'goal': {'kind': 'boss'}, 'turnLimit': 30, 'adapted': True,
                     'source': {'pack': 'classic-fc-sfc-v1', 'file': 'fe2/scenarios.json', 'sourceId': chapter['id'],
                                'note': 'FE2 原始敌军表未恢复；地形按图块颜色映射，守军按项目规则生成'}})
    return maps


def nearest_passable(terrain, pos, blocked):
    h, w = len(terrain), len(terrain[0])
    candidates = [(x, y) for y in range(h) for x in range(w)
                  if passable(terrain, x, y) and (x, y) not in blocked]
    if not candidates:
        return list(pos)
    return list(min(candidates, key=lambda p: abs(p[0] - pos[0]) + abs(p[1] - pos[1])))


def expand_spawns(terrain, spawns, enemies, need=8):
    blocked = {tuple(e['pos']) for e in enemies}
    chosen = [list(p) for p in spawns if tuple(p) not in blocked]
    seen = {tuple(p) for p in chosen}
    queue = list(chosen)
    for x, y in queue:
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if len(chosen) >= need:
                return chosen
            if (nx, ny) in seen or (nx, ny) in blocked or not passable(terrain, nx, ny):
                continue
            seen.add((nx, ny)); chosen.append([nx, ny])
    return chosen


def normalize_map(m):
    """Make every exported map playable: passable spawns/enemies, a real goal
    position, and at least one deployment cell in the goal's connected component."""
    terrain = m['terrain']
    w, h = m['width'], m['height']
    occupied = set()
    for enemy in m['enemies']:
        x, y = enemy['pos']
        if not (0 <= x < w and 0 <= y < h) or not passable(terrain, x, y) or (x, y) in occupied:
            enemy['pos'] = nearest_passable(terrain, enemy['pos'], occupied)
        occupied.add(tuple(enemy['pos']))
    boss = next((enemy for enemy in m['enemies'] if enemy.get('boss')), None)
    if m['goal'].get('kind') == 'seize':
        position = m['goal'].get('position')
        if not position:
            raise SystemExit(f"{m['id']}: seize goal without position")
        x, y = position
        terrain[y][x] = 'throne'
    else:
        goal_pos = tuple(boss['pos']) if boss else None
        if goal_pos is None:
            m['goal'] = {'kind': 'rout'}
    spawns, seen = [], set()
    for spawn in m['playerSpawns']:
        x, y = spawn
        if 0 <= x < w and 0 <= y < h and passable(terrain, x, y) and (x, y) not in occupied and (x, y) not in seen:
            seen.add((x, y)); spawns.append([x, y])
    spawns = expand_spawns(terrain, spawns, m['enemies'], 8)
    goal_pos = tuple(m['goal']['position']) if m['goal'].get('kind') == 'seize' else (tuple(boss['pos']) if boss else None)
    reachable = goal_pos and any(component_reaches(terrain, tuple(spawn), goal_pos) for spawn in spawns)
    if not spawns or not reachable:
        spawns = free_spawns(terrain, m['enemies'], 8, goal_pos)
        m['spawnAdjusted'] = True
        m['adapted'] = True
    m['playerSpawns'] = spawns[:8]
    return m


def main() -> int:
    maps = [normalize_map(m) for m in load_gba() + load_fe1() + load_fe3() + load_fe2()]
    for m in maps:
        if not m['playerSpawns']:
            raise SystemExit(f"{m['id']}: no player spawns")
        for e in m['enemies']:
            x, y = e['pos']
            if not (0 <= x < m['width'] and 0 <= y < m['height']):
                raise SystemExit(f"{m['id']}: enemy outside map")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'format': 'agent-tactics.classic-maps', 'schemaVersion': 1,
                               'count': len(maps), 'maps': maps}, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    by_game = {}
    for m in maps:
        by_game[m['game']] = by_game.get(m['game'], 0) + 1
    print(f"catalog: {len(maps)} maps {by_game} -> {OUT}")
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
