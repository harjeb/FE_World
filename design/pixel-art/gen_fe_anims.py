#!/usr/bin/env python3
"""Convert the FE-Repo battle animations chosen in fe-repo-candidates/class-map.json into in-game sheets.

Each converted action keeps the community animation's frames and FE script timing (1/60 s ticks),
faces right like the rest of our battle art, swaps the team colour for our faction ramp and writes a
role mask so the game can repaint it for the enemy side. Sources are pinned to one repository
revision and downloaded into a local cache on first run.
"""
from collections import Counter
import colorsys
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageSequence

HERE = Path(__file__).resolve().parent
REV = '222c1598f0a36ae5e6ade87030f6a8cc312febd8'
RAW = f'https://raw.githubusercontent.com/Klokinator/FE-Repo/{REV}/'
CACHE = Path(os.environ.get('FE_REPO_CACHE', Path.home()/'.cache'/'agent-tactics'/'fe-repo'))/REV
CLASS_MAP = HERE/'fe-repo-candidates'/'class-map.json'
STUDIES = HERE/'battle-sheets'/'animations.json'
OUT = HERE/'fe-anims'
IMPORTS = HERE.parents[1]/'frontend'/'src'/'battle'/'fe-anim-files.ts'
SCREEN = (240, 160)        # GBA screen; FE-Repo frames add an 8 px palette strip on the right
TICK_MS = 1000/60
HP_WAIT_MS = 320           # FE pauses on the C01 frame while the HP bar drains
ROLE = {'a': 1, 'A': 2, 'l': 3}
FACTION = {'a': '#3F6B8C', 'A': '#284A63', 'l': '#7FA9C6'}  # FACTION_COLORS.player in backend/common/sprites/battle.ts
SKIP_WEAPONS = {'staff'}   # healing shows on the map, never in the exchange scene

# Allegiance colours where the saturated-hue guess below is wrong, by pack or by pack action (checked
# against each palette: the guess also catches blue hair, wing shading, horse tack and steel claws).
TEAM = {
    'S02:Magic': [12, 13, 14],
    'S07': [1, 2, 10],
    'S18': [12, 13, 14],
    'S21': [12, 13, 14],
    'S22': [10, 11],
    'S23': [4, 5, 11, 14],
    'S24': [5, 8, 9, 10],
    'S29': [2, 14],
    'S30': [12, 13, 14],
    'S35': [12, 13, 14],
    'S37': [9, 10, 11],
    'S46': [8, 9, 10],
    'S47': [12, 13, 14],
    'S52': [13, 14],
}


def source_path(relative):
    """Keep decoded upstream paths inside the pinned cache."""
    if not relative or '\\' in relative or relative.startswith('/') or any(
            part in ('', '.', '..') for part in relative.split('/')):
        raise ValueError(f'Invalid FE-Repo source path: {relative!r}')
    return relative


def fetch(relative, attempts=5):
    relative = source_path(relative)
    target = CACHE/relative
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        for attempt in range(attempts):
            try:
                with urllib.request.urlopen(RAW+urllib.parse.quote(relative), timeout=60) as response:
                    data = response.read()
                break
            except urllib.error.HTTPError:
                raise
            except OSError:  # dropped connections and exhausted local ports are worth another try
                if attempt == attempts-1:
                    raise
                time.sleep(1+attempt)
        partial = target.with_suffix(target.suffix+'.part')
        partial.write_bytes(data)
        partial.replace(target)
    return target


def try_fetch(relative):
    relative = source_path(relative)
    target = CACHE/relative
    missing = target.with_suffix(target.suffix+'.missing')
    if not target.exists() and missing.exists():
        return None
    try:
        return fetch(relative)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            # This revision is immutable; missing PNGs are restored from the cached GIF.
            missing.parent.mkdir(parents=True, exist_ok=True)
            missing.touch()
            return None
        raise


def prefetch(paths):
    with ThreadPoolExecutor(8) as pool:
        return dict(zip(paths, pool.map(try_fetch, paths)))


def parse_script(text):
    """Modes of an FEBuilder script: steps (frame file, ticks) and command markers keyed by step index."""
    modes, mode = {}, None
    for raw in text.splitlines():
        line = raw.split('#')[0].strip()
        if not line:
            continue
        if line.startswith('/// - Mode'):
            mode = int(re.search(r'Mode\s+(\d+)', line).group(1))
            modes[mode] = {'steps': [], 'marks': {}}
        elif line.startswith('~~~') or mode is None:
            continue
        elif m := re.match(r'^(\d+)\s+p-\s+(.+\.png)$', line):
            modes[mode]['steps'].append((m.group(2), int(m.group(1))))
        elif m := re.match(r'^C([0-9A-Fa-f]{2})', line):
            modes[mode]['marks'].setdefault(m.group(1).upper(), len(modes[mode]['steps']))
    return modes


