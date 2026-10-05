#!/usr/bin/env python3
"""Veilspire - iso renderer v2. Lifts the 2D stick-rig (gen_sprites.py) into 3D and renders 8 facings
with a 2:1 dimetric camera.   Usage: python3 gen_iso.py OUT_DIR [char_id ... | all]"""
import math, json, os, sys
from PIL import Image, ImageDraw, ImageFilter
import gen_sprites as gs
from gen_sprites import sh, mx, A, INK

gs.pt = lambda p: (p[0], p[1])           # keep sub-pixel coords; the Proxy rounds after projecting

NF = gs.NF
TIERS = {'standard': dict(cell=96, ax=48, ay=74, shadow=(10, 5)),
         'large': dict(cell=128, ax=64, ay=100, shadow=(16, 8))}
# per-character overrides (the original roster file stays untouched)
OVR = {'the_carapace': dict(tier='large', height=1.5, thick=1.7, scale=1.2)}
DONE = ['bram_holt', 'orin_vale', 'cinder', 'floor_voice', 'the_carapace', 'ren_calder', 'sera_quill', 'kade_morr', 'nyx_lumen', 'mairen_solas', 'irix_venn', 'juno_rake']
CELL, AX, AY = 96, 48, 74                # set per character by prep()

DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']      # row order, 45 deg apart, clockwise on screen
MOVE = {'E': (1, 0), 'SE': (.707, .707), 'S': (0, 1), 'SW': (-.707, .707),
        'W': (-1, 0), 'NW': (-.707, -.707), 'N': (0, -1), 'NE': (.707, -.707)}
TILE_STEP = {'SE': '+x', 'SW': '+y', 'NW': '-x', 'NE': '-y', 'S': '+x+y', 'N': '-x-y', 'E': '+x-y', 'W': '-x+y'}

def prep(S):
    global CELL, AX, AY
    o = dict(OVR.get(S['id'], {})); tier = o.pop('tier', 'standard'); T = TIERS[tier]
    CELL, AX, AY = T['cell'], T['ax'], T['ay']
    S2 = {**S, **o}; S2.setdefault('scale', 1.0); S2['tier'] = tier
    return S2

# ------------------------------------------------------------ attack skills
# New pose fields on top of the original rig: turn = body twist in degrees (+ = toward the right hand),
# so sweeps and spins come from the whole body turning. fx kinds new here: sweep, pulse, spark_b.
SWEEP = [
    dict(turn=35, lean=-4, ft=(14, 6), bt=(-18, -10), fa=(70, 92), w=92),
    dict(turn=75, lean=-8, ft=(18, 8), bt=(-24, -12), fa=(60, 88), w=95),
    dict(turn=25, lean=6, ft=(26, 12), bt=(-22, -12), fa=(85, 95), w=92, fx=[('sweep', 75, 25)]),
    dict(turn=-30, lean=12, ft=(30, 14), bt=(-26, -14), fa=(88, 95), w=90, fx=[('sweep', 25, -35)]),
    dict(turn=-60, lean=14, ft=(32, 16), bt=(-28, -14), fa=(85, 92), w=88, fx=[('sweep', -35, -65)]),
    dict(turn=-25, lean=6, ft=(20, 8), bt=(-16, -8), fa=(40, 75), w=120)]
WHIRL = [
    dict(turn=-30, lean=-6, ft=(18, 8), bt=(-20, -10), fa=(70, 92), w=95),
    dict(turn=60, lean=4, ft=(22, 10), bt=(-22, -12), fa=(80, 92), w=92, fx=[('sweep', -30, 60)]),
    dict(turn=155, lean=8, lift=2, ft=(22, 10), bt=(-22, -12), fa=(85, 95), w=90, fx=[('sweep', 60, 155)]),
    dict(turn=250, lean=8, lift=2, ft=(22, 10), bt=(-22, -12), fa=(85, 95), w=90, fx=[('sweep', 155, 250)]),
    dict(turn=345, lean=8, lift=1, ft=(22, 10), bt=(-22, -12), fa=(85, 95), w=90, fx=[('sweep', 250, 345)]),
    dict(turn=372, lean=2, ft=(14, 6), bt=(-14, -8), fa=(40, 75), w=120)]
FLURRY = [
    dict(lean=2, ft=(14, 6), bt=(-14, -8), fa=(55, 90), ba=(-15, 35), w=100, ow=100),
    dict(lean=10, dx=2, ft=(26, 12), bt=(-24, -12), fa=(88, 90), ba=(20, 55), w=90, ow=110, fx=[('streak',)]),
    dict(lean=10, dx=3, ft=(28, 14), bt=(-26, -12), fa=(35, 65), ba=(88, 92), w=110, ow=90),
    dict(lean=12, dx=3, ft=(30, 14), bt=(-28, -12), fa=(88, 92), ba=(30, 55), w=90, ow=110, fx=[('streak',)]),
    dict(lean=12, dx=4, ft=(30, 14), bt=(-28, -12), fa=(35, 65), ba=(90, 92), w=110, ow=90),
    dict(lean=4, dx=1, ft=(18, 8), bt=(-16, -8), fa=(50, 85), ba=(10, 45), w=100, ow=100)]
PULSE = [
    dict(lean=0, ft=(14, 6), bt=(-14, -8), fa=(50, 100), w=170),
    dict(lean=-6, ft=(12, 4), bt=(-16, -10), fa=(120, 165), w=178, fx=[('charge', 1)]),
    dict(lean=-8, ft=(10, 2), bt=(-18, -12), fa=(150, 175), w=182, fx=[('charge', 2)]),
    dict(lean=14, ft=(28, 14), bt=(-22, -12), fa=(80, 70), w=35, fx=[('pulse', 14)]),
    dict(lean=10, ft=(26, 12), bt=(-22, -12), fa=(75, 70), w=30, fx=[('pulse', 28)]),
    dict(lean=4, ft=(18, 8), bt=(-14, -8), fa=(50, 90), w=140, fx=[('pulse', 38)])]
BASH = [
    dict(lean=-4, ft=(14, 6), bt=(-14, -8), fa=(40, 80), ba=(25, 85)),
    dict(lean=-12, dx=-2, ft=(12, 4), bt=(-20, -14), fa=(-30, 20), ba=(5, 60)),
    dict(lean=18, dx=4, ft=(36, 16), bt=(-30, -14), fa=(15, 50), ba=(88, 95), psi=4, fx=[('spark_b',)]),
    dict(lean=20, dx=5, ft=(38, 18), bt=(-30, -14), fa=(15, 50), ba=(88, 95), psi=4, fx=[('spark_b',)]),
    dict(lean=10, dx=2, ft=(26, 12), bt=(-24, -12), fa=(30, 70), ba=(70, 90), psi=18),
    dict(lean=3, dx=0, ft=(16, 6), bt=(-12, -6), fa=(30, 80), ba=(40, 85))]
TABLES = dict(slash=gs.SLASH, thrust=gs.THRUST, slam=gs.SLAM, cast=gs.CAST,
              sweep=SWEEP, whirl=WHIRL, flurry=FLURRY, pulse=PULSE, bash=BASH)
