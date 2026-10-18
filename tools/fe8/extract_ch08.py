#!/usr/bin/env python3
"""Extract FE8U chapter 8 from pinned decomp data; optionally verify a local ROM.

No C expressions or event scripts are executed. This is a chapter-specific
source reader, not a general C parser or a simulation of FE8's event engine.
"""
from __future__ import annotations

import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import csv
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

HERE = Path(__file__).resolve().parent
LOCK = json.loads((HERE / 'sources.lock.json').read_text(encoding='utf-8'))
REVISION = LOCK['revision']
REPOSITORY = LOCK['repository']


class FormatError(ValueError):
    pass


class Sources:
    def __init__(self, cache: Path, offline: bool = False):
        self.root = cache / REVISION
        self.offline = offline

    def get(self, path: str) -> bytes:
        expected = LOCK['files'][path]
        local = self.root / path
        if not local.exists():
            if self.offline:
                raise FormatError(f'Offline cache is missing {path}; run once without --offline')
            import requests
            response = requests.get(source_url(path, raw=True), timeout=(8, 30))
            response.raise_for_status()
            data = response.content
            check_digest(path, data, expected)
            local.parent.mkdir(parents=True, exist_ok=True)
            local.write_bytes(data)
        data = local.read_bytes()
        check_digest(path, data, expected)
        return data

    def text(self, path: str) -> str:
        return self.get(path).decode('utf-8')

    def json(self, path: str):
        return json.loads(self.text(path))

    def prefetch(self):
        # Each worker writes a distinct file. Iterating results propagates failures.
        with ThreadPoolExecutor(max_workers=6) as pool:
            for _ in pool.map(self.get, LOCK['files']):
                pass


def source_url(path: str, raw: bool = False) -> str:
    if raw:
        return f'https://raw.githubusercontent.com/FireEmblemUniverse/fireemblem8u/{REVISION}/{path}'
    return f'{REPOSITORY}/blob/{REVISION}/{path}'


def check_digest(path: str, data: bytes, expected: dict):
    if len(data) != expected['bytes'] or hashlib.sha256(data).hexdigest() != expected['sha256']:
        raise FormatError(f'Source checksum mismatch: {path}')


def no_comments(text: str) -> str:
    return re.sub(r'/\*.*?\*/|//[^\n]*', '', text, flags=re.S)


def split_top(text: str, separator: str = ',') -> list[str]:
    """Split the numeric/symbolic initializers used in this pinned chapter."""
    depth = 0
    start = 0
    result = []
    for index, char in enumerate(text):
        if char in '({[':
            depth += 1
        elif char in ')}]':
            depth -= 1
        elif char == separator and depth == 0:
            result.append(text[start:index].strip())
            start = index + 1
        if depth < 0:
            raise FormatError('Unbalanced initializer')
    if depth:
        raise FormatError('Unbalanced initializer')
    if text[start:].strip():
        result.append(text[start:].strip())
    return result


def matching(text: str, start: int, left: str, right: str) -> int:
    depth = 0
    for index in range(start, len(text)):
        if text[index] == left:
            depth += 1
        elif text[index] == right:
            depth -= 1
            if depth == 0:
                return index
    raise FormatError(f'Unterminated {left} at {start}')


def array_body(text: str, symbol: str) -> tuple[str, int]:
    match = re.search(r'\b' + re.escape(symbol) + r'\s*\[\s*\]\s*=\s*\{', text)
    if not match:
        raise FormatError(f'Array not found: {symbol}')
    start = match.end() - 1
    end = matching(text, start, '{', '}')
    return text[start + 1:end], match.start()


def fields(entry: str) -> dict[str, str]:
    if not entry.startswith('{') or not entry.endswith('}'):
        raise FormatError(f'Unsupported initializer: {entry[:80]}')
    result = {}
    for term in split_top(entry[1:-1]):
        match = re.fullmatch(r'\.(\w+)\s*=\s*(.+)', term, flags=re.S)
        if not match:
            raise FormatError(f'Unsupported field: {term[:80]}')
        key, value = match.groups()
        if key in result:
            raise FormatError(f'Duplicate field: {key}')
        result[key] = value.strip()
    return result


