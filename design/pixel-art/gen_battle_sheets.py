#!/usr/bin/env python3
"""Export authored 16-frame attacks from the project's original pixel layers."""
import base64
import json
import math
from pathlib import Path
import subprocess

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent / 'battle-sheets'
SIZE, ORIGIN = 96, (24, 24)
ROLES = {glyph: index for index, glyph in enumerate('aAlsShH', 1)}
INK = '#2B2421'

# lean, crouch, arm rotation, weapon rotation, cloth lag. Angles are clockwise.
# The four rows are idle / anticipation / attack / recovery, never locomotion.
SWORD = [
    (0,0,0,0,0), (0,-1,0,0,0), (1,0,-5,3,1), (0,0,0,0,0),
    (-1,0,-25,-20,0), (-3,1,-65,-45,-1), (-4,2,-100,-65,-1), (-4,2,-115,-80,-2),
    (-1,1,-70,-10,1), (3,1,-25,45,2), (5,1,-5,85,3), (4,0,10,110,2),
    (4,0,10,110,2), (2,1,5,70,1), (1,0,0,20,0), (0,0,0,0,0),
]
AXE = [
    (0,0,0,0,0), (0,-1,0,0,0), (1,0,-5,2,0), (0,0,0,0,0),
    (-1,1,-45,-25,0), (-2,1,-80,-50,0), (-4,2,-110,-80,0), (-4,2,-130,-105,0),
    (-2,1,-95,-50,0), (2,1,-30,20,0), (6,2,5,75,0), (4,1,10,100,0),
    (4,1,10,100,0), (2,1,0,65,0), (1,0,-5,20,0), (0,0,0,0,0),
]
LANCE = [
    (0,0,0,0,0), (0,-1,0,0,0), (1,0,-4,-2,0), (0,0,0,0,0),
    (-1,0,35,-4,0), (-2,1,65,-8,0), (-3,1,95,-10,0), (-3,1,110,-10,0),
    (0,0,50,-5,0), (3,1,0,0,0), (6,1,-30,0,0), (5,1,-25,0,0),
    (5,1,-25,0,0), (3,0,0,-2,0), (1,0,15,-2,0), (0,0,0,0,0),
]

# Attacks that rotation alone cannot carry use hand-drawn pieces, each keyed by frame index:
#   props   the weapon replaced by a drawn state {'rows', 'grip'} (drawn bow, open tome, empty hand)
#   arms    the front forearm replaced by a drawn arm whose 'grip' is measured from the shoulder
#   swaps   {layer: {'rows', 'dx', 'dy'} or {'swing': (angle, root)}} for bands, ears, wings and tails
#   extras  function(index, ctx) -> [(plane, {(x, y): glyph})] in cell pixels: 'back' behind the body,
#           'front' outlined with it, 'glow' unoutlined on top, 'fx' unoutlined streaks behind
#   behind  frames whose weapon passes behind the body; thrown frames may leave the hand empty
# A profile marked projectile draws its own arrow, spell, knife or breath and attacks from where it stands.


def glyphs(rows, x=0, y=0):
    return {(x+i, y+j): char for j, row in enumerate(rows) for i, char in enumerate(row) if char != '.'}


def moved(pixels, x, y):
    return {(px+x, py+y): char for (px, py), char in pixels.items()}