# outward weapon lean per frame (degrees) so the weapon head never sits on the helm
PHI_STYLE = dict(slam=[26, 16, 8, 0, 0, 14], slash=[20, 14, 6, 0, 0, 10], thrust=[10, 6, 0, 0, 0, 6],
                 cast=[28, 22, 16, 10, 10, 18], sweep=[0] * 6, whirl=[0] * 6, flurry=[0] * 6,
                 pulse=[28, 22, 16, 8, 8, 18], bash=[28, 28, 0, 0, 10, 24],
                 launcher=[20, 14, 6, 0, 0, 10], air=[20, 14, 6, 0, 0, 10], plunge=[28, 28, 0, 0, 0, 10])
HIT_FRAMES = dict(slam=[3], slash=[2], thrust=[2], cast=[3], sweep=[3], whirl=[2, 3, 4], flurry=[1, 2, 3, 4], pulse=[3], bash=[2],
                  launcher=[2, 3], air=[2, 3], plunge=[3])
STYLE_NAME = dict(slam='Overhead slam', slash='Slash', thrust='Thrust', cast='Cast', sweep='Wide sweep',
                  whirl='Whirlwind', flurry='Flurry', pulse='Ground pulse', bash='Shield bash',
                  launcher='Rising strike', air='Aerial slash', plunge='Plunge')
# (startup frames before the first hit, first frame the next input may cancel in) + tags the combat code can key on
TIMING = dict(slash=(2, 4), thrust=(2, 4), slam=(3, 5), cast=(3, 5), sweep=(3, 5), whirl=(2, 5), flurry=(1, 4), pulse=(3, 5),
              bash=(2, 4), launcher=(2, 4), air=(2, 4), plunge=(3, 5))
TAGS = dict(launcher=['launcher'], air=['air_only'], plunge=['air_only', 'spike'], bash=['guard_break'], whirl=['multi_hit'], flurry=['multi_hit'])
WEAPON_SKILLS = {'maul': ['slam', 'sweep', 'bash'], 'spear': ['thrust', 'sweep', 'whirl'],
                 'longsword': ['slash', 'thrust', 'whirl'], 'saber': ['thrust', 'slash', 'flurry'],
                 'twinblades': ['slash', 'flurry', 'whirl'], 'dagger': ['flurry', 'slash', 'thrust'],
                 'staff': ['cast', 'pulse', 'sweep'], 'lantern': ['cast', 'pulse', 'sweep'],
                 'tablet': ['cast', 'pulse'], 'gauntlets': ['flurry', 'slam', 'sweep']}
def skills_for(S):
    sk = list(WEAPON_SKILLS.get(S['weapon'], ['slash']))
    if S['offhand'] != 'shield' and 'bash' in sk: sk.remove('bash')
    return sk

def style_of(S, anim):
    if anim.startswith('attack'): return skills_for(S)[int(anim[6:]) - 1]
    return EXTRA.get(anim)

def pose_for(S, anim, f):
    style = style_of(S, anim)
    if style is None and anim not in BODY: return gs.pose(S, anim, f), None
    T = TABLES[style] if style else BODY[anim]
    P = dict(lean=0, dx=0, lift=0, ft=(10, 4), bt=(-10, -6), fa=(25, 80), ba=(-10, 20),
             w=gs.READY.get(S['weapon'], 90), flash=0, fx=[], sway=0, crumble=0)
    P.update(T[f]); P['sway'] = -1; P['f'] = f
    if 'ba' not in T[f]:
        if S['offhand'] == 'shield': P['ba'] = (35, 85)
        elif gs.has_off(S): P['ba'] = T[(f - 1) % NF].get('fa', P['fa'])
    if 'ow' not in T[f]: P['ow'] = P['w']
    return P, style


# --- juggle toolkit: new fields  pitch = body tilt about the pelvis (+ back, - forward),  gnd = rests on the floor (0..1)
LAUNCHER = [   # rising strike that pops an enemy up
    dict(lean=10, dx=-1, ft=(30, 14), bt=(-26, -14), fa=(-40, -20), w=25),
    dict(lean=14, dx=-2, ft=(34, 16), bt=(-28, -14), fa=(-55, -30), w=-5),
    dict(lean=4, dx=1, lift=1, ft=(26, 12), bt=(-20, -10), fa=(55, 75), w=75, fx=[('arc', 45, 105)]),
    dict(lean=-4, dx=2, lift=2, ft=(20, 8), bt=(-14, -8), fa=(130, 150), w=150, fx=[('arc', 100, 165)]),
    dict(lean=-8, dx=2, lift=2, ft=(14, 6), bt=(-10, -6), fa=(150, 170), w=170),
    dict(lean=0, ft=(14, 6), bt=(-12, -6), fa=(60, 90), w=130)]
AIR = [        # aerial slash: its OWN leg animation (not the jump tuck). wind-up = knees drawn up together, strike = lead leg
               # driven forward and bent, trail leg thrown back and straight (a scissor / flying-lunge), landing prep = legs reach down.
               # ls = (front leg, back leg) outward splay in degrees so the leg motion still reads when you face the camera.
    dict(lean=-4, ft=(70, 18), bt=(60, 14), ls=(6, 6), fa=(-50, -90), w=215),
    dict(lean=-8, ft=(84, 12), bt=(70, 8), ls=(8, 8), fa=(-110, -140), w=228),
    dict(lean=8, ft=(52, 20), bt=(-40, -62), ls=(10, 22), fa=(40, 80), w=150, fx=[('arc', 230, 140)]),
    dict(lean=14, ft=(40, 28), bt=(-52, -78), ls=(12, 28), fa=(85, 95), w=95, fx=[('arc', 160, 70)]),
    dict(lean=14, ft=(32, 24), bt=(-46, -70), ls=(12, 26), fa=(75, 50), w=45, fx=[('arc', 100, 20)]),
    dict(lean=6, ft=(18, 8), bt=(-12, -18), ls=(8, 12), fa=(40, 70), w=130)]
PLUNGE = [     # dive strike: raise, then drive down and forward
    dict(lean=-6, ft=(40, 10), bt=(25, -10), fa=(120, 160), w=175),
    dict(lean=-10, ft=(45, 12), bt=(30, -8), fa=(150, 175), w=185),
    dict(pitch=-20, lean=14, ft=(-15, -25), bt=(-22, -30), fa=(70, 50), w=30),
    dict(pitch=-30, lean=14, ft=(-18, -28), bt=(-24, -32), fa=(60, 40), w=20, fx=[('shock',)]),
    dict(pitch=-10, lean=14, ft=(20, 4), bt=(-6, -10), fa=(70, 45), w=25, fx=[('shock',)]),
    dict(lean=6, ft=(35, 10), bt=(15, -8), fa=(40, 70), w=120)]