def constants(sources: Sources) -> dict[str, int]:
    result = {'FACTION_ID_BLUE': 0, 'FACTION_ID_GREEN': 1, 'FACTION_ID_RED': 2}
    for name in ['terrains', 'characters', 'classes', 'items']:
        text = no_comments(sources.text(f'include/constants/{name}.h'))
        result.update({key: int(value, 0) for key, value in re.findall(
            r'\b((?:TERRAIN|CHARACTER|CLASS|ITEM)_\w+)\s*=\s*(0x[0-9a-fA-F]+|\d+)\b', text)})
    return result


def number(expression: str, symbols: dict[str, int]) -> int:
    expression = expression.strip()
    if expression in symbols:
        return symbols[expression]
    if re.fullmatch(r'-?(?:0x[0-9a-fA-F]+|\d+)', expression):
        return int(expression, 0) if expression.lstrip('-').startswith('0x') else int(expression)
    raise FormatError(f'Unsupported numeric expression: {expression}')


def parse_mar(data: bytes, width: int, height: int) -> list[list[int]]:
    if not 1 <= width <= 64 or not 1 <= height <= 64 or len(data) != width * height * 2:
        raise FormatError('MAR dimensions do not match byte length')
    values = struct.unpack(f'<{width * height}H', data)
    if any(value & 31 for value in values):
        raise FormatError('Unexpected MAR bits; this reader requires metatile indices shifted by 5')
    # The build's mar_to_map.py shifts MAR values >> 3. bmmap.c then uses
    # map_word >> 2 to look up terrain: MAR >> 5 gives the metatile index.
    return [list(value >> 5 for value in values[y * width:(y + 1) * width]) for y in range(height)]


def terrain_rows(indices: list[list[int]], config: bytes) -> list[list[int]]:
    if len(config) != 0x2400:
        raise FormatError('Expected FE8 tileset config: 0x2000 graphics bytes + 0x400 terrain bytes')
    if any(index < 0 or index >= 0x400 for row in indices for index in row):
        raise FormatError('Metatile index outside terrain lookup table')
    return [[config[0x2000 + index] for index in row] for row in indices]


def parse_units(text: str, symbol: str, symbols: dict[str, int]) -> dict:
    body, position = array_body(text, symbol)
    previous = text[max(0, position - 90):position]
    address_match = re.search(r'//\s*(0x[0-9A-Fa-f]+)\s*[^\n]*\nCONST_DATA struct UnitDefinition\s*$', previous)
    if address_match:
        address = int(address_match.group(1), 16)
    elif re.fullmatch(r'UnitDef_[0-9A-Fa-f]{8}', symbol):
        address = int(symbol[8:], 16)
    else:
        raise FormatError(f'No ROM address annotation for {symbol}')
    units = []
    entries = split_top(no_comments(body))
    if not entries or re.sub(r'\s', '', entries[-1]) != '{0}':
        raise FormatError(f'Missing unit terminator: {symbol}')
    for index, entry in enumerate(entries[:-1]):
        data = fields(entry)
        scalar = {key: number(value, symbols) for key, value in data.items()
                  if key not in ['items', 'ai', 'redas']}
        character = data.get('charIndex', '0')
        class_name = data.get('classIndex', '0')
        items = [item.strip() for item in split_top(data.get('items', '{}')[1:-1])]
        entry_position = [scalar.get('xPosition', 0), scalar.get('yPosition', 0)]
        path = []
        if scalar.get('redaCount', 0):
            reda_body, _ = array_body(text, data['redas'])
            for step in split_top(no_comments(reda_body))[:scalar['redaCount']]:
                path.append({key: number(value, symbols) for key, value in fields(step).items()})
            if len(path) != scalar['redaCount']:
                raise FormatError(f'Truncated REDA path: {symbol}[{index}]')
        final_position = entry_position
        # All paths selected for this chapter use absolute positions with flags=0.
        # Refuse to invent the result if a future source uses relative/special paths.
        if path:
            final_position = [path[-1].get('x', 0), path[-1].get('y', 0)] if all(
                step.get('flags', 0) == 0 for step in path) else None
        units.append({
            'index': index, 'character': character, 'characterId': scalar.get('charIndex', 0),
            'class': class_name, 'classId': scalar.get('classIndex', 0),
            'faction': ['player', 'ally', 'enemy'][scalar.get('allegiance', 0)],
            'level': scalar.get('level', 0), 'autolevel': bool(scalar.get('autolevel', 0)),
            'entryPosition': entry_position, 'redaPath': path, 'finalPosition': final_position,
            'items': [{'symbol': item, 'id': number(item, symbols)} for item in items],
            'dropFlag': bool(scalar.get('itemDrop', 0)),
            'aiExpressions': split_top(data.get('ai', '{}')[1:-1]),
            'sourceFields': data,
        })
    return {'symbol': symbol, 'romAddress': f'0x{address:08X}', 'units': units}