def segment(points, char):
    """Bresenham polyline through the points."""
    pixels = {}
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        dx, dy = abs(x1-x0), -abs(y1-y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        error = dx+dy
        while True:
            pixels[(x0, y0)] = char
            if (x0, y0) == (x1, y1):
                break
            twice = 2*error
            if twice >= dy:
                error += dy; x0 += sx
            if twice <= dx:
                error += dx; y0 += sy
    return pixels


def held_at_origin(pixels):
    """Pixels drawn around a hand at (0, 0) become a weapon grid gripped there."""
    xs, ys = [x for x, _ in pixels] + [0], [y for _, y in pixels] + [0]
    rows = [''.join(pixels.get((x, y), '.') for x in range(min(xs), max(xs)+1)) for y in range(min(ys), max(ys)+1)]
    return {'rows': rows, 'grip': [-min(xs), -min(ys)]}


# Archer: nock, draw to the jaw, loose. The pale limb bends toward the target, the brown string comes back.
def arrow(x, y, length=13):
    pixels = {(i, y): 'W' for i in range(x+1, x+length-1)}
    pixels.update({(x+length-1, y): 'm', (x+length-2, y-1): 'M', (x+length-2, y+1): 'M'})
    pixels.update({(i, y+side): 'c' for i in (x+1, x+2) for side in (-1, 1)})
    return pixels


def bow(nock, depth, string='taut', loaded=True, tips=7):
    pixels = segment([(-round(depth*(abs(y)/tips)**2), y) for y in range(-tips, tips+1)], 'K')
    pixels.update({(0, 0): 'y', (0, -1): 'Y', (0, 1): 'Y'})
    top, bottom = (-depth, -tips), (-depth, tips)
    if string == 'taut':
        pixels.update(segment([(top[0], top[1]+1), (-nock, 0), (bottom[0], bottom[1]-1)], 'w'))
    else:  # still humming after the loose
        pixels.update({(top[0]+(1 if (y//2) % 2 else -1) if abs(y) < tips-1 else top[0], y): 'w' for y in range(top[1]+1, bottom[1])})
    for x, y in (top, bottom):
        pixels[(x, y)] = pixels[(x-1, y)] = 'W'
    if loaded:
        pixels.update(arrow(-nock, 0))
        pixels.update({(-nock-1, -1): 's', (-nock, -1): 's', (-nock-1, 0): 's', (-nock, 0): 's', (-nock-1, 1): 'S', (-nock, 1): 'S'})
    return held_at_origin(pixels)


def drawing_arm(hand, elbow):
    """The far arm shows only where it clears the body: a sleeve from the elbow to the drawing hand."""
    pixels = segment([elbow, hand], 'a')
    pixels.update({(x, y+1): 'A' for x, y in list(pixels)})
    return pixels


ARCHER = [
    (0,0,0,0,0), (0,-1,0,0,0), (1,0,-4,-3,0), (0,0,0,0,0),
    (-1,0,-25,-12,0), (-1,0,-45,0,0), (-1,0,-45,0,0), (-2,0,-46,0,0),
    (-2,1,-48,0,0), (0,0,-45,0,0), (1,0,-44,0,0), (1,0,-44,0,0),
    (1,0,-44,0,0), (0,0,-25,-10,0), (0,0,-8,-4,0), (0,0,0,0,0),
]
ARCHER_NOCK = {5: 4, 6: 7, 7: 10, 8: 10}
ARCHER_BOW = {5: bow(4, 4), 6: bow(7, 5), 7: bow(10, 6), 8: bow(10, 6), 9: bow(4, 4, loaded=False),
              10: bow(4, 4, 'hum', loaded=False), 11: bow(4, 4, loaded=False), 12: bow(4, 4, loaded=False)}


def archer_extras(index, ctx):
    gx, gy = ctx['grip']
    out = []
    if index in ARCHER_NOCK:
        hand = (gx-ARCHER_NOCK[index]-1, gy)
        out.append(('back', drawing_arm(hand, (hand[0]-7, gy-1))))
    if index == 9:
        # The drawing hand springs open just behind the anchor as the arrow leaves.
        hx, hy = gx-12, gy
        out.append(('back', drawing_arm((hx, hy), (hx-6, hy-1))))
        out.append(('front', {(hx, hy-1): 's', (hx+1, hy-2): 's', (hx, hy): 's', (hx+1, hy): 's', (hx, hy+1): 'S'}))
        out.append(('front', arrow(gx+3, gy)))
        out.append(('fx', {(x, gy-2): 'k' for x in range(gx+2, gx+8)} | {(x, gy+2): 'k' for x in range(gx+4, gx+9)}))
    if index == 10:
        out.append(('front', arrow(gx+19, gy)))
        out.append(('fx', {(x, gy): 'k' for x in range(gx+3, gx+19)} | {(x, gy-2): 'K' for x in range(gx+8, gx+18)}
                    | {(x, gy+2): 'K' for x in range(gx+11, gx+19)}))
    return out


# Shaman: the tome opens, a flame gathers over the pages and is thrown as a fireball.
OPEN_TOME = {'rows': ['.kkkKkkk.', 'kKKkKkKKk', 'kkkkKkkkk', 'vvvvVvvvv'], 'grip': [2, 3]}
LIT_TOME = {'rows': ['.kkkykkk.', 'kKyyyyyKk', 'kkkkykkkk', 'vvvvVvvvv'], 'grip': [2, 3]}
EMBER = ['.o.', 'oyo', 'oko', '.O.']
FLAME = [
    '...o...',
    '..ooo..',
    '.ooyo..',
    '.oyyyo.',
    'oyykyyo',
    'oyykkyo',
    '.oyyyo.',
    '..OOO..',
]
FIREBALL = [
    '......oo..',
    '...oooyyo.',
    '.ooooyyyyo',
    'OOoyyykkyo',
    '.ooooyyyyo',
    '...oooyyo.',
    '......oo..',
]
FIREBALL_FAR = [
    '.........oo..',
    '......oooyyo.',
    '...oooooyyyyo',
    'OOOooyyyykkyo',
    '...oooooyyyyo',
    '......oooyyo.',
    '.........oo..',
]
MAGE = [
    (0,0,0,0,0), (0,-1,0,0,0), (1,0,-3,-2,0), (0,0,0,0,0),
    (-1,0,-20,-6,0), (-1,-1,-35,0,0), (-2,-1,-40,0,0), (-2,-1,-45,0,0),
    (1,0,-25,0,0), (3,0,-15,0,0), (4,0,-12,0,0), (2,0,-15,0,0),
    (2,0,-15,0,0), (1,0,-15,-8,0), (1,0,-8,-4,0), (0,0,0,0,0),
]


def mage_extras(index, ctx):
    gx, gy = ctx['grip']
    top = gy-3  # page tops of the open tome
    out = []
    if index == 5:
        out.append(('glow', {(gx+1, top-2): 'y', (gx+4, top-3): 'k'}))
    if index == 6:
        out.append(('front', glyphs(EMBER, gx+2, top-5)))
        out.append(('glow', {(gx-1, top-3): 'y', (gx+5, top-4): 'y', (gx+3, top-7): 'k'}))
    if index == 7:
        out.append(('front', glyphs(FLAME, gx+1, top-9)))
        out.append(('glow', {(gx-2, top-6): 'y', (gx+9, top-7): 'y', (gx+4, top-11): 'k', (gx+9, top-2): 'k', (gx-2, top-2): 'k', (gx+1, top-10): 'o'}))
    if index == 8:
        out.append(('front', glyphs(FLAME, gx+7, top-7)))
        out.append(('glow', {(gx+3, top-4): 'y', (gx+2, top-2): 'o'}))
    if index == 9:
        out.append(('front', glyphs(FIREBALL, gx+9, top-5)))
        out.append(('glow', {(gx+6, top-2): 'o', (gx+4, top-3): 'y', (gx+3, top-1): 'o'}))
    if index == 10:
        out.append(('front', glyphs(FIREBALL_FAR, gx+18, top-5)))
        out.append(('fx', {(x, top-2): 'o' for x in range(gx+9, gx+18, 2)} | {(x, top): 'y' for x in range(gx+7, gx+17, 3)}
                    | {(x, top-4): 'y' for x in range(gx+11, gx+18, 3)}))
    if index in (11, 12):
        out.append(('glow', {(gx+2, top-2): 'y', (gx+5, top-4): 'o', (gx+1, top-5): 'k'}))
    return out


# Brawler: guard, jab, straight. Punching arms are drawn straight; the headband tails stream back.
JAB = {'rows': ['ss........', 'ssssssskkk', '.sssssskkk'], 'grip': [9, 1]}
CROSS = {'rows': ['ss..........', 'sssssssssskk', '.ssssssssskk'], 'grip': [11, 1]}
BAND_LIFT = {'rows': ['...........', 'Ccccccccccc', '.CC........'], 'dx': -2, 'dy': 1}
BAND_STREAM = {'rows': ['CC.........', '.cCcccccccc', '...........'], 'dx': -2, 'dy': 1}
IMPACT = ['....y....', '...yky...', 'yyykkkyyy', '...yky...', '....y....']
IMPACT_FADE = ['..y..', '.yky.', '..y..']
BRAWLER = [
    (0,0,0,0,0), (0,-1,0,0,0), (0,1,-8,0,0), (0,0,0,0,0),
    (-1,0,-60,0,0), (-2,1,-100,0,0), (-1,2,-95,0,0), (-3,1,-105,0,0),
    (2,0,0,0,0), (0,1,-70,0,0), (5,0,-4,0,0), (5,0,-4,0,0),
    (5,0,-4,0,0), (2,0,-40,0,0), (1,0,-12,0,0), (0,0,0,0,0),
]


def brawler_extras(index, ctx):
    gx, gy = ctx['grip']
    out = []
    if index == 8:
        out.append(('fx', {(x, gy-3): 'K' for x in range(gx-7, gx-2)} | {(x, gy+3): 'K' for x in range(gx-5, gx-1)}))
    if index == 10:
        out.append(('front', glyphs(IMPACT, gx+3, gy-2)))
        out.append(('glow', {(gx+4, gy-2): 'k', (gx+10, gy-2): 'k', (gx+4, gy+2): 'k', (gx+10, gy+2): 'k'}))
        out.append(('fx', {(x, gy-3): 'K' for x in range(gx-10, gx-2)} | {(x, gy+3): 'K' for x in range(gx-8, gx-1)}))
    if index in (11, 12):
        out.append(('front', glyphs(IMPACT_FADE, gx+5, gy-1)))
    return out


# Ninja: backhand coil across the chest, flick, the knife flies; a fresh one comes from the belt.
KNIFE = ['...y.....', 'WWwymmmmM', '...y.....']
EMPTY_HAND = {'rows': [], 'grip': [0, 0]}
NINJA = [
    (0,0,0,0,0), (0,-1,0,0,0), (1,0,-6,-6,1), (0,0,0,0,0),
    (-1,0,60,-90,1), (-2,0,110,-135,1), (-3,1,127,-150,2), (-3,1,132,-155,2),
    (0,0,40,-60,0), (3,1,-25,0,2), (4,1,-32,0,3), (3,1,-28,0,2),
    (3,1,-28,0,2), (1,0,45,90,1), (0,0,15,40,0), (0,0,0,0,0),
]


def ninja_extras(index, ctx):
    gx, gy = ctx['grip']
    out = []
    if index == 7:
        tx, ty = gx-6, gy+1  # the blade tip glints at the top of the coil
        out.append(('glow', {(tx, ty): 'k', (tx-2, ty): 'k', (tx+2, ty): 'k', (tx, ty-2): 'k', (tx, ty+2): 'k'}))
    if index == 9:
        out.append(('front', glyphs(KNIFE, gx+4, gy-1)))
        out.append(('fx', {(x, gy-2): 'K' for x in range(gx-3, gx+3)} | {(x, gy+2): 'K' for x in range(gx-1, gx+4)}))
    if index == 10:
        out.append(('front', glyphs(KNIFE, gx+21, gy-1)))
        out.append(('fx', {(x, gy): 'K' for x in range(gx+4, gx+20)} | {(x, gy-2): 'K' for x in range(gx+10, gx+19)}
                    | {(x, gy+2): 'K' for x in range(gx+13, gx+20)}))
    return out


# Dragonkin: the stone glows, the wing lifts on the breath in, then fire pours from the mouth.
STONE_LIT = {'rows': ['.vvv.', 'vkyvV', 'vyyvV', '.VVV.'], 'grip': [1, 2]}
STONE_HOT = {'rows': ['.yvy.', 'ykkyv', 'vkyyV', '.vVv.'], 'grip': [1, 2]}
BREATH_START = [(1, 0, 1.5), (3, 0, 2.0)]
BREATH_MID = [(1, 0, 1.5), (3, 0, 2.0), (5, 0, 2.4), (8, -1, 2.8), (11, 0, 3.2), (14, 1, 3.4), (16, 0, 2.8)]
BREATH_FULL = [(1, 0, 1.5), (3, 0, 2.0), (5, 0, 2.4), (8, -1, 2.8), (11, 0, 3.2), (14, 1, 3.6), (17, 0, 4.0),
               (20, -1, 4.4), (23, 0, 4.6), (26, 1, 4.4), (28, 0, 3.8)]
BREATH_FADE = [(14, 1, 2.4), (17, -1, 3.0), (20, 0, 3.4), (23, -2, 3.0), (25, 1, 3.4), (28, -1, 2.6)]
SMOKE = ['.KK.', 'KkkK', 'KkkK', '.KK.']
DRAGONKIN = [
    (0,0,0,0,0), (0,-1,0,0,0), (1,0,-4,0,0), (0,0,0,0,0),
    (-1,0,-30,0,0), (-2,-1,-60,0,0), (-3,-1,-70,0,0), (-3,-1,-72,0,0),
    (1,0,-40,0,0), (3,0,-35,0,0), (4,0,-35,0,0), (3,0,-35,0,0),
    (3,0,-35,0,0), (1,0,-15,0,0), (1,0,-8,-4,0), (0,0,0,0,0),
]


def flames(puffs, hot=99):
    """Overlapping round puffs: a billowing edge, white-hot core near the mouth, gold body, red rim."""
    pixels = {}
    for x in range(min(cx for cx, _, _ in puffs)-5, max(cx for cx, _, _ in puffs)+6):
        for y in range(-8, 9):
            d = min(math.hypot(x-cx, y-cy)/r for cx, cy, r in puffs)
            if d <= 1:
                pixels[(x, y)] = 'k' if hot and d < 0.4 and x < hot else 'y' if d < 0.66 else 'v' if d < 0.9 else 'V'
    return pixels


def dragonkin_extras(index, ctx):
    hx, hy = ctx['head']
    mouth = (hx+29, hy+23)
    gx, gy = ctx['grip']
    out = []
    if index in (5, 6, 7):
        sparks = {5: [(-2, -2), (4, -3)], 6: [(-3, -1), (5, -2), (1, -5)], 7: [(-3, -3), (5, -1), (2, -6), (-1, 3)]}[index]
        out.append(('glow', {(gx+1+x, gy+y): 'y' if (x+y) % 2 else 'k' for x, y in sparks}))
    if index == 7:
        out.append(('glow', {mouth: 'y', (mouth[0]+1, mouth[1]-1): 'v'}))
    breath = {8: (BREATH_START, 99), 9: (BREATH_MID, 10), 10: (BREATH_FULL, 18), 11: (BREATH_FADE, 0), 12: (BREATH_FADE, 0)}
    if index in breath:
        out.append(('front', moved(flames(*breath[index]), *mouth)))
    if index == 13:
        out.append(('front', glyphs(SMOKE, mouth[0]+17, mouth[1]-3)))
        out.append(('front', glyphs(['.K.', 'KkK', '.K.'], mouth[0]+24, mouth[1]-5)))
    return out


# Beast fighter: drop into a crouch with the tail up, then rip the claws upward.
BEAST = [
    (0,0,0,0,0), (0,-1,0,0,0), (1,0,-5,-4,0), (0,0,0,0,0),
    (-1,1,30,20,0), (-2,2,60,40,0), (-3,2,75,50,0), (-3,2,80,55,0),
    (2,1,20,0,0), (4,0,-30,-25,0), (5,-1,-62,-55,0), (4,-1,-66,-60,0),
    (4,-1,-66,-60,0), (2,0,-35,-20,0), (1,0,-12,-8,0), (0,0,0,0,0),
]
EARS_BACK = {'rows': ['..........', 'hh.....hh.', 'hph...hph.', 'hhhh.hhhh.'], 'dy': 1}


def swings(layer, root, angles):
    return {index: {layer: {'swing': (angle, root)}} for index, angle in angles.items()}


def claw_marks(center, radii, start, end, lead):
    """Three parallel streaks around the shoulder, bright where the claws just passed."""
    pixels = {}
    for r in radii:
        steps = max(2, int(abs(end-start)/4))
        for k in range(steps+1):
            a = math.radians(start+(end-start)*k/steps)
            pixels[(round(center[0]+r*math.cos(a)), round(center[1]+r*math.sin(a)))] = 'k' if k >= steps*lead else 'K'
    return pixels


def beast_extras(index, ctx):
    marks = {9: ((9, 11, 13), 45, -10, 0.4), 10: ((9, 11, 13), 40, -50, 0.5), 11: ((10, 12, 14), -15, -55, 1.1), 12: ((10, 12, 14), -15, -55, 1.1)}
    return [('fx', claw_marks(ctx['shoulder'], *marks[index]))] if index in marks else []


BEAST_SWAPS = swings(0, (9, 7), {4: 12, 5: 25, 6: 32, 7: 35, 8: 10, 9: -12, 10: -20, 11: -16, 12: -16, 13: -6})
for frame in (5, 6, 7):
    BEAST_SWAPS[frame][4] = EARS_BACK

PROFILES = [
    dict(id='swordsman', name='剑客 · 快速斩击', weapon='sword', poses=SWORD,
         head=[3,4], legs=[1], cloth=[0], times=[140,140,140,140,100,100,120,160,50,50,120,70,100,90,90,160]),
    dict(id='fighter', name='斧战士 · 蓄力重劈', weapon='axe', poses=AXE,
         head=[2,3], legs=[0], cloth=[], times=[160,160,160,160,130,140,150,220,60,50,180,90,160,120,120,200]),
    dict(id='cavalier', name='轻骑兵 · 原地突刺', weapon='lance', poses=LANCE,
         head=[4,5], legs=[2], cloth=[], times=[140,140,140,140,100,100,110,160,50,40,120,70,110,100,100,160]),
    dict(id='archer', name='弓箭手 · 满弓速射', weapon='bow', poses=ARCHER, head=[3,4], legs=[1], cloth=[], projectile=True,
         behind=(), props=ARCHER_BOW, extras=archer_extras,
         times=[140,140,140,140,110,120,140,220,90,50,130,80,110,100,100,160]),
    dict(id='mage', name='萨满巫师 · 火焰咒', weapon='tome', poses=MAGE, head=[2,3], legs=[0], cloth=[], projectile=True,
         behind=(), props={5: OPEN_TOME, 6: LIT_TOME, 7: LIT_TOME, 8: LIT_TOME, 9: OPEN_TOME, 10: OPEN_TOME, 11: OPEN_TOME, 12: OPEN_TOME},
         extras=mage_extras, times=[150,150,150,150,120,130,150,240,80,60,140,90,120,110,110,170]),
    dict(id='brawler', name='斗拳手 · 刺拳接直拳', weapon='fist', poses=BRAWLER, head=[2,3], legs=[0], cloth=[],
         behind=(), arms={8: JAB, 10: CROSS, 11: CROSS, 12: CROSS}, extras=brawler_extras,
         swaps={8: {3: BAND_LIFT}, 9: {3: BAND_LIFT}, 10: {3: BAND_STREAM}, 11: {3: BAND_STREAM}, 12: {3: BAND_STREAM}, 13: {3: BAND_LIFT}},
         times=[130,130,130,130,100,110,110,180,60,70,60,110,120,100,100,150]),
    dict(id='ninja', name='忍者 · 反手掷刀', weapon='sword', asset_id='ninja-dagger', poses=NINJA, head=[3,4], legs=[1], cloth=[0], projectile=True,
         behind=(), thrown=(9, 10, 11, 12), props={9: EMPTY_HAND, 10: EMPTY_HAND, 11: EMPTY_HAND, 12: EMPTY_HAND},
         extras=ninja_extras, times=[130,130,130,130,90,100,110,180,50,50,120,80,110,110,100,150]),
    dict(id='dragonkin', name='龙人 · 龙息', weapon='dragon', poses=DRAGONKIN, head=[4,5], legs=[2], cloth=[], projectile=True,
         behind=(), props={5: STONE_LIT, 6: STONE_HOT, 7: STONE_HOT, 8: STONE_LIT}, extras=dragonkin_extras,
         swaps=swings(0, (8, 9), {1: 4, 4: 10, 5: 18, 6: 24, 7: 26, 8: 8, 9: -6, 10: -8, 11: -6, 12: -6, 13: -2}),
         times=[150,150,150,150,120,130,150,240,70,60,150,90,120,120,110,170]),
    dict(id='beast_fighter', name='兽战士 · 上撩裂爪', weapon='beast', poses=BEAST, head=[3,4], legs=[1], cloth=[],
         behind=(), swaps=BEAST_SWAPS, extras=beast_extras,
         times=[140,140,140,140,100,110,130,200,50,50,130,80,110,100,100,160]),
]

# Original bird mounts retain their class layers; only the rider performs the attack.
for class_id, label, head, legs, cloth, weapons in [
    ('ornius_rider', '飞鸵兵', [4,5], [2], [], ('sword', 'axe')),
    ('armored_ornius', '骑甲鸵兵', [5,6], [3], [], ('sword', 'axe')),
    ('divine_ornius', '神鸵兵', [5,6], [3], [0], ('sword', 'axe', 'tome')),
]:
    for weapon in weapons:
        template = next(profile for profile in PROFILES if profile['weapon'] == weapon)
        PROFILES.append({**template, 'id': class_id, 'name': f"{label} · {template['name'].split(' · ')[1]}",
                         'head': head, 'legs': legs, 'cloth': cloth,
                         'effect_palette': {'O': '#8E2A24'} if weapon == 'tome' else {}})


def source_art():
    pairs = [(profile['id'], profile['weapon']) for profile in PROFILES]
    assert len(set(pairs)) == len(pairs), 'Duplicate class/weapon profile'
    script = """
import { BASE_COLORS, WEAPON_COLORS, FACTION_COLORS, CLASS_LOOKS, PARTS, WEAPON_LAYERS, drawBattleSprite } from './backend/common/sprites/battle.ts';
const ids = %s;
console.log(JSON.stringify({ palette: {...BASE_COLORS,...WEAPON_COLORS,...FACTION_COLORS.player}, parts: PARTS, weapons: WEAPON_LAYERS,
  looks: Object.fromEntries(ids.map(([id])=>[id,CLASS_LOOKS[id]])),
  originals: Object.fromEntries(ids.map(([id,weapon])=>[`${id}:${weapon}`,Buffer.from(drawBattleSprite(id,{side:'player'},weapon)).toString('base64')])) }));
""" % json.dumps(pairs)
    art = json.loads(subprocess.run(['node', '--input-type=module', '-e', script], cwd=ROOT,
                                   check=True, capture_output=True, text=True).stdout)
    assert set(art['originals']) == {f'{class_id}:{weapon}' for class_id, weapon in pairs}, 'Original class/weapon collision'
    return art


def empty():
    return Image.new('RGBA', (SIZE, SIZE))


def put_grid(rows, x, y, palette):
    image = empty()
    for j, row in enumerate(rows):
        for i, char in enumerate(row):
            if char != '.':
                assert 1 <= x+i < SIZE-1 and 1 <= y+j < SIZE-1, 'Layer exceeds its cell'
                image.putpixel((x+i, y+j), (*bytes.fromhex(palette[char][1:]), 255))
    return image


def rotate(image, angle, pivot):
    return image.rotate(-angle, resample=Image.Resampling.NEAREST, center=(pivot[0]+.5, pivot[1]+.5))


def turn(point, angle):
    rad = math.radians(angle)
    return (point[0]*math.cos(rad)-point[1]*math.sin(rad), point[0]*math.sin(rad)+point[1]*math.cos(rad))


def outline(image, ink=INK):
    alpha = image.getchannel('A')
    # Four-neighbour outline, matching the original sprite renderer.
    edge = Image.new('L', image.size)
    for dx, dy in [(1,0),(-1,0),(0,1),(0,-1)]:
        edge = ImageChops.lighter(edge, ImageChops.offset(alpha, dx, dy))
    result = empty()
    result.paste(Image.new('RGBA', image.size, ink), (0,0), edge)
    result.alpha_composite(image)
    return result


def draw_frame(art, profile, index, effects=True, mask=False):
    look = art['looks'][profile['id']]
    palette = {**art['palette'], **profile.get('effect_palette', {}), **look.get('palette', {})}
    if mask:
        palette = {glyph: '#{0:02x}{0:02x}{0:02x}'.format(ROLES.get(glyph, 0)) for glyph in palette}
    lean, crouch, arm_angle, weapon_angle, lag = profile['poses'][index]
    waist, neck = look['hand'][1]+7, look['hand'][1]-5
    ox, oy = ORIGIN
    def body_shift(y):
        weight = max(0, min(1, (waist-y)/(waist-neck)))
        return round(lean*weight), round(crouch*weight)

    origin = look.get('forearm', [look['hand'][0]-5, look['hand'][1]-3])
    dx, dy = body_shift(origin[1])
    shoulder = (ox+origin[0]+dx, oy+origin[1]+dy)
    arm = profile.get('arms', {}).get(index)
    reach = arm['grip'] if arm else (look['hand'][0]-origin[0], look['hand'][1]-origin[1])
    grip_delta = turn(reach, arm_angle)
    grip = (round(shoulder[0]+grip_delta[0]), round(shoulder[1]+grip_delta[1]))
    weapon = profile.get('props', {}).get(index, art['weapons'][profile['weapon']])
    held = rotate(put_grid(weapon['rows'], grip[0]-weapon['grip'][0], grip[1]-weapon['grip'][1], palette), weapon_angle, grip)
    swaps = profile.get('swaps', {}).get(index, {})
    layers = []
    for n, layer in enumerate(look['layers']):
        rows = art['parts'][layer['part']] if isinstance(layer['part'], str) else layer['part']
        if layer.get('flip'):
            rows = [row[::-1] for row in rows]
        swap = swaps.get(n, {})
        rows, x, y = swap.get('rows', rows), layer['x']+swap.get('dx', 0), layer['y']+swap.get('dy', 0)
        if [layer['x'], layer['y']] == origin:
            image = rotate(put_grid(arm['rows'] if arm else rows, *shoulder, palette), arm_angle, shoulder)
        elif 'swing' in swap:
            # Wings and tails swing rigidly about their root, which rides on the body.
            angle, (rx, ry) = swap['swing']
            sx, sy = body_shift(y+ry)
            image = rotate(put_grid(rows, ox+x+sx, oy+y+sy, palette), angle, (ox+x+sx+rx, oy+y+sy+ry))
        elif layer.get('fixed') or n in profile['legs']:
            image = put_grid(rows, ox+x, oy+y, palette)
        elif n in profile['head']:
            image = put_grid(rows, ox+x+lean, oy+y+crouch, palette)
        else:
            image = empty()
            span = waist-neck
            top = math.floor(y+crouch*max(0,min(1,(waist-y)/span)))
            bottom = math.ceil(y+len(rows)-1+crouch*max(0,min(1,(waist-y-len(rows)+1)/span)))
            # Sample backwards so leaning cloth and breathing never tear open pixel gaps.
            for target_y in range(top,bottom+1):
                source_y = target_y-crouch if target_y <= neck+crouch else target_y if target_y >= waist else (target_y-crouch*waist/span)/(1-crouch/span)
                j = round(source_y)-y
                if not 0 <= j < len(rows):
                    continue
                row = rows[j]
                dx, _ = body_shift(source_y)
                cloth = lag if n in profile['cloth'] else 0
                width = len(row)+cloth
                for i in range(width):
                    char = row[round(i*(len(row)-1)/max(1,width-1))]
                    if char != '.':
                        image.putpixel((ox+x+i+dx-cloth,oy+target_y),(*bytes.fromhex(palette[char][1:]),255))
        layers.append(image)
    extras = profile['extras'](index, dict(grip=grip, shoulder=shoulder, head=(ox+lean, oy+crouch))) if 'extras' in profile else []
    def plane(name):
        image = empty()
        for kind, pixels in extras:
            if kind == name:
                for (x, y), char in pixels.items():
                    assert 1 <= x < SIZE-1 and 1 <= y < SIZE-1, 'Effect exceeds its cell'
                    image.putpixel((x, y), (*bytes.fromhex(palette[char][1:]), 255))
        return image
    body = plane('back')
    # High windups pass behind the head; the attacking hand/weapon return to the foreground.
    behind = index in profile['behind'] if 'behind' in profile else look.get('weaponBehind') or (profile['weapon'] != 'lance' and 5 <= index <= 8)
    if behind:
        body.alpha_composite(held)
    for image in layers:
        body.alpha_composite(image)
    if not behind:
        body.alpha_composite(held)
    body.alpha_composite(plane('front'))
    result = outline(body, '#000000' if mask else INK)
    if effects and 'extras' in profile:
        streaks = plane('fx')
        streaks.alpha_composite(result)
        streaks.alpha_composite(plane('glow'))
        result = streaks
    elif effects and index in (9,10):
        trail = empty()
        draw = ImageDraw.Draw(trail)
        if profile['weapon'] == 'lance':
            for yy, length in [(-3,9),(3,6)]:
                draw.line((grip[0]-length,grip[1]+yy,grip[0]-3,grip[1]+yy), fill=palette['M'])
        else:
            tip = (9,-12) if profile['weapon'] == 'sword' else (4,-10)
            previous_angle = profile['poses'][index-1][3]
            for radius, color in [(1.0,palette['M']),(.82,palette['k'])]:
                points = []
                for step in range(9):
                    angle = previous_angle+(weapon_angle-previous_angle)*step/10
                    tx, ty = turn((tip[0]*radius,tip[1]*radius),angle)
                    points.append((round(grip[0]+tx),round(grip[1]+ty)))
                draw.line(points, fill=color, width=1)
        trail.alpha_composite(result)
        result = trail
    # The original 48px renderer clips edge outlines (notably the divine Ornius cape).
    # Preserve that exact appearance at rest while allowing attacks to use the larger cell.
    if profile['poses'][index] == (0,0,0,0,0):
        resting = empty()
        resting.paste(result.crop((ox, oy, ox+48, oy+48)), (ox, oy))
        result = resting
    return result, held, layers


def validate(art, profile, frames):
    assert len(frames) == 16
    assert frames[0].tobytes() == frames[3].tobytes() == frames[15].tobytes(), 'Idle loop/return mismatch'
    assert len({frame.tobytes() for frame in frames}) >= 13, 'Insufficient distinct authored poses'
    original = Image.frombytes('RGBA',(48,48),base64.b64decode(art['originals'][f"{profile['id']}:{profile['weapon']}"]))
    reference = empty()
    reference.alpha_composite(original, ORIGIN)
    assert frames[0].tobytes() == reference.tobytes(), 'Original appearance changed'
    sole = (ORIGIN[0]+5,ORIGIN[1]+44,ORIGIN[0]+33,ORIGIN[1]+48)
    feet = frames[0].crop(sole).tobytes()
    allowed = {(*bytes.fromhex(value[1:]),255) for value in {**art['palette'], **profile.get('effect_palette', {}), **art['looks'][profile['id']].get('palette', {}), 'outline':INK}.values()}
    fixed_layers = {n: image.tobytes() for n, (layer, image) in enumerate(zip(
        art['looks'][profile['id']]['layers'], draw_frame(art, profile, 0, effects=False)[2])) if layer.get('fixed')}
    for n, frame in enumerate(frames):
        assert frame.size == (SIZE,SIZE) and frame.mode == 'RGBA'
        colors = set(frame.getdata())
        assert all(c[3] in (0,255) for c in colors), 'Antialiasing detected'
        assert {c for c in colors if c[3]} <= allowed, 'Palette drift'
        x0,y0,x1,y1 = frame.getbbox()
        assert 2 <= x0 < x1 <= SIZE-2 and 2 <= y0 < y1 <= SIZE-2, 'Clipped frame'
        assert frame.crop(sole).tobytes() == feet, f'Foot drift: {n+1}'
        _, held, layers = draw_frame(art,profile,n,effects=False)
        assert all(layers[layer].tobytes() == pixels for layer, pixels in fixed_layers.items()), 'Fixed mount layer drift'
        if not held.getbbox():
            assert n in profile.get('thrown', ()), f'Missing weapon: {n+1}'
            continue
        body = empty()
        for layer in layers:
            body.alpha_composite(layer)
        near_hand = body.getchannel('A').filter(ImageFilter.MaxFilter(5))
        assert ImageChops.multiply(near_hand,held.getchannel('A')).getbbox(), f'Detached weapon: {n+1}'
    return reference


def main():
    art = source_art()
    OUT.mkdir(exist_ok=True)
    manifest = dict(frameSize=[SIZE,SIZE], grid=[4,4], origin=[ORIGIN[0]+24,ORIGIN[1]+48], facing='right',
                    frameOrder='row-major', frameIndexBase=0, rows=['idle','windup','attack','recover'], hitFrame=10, sprites=[])
    for profile in PROFILES:
        frames = [draw_frame(art,profile,n)[0] for n in range(16)]
        reference = validate(art,profile,frames)
        name = profile.get('asset_id', f"{profile['id']}-{profile['weapon']}")
        reference.save(OUT/f'{name}-reference.png')
        sheet = Image.new('RGBA',(SIZE*4,SIZE*4))
        for n, frame in enumerate(frames):
            sheet.alpha_composite(frame, ((n%4)*SIZE,(n//4)*SIZE))
        sheet.save(OUT/f'{name}.png')
        mask_sheet = Image.new('L', sheet.size)
        palette = {**art['palette'], **profile.get('effect_palette', {}), **art['looks'][profile['id']].get('palette', {})}
        role_colors = {role: tuple(bytes.fromhex(palette[glyph][1:])) for glyph, role in ROLES.items()}
        for n, frame in enumerate(frames):
            tagged = draw_frame(art, profile, n, mask=True)[0]
            assert tagged.getchannel('A').tobytes() == frame.getchannel('A').tobytes(), 'Mask geometry drift'
            restored = bytearray(frame.tobytes())
            for pixel, (tag, original) in enumerate(zip(tagged.getdata(), frame.getdata())):
                role = tag[0]
                assert tag[0] == tag[1] == tag[2] and 0 <= role <= 7, 'Invalid mask role'
                if role:
                    assert original[3] == 255 and original[:3] == role_colors[role], 'Incorrect semantic role'
                    restored[pixel*4:pixel*4+3] = bytes(role_colors[role])
            assert bytes(restored) == frame.tobytes(), 'Default recolor changed original'
            mask_sheet.paste(tagged.getchannel('R'), ((n%4)*SIZE,(n//4)*SIZE))
        mask_sheet.save(OUT/f'{name}-mask.png')
        # GIF is a viewing aid only; PNG is the transparent, exact-palette game asset.
        previews = []
        for frame in frames:
            image = Image.new('RGBA',frame.size,'#D7DFD5')
            image.alpha_composite(frame)
            previews.append(image.convert('RGB').resize((SIZE*4,SIZE*4),Image.Resampling.NEAREST))
        previews[0].save(OUT/f'{name}.gif',save_all=True,append_images=previews[1:],duration=profile['times'],loop=0,disposal=2)
        manifest['sprites'].append(dict(id=name,name=profile['name'],file=f'{name}.png',reference=f'{name}-reference.png',
                                        classId=profile['id'], mask=f'{name}-mask.png',
                                        weapon=profile['weapon'],projectile=profile.get('projectile', False),durationsMs=profile['times']))
        print(f'{name}: 16 frames, transparent 384x384 PNG, palette / grip / feet / loop checks passed')
    (OUT/'animations.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')


if __name__ == '__main__':
    main()
