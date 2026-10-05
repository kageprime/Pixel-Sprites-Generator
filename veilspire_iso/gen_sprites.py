#!/usr/bin/env python3
"""Veilspire - procedural stick-rig sprite generator.

One skeleton for every body. Personality = tone, thickness, height, wear,
weapon, aura and the rank seal floating above the head (see the design bible).
Output: one sprite sheet per character, 7 animations (rows) x 6 frames (cols).
"""
import math, json, os, sys, base64, zipfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

CELL, CX, GROUND, NF = 64, 32, 54, 6
ANIMS = [  # name, suggested fps, loops
    ('idle', 6, True), ('walk', 10, True), ('run', 14, True),
    ('attack', 14, False), ('cast', 12, False), ('hit', 12, False), ('death', 8, False)]
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'

STEEL = (198, 204, 212); STEEL_HI = (236, 240, 246); WOOD = (112, 84, 58)
BONE = (222, 216, 200); INK = (12, 11, 10)

# ---------------------------------------------------------------- helpers
def sh(c, f): return tuple(max(0, min(255, int(v * f))) for v in c[:3])
def mx(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
def R(v): return int(round(v))
def pt(p): return (R(p[0]), R(p[1]))
def A(c, a=255): return tuple(c[:3]) + (a,)
def lerp(p, q, t): return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
def dist(p, q): return math.hypot(p[0] - q[0], p[1] - q[1])

def ln(d, p, q, c, w=1): d.line([pt(p), pt(q)], fill=A(c), width=w)
def poly(d, pts, c, o=None): d.polygon([pt(p) for p in pts], fill=A(c), outline=A(o) if o else None)
def dot(d, p, c, r=1):
    x, y = pt(p); d.ellipse([x - r, y - r, x + r, y + r], fill=A(c))
def px(d, p, c, a=255): d.point(pt(p), fill=A(c, a))

# ---------------------------------------------------------------- roster
def spec(**k):
    base = dict(id='', name='', title='', role='Shade', rank='Unsealed', thick=.9, height=1.0,
                tone=(60, 60, 66), pri=(150, 150, 150), sec=(90, 90, 90), acc=(200, 160, 90),
                emi=(255, 255, 255), helm='none', chest='none', legs='none', back='none',
                weapon='none', offhand='none', aura='none', pauldron=False, eyes=False,
                jointglow=False, blurb='')
    base.update(k)
    return base

ROSTER = [
    spec(id='ren_calder', name='Ren Calder', title='The Unsealed', role='Shade', rank='Unsealed',
         thick=.82, tone=(62, 62, 70), pri=(176, 170, 158), sec=(124, 72, 50), acc=(201, 122, 63),
         emi=(170, 120, 255), helm='wrap', chest='wraps', legs='wraps', weapon='twinblades', aura='void'),
    spec(id='sera_quill', name='Sera Quill', title='Stillair', role='Weaver', rank='Glass',
         thick=.78, tone=(168, 196, 212), pri=(212, 230, 242), sec=(88, 120, 152), acc=(140, 210, 255),
         emi=(140, 225, 255), helm='circlet', chest='robe', weapon='staff', aura='frost'),
    spec(id='kade_morr', name='Kade Morr', title='Red Vein', role='Shade', rank='Steel',
         thick=.8, tone=(120, 78, 66), pri=(104, 34, 40), sec=(44, 40, 46), acc=(196, 58, 58),
         emi=(255, 72, 60), helm='visor', chest='harness', legs='wraps', weapon='dagger', offhand='dagger'),
    spec(id='bram_holt', name='Bram Holt', title='Bastion', role='Breaker', rank='Iron',
         thick=1.35, tone=(92, 102, 114), pri=(124, 132, 142), sec=(58, 62, 70), acc=(190, 196, 204),
         emi=(255, 170, 80), helm='helm', chest='plate', legs='plated', weapon='maul', offhand='shield',
         pauldron=True),
    spec(id='nyx_lumen', name='Nyx Lumen', title='Lantern', role='Beacon', rank='Steel',
         thick=.9, tone=(104, 114, 78), pri=(66, 86, 70), sec=(168, 146, 88), acc=(238, 198, 108),
         emi=(255, 228, 140), helm='hood', chest='coat', legs='wraps', back='cloak', weapon='lantern',
         aura='light'),
    spec(id='orin_vale', name='Orin Vale', title='Longreach', role='Lance', rank='Glass',
         thick=.8, height=1.12, tone=(198, 190, 172), pri=(112, 124, 114), sec=(82, 70, 58),
         acc=(214, 204, 174), emi=(236, 228, 196), helm='wrap', chest='harness', legs='greaves',
         weapon='spear'),
    spec(id='mairen_solas', name='Mairen Solas', title='Mend', role='Warden', rank='Crown',
         thick=.88, tone=(206, 198, 180), pri=(238, 230, 206), sec=(184, 152, 84), acc=(242, 202, 92),
         emi=(255, 236, 150), chest='robe', weapon='staff', aura='light'),
    spec(id='irix_venn', name='Irix Venn', title='Chair of Glass', role='Lance', rank='Crown',
         thick=.85, height=1.08, tone=(210, 206, 198), pri=(240, 238, 232), sec=(190, 192, 204),
         acc=(160, 200, 232), emi=(200, 232, 255), chest='coat', back='shards', weapon='saber',
         pauldron=True),
    spec(id='juno_rake', name='Juno Rake', title='Emberwake', role='Weaver', rank='Steel',
         thick=.85, tone=(132, 86, 66), pri=(72, 42, 38), sec=(210, 96, 44), acc=(255, 150, 60),
         emi=(255, 122, 40), helm='spike', chest='harness', legs='skirt', back='tendrils',
         weapon='staff', aura='ember'),
    spec(id='cinder', name='Cinder', title='Host unit', role='Shade', rank='Ember',
         thick=.9, tone=(24, 24, 28), pri=(34, 34, 40), sec=(52, 52, 58), acc=(92, 92, 100),
         emi=(255, 238, 196), eyes=True, jointglow=True, weapon='longsword', aura='ash'),
    spec(id='the_carapace', name='The Carapace', title='Floor horror', role='Breaker', rank='Null',
         thick=1.4, height=1.18, tone=(46, 38, 50), pri=(74, 56, 80), sec=(30, 25, 36),
         acc=(158, 96, 180), emi=(214, 92, 255), helm='mandibles', chest='chitin', legs='plated',
         back='shards', weapon='gauntlets', aura='void', eyes=True),
    spec(id='floor_voice', name='Floor Voice', title='The test', role='Beacon', rank='Null',
         thick=.7, height=1.28, tone=(206, 206, 212), pri=(206, 206, 212), sec=(150, 150, 158),
         acc=(214, 150, 90), emi=(255, 226, 170), weapon='tablet'),
]

RANK_COL = {'Unsealed': (205, 200, 190), 'Ember': (214, 120, 60), 'Coal': (150, 150, 155),
            'Iron': (130, 150, 175), 'Steel': (190, 205, 220), 'Glass': (150, 230, 255),
            'Crown': (245, 205, 90), 'Null': (160, 96, 220)}
RANK_NUM = {'Unsealed': '-', 'Ember': 'I', 'Coal': 'II', 'Iron': 'III', 'Steel': 'IV',
            'Glass': 'V', 'Crown': 'VI', 'Null': 'Ø'}

AURA = {'ember': [(255, 140, 50), (255, 200, 90), (220, 70, 40)],
        'frost': [(190, 235, 255), (130, 200, 240), (255, 255, 255)],
        'void': [(150, 100, 230), (90, 50, 160), (200, 160, 255)],
        'light': [(255, 240, 170), (255, 255, 220), (255, 215, 120)],
        'venom': [(140, 230, 90), (90, 180, 60), (200, 255, 140)],
        'storm': [(190, 220, 255), (255, 255, 255), (120, 160, 255)],
        'ash': [(170, 166, 160), (120, 116, 112), (210, 206, 198)]}

READY = {'dagger': 120, 'twinblades': 120, 'longsword': 150, 'saber': 140, 'spear': 172, 'staff': 176,
         'bow': 95, 'maul': 205, 'gauntlets': 90, 'scythe': 160, 'lantern': 180, 'tablet': 90,
         'none': 90, 'shield': 90}
WLEN = {'dagger': 7, 'twinblades': 9, 'longsword': 14, 'saber': 13, 'spear': 21, 'staff': 15, 'bow': 7,
        'maul': 15, 'gauntlets': 3, 'scythe': 16, 'lantern': 7, 'tablet': 6, 'none': 2, 'shield': 0}

# ---------------------------------------------------------------- poses
SLASH = [
    dict(lean=-6, ft=(18, 10), bt=(-18, -12), fa=(-60, -100), w=210),
    dict(lean=-12, ft=(12, 5), bt=(-22, -16), fa=(-120, -150), w=225),
    dict(lean=6, ft=(30, 15), bt=(-20, -10), fa=(40, 80), w=150, fx=[('arc', 230, 140)]),
    dict(lean=14, ft=(38, 18), bt=(-28, -14), fa=(85, 95), w=95, fx=[('arc', 160, 70)]),
    dict(lean=14, ft=(38, 18), bt=(-28, -14), fa=(75, 50), w=45, fx=[('arc', 100, 20)]),
    dict(lean=6, ft=(20, 8), bt=(-14, -8), fa=(40, 70), w=130)]
THRUST = [
    dict(lean=0, ft=(14, 6), bt=(-22, -14), fa=(-20, 70), w=90),
    dict(lean=-8, ft=(25, 20), bt=(-26, -16), fa=(-45, 40), w=84),
    dict(lean=14, ft=(40, 20), bt=(-30, -10), fa=(75, 88), w=90, fx=[('streak',)]),
    dict(lean=16, ft=(40, 20), bt=(-30, -10), fa=(85, 90), w=92, fx=[('streak',)]),
    dict(lean=6, ft=(30, 14), bt=(-24, -12), fa=(30, 70), w=90),
    dict(lean=2, ft=(20, 8), bt=(-14, -8), fa=(20, 70), w=120)]
SLAM = [
    dict(lean=-4, ft=(14, 8), bt=(-14, -8), fa=(120, 150), w=190),
    dict(lean=-12, ft=(10, 4), bt=(-18, -12), fa=(150, 175), w=225),
    dict(lean=8, ft=(24, 12), bt=(-18, -10), fa=(100, 110), w=130, fx=[('arc', 225, 140)]),
    dict(lean=20, ft=(34, 18), bt=(-26, -14), fa=(60, 60), w=40, fx=[('arc', 140, 40), ('shock',)]),
    dict(lean=20, ft=(34, 18), bt=(-26, -14), fa=(60, 60), w=38, fx=[('shock',)]),
    dict(lean=8, ft=(20, 10), bt=(-16, -8), fa=(60, 100), w=100)]
CAST = [
    dict(lean=0, ft=(14, 6), bt=(-14, -8), fa=(50, 100), w=170),
    dict(lean=-6, ft=(12, 4), bt=(-16, -10), fa=(120, 165), w=178, fx=[('charge', 1)]),
    dict(lean=-8, ft=(10, 2), bt=(-18, -12), fa=(150, 175), w=182, fx=[('charge', 2)]),
    dict(lean=10, ft=(26, 14), bt=(-22, -12), fa=(95, 95), w=100, fx=[('burst',)]),
    dict(lean=8, ft=(26, 14), bt=(-22, -12), fa=(90, 95), w=100, fx=[('ring',)]),
    dict(lean=2, ft=(18, 8), bt=(-14, -8), fa=(60, 100), w=150)]
HIT = [
    dict(lean=-8, dx=-1, ft=(10, 4), bt=(-14, -10), fa=(-30, 10), ba=(-40, -10), flash=.8, fx=[('impact',)]),
    dict(lean=-18, dx=-3, ft=(0, -6), bt=(-20, -26), fa=(-60, -20), ba=(-70, -30), flash=.5, fx=[('impact',)]),
    dict(lean=-14, dx=-3, ft=(4, -2), bt=(-18, -18), fa=(-50, -10), ba=(-60, -20), flash=.2),
    dict(lean=-8, dx=-2, ft=(8, 2), bt=(-16, -12), fa=(-30, 10), ba=(-40, 0)),
    dict(lean=-3, dx=-1, ft=(12, 4), bt=(-14, -8), fa=(10, 50), ba=(-20, 10)),
    dict(lean=1, dx=0, ft=(14, 4), bt=(-12, -6), fa=(20, 75), ba=(-8, 22))]
DEATH = [
    dict(lean=-12, dx=-1, ft=(4, -4), bt=(-14, -14), fa=(-50, -20), ba=(-60, -30), flash=.6, w=150),
    dict(lean=-30, dx=-2, ft=(40, -10), bt=(25, -25), fa=(-80, -40), ba=(-60, -30), w=125),
    dict(lean=-55, dx=-4, ft=(70, 20), bt=(60, 10), fa=(-100, -60), ba=(-90, -50), w=110),
    dict(lean=-78, dx=-6, ft=(85, 60), bt=(80, 50), fa=(-130, -100), ba=(-110, -90), w=95),
    dict(lean=-92, dx=-6, ft=(88, 88), bt=(85, 85), fa=(-96, -96), ba=(-102, -100), w=88,
         fx=[('ash', 4)], crumble=.12),
    dict(lean=-92, dx=-6, ft=(88, 88), bt=(85, 85), fa=(-96, -96), ba=(-102, -100), w=88,
         fx=[('ash', 9)], crumble=.4)]

def atk_kind(S):
    w = S['weapon']
    if w == 'spear': return 'thrust'
    if w == 'maul': return 'slam'
    if w in ('staff', 'lantern', 'tablet', 'bow'): return 'cast'
    return 'slash'

def has_twin(S): return S['weapon'] == 'twinblades'
def has_off(S): return S['offhand'] != 'none' or has_twin(S)

def pose(S, anim, f, lag=False):
    p = 2 * math.pi * f / NF
    rd = READY.get(S['weapon'], 90)
    P = dict(lean=0, dx=0, lift=0, ft=(10, 4), bt=(-10, -6), fa=(25, 80), ba=(-10, 20), w=rd,
             flash=0, fx=[], sway=0, crumble=0)
    if anim == 'idle':
        s = math.sin(p)
        P.update(lean=2 + 1.5 * s, ft=(14, 4), bt=(-12, -6), fa=(20 + 4 * s, 75 + 5 * s),
                 ba=(-8 + 3 * math.sin(p + 1), 22 + 3 * math.sin(p + 1)), sway=.5 * s)
    elif anim in ('walk', 'run'):
        run = anim == 'run'
        amp, b0, b1 = (50, 12, 55) if run else (28, 6, 30)
        def leg(q):
            t = amp * math.sin(q)
            return (t, t - (b0 + b1 * max(0, math.cos(q))))
        sw = 40 if run else 20
        el = 85 if run else 55
        P.update(lean=14 if run else 3, ft=leg(p), bt=leg(p + math.pi),
                 fa=((10 if run else 15) - sw * math.sin(p), (10 if run else 15) - sw * math.sin(p) + el),
                 ba=(8 + sw * math.sin(p), 8 + sw * math.sin(p) + (60 if run else 35)),
                 sway=-3.5 if run else -1.5, lift=[0, 2, 1, 0, 2, 1][f] if run else 0,
                 w=rd - (20 if run else 0) - 8 * math.sin(p))
    elif anim in ('attack', 'cast'):
        k = atk_kind(S) if anim == 'attack' else 'cast'
        tbl = dict(slash=SLASH, thrust=THRUST, slam=SLAM, cast=CAST)[k]
        P.update(tbl[f]); P['sway'] = -1
        P.setdefault('fx', [])
        if k == 'slash' and S['weapon'] in ('gauntlets', 'none'):
            P['fx'] = [x for x in P['fx']]
    elif anim == 'hit':
        P.update(HIT[f]); P['w'] = rd - 30 * abs(P['lean']) / 18; P['sway'] = 2
    elif anim == 'death':
        P.update(DEATH[f])
    # off-hand arm behaviour
    if anim not in ('hit', 'death'):
        if S['offhand'] == 'shield':
            P['ba'] = (35, 85)
        elif has_off(S) and anim in ('attack', 'cast') and not lag:
            q = pose(S, anim, (f - 1) % NF, lag=True)
            P['ba'] = q['fa']
    P['ow'] = P['w'] if (has_off(S) and anim in ('attack', 'cast', 'hit', 'death')) else READY.get(
        S['offhand'] if S['offhand'] not in ('none', 'shield') else 'dagger', 120)
    if has_off(S) and anim in ('idle', 'walk', 'run'):
        P['ow'] = P['w']
    P['f'] = f
    return P

def solve(S, P):
    H = S['height']
    th = sl = 6.6 * H; T = 9.0 * H; ua = fl = 5.2 * H
    lean = math.radians(P['lean']); u = (math.sin(lean), -math.cos(lean))
    neck = (T * u[0], T * u[1]); sho = (neck[0] * .9, neck[1] * .9)
    hr = 3
    head = (neck[0] + u[0] * (1.2 + hr), neck[1] + u[1] * (1.2 + hr))
    def chain(o, l1, a1, l2, a2):
        a, b = math.radians(a1), math.radians(a2)
        m = (o[0] + l1 * math.sin(a), o[1] + l1 * math.cos(a))
        return m, (m[0] + l2 * math.sin(b), m[1] + l2 * math.cos(b))
    fk, ff = chain((0, 0), th, *P['ft'][:1], sl, P['ft'][1])
    bk, bf = chain((0, 0), th, P['bt'][0], sl, P['bt'][1])
    fe, fh = chain(sho, ua, P['fa'][0], fl, P['fa'][1])
    be, bh = chain(sho, ua, P['ba'][0], fl, P['ba'][1])
    low = max(ff[1], bf[1], fk[1], bk[1], head[1] + hr, neck[1])
    ox, oy = CX + P['dx'], GROUND - low - P['lift']
    sft = lambda q: (q[0] + ox, q[1] + oy)
    return dict(pel=sft((0, 0)), neck=sft(neck), sho=sft(sho), head=sft(head), hr=hr,
                fk=sft(fk), ff=sft(ff), bk=sft(bk), bf=sft(bf), fe=sft(fe), fh=sft(fh),
                be=sft(be), bh=sft(bh), up=u)

# ---------------------------------------------------------------- weapons
def axis(ang):
    a = math.radians(ang)
    return (math.sin(a), math.cos(a)), (-math.cos(a), math.sin(a))

def tip_of(S, kind, hand, ang):
    dv, _ = axis(ang)
    if kind == 'lantern': return (hand[0], hand[1] + 6)
    if kind == 'tablet': return (hand[0] + 5, hand[1] - 3)
    L = WLEN.get(kind, 6)
    return (hand[0] + dv[0] * L, hand[1] + dv[1] * L)

def weapon(d, kind, hand, ang, S, shade=1.0):
    dv, pv = axis(ang)
    def at(t, s=0): return (hand[0] + dv[0] * t + pv[0] * s, hand[1] + dv[1] * t + pv[1] * s)
    guard = S['acc']; grip = (84, 62, 48); st = sh(STEEL, shade)
    if kind in ('dagger', 'twinblades'):
        L = 7 if kind == 'dagger' else 9
        ln(d, at(-2), at(0), grip, 2); ln(d, at(0, -2), at(0, 2), guard, 1)
        ln(d, at(1), at(L), st, 2); px(d, at(L + 1), STEEL_HI)
    elif kind == 'longsword':
        ln(d, at(-4), at(0), grip, 2); ln(d, at(0, -3), at(0, 3), guard, 1); dot(d, at(-5), guard, 0)
        ln(d, at(1), at(13), st, 2); px(d, at(14), STEEL_HI)
    elif kind == 'saber':
        ln(d, at(-3), at(0), grip, 2); ln(d, at(0, -2), at(0, 2), guard, 1)
        pts = [at(1, 0), at(5, .2), at(9, 1), at(12, 2.4)]
        for a, b in zip(pts, pts[1:]): ln(d, a, b, st, 2)
        px(d, at(13, 3), STEEL_HI)
    elif kind == 'spear':
        L = S.get('reach', 15)
        ln(d, at(-9), at(L), sh(WOOD, shade), 1)
        poly(d, [at(L), at(L + 5), at(L, 2), at(L, -2)], st)
        poly(d, [at(L - 1, 2), at(L + 5, 0), at(L - 1, -2)], st)
        ln(d, at(L - 1, 0), at(L - 1, 0), guard, 1)
    elif kind == 'staff':
        ln(d, at(-10), at(13), sh((90, 66, 50), shade), 2)
        dot(d, at(15), S['emi'], 2); dot(d, at(15), STEEL_HI, 0)
        ln(d, at(12, -2), at(12, 2), guard, 1)
    elif kind == 'maul':
        ln(d, at(-7), at(13), sh((110, 85, 60), shade), 2)
        poly(d, [at(11, -4), at(17, -4), at(17, 4), at(11, 4)], sh(S['pri'], shade), S['acc'])
        ln(d, at(11, -4), at(11, 4), S['acc'], 1)
    elif kind == 'gauntlets':
        dot(d, hand, sh(S['pri'], shade), 2); px(d, at(2.5, 0), S['emi'])
        ln(d, at(1, -2), at(2, -2), S['acc'], 1)
    elif kind == 'scythe':
        ln(d, at(-8), at(16), sh(WOOD, shade), 2)
        pts = [at(16, 0), at(17, 2.5), at(15, 5), at(12, 7)]
        for a, b in zip(pts, pts[1:]): ln(d, a, b, st, 2)
    elif kind == 'bow':
        pts = [at(-6, 3), at(-3, 5.5), at(0, 6), at(3, 5.5), at(6, 3)]
        for a, b in zip(pts, pts[1:]): ln(d, a, b, sh(WOOD, shade), 2)
        ln(d, at(-6, 3), at(6, 3), STEEL_HI, 1)
    elif kind == 'lantern':
        ln(d, hand, (hand[0], hand[1] + 2), grip, 1)
        x, y = pt((hand[0], hand[1] + 3))
        d.rectangle([x - 2, y, x + 2, y + 5], fill=A(S['emi']), outline=A(S['acc']))
        px(d, (x, y - 1), S['acc'])
    elif kind == 'tablet':
        x, y = pt((hand[0] + 2, hand[1] - 6))
        d.rectangle([x, y, x + 6, y + 9], fill=A((24, 23, 28)), outline=A(S['emi']))
        for r_ in (2, 4, 6):
            ln(d, (x + 1.5, y + r_), (x + 4 + (r_ % 3 == 0), y + r_), mx(S['emi'], (0, 0, 0), .35), 1)

def shield(d, hand, S):
    cx, cy = hand[0] + 2, hand[1] + 1
    poly(d, [(cx - 4, cy - 5), (cx + 4, cy - 5), (cx + 4, cy + 1), (cx, cy + 7), (cx - 4, cy + 1)],
         S['sec'], S['acc'])
    ln(d, (cx, cy - 4), (cx, cy + 3), S['pri'], 1); px(d, (cx, cy - 1), S['emi'])

# ---------------------------------------------------------------- cosmetics
def draw_back(d, S, K, f, sway):
    pel, sho = K['pel'], K['sho']; k = S['back']
    if k == 'none': return
    fl = lambda ph: R(1.5 * math.sin(2 * math.pi * f / NF + ph))
    if k in ('cape', 'cloak'):
        L = 9 if k == 'cape' else 12
        col = S['sec'] if k == 'cape' else S['pri']
        poly(d, [(sho[0] - 1, sho[1] - 1), (sho[0] + 1, sho[1] + 1),
                 (pel[0] - 1 + sway, min(pel[1] + L + fl(0), GROUND - 1)), (pel[0] - 7 + sway * 2, min(pel[1] + L - 1 + fl(1.5), GROUND - 1))],
             sh(col, .85), S['acc'] if k == 'cloak' else None)
    elif k == 'quiver':
        ln(d, (sho[0] - 3, sho[1] + 1), (pel[0] - 3, pel[1] - 1), WOOD, 3)
        for i in range(3):
            ln(d, (sho[0] - 3 + i - 1, sho[1] - 1), (sho[0] - 3 + i - 1, sho[1] - 3 - i % 2), S['acc'], 1)
    elif k == 'tendrils':
        for i in range(3):
            st_ = (sho[0] - 2, sho[1] + i * 2 - 1); prev = st_
            for j in range(1, 6):
                q = (st_[0] - j * 2.4, st_[1] + (i - 1) * j * .9 + 1.8 * math.sin(2 * math.pi * f / NF + j * .9 + i))
                ln(d, prev, q, S['emi'] if j % 2 else S['acc'], 1); prev = q
    elif k == 'shards':
        for i, (ox_, oy_) in enumerate([(-8, -5), (-10, 2), (-7, 9)]):
            c = (sho[0] + ox_, min(sho[1] + oy_ + 1.3 * math.sin(2 * math.pi * f / NF + i * 2), GROUND - 4))
            poly(d, [(c[0], c[1] - 3), (c[0] + 2, c[1]), (c[0], c[1] + 3), (c[0] - 2, c[1])], S['emi'], S['acc'])

def draw_leg(d, hip, knee, foot, S, shade):
    body = sh(S['tone'], shade); wl = max(2, R(S['thick'] * 2.2))
    ln(d, hip, knee, body, wl); ln(d, knee, foot, body, wl)
    k = S['legs']; pri = sh(S['pri'], shade); sec = sh(S['sec'], shade); acc = sh(S['acc'], shade)
    if k == 'wraps':
        for a, b in ((.12, .3), (.7, .88)): ln(d, lerp(knee, foot, a), lerp(knee, foot, b), pri, wl)
    elif k == 'greaves':
        ln(d, lerp(knee, foot, .08), lerp(knee, foot, .9), pri, wl + 1)
        d.ellipse([pt(foot)[0] - 2, pt(foot)[1] - 1, pt(foot)[0] + 3, pt(foot)[1] + 1], fill=A(sec))
    elif k == 'plated':
        ln(d, lerp(hip, knee, .15), lerp(hip, knee, .9), pri, wl + 1)
        ln(d, lerp(knee, foot, .08), lerp(knee, foot, .92), pri, wl + 1); dot(d, knee, acc, 0)
    ln(d, foot, (foot[0] + 2, foot[1]), sh(S['sec'] if k in ('greaves', 'plated') else S['tone'], shade), 1)

def draw_arm(d, sho, elb, hand, S, shade=1.0):
    body = sh(S['tone'], shade); wl = max(2, R(S['thick'] * 2.2))
    sl = S['pri'] if S['chest'] in ('coat', 'robe') else S['tone']
    up = sh(sl, shade)
    ln(d, sho, elb, up, wl + (1 if S['chest'] == 'robe' else 0))
    ln(d, elb, hand, sh(S['pri'] if S['chest'] == 'robe' else S['tone'], shade), wl)
    dot(d, hand, body, 1 if S['weapon'] != 'gauntlets' else 0)
    if S['jointglow']: px(d, elb, S['emi'])

def draw_torso(d, S, K, P):
    pel, neck, sho = K['pel'], K['neck'], K['sho']; sway = P['sway']
    wl = max(2, R(S['thick'] * 2.2)); H = S['height']; c = S['chest']
    tw = wl + (1 if S['thick'] > 1.1 else 0)
    ln(d, pel, neck, S['tone'], tw)
    p_ = lambda t: lerp(pel, neck, t)
    if c == 'wraps':
        ln(d, (p_(.1)[0] - 2, p_(.1)[1]), (p_(.8)[0] + 2, p_(.8)[1]), S['pri'], 1)
        ln(d, (p_(.1)[0] + 2, p_(.1)[1]), (p_(.8)[0] - 2, p_(.8)[1]), S['pri'], 1)
        ln(d, (pel[0] - 2, pel[1]), (pel[0] + 2, pel[1]), S['sec'], 1)
    elif c == 'harness':
        ln(d, (sho[0] - 2, sho[1]), (p_(.12)[0] + 2, p_(.12)[1]), S['sec'], 1)
        ln(d, (sho[0] + 2, sho[1]), (p_(.12)[0] - 2, p_(.12)[1]), S['sec'], 1)
        ln(d, (pel[0] - 2, pel[1] - 1), (pel[0] + 2, pel[1] - 1), S['sec'], 1); px(d, p_(.5), S['acc'])
    elif c in ('coat', 'robe'):
        L = 8 if c == 'coat' else 11
        hy_ = min(pel[1] + L * H * .9, GROUND - 1)
        hf = (pel[0] + 4 + sway * .6, hy_); hb = (pel[0] - 5 + sway * 1.4, hy_)
        poly(d, [(sho[0] - 2.5, sho[1]), (sho[0] + 2.5, sho[1]), hf, hb], S['pri'])
        ln(d, (sho[0] + 2, sho[1]), hf, S['sec'], 1)
        ln(d, (p_(.15)[0] - 3, p_(.15)[1]), (p_(.15)[0] + 3, p_(.15)[1]), S['sec'], 1)
        if c == 'robe': ln(d, (sho[0], sho[1] + 1), (sho[0], sho[1] + 1), S['acc'], 1)
    elif c == 'plate':
        poly(d, [(sho[0] - 3, sho[1] - 1), (sho[0] + 3, sho[1] - 1), (pel[0] + 3, pel[1]), (pel[0] - 3, pel[1])],
             S['pri'], S['sec'])
        ln(d, (sho[0] + 2, sho[1]), (pel[0] + 2, pel[1] - 1), S['acc'], 1)
        ln(d, (pel[0] - 3, pel[1]), (pel[0] + 3, pel[1]), S['sec'], 2)
    elif c == 'chitin':
        poly(d, [(sho[0] - 3, sho[1] - 1), (sho[0] + 3, sho[1] - 1), (pel[0] + 3, pel[1]), (pel[0] - 3, pel[1])],
             S['pri'], S['sec'])
        for t in (.25, .5, .75): ln(d, (p_(t)[0] - 3, p_(t)[1]), (p_(t)[0] + 3, p_(t)[1]), S['acc'], 1)
    if S['legs'] == 'skirt':
        for dx_, col in ((-1, S['sec']), (3, S['pri'])):
            poly(d, [(pel[0] + dx_ - 2, pel[1]), (pel[0] + dx_ + 2, pel[1]),
                     (pel[0] + dx_ + 1 + sway * .5, pel[1] + 6), (pel[0] + dx_ - 2 + sway * .5, pel[1] + 6)], col)
    if c in ('plate', 'chitin') or S['pauldron']:
        dot(d, (sho[0] + 1, sho[1]), S['pri'], 2); px(d, (sho[0] + 1, sho[1] - 2), S['acc'])
    if c == 'chitin':
        poly(d, [(sho[0] - 1, sho[1] - 2), (sho[0] + 1, sho[1] - 6), (sho[0] + 3, sho[1] - 2)], S['acc'])
        poly(d, [(sho[0] - 4, sho[1] - 1), (sho[0] - 7, sho[1] - 5), (sho[0] - 2, sho[1] - 2)], S['acc'])

def draw_head(d, S, K, f):
    h = K['head']; hx, hy = pt(h); k = S['helm']; tone = S['tone']
    fl = R(math.sin(2 * math.pi * f / NF))
    ln(d, K['neck'], h, tone, max(2, R(S['thick'] * 2.2)))
    d.ellipse([hx - 3, hy - 3, hx + 3, hy + 3], fill=A(tone))
    if k == 'wrap':
        ln(d, (hx - 3, hy - 1), (hx + 3, hy - 1), S['pri'], 2)
        ln(d, (hx - 3, hy - 1), (hx - 6, hy - 1 + fl), S['sec'], 1); ln(d, (hx - 6, hy - 1 + fl), (hx - 9, hy + 1 - fl), S['sec'], 1)
    elif k == 'circlet':
        ln(d, (hx - 3, hy - 3), (hx + 3, hy - 3), S['acc'], 1); px(d, (hx + 2, hy - 3), S['emi'])
    elif k == 'visor':
        d.pieslice([hx - 4, hy - 4, hx + 4, hy + 4], 180, 360, fill=A(S['pri']))
        ln(d, (hx, hy), (hx + 3, hy), S['emi'], 1)
    elif k == 'hood':
        d.ellipse([hx - 4, hy - 4, hx + 4, hy + 4], fill=A(S['pri']))
        d.ellipse([hx, hy - 2, hx + 4, hy + 2], fill=A((18, 18, 20)))
        poly(d, [(hx - 3, hy - 2), (hx - 7, hy + 1 + fl), (hx - 3, hy + 3)], S['pri'])
        px(d, (hx + 2, hy), S['emi'])
    elif k == 'helm':
        d.ellipse([hx - 4, hy - 4, hx + 3, hy + 4], fill=A(S['pri']), outline=A(S['sec']))
        ln(d, (hx, hy), (hx + 3, hy), (14, 14, 16), 1)
        ln(d, (hx, hy - 4), (hx - 4, hy - 6 + fl), S['acc'], 2)
    elif k == 'mask':
        d.pieslice([hx - 3, hy - 3, hx + 3, hy + 3], 270, 90, fill=A(BONE)); px(d, (hx + 1, hy - 1), (14, 14, 16))
    elif k == 'spike':
        for i, dx_ in enumerate((-2, 0, 2)):
            ln(d, (hx + dx_, hy - 3), (hx + dx_ * 1.5, hy - 6 - (i == 1)), S['acc'], 1)
    elif k == 'mandibles':
        ln(d, (hx + 2, hy), (hx + 5, hy + 2), S['acc'], 1); ln(d, (hx + 5, hy + 2), (hx + 4, hy + 4), S['acc'], 1)
        ln(d, (hx + 2, hy + 2), (hx + 5, hy + 4), S['acc'], 1)
    if S['eyes'] or k == 'mandibles':
        px(d, (hx + 1, hy - 1), S['emi']); px(d, (hx + 2, hy - 1), S['emi'])

def draw_seal(d, S, K, f):
    hx, hy = K['head']; hy -= 3 + 5 + R(.8 * math.sin(2 * math.pi * f / NF))
    c = RANK_COL[S['rank']]; hx = R(hx); hy = R(hy)
    if S['rank'] == 'Crown':
        d.ellipse([hx - 4, hy - 1, hx + 4, hy + 1], outline=A(c))
    elif S['rank'] == 'Null':
        poly(d, [(hx, hy - 3), (hx + 3, hy), (hx, hy + 3), (hx - 3, hy)], (10, 8, 14), c)
    elif S['rank'] == 'Unsealed':
        for a, b in (((hx - 3, hy), (hx, hy - 3)), ((hx - 3, hy), (hx, hy + 3)), ((hx, hy + 3), (hx + 2, hy + 1))):
            ln(d, a, b, c, 1)
        px(d, (hx + 1, hy - 2), c); px(d, (hx + 3, hy), (110, 106, 100))
    else:
        poly(d, [(hx, hy - 3), (hx + 3, hy), (hx, hy + 3), (hx - 3, hy)], sh(c, .35), c)
        px(d, (hx, hy), c)

# ---------------------------------------------------------------- fx
def do_fx(fd, S, P, K, f):
    ec = S['emi']; pale = mx(ec, (255, 255, 255), .6)
    hand = K['fh']; tip = tip_of(S, S['weapon'], hand, P['w'])
    tip = (min(tip[0], CELL - 13), max(tip[1], 9))
    for t in P['fx']:
        k = t[0]
        if k == 'arc':
            Rr = dist(K['sho'], hand) + WLEN.get(S['weapon'], 6) * .75
            n = 14; pts = []
            for i in range(n + 1):
                a = math.radians(t[1] + (t[2] - t[1]) * i / n)
                pts.append((K['sho'][0] + Rr * math.sin(a), K['sho'][1] + Rr * math.cos(a)))
            for i in range(n):
                fd.line([pt(pts[i]), pt(pts[i + 1])], fill=A(pale, int(110 + 110 * i / n)),
                        width=2 if 3 <= i <= n - 3 else 1)
        elif k == 'streak':
            for off in (-3, 3):
                fd.line([pt((hand[0] - 7, hand[1] + off)), pt((tip[0] - 4, hand[1] + off))], fill=A(pale, 150), width=1)
        elif k == 'shock':
            x = tip[0]; y = GROUND - 1 if tip[1] > GROUND - 12 else tip[1]
            for a in range(-170, -5, 24):
                c, s = math.cos(math.radians(a)), math.sin(math.radians(a))
                fd.line([pt((x + 3 * c, y + 3 * s)), pt((x + (6 + f % 2 * 3) * c, y + (6 + f % 2 * 3) * s))],
                        fill=A((200, 190, 170), 190), width=1)
        elif k == 'charge':
            r = t[1]
            fd.ellipse([pt(tip)[0] - r - 2, pt(tip)[1] - r - 2, pt(tip)[0] + r + 2, pt(tip)[1] + r + 2], fill=A(ec, 80))
            fd.ellipse([pt(tip)[0] - r, pt(tip)[1] - r, pt(tip)[0] + r, pt(tip)[1] + r], fill=A(ec, 235))
            for i in range(4):
                a = math.pi / 2 * i + f
                fd.point(pt((tip[0] + (r + 4) * math.cos(a), tip[1] + (r + 4) * math.sin(a))), fill=A(pale))
        elif k == 'burst':
            for i in range(8):
                a = math.pi / 4 * i
                fd.line([pt((tip[0] + 3 * math.cos(a), tip[1] + 3 * math.sin(a))),
                         pt((tip[0] + (6 + i % 2 * 3) * math.cos(a), tip[1] + (6 + i % 2 * 3) * math.sin(a)))],
                        fill=A(ec, 230), width=1)
            fd.ellipse([pt(tip)[0] - 2, pt(tip)[1] - 2, pt(tip)[0] + 2, pt(tip)[1] + 2], fill=A((255, 255, 255)))
        elif k == 'ring':
            x, y = pt(tip)
            fd.ellipse([x - 7, y - 7, x + 7, y + 7], outline=A(ec, 170))
            fd.ellipse([x - 11, y - 11, x + 11, y + 11], outline=A(ec, 70))
        elif k == 'impact':
            x, y = pt((K['sho'][0] + 5, K['sho'][1] - 2))
            for a, b in (((-4, 0), (4, 0)), ((0, -4), (0, 4)), ((-3, -3), (3, 3)), ((-3, 3), (3, -3))):
                fd.line([(x + a[0], y + a[1]), (x + b[0], y + b[1])], fill=A((255, 255, 255), 230), width=1)
        elif k == 'ash':
            n = t[1]
            for i in range(n):
                x = K['pel'][0] - 14 + (i * 37) % 28
                rise = ((i * 7) % 6 + 3) * (1 if n < 6 else 1.7)
                fd.point((R(x + (i % 3 - 1)), R(GROUND - 3 - rise - (i % 4) * 2)), fill=A((190, 184, 176), 200))

def aura_layer(S, f, cx):
    L = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    k = S['aura']
    if k == 'none': return L
    cols = AURA[k]; Rg = 36
    pulse = 70 + int(40 * math.sin(2 * math.pi * f / NF))
    d.ellipse([R(cx) - 11, GROUND - 1, R(cx) + 11, GROUND + 3], outline=A(cols[0], pulse))
    if k == 'storm':
        for i in range(5):
            x = cx + ((i * 29 + f * 17) % 25 - 12); y = GROUND - 8 - ((i * 31 + f * 11) % 30)
            d.line([(R(x), R(y)), (R(x + 3), R(y + 3)), (R(x), R(y + 6)), (R(x + 3), R(y + 9))], fill=A(cols[i % 3], 220))
        return L
    for i in range(9):
        base = (i * 53) % Rg
        t = ((base + f * Rg / NF) % Rg) / Rg
        x = cx + ((i * 37) % 21 - 10) + R(2 * math.sin(2 * math.pi * f / NF + i))
        y = GROUND - 3 - (1 - t if k == 'frost' else t) * Rg
        al = int(255 * (1 - t) ** .7); c = cols[i % 3]; x, y = R(x), R(y)
        if k == 'ember': d.point((x, y), fill=A(c, al)); (d.point((x, y - 1), fill=A(c, al)) if i % 3 == 0 else None)
        elif k == 'frost':
            d.point((x, y), fill=A(c, al))
            if i % 3 == 0:
                for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)): d.point((x + ddx, y + ddy), fill=A(c, al // 2))
        elif k == 'void': d.rectangle([x, y, x + 1, y + 1], fill=A(c, al))
        elif k == 'light':
            d.point((x, y), fill=A(c, al))
            for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)): d.point((x + ddx, y + ddy), fill=A(c, al // 2))
        elif k == 'venom': d.ellipse([x - 1, y - 1, x + 1, y + 1], outline=A(c, al))
        elif k == 'ash': d.point((x, y), fill=A(c, al))
    return L

# ---------------------------------------------------------------- render
def render(S, anim, f):
    # shift the body sideways in 2px steps until nothing touches the cell's left/right edge
    extra = 0
    for _ in range(8):
        out, touched = render_once(S, anim, f, extra)
        if touched == 0: return out
        extra += -2 * touched
    return out

def render_once(S, anim, f, extra):
    P = pose(S, anim, f); P['dx'] += extra
    if S['weapon'] == 'spear' and anim == 'cast' and f in (1, 2): P['w'] = 140
    K = solve(S, P)
    fig = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); d = ImageDraw.Draw(fig)
    fxl = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); fd = ImageDraw.Draw(fxl)
    sway = P['sway']
    draw_back(d, S, K, f, sway)
    # far (off-hand) arm and weapon
    draw_arm(d, K['sho'], K['be'], K['bh'], S, .7)
    if S['offhand'] not in ('none', 'shield'):
        weapon(d, S['offhand'], K['bh'], P['ow'], S, .8)
    elif has_twin(S):
        weapon(d, 'twinblades', K['bh'], P['ow'], S, .8)
    draw_leg(d, K['pel'], K['bk'], K['bf'], S, .72)
    draw_leg(d, K['pel'], K['fk'], K['ff'], S, 1.0)
    draw_torso(d, S, K, P)
    draw_head(d, S, K, f)
    draw_arm(d, K['sho'], K['fe'], K['fh'], S)
    weapon(d, S['weapon'], K['fh'], P['w'], S)
    if S['offhand'] == 'shield': shield(d, K['bh'], S)
    if S['jointglow']:
        for q in (K['fk'], K['bk'], K['sho'], K['pel'], K['fh'], K['bh']): px(fd, q, S['emi'])
    draw_seal(fd, S, K, f)
    do_fx(fd, S, P, K, f)
    if P['flash']:
        rgb = Image.blend(fig.convert('RGB'), Image.new('RGB', fig.size, (255, 255, 255)), P['flash'])
        rgb = rgb.convert('RGBA'); rgb.putalpha(fig.split()[3]); fig = rgb
    # outline
    lum = sum(S['tone']) / 3
    rim = (118, 112, 104) if lum < 70 else INK
    dil = fig.split()[3].filter(ImageFilter.MaxFilter(3))
    ol = Image.new('RGBA', fig.size, A(rim)); ol.putalpha(dil)
    body = Image.alpha_composite(ol, fig)
    if P['crumble']:
        pxl = body.load(); n = 0
        for y in range(CELL):
            for x in range(CELL):
                n += 1
                if pxl[x, y][3] and ((x * 73856093) ^ (y * 19349663) ^ (f * 83492791)) % 100 < P['crumble'] * 100:
                    pxl[x, y] = (0, 0, 0, 0)
    out = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); od = ImageDraw.Draw(out)
    lying = anim == 'death' and f >= 3
    od.ellipse([R(K['pel'][0]) - (16 if lying else 9), GROUND - 1, R(K['pel'][0]) + (16 if lying else 9), GROUND + 2],
               fill=(0, 0, 0, 70))
    out.alpha_composite(aura_layer(S, f, K['pel'][0]))
    out.alpha_composite(body); out.alpha_composite(fxl)
    ea = Image.alpha_composite(body, fxl).split()[3]; q = ea.load()
    right = any(q[CELL - 1, y] for y in range(CELL)); left = any(q[0, y] for y in range(CELL))
    touched = 1 if right else (-1 if left else 0)
    return out, touched