JUMP = [       # crouch, rise, apex tuck, fall, pre-land, land.  Legs stay together and symmetrical: plain jumps never scissor.
    dict(lean=12, ft=(50, -5), bt=(35, -15), ls=(2, 2), fa=(35, 70), ba=(25, 60)),
    dict(lean=-4, ft=(8, 6), bt=(-8, -6), ls=(2, 2), fa=(120, 150), ba=(110, 140)),
    dict(lean=0, ft=(58, 6), bt=(58, 6), ls=(3, 3), fa=(95, 110), ba=(85, 105)),
    dict(lean=3, ft=(20, 8), bt=(14, 4), ls=(5, 5), fa=(115, 140), ba=(100, 130)),
    dict(lean=4, ft=(10, 4), bt=(-10, -4), ls=(4, 4), fa=(105, 130), ba=(95, 120)),
    dict(lean=14, ft=(46, -8), bt=(30, -12), ls=(2, 2), fa=(45, 70), ba=(30, 60))]
LAUNCH = [     # hit, then flung up and back into a lying-back tumble pose
    dict(lean=-4, dx=-1, flash=.8, pitch=8, ft=(8, 2), bt=(-14, -10), fa=(-30, 10), ba=(-40, -10), fx=[('impact',)]),
    dict(lean=-6, dx=-2, flash=.5, pitch=24, ft=(0, -8), bt=(-20, -24), fa=(-60, -20), ba=(-70, -30), fx=[('impact',)]),
    dict(lean=-4, dx=-2, pitch=44, ft=(-6, -14), bt=(-22, -26), fa=(-90, -60), ba=(-100, -70)),
    dict(lean=-3, dx=-2, pitch=60, ft=(-10, -18), bt=(-24, -28), fa=(-110, -80), ba=(-120, -90)),
    dict(lean=-2, dx=-2, pitch=70, ft=(-8, -16), bt=(-22, -26), fa=(-100, -75), ba=(-112, -88)),
    dict(lean=-2, dx=-2, pitch=76, ft=(-8, -14), bt=(-18, -22), fa=(-95, -70), ba=(-105, -85))]
def _tumble(f):
    s = math.sin(2 * math.pi * f / NF)
    return dict(turn=f * 60, pitch=72 + 6 * s, lean=-4, ft=(-8 + 10 * s, -14 + 8 * s), bt=(-14 - 10 * s, -22 - 8 * s),
                fa=(-95 + 14 * s, -70 + 10 * s), ba=(-105 - 14 * s, -85 - 10 * s))
TUMBLE = [_tumble(f) for f in range(NF)]   # air loop: lying back and spinning, seamless over 6 frames
_LAY = dict(ft=(8, 4), bt=(-6, -2), fa=(10, 0), ba=(-14, -6))
KNOCKDOWN = [  # land, slam, bounce, slam, settle, settle
    dict(pitch=82, gnd=.5, ft=(-8, -14), bt=(-14, -22), fa=(-90, -70), ba=(-100, -85)),
    dict(pitch=90, gnd=1, flash=.6, ft=(-4, -10), bt=(-10, -16), fa=(-40, -20), ba=(-60, -30), fx=[('impact',)]),
    dict(pitch=76, gnd=.6, ft=(-8, -14), bt=(-14, -22), fa=(-80, -60), ba=(-92, -76)),
    dict(pitch=90, gnd=1, ft=(2, -4), bt=(-6, -10), fa=(-20, -6), ba=(-40, -18)),
    dict(pitch=90, gnd=1, **_LAY), dict(pitch=90, gnd=1, **_LAY)]
GETUP = [
    dict(pitch=90, gnd=1, **_LAY),
    dict(pitch=60, gnd=1, lean=-5, ft=(30, 10), bt=(10, -8), fa=(40, 20), ba=(30, 10)),
    dict(pitch=28, gnd=1, ft=(50, -10), bt=(30, -15), fa=(35, 50), ba=(20, 40)),
    dict(pitch=8, gnd=1, lean=14, ft=(48, -8), bt=(28, -14), fa=(40, 70), ba=(25, 60)),
    dict(lean=10, ft=(30, 6), bt=(-10, -8), fa=(30, 80), ba=(0, 40)),
    dict(lean=3, ft=(14, 6), bt=(-12, -6), fa=(22, 78), ba=(-8, 22))]
GUARD = [       # brace: weapon and forearms across the body, knees bent; frames 2-3 are the held pose
    dict(lean=-2, ft=(18, 6), bt=(-16, -8), fa=(50, 85), ba=(40, 80), w=110, ow=110),
    dict(lean=-6, dx=-1, ft=(22, 8), bt=(-20, -10), fa=(70, 105), ba=(65, 100), w=125, ow=125, flash=.3),
    dict(lean=-8, dx=-1, ft=(24, 8), bt=(-22, -10), fa=(78, 112), ba=(74, 108), w=130, ow=130),
    dict(lean=-8, dx=-1, ft=(24, 8), bt=(-22, -10), fa=(80, 115), ba=(76, 110), w=132, ow=132),
    dict(lean=-6, dx=-1, ft=(22, 8), bt=(-20, -10), fa=(72, 106), ba=(68, 102), w=126, ow=126),
    dict(lean=-2, ft=(16, 6), bt=(-14, -8), fa=(45, 85), ba=(35, 78), w=112, ow=112)]
DASH = [        # forward burst: low lean, long stride, ghost streak
    dict(lean=10, dx=1, ft=(30, 8), bt=(-24, -12), fa=(-20, 10), ba=(-30, 0), w=60, ow=60),
    dict(lean=18, dx=3, ft=(48, -4), bt=(-36, -16), fa=(-40, -10), ba=(-50, -20), w=40, ow=40, fx=[('streak',)]),
    dict(lean=20, dx=4, lift=1, ft=(-26, -18), bt=(-40, -18), fa=(-45, -15), ba=(-55, -25), w=35, ow=35, fx=[('streak',)]),
    dict(lean=20, dx=4, lift=1, ft=(52, -6), bt=(-38, -16), fa=(-45, -15), ba=(-55, -25), w=35, ow=35, fx=[('streak',)]),
    dict(lean=14, dx=2, ft=(34, 8), bt=(-26, -12), fa=(-20, 10), ba=(-30, 0), w=60, ow=60),
    dict(lean=4, ft=(18, 6), bt=(-14, -8), fa=(30, 80), ba=(0, 40))]
DEATH = [       # struck, thrown back, hits the floor, settles flat and stays down
    dict(lean=-6, dx=-2, flash=.9, pitch=14, ft=(4, -4), bt=(-16, -12), fa=(-40, 0), ba=(-50, -10), fx=[('impact',)]),
    dict(lean=-6, dx=-3, pitch=44, ft=(-4, -12), bt=(-22, -24), fa=(-80, -40), ba=(-90, -50)),
    dict(pitch=82, gnd=.6, ft=(-8, -14), bt=(-14, -22), fa=(-100, -80), ba=(-110, -90)),
    dict(pitch=90, gnd=1, flash=.5, ft=(-2, -8), bt=(-8, -14), fa=(-50, -30), ba=(-70, -40), fx=[('impact',)]),
    dict(pitch=90, gnd=1, ft=(4, 0), bt=(-6, -4), fa=(-15, 0), ba=(-30, -10)),
    dict(pitch=90, gnd=1, **_LAY)]