def macro_calls(body: str) -> list[dict]:
    body = no_comments(body)
    calls = []
    position = 0
    while match := re.search(r'\b(\w+)\s*\(', body[position:]):
        start = position + match.end() - 1
        end = matching(body, start, '(', ')')
        calls.append({'macro': match.group(1), 'arguments': split_top(body[start + 1:end])})
        position = end + 1
    return calls


# Source symbols remain authoritative. These labels/colors are for inspecting data.
TERRAIN_STYLE = {
    0x17: ('地板', '#cec6af', '·'), 0x1A: ('墙壁', '#535b63', '墙'),
    0x1B: ('可破坏墙', '#926c55', '裂'), 0x1D: ('柱子', '#9396ad', '柱'),
    0x1E: ('门', '#b98348', '门'), 0x1F: ('王座', '#dbb956', '座'),
    0x20: ('已开宝箱', '#ae915d', '空'),
    0x21: ('未开宝箱', '#df9954', '箱'), 0x2D: ('楼梯', '#a7c4b4', '梯'),
    0x3C: ('水域', '#5587b1', '水'), 0x3F: ('Brace（原始分类）', '#343d48', '构'),
}
RULE_TABLES = {
    'foot': 'TerrainTable_MovCost_CommonT1Normal',
    'armored': 'TerrainTable_MovCost_ArmorNormal',
    'mounted': 'TerrainTable_MovCost_HorseT1Normal',
    'flying': 'TerrainTable_MovCost_FlyNormal',
}


def make_catalog(rows: list[list[int]], sources: Sources, symbols: dict[str, int]) -> dict:
    rule_text = sources.text('src/data_terrains.c')
    rule_names = {**RULE_TABLES,
                  'commonAvoid': 'TerrainTable_Avo_Common', 'commonDefense': 'TerrainTable_Def_Common',
                  'commonResistance': 'TerrainTable_Res_Common', 'flyingAvoid': 'TerrainTable_Avo_Fly',
                  'flyingDefense': 'TerrainTable_Def_Fly', 'flyingResistance': 'TerrainTable_Res_Fly',
                  'healingAmount': 'TerrainTable_HealAmount', 'healsStatus': 'TerrainTable_HealsStatus'}
    rules = {}
    for profile, name in rule_names.items():
        body, _ = array_body(rule_text, name)
        rules[profile] = {symbols[key]: int(value) for key, value in re.findall(
            r'\[(TERRAIN_\w+)\]\s*=\s*(-?\d+)', no_comments(body))}
    catalog = {}
    for value in sorted({item for row in rows for item in row if item is not None}):
        name = next((key for key, number_ in symbols.items() if key.startswith('TERRAIN_')
                     and key != 'TERRAIN_COUNT' and number_ == value), None)
        if name is None:
            raise FormatError(f'Unknown FE8 terrain ID: {value}')
        label, color, glyph = TERRAIN_STYLE.get(value, (name, '#aaaaaa', '?'))
        if any(value not in table for table in rules.values()):
            raise FormatError(f'Missing movement rule for {name}')
        catalog[str(value)] = {'symbol': name, 'label': label, 'color': color, 'glyph': glyph,
                               'normalMovementCosts': {key: rules[key][value] for key in RULE_TABLES},
                               'commonBattleBonuses': {key: rules['common' + key.title()][value]
                                                      for key in ['avoid', 'defense', 'resistance']},
                               'flyingBattleBonuses': {key: rules['flying' + key.title()][value]
                                                      for key in ['avoid', 'defense', 'resistance']},
                               'healingAmountRaw': rules['healingAmount'][value],
                               'healsStatus': bool(rules['healsStatus'][value])}
    return catalog


