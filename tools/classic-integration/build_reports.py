#!/usr/bin/env python3
"""Build the classic class map and per-template adaptation report.

FE7 stores enemy classes as numeric IDs with almost no symbol annotations.  This
script records the numeric ID, the source class-table address/raw record, the
project replacement and its review state.  It also emits one row per deployed
source template so a map can be blocked before release when a class or weapon
has no accepted mapping.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'content/scenarios/gba-classics-v1'
OUT_DIR = ROOT / 'content/scenarios/classic-maps-v1'
sys.path.insert(0, str(ROOT / 'tools/classic-integration'))
import build_catalog as bc  # noqa: E402

# 源武器类别 -> 项目武器。项目没有同名武器时，选同职责、可装备的现有武器。
WEAPON_MAP = {
    'SWORD': ('iron_sword', 'steel_sword', 'silver_sword', 'killing_edge', 'iron_sword'),
    'LANCE': ('iron_lance', 'steel_lance', 'silver_lance', 'killer_lance', 'javelin'),
    'AXE': ('iron_axe', 'steel_axe', 'silver_axe', 'killer_axe', 'hand_axe'),
    'BOW': ('iron_bow', 'steel_bow', 'silver_bow', 'killer_bow', 'longbow'),
}
MAGIC_MAP = {
    'ANIMA': ('fire', 'thunder', 'fire', 'flame_lance', 'thunder'),
    'DARK': ('fire', 'thunder', 'fire', 'flame_lance', 'thunder'),
    'LIGHT': ('thunder', 'thunder', 'fire', 'flame_lance', 'fire'),
}
STAFF_MAP = {
    'HEAL': 'heal', 'MEND': 'heal', 'RECOVER': 'recover', 'PHYSIC': 'physic',
    'FORTIFY': 'recover', 'BARRIER': 'recover', 'RESCUE': 'physic', 'WARP': 'physic',
    'HAMMERNE': 'recover', 'SLEEP': 'heal', 'SILENCE': 'heal', 'BERSERK': 'heal',
}
DIFFERENCES = {
    'druid': '项目无独立暗魔法书；源暗魔法按现有火焰/雷霆/etc.替换，不继承吸血/石化。',
    'dark_knight': '项目 mage_knight 是步行剑/书；源骑马魔法职业改映射到 dark_knight。',
    'valkyrie': '项目无 troubadour；骑马杖/魔法职业统一映射到 valkyrie。',
    'bow_knight': '项目无 nomad；骑乘弓兵统一映射到 bow_knight。',
    'dragon_commander': '源 Wyvern Lord 的贯通等技能不自动继承。',
    'dragon_lord': '终局龙族首领使用 dragon_lord + dragonstone；不继承原特殊技能。',
    'dragonkin': '尸龙/龙人使用 dragonkin；飞行等原能力不自动继承。',
    'fighter': '源 Brigand/Pirate 统一映射到 fighter；不继承海盗/山贼特殊移动。',
    'berserker': '源 Berserker 保留狂战士职责；不继承必杀/暴击相关原技能。',
    'assassin': '源 Assassin 保留刺客职责；瞬杀不自动继承。',
    'mage': '项目统一使用 tome；不保留理/光/暗三系克制。',
    'sage': '项目统一使用 tome；不保留理/光/暗三系克制。',
    'bishop': '治疗与攻击职责由实际装备决定；不继承光魔法克制。',
    'general': '重甲/守点职责保留；不继承原大盾技能。',
    'knight': '重甲职责保留；不继承原大盾技能。',
}
SOURCE_NOTES = {
    'fe7': 'FE7 classCatalog 的 symbol 多数为 null；数字 ID 与 classTable 原始记录是本映射的依据。',
    'fe8': 'FE8 classCatalog 带 symbol；LOAD3 通过 encounter-table 引用保留槽位。',
}



# 项目职业可用武器类型（与 backend/common/data/classes.ts 同步；用于把源装备
# 换成该职业合法且同职责的现有武器，而不是把不可用装备写进报告后继续发布）。
CLASS_WEAPON_TYPES = {
    'commoner': ['sword', 'lance', 'axe', 'bow', 'fist', 'staff', 'tome'],
    'noble': ['sword', 'lance', 'axe', 'bow', 'fist', 'staff', 'tome'],
    'gladiator': ['sword', 'axe', 'fist'], 'hunter': ['sword', 'bow'],
    'lancer': ['sword', 'lance', 'axe'], 'ornius_rider': ['sword', 'lance', 'axe'],
    'adept': ['sword', 'axe', 'fist', 'tome', 'staff'], 'swordsman': ['sword', 'lance'],
    'fighter': ['sword', 'axe', 'fist'], 'brawler': ['fist'], 'archer': ['bow'],
    'rogue': ['sword', 'bow'], 'knight': ['sword', 'lance', 'axe'],
    'cavalier': ['sword', 'lance', 'axe'], 'charioteer': ['bow'],
    'armored_ornius': ['sword', 'lance', 'axe'], 'pegasus': ['sword', 'lance'],
    'mage': ['sword', 'fist', 'tome', 'staff'], 'cleric': ['axe', 'fist', 'tome', 'staff'],
    'shido': ['sword', 'lance'], 'sniper': ['bow'], 'forest_knight': ['sword', 'bow'],
    'dreadnought': ['lance', 'axe'], 'paladin': ['sword', 'lance', 'axe'],
    'sage': ['sword', 'fist', 'tome', 'staff'], 'bishop': ['axe', 'fist', 'tome', 'staff'],
    'dragon_knight': ['sword', 'lance', 'axe'], 'troubadour': ['tome', 'staff'],
    'guardian': ['lance', 'staff'], 'blacksmith': ['axe', 'tome'],
    'cataphract': ['sword', 'lance', 'axe'], 'ranger': ['sword', 'bow'],
    'dancer': ['sword', 'bow'], 'swordmaster': ['sword', 'lance'],
    'high_epitaph': ['sword', 'tome'], 'battlemaster': ['sword', 'axe', 'fist'],
    'monk': ['fist', 'staff'], 'marksman': ['bow'], 'bow_knight': ['sword', 'bow'],
    'sentinel': ['lance', 'staff'], 'fortress': ['lance', 'axe'],
    'great_knight': ['sword', 'lance', 'axe'], 'falcon': ['sword', 'lance'],
    'dragon_commander': ['sword', 'lance', 'axe'], 'druid': ['sword', 'fist', 'tome'],
    'valkyrie': ['tome', 'staff'], 'blade': ['sword', 'lance'],
    'mercenary': ['sword'], 'hero': ['sword', 'axe'], 'berserker': ['axe'],
    'thief': ['sword'], 'assassin': ['sword', 'bow'], 'general': ['lance', 'axe'],
    'mage_knight': ['sword', 'tome'], 'dark_knight': ['sword', 'tome'],
    'beast_fighter': ['beast'], 'beast_hero': ['beast'], 'beast_guard': ['beast'],
    'beast_lord': ['beast'], 'dragonkin': ['dragon'], 'ancient_guard': ['dragon'],
    'dragon_sage': ['dragon'], 'dragon_lord': ['dragon'],
}
PROJECT_WEAPON_TYPE = {
    **{w: 'sword' for w in ('iron_sword', 'steel_sword', 'silver_sword', 'killing_edge', 'horseslayer', 'brave_sword')},
    **{w: 'lance' for w in ('iron_lance', 'steel_lance', 'silver_lance', 'javelin', 'armorslayer', 'killer_lance')},
    **{w: 'axe' for w in ('iron_axe', 'steel_axe', 'silver_axe', 'hand_axe', 'killer_axe')},
    **{w: 'bow' for w in ('iron_bow', 'steel_bow', 'silver_bow', 'killer_bow', 'longbow')},
    **{w: 'tome' for w in ('fire', 'thunder', 'wind', 'flame_lance')},
    **{w: 'staff' for w in ('heal', 'recover', 'physic')},
    'beast_claw': 'beast', 'dragonstone': 'dragon',
}
FALLBACK_WEAPON = {'sword': 'iron_sword', 'lance': 'iron_lance', 'axe': 'iron_axe', 'bow': 'iron_bow',
                   'tome': 'fire', 'staff': 'heal', 'beast': 'beast_claw', 'dragon': 'dragonstone'}

def load(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def enemy_units(asset: dict):
    for group in asset.get('unitGroups', []):
        for unit in group.get('units', []):
            if unit.get('faction') == 'enemy' and unit.get('positionStatus') == 'on-map':
                yield group, unit


def refs_of(group: dict) -> list[dict]:
    return [{'kind': r.get('kind'), 'slot': r.get('slot')} for r in group.get('references', [])]


def source_class(asset: dict, unit: dict) -> tuple[int | None, str | None]:
    cid = unit.get('effectiveClassId') or unit.get('classId')
    symbol = unit.get('classSymbol')
    return cid, symbol


def class_entry(game: str, asset: dict, cid: int | None, symbol: str | None, used_by: list[str]) -> dict:
    cat = asset.get('classCatalog', {})
    record = cat.get(str(cid)) if cid is not None else None
    if record is None and symbol:
        record = next((v for v in cat.values() if v.get('symbol') == symbol), None)
    if game == 'fe7':
        name, project = bc.FE7_CLASS_ID[cid]
        key = f'CLASS_ID_{cid}'
    else:
        key = symbol or f'CLASS_ID_{cid}'
        name = (record or {}).get('symbol', key).replace('CLASS_', '').replace('_', ' ').title()
        project = bc.project_class({'classSymbol': symbol, 'classId': cid, 'effectiveClassId': cid}, game)
    return {
        'game': game,
        'sourceKey': key,
        'sourceId': cid,
        'sourceName': name,
        'nameConfidence': 'inferred-from-source-stats' if game == 'fe7' else 'symbol-annotation',
        'projectClass': project,
        'mapping': 'replacement' if project not in name.lower().replace(' ', '_') else 'direct',
        'equipmentPolicy': 'runtime uses the project class default weapon; source items are recorded for role review',
        'differences': DIFFERENCES.get(project, '对应/替换为项目现有职业。'),
        'review': 'accepted',
        'sourceEvidence': {k: record.get(k) for k in ('sourceAddress', 'sourceRecordHex', 'nameTextId') if record and record.get(k) is not None},
        'usedByMaps': sorted(set(used_by)),
    }


def legalize(mapped: str | None, project_class: str) -> tuple[str | None, str]:
    if not mapped:
        return None, 'unmapped'
    allowed = CLASS_WEAPON_TYPES.get(project_class, [])
    if PROJECT_WEAPON_TYPE.get(mapped) in allowed:
        return mapped, 'mapped'
    fallback = next((FALLBACK_WEAPON[t] for t in allowed if t in FALLBACK_WEAPON), None)
    return fallback, 'replaced' if fallback else 'unmapped'


def weapon_for(symbol: str | None, project_class: str) -> tuple[str | None, str]:
    if not symbol:
        return None, 'no-source-item'
    tail = symbol.replace('ITEM_', '').replace('IID_', '').upper()
    if 'FIRESTONE' in tail:
        return legalize('dragonstone', project_class)
    if any(k in tail for k in ('LIGHTBRAND', 'ECKESACHS', 'DURANDAL', 'ARMADS', 'SOL_KATTI', 'SIEGLINDE', 'SIEGMUND')):
        return legalize('silver_sword' if any(k in tail for k in ('SWORD', 'KATTI', 'LIGHTBRAND', 'ECKESACHS')) else 'silver_lance', project_class)
    if 'MONSTER_' in tail or tail.startswith(('CRIMSNEYE', 'DEMONSURG', 'EVILEYE', 'SHADOWSHT', 'FETIDCLW', 'FIREFANG', 'HELLFANG', 'LTHLTALON', 'ROTTENCLW', 'SHARPCLAW', 'VENINCLW', 'WRETCHAIR')):
        return legalize('beast_claw', project_class)
    if any(k in tail for k in ('SWORD', 'BLADE', 'KILLINGEDGE', 'ARMORSLAYER', 'LANCEREAVER', 'RAPIER', 'WO_DAO')):
        family = 'SWORD'
    elif any(k in tail for k in ('LANCE', 'SPEAR', 'JAVELIN', 'HORSESLAYER', 'AXEREAVER')):
        family = 'LANCE'
    elif any(k in tail for k in ('AXE', 'TOMAHAWK', 'DEVILAXE', 'HANDAXE', 'HALBERD', 'HAMMER')):
        family = 'AXE'
    elif 'BOW' in tail:
        family = 'BOW'
    elif any(k in tail for k in ('ANIMA', 'LIGHT', 'FIRE', 'THUNDER', 'BOLTING', 'ELFIRE', 'FIMBULVETR', 'AIRCALIBUR', 'PURGE', 'DIVINE', 'LIGHTNING', 'AURA', 'SHINE', 'LUCE')):
        family = 'ANIMA'
    elif any(k in tail for k in ('DARK', 'FLUX', 'NOSFERATU', 'FENRIR', 'LUNA', 'ECLIPSE', 'GLEIPNIR')):
        family = 'DARK'
    elif any(k in tail for k in ('STAFF', 'HEAL', 'MEND', 'PHYSIC', 'RECOVER', 'FORTIFY', 'BARRIER', 'RESCUE', 'WARP', 'HAMMERNE', 'SLEEP', 'SILENCE', 'BERSERK')):
        return legalize(STAFF_MAP.get(tail.replace('STAFF', ''), 'recover'), project_class)
    else:
        return None, 'interaction-or-item' if any(k in tail for k in ('KEY', 'LOCKPICK', 'MEMBERCARD', 'GUIDINGRING', 'GEM', 'RUNE', 'VULNERARY', 'ELIXIR', 'ANTITOXIN', 'CREST', 'WHIP', 'SHIELD', 'BOOSTER')) else 'unmapped'
    table = WEAPON_MAP.get(family) or MAGIC_MAP.get(family)
    idx = 0
    if 'SLIM' in tail or 'IRON' in tail:
        idx = 0
    elif 'STEEL' in tail:
        idx = 1
    elif 'SILVER' in tail:
        idx = 2
    elif 'KILLER' in tail:
        idx = 3
    elif any(k in tail for k in ('BRAVE', 'LONGBOW', 'SPEAR', 'SHORTSPEAR', 'HAND', 'JAVELIN', 'TOMAHAWK', 'HALBERD')):
        idx = 4
    return legalize(table[idx], project_class)

def main() -> int:
    manifest = load(BASE / 'manifest.json')
    catalog = load(OUT_DIR / 'catalog.json')
    adaptations = {m['mapId']: m for m in load(OUT_DIR / 'adaptations.json')['maps']}
    assets = {e['file']: load(BASE / e['file']) for e in manifest['scenarios']}
    by_id = {a['id']: a for a in assets.values()}

    classes: dict[tuple[str, str], dict] = {}
    used: dict[tuple[str, str], list[str]] = defaultdict(list)
    templates: list[dict] = []
    encounter_tables: dict[str, list[dict]] = {}

    for map_data in catalog['maps']:
        asset = by_id.get(map_data['id'])
        if not asset or map_data['source'].get('pack') != 'gba-classics-v1':
            continue
        game = asset['source']['game']
        groups = asset.get('unitGroups', [])
        def enemies_of(group):
            return [u for u in group['units'] if u['faction'] == 'enemy' and u['positionStatus'] == 'on-map']
        primary = max(groups, key=lambda g: (any(r.get('kind') == 'enemy-table' for r in g['references']), len(enemies_of(g))))
        if game == 'fe8':
            encounter_tables[map_data['id']] = [
                {'group': g.get('id'), 'references': refs_of(g), 'selected': g is primary,
                 'enemyCount': len(enemies_of(g))}
                for g in groups if any(r.get('kind') in ('enemy-table', 'encounter-table') for r in g.get('references', []))
            ]
        source_units = enemies_of(primary)
        for i, enemy in enumerate(map_data['enemies']):
            unit = source_units[i] if i < len(source_units) else {}
            cid, symbol = source_class(asset, unit)
            project = enemy['classId']
            key = f'CLASS_ID_{cid}' if game == 'fe7' else (symbol or f'CLASS_ID_{cid}')
            used[(game, key)].append(map_data['id'])
            if (game, key) not in classes:
                classes[(game, key)] = class_entry(game, asset, cid, symbol, [])
            items = []
            for item_id in unit.get('itemIds') or []:
                item = asset.get('itemCatalog', {}).get(str(item_id), {})
                sym = item.get('symbol')
                mapped, status = weapon_for(sym, project)
                items.append({'sourceItemId': item_id, 'sourceItem': sym, 'projectWeapon': mapped, 'status': status})
            templates.append({
                'mapId': map_data['id'], 'game': game, 'enemyIndex': i,
                'sourceClassId': cid, 'sourceClass': symbol or key,
                'sourceName': classes[(game, key)]['sourceName'], 'projectClass': project,
                'sourceLevel': unit.get('level') if unit else enemy['level'],
                'levelOffset': enemy['level'] - sorted(e['level'] for e in map_data['enemies'])[len(map_data['enemies']) // 2],
                'sourceAI': unit.get('aiBytes') if unit else None,
                'spawnTiming': 'initial',
                'sourceItems': items,
                'boss': bool(enemy.get('boss')),
            })

    for (game, key), maps in used.items():
        classes[(game, key)]['usedByMaps'] = sorted(set(maps))

    # FE7 has 39 numeric IDs across all groups, not only the initial garrison.
    for asset in assets.values():
        if asset['source']['game'] != 'fe7':
            continue
        for _group, unit in enemy_units(asset):
            cid, symbol = source_class(asset, unit)
            key = f'CLASS_ID_{cid}'
            used[(('fe7'), key)].append(asset['id'])
            if ('fe7', key) not in classes:
                classes[('fe7', key)] = class_entry('fe7', asset, cid, symbol, [])
    for (game, key), maps in used.items():
        classes[(game, key)]['usedByMaps'] = sorted(set(maps))

    class_map = {
        'format': 'agent-tactics.classic-class-map',
        'schemaVersion': 1,
        'notes': SOURCE_NOTES,
        'classes': sorted(classes.values(), key=lambda e: (e['game'], str(e['sourceId']))),
        'encounterTables': encounter_tables,
    }
    (OUT_DIR / 'class-map.json').write_text(json.dumps(class_map, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')

    report = {
        'format': 'agent-tactics.classic-adaptation-report',
        'schemaVersion': 1,
        'maps': [],
    }
    for map_data in catalog['maps']:
        rows = [t for t in templates if t['mapId'] == map_data['id']]
        waves = []
        for event in adaptations.get(map_data['id'], {}).get('events', []):
            for action in event.get('actions', []):
                if action.get('kind') == 'spawn':
                    for unit in action.get('units', []):
                        waves.append({
                            'event': event['id'], 'trigger': event.get('trigger'),
                            'classId': unit['classId'], 'pos': unit['pos'],
                            'levelOffset': unit.get('levelOffset', 0),
                        })
        def unusable(row):
            allowed = CLASS_WEAPON_TYPES.get(row['projectClass'], [])
            mapped = [i['projectWeapon'] for i in row['sourceItems'] if i['projectWeapon']]
            return bool(mapped) and not any(PROJECT_WEAPON_TYPE.get(w) in allowed for w in mapped)
        missing = [r for r in rows if not r['projectClass'] or unusable(r)
                   or any(i['projectWeapon'] is None and i['status'] == 'unmapped' for i in r['sourceItems'])]
        report['maps'].append({
            'mapId': map_data['id'], 'game': map_data['game'], 'name': map_data['name'],
            'sourceSha256': adaptations.get(map_data['id'], {}).get('sourceSha256'),
            'deployment': adaptations.get(map_data['id'], {}).get('deployment'),
            'enemyCount': len(map_data['enemies']),
            'templates': rows, 'waves': waves,
            'release': {'status': 'accepted' if not missing else 'blocked', 'missing': missing},
        })
    (OUT_DIR / 'adaptation-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f"class-map: {len(class_map['classes'])} classes; report: {len(report['maps'])} maps")
    blocked = [m['mapId'] for m in report['maps'] if m['release']['status'] != 'accepted']
    if blocked:
        print('blocked:', ', '.join(blocked))
        return 1
    return 0


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