VICTORY = [     # weapon thrown skyward, then held
    dict(lean=-2, ft=(14, 6), bt=(-12, -6), fa=(60, 90), w=130),
    dict(lean=-6, ft=(16, 6), bt=(-14, -8), fa=(110, 140), w=170),
    dict(lean=-10, ft=(18, 6), bt=(-16, -8), fa=(150, 175), w=190, fx=[('arc', 120, 200)]),
    dict(lean=-10, ft=(18, 6), bt=(-16, -8), fa=(155, 178), w=195),
    dict(lean=-10, ft=(18, 6), bt=(-16, -8), fa=(155, 178), w=195),
    dict(lean=-8, ft=(18, 6), bt=(-16, -8), fa=(150, 175), w=190)]
HIT_HEAVY = [   # big front hit: head snaps back, body bows, feet skid
    dict(lean=-8, dx=-2, flash=.9, pitch=10, ft=(10, -2), bt=(-18, -10), fa=(-50, 0), ba=(-60, -10), fx=[('impact',)]),
    dict(lean=-16, dx=-4, flash=.5, pitch=20, ft=(16, -6), bt=(-26, -14), fa=(-75, -30), ba=(-85, -35), fx=[('impact',)]),
    dict(lean=-18, dx=-5, pitch=22, ft=(18, -6), bt=(-28, -14), fa=(-80, -40), ba=(-90, -45)),
    dict(lean=-12, dx=-4, pitch=14, ft=(16, 0), bt=(-24, -12), fa=(-60, -20), ba=(-70, -25)),
    dict(lean=-6, dx=-2, pitch=6, ft=(14, 4), bt=(-16, -8), fa=(-20, 20), ba=(-30, 10)),
    dict(lean=-1, ft=(14, 6), bt=(-12, -6), fa=(20, 70), ba=(-5, 30))]
HIT_BACK = [    # struck from behind: chest thrown forward, arms flung back
    dict(lean=10, dx=2, flash=.9, pitch=-8, ft=(8, 2), bt=(-14, -8), fa=(-40, -10), ba=(-50, -20), fx=[('impact',)]),
    dict(lean=22, dx=4, flash=.5, pitch=-16, ft=(20, 2), bt=(-22, -12), fa=(-85, -50), ba=(-95, -60), fx=[('impact',)]),
    dict(lean=24, dx=5, pitch=-18, ft=(22, 2), bt=(-24, -12), fa=(-90, -55), ba=(-100, -65)),
    dict(lean=16, dx=3, pitch=-10, ft=(18, 4), bt=(-20, -10), fa=(-60, -30), ba=(-70, -40)),
    dict(lean=8, dx=1, pitch=-4, ft=(14, 4), bt=(-14, -8), fa=(-10, 30), ba=(-20, 15)),
    dict(lean=2, ft=(14, 6), bt=(-12, -6), fa=(20, 70), ba=(-5, 30))]
BLOCK_HIT = [   # guard pose absorbing a hit: shoved back, feet dug in, then reset
    dict(lean=-4, dx=-2, flash=.8, ft=(26, 6), bt=(-26, -10), fa=(80, 115), ba=(76, 110), w=132, ow=132, fx=[('impact',)]),
    dict(lean=-10, dx=-4, flash=.4, ft=(32, 8), bt=(-32, -12), fa=(84, 118), ba=(80, 114), w=136, ow=136),
    dict(lean=-8, dx=-3, ft=(30, 8), bt=(-30, -12), fa=(82, 116), ba=(78, 112), w=134, ow=134),
    dict(lean=-8, dx=-2, ft=(26, 8), bt=(-26, -10), fa=(80, 115), ba=(76, 110), w=132, ow=132),
    dict(lean=-8, dx=-1, ft=(24, 8), bt=(-22, -10), fa=(80, 115), ba=(76, 110), w=132, ow=132),
    dict(lean=-8, dx=-1, ft=(24, 8), bt=(-22, -10), fa=(80, 115), ba=(76, 110), w=132, ow=132)]
BODY = dict(jump=JUMP, launch=LAUNCH, tumble=TUMBLE, knockdown=KNOCKDOWN, getup=GETUP, guard=GUARD, dash=DASH, death=DEATH, victory=VICTORY,
            hit_heavy=HIT_HEAVY, hit_back=HIT_BACK, block_hit=BLOCK_HIT)
EXTRA = {'launcher': 'launcher', 'air1': 'air', 'plunge': 'plunge'}                        # attack slots every character gets
ANIM_META = dict(idle=(6, True), walk=(10, True), jump=(12, False), hit=(12, False), launch=(14, False),
                 tumble=(12, True), knockdown=(10, False), getup=(8, False),
                 guard=(12, False), dash=(16, False), death=(8, False), victory=(8, False),
                 hit_heavy=(12, False), hit_back=(12, False), block_hit=(14, False))
TABLES.update(launcher=LAUNCHER, air=AIR, plunge=PLUNGE)

# ------------------------------------------------------------ tiny vector helpers
def rd(v): return int(math.floor(v + .5))
def vadd(a, b): return tuple(x + y for x, y in zip(a, b))
def vsub(a, b): return tuple(x - y for x, y in zip(a, b))
def vmul(a, k): return tuple(x * k for x in a)
def vdot(a, b): return sum(x * y for x, y in zip(a, b))
def vavg(ps): return tuple(sum(p[i] for p in ps) / len(ps) for i in range(3))
def clamp(v, a, b): return max(a, min(b, v))
VC = (0, 2 / math.sqrt(5), 1 / math.sqrt(5))             # unit vector toward the camera
E0 = math.degrees(math.atan(.5)); YS, ZS = .5, 1.0       # ground squash / height scale; 2:1 dimetric = camera elevation 26.565 deg
def set_pitch(e=E0):
    """Camera elevation in degrees. E0 reproduces the shipped sprites exactly; lower = more dramatic, higher = more top-down."""
    global YS, ZS, VC
    r = math.radians(e); c0 = math.cos(math.radians(E0))
    YS, ZS, VC = math.sin(r) / c0, math.cos(r) / c0, (0, math.cos(r), math.sin(r))
_l = (-.5, -.3, .8); LIGHT = vmul(_l, 1 / math.sqrt(vdot(_l, _l)))   # light from upper-left