def extract(sources: Sources) -> dict:
    symbols = constants(sources)
    settings = sources.json('src/data/chapter_settings.json')['chapters'][9]
    if settings['internalName'] != 'L08':
        raise FormatError('Chapter table index 9 is not chapter 8')
    assets = re.findall(r'^\s*\.word\s+(\w+)\s*$', sources.text('data/data_8B363C.s'), re.M)[:236]
    selected_assets = {key: assets[value] for key, value in settings['map'].items()}
    if selected_assets['mainLayerId'] != 'Ch8Map' or selected_assets['tileConfigId'] != 'TileConfiguration3':
        raise FormatError('Chapter assets differ from supported profile')
    layout = sources.json('graphics/map/layout/Ch8Map.json')
    width, height = layout['width'], layout['height']
    indices = parse_mar(sources.get('graphics/map/layout/Ch8Map.mar'), width, height)
    config = sources.get('graphics/map/TileConfiguration3.bin')
    rows = terrain_rows(indices, config)

    unit_text = sources.text('src/events_udefs.c')
    groups = {}
    for role, symbol in {
        'playerDeploymentTemplates': 'UnitDef_Event_Ch8Ally',
        'initialEnemyTemplates': 'UnitDef_088B73C8',
        'turn2PlayerReinforcements': 'UnitDef_088B75F8',
        'areaEnemyReinforcements': 'UnitDef_088B7648',
        'turn5EnemyReinforcements': 'UnitDef_088B7698',
    }.items():
        groups[role] = parse_units(unit_text, symbol, symbols)

    info_text = sources.text('src/events/ch8-eventinfo.h')
    events = {}
    raw_event_lists = {}
    for kind in ['Turn', 'Character', 'Location', 'Misc']:
        body, _ = array_body(info_text, f'EventListScr_Ch8_{kind}')
        events[kind.lower()] = macro_calls(body)
        raw_event_lists[kind.lower()] = body.strip()
    objects = []
    for call in events['location']:
        name, args = call['macro'], call['arguments']
        if name not in ['Door_', 'Chest', 'Seize']:
            raise FormatError(f'Unhandled location macro: {name}')
        x, y = [number(arg, symbols) for arg in args[-2:]]
        obj = {'kind': {'Door_': 'door', 'Chest': 'chest', 'Seize': 'seize'}[name], 'position': [x, y]}
        if name == 'Chest':
            obj['item'] = {'symbol': args[0], 'id': number(args[0], symbols)}
        objects.append(obj)

    changes = sources.json('src/data/map/change/Ch8MapChanges.json')['changes']
    for change in changes:
        data = sources.get(f"graphics/map/{change['tiles']}.bin")
        w, h = change['w'], change['h']
        if len(data) != w * h * 2:
            raise FormatError(f"Bad map change size: {change['id']}")
        words = struct.unpack(f'<{w * h}H', data)
        if any(word & 3 for word in words):
            raise FormatError('Unaligned map change metatile offset')
        change['metatileIndices'] = [[word >> 2 if word else None for word in words[y * w:(y + 1) * w]] for y in range(h)]
        # bmtrick.c ApplyMapChangesById skips zero words; they are masks,
        # not assignments to metatile/terrain zero.
        change['zeroMeansUnchanged'] = True
        change['terrainIds'] = [[config[0x2000 + index] if index is not None else None
                                for index in row] for row in change['metatileIndices']]
    catalog = make_catalog(rows + [row for change in changes for row in change['terrainIds']], sources, symbols)

    script_text = sources.text('src/events/ch8-eventscript.h')
    script_names = ['EventScr_Ch8_BeginningScene', 'EventScr_089F3124', 'EventScr_Ch8_EndingScene',
                    'EventScr_Ch8_MiscThiefRainforce', 'EventScr_089F3250', 'EventScr_089F3268']
    scripts = {name: array_body(script_text, name)[0].strip() for name in script_names}
    return {
        'schemaVersion': 1, 'id': 'fe8u-ch08', 'title': '圣魔之光石·第8章',
        'dataKind': 'static-chapter-source',
        'source': {'repository': REPOSITORY, 'revision': REVISION,
                   'targetRomSha1': LOCK['targetRomSha1'], 'inputKind': 'public-decomp-data',
                   'localRomVerified': False},
        'coordinates': {'origin': 'top-left', 'indexBase': 0, 'order': ['x', 'y'], 'tilePixels': 16},
        'chapterTableIndex': 9, 'width': width, 'height': height,
        'chapterSettings': settings, 'assetSymbols': selected_assets,
        'metatileIndices': indices, 'terrainIds': rows, 'terrainCatalog': catalog,
        'terrainCounts': {catalog[str(value)]['symbol']: count for value, count in sorted(
            Counter(value for row in rows for value in row).items())},
        'objects': objects, 'mapChanges': changes, 'unitGroups': groups,
        'eventLists': events, 'rawEventListInitializers': raw_event_lists, 'selectedEventScripts': scripts,
        'eventInterpretation': {
            'basis': '人工核对第8章事件脚本及公共辅助脚本；未模拟事件引擎',
            'defeatIfLordDies': 'CauseGameOverIfLordDies' in raw_event_lists['misc'],
            'turn2': {'phase': 'player', 'group': 'turn2PlayerReinforcements'},
            'turn5': {'phase': 'player', 'group': 'turn5EnemyReinforcements'},
            'area': {'boundsInclusive': {'min': [5, 0], 'max': [15, 10]},
                     'faction': 'player', 'areaEventFlag': 11, 'gateFlag': 12,
                     'behavior': '开场置位12；我方进入区域触发11并清除12；回合事件12随后加载增援组',
                     'group': 'areaEnemyReinforcements'},
        },
        'limitations': [
            '地形层是原始基础地图；mapChanges保留门、宝箱、墙等变化，未自动执行开场TILECHANGE。',
            '单位是静态模板；我方名单、现有属性、出击人数及最终位置还受存档与准备画面影响。',
            'entryPosition为入场坐标；finalPosition为REDA移动终点，二者不能混用。',
            '未模拟普通/困难难度、公共脚本、属性成长、随机数和事件运行时；不宣称复原完整战斗存档。',
            'FE8地形和本项目规则不同；此文件不是可直接传给BattleMap验证器的运行时关卡。',
        ],
    }