def hexrgb(value):
    return tuple(bytes.fromhex(value[1:]))


def from_preview(action, modes, names):
    """Some packs export only part of their frames as PNGs. Their preview GIF renders every scripted step
    once, mode after mode in script order, so step k of the script is frame k of the GIF."""
    with Image.open(fetch(f"{action['folder']}/{action['stem']}.gif")) as gif:
        shots = [frame.convert('RGB').crop((0, 0, *SCREEN)) for frame in ImageSequence.Iterator(gif)]
    steps = [name for mode in modes.values() for name, _ in mode['steps']]
    assert len(shots) == len(steps), f"{action['key']}: preview has {len(shots)} frames for {len(steps)} script steps"
    return {name: shots[steps.index(name)] for name in names}


def background_index(frames):
    """Use explicit transparency when available, otherwise the shared screen-border majority.

    Indices stay in the original palette so TEAM overrides retain their meaning.
    """
    transparent, border = set(), Counter()
    for image in frames.values():
        alpha = image.info.get('transparency')
        if isinstance(alpha, int):
            transparent.add(alpha)
        elif isinstance(alpha, bytes):
            transparent.update(i for i, value in enumerate(alpha) if value == 0)
            if any(value not in (0, 255) for value in alpha):
                raise ValueError('Partial palette transparency is unsupported')
        width, height = image.size
        px = image.load()
        border.update(px[x, y] for y in range(height) for x in range(width)
                      if min(x, y, width-1-x, height-1-y) < 2)
    if transparent:
        if len(transparent) != 1:
            raise ValueError(f'Inconsistent transparent palette indices: {transparent}')
        background = transparent.pop()
    else:
        background, count = border.most_common(1)[0]
        if count <= border.total()/2:
            raise ValueError('No majority background on the screen border')
    if background not in range(16):
        raise ValueError(f'Background index {background} exceeds the FE palette')
    return background


def load_frames(action, modes, names):
    folder = action['folder']
    files = prefetch([f'{folder}/{name}' for name in names])
    lost = [name for name in names if not files[f'{folder}/{name}']]
    shots = from_preview(action, modes, lost) if lost else {}
    frames, palette = {}, None
    for name in names:
        if name in lost:
            continue
        image = Image.open(files[f'{folder}/{name}'])
        assert image.mode == 'P' and image.size[1] == SCREEN[1], f'{folder}/{name}: expected an indexed GBA frame'
        palette = palette or image.getpalette()[:48]
        frames[name] = image.crop((0, 0, *SCREEN))
    if shots:
        # Keep original GIF indices if no PNG is available; sorted RGB colours would invalidate TEAM.
        if palette is None:
            with Image.open(fetch(f"{folder}/{action['stem']}.gif")) as gif:
                palette = gif.getpalette()
            if palette is None or len(palette) < 48:
                raise ValueError(f'{folder}: preview lacks a 16-colour indexed palette')
            palette = palette[:48]
            known = {tuple(palette[i:i+3]) for i in range(0, 48, 3)}
            if any(rgb not in known for shot in shots.values() for rgb in shot.getdata()):
                raise ValueError(f'{folder}: preview colours exceed its original FE palette')
        colours = [tuple(palette[i:i+3]) for i in range(0, len(palette), 3)]
        nearest = {}
        for name, shot in shots.items():
            indexed = Image.new('P', SCREEN)
            indexed.putpalette(palette)
            indexed.putdata([nearest.setdefault(rgb, min(range(len(colours)), key=lambda i: sum((a-b)**2 for a, b in zip(rgb, colours[i]))))
                             for rgb in shot.getdata()])
            frames[name] = indexed
    background = background_index(frames)
    for name, frame in frames.items():
        # A few source frames carry stray lines on the screen border; no body ever reaches it.
        px = frame.load()
        for x in range(SCREEN[0]):
            for y in range(SCREEN[1]):
                if min(x, y, SCREEN[0]-1-x, SCREEN[1]-1-y) < 2:
                    px[x, y] = background
    palettes = {tuple(image.getpalette()[:48]) for image in frames.values()}
    assert len(palettes) == 1, f'{folder}: frames disagree on the palette'
    palette = list(palettes.pop())
    if any(any(image.histogram()[16:]) for image in frames.values()):
        raise ValueError(f'{folder}: frame pixels exceed the 16-colour FE palette')
    return frames, [tuple(palette[i:i+3]) for i in range(0, 48, 3)], len(lost), background