class Cam:
    """local (f=forward, l=right, u=up) -> world (gx, gy, z) -> screen, for one facing."""
    def __init__(self, deg, pitch=0, piv=(0, 0), drop=0):
        a = math.radians(deg); self.F = (math.cos(a), math.sin(a)); self.R = (-self.F[1], self.F[0])
        p = math.radians(pitch); self.pc, self.ps, self.piv, self.drop = math.cos(p), math.sin(p), piv, drop
    def world(self, f, l, u):
        if self.ps or self.drop:   # body pitch (flips, tumbles) about the pelvis, then settle onto the floor
            x, y = f - self.piv[0], u - self.piv[1]
            f, u = self.piv[0] + x * self.pc - y * self.ps, self.piv[1] + x * self.ps + y * self.pc - self.drop
        return (f * self.F[0] + l * self.R[0], f * self.F[1] + l * self.R[1], u)
    def scr(self, w): return (AX + w[0], AY + w[1] * YS - w[2] * ZS)
    def S(self, f, l, u): return self.scr(self.world(f, l, u))
    def Si(self, w): x, y = self.scr(w); return (rd(x), rd(y))
    def gy(self, p): return self.world(*p)[1]

def prof(p, l=0): return (p[0] - gs.CX, l, gs.GROUND - p[1])      # 2D profile px -> local 3D

class Proxy:
    """Lets the original side-view drawing code draw into the iso view: every 2D point is mapped by fn."""
    def __init__(self, d, fn): self.d, self.fn = d, fn
    def P(self, p): x, y = self.fn(p[0], p[1]); return (rd(x), rd(y))
    def line(self, pts, fill=None, width=1): self.d.line([self.P(p) for p in pts], fill=fill, width=width)
    def point(self, xy, fill=None): self.d.point(self.P(xy), fill=fill)
    def polygon(self, pts, fill=None, outline=None): self.d.polygon([self.P(p) for p in pts], fill=fill, outline=outline)
    def ellipse(self, b, fill=None, outline=None):
        x, y = self.P(((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)); rx, ry = rd((b[2] - b[0]) / 2), rd((b[3] - b[1]) / 2)
        self.d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=fill, outline=outline)
    def rectangle(self, b, fill=None, outline=None):
        self.polygon([(b[0], b[1]), (b[2], b[1]), (b[2], b[3]), (b[0], b[3])], fill, outline)

def plane(cam, lat, phi=0, piv=None):   # profile plane at lateral offset `lat`, optionally tilted outward by phi
    if not phi: return lambda x, y: cam.S(*prof((x, y), lat))
    sp, cp = math.sin(phi), math.cos(phi); hf, _, hu = prof(piv, lat)
    def fn(x, y):
        ur = -(y - piv[1]); return cam.S(hf + (x - piv[0]), lat + ur * sp, hu + ur * cp)
    return fn
def rot_f(v, p):   # rotate a (f,l,u) vector about the forward axis
    return (v[0], v[1] * math.cos(p) + v[2] * math.sin(p), -v[1] * math.sin(p) + v[2] * math.cos(p))

# ------------------------------------------------------------ solids
def newell(pts):
    nx = ny = nz = 0
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1])
    return (nx, ny, nz)

def solid(d, cam, verts, faces, col, outline=None):
    """Draw the camera-facing faces of a convex solid, flat-shaded by orientation."""
    W = [cam.world(*v) for v in verts]; cen = vavg(W)
    for fc in faces:
        pts = [W[i] for i in fc]; n = newell(pts)
        if vdot(n, vsub(vavg(pts), cen)) < 0: n = vmul(n, -1)
        L = math.sqrt(vdot(n, n))
        if L < 1e-6: continue
        n = vmul(n, 1 / L)
        if vdot(n, VC) <= .03: continue
        s = clamp(.80 + .30 * vdot(n, LIGHT), .6, 1.12)
        d.polygon([cam.Si(p) for p in pts], fill=A(sh(col, s)), outline=A(outline) if outline else None)

def prism(c0, c1, h0, h1):
    sg = [(1, 1), (1, -1), (-1, -1), (-1, 1)]
    v = [(c0[0] + a * h0[0], c0[1] + b * h0[1], c0[2]) for a, b in sg] + \
        [(c1[0] + a * h1[0], c1[1] + b * h1[1], c1[2]) for a, b in sg]
    return v, [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]

def obox(c, ax, hs):
    v = [tuple(c[i] + sx * hs[0] * ax[0][i] + sy * hs[1] * ax[1][i] + sz * hs[2] * ax[2][i] for i in range(3))
         for sx in (1, -1) for sy in (1, -1) for sz in (1, -1)]
    return v, [(0, 1, 3, 2), (4, 5, 7, 6), (0, 1, 5, 4), (2, 3, 7, 6), (0, 2, 6, 4), (1, 3, 7, 5)]

# ------------------------------------------------------------ one frame
def widths(S):
    t, sc = S['thick'], S['scale']; return dict(ws=(2.4 + 1.5 * t) * sc, wh=(1.6 + .9 * t) * sc, hf=(1.6 + 1.0 * t) * sc)
def limb_shade(g): return .72 + .28 * clamp(.5 + g / 8, 0, 1)
def pxl(c): return (rd(c[0]), rd(c[1]))