def build_sheet(S):
    sheet = Image.new('RGBA', (CELL * NF, CELL * len(ANIMS)), (0, 0, 0, 0))
    for r, (an, _, _) in enumerate(ANIMS):
        for f in range(NF): sheet.alpha_composite(render(S, an, f), (f * CELL, r * CELL))
    return sheet

def main():
    os.makedirs(OUT + '/sheets', exist_ok=True)
    only = sys.argv[2:] if len(sys.argv) > 2 else None
    meta = dict(game='Veilspire', cell=[CELL, CELL], frames=NF, anchor=dict(x=CX, y=GROUND), facing='right',
                note='Flip horizontally for left-facing. Anchor = feet on the ground, body centred on x.',
                animations={a: dict(row=i, frames=NF, fps=fps, loop=lp) for i, (a, fps, lp) in enumerate(ANIMS)},
                characters=[])
    sheets = {}
    for S in ROSTER:
        if only and S['id'] not in only: continue
        sh_ = build_sheet(S); sheets[S['id']] = sh_
        sh_.save(f"{OUT}/sheets/{S['id']}.png")
        meta['characters'].append(dict(id=S['id'], name=S['name'], title=S['title'], role=S['role'],
                                       rank=S['rank'], weapon=S['weapon'], offhand=S['offhand'],
                                       aura=S['aura'], sheet=f"sheets/{S['id']}.png"))
    json.dump(meta, open(OUT + '/veilspire_sprites.json', 'w'), indent=2)
    return sheets, meta

if __name__ == '__main__':
    main()
    print('ok')
