#!/usr/bin/env python3
"""AgentTactics pixel art generator.

Writes 1x PNGs to ROOT/png (scaled up in the UI with image-rendering: pixelated):
  unit_<class>_<side>.png  16x16 map sprites (ally faces right, enemy faces left)
  por_<key>.png            32x32 portraits
  ico_<key>.png            16x16 item/weapon/action icons, 12x12 resource icons
  crest_<key>.png          24x24 legion crests
  map_<key>.png            terrain maps, 16px tiles
  fight_<key>.png          44x44 side-view combat sprites, plus fx_spark and stage_pass
and two review sheets to ROOT: contact.png (4x) and contact_maps.png (2x).
Every random draw is seeded, so the output is identical on each run.

Usage: python3 gen_art.py [ROOT]    ROOT defaults to this script's directory.
"""
import math
import os
import random
import sys

from PIL import Image

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, 'png')
os.makedirs(OUT, exist_ok=True)


def C(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), 255)


OL = C('#2B2421')
CLEAR = (0, 0, 0, 0)


def mix(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (c[3],)


def outline(img, color=OL):
    w, h = img.size
    px = img.load()
    solid = {(x, y) for y in range(h) for x in range(w) if px[x, y][3]}
    for y in range(h):
        for x in range(w):
            if (x, y) in solid:
                continue
            if any((x + dx, y + dy) in solid for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = color
    return img


def from_grid(rows, pal):
    w, h = len(rows[0]), len(rows)
    img = Image.new('RGBA', (w, h), CLEAR)
    px = img.load()
    for y, row in enumerate(rows):
        assert len(row) == w, f'row {y} has {len(row)} chars: {row!r}'
        for x, ch in enumerate(row):
            if ch != '.':
                px[x, y] = pal[ch]
    return img


BASE = {k: C(v) for k, v in {
    's': '#F0C8A0', 'S': '#CC9270', 'e': '#2B2421',
    'm': '#E4E8E6', 'M': '#A0A8AC', 'n': '#5E666C',
    'w': '#9A683C', 'W': '#5E3E24',
    'y': '#D4AA52', 'Y': '#8E6C2E',
    'k': '#F0EADF', 'K': '#BFB5A4',
    'b': '#4E3A2C',
    'r': '#B4835A', 'R': '#7C5636', 'q': '#4A3020',
    'p': '#F6F3EC', 'P': '#C9C3B8', 'f': '#AFC2D0',
    't': '#A2423A', 'T': '#6A2A24',
    'g': '#7CC6DA',
    'v': '#C8584E', 'V': '#8E3A34',
    'u': '#8A68B0', 'U': '#5A4278',
    'd': '#DDB868', 'D': '#B08A42',
    'G': '#D4E4EC',
    'h': '#6B4A2E', 'H': '#4A321E',
    'a': '#3F6B8C', 'A': '#284A63', 'l': '#7FA9C6',
    'x': '#B0473C', 'X': '#74302A',
}.items()}

FACTIONS = {
    'ally': {'a': '#3F6B8C', 'A': '#284A63', 'l': '#7FA9C6'},
    'enemy': {'a': '#B0473C', 'A': '#74302A', 'l': '#DA7E66'},
}

# ---------------------------------------------------------------- unit sprites
UNITS = {
    'sword': [
        "................",
        "............m...",
        ".....hhhh...m...",
        "....hhhhhh..m...",
        "...hhhhsss..m...",
        "..hhhhsses..m...",
        "..h.hssssS..m...",
        "......ss...yyy..",
        "....aalaaaaas...",
        "...Aaalaaaa.y...",
        "...sWWWyWWW.....",
        "....AAAAAAA.....",
        ".....WW.WW......",
        ".....WW.WW......",
        "....bbb.bbb.....",
        "................",
    ],
    'axe': [
        "................",
        "............nMm.",
        ".....hhhh..nwMm.",
        "...aaaaaaa..wMm.",
        "....hhssss..wn..",
        "....hsssess.w...",
        "....hSssss..w...",
        "......sss...w...",
        "...ssaaaaasss...",
        "...saaalaas.w...",
        "...sWWWyWWW.w...",
        "....AAAAAAA.....",
        ".....AA.AA......",
        ".....AA.AA......",
        "....bbb.bbb.....",
        "................",
    ],
    'armor': [
        "................",
        ".....aa......m..",
        ".....MmMM....m..",
        "....MmmMMMM..M..",
        "....MMMMMMM..w..",
        "....MMMnnnn..w..",
        "....MMMMMMn..w..",
        ".....nnnnn...w..",
        "..MmMaaaaYyyYw..",
        "..MMnalaayaayM..",
        "...nMYyYYykayw..",
        "....nMMMMyaayw..",
        "....MM.MM.yy.w..",
        "....nn.nn....w..",
        "...nnn.nnn......",
        "................",
    ],
    'cav': [
        "................",
        ".....hhh.m......",
        "....hhhhhm......",
        "....hhsssM......",
        "....hssesw......",
        ".....sss.w.R....",
        "....alaaawqrr...",
        "....aaaaasqrer..",
        "....AAAAAwqrrrR.",
        ".qrraaaaarrr....",
        ".qrrrrArrrrr....",
        ".qRrrrbrrrrR....",
        "..RRR....RRR....",
        "..R.R....R.R....",
        "..n.n....n.n....",
        "................",
    ],
    'peg': [
        "................",
        ".....hhh.m......",
        "..P.hhhhhm......",
        ".PpphhsssM......",
        ".Ppphssesw......",
        ".Ppppsss.w.P....",
        "..ppalaaawfpp...",
        "...paaaaasfpep..",
        "...PAAAAAwfpppP.",
        ".fppaaaaappp....",
        ".fppppAppppp....",
        ".fPpppbppppP....",
        "..PPP....PPP....",
        "..P.P....P.P....",
        "..n.n....n.n....",
        "................",
    ],
    'archer': [
        "................",
        "................",
        ".....hhhh.W.....",
        "....hhhhhhKw....",
        "..m.hhhsssK.w...",
        "..mmhhssesK.w...",
        "..WWhssssSK.s...",
        "..WW..ss..Kaw...",
        "..WWaalaaaaaw...",
        "..WWaalaaaKw....",
        "..W.WWWyWWW.....",
        "....AAAAAA......",
        ".....WW.WW......",
        ".....WW.WW......",
        "....bbb.bbb.....",
        "................",
    ],
    'mage': [
        "................",
        ".........A......",
        "........AA......",
        "......AlAA......",
        ".....yyyyyy.....",
        "...AAAAAAAAA....",
        "....hhsses......",
        "....hssssS......",
        "....aayyaattt...",
        "...aalaaastkt...",
        "...aalaaaattt...",
        "...AAAAAAA......",
        "..aaalaaaaa.....",
        "..aaalaaaaa.....",
        "..AAAAAAAAA.....",
        "................",
    ],
    'cleric': [
        "................",
        "............y...",
        ".....hhhh..ygy..",
        "....hhhhhh..y...",
        "....hhhsss..w...",
        "....hhsses..w...",
        "....hssssS..w...",
        "......ss....w...",
        "....kakkakkks...",
        "...kkakkakk.w...",
        "...kyyyyyyk.w...",
        "...kkakkakk.w...",
        "..kkkakkakkk.w..",
        "..KkkakkakkK.w..",
        "..KKKKKKKKKK....",
        "................",
    ],
}

UNIT_HAIR_ALLY = {
    'sword': ('#9A4430', '#64281C'), 'axe': ('#C99A4A', '#8E6A2E'),
    'armor': ('#6B4A2E', '#4A321E'), 'cav': ('#B4B2AA', '#77756E'),
    'peg': ('#E6D49A', '#B09C62'), 'archer': ('#6B4A2E', '#4A321E'),
    'mage': ('#5E4A78', '#3A2C4E'), 'cleric': ('#DAD8D2', '#A09E96'),
}
UNIT_HAIR_ENEMY = ('#3E3430', '#26201C')


def build_units():
    out = {}
    for cls, rows in UNITS.items():
        for side in ('ally', 'enemy'):
            pal = dict(BASE)
            for k, v in FACTIONS[side].items():
                pal[k] = C(v)
            hc = UNIT_HAIR_ALLY[cls] if side == 'ally' else UNIT_HAIR_ENEMY
            pal['h'], pal['H'] = C(hc[0]), C(hc[1])
            img = outline(from_grid(rows, pal))
            if side == 'enemy':
                img = img.transpose(Image.FLIP_LEFT_RIGHT)
            name = f'unit_{cls}_{side}'
            img.save(f'{OUT}/{name}.png')
            out[name] = img
    return out


# ---------------------------------------------------------------- portraits
HEAD = {5: (13, 18), 6: (12, 19), 7: (10, 21), 8: (9, 22), 9: (8, 23), 10: (8, 23), 11: (8, 23),
        12: (8, 23), 13: (8, 23), 14: (8, 23), 15: (8, 23), 16: (8, 23), 17: (9, 23),
        18: (10, 23), 19: (11, 22), 20: (12, 22), 21: (14, 21), 22: (16, 20)}
SHOULDER = {24: (11, 20), 25: (8, 23), 26: (6, 25), 27: (4, 27), 28: (3, 28), 29: (2, 29),
            30: (1, 30), 31: (1, 30)}
HEADSET = {(x, y) for y, (l, r) in HEAD.items() for x in range(l, r + 1)}
SHOULDERSET = {(x, y) for y, (l, r) in SHOULDER.items() for x in range(l, r + 1)}
SCLERA = C('#FAF6EC')
MOUTH = C('#9A4C44')


def vneck(x, y, depth):
    return y < 24 + depth and abs(x - 15.5) <= (24 + depth - y) * 0.9


def crown():
    return {(x, y) for (x, y) in HEADSET if y <= 9} | {(x, 4) for x in range(14, 18)}


def bangs(bottom):
    return {(x, y) for x, yb in bottom.items() for y in range(10, yb + 1)}


def zigzag_top(apexes, x0, x1, ybot):
    s = set()
    for x in range(x0, x1 + 1):
        top = min(ay + abs(x - ax) for ax, ay in apexes)
        for y in range(top, ybot + 1):
            s.add((x, y))
    return s


def st_ponytail(sp):
    f = crown() | bangs({9: 12, 10: 12, 11: 11, 12: 11, 13: 10, 14: 11, 15: 12, 16: 11, 17: 10,
                         18: 11, 19: 10, 20: 11, 21: 12, 22: 12, 23: 13})
    f |= {(x, y) for x in range(7, 11) for y in range(10, 13)}
    tail = {7: (6, 9), 8: (5, 9), 9: (4, 8), 10: (3, 8), 11: (3, 7), 12: (2, 7), 13: (2, 6), 14: (2, 6),
            15: (2, 6), 16: (2, 6), 17: (3, 6), 18: (3, 6), 19: (3, 5), 20: (4, 5), 21: (4, 5), 22: (4, 4)}
    back = {(x, y) for y, (a, b) in tail.items() for x in range(a, b + 1)}
    return f, back


def st_spiky(sp):
    f = zigzag_top([(9, 6), (11, 3), (14, 2), (17, 3), (20, 2), (23, 5)], 8, 23, 9) & (HEADSET | {(x, y) for x in range(7, 25) for y in range(1, 10)})
    f |= bangs({9: 12, 10: 11, 11: 12, 12: 11, 13: 12, 14: 11, 15: 10, 16: 12, 17: 11, 18: 10,
                19: 11, 20: 12, 21: 11, 22: 12, 23: 12})
    f |= {(x, y) for x in range(7, 10) for y in range(10, 13)}
    return f, set()


def st_slick(sp):
    f = {(x, y) for (x, y) in HEADSET if y <= 8}
    f |= {(x, 4) for x in range(14, 18)}
    f |= {(x, y) for (x, y) in HEADSET if x <= 10 and y <= 15}
    f |= {(x, 9) for x in range(8, 13)} | {(x, 9) for x in range(19, 24)}
    return f, set()


def st_bob(sp):
    f = crown() | bangs({9: 12, 10: 12, 11: 11, 12: 11, 13: 10, 14: 11, 15: 11, 16: 10, 17: 11,
                         18: 11, 19: 10, 20: 11, 21: 12, 22: 13, 23: 14})
    f |= {(x, y) for x in range(7, 11) for y in range(10, 20)}
    f |= {(x, y) for x in range(22, 24) for y in range(10, 18)}
    f |= {(x, 20) for x in range(8, 11)}
    back = {(x, y) for x in range(7, 10) for y in range(17, 22)}
    return f, back


def st_long(sp):
    f = crown() | bangs({9: 12, 10: 12, 11: 11, 12: 11, 13: 11, 14: 10, 15: 9, 16: 10, 17: 11,
                         18: 11, 19: 11, 20: 12, 21: 12, 22: 13, 23: 14})
    f |= {(x, y) for x in range(6, 11) for y in range(10, 23)}
    f |= {(x, y) for x in range(22, 25) for y in range(10, 21)}
    back = {(x, y) for x in range(4, 11) for y in range(18, 31)} | {(x, y) for x in range(21, 28) for y in range(19, 31)}
    return f, back


def st_neat(sp):
    f = crown() | bangs({9: 12, 10: 11, 11: 11, 12: 11, 13: 11, 14: 10, 15: 10, 16: 10, 17: 10, 18: 10})
    f |= {(x, y) for x in range(7, 11) for y in range(10, 14)}
    f |= {(22, 10), (23, 10), (23, 11)}
    return f, set()


def st_bald(sp):
    f = {(x, y) for (x, y) in HEADSET if x <= 10 and 9 <= y <= 13}
    return f, set()


def st_wild(sp):
    f = zigzag_top([(8, 5), (10, 2), (13, 3), (16, 1), (19, 3), (22, 2), (24, 6)], 7, 24, 9)
    f |= bangs({9: 13, 10: 12, 11: 11, 12: 12, 13: 11, 14: 10, 15: 12, 16: 11, 17: 10, 18: 11,
                19: 12, 20: 10, 21: 11, 22: 13, 23: 13})
    f |= {(x, y) for x in range(7, 11) for y in range(10, 14)}
    back = zigzag_top([(3, 6), (2, 10), (3, 14), (4, 18), (6, 21)], 1, 9, 22)
    back = {(x, y) for (x, y) in back if y >= 5}
    back = set()
    for y in range(5, 23):
        reach = [3, 2, 2, 1, 2, 3, 2, 1, 2, 3, 3, 2, 3, 4, 4, 5, 6, 7][y - 5]
        for x in range(reach, 10):
            back.add((x, y))
    return f, back


def st_braid(sp):
    f = crown() | bangs({9: 12, 10: 11, 11: 12, 12: 11, 13: 10, 14: 11, 15: 11, 16: 10, 17: 11,
                         18: 12, 19: 11, 20: 10, 21: 11, 22: 12, 23: 13})
    f |= {(x, y) for x in range(7, 11) for y in range(10, 14)}
    braid = set()
    for y in range(14, 31):
        w = 2 if y < 18 else 3
        x0 = 22 if y < 18 else 21
        for x in range(x0, x0 + w):
            braid.add((x, y))
    return f | braid, set()


def st_swept(sp):
    f = crown() | bangs({9: 13, 10: 13, 11: 13, 12: 13, 13: 12, 14: 12, 15: 11, 16: 11, 17: 10,
                         18: 10, 19: 10, 20: 11, 21: 11, 22: 12, 23: 12})
    f |= {(x, y) for x in range(7, 11) for y in range(10, 15)}
    return f, set()


def st_helm(sp):
    return set(), set()


HAIR_STYLES = {'ponytail': st_ponytail, 'spiky': st_spiky, 'slick': st_slick, 'bob': st_bob,
               'long': st_long, 'neat': st_neat, 'bald': st_bald, 'wild': st_wild,
               'braid': st_braid, 'swept': st_swept, 'helm': st_helm, 'hood': st_neat}


def shade_cloth(x, y, base, shade, light):
    l, r = SHOULDER[y]
    if x <= l + 1 or x < 8:
        return shade
    if x >= r - 1 and y >= 27:
        return mix(base, 0.92)
    if 18 <= x <= 20 and y >= 26:
        return light
    return base


def of_tunic(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    for (x, y) in SHOULDERSET:
        if vneck(x, y, 3):
            if y >= 25:
                p[(x, y)] = C('#ECE4D4') if x > 15 else C('#CFC4B0')
            continue
        p[(x, y)] = shade_cloth(x, y, base, shade, light)
    for x, y in ((15, 27), (16, 27)):
        p[(x, y)] = trim
    for i in range(14):
        x, y = 5 + i, 31 - (i * 6) // 13
        if (x, y) in SHOULDERSET and not vneck(x, y, 3):
            p[(x, y)] = C('#6E4A2E')
    for x in range(8, 24):
        if (x, 25) in p and not vneck(x, 25, 3):
            p[(x, 25)] = mix(p[(x, 25)], 0.8)


def of_vest(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    skin, skinS = C(sp['skin'][0]), C(sp['skin'][1])
    for (x, y) in SHOULDERSET:
        l, r = SHOULDER[y]
        if x <= l + 3 or x >= r - 3:
            p[(x, y)] = skinS if x <= l + 1 else skin
        elif vneck(x, y, 4):
            p[(x, y)] = skin if x > 14 else skinS
        else:
            p[(x, y)] = shade_cloth(x, y, base, shade, light)
    for y in range(26, 32):
        p[(13, y)] = trim if y % 2 else shade
        p[(18, y)] = trim if y % 2 == 0 else shade


def of_armor(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    steel, steelL, steelD = C('#A6AEB2'), C('#DCE2E4'), C('#626A70')
    for (x, y) in SHOULDERSET:
        l, r = SHOULDER[y]
        if vneck(x, y, 2):
            continue
        if x <= 9 or x >= 22:
            c = steel
            if y in (25, 26) or (x in (l, l + 1)):
                c = steelD if x <= 9 else steel
            if y == 26 and 4 <= x <= 9 or y == 26 and 22 <= x <= 27:
                c = steelL
            p[(x, y)] = c
        else:
            p[(x, y)] = steel if y < 27 else (light if 14 <= x <= 17 else base)
    for x in range(10, 22):
        p[(x, 27)] = trim
    for y in range(28, 32):
        for x in (1, 2, 29, 30):
            if (x, y) in SHOULDERSET:
                p[(x, y)] = shade


def of_light(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    for (x, y) in SHOULDERSET:
        if vneck(x, y, 2):
            if y >= 24:
                p[(x, y)] = C('#E8E2D6')
            continue
        c = shade_cloth(x, y, base, shade, light)
        if 10 <= x <= 21 and y >= 27:
            c = light if 13 <= x <= 18 else C('#7FA2B8')
        p[(x, y)] = c
    for x in range(10, 22):
        if (x, 26) in SHOULDERSET:
            p[(x, 26)] = trim


def of_cloak(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    for (x, y) in SHOULDERSET:
        p[(x, y)] = shade_cloth(x, y, base, shade, light)
    for y in range(22, 26):
        for x in range(10, 22):
            if (x, y) not in HEADSET:
                p[(x, y)] = base if x > 13 else shade
    for i in range(16):
        x, y = 22 - i, 24 + (i * 7) // 15
        if (x, y) in SHOULDERSET:
            p[(x, y)] = C('#6E4A2E')
    p[(15, 25)] = trim
    p[(16, 25)] = trim


def of_robe(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    for (x, y) in SHOULDERSET:
        p[(x, y)] = shade_cloth(x, y, base, shade, light)
    for y in range(23, 27):
        for x in range(11, 21):
            if (x, y) not in HEADSET and abs(x - 15.5) <= 5 - (y - 23) * 0.4:
                p[(x, y)] = trim if abs(x - 15.5) >= 4 - (y - 23) * 0.4 else base
    for y in range(26, 32):
        p[(15, y)] = trim
        p[(16, y)] = trim if y % 3 else light


def of_priest(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    stole = C(sp.get('stole', '#34556B'))
    for (x, y) in SHOULDERSET:
        if vneck(x, y, 2):
            continue
        p[(x, y)] = shade_cloth(x, y, base, shade, light)
    for y in range(24, 32):
        for x in (11, 12, 19, 20):
            if (x, y) in SHOULDERSET and not vneck(x, y, 2):
                p[(x, y)] = stole if x in (12, 19) else mix(stole, 0.75)
    p[(12, 28)] = trim
    p[(19, 28)] = trim


def of_plate(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    for (x, y) in SHOULDERSET:
        l, r = SHOULDER[y]
        c = base
        if x <= l + 2:
            c = shade
        elif y in (26,) or (y == 27 and 6 <= x <= 25):
            c = light if x > 15 else base
        if (x, y) in {(6, 28), (25, 28), (9, 30), (22, 30)}:
            c = trim
        p[(x, y)] = c
    for y in range(22, 25):
        for x in range(12, 20):
            if (x, y) not in HEADSET:
                p[(x, y)] = shade if x < 15 else base


def of_scarf(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    for (x, y) in SHOULDERSET:
        p[(x, y)] = shade_cloth(x, y, base, shade, light)
    for x in range(9, 23):
        p[(x, 24)] = trim
        p[(x, 25)] = mix(trim, 0.8)


def of_fur(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    fur, furD = C('#B08A60'), C('#7C5C3C')
    for (x, y) in SHOULDERSET:
        p[(x, y)] = shade_cloth(x, y, base, shade, light)
    for y in range(24, 28):
        l, r = SHOULDER[y]
        for x in range(l, r + 1):
            if (x + y) % 3 == 0:
                p[(x, y)] = furD
            else:
                p[(x, y)] = fur


OUTFITS = {'tunic': of_tunic, 'vest': of_vest, 'armor': of_armor, 'light': of_light,
           'cloak': of_cloak, 'robe': of_robe, 'priest': of_priest, 'plate': of_plate,
           'scarf': of_scarf, 'fur': of_fur}


def draw_portrait(sp):
    skin, skinS = C(sp['skin'][0]), C(sp['skin'][1])
    hair, hairL, hairD = [C(c) for c in sp['hair']]
    eyeC, eyeD = C(sp['eye'][0]), C(sp['eye'][1])
    front, back = HAIR_STYLES[sp['style']](sp)
    p = {}
    for xy in back:
        p[xy] = hair
    for y in range(20, 26):
        for x in range(13, 19):
            p[(x, y)] = skinS if (y <= 22 or x == 13) else skin
    OUTFITS[sp['outfit']](p, sp)
    for (x, y) in HEADSET:
        l, r = HEAD[y]
        c = skin
        if x <= l + 1 and y >= 9:
            c = skinS
        if y >= 20 and x <= l + 2:
            c = skinS
        p[(x, y)] = c
    for xy in ((7, 13), (6, 14), (7, 14), (6, 15), (7, 15), (7, 16)):
        p[xy] = skin
    p[(7, 14)] = skinS
    p[(7, 15)] = skinS
    # eyes
    lid = C(sp.get('lid', '#2B2421'))
    style = sp.get('eyes', 'big')
    if style == 'big':
        for x in (12, 13, 14):
            p[(x, 13)] = lid
        p[(12, 14)], p[(13, 14)], p[(14, 14)] = eyeD, SCLERA, eyeD
        p[(12, 15)], p[(13, 15)], p[(14, 15)] = eyeC, eyeC, eyeC
        p[(18, 13)], p[(19, 13)] = lid, lid
        p[(18, 14)], p[(19, 14)] = eyeD, eyeD
        p[(18, 15)], p[(19, 15)] = eyeC, skin
        if sp.get('fem'):
            p[(11, 12)] = lid
            p[(11, 13)] = lid
    elif style == 'narrow':
        for x in (12, 13, 14):
            p[(x, 14)] = lid
        p[(13, 15)], p[(14, 15)] = eyeD, eyeC
        p[(18, 14)], p[(19, 14)] = lid, lid
        p[(18, 15)] = eyeD
    elif style == 'calm':
        for x in (12, 13, 14):
            p[(x, 13)] = lid
        p[(13, 14)], p[(14, 14)] = eyeD, eyeC
        p[(12, 14)] = SCLERA
        p[(13, 15)] = eyeC
        p[(18, 13)], p[(19, 13)] = lid, lid
        p[(18, 14)] = eyeD
    brow = C(sp.get('brow', sp['hair'][2]))
    bstyle = sp.get('brows', 'soft')
    if bstyle == 'stern':
        for xy in ((11, 11), (12, 11), (13, 12), (14, 12), (18, 12), (19, 11), (20, 11)):
            p[xy] = brow
    elif bstyle == 'heavy':
        for xy in ((11, 11), (12, 11), (13, 11), (14, 12), (12, 12), (13, 12), (18, 12), (19, 11), (20, 11), (19, 12)):
            p[xy] = brow
    else:
        for xy in ((11, 11), (12, 11), (13, 11), (14, 11), (18, 11), (19, 11), (20, 12)):
            p[xy] = brow
    p[(21, 17)] = skinS
    p[(20, 17)] = mix(skin, 0.97)
    mouth = sp.get('mouth', 'neutral')
    if mouth == 'neutral':
        p[(17, 20)], p[(18, 20)] = MOUTH, MOUTH
    elif mouth == 'smile':
        p[(16, 19)], p[(17, 20)], p[(18, 20)], p[(19, 19)] = MOUTH, MOUTH, MOUTH, MOUTH
    elif mouth == 'grim':
        p[(16, 20)], p[(17, 20)], p[(18, 20)], p[(19, 20)] = MOUTH, MOUTH, MOUTH, MOUTH
    elif mouth == 'grin':
        for x in range(16, 21):
            p[(x, 19)] = SCLERA
            p[(x, 20)] = MOUTH
        p[(15, 19)] = MOUTH
        p[(21, 19)] = MOUTH
    elif mouth == 'smirk':
        p[(17, 20)], p[(18, 20)], p[(19, 19)] = MOUTH, MOUTH, MOUTH
    if sp.get('blush'):
        p[(20, 17)] = C('#E9A08E')
        p[(12, 17)] = C('#E9A08E')
        p[(13, 17)] = C('#EDB49E')
    # front hair with shading
    for (x, y) in front:
        c = hair
        below = (x, y + 1)
        if below not in front and p.get(below) in (skin, skinS):
            c = hairD
        elif x <= 9 and y >= 10:
            c = hairD
        elif y in (6, 7) and 13 <= x <= 20 and (x + y) % 4 != 0:
            c = hairL
        elif y == 8 and 16 <= x <= 19:
            c = hairL
        p[(x, y)] = c
    for (x, y) in back:
        if p.get((x, y)) == hair and (x <= 4 or y >= 26):
            p[(x, y)] = hairD
    ACCESSORIES.get(sp.get('acc'), lambda p, sp: None)(p, sp)
    for extra in sp.get('extra', []):
        ACCESSORIES[extra](p, sp)
    img = Image.new('RGBA', (32, 32), CLEAR)
    px = img.load()
    for (x, y), c in p.items():
        if 0 <= x < 32 and 0 <= y < 32:
            px[x, y] = c
    return outline(img)


def acc_headband(p, sp):
    band, bandD = C(sp['band'][0]), C(sp['band'][1])
    for x in range(8, 24):
        if (x, 9) in HEADSET:
            p[(x, 9)] = band if x > 11 else bandD
    for xy in ((7, 9), (6, 9), (6, 10), (5, 10), (5, 11), (4, 11), (6, 11)):
        p[xy] = bandD


def acc_bandana(p, sp):
    band, bandD = C(sp['band'][0]), C(sp['band'][1])
    for y in (8, 9):
        for x in range(8, 24):
            if (x, y) in HEADSET:
                p[(x, y)] = band if (x > 11 and y == 8) else bandD if x <= 11 else band
    for xy in ((7, 9), (6, 9), (6, 10), (5, 10), (5, 11), (4, 12), (6, 11), (7, 10)):
        p[xy] = bandD
    for x in range(14, 22, 3):
        p[(x, 9)] = mix(band, 0.82)


def acc_circlet(p, sp):
    gold, goldD = C('#D4AA52'), C('#8E6C2E')
    for x in range(9, 24):
        if (x, 9) in HEADSET:
            p[(x, 9)] = gold if x > 12 else goldD
    p[(16, 9)] = C('#5FA8D0')
    p[(16, 8)] = gold


def acc_mustache(p, sp):
    hair, hairL, hairD = [C(c) for c in sp['hair']]
    for x in range(16, 22):
        p[(x, 18)] = hair if x > 17 else hairD
    p[(16, 19)] = hairD
    p[(21, 19)] = hair
    for xy in ((14, 10), (15, 10), (16, 10), (17, 10)):
        p[xy] = C(sp['skin'][1])
    p[(11, 17)] = C(sp['skin'][1])


def acc_glasses(p, sp):
    fr = C('#7A5D2A')
    ring = [(12, 12), (13, 12), (14, 12), (11, 13), (11, 14), (11, 15), (15, 13), (15, 14), (15, 15),
            (12, 16), (13, 16), (14, 16), (18, 12), (19, 12), (17, 13), (17, 14), (17, 15), (20, 13),
            (20, 14), (20, 15), (18, 16), (19, 16), (16, 14)]
    for xy in ring:
        p[xy] = fr
    p[(14, 13)] = C('#FFFFFF')


def acc_beard(p, sp):
    hair, hairL, hairD = [C(c) for c in sp['hair']]
    for (x, y) in HEADSET:
        if y >= 18 and x >= 11:
            p[(x, y)] = hair if x >= 15 else hairD
    for y in range(23, 25):
        for x in range(13, 21):
            p[(x, y)] = hair if x >= 15 else hairD
    for x in range(16, 22):
        p[(x, 18)] = hairD
    p[(17, 20)], p[(18, 20)] = MOUTH, MOUTH
    p[(19, 22)] = hairL
    p[(20, 21)] = hairL


def acc_scar(p, sp):
    sc = C('#B0645A')
    for xy in ((20, 10), (21, 11), (21, 12), (22, 13)):
        p[xy] = sc


def acc_scar_near(p, sp):
    sc = C('#B0645A')
    for xy in ((11, 16), (12, 17), (13, 18)):
        p[xy] = sc


def acc_scarf(p, sp):
    sc, scD, scL = C('#2E3A4E'), C('#1E2636'), C('#46567A')
    for (x, y) in HEADSET:
        if y >= 18:
            p[(x, y)] = sc if x >= 14 else scD
    for y in range(21, 26):
        for x in range(10, 23):
            p[(x, y)] = sc if x >= 14 else scD
    for x in range(12, 23, 3):
        p[(x, 19)] = scL
    for xy in ((9, 23), (8, 24), (8, 25), (7, 26), (7, 27), (6, 28)):
        p[xy] = scD


def acc_hood(p, sp):
    base, shade, light, trim = [C(c) for c in sp['colors']]
    for y in range(3, 24):
        r = HEAD.get(y)
        if r:
            l, rr = r[0] - 2, r[1] + 1
        elif y < 5:
            l, rr = 13 - (5 - y), 18 + (5 - y) - 1
        else:
            l, rr = 11, 21
        for x in range(l, rr + 1):
            face = (x, y) in HEADSET and y >= 10 and x >= 10 and y <= 22
            if face:
                continue
            if y >= 22 and 12 <= x <= 20:
                continue
            c = base
            if x <= l + 2 or y >= 19:
                c = shade
            if y <= 6 and x >= 15:
                c = light
            p[(x, y)] = c
    for (x, y) in HEADSET:
        if y == 10 and x >= 10:
            p[(x, y)] = C(sp['hair'][2])
        if y == 11 and x in (11, 12, 15, 16, 19, 20):
            p[(x, y)] = C(sp['hair'][0])
    for y in range(10, 22):
        r = HEAD[y]
        p[(max(r[0], 10) - 1, y)] = light


def acc_helm(p, sp):
    st, stL, stD = C('#8E979C'), C('#C9D0D3'), C('#565E64')
    for (x, y) in HEADSET:
        if y <= 11 or (x <= 11 and y <= 18):
            c = st
            if x <= 10:
                c = stD
            if y in (6, 7) and x >= 14:
                c = stL
            p[(x, y)] = c
    for y in range(3, 6):
        for x in range(14, 18):
            p[(x, y)] = C('#A84940') if y < 5 else C('#74302A')
    for x in range(8, 24):
        if (x, 11) in HEADSET:
            p[(x, 11)] = stD
    for y in range(11, 16):
        p[(16, y)] = stD if y > 11 else stD


ACCESSORIES = {'headband': acc_headband, 'bandana': acc_bandana, 'circlet': acc_circlet,
               'mustache': acc_mustache, 'glasses': acc_glasses, 'beard': acc_beard,
               'scar': acc_scar, 'scar_near': acc_scar_near, 'scarf': acc_scarf, 'hood': acc_hood,
               'helm': acc_helm}

PORTRAITS = [
    dict(key='erin', skin=('#F0C49C', '#CF956E'), hair=('#9A4430', '#C8673F', '#5E241A'),
         eye=('#C0863A', '#4A2E16'), style='ponytail', outfit='tunic',
         colors=('#34556B', '#22394A', '#5A7E98', '#D4AA52'), acc='headband',
         band=('#EEE8DC', '#BFB5A4'), brows='stern', mouth='neutral', fem=True),
    dict(key='karl', skin=('#D9A57A', '#B07A56'), hair=('#C99A4A', '#E6C072', '#8E6A2E'),
         eye=('#6E4A2A', '#3A2614'), style='spiky', outfit='vest',
         colors=('#7A5236', '#56381F', '#9A7048', '#D4AA52'), acc='bandana',
         band=('#A84940', '#74302A'), brows='soft', mouth='grin', extra=['scar_near']),
    dict(key='victor', skin=('#EEC4A0', '#C9906C'), hair=('#B4B2AA', '#DEDCD4', '#77756E'),
         eye=('#5C7A92', '#2E3E4C'), style='slick', outfit='armor',
         colors=('#34556B', '#22394A', '#5A7E98', '#D4AA52'), acc='mustache',
         brows='heavy', eyes='narrow', mouth='grim', brow='#6E6C66'),
    dict(key='lina', skin=('#F6D2B0', '#D9A684'), hair=('#E6D49A', '#FFF2C6', '#B09C62'),
         eye=('#3E86B8', '#1E3E5E'), style='bob', outfit='light',
         colors=('#E4E0D6', '#B9B2A2', '#FFFFFF', '#D4AA52'), acc='circlet', brows='soft',
         mouth='smile', fem=True, blush=True, brow='#9C8650'),
    dict(key='owen', skin=('#F0C8A2', '#CC9270'), hair=('#6B4A2E', '#8E6A44', '#4A321E'),
         eye=('#4E7A3A', '#26401C'), style='hood', outfit='cloak',
         colors=('#5F6E3A', '#46522A', '#7E8E50', '#D4AA52'), acc='hood', brows='soft',
         eyes='calm', mouth='smirk'),
    dict(key='sera', skin=('#F4D6C0', '#D4A88E'), hair=('#4E3A5E', '#6E5A86', '#2E2238'),
         eye=('#7A5AA8', '#3A2A56'), style='long', outfit='robe',
         colors=('#3E5E56', '#2A443E', '#5A7E74', '#D4AA52'), acc='glasses', brows='soft',
         mouth='neutral', fem=True),
    dict(key='noah', skin=('#F2CCA8', '#CF9A78'), hair=('#D8D6D0', '#F6F4EE', '#A09E96'),
         eye=('#5E7C96', '#2E3E4C'), style='neat', outfit='priest',
         colors=('#ECE6DA', '#C2B8A6', '#FFFFFF', '#D4AA52'), stole='#34556B', brows='soft',
         eyes='calm', mouth='smile', brow='#8E8C86'),
    dict(key='gustav', skin=('#D9A27A', '#AE7656'), hair=('#4A3626', '#6E523A', '#2A1E14'),
         eye=('#4A3A2A', '#2A1E14'), style='bald', outfit='plate',
         colors=('#9EA6AA', '#5E666C', '#D2D8DA', '#D4AA52'), acc='beard', brows='heavy',
         eyes='narrow', mouth='grim', extra=['scar']),
    dict(key='ren', skin=('#EEDACA', '#C9AE9A'), hair=('#CDD1D8', '#F2F4F8', '#8E949E'),
         eye=('#B0473C', '#5E1E1A'), style='swept', outfit='scarf',
         colors=('#3A3E4E', '#262A36', '#50566A', '#2E3A4E'), acc='scarf', brows='stern',
         eyes='narrow', mouth='neutral'),
    dict(key='ig', skin=('#F0C4A0', '#CC8E6C'), hair=('#B5452B', '#DD7448', '#7A2A1A'),
         eye=('#C08A2A', '#5A3A10'), style='wild', outfit='fur',
         colors=('#5A4232', '#3E2C20', '#7A5A44', '#D4AA52'), brows='stern', mouth='grin',
         extra=['scar']),
    dict(key='mira', skin=('#F6D4B8', '#D8A88A'), hair=('#C77A86', '#E8A6AE', '#8E4A56'),
         eye=('#4E8A5A', '#24442A'), style='braid', outfit='priest',
         colors=('#EEE8DC', '#C4BAA8', '#FFFFFF', '#D4AA52'), stole='#536D49', brows='soft',
         mouth='smile', fem=True, blush=True),
    dict(key='roland', skin=('#F2C8A0', '#CF9470'), hair=('#D6B060', '#F0D488', '#9A7A38'),
         eye=('#3E6A9A', '#1E3450'), style='neat', outfit='armor',
         colors=('#8E3A34', '#5E241F', '#B4544A', '#D4AA52'), brows='stern', mouth='neutral'),
    dict(key='brock', skin=('#B57E58', '#8C5A3C'), hair=('#3A2A1E', '#5A4430', '#20160E'),
         eye=('#2A1E14', '#120C08'), style='helm', outfit='plate',
         colors=('#6E767C', '#3E464C', '#A2AAAE', '#A84940'), acc='helm', extra=['beard'],
         brows='heavy', eyes='narrow', mouth='grim'),
    dict(key='grunt_axe', skin=('#D29C74', '#A8704E'), hair=('#3E3430', '#5A4A40', '#241C18'),
         eye=('#3A2A1E', '#1E140C'), style='spiky', outfit='vest',
         colors=('#7A3A30', '#56261F', '#9A5244', '#8E6C2E'), acc='bandana',
         band=('#5E2A24', '#3E1A16'), brows='heavy', eyes='narrow', mouth='grim', extra=['scar_near']),
]


def build_portraits():
    out = {}
    for sp in PORTRAITS:
        img = draw_portrait(sp)
        name = f"por_{sp['key']}"
        img.save(f'{OUT}/{name}.png')
        out[name] = img
    return out


# ---------------------------------------------------------------- icons
ICONS16 = {
    'sword': [
        "................",
        "..............m.",
        ".............mM.",
        "............mM..",
        "...........mM...",
        "..........mM....",
        ".........mM.....",
        "....y...mM......",
        ".....y.mM.......",
        "......yY........",
        ".....W.y........",
        "....W...y.......",
        "...y............",
        "................",
        "................",
        "................",
    ],
    'lance': [
        "................",
        "..............m.",
        "............mmM.",
        "...........mmM..",
        "...........yM...",
        "..........w.....",
        ".........w......",
        "........w.......",
        ".......w........",
        "......w.........",
        ".....w..........",
        "....w...........",
        "...W............",
        "..W.............",
        "................",
        "................",
    ],
    'axe': [
        "................",
        "...........Mm...",
        "..........MmmM..",
        ".........wMmmmM.",
        "........w.nMmM..",
        ".......w...nM...",
        "......w.........",
        ".....w..........",
        "....w...........",
        "...w............",
        "..W.............",
        ".W..............",
        "................",
        "................",
        "................",
        "................",
    ],
    'bow': [
        "................",
        "......WW........",
        "......K.w.......",
        "......K..w......",
        "......K...w.....",
        "......K...w.....",
        "......K....w....",
        "......K....yW...",
        "......K....yW...",
        "......K....w....",
        "......K...w.....",
        "......K...w.....",
        "......K..w......",
        "......K.w.......",
        "......WW........",
        "................",
    ],
    'tome': [
        "................",
        "................",
        "...TTTTTTTTT....",
        "...TtttttttTk...",
        "...TtttttttTk...",
        "...TtttyttTk....",
        "...TttyYyttTk...",
        "...TtttyttTk....",
        "...TtttttttTk...",
        "...TtttttttTk...",
        "...TtttttttTk...",
        "...TtttttttTk...",
        "...TTTTTTTTTk...",
        "....kkkkkkkkk...",
        "................",
        "................",
    ],
    'staff': [
        "................",
        "............g...",
        "..........kygyk.",
        "............Y...",
        "...........w....",
        "..........w.....",
        ".........w......",
        "........w.......",
        ".......w........",
        "......w.........",
        ".....w..........",
        "....w...........",
        "...w............",
        "..y.............",
        "................",
        "................",
    ],
    'vulnerary': [
        "................",
        "................",
        "......WW........",
        "......kk........",
        ".....kkkk.......",
        "....kvvvvk......",
        "...kmvvvvvk.....",
        "...kmvvvvvk.....",
        "...kvvvvvVk.....",
        "...kvvvvVVk.....",
        "....kvVVVk......",
        ".....kkkk.......",
        "................",
        "................",
        "................",
        "................",
    ],
    'elixir': [
        "................",
        "................",
        "................",
        "......yy........",
        "......kk........",
        ".....kuuk.......",
        "....kmuuuk......",
        "....kuuuUk......",
        "....kuuUUk......",
        ".....kUUk.......",
        "......kk........",
        "................",
        "................",
        "................",
        "................",
        "................",
    ],
    'seal': [
        "................",
        "......yyyy......",
        "....yyYYYYyy....",
        "...yYYyyyyYYy...",
        "...yYyykkyyYy...",
        "..yYyykyykyyYy..",
        "..yYykyyyykyYy..",
        "..yYyykkkkyyYy..",
        "...yYyyyyyyYy...",
        "...yYYyyyyYYy...",
        "....yyYYYYyy....",
        "......yyyy......",
        ".....aa..aa.....",
        "....aA....Aa....",
        "....A......A....",
        "................",
    ],
}

ICONS16.update({
    'act_sortie': [
        "................",
        ".m............m.",
        "..m..........m..",
        "...m........m...",
        "....m......m....",
        ".....m....m.....",
        "......m..m......",
        ".......mm.......",
        ".......mm.......",
        "....y.m..m.y....",
        ".....Y....Y.....",
        "....W.y..y.W....",
        "...W........W...",
        "..y..........y..",
        "................",
        "................",
    ],
    'act_sweep': [
        "................",
        "................",
        "..WWWWWWWWWWW...",
        "..KkkkkkkkkkK...",
        "...kkkkkkkkk....",
        "...kkakkkakk....",
        "...kkaakkaak....",
        "...kkaaakaaa....",
        "...kkaakkaak....",
        "...kkakkkakk....",
        "...kkkkkkkkk....",
        "..KkkkkkkkkkK...",
        "..WWWWWWWWWWW...",
        "................",
        "................",
        "................",
    ],
    'act_rest': [
        "................",
        "................",
        "........y.......",
        ".......yy.......",
        ".......yvy......",
        "......yvvy.y....",
        "......yvdvyy....",
        ".....yvddvvy....",
        ".....yvddddvy...",
        "......vddddv....",
        "....WWvvvvvvWW..",
        "...WwwwW.WwwwW..",
        "..WwwwW...WwwwW.",
        "................",
        "................",
        "................",
    ],
    'act_travel': [
        "................",
        "................",
        "................",
        ".kkkkKKKKKkkkkk.",
        ".kkkkKKKKKkxkxk.",
        ".kkkkKKKKakkxkk.",
        ".kkkkKKaKKkxkxk.",
        ".kkkkKaKKKkkkkk.",
        ".kkkaKKKKKkkkkk.",
        ".kkakKKKKKkkkkk.",
        ".kakkKKKKKkkkkk.",
        ".kkkkKKKKKkkkkk.",
        "................",
        "................",
        "................",
        "................",
    ],
})

ICONS12 = {
    'hourglass': [
        "............",
        ".YyyyyyyyyY.",
        "..YGddddGY..",
        "..Y.GddG.Y..",
        "..Y..GG..Y..",
        "..Y..dG..Y..",
        "..Y.G.dG.Y..",
        "..Y.GddG.Y..",
        "..YGddddGY..",
        "..YGDDDDGY..",
        ".YyyyyyyyyY.",
        "............",
    ],
    'bexp': [
        "............",
        ".....yy.....",
        ".....yy.....",
        "....yYYy....",
        ".yyyyYYyyyy.",
        "..yyYYYYyy..",
        "...yYYYYy...",
        "...yYyyYy...",
        "..yYy..yYy..",
        "..yy....yy..",
        "............",
        "............",
    ],
    'medal': [
        "............",
        "..aa....xx..",
        "...aa..xx...",
        "....aAXx....",
        ".....AX.....",
        "....yyyy....",
        "...yYYYYy...",
        "...yYkkYy...",
        "...yYkkYy...",
        "...yYYYYy...",
        "....yyyy....",
        "............",
    ],
    'roster': [
        "............",
        "....aaaa....",
        "...asssa....",
        "...asesa....",
        "....sss.....",
        "...aaaaa....",
        "..aalaaaa...",
        "..aalaaaa...",
        "..aaaaaaa...",
        "...A...A....",
        "............",
        "............",
    ],
}


def coin12():
    img = Image.new('RGBA', (12, 12), CLEAR)
    px = img.load()
    y_, Y_, m_ = BASE['y'], BASE['Y'], C('#F4DC9A')
    for y in range(12):
        for x in range(12):
            d = math.hypot(x - 5.5, y - 5.5)
            if d <= 4.7:
                c = y_
                if (x - 5.5) + (y - 5.5) > 3.2:
                    c = Y_
                if 2.4 < d < 3.4:
                    c = Y_ if (x - 5.5) + (y - 5.5) > -1 else y_
                if (x, y) in ((3, 3), (4, 2), (3, 4)):
                    c = m_
                px[x, y] = c
    px[5, 5] = Y_
    px[6, 5] = Y_
    px[5, 6] = Y_
    px[6, 6] = y_
    return outline(img)


def target16():
    img = Image.new('RGBA', (16, 16), CLEAR)
    px = img.load()
    for j in range(16):
        for i in range(16):
            d = math.hypot(i - 7.5, j - 6.0)
            if d <= 5.6:
                if d <= 1.6:
                    c = BASE['x']
                elif d <= 3.0:
                    c = BASE['k']
                elif d <= 4.4:
                    c = BASE['x']
                else:
                    c = BASE['k']
                if (i - 7.5) + (j - 6.0) > 3.5 and c == BASE['k']:
                    c = BASE['K']
                px[i, j] = c
    for j in range(11, 15):
        px[7, j] = BASE['w']
        px[8, j] = BASE['W']
    for i in range(5, 11):
        px[i, 14] = BASE['W']
    return outline(img)


def build_icons():
    out = {}
    img = target16()
    img.save(f'{OUT}/ico_act_train.png')
    out['ico_act_train'] = img
    for k, rows in ICONS16.items():
        img = outline(from_grid(rows, BASE))
        img.save(f'{OUT}/ico_{k}.png')
        out[f'ico_{k}'] = img
    for k, rows in ICONS12.items():
        img = outline(from_grid(rows, BASE))
        img.save(f'{OUT}/ico_{k}.png')
        out[f'ico_{k}'] = img
    img = coin12()
    img.save(f'{OUT}/ico_coin.png')
    out['ico_coin'] = img
    return out


# ---------------------------------------------------------------- crests
BIRD = [
    "n....n....n",
    "nn..nmn..nn",
    "nnn.nyM.nnn",
    "nnnnnnnnnnn",
    ".nnnnnnnnn.",
    "..nnnnnnn..",
    "...nnnnn...",
    "....nnn....",
    "...n.n.n...",
    "..n..n..n..",
]
FLAKE = [
    "....k....",
    ".k..k..k.",
    "..k.k.k..",
    "...kkk...",
    "kkkkkkkkk",
    "...kkk...",
    "..k.k.k..",
    ".k..k..k.",
    "....k....",
]


def crest(field, fieldD, emblem, emblem_pal):
    img = Image.new('RGBA', (24, 24), CLEAR)
    px = img.load()
    rim, rimD = BASE['y'], BASE['Y']
    shape = {}
    for y in range(2, 22):
        if y <= 13:
            l, r = 3, 20
        else:
            l, r = 3 + (y - 13), 20 - (y - 13)
        if l > r:
            continue
        shape[y] = (l, r)
    for y, (l, r) in shape.items():
        for x in range(l, r + 1):
            edge = x in (l, r) or y == 2 or y == max(shape) or (y > 13 and (x == l or x == r))
            if edge:
                px[x, y] = rim if x > 11 else rimD
            else:
                px[x, y] = field if x > 11 else fieldD
    ew, eh = len(emblem[0]), len(emblem)
    ox, oy = 12 - ew // 2, 5 if eh > 9 else 6
    for j, row in enumerate(emblem):
        for i, ch in enumerate(row):
            if ch != '.':
                px[ox + i, oy + j] = emblem_pal[ch]
    return outline(img)


def build_crests():
    out = {}
    raven_pal = {'n': C('#2E3238'), 'm': C('#4A5058'), 'y': C('#D4AA52'), 'M': C('#A0A8AC')}
    img = crest(C('#4A7696'), C('#34556B'), BIRD, raven_pal)
    img.save(f'{OUT}/crest_raven.png')
    out['crest_raven'] = img
    img = crest(C('#B0473C'), C('#8A3830'), FLAKE, {'k': C('#F0EADF')})
    img.save(f'{OUT}/crest_frost.png')
    out['crest_frost'] = img
    return out


# ---------------------------------------------------------------- terrain
T = 16
GR = [C('#7EA058'), C('#98B76A'), C('#668A48'), C('#567A3E')]
FO = [C('#2F5634'), C('#3F7042'), C('#5A8E4E'), C('#78A85E')]
TRUNK = C('#5A3C26')
RK = [C('#C6BDAA'), C('#A39886'), C('#7E7466'), C('#5E564C')]
WA = [C('#3E6C94'), C('#4F80AA'), C('#78A6C8'), C('#BFD8E6')]
SH = [C('#6E9EB4'), C('#8EB8C8'), C('#C9B98E')]
RD = [C('#C6A97A'), C('#AE9064'), C('#D9C196'), C('#957A52')]
BR = [C('#A0703F'), C('#7A522C'), C('#5A3A20'), C('#B88650')]
WL = [C('#B6B3AA'), C('#94918A'), C('#6E6C66'), C('#D2D0C8')]
FL = [C('#C2B8A2'), C('#A89E88'), C('#D4CBB6')]
ROOF = [C('#A0503E'), C('#7C3A2E'), C('#BC6A50')]
WALLH = [C('#E4D6B6'), C('#C4B492')]

WATERY = set('wsb')


class Ctx:
    def __init__(self, rows, x, y, seed):
        self.rows, self.x, self.y = rows, x, y
        self.rng = random.Random(seed * 1000003 + x * 7919 + y * 104729)

    def nb(self, dx, dy):
        nx, ny = self.x + dx, self.y + dy
        if 0 <= ny < len(self.rows) and 0 <= nx < len(self.rows[0]):
            return self.rows[ny][nx]
        return None


def fill(px, ox, oy, c):
    for j in range(T):
        for i in range(T):
            px[ox + i, oy + j] = c


def p_grass(px, ox, oy, ctx, flowers=True):
    r = ctx.rng
    fill(px, ox, oy, GR[0])
    for _ in range(14):
        i, j = r.randrange(0, 16), r.randrange(0, 16)
        px[ox + i, oy + j] = GR[2] if r.random() < 0.7 else GR[1]
    for _ in range(5):
        i, j = r.randrange(1, 15), r.randrange(1, 14)
        px[ox + i, oy + j] = GR[1]
        px[ox + i, oy + j + 1] = GR[2]
        px[ox + i - 1, oy + j + 1] = GR[3]
        if r.random() < 0.5:
            px[ox + i + 1, oy + j + 1] = GR[2]
    if flowers and r.random() < 0.18:
        i, j = r.randrange(2, 14), r.randrange(2, 14)
        px[ox + i, oy + j] = C('#EFE6C2')


def tree(px, ox, oy, cx, cy, rad, r):
    for j in range(-1, 3):
        for i in range(-int(rad), int(rad) + 1):
            x, y = cx + i, cy + int(rad) + j
            if 0 <= x < T and 0 <= y < T and abs(i) <= rad - j:
                px[ox + x, oy + y] = mix(px[ox + x, oy + y], 0.78)
    for j in range(int(rad) - 1, int(rad) + 3):
        for i in (0, 1):
            x, y = cx - 1 + i, cy + j
            if 0 <= x < T and 0 <= y < T:
                px[ox + x, oy + y] = TRUNK if i == 0 else mix(TRUNK, 1.25)
    R = int(math.ceil(rad))
    for j in range(-R, R + 1):
        for i in range(-R, R + 1):
            d = math.hypot(i, j * 1.05)
            if d > rad:
                continue
            x, y = cx + i, cy + j
            if not (0 <= x < T and 0 <= y < T):
                continue
            lx = (i - j) / max(rad, 1)
            if d > rad - 0.9:
                c = FO[0]
            elif lx > 0.55:
                c = FO[3]
            elif lx > 0.1:
                c = FO[2]
            elif lx < -0.45:
                c = FO[0]
            else:
                c = FO[1]
            if c == FO[2] and r.random() < 0.18:
                c = FO[3]
            px[ox + x, oy + y] = c


def p_forest(px, ox, oy, ctx):
    p_grass(px, ox, oy, ctx, flowers=False)
    r = ctx.rng
    layouts = [[(5, 5, 4.6), (11, 6, 4.4), (8, 11, 4.6)], [(10, 5, 4.6), (4, 8, 4.6), (11, 11, 4.4)],
               [(8, 6, 5.6), (3, 11, 3.6), (13, 11, 3.6)], [(4, 5, 4.2), (11, 4, 4.2), (7, 10, 4.8)]]
    for cx, cy, rad in layouts[r.randrange(len(layouts))]:
        tree(px, ox, oy, cx, cy, rad, r)


def p_mountain(px, ox, oy, ctx):
    p_grass(px, ox, oy, ctx, flowers=False)
    r = ctx.rng
    peaks = [(8, 1, 14)] if r.random() < 0.6 else [(5, 3, 10), (11, 1, 13)]
    for apx, apy, base_w in peaks:
        for j in range(apy, 16):
            half = (j - apy) * (base_w / 2) / (15 - apy) + 0.5
            ridge = apx + (j - apy) * 0.18
            for i in range(16):
                if abs(i - apx) <= half:
                    if i < ridge - 0.5:
                        c = RK[2] if (i + j) % 5 else RK[3]
                    else:
                        c = RK[0] if i > ridge + half * 0.45 else RK[1]
                    if abs(i - apx) > half - 1:
                        c = RK[3]
                    if j <= apy + 2 and i >= ridge - 0.5:
                        c = C('#E2DCCC')
                    px[ox + i, oy + j] = c
        for j in range(apy + 4, 16, 4):
            for i in range(16):
                if abs(i - apx) <= (j - apy) * (base_w / 2) / (15 - apy) - 1 and i < apx + (j - apy) * 0.18 - 1 and r.random() < 0.6:
                    px[ox + i, oy + j] = RK[3]


def p_water(px, ox, oy, ctx, shallow=False):
    r = ctx.rng
    base = SH[0] if shallow else WA[1]
    fill(px, ox, oy, base)
    for _ in range(10):
        i, j = r.randrange(0, 16), r.randrange(0, 16)
        px[ox + i, oy + j] = WA[0] if not shallow else SH[1]
    for _ in range(3):
        i, j = r.randrange(0, 13), r.randrange(1, 15)
        for k in range(3):
            px[ox + i + k, oy + j] = WA[2] if not shallow else SH[1]
        if j + 1 < 16:
            px[ox + i + 1, oy + j + 1] = WA[0] if not shallow else SH[0]
    if shallow:
        for _ in range(8):
            i, j = r.randrange(0, 16), r.randrange(0, 16)
            px[ox + i, oy + j] = SH[2]
    for (dx, dy) in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        n = ctx.nb(dx, dy)
        if n is None or n in WATERY:
            continue
        for k in range(16):
            if r.random() < 0.15:
                continue
            if dy == -1:
                x, y = k, 0
            elif dy == 1:
                x, y = k, 15
            elif dx == -1:
                x, y = 0, k
            else:
                x, y = 15, k
            px[ox + x, oy + y] = WA[3]
            ix, iy = x - dx, y - dy
            if r.random() < 0.5:
                px[ox + ix, oy + iy] = WA[2]


def p_road(px, ox, oy, ctx):
    r = ctx.rng
    fill(px, ox, oy, RD[0])
    for _ in range(14):
        i, j = r.randrange(0, 16), r.randrange(0, 16)
        px[ox + i, oy + j] = RD[1] if r.random() < 0.6 else RD[2]
    for (dx, dy) in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        n = ctx.nb(dx, dy)
        if n is None or n in 'rbF':
            continue
        for k in range(16):
            depth = 1 + (1 if r.random() < 0.35 else 0)
            for d in range(depth):
                if dy == -1:
                    x, y = k, d
                elif dy == 1:
                    x, y = k, 15 - d
                elif dx == -1:
                    x, y = d, k
                else:
                    x, y = 15 - d, k
                px[ox + x, oy + y] = GR[0] if d == 0 and depth == 2 else RD[3]


def p_bridge(px, ox, oy, ctx):
    r = ctx.rng
    fill(px, ox, oy, WL[0])
    for j in range(3, 13):
        for i in range(16):
            off = 2 if ((j - 3) // 3) % 2 else 0
            if (j - 3) % 3 == 2 or (i + off) % 5 == 4:
                px[ox + i, oy + j] = WL[1]
            elif r.random() < 0.07:
                px[ox + i, oy + j] = WL[3]
    for i in range(16):
        px[ox + i, oy + 0] = WL[3]
        px[ox + i, oy + 1] = WL[3] if i % 6 else WL[0]
        px[ox + i, oy + 2] = WL[2]
        px[ox + i, oy + 13] = WL[3]
        px[ox + i, oy + 14] = WL[3] if i % 6 else WL[0]
        px[ox + i, oy + 15] = WL[2]
    for j in (0, 1, 2, 13, 14, 15):
        px[ox + 0, oy + j] = WL[1]


def p_wall(px, ox, oy, ctx):
    r = ctx.rng
    fill(px, ox, oy, WL[0])
    for j in range(16):
        row = j // 4
        for i in range(16):
            if j % 4 == 3:
                px[ox + i, oy + j] = WL[1]
            elif (i + (4 if row % 2 else 0)) % 8 == 7:
                px[ox + i, oy + j] = WL[1]
            elif r.random() < 0.08:
                px[ox + i, oy + j] = WL[3]
    if ctx.nb(0, -1) != '#':
        for j in range(0, 4):
            for i in range(16):
                px[ox + i, oy + j] = WL[3] if j < 3 else WL[2]
        for i in range(0, 16, 4):
            px[ox + i, oy + 0] = WL[0]
    if ctx.nb(0, 1) != '#':
        for i in range(16):
            px[ox + i, oy + 15] = WL[2]
    if ctx.nb(-1, 0) not in ('#', None):
        for j in range(16):
            px[ox + 0, oy + j] = WL[2]
    if ctx.nb(1, 0) not in ('#', None):
        for j in range(16):
            px[ox + 15, oy + j] = WL[1]


def p_floor(px, ox, oy, ctx):
    r = ctx.rng
    fill(px, ox, oy, FL[0])
    for j in range(16):
        for i in range(16):
            off = 4 if (j // 8) % 2 else 0
            if j % 8 == 7 or (i + off) % 8 == 7:
                px[ox + i, oy + j] = FL[1]
            elif r.random() < 0.06:
                px[ox + i, oy + j] = FL[2]


def p_fort(px, ox, oy, ctx):
    p_floor(px, ox, oy, ctx) if ctx.nb(-1, 0) in ('p', '#') else p_grass(px, ox, oy, ctx, flowers=False)
    for j in range(4, 16):
        for i in range(2, 14):
            c = WL[0] if i > 4 else WL[1]
            if j % 4 == 3:
                c = WL[1]
            px[ox + i, oy + j] = c
    for i in range(2, 14):
        px[ox + i, oy + 4] = WL[3]
        px[ox + i, oy + 5] = WL[2]
    for i in range(2, 14, 3):
        px[ox + i, oy + 3] = WL[3]
        px[ox + i + 1, oy + 3] = WL[3]
    for j in range(10, 16):
        for i in range(6, 10):
            if j > 10 or i in (7, 8):
                px[ox + i, oy + j] = C('#3A2C22')
    for j in range(0, 4):
        px[ox + 12, oy + j] = C('#5A3C26')
    for xy in ((13, 0), (14, 0), (13, 1), (14, 1), (15, 1)):
        px[ox + xy[0], oy + xy[1]] = C('#D4AA52')
    px[ox + 7, oy + 7] = C('#3A2C22')
    px[ox + 8, oy + 7] = C('#3A2C22')


def p_village(px, ox, oy, ctx):
    p_grass(px, ox, oy, ctx, flowers=False)
    for j in range(9, 15):
        for i in range(3, 13):
            px[ox + i, oy + j] = WALLH[0] if i > 4 else WALLH[1]
    for j in range(3, 10):
        w = j - 3
        for i in range(7 - w - 1, 9 + w + 1):
            if 1 <= i <= 14:
                c = ROOF[0]
                if i < 8 - w // 2:
                    c = ROOF[1]
                if j == 9:
                    c = ROOF[1]
                if (i + j) % 4 == 0 and c == ROOF[0]:
                    c = ROOF[2]
                px[ox + i, oy + j] = c
    for j in range(11, 15):
        px[ox + 7, oy + j] = C('#5A3C26')
        px[ox + 8, oy + j] = C('#5A3C26')
    px[ox + 10, oy + 11] = C('#34556B')
    px[ox + 11, oy + 11] = C('#34556B')
    px[ox + 10, oy + 12] = C('#34556B')
    px[ox + 11, oy + 12] = C('#5A7E98')
    for j in range(1, 5):
        px[ox + 11, oy + j] = WL[1]
    for i in range(1, 15):
        px[ox + i, oy + 15] = mix(GR[0], 0.8)


THRONE = [
    "................",
    ".......dy.......",
    ".....dyyyyy.....",
    ".....yttttY.....",
    ".....yttttY.....",
    ".....ytTTtY.....",
    ".....yttttY.....",
    ".....yttttY.....",
    "...dyyyyyyyyY...",
    "...yttttttttY...",
    "...YYYYYYYYYY...",
    "...YY......YY...",
    "................",
    "................",
    "................",
    "................",
]


def p_throne(px, ox, oy, ctx):
    p_floor(px, ox, oy, ctx)
    for j in range(12, 16):
        for i in range(1, 15):
            px[ox + i, oy + j] = FL[2] if j == 12 else FL[1]
    chair = outline(from_grid(THRONE, BASE)).load()
    for j in range(T):
        for i in range(T):
            if chair[i, j][3]:
                px[ox + i, oy + j] = chair[i, j]


# Glyphs match the terrain table in docs/03-combat.md and backend/common/maps/map.ts.
PAINTERS = {'.': p_grass, 'f': p_forest, 'm': p_mountain, 'w': p_water,
            's': lambda px, ox, oy, ctx: p_water(px, ox, oy, ctx, shallow=True),
            'r': p_road, 'b': p_bridge, '#': p_wall, 'p': p_floor, 'F': p_fort, 'v': p_village,
            'T': p_throne}
TERRAIN_ORDER = '.rbpvfmFsw#T'


def render_map(rows, seed):
    w, h = len(rows[0]), len(rows)
    for y, row in enumerate(rows):
        assert len(row) == w, f'map row {y} has {len(row)} chars: {row!r}'
    img = Image.new('RGBA', (w * T, h * T), CLEAR)
    px = img.load()
    for y in range(h):
        for x in range(w):
            PAINTERS[rows[y][x]](px, x * T, y * T, Ctx(rows, x, y, seed))
    for y in range(1, h):
        for x in range(w):
            if rows[y - 1][x] in '#F' and rows[y][x] not in '#F':
                for j in range(3):
                    for i in range(T):
                        px[x * T + i, y * T + j] = mix(px[x * T + i, y * T + j], 0.8 + j * 0.06)
    for y in range(h):
        for x in range(w):
            if rows[y][x] in WATERY:
                continue
            for (dx, dy) in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and rows[ny][nx] in 'ws' and rows[y][x] not in 'b':
                    for k in range(T):
                        if dy == -1:
                            i, j = k, 0
                        elif dy == 1:
                            i, j = k, 15
                        elif dx == -1:
                            i, j = 0, k
                        else:
                            i, j = 15, k
                        px[x * T + i, y * T + j] = mix(px[x * T + i, y * T + j], 0.72)
    return img


MAPS = {
    'pinepass': (61, [
        "mmmmmmfffmmmwwmmfffmmmmm",
        "mmmmff.ffmm.ww.mffffmmmm",
        "mmf..ff.f...ww...ff..mmm",
        "mf..fff.....ww..f.....mm",
        "m...ff..f...ww....f....m",
        "...f...ff...ww..f..#####",
        "..f.........ww.....#ppp#",
        "rrrrrrrrrrrrbbrrrrrrppF#",
        "........f...wwf....#ppp#",
        "...ff.......ww.ff..##.##",
        "..fff.v.....ww...f..ff..",
        "..ff........ww..f.f.fff.",
        "m.f.........ss...ff...fm",
        "mmff.f.......ww......fmm",
        "mmmff..m.....ww...mmmmmm",
        "mmmmmmmmm....ww..mmmmmmm",
    ]),
    'ford': (11, [
        "mmf.....ww....mmmm",
        "mf.ff...ww..f...mm",
        "...ff...ww..#####m",
        "........ww..#ppp#.",
        "rrrrrrrrbbrrrppF#.",
        "....f...wwf.#ppp#.",
        ".....f..ww..##.##.",
        ".v...ff.ww.......f",
        "........ww..ff..ff",
        "........ss...f....",
        ".ff......ww.....mm",
        "mff......ww....mmm",
    ]),
    'plains': (23, [
        "mm....ffw...mmm",
        "m.....f.w....fm",
        "..f.....w..f...",
        "........b......",
        "rrrrrrrrbrrrrF.",
        "...ff...w...f..",
        ".f......w..ff..",
        "....f...ss.....",
        "m........w...fm",
        "mm.......w..mmm",
    ]),
    'pass': (37, [
        "mmmmmmmmmmmmmmmm",
        "mmm..f.mmmm..mmm",
        "m...ff..mmm...mm",
        "..f.....mmm.#..m",
        ".........m..#.F.",
        "rrrrrrrrrrrrrppp",
        "...f.....m..#ppp",
        "..ff....mmm.#..m",
        "m.......mmm....m",
        "mm..f..mmmmm..mm",
        "mmm...mmmmmmm.mm",
        "mmmmmmmmmmmmmmmm",
    ]),
    'woods': (41, [
        "fff..ffff.mm",
        "f.f...ff...m",
        "rrr.f...fff.",
        "..rrrr..f...",
        ".f...rrrrrrr",
        "ff.f....f...",
        "fff..ff..fff",
        "ffff.fff.fff",
    ]),
    'mine': (43, [
        "mmmm####mmmm",
        "mm..#pp#..mm",
        "m...#pp#...m",
        "rrrr.pp.rrrr",
        "m...#pp#...m",
        "m...####..fm",
        "mm.f......mm",
        "mmmm....mmmm",
    ]),
    'bend': (47, [
        "..f...ww....",
        ".ff..ww...f.",
        "....ww....ff",
        "...ww..v....",
        "..ww........",
        ".ww...f..mm.",
        "ww...ff..mmm",
        "w.........mm",
    ]),
    'ruins': (53, [
        "f..v....f..m",
        "...##.v.....",
        ".v.#...rrrrr",
        "rrrrrrrr..f.",
        "...f....v...",
        ".v....##...f",
        "ff..v..#..ff",
        "fff.......ff",
    ]),
}


def build_maps():
    out = {}
    for k, (seed, rows) in MAPS.items():
        img = render_map(rows, seed)
        img.save(f'{OUT}/map_{k}.png')
        out[f'map_{k}'] = img
    return out


def _line(p, x0, y0, x1, y1, c, w=1):
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for k in range(steps + 1):
        t = k / steps
        x = round(x0 + (x1 - x0) * t)
        y = round(y0 + (y1 - y0) * t)
        for dx in range(-(w // 2), w - w // 2):
            for dy in range(-(w // 2), w - w // 2):
                p[(x + dx, y + dy)] = c


def _poly(p, pts, c):
    ys = [y for _, y in pts]
    for y in range(min(ys), max(ys) + 1):
        xs = []
        n = len(pts)
        for k in range(n):
            (x0, y0), (x1, y1) = pts[k], pts[(k + 1) % n]
            if (y0 <= y < y1) or (y1 <= y < y0):
                xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        for a, b in zip(xs[0::2], xs[1::2]):
            for x in range(int(math.ceil(a - 0.01)), int(math.floor(b + 0.01)) + 1):
                p[(x, y)] = c


def _circle(p, cx, cy, r, c):
    for y in range(int(cy - r - 1), int(cy + r + 2)):
        for x in range(int(cx - r - 1), int(cx + r + 2)):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                p[(x, y)] = c


def _to_img(p, w, h):
    img = Image.new('RGBA', (w, h), CLEAR)
    px = img.load()
    for (x, y), c in p.items():
        if 0 <= x < w and 0 <= y < h:
            px[x, y] = c
    return outline(img)


def fighter_erin():
    p = {}
    skin, skinS = C('#F0C49C'), C('#CF956E')
    hair, hairL, hairD = C('#9A4430'), C('#C8673F'), C('#5E241A')
    cloth, clothL, clothD = C('#34556B'), C('#5A7E98'), C('#22394A')
    pants, boot = C('#5A4232'), C('#3A2A1E')
    band = C('#EEE8DC')
    # back leg (extended behind, to the right)
    _line(p, 29, 29, 33, 35, pants, 3)
    _line(p, 33, 35, 37, 41, pants, 3)
    _line(p, 36, 42, 40, 42, boot, 2)
    _line(p, 37, 41, 39, 41, boot, 2)
    # back arm
    _line(p, 26, 19, 30, 23, clothD, 2)
    _line(p, 30, 23, 33, 21, clothD, 2)
    p[(34, 21)] = skinS
    p[(34, 20)] = skinS
    # tunic skirt and torso
    _poly(p, [(24, 27), (33, 27), (35, 33), (22, 33)], clothD)
    _poly(p, [(20, 17), (27, 17), (32, 28), (24, 28)], cloth)
    _line(p, 21, 18, 25, 27, clothL, 1)
    _line(p, 24, 27, 32, 27, C('#6E4A2E'), 2)
    p[(27, 27)] = C('#D4AA52')
    # front leg (lunging forward, to the left)
    _line(p, 26, 30, 20, 34, pants, 3)
    _line(p, 20, 34, 18, 41, pants, 3)
    _line(p, 14, 42, 19, 42, boot, 2)
    _line(p, 15, 41, 18, 41, boot, 2)
    # neck + head
    _line(p, 22, 15, 23, 18, skinS, 3)
    _circle(p, 21, 11, 5.2, skin)
    for y in range(9, 17):
        if (25, y) in p:
            p[(25, y)] = skinS
    # hair: crown, bangs, ponytail, headband
    for (x, y) in list(p.keys()):
        if (x - 21) ** 2 + (y - 11) ** 2 <= 5.6 ** 2 and (y <= 8 or x >= 23):
            p[(x, y)] = hair
    _circle(p, 22, 7, 4.5, hair)
    for x, yb in ((16, 10), (17, 10), (18, 9), (19, 10), (20, 9)):
        for y in range(6, yb + 1):
            p[(x, y)] = hair
    _line(p, 26, 8, 30, 9, hair, 3)
    _line(p, 30, 9, 34, 12, hair, 3)
    _line(p, 34, 12, 37, 13, hair, 2)
    _line(p, 37, 13, 39, 15, hairD, 1)
    for x in range(17, 27):
        if (x, 8) in p:
            p[(x, 8)] = band
    _line(p, 27, 8, 31, 6, band, 1)
    _line(p, 27, 9, 30, 10, C('#BFB5A4'), 1)
    for (x, y) in ((21, 5), (22, 5), (23, 6), (20, 6)):
        p[(x, y)] = hairL
    # face (looking left)
    p[(17, 11)] = C('#2B2421')
    p[(17, 12)] = C('#4A2E16')
    p[(18, 10)] = hairD
    p[(16, 10)] = hairD
    p[(16, 14)] = C('#9A4C44')
    p[(15, 12)] = skinS
    # front arm thrusting the sword forward
    _line(p, 22, 19, 17, 21, clothL, 2)
    _line(p, 17, 21, 12, 21, cloth, 2)
    p[(11, 21)] = skin
    p[(11, 22)] = skin
    p[(10, 21)] = skin
    # sword pointing left
    _line(p, 1, 20, 9, 20, C('#E4E8E6'), 1)
    _line(p, 1, 21, 9, 21, C('#A0A8AC'), 1)
    p[(0, 21)] = C('#E4E8E6')
    _line(p, 10, 18, 10, 23, C('#D4AA52'), 1)
    p[(13, 21)] = C('#5E3E24')
    p[(14, 21)] = C('#D4AA52')
    return _to_img(p, 44, 44)


def fighter_axe():
    p = {}
    skin, skinS = C('#D9A57A'), C('#B07A56')
    hair = C('#3E3430')
    cloth, clothL, clothD = C('#B0473C'), C('#DA7E66'), C('#74302A')
    pants, boot = C('#4E3A2C'), C('#2E241C')
    steel, steelL, steelD = C('#A0A8AC'), C('#E4E8E6'), C('#5E666C')
    wood = C('#9A683C')
    # back leg (behind, to the left) braced
    _line(p, 18, 29, 14, 35, pants, 3)
    _line(p, 14, 35, 11, 41, pants, 3)
    _line(p, 7, 42, 12, 42, boot, 2)
    # back arm guarding
    _line(p, 17, 19, 13, 24, clothD, 3)
    _line(p, 13, 24, 15, 27, skinS, 2)
    # torso, leaning back from the hit
    _poly(p, [(14, 27), (25, 27), (27, 33), (13, 33)], clothD)
    _poly(p, [(14, 17), (23, 17), (25, 28), (15, 28)], cloth)
    _line(p, 22, 18, 24, 27, clothL, 1)
    _line(p, 15, 27, 25, 27, C('#5E3E24'), 2)
    # front leg
    _line(p, 22, 30, 26, 35, pants, 3)
    _line(p, 26, 35, 28, 41, pants, 3)
    _line(p, 27, 42, 32, 42, boot, 2)
    # head
    _line(p, 18, 14, 19, 18, skinS, 3)
    _circle(p, 17, 10, 5.4, skin)
    _poly(p, [(11, 9), (13, 4), (16, 2), (19, 3), (22, 5), (23, 8), (12, 10)], hair)
    for x in range(11, 24):
        if (x, 7) in p or (x, 8) in p:
            p[(x, 7)] = C('#74302A')
            p[(x, 8)] = C('#74302A')
    _line(p, 11, 8, 7, 11, C('#74302A'), 2)
    p[(21, 10)] = C('#2B2421')
    p[(20, 13)] = C('#9A4C44')
    p[(21, 13)] = C('#9A4C44')
    p[(22, 11)] = skinS
    for x in range(14, 22):
        p[(x, 15)] = C('#3E3430') if x % 2 else skinS
    # front arm raised with the axe
    _line(p, 21, 19, 26, 15, cloth, 3)
    _line(p, 26, 15, 29, 11, skin, 2)
    _line(p, 25, 22, 34, 2, wood, 2)
    _poly(p, [(31, 0), (39, 2), (40, 9), (33, 8)], steel)
    _line(p, 39, 2, 40, 9, steelL, 1)
    _line(p, 33, 8, 40, 9, steelD, 1)
    return _to_img(p, 44, 44)


def spark():
    p = {}
    w, y_, Y_ = C('#FFFFFF'), C('#F4DC9A'), C('#D4AA52')
    for (dx, dy, n) in ((1, 0, 7), (-1, 0, 7), (0, 1, 7), (0, -1, 7), (1, 1, 5), (-1, -1, 5), (1, -1, 5), (-1, 1, 5)):
        for k in range(n):
            p[(9 + dx * k, 9 + dy * k)] = w if k < 3 else (y_ if k < 5 else Y_)
    _circle(p, 9, 9, 2.2, w)
    img = Image.new('RGBA', (19, 19), CLEAR)
    px = img.load()
    for (x, y), c in p.items():
        if 0 <= x < 19 and 0 <= y < 19:
            px[x, y] = c
    return img


def backdrop():
    W, H = 200, 72
    img = Image.new('RGBA', (W, H), C('#DCE4E2'))
    px = img.load()
    rng = random.Random(5)
    for x in range(W):
        top = 14 + int(4 * math.sin(x / 9.0) + 3 * math.sin(x / 4.3))
        for y in range(top, 40):
            px[x, y] = C('#6E8E64')
        top2 = 22 + int(5 * math.sin(x / 6.5 + 1) + 2 * math.sin(x / 2.7))
        for y in range(top2, 44):
            px[x, y] = C('#557651')
    for x in range(100, W):
        for y in range(36, 44):
            px[x, y] = C('#5484AC') if (x + y) % 7 else C('#78A6C8')
    for tx in (8, 30, 52, 76):
        for y in range(18, 52):
            for x in range(tx, tx + 4):
                px[x, y] = C('#5A3C26') if x < tx + 2 else C('#704C30')
        for y in range(8, 30):
            for x in range(tx - 9, tx + 13):
                if (x - tx - 2) ** 2 / 110 + (y - 18) ** 2 / 90 <= 1:
                    c = C('#3F7042') if x < tx + 2 else C('#5A8E4E')
                    if (x * 7 + y * 3) % 11 == 0:
                        c = C('#78A85E')
                    if 0 <= x < W:
                        px[x, y] = c
    for x in range(100, W):
        for y in range(42, 52):
            c = WL[0]
            if y in (42, 43):
                c = WL[3]
            if y == 51 or (x + (0 if (y // 3) % 2 else 3)) % 8 == 7:
                c = WL[1]
            px[x, y] = c
    for x in range(W):
        for y in range(52, H):
            if x < 100:
                c = GR[0]
                rr = rng.random()
                if rr < 0.12:
                    c = GR[2]
                elif rr < 0.18:
                    c = GR[1]
            else:
                c = WL[0]
                if (y - 52) % 5 == 4 or (x + (3 if ((y - 52) // 5) % 2 else 0)) % 9 == 8:
                    c = WL[1]
            if y >= 68:
                c = mix(c, 0.82)
            px[x, y] = c
    for y in range(52, H):
        px[99, y] = mix(GR[0], 0.7)
        px[100, y] = WL[2]
    return img


def build_combat():
    out = {}
    for name, fn in (('fight_erin', fighter_erin), ('fight_axe', fighter_axe), ('fx_spark', spark), ('stage_pass', backdrop)):
        img = fn()
        img.save(f'{OUT}/{name}.png')
        out[name] = img
    return out


def contact(groups, name, s):
    pad = 8
    rows = []
    for items in groups:
        hh = max(im.size[1] for im in items) * s
        ww = sum(im.size[0] * s + pad for im in items)
        rows.append((items, ww, hh))
    W = max(r[1] for r in rows) + pad
    H = sum(r[2] + pad for r in rows) + pad
    sheet = Image.new('RGBA', (W, H), C('#E8E1D3'))
    y = pad
    for items, ww, hh in rows:
        x = pad
        for im in items:
            big = im.resize((im.size[0] * s, im.size[1] * s), Image.NEAREST)
            sheet.alpha_composite(big, (x, y))
            x += big.size[0] + pad
        y += hh + pad
    sheet.save(os.path.join(ROOT, name))


if __name__ == '__main__':
    units = build_units()
    pors = build_portraits()
    icons = build_icons()
    crests = build_crests()
    maps = build_maps()
    combat = build_combat()
    contact([
        [combat['fight_axe'], combat['fx_spark'], combat['fight_erin']] + [icons[k] for k in icons if k.startswith('ico_act')],
        [units[k] for k in sorted(units) if k.endswith('ally')],
        [units[k] for k in sorted(units) if k.endswith('enemy')],
        list(pors.values())[:7],
        list(pors.values())[7:],
        list(icons.values()) + list(crests.values()),
        [render_map([glyph], 7) for glyph in TERRAIN_ORDER],
    ], 'contact.png', 4)
    contact([
        [maps['map_pinepass'], maps['map_ford']],
        [maps['map_plains'], maps['map_pass'], combat['stage_pass']],
        [maps['map_woods'], maps['map_mine'], maps['map_bend'], maps['map_ruins']],
    ], 'contact_maps.png', 2)
    print('ok', len(units), len(pors), len(icons), len(crests), len(maps), len(combat), '->', OUT)