def render_iso(S, anim, f, deg):
    P, style = pose_for(S, anim, f)
    K = gs.solve(S, P); pv_ = prof(K['pel']); pitch = P.get('pitch', 0)
    drop = P.get('gnd', 0) * 11 * S['height'] * abs(math.sin(math.radians(pitch)))
    cam0 = Cam(deg); cam = Cam(deg + P.get('turn', 0), pitch, (pv_[0], pv_[2]), drop)
    Wd = widths(S); ws, wh, hf = Wd['ws'], Wd['wh'], Wd['hf']; sc = S['scale']
    phi = math.radians(PHI_STYLE[style][f] if style else 28)
    fig = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); d = ImageDraw.Draw(fig)
    fxl = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); fd = ImageDraw.Draw(fxl)
    F3, R3, U3 = (1, 0, 0), (0, 1, 0), (0, 0, 1); parts = []
    wl = max(2, rd(S['thick'] * 2.2)); fy = cam.F[1]
    pel, sho, neck = prof(K['pel']), prof(K['sho']), prof(K['neck'])
    def add(depth, order, fn): parts.append((depth, order, fn))
    def L3(a, b, col, w=1): d.line([cam.Si(cam.world(*a)), cam.Si(cam.world(*b))], fill=A(col), width=w)

    for side, kk, ff in ((1, 'fk', 'ff'), (-1, 'bk', 'bf')):               # legs
        l = side * wh; pts = [prof(K['pel'], l), prof(K[kk], l), prof(K[ff], l)]
        g = sum(cam.gy(p) for p in pts) / 3
        add(g, 1, lambda l=l, kk=kk, ff=ff, g=g: gs.draw_leg(Proxy(d, plane(cam, l)), K['pel'], K[kk], K[ff], S, limb_shade(g)))

    if S['back'] == 'shards':                                                # floating shards behind the back
        for i, (ox_, oy_) in enumerate([(-8, -5), (-10, 2), (-7, 9)]):
            c3 = (sho[0] + ox_ * sc * .8, (i - 1) * 5 * sc, max(4, sho[2] - oy_ * sc + 1.3 * math.sin(2 * math.pi * f / NF + i * 2)))
            def shard(c3=c3):
                x, y = pxl(cam.S(*c3))
                d.polygon([(x, y - 3), (x + 2, y), (x, y + 3), (x - 2, y)], fill=A(S['emi']), outline=A(S['acc']))
            add(cam.gy(c3), 2, shard)

    def torso():                                                              # torso
        top = (sho[0], 0, sho[2] + 1); dirv = vsub(top, pel); ln_ = math.sqrt(vdot(dirv, dirv)); dirv = vmul(dirv, 1 / ln_)
        c = S['chest']; at = lambda t: vadd(pel, vmul(dirv, ln_ * t))
        if c in ('plate', 'chitin'):
            v, fc = prism(pel, top, (hf - .2, wh + 1.0), (hf, ws + .3)); solid(d, cam, v, fc, S['pri'], S['sec'])
            belt_top = vadd(pel, vmul(dirv, 2.4))
            v, fc = prism(pel, belt_top, (hf + .5, wh + 1.5), (hf + .5, wh + 1.5)); solid(d, cam, v, fc, S['sec'], None)
            if fy > .1:
                a = vadd(vadd(pel, vmul(dirv, ln_ - 1.5)), (hf + .1, 0, 0)); b = vadd(vadd(pel, vmul(dirv, 3.2)), (hf + .1, 0, 0))
                L3(a, b, S['acc'])
            if fy < -.1:
                a = vadd(vadd(pel, vmul(dirv, ln_ - 1.5)), (-hf - .1, 0, 0)); b = vadd(vadd(pel, vmul(dirv, 3.2)), (-hf - .1, 0, 0))
                L3(a, b, S['sec'])
            if c == 'chitin':
                for t in (.25, .5, .75):
                    p = at(t); hw = ((wh + 1.0) * (1 - t) + (ws + .3) * t) - .2
                    if fy > .1: L3((p[0] + hf + .1, -hw, p[2]), (p[0] + hf + .1, hw, p[2]), S['acc'])
                    if fy < -.1: L3((p[0] - hf - .1, -hw, p[2]), (p[0] - hf - .1, hw, p[2]), S['acc'])
                for sd in (-1, 1):
                    x, y = pxl(cam.S(sho[0], sd * ws, sho[2] + 1))
                    d.polygon([(x - 2, y - 2), (x, y - 7), (x + 2, y - 2)], fill=A(S['acc']))
        else:
            v, fc = prism(pel, top, (hf - .6, wh), (hf - .4, ws - .4)); solid(d, cam, v, fc, S['tone'])
            if c == 'harness':
                sg = 1 if fy > .1 else (-1 if fy < -.1 else 0)
                if sg:
                    a_, X = ws * .5, hf - .25; p0, p1, pm = at(.95), at(.14), at(.5)
                    L3((p0[0] + sg * X, -a_, p0[2]), (p1[0] + sg * X, a_, p1[2]), S['sec'])
                    L3((p0[0] + sg * X, a_, p0[2]), (p1[0] + sg * X, -a_, p1[2]), S['sec'])
                    d.point(cam.Si(cam.world(pm[0] + sg * X, 0, pm[2])), fill=A(S['acc']))
                v, fc = prism(pel, vadd(pel, vmul(dirv, 1.6)), (hf + .1, wh + .8), (hf + .1, wh + .8)); solid(d, cam, v, fc, S['sec'])
    add(0, 5, torso)

    h3 = prof(K['head']); hs = cam.S(*h3)                                    # head
    def head():
        gs.ln(Proxy(d, plane(cam, 0)), K['neck'], K['head'], S['tone'], wl)
        x, y = rd(hs[0]), rd(hs[1]); k = S['helm']; r = rd(3 * sc)
        if k == 'helm':
            r4 = rd(4 * sc); d.ellipse([x - r4, y - r4, x + r4, y + r4], fill=A(S['pri']), outline=A(S['sec']))
            if fy > -.1:
                a = cam.S(h3[0] + 3.1, -2.0, h3[2] - .3); b = cam.S(h3[0] + 3.1, 2.0, h3[2] - .3)
                d.line([pxl(a), pxl(b)], fill=A((14, 14, 16)), width=1)
                d.point(pxl(cam.S(h3[0] + 3.6, 0, h3[2] - .3)), fill=A((14, 14, 16)))
            a = cam.S(h3[0], 0, h3[2] + 4); b = cam.S(h3[0] - 4, 0, h3[2] + 5.5)
            d.line([pxl(a), pxl(b)], fill=A(S['acc']), width=2)
        else:
            d.ellipse([x - r, y - r, x + r, y + r], fill=A(S['tone']))
            if k == 'wrap':
                d.line([(x - r, y - 1), (x + r, y - 1)], fill=A(S['pri']), width=2)
                fl = rd(math.sin(2 * math.pi * f / NF))
                pts = [cam.S(h3[0] - 3, 0, h3[2] - 1), cam.S(h3[0] - 6, 0, h3[2] - 1 + fl), cam.S(h3[0] - 9, 0, h3[2] + 1 - fl)]
                d.line([pxl(p) for p in pts], fill=A(S['sec']), width=1)
            elif k == 'mandibles' and fy > -.35:
                for sd in (-1, 1):
                    pts = [cam.S(h3[0] + 2 * sc, sd * 1.4 * sc, h3[2] - .5), cam.S(h3[0] + 5 * sc, sd * 2.4 * sc, h3[2] - 1.8 * sc),
                           cam.S(h3[0] + 4.2 * sc, sd * 1.6 * sc, h3[2] - 3.8 * sc)]
                    d.line([pxl(p) for p in pts], fill=A(S['acc']), width=1)
            if (S['eyes'] or k == 'mandibles') and fy > -.15:
                for sd in (-1, 1): d.point(pxl(cam.S(h3[0] + 3.1 * sc, sd * 1.1, h3[2] + .8)), fill=A(S['emi']))
    add(cam.gy(h3) + .05, 6, head)

    for side, ee, hh in ((1, 'fe', 'fh'), (-1, 'be', 'bh')):                # arms (+ pauldrons)
        l = side * ws; pts = [prof(K['sho'], l), prof(K[ee], l), prof(K[hh], l)]
        g = sum(cam.gy(p) for p in pts) / 3
        def arm(l=l, ee=ee, hh=hh, g=g):
            gs.draw_arm(Proxy(d, plane(cam, l)), K['sho'], K[ee], K[hh], S, limb_shade(g))
            if S['pauldron'] or S['chest'] in ('plate', 'chitin'):
                x, y = pxl(cam.S(sho[0], l, sho[2] + .5))
                d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=A(S['pri']), outline=A(S['sec'])); d.point((x, y - 2), fill=A(S['acc']))
        add(g, 7, arm)

    kind = S['weapon']; a = math.radians(P['w'])                             # right-hand weapon
    dv = rot_f((math.sin(a), 0, -math.cos(a)), phi); pv = rot_f((-math.cos(a), 0, -math.sin(a)), phi)
    lt = rot_f((0, 1, 0), phi); hand = prof(K['fh'], ws)
    def weapon():
        if kind == 'maul':
            at = lambda t, s=0: (hand[0] + dv[0] * t + pv[0] * s, hand[1] + dv[1] * t + pv[1] * s, hand[2] + dv[2] * t + pv[2] * s)
            d.line([cam.Si(cam.world(*at(-7))), cam.Si(cam.world(*at(13)))], fill=A(sh((110, 85, 60), 1)), width=2)
            v, fc = obox(at(14.2), (dv, pv, lt), (3.1, 4.2, 2.7)); solid(d, cam, v, fc, S['pri'], S['acc'])
        elif kind == 'gauntlets':
            v, fc = obox(hand, (F3, R3, U3), (2.4 * sc,) * 3); solid(d, cam, v, fc, S['pri'], S['acc'])
        elif kind == 'tablet':      # camera-facing slab so the glyphs are always legible
            x, y = pxl(cam.S(hand[0] + 2, hand[1], hand[2] + 1))
            d.rectangle([x - 3, y - 5, x + 3, y + 4], fill=A((24, 23, 28)), outline=A(S['emi']))
            for r_ in (-3, -1, 1): d.line([(x - 2, y + r_), (x + 1 + (r_ % 3 == 0), y + r_)], fill=A(mx(S['emi'], (0, 0, 0), .35)), width=1)
        elif kind != 'none':
            gs.weapon(Proxy(d, plane(cam, ws, phi, K['fh'])), kind, K['fh'], P['w'], S)
    add(cam.gy(hand) + .3, 8, weapon)
    if kind == 'gauntlets':
        hl = prof(K['bh'], -ws)
        def lfist():
            v, fc = obox(hl, (F3, R3, U3), (2.4 * sc,) * 3); solid(d, cam, v, fc, S['pri'], S['acc'])
        add(cam.gy(hl) + .3, 8, lfist)

    if S['offhand'] == 'shield':                                             # shield: a real plane that turns with the facing
        hl = prof(K['bh'], -ws); psi = math.radians(P.get('psi', 35))
        n = (math.cos(psi), -math.sin(psi), 0); W = (math.sin(psi), math.cos(psi), 0)
        ctr = vadd(hl, (2.5, -1.0, -1.0))
        poly = [(-4, -5), (4, -5), (4, 1), (0, 7), (-4, 1)]
        V = [vadd(ctr, vadd(vmul(W, a_ * 1.15), (0, 0, -b_ * 1.15))) for a_, b_ in poly]
        wn = cam.world(*n)
        def shield():
            front = vdot(wn, VC) > 0; s = clamp(.80 + .30 * vdot(wn, LIGHT), .6, 1.1)
            col = sh(S['sec'], s) if front else sh(S['sec'], .55)
            d.polygon([cam.Si(cam.world(*p)) for p in V], fill=A(col), outline=A(S['acc'] if front else sh(S['acc'], .6)))
            if front:
                a_ = cam.Si(cam.world(*vadd(ctr, (0, 0, 4.5)))); b_ = cam.Si(cam.world(*vadd(ctr, (0, 0, -3.5))))
                d.line([a_, b_], fill=A(S['pri']), width=1); d.point(cam.Si(cam.world(*ctr)), fill=A(S['emi']))
        add(cam.gy(ctr) + .2, 8, shield)
    elif S['offhand'] != 'none' or S['weapon'] == 'twinblades':
        oh = S['offhand'] if S['offhand'] != 'none' else 'twinblades'
        add(cam.gy(prof(K['bh'], -ws)) + .3, 8, lambda: gs.weapon(Proxy(d, plane(cam, -ws)), oh, K['bh'], P['ow'], S, .8))

    for _, _, fn in sorted(parts, key=lambda t: (round(t[0], 3), t[1])): fn()

    gs.draw_seal(Proxy(fd, lambda x, y: (x, y)), S, {'head': hs}, f)       # seal always faces the camera
    if S['jointglow']:
        for nm, l in (('fk', wh), ('bk', -wh), ('sho', 0), ('pel', 0), ('fh', ws), ('bh', -ws)):
            fd.point(pxl(cam.S(*prof(K[nm], l))), fill=A(S['emi']))
    fx3(fxl, fd, S, P, K, f, cam, cam0, ws, phi)
    if P['flash']:
        rgb = Image.blend(fig.convert('RGB'), Image.new('RGB', fig.size, (255, 255, 255)), P['flash']).convert('RGBA')
        rgb.putalpha(fig.split()[3]); fig = rgb
    lum = sum(S['tone']) / 3; rim = (118, 112, 104) if lum < 70 else INK
    dil = fig.split()[3].filter(ImageFilter.MaxFilter(3))
    ol = Image.new('RGBA', fig.size, A(rim)); ol.putalpha(dil)
    body = Image.alpha_composite(ol, fig); body.alpha_composite(fxl)
    out = aura3(S, f); out.alpha_composite(body)
    return out