def guess_team(colours, frames, background):
    """The most-used family of strongly saturated colours outside skin, gold and leather hues."""
    counts = [0]*16
    for image in frames.values():
        for index, count in enumerate(image.histogram()[:16]):
            counts[index] += count
    families = [(185, 255), (260, 320), (85, 160), (340, 375)]  # blue, purple, green, red
    best = (0, [])
    for low, high in families:
        members = []
        for i in range(16):
            if i == background:
                continue
            h, s, v = colorsys.rgb_to_hsv(*(c/255 for c in colours[i]))
            hue = h*360 if h*360 >= low else h*360+360
            if counts[i] and s >= 0.4 and v >= 0.25 and low <= hue <= high:
                members.append(i)
        weight = sum(counts[i] for i in members)
        if weight > best[0]:
            best = (weight, members)
    return best[1]


def clip(mode, order):
    """Script steps -> a clip. Contact attacks land on C1A/C08/C0A/C09/C0C (fallback C04); shots launch on C05 and land when
    FE waits for the HP bar (C01). The frame shown while the HP drains is held a little longer."""
    steps, marks = mode['steps'], mode['marks']
    if not steps:
        raise ValueError('Cannot build an attack clip without frames')
    frames = [order[name] for name, _ in steps]
    durations = [round(ticks*TICK_MS) for _, ticks in steps]
    last = len(frames)-1
    contact = next((marks[c] for c in ('1A', '08', '0A', '09', '0C', '04') if c in marks and marks[c] <= last), None)
    if contact is not None:
        hit = contact
        release = max(0, min(marks.get('04', hit), hit)-1)
        recover = min(max(marks.get('01', hit+1), hit+1), len(frames))
        durations[recover-1] += HP_WAIT_MS
    else:
        release = min(marks.get('05', len(frames)//2), last)
        hit = min(max(marks.get('01', release+1), release+1), last)
        recover = hit+1
        durations[hit] += HP_WAIT_MS
    windup = min(1, release)
    return dict(frames=frames, durationsMs=durations, windup=windup, release=release, hit=hit, recover=recover), contact is not None


def loop(mode, order):
    return dict(frames=[order[name] for name, _ in mode['steps']], durationsMs=[round(t*TICK_MS) for _, t in mode['steps']])


def convert(action, out=None):
    """One pack action (folder + script) -> atlas, mask and its clips."""
    out = OUT if out is None else out
    folder, stem = action['folder'], action['stem']
    modes = parse_script(fetch(f'{folder}/{stem}.txt').read_text(encoding='utf-8', errors='replace'))
    usable = lambda n: modes.get(n) if modes.get(n) and modes[n]['steps'] else None
    attack, critical, dodge, stand = usable(1), usable(3), usable(7), usable(9)
    assert attack, f'{folder}: missing Mode 1 (normal attack)'
    ranged, ranged_critical = usable(5), usable(6)
    used = [m for m in (stand, attack, critical, dodge, ranged, ranged_critical) if m]
    order = {}
    for mode in used:
        for name, _ in mode['steps']:
            order.setdefault(name, len(order))
    frames, colours, filled, background = load_frames(action, modes, order)
    team = TEAM.get(action['key']) or TEAM.get(action['pack']) or guess_team(colours, frames, background)
    if background in team:
        raise ValueError(f"{action['key']}: TEAM includes background index {background}")
    # Lightest first, each team shade takes the nearest faction shade that is no lighter than the last one,
    # so two or three team shades keep their contrast.
    luma = lambda rgb: 0.299*rgb[0]+0.587*rgb[1]+0.114*rgb[2]
    ramp, roles, floor = ['l', 'a', 'A'], {}, 0
    for i in sorted(team, key=lambda i: -luma(colours[i])):
        step = min(range(floor, 3), key=lambda r: abs(luma(hexrgb(FACTION[ramp[r]]))-luma(colours[i])))
        roles[i], floor = ramp[step], min(step+1, 2)
    # Facing right like our sprites; the shared crop keeps every frame on the same ground point.
    flipped = {name: image.transpose(Image.Transpose.FLIP_LEFT_RIGHT) for name, image in frames.items()}
    opaque = lambda image: image.point([0 if i == background else 255 for i in range(256)], 'L')
    boxes = [box for box in (opaque(image).getbbox() for image in flipped.values()) if box]
    if not boxes:
        raise ValueError(f"{action['key']}: all frames are blank")
    left, top = min(b[0] for b in boxes)-1, min(b[1] for b in boxes)-1
    right, bottom = max(b[2] for b in boxes)+1, max(b[3] for b in boxes)+1
    width, height = right-left, bottom-top
    base = opaque(flipped[(stand or attack)['steps'][0][0]]).getbbox()
    if base is None:
        raise ValueError(f"{action['key']}: standing frame is blank")
    columns = 8
    sheet = Image.new('RGBA', (columns*width, ((len(order)+columns-1)//columns)*height))
    mask = Image.new('L', sheet.size)
    lookup = [(*colour, 0 if i == background else 255) for i, colour in enumerate(colours)]
    for i, role in roles.items():
        lookup[i] = (*hexrgb(FACTION[role]), 255)
    for name, index in order.items():
        cell = flipped[name].crop((left, top, right, bottom))
        x, y = (index % columns)*width, (index//columns)*height
        rgba = Image.new('RGBA', cell.size)
        rgba.putdata([lookup[v] for v in cell.getdata()])
        sheet.paste(rgba, (x, y))
        tags = Image.new('L', cell.size)
        tags.putdata([ROLE[roles[v]] if v in roles else 0 for v in cell.getdata()])
        mask.paste(tags, (x, y))
    sheet.save(out/f"{action['name']}.png", optimize=True)
    mask.save(out/f"{action['name']}-mask.png", optimize=True)
    main_clip, contact = clip(attack, order)
    result = dict(file=f"{action['name']}.png", mask=f"{action['name']}-mask.png", team=team, filled=filled,
                  frameSize=[width, height], columns=columns, frames=len(order),
                  origin=[round((base[0]+base[2])/2)-left, base[3]-top],
                  # How far the standing body is from the screen centre: FE spaces the two combatants
                  # this far apart, and every drawn dash is meant to reach the opponent from there.
                  stand=round(SCREEN[0]/2-(base[0]+base[2])/2),
                  contact=contact, idle=loop(stand, order) if stand else dict(frames=[0], durationsMs=[1000]), attack=main_clip)
    if critical:
        result['critical'] = clip(critical, order)[0]
    if dodge:
        result['dodge'] = loop(dodge, order)
    # Thrown and magic follow-ups of a melee pack (Mode 5/6) play when the opponent stands a tile away.
    if contact and ranged and len(ranged['steps']) >= 3 and '05' in ranged['marks']:
        result['ranged'] = clip(ranged, order)[0]
        if ranged_critical and '05' in ranged_critical['marks']:
            result['rangedCritical'] = clip(ranged_critical, order)[0]
    return result


def slug(text):
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def plan():
    """Pack actions to convert and the (class, weapon) pairs that use them, straight from the class map."""
    data = json.loads(CLASS_MAP.read_text())
    sources = {s['id']: s for s in data['sources']}
    gifs = {g['key']: g for g in data['gifs']}
    studies = {s['id']: s for s in json.loads(STUDIES.read_text())['sprites']}
    actions, uses = {}, []
    for entry in data['classes']:
        for weapon in entry['weapons']:
            if weapon not in SKIP_WEAPONS and not entry['weaponMap'].get(weapon):
                raise ValueError(f"{entry['classId']}: missing attack mapping for {weapon}")
        for weapon, key in entry['weaponMap'].items():
            if weapon in SKIP_WEAPONS:
                continue
            if not key:
                raise ValueError(f"{entry['classId']}: missing attack mapping for {weapon}")
            if key.startswith('P01:'):
                sheet = studies.get(key.split(':', 1)[1])
                if not sheet or (sheet['classId'], sheet['weapon']) != (entry['classId'], weapon):
                    raise ValueError(f'{key}: missing or mismatched project animation')
                for asset in ('file', 'mask'):
                    if not (STUDIES.parent/sheet[asset]).is_file():
                        raise ValueError(f'{key}: missing project {asset}')
                continue
            if key not in actions:
                url = gifs[key]['url']
                if not url.startswith(RAW) or not url.endswith('.gif'):
                    raise ValueError(f'{key}: expected a GIF URL pinned to {REV}')
                path = source_path(urllib.parse.unquote(url[len(RAW):]))
                folder, gif = path.rsplit('/', 1)
                pack = key.split(':', 1)[0]
                actions[key] = dict(key=key, pack=pack, folder=folder, stem=gif[:-len('.gif')],
                                    name=f"{pack.lower()}-{slug(key.split(':', 1)[1])}")
            source = sources[actions[key]['pack']]
            attribution = source.get('attribution') or source.get('fullCredits') or source['creditsVerbatim']
            uses.append(dict(classId=entry['classId'], weapon=weapon, key=key, attribution=attribution))
    return data, sources, actions, uses


def main():
    # Stage on each destination's filesystem so individual replacements are atomic.
    # A conversion failure leaves every published asset and the imports untouched.
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.fe-anims-', dir=OUT.parent) as temp:
        stage = Path(temp)
        build(stage, stage/'fe-anim-files.ts')
        with tempfile.NamedTemporaryFile(prefix='.fe-anim-files-', dir=IMPORTS.parent, delete=False) as handle:
            staged_imports = Path(handle.name)
        try:
            staged_imports.write_bytes((stage/'fe-anim-files.ts').read_bytes())
            OUT.mkdir(exist_ok=True)
            for path in sorted(stage.iterdir()):
                if path.name != 'fe-anim-files.ts':
                    path.replace(OUT/path.name)
            staged_imports.replace(IMPORTS)
        finally:
            staged_imports.unlink(missing_ok=True)


def build(out, imports):
    data, sources, actions, uses = plan()
    prefetch([f"{a['folder']}/{a['stem']}.txt" for a in actions.values()])
    converted = {}
    for key, action in sorted(actions.items()):
        converted[key] = convert(action, out)
        c = converted[key]
        notes = ['contact' if c['contact'] else 'shot'] + (['ranged'] if 'ranged' in c else []) + ([f"{c['filled']} from preview"] if c['filled'] else [])
        print(f"{action['name']}: {c['frames']} frames {c['frameSize'][0]}x{c['frameSize'][1]}, team {c['team']}, {', '.join(notes)}")
    anims = []
    for use in uses:
        action, c = actions[use['key']], converted[use['key']]
        anims.append(dict(id=f"fe-{use['classId']}-{use['weapon']}", classId=use['classId'], weapon=use['weapon'], source=use['key'],
                          scale=3, projectile=False, inPlace=True, reacts=True,
                          **{k: v for k, v in c.items() if k not in ('team', 'filled')}))
    packs = sorted({action['pack'] for action in actions.values()}, key=lambda s: int(s[1:]))
    credits = [dict(pack=pack, title=sources[pack]['title'], attribution=next(u['attribution'] for u in uses if u['key'].startswith(pack+':')),
                    creditsVerbatim=sources[pack].get('fullCredits', sources[pack]['creditsVerbatim']),
                    url=sources[pack]['upstreamUrl']) for pack in packs]
    (out/'anims.json').write_text(json.dumps(dict(revision=REV, repository='https://github.com/Klokinator/FE-Repo', tickMs=TICK_MS,
                                                  credits=credits, anims=anims), ensure_ascii=False, indent=1)+'\n')
    # F2U/F2E asks for credit: each pack's credits verbatim, with the pinned source and where it is used.
    lines = ['# 交战动画素材署名', '',
             f'下列动画包取自 [FE-Repo](https://github.com/Klokinator/FE-Repo)（固定版本 `{REV}`），按社区 F2U/F2E 规则改编使用：'
             '水平翻转为朝右、裁切并清理屏幕边缘杂线，阵营色换成本作的阵营色；保留脚本帧序，以 60 Hz 换算并取整时长，'
             '命中后为血条变化额外停留 320 毫秒。标注 IS 的原作动画版权属于 Nintendo / Intelligent Systems；'
             '本作为非商业同人项目。游戏内的「设置 · 美术鸣谢」列出同样的作者。', '']
    for credit in credits:
        used = [f"{u['classId']} · {u['weapon']}" for u in uses if u['key'].startswith(credit['pack']+':')]
        lines += [f"## {credit['title']}", '', f"来源：<{credit['url']}>", '', f"用于：{'、'.join(used)}", '',
                  '```text', credit['creditsVerbatim'].strip(), '```', '']
    (out/'CREDITS.md').write_text('\n'.join(lines))
    # Static imports so the bundler ships every atlas and mask (and Node tests can load the module).
    files = sorted({name for c in converted.values() for name in (c['file'], c['mask'])})
    lines = ['// Generated by design/pixel-art/gen_fe_anims.py: converted FE-Repo atlases and their faction masks.']
    lines += [f"import file{i} from '../../../design/pixel-art/fe-anims/{name}';" for i, name in enumerate(files)]
    lines += ['', 'export const FE_ANIM_FILES: Record<string, string> = {']
    lines += [f"  '{name}': file{i}," for i, name in enumerate(files)]
    lines += ['};', '']
    imports.write_text('\n'.join(lines))
    print(f'{len(anims)} class actions from {len(actions)} pack actions in {len(packs)} packs')


if __name__ == '__main__':
    main()