def validate_document(document: dict):
    w, h = document['width'], document['height']
    rows = document['terrainIds']
    if len(rows) != h or any(len(row) != w for row in rows):
        raise FormatError('Terrain dimensions are inconsistent')
    def check_point(point):
        if point is None or len(point) != 2 or not 0 <= point[0] < w or not 0 <= point[1] < h:
            raise FormatError(f'Coordinate outside map: {point}')
    for obj in document['objects']:
        check_point(obj['position'])
        x, y = obj['position']
        expected = {'door': 0x1E, 'chest': 0x21, 'seize': 0x1F}[obj['kind']]
        if rows[y][x] != expected:
            raise FormatError(f'Event and terrain disagree at {x},{y}')
    for group in document['unitGroups'].values():
        for unit in group['units']:
            check_point(unit['entryPosition'])
            check_point(unit['finalPosition'])
    for change in document['mapChanges']:
        check_point([change['x'], change['y']])
        check_point([change['x'] + change['w'] - 1, change['y'] + change['h'] - 1])
        if any(value is not None and str(value) not in document['terrainCatalog']
               for row in change['terrainIds'] for value in row):
            raise FormatError('Map change introduces an uncatalogued terrain')


def integration_report(document: dict) -> dict:
    direct = {0x17: 'floor', 0x1A: 'wall', 0x1F: 'throne', 0x3C: 'water'}
    pending = {0x1B: '需要可破坏墙及状态变化', 0x1D: '需要柱子规则或明确降级映射',
               0x1E: '需要门与开锁事件', 0x20: '需要宝箱已开启状态', 0x21: '需要宝箱和已开启状态',
               0x2D: '需要楼梯标签及明确地板映射', 0x3F: '需要核对Brace分类后决定映射'}
    return {'runtimeReady': False, 'terrainMappings': [
        {'fe8Id': int(key), 'symbol': value['symbol'], 'projectTerrainCandidate': direct.get(int(key)),
         'note': pending.get(int(key), '仅名称映射候选；战斗加成和移动规则仍需按项目设计确认')}
        for key, value in document['terrainCatalog'].items()],
        'requiredWork': [
            '保留地图事件层，支持门/宝箱/可破坏墙；决定柱子、楼梯、Brace的地形映射。',
            '挑选符合项目规模的我方出生点和敌军配置；原始初始敌军模板超过现有8人限制。',
            '处理首领占据制压点的原作布局与当前“目标不能和出生点重叠”规则。',
            '评估门和隔间导致的分阶段连通性；当前验证器要求所有可走格从开场全连通。',
            '将物品、职业和人物替换或映射到项目数据，再接入任务/增援执行。',
        ]}