def fx3(fxl, fd, S, P, K, f, cam, cam0, ws, phi):
    ec = S['emi']; pale = mx(ec, (255, 255, 255), .6); pel = prof(K['pel'])
    for t in P['fx']:
        Pp = dict(P); Pp['fx'] = [t]; k = t[0]
        tip = gs.tip_of(S, S['weapon'], K['fh'], P['w']); tip = (min(tip[0], gs.CELL - 13), max(tip[1], 9))
        if k in ('arc', 'streak'):
            gs.do_fx(Proxy(fd, plane(cam, ws, phi, K['sho'])), S, Pp, K, f)
        elif k == 'shock':
            c = cam.S(tip[0] - gs.CX, ws, 0); r = 7 + f % 2 * 3
            for rr, al in ((r, 200), (r + 5, 90)):
                fd.ellipse([rd(c[0] - rr), rd(c[1] - rr * YS), rd(c[0] + rr), rd(c[1] + rr * YS)], outline=(200, 190, 170, al))
            for i in range(6):
                a = i * math.pi / 3 + f; x, y = c[0] + (r + 2) * math.cos(a), c[1] + (r + 2) * math.sin(a) * YS
                fd.point((rd(x), rd(y - 2 - i % 3)), fill=(200, 190, 170, 200))
        elif k == 'sweep':          # horizontal arc around the body, in world space (ignores the body twist)
            R = max(16, 10.4 * S['height'] * .9 + gs.WLEN.get(S['weapon'], 6) * .8); hz = prof(K['sho'])[2] - 2; n = 14
            ang = lambda i: math.radians(t[1] + (t[2] - t[1]) * i / n)
            pts = [pxl(cam0.S(pel[0] + R * math.cos(ang(i)), R * math.sin(ang(i)), hz)) for i in range(n + 1)]
            for i in range(n): fd.line([pts[i], pts[i + 1]], fill=A(pale, int(110 + 110 * i / n)), width=2 if 3 <= i <= n - 3 else 1)
        elif k == 'pulse':          # expanding rings flat on the floor
            c = cam0.S(pel[0], 0, 0); r = t[1] * S['scale']
            for rr, al in ((r, 210), (r + 5, 100)):
                fd.ellipse([rd(c[0] - rr), rd(c[1] - rr * YS), rd(c[0] + rr), rd(c[1] + rr * YS)], outline=A(ec, al))
            for i in range(6):
                a = i * math.pi / 3 + f
                fd.point((rd(c[0] + (r + 2) * math.cos(a)), rd(c[1] + (r + 2) * math.sin(a) * YS - 1 - i % 3)), fill=A(pale, 220))
        elif k == 'spark_b':        # impact star at the shield
            x, y = pxl(cam.S(*vadd(prof(K['bh'], -ws), (7, 0, 0))))
            for a_, b_ in (((-4, 0), (4, 0)), ((0, -4), (0, 4)), ((-3, -3), (3, 3)), ((-3, 3), (3, -3))):
                fd.line([(x + a_[0], y + a_[1]), (x + b_[0], y + b_[1])], fill=(255, 255, 255, 230), width=1)
        else:                       # charge / burst / ring / impact / ash: screen-facing effects anchored to a joint
            anc = {'impact': K['sho'], 'ash': K['pel']}.get(k, tip)
            ax_, ay_ = cam.S(*prof(anc, 0)) if k in ('impact', 'ash') else plane(cam, ws, phi, K['fh'])(*tip)
            gs.do_fx(Proxy(fd, lambda x, y: (ax_ + x - anc[0], ay_ + y - anc[1])), S, Pp, K, f)

def aura3(S, f):
    L = Image.new('RGBA', (CELL, CELL), (0, 0, 0, 0)); d = ImageDraw.Draw(L); k = S['aura']
    if k == 'none': return L
    cols = gs.AURA[k]; sc = S['scale']; Rg = int(36 * sc); pulse = 70 + int(40 * math.sin(2 * math.pi * f / NF))
    d.ellipse([AX - rd(11 * sc), AY - rd(22 * YS * sc / 2), AX + rd(11 * sc), AY + rd(22 * YS * sc / 2)], outline=A(cols[0], pulse))
    for i in range(9):
        t = (((i * 53) % Rg) + f * Rg / NF) % Rg / Rg
        x = AX + ((i * 37) % 21 - 10) * sc + rd(2 * math.sin(2 * math.pi * f / NF + i))
        y = AY - 3 - (1 - t if k == 'frost' else t) * Rg
        al = int(255 * (1 - t) ** .7); c = cols[i % 3]; x, y = rd(x), rd(y)
        if k == 'ember': d.point((x, y), fill=A(c, al)); (d.point((x, y - 1), fill=A(c, al)) if i % 3 == 0 else None)
        elif k in ('frost', 'light'):
            d.point((x, y), fill=A(c, al))
            if i % 3 == 0:
                for ddx, ddy in ((1, 0), (-1, 0), (0, 1), (0, -1)): d.point((x + ddx, y + ddy), fill=A(c, al // 2))
        elif k == 'void': d.rectangle([x, y, x + 1, y + 1], fill=A(c, al))
        elif k == 'venom': d.ellipse([x - 1, y - 1, x + 1, y + 1], outline=A(c, al))
        else: d.point((x, y), fill=A(c, al))
    return L

def shadow_img(tier):
    T = TIERS[tier]; im = Image.new('RGBA', (T['cell'], T['cell']), (0, 0, 0, 0))
    ImageDraw.Draw(im).ellipse([T['ax'] - T['shadow'][0], T['ay'] - T['shadow'][1], T['ax'] + T['shadow'][0], T['ay'] + T['shadow'][1]], fill=(0, 0, 0, 70))
    return im

def build_sheet(S, anim):
    sheet = Image.new('RGBA', (CELL * NF, CELL * len(DIRS)), (0, 0, 0, 0))
    for r in range(len(DIRS)):
        for f in range(NF): sheet.alpha_composite(render_iso(S, anim, f, r * 45), (f * CELL, r * CELL))
    return sheet

def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'out'; ids = sys.argv[2:] or DONE
    if ids == ['all']: ids = [s['id'] for s in gs.ROSTER]
    os.makedirs(out, exist_ok=True)
    for tn in TIERS: shadow_img(tn).save(f'{out}/shadow_{tn}.png')
    jp = f'{out}/veilspire_iso.json'; meta = json.load(open(jp)) if os.path.exists(jp) else {}
    for stale in ('cell', 'anchor'): meta.pop(stale, None)
    anims = {k: dict(frames=NF, fps=v[0], loop=v[1]) for k, v in ANIM_META.items()}
    for k in ('attack', 'launcher', 'air1', 'plunge'): anims[k] = dict(frames=NF, fps=14, loop=False)
    anims['jump']['frame_roles'] = ['crouch', 'rise', 'apex', 'fall', 'pre_land', 'land']
    anims['knockdown']['frame_roles'] = ['land', 'slam', 'bounce', 'slam', 'settle', 'settle']
    anims['tumble']['note'] = 'rows are facings, but the body also spins; any row works for an airborne enemy'
    anims['attack']['note'] = 'slots attack1..attack3 are ground skills; launcher, air1 and plunge are the juggle toolkit'
    meta.update(game='Veilspire', projection='2:1 dimetric', tile=[64, 32], frames=NF, directions=DIRS, move_vectors=MOVE,
                tile_step=TILE_STEP, layout='one PNG per animation per character; row = direction (order of "directions"), column = frame',
                height_note='sprites are never drawn lifted: the engine moves the sprite up by its own z and leaves the shadow on the floor',
                tiers={k: dict(cell=[v['cell']] * 2, anchor=dict(x=v['ax'], y=v['ay']), shadow=f'shadow_{k}.png') for k, v in TIERS.items()},
                animations=anims)
    chars = {c['id']: c for c in meta.get('characters', [])}
    for S0 in gs.ROSTER:
        if S0['id'] not in ids: continue
        S = prep(S0); os.makedirs(f"{out}/{S['id']}", exist_ok=True); sheets = {}; attacks = []
        moves = [(f'attack{i + 1}', st) for i, st in enumerate(skills_for(S))] + list(EXTRA.items())
        for an in ['idle', 'walk'] + [m[0] for m in moves] + list(BODY) + ['hit']:
            build_sheet(S, an).save(f"{out}/{S['id']}/{an}.png"); sheets[an] = f"{S['id']}/{an}.png"
        for slot, st in moves:
            attacks.append(dict(slot=slot, style=st, name=STYLE_NAME[st], hit_frames=HIT_FRAMES[st], startup=TIMING[st][0],
                                cancel_from=TIMING[st][1], tags=TAGS.get(st, []), air=st in ('air', 'plunge')))
        chars[S['id']] = dict(id=S['id'], name=S['name'], title=S['title'], role=S['role'], weapon=S['weapon'], tier=S['tier'],
                              cell=[CELL, CELL], shadow=f"shadow_{S['tier']}.png", attacks=attacks, sheets=sheets)
    meta['characters'] = [chars[s['id']] for s in gs.ROSTER if s['id'] in chars]
    json.dump(meta, open(jp, 'w'), indent=2)

if __name__ == '__main__': main(); print('ok')