def write_outputs(document: dict, out: Path):
    from preview import write_preview
    out.mkdir(parents=True, exist_ok=True)
    def write_json(name: str, value):
        (out / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_json('chapter.json', document)
    write_json('integration-report.json', integration_report(document))
    write_json('sources.json', {'repository': REPOSITORY, 'revision': REVISION,
                               'files': [{'path': path, 'url': source_url(path), **meta}
                                         for path, meta in LOCK['files'].items()]})
    with (out / 'terrain.csv').open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow(['x', 'y', 'metatile_index', 'terrain_id', 'terrain_symbol'])
        for y, row in enumerate(document['terrainIds']):
            for x, value in enumerate(row):
                writer.writerow([x, y, document['metatileIndices'][y][x], value,
                                 document['terrainCatalog'][str(value)]['symbol']])
    write_preview(document, out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', type=Path, default=HERE / '.cache')
    parser.add_argument('--offline', action='store_true', help='Require all pinned source files in cache')
    parser.add_argument('--out', type=Path, default=HERE.parents[1] / 'design/classic-maps/extracted/fe8-ch08')
    parser.add_argument('--verify-rom', type=Path, help='Also compare an exact FE8U ROM to source terrain and unit templates')
    args = parser.parse_args()
    try:
        # Reject incorrect ROMs before any network requests.
        if args.verify_rom:
            from rom import read_canonical_rom, verify_rom_data
            rom = read_canonical_rom(args.verify_rom, LOCK['targetRomSha1'])
        sources = Sources(args.cache, args.offline)
        sources.prefetch()
        document = extract(sources)
        validate_document(document)
        if args.verify_rom:
            document['source']['romVerification'] = verify_rom_data(rom, document, sources.get('graphics/map/TileConfiguration3.bin'))
            document['source']['localRomVerified'] = True
        write_outputs(document, args.out)
        print(f"Exported {document['width']}x{document['height']} cells, {len(document['objects'])} location events, "
              f"{sum(len(group['units']) for group in document['unitGroups'].values())} unit templates to {args.out}")
        return 0
    except (FormatError, OSError, ValueError) as error:
        print(f'Extraction failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    raise SystemExit(main())
