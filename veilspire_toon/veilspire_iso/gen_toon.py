#!/usr/bin/env python3
"""Veilspire - toon renderer (anime style).

Same rig, same pose tables, same 8-facing 2:1 camera as gen_iso.py - only the *drawing* changes: tapered limbs, a big
anime head (face, eyes, hair that turns with the facing), cel shading + coloured outlines, glowing weapons and soft FX.
Everything is drawn supersampled and then reduced, so edges are clean.

Usage:  python3 gen_toon.py OUT_DIR [--res 2] [--style smooth|pixel] [--pitches] [--anims a,b] [char_id ...]
  --res 1        cells stay 96/128  (drop-in for the shipped engine)
  --res 2        cells become 192/256 (smooth hi-res; needs the 6-line engine patch in source/combat.src.html)
  --style pixel  hard edges + a limited palette: 'anime pixel' (use with --res 1)
  --pitches      also render the p16 / p38 camera-pitch sets the camera director swaps between
"""
import math, os, sys, json, argparse
from PIL import Image, ImageDraw, ImageChops, ImageFilter
import gen_sprites as gs
import gen_iso as g
from gen_sprites import sh, mx, A

SS = 3                                   # supersampling (canvas px per output px)
LIGHT = (-0.55, -0.83)                   # screen-space direction toward the light (upper left)
VSC = 1.118                              # the 2:1 camera stretches the vertical axis by 1/cos(26.565)

# ----------------------------------------------------------------------------------- per-character look
# skin/hair/eye are new (the rig only had a body 'tone'); everything else falls back to the roster palette.
# hs = hair style: none | short | spiky | long | ponytail | bob      hr = head radius (rig units)
TOON = {
    'ren_calder':   dict(skin=(236, 204, 180), hair=(34, 30, 50), hl=(124, 92, 206), hs='spiky', eye=(176, 128, 255),
                         bot=(52, 52, 64), shoe=(46, 40, 46), glove=(176, 170, 158)),
    'sera_quill':   dict(skin=(248, 228, 218), hair=(206, 232, 252), hl=(255, 255, 255), hs='long', eye=(120, 214, 255),
                         bot=(212, 230, 242), shoe=(88, 120, 152)),
    'kade_morr':    dict(skin=(214, 160, 130), hair=(34, 22, 30), hl=(176, 56, 66), hs='spiky', eye=(255, 84, 70),
                         bot=(56, 50, 58), shoe=(34, 30, 36), glove=(44, 40, 46)),
    'bram_holt':    dict(skin=(124, 132, 142), hair=(60, 62, 70), hl=(190, 196, 204), hs='none', eye=(255, 176, 90),
                         bot=(92, 102, 114), shoe=(58, 62, 70), glove=(124, 132, 142), hr=6.3),
    'nyx_lumen':    dict(skin=(226, 196, 160), hair=(236, 214, 150), hl=(255, 246, 210), hs='short', eye=(255, 226, 140),
                         bot=(92, 100, 70), shoe=(70, 58, 44), glove=(168, 146, 88)),
    'orin_vale':    dict(skin=(238, 216, 190), hair=(222, 214, 186), hl=(255, 252, 236), hs='ponytail', eye=(150, 206, 166),
                         bot=(82, 70, 58), shoe=(62, 52, 44), glove=(112, 124, 114)),
    'mairen_solas': dict(skin=(244, 220, 196), hair=(255, 224, 140), hl=(255, 250, 214), hs='long', eye=(255, 236, 150),
                         bot=(238, 230, 206), shoe=(184, 152, 84)),
    'irix_venn':    dict(skin=(240, 232, 226), hair=(236, 240, 250), hl=(255, 255, 255), hs='bob', eye=(150, 204, 240),
                         bot=(190, 192, 204), shoe=(120, 124, 140)),
    'juno_rake':    dict(skin=(214, 162, 130), hair=(238, 96, 44), hl=(255, 190, 90), hs='spiky', eye=(255, 150, 50),
                         bot=(72, 42, 38), shoe=(50, 32, 30), glove=(210, 96, 44)),
    'cinder':       dict(skin=(26, 26, 32), hair=(26, 26, 32), hl=(70, 70, 82), hs='none', eye=(255, 240, 200),
                         bot=(30, 30, 36), shoe=(22, 22, 26), glove=(34, 34, 40), faceless=True),
    'the_carapace': dict(skin=(52, 42, 58), hair=(52, 42, 58), hl=(120, 80, 150), hs='none', eye=(226, 110, 255),
                         bot=(60, 46, 68), shoe=(30, 25, 36), glove=(74, 56, 80), faceless=True, hr=5.6),
    'floor_voice':  dict(skin=(222, 222, 228), hair=(170, 170, 180), hl=(240, 240, 248), hs='short', eye=(255, 220, 160),
                         bot=(190, 190, 198), shoe=(140, 140, 150)),
}

def look(S):
    T = dict(skin=S['tone'], hair=(40, 34, 48), hl=(120, 110, 150), hs='none', eye=S['emi'], bot=S['tone'], shoe=(40, 36, 44),
             glove=None, hr=5.9, faceless=False)
    T.update(TOON.get(S['id'], {}))
    T['top'] = T.get('top') or (S['tone'] if S['chest'] in ('wraps', 'none') else S['pri'])
    T['glove'] = T['glove'] or T['skin']
    return T

# ----------------------------------------------------------------------------------- colour helpers
def lum(c): return .3 * c[0] + .59 * c[1] + .11 * c[2]
def cool(c): return mx(sh(c, .68), (40, 30, 92), .20)                  # shadow colour: darker and a little violet
def warm(c): return mx(c, (255, 246, 230), .40)                       # highlight colour
def inkc(c): return mx(sh(c, .30), (16, 10, 30), .40) if lum(c) > 60 else mx(c, (168, 156, 184), .55)
def hull(pts):
    pts = sorted(set((round(x, 1), round(y, 1)) for x, y in pts))
    if len(pts) < 3: return pts
    def half(P):
        h = []
        for p in P:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (p[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (p[0] - h[-2][0]) <= 0: h.pop()
            h.append(p)
        return h
    lo = half(pts); up = half(pts[::-1]); return lo[:-1] + up[:-1]

class Painter:
    """Draws 'parts': a silhouette made of polygons / ellipses / round-capped lines, with a coloured outline, a cel-shadow
    crescent on the side away from the light and an optional rim highlight. All sizes are in rig units."""
    def __init__(s, n, k):
        s.n, s.k = n, k; s.img = Image.new('RGBA', (n, n), (0, 0, 0, 0)); s.pal = set()
    def rgba(s, c, a=255): s.pal.add(tuple(c[:3])); return tuple(int(v) for v in c[:3]) + (a,)
    def part(s, prims, base, ow=.8, sd=0.0, hd=0.0, ol=None, shade=None, hc=None):
        k = s.k; r = max(1, int(round(ow * k))); xs = []; ys = []
        for p in prims:
            if p[0] == 'P': xs += [q[0] for q in p[1]]; ys += [q[1] for q in p[1]]
            elif p[0] == 'C': xs += [p[1] - p[3], p[1] + p[3]]; ys += [p[2] - p[4], p[2] + p[4]]
            else: w = p[5] / 2; xs += [p[1] - w, p[1] + w, p[3] - w, p[3] + w]; ys += [p[2] - w, p[2] + w, p[4] - w, p[4] + w]
        if not xs: return
        x0 = max(0, int(min(xs)) - r - 4); y0 = max(0, int(min(ys)) - r - 4); x1 = min(s.n, int(max(xs)) + r + 5); y1 = min(s.n, int(max(ys)) + r + 5)
        if x1 <= x0 or y1 <= y0: return
        W, H = x1 - x0, y1 - y0; M = Image.new('L', (W, H), 0); O = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(M); do = ImageDraw.Draw(O)
        for p in prims:
            if p[0] == 'P':
                q = [(a - x0, b - y0) for a, b in p[1]]; dm.polygon(q, fill=255); do.polygon(q, fill=255)
                do.line(q + [q[0]], fill=255, width=2 * r, joint='curve')
            elif p[0] == 'C':
                cx, cy, rx, ry = p[1] - x0, p[2] - y0, p[3], p[4]
                dm.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255); do.ellipse([cx - rx - r, cy - ry - r, cx + rx + r, cy + ry + r], fill=255)
            else:
                ax, ay, bx, by, w = p[1] - x0, p[2] - y0, p[3] - x0, p[4] - y0, p[5]
                for D, ww in ((dm, w), (do, w + 2 * r)):
                    D.line([ax, ay, bx, by], fill=255, width=max(1, int(ww))); h = ww / 2
                    D.ellipse([ax - h, ay - h, ax + h, ay + h], fill=255); D.ellipse([bx - h, by - h, bx + h, by + h], fill=255)
        L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); L.paste(s.rgba(ol or inkc(base)), mask=O); L.paste(s.rgba(base), mask=M)
        if sd:
            d = max(1, int(sd * k)); sm = ImageChops.subtract(M, ImageChops.offset(M, int(round(LIGHT[0] * d)), int(round(LIGHT[1] * d))))
            L.paste(s.rgba(shade or cool(base)), mask=sm)
        if hd:
            d = max(1, int(hd * k)); hm = ImageChops.subtract(M, ImageChops.offset(M, int(round(-LIGHT[0] * d)), int(round(-LIGHT[1] * d))))
            L.paste(s.rgba(hc or warm(base)), mask=hm)
        s.img.alpha_composite(L, (x0, y0))
    def poly(s, pts, col, a=255):
        ImageDraw.Draw(s.img).polygon(pts, fill=s.rgba(col, a))
    def line(s, a, b, col, w, al=255):
        d = ImageDraw.Draw(s.img); d.line([a, b], fill=s.rgba(col, al), width=max(1, int(w * s.k))); h = max(1, w * s.k) / 2
        d.ellipse([a[0] - h, a[1] - h, a[0] + h, a[1] + h], fill=s.rgba(col, al)); d.ellipse([b[0] - h, b[1] - h, b[0] + h, b[1] + h], fill=s.rgba(col, al))
    def dot(s, c, r, col, al=255, ry=None):
        d = ImageDraw.Draw(s.img); r *= s.k; ry = r if ry is None else ry * s.k
        d.ellipse([c[0] - r, c[1] - ry, c[0] + r, c[1] + ry], fill=s.rgba(col, al))
    def glow(s, c, r, col, al=150):
        R = int(r * s.k * 2.2); 
        if R < 2: return
        G = Image.new('RGBA', (2 * R, 2 * R), (0, 0, 0, 0)); ImageDraw.Draw(G).ellipse([R - r * s.k, R - r * s.k, R + r * s.k, R + r * s.k], fill=s.rgba(col, al))
        G = G.filter(ImageFilter.GaussianBlur(r * s.k * .55)); x, y = int(c[0] - R), int(c[1] - R)
        if x < 0 or y < 0 or x + 2 * R > s.n or y + 2 * R > s.n:                  # keep it simple at the edges: crop
            cx0, cy0 = max(0, -x), max(0, -y); G = G.crop((cx0, cy0, min(2 * R, s.n - x), min(2 * R, s.n - y))); x, y = max(0, x), max(0, y)
        s.img.alpha_composite(G, (x, y))

def capsule(a, b, r0, r1, k):
    """tapered capsule between two canvas points, radii in rig units -> prims"""
    dx, dy = b[0] - a[0], b[1] - a[1]; L = math.hypot(dx, dy)
    P = [('C', a[0], a[1], r0 * k, r0 * k), ('C', b[0], b[1], r1 * k, r1 * k)]
    if L > 1e-3:
        nx, ny = -dy / L, dx / L; P.append(('P', [(a[0] + nx * r0 * k, a[1] + ny * r0 * k), (b[0] + nx * r1 * k, b[1] + ny * r1 * k),
                                                  (b[0] - nx * r1 * k, b[1] - ny * r1 * k), (a[0] - nx * r0 * k, a[1] - ny * r0 * k)]))
    return P

# ----------------------------------------------------------------------------------- one frame
def v_(a, b): return tuple(x - y for x, y in zip(a, b))
def dot3(a, b): return sum(x * y for x, y in zip(a, b))
def lerp3(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
STEEL, STEEL_HI, WOODC, GRIP = (190, 198, 210), (240, 244, 250), (122, 90, 62), (92, 66, 50)

def solve(S, P, hr):
    """gs.solve with anime proportions: big head, shorter legs/torso/arms. Same joint names, same pose angles."""
    H = S['height']; th = sl = 5.8 * H; Tt = 7.8 * H; ua = fl = 4.7 * H
    lean = math.radians(P['lean']); u = (math.sin(lean), -math.cos(lean))
    neck = (Tt * u[0], Tt * u[1]); sho = (neck[0] * .9, neck[1] * .9)
    head = (neck[0] + u[0] * (.5 + hr), neck[1] + u[1] * (.5 + hr))
    def chain(o, l1, a1, l2, a2):
        a, b = math.radians(a1), math.radians(a2); m = (o[0] + l1 * math.sin(a), o[1] + l1 * math.cos(a))
        return m, (m[0] + l2 * math.sin(b), m[1] + l2 * math.cos(b))
    fk, ff = chain((0, 0), th, P['ft'][0], sl, P['ft'][1]); bk, bf = chain((0, 0), th, P['bt'][0], sl, P['bt'][1])
    fe, fh = chain(sho, ua, P['fa'][0], fl, P['fa'][1]); be, bh = chain(sho, ua, P['ba'][0], fl, P['ba'][1])
    low = max(ff[1], bf[1], fk[1], bk[1], head[1] + hr, neck[1]); ox, oy = gs.CX + P['dx'], gs.GROUND - low - P['lift']
    sft = lambda q: (q[0] + ox, q[1] + oy)
    return dict(pel=sft((0, 0)), neck=sft(neck), sho=sft(sho), head=sft(head), fk=sft(fk), ff=sft(ff), bk=sft(bk), bf=sft(bf),
                fe=sft(fe), fh=sft(fh), be=sft(be), bh=sft(bh), up=u)

def render(S, T, anim, f, deg, res):
    NF = g.NF; P, style = g.pose_for(S, anim, f); HR = T['hr'] * S['scale']; K = solve(S, P, HR); k = res * SS; n = g.CELL * res * SS
    sc, H, th_ = S['scale'], S['height'], S['thick']; VC = g.VC; clamp = g.clamp
    body, aura_p, fx_p = Painter(n, k), Painter(n, k), Painter(n, k); pal = body.pal; aura_p.pal = fx_p.pal = pal
    pitch = P.get('pitch', 0); pv_ = g.prof(K['pel']); drop = P.get('gnd', 0) * max(0, pv_[2] - 2.6 * sc) * abs(math.sin(math.radians(pitch)))   # lie flat: pelvis height minus body half-thickness
    cam0 = g.Cam(deg); cam = g.Cam(deg + P.get('turn', 0), pitch, (pv_[0], pv_[2]), drop); fy = cam.F[1]
    cp = lambda w: ((g.AX + w[0]) * k, (g.AY + w[1] * g.YS - w[2] * g.ZS) * k)
    S3 = lambda *l3: cp(cam.world(*l3)); gy = lambda l3: cam.world(*l3)[1]
    ws = (2.7 + 1.3 * th_) * sc; wh = ws * .56; hf = (1.4 + .9 * th_) * sc
    r1 = (1.2 + .6 * th_) * sc; r2 = r1 * .82; a1 = (.9 + .45 * th_) * sc; a2 = a1 * .86; hr_ = max(1.5, a1 * 1.15)
    ls, asp = P.get('ls', (4, 4)), P.get('asp', (12, 12)); fl = math.sin(2 * math.pi * f / NF); sway = P.get('sway', 0)
    pel, sho = g.prof(K['pel']), g.prof(K['sho']); parts = []
    def add(d, o, fn): parts.append((round(d, 3), o, fn))
    def jl(p2, side, lat, piv2, spl):
        d = p2[1] - piv2[1]; a = math.radians(spl)
        return (p2[0] - gs.CX, lat + side * abs(d) * math.sin(a), gs.GROUND - piv2[1] - d * math.cos(a))
    dark = lum(T['top']) < 70

    # ---- legs
    def leg(side, kk, ff):
        spl = ls[0 if side > 0 else 1]; lat = side * wh
        hip, kn, ft = (jl(K[q], side, lat, K['pel'], spl) for q in ('pel', kk, ff)); gd = sum(gy(q) for q in (hip, kn, ft)) / 3
        shf = .74 + .26 * clamp(.5 + gd / 8, 0, 1)
        def draw():
            A_, B_, C_ = S3(*hip), S3(*kn), S3(*ft); base = sh(T['bot'], shf)
            body.part(capsule(A_, B_, r1, r1 * .9, k) + capsule(B_, C_, r1 * .9, r2, k), base, ow=.7, sd=.9, hd=.3)
            lg = S['legs']; pri = sh(S['pri'], shf); acc = sh(S['acc'], shf)
            if lg == 'wraps':
                for a_, b_ in ((.06, .2), (.74, .92)): body.part(capsule(S3(*lerp3(kn, ft, a_)), S3(*lerp3(kn, ft, b_)), r2 * 1.14, r2 * 1.1, k), sh(S['pri'], shf), ow=.45, sd=.5)
            elif lg in ('greaves', 'plated'):
                body.part(capsule(S3(*lerp3(kn, ft, .06)), S3(*lerp3(kn, ft, .9)), r2 * 1.22, r2 * 1.1, k), pri, ow=.55, sd=.7, hd=.4)
                if lg == 'plated': body.part(capsule(S3(*lerp3(hip, kn, .15)), S3(*lerp3(hip, kn, .88)), r1 * 1.15, r1 * 1.05, k), pri, ow=.55, sd=.8, hd=.4)
                body.part([('C', B_[0], B_[1], r2 * 1.2 * k, r2 * 1.2 * k)], acc, ow=.4, sd=.4)
            d2 = (K[ff][0] - K[kk][0], K[ff][1] - K[kk][1]); L2 = math.hypot(*d2) or 1; d2 = (d2[0] / L2, d2[1] / L2)
            toe2 = (K[ff][0] + d2[1] * 3.6 * sc, K[ff][1] - d2[0] * 3.6 * sc); toe = jl(toe2, side, lat, K['pel'], spl)
            sc_ = sh(T['shoe'], shf); body.part(capsule(C_, S3(*toe), r2 * 1.12, r2 * .95, k), sc_, ow=.6, sd=.6, hd=.25)
        add(gd, 1, draw)
    leg(1, 'fk', 'ff'); leg(-1, 'bk', 'bf')

    # ---- head geometry (big anime head on the rig's neck)
    hc2 = K['head']; h3 = g.prof(hc2)
    wh0 = cam.world(*h3); hpt = cp(wh0)
    def hs(th, ph, rr=1.0):                                   # point on the head sphere (degrees): canvas pt + how much it faces the camera
        th, ph = math.radians(th), math.radians(ph); c = math.cos(th)
        w = cam.world(h3[0] + HR * rr * c * math.cos(ph), h3[1] + HR * rr * c * math.sin(ph), h3[2] + HR * rr * math.sin(th))
        return cp(w), dot3(v_(w, wh0), VC) / (HR * rr)
    fvis = hs(0, 0)[1]                                        # >0: the face turns toward the camera

    # ---- back items (behind the torso when you face the camera)
    if S['back'] == 'cloak':
        pts = [(sho[0] - hf, ws * .9, sho[2]), (sho[0] - hf, -ws * .9, sho[2]), (pel[0] - hf - 4 + 2 * fl, -ws * 1.25, max(3, pel[2] - 11)), (pel[0] - hf - 4 + 2 * fl, ws * 1.25, max(3, pel[2] - 11))]
        mid = ((pts[0][0] + pts[2][0]) / 2, 0, (pts[0][2] + pts[2][2]) / 2)
        add(gy(mid) - 1, 2, lambda: body.part([('P', [S3(*q) for q in pts])], sh(S['pri'], .85), ow=.7, sd=1.6, hd=.3, ol=inkc(S['pri'])))
    elif S['back'] == 'tendrils':
        def tend():
            for i in range(3):
                prev = S3(sho[0] - hf - 1, (i - 1) * 2.2, sho[2] - 1 - i)
                for j in range(1, 7):
                    q = S3(sho[0] - hf - 1 - j * 2.2, (i - 1) * (2 + j * .9) + 1.6 * math.sin(2 * math.pi * f / NF + j * .9 + i), sho[2] - 1 - i - j * .8 + .9 * math.sin(f + j))
                    body.line(prev, q, inkc(S['acc']), 1.5); body.line(prev, q, S['emi'] if j % 2 else S['acc'], .9); prev = q
        add(gy((sho[0] - hf - 4, 0, sho[2])) - .5, 2, tend)
    elif S['back'] == 'shards':
        for i, (ox_, oy_) in enumerate([(-8, -5), (-10, 2), (-7, 9)]):
            c3 = (sho[0] + ox_ * sc * .8, (i - 1) * 5 * sc, max(4, sho[2] - oy_ * sc + 1.3 * math.sin(2 * math.pi * f / NF + i * 2)))
            def shard(c3=c3):
                x, y = S3(*c3); w, h = 1.9 * k, 3.6 * k; body.glow((x, y), 2.4, S['emi'], 70)
                body.part([('P', [(x, y - h), (x + w, y), (x, y + h), (x - w, y)])], S['emi'], ow=.4, sd=.5, ol=S['acc'])
            add(gy(c3), 2, shard)

    # ---- torso + cloth
    def torso():
        top = (sho[0], 0, sho[2] + 1); dv = v_(top, pel); ln_ = math.sqrt(dot3(dv, dv)); dirv = tuple(x / ln_ for x in dv)
        def ring(t, af, al, base=None, dz=0.0):
            c = base or tuple(pel[i] + dirv[i] * ln_ * t for i in range(3)); return [S3(c[0] + af * math.cos(math.radians(a)), c[1] + al * math.sin(math.radians(a)), c[2] + dz) for a in range(0, 360, 30)]
        rings = [(0, hf * .95, wh + 1.0), (.35, hf * .85, (wh + ws) / 2 * .92), (.78, hf * 1.05, ws * .98), (1.0, hf * .8, ws * .8)]
        tp = hull(sum([ring(*r_) for r_ in rings], [])); prims = [('P', tp)]; ch = S['chest']; tc = T['top']
        if ch in ('coat', 'robe') or S['legs'] == 'skirt':
            Lh = 11 if ch == 'robe' else (8 if ch == 'coat' else 5.5); hemu = max(1.6, pel[2] - Lh * H * .9); off = -1.0 + .9 * fl + sway * .6
            hem = ring(0, hf + (3.2 if ch == 'robe' else 2.4), wh + (4.4 if ch == 'robe' else 3.2), (pel[0] + off, 0, hemu))
            flare = hull(ring(0, hf + .2, wh + 1.0) + hem)
            if S['legs'] == 'skirt' and ch not in ('coat', 'robe'):
                body.part([('P', flare)], S['sec'], ow=.6, sd=1.1, hd=.3); body.part([('P', hull(ring(0, hf + 1.4, wh + 2.4, (pel[0] + off * .6, 0, max(1.6, pel[2] - 4.8)))+ring(0, hf + .3, wh + 1.2)))], S['pri'], ow=.6, sd=.9)
            else: prims.append(('P', flare))
        body.part(prims, tc, ow=.8, sd=1.7, hd=.5)
        trim = S['sec'] if ch != 'plate' else S['acc']
        if ch in ('coat', 'robe') and fy > .1:      # front trim line + hem band
            body.line(S3(pel[0] + hf + .2, 0, sho[2] - .5), S3(pel[0] + hf + .6 + off, 0, hemu + .4), trim, .9)
            body.part([('P', hull(hem + ring(0, hf + 2.9, wh + 3.9, (pel[0] + off, 0, hemu + 1.7))))], S['sec'], ow=.4, sd=.4)
        elif ch in ('coat', 'robe'): body.part([('P', hull(hem + ring(0, hf + 2.9, wh + 3.9, (pel[0] + off, 0, hemu + 1.7))))], S['sec'], ow=.4, sd=.4)
        if ch == 'plate' or ch == 'chitin':
            body.part([('P', hull(ring(0, hf + .5, wh + 1.5) + ring(.14, hf + .5, wh + 1.5)))], S['sec'], ow=.5, sd=.5)
            sg = 1 if fy > .1 else (-1 if fy < -.1 else 0)
            if sg:
                a_ = S3(pel[0] + sg * (hf + .15), 0, sho[2] - 1.2); b_ = S3(pel[0] + sg * (hf + .15), 0, pel[2] + 3.2)
                body.line(a_, b_, S['acc'], .7)
                if ch == 'chitin':
                    for t_ in (.3, .5, .72):
                        c_ = tuple(pel[i] + dirv[i] * ln_ * t_ for i in range(3)); w_ = (wh + 1) * (1 - t_) + ws * t_ - .3
                        body.line(S3(c_[0] + sg * (hf + .1), -w_, c_[2]), S3(c_[0] + sg * (hf + .1), w_, c_[2]), S['acc'], .6)
                else: body.dot(S3(pel[0] + sg * (hf + .2), 0, sho[2] - 3.4), .9, S['emi'])
        if ch in ('harness', 'wraps'):
            sg = 1 if fy > .1 else (-1 if fy < -.1 else 0)
            if sg:
                p0 = tuple(pel[i] + dirv[i] * ln_ * .95 for i in range(3)); p1 = tuple(pel[i] + dirv[i] * ln_ * .14 for i in range(3)); X = hf + .15; a_ = ws * .55
                col = S['sec'] if ch == 'harness' else S['pri']
                for s_ in (1, -1): body.line(S3(p0[0] + sg * X, s_ * a_, p0[2]), S3(p1[0] + sg * X, -s_ * a_, p1[2]), col, .85 if ch == 'harness' else 1.0)
                body.dot(S3(pel[0] + sg * X, 0, (p0[2] + p1[2]) / 2), .9, S['acc'])
            body.part([('P', hull(ring(0, hf + .3, wh + 1.2) + ring(.12, hf + .3, wh + 1.2)))], S['sec'], ow=.4, sd=.4)
        if ch == 'chitin':
            for sd_ in (-1, 1):
                x, y = S3(sho[0], sd_ * ws, sho[2] + 1); body.part([('P', [(x - 2.6 * k, y - 1 * k), (x, y - 8 * k), (x + 2.6 * k, y - 1 * k)])], S['acc'], ow=.5, sd=.6)
        nk = S3(*g.prof(K['neck'])); body.part([('C', nk[0], nk[1], 1.5 * k * sc, 1.5 * k * sc)], T['skin'], ow=.6, sd=.5)
    add(0, 5, torso)

    # ---- head: sphere, face, hair, headgear
    def head():
        sk, hc, hl = T['skin'], T['hair'], T['hl']; hx, hy = hpt; Rk = HR * k; hs_ = T['hs'] if not T['faceless'] else 'none'
        Fx = dot3(v_(cam.world(h3[0] + 1, h3[1], h3[2]), wh0), VC)         # forward . camera
        def cap_pts(step=20, extra=1.07):
            out = []
            for ph in range(-180, 181, step):
                a = abs(ph); thh = 40 - 24 * (a / 90) if a <= 90 else 16 - 52 * ((a - 90) / 90)
                for i in range(5):
                    th = thh + (90 - thh) * i / 4; p, v = hs(th, ph, extra)
                    if v > -.28: out.append(p)
            return out
        def lock(ph, w, th0, th1, d=.0):
            (p0, v0), (p1, v1), (p2, v2) = hs(th0, ph - w, 1.07), hs(th0, ph + w, 1.07), hs(th1, ph + d, 1.1)
            return [p0, p1, p2], min(v0, v1, v2)
        back = []; post = []
        if hs_ in ('long', 'bob'):
            Lh = (HR + 5.5) if hs_ == 'long' else (HR * .75 + 1.5); pts = []
            for ph in range(100, 261, 20):
                for th in (55, 10, -30): pts.append(hs(th, ph, 1.12)[0])
            sw_ = 1.2 * fl
            for sdl in (-1, 0, 1): pts.append(S3(h3[0] - HR * (.85 if hs_ == 'long' else .55) - sw_, sdl * HR * (1.0 if hs_ == 'long' else .95), h3[2] - Lh))
            back.append((hull(pts), -1))
        elif hs_ == 'ponytail':
            prev = hs(12, 180, 1.0)[0]; ptl = []
            for j in range(1, 5):
                q = S3(h3[0] - HR * 1.0 - j * 2.4, 1.3 * math.sin(2 * math.pi * f / NF + j), h3[2] + 1.5 - j * 1.8 + .6 * math.sin(f + j)); ptl.append((prev, q, 2.2 - j * .35)); prev = q
            back.append((('tail', ptl), -1))
        elif hs_ == 'spiky':
            for ph, th, ln_ in ((180, 50, 3.6), (150, 40, 3.2), (-150, 40, 3.2), (180, 20, 3.0), (-60, 78, 3.4), (0, 82, 4.0), (60, 78, 3.4), (-115, 66, 3.4), (115, 66, 3.4)):
                (b0, v0), (b1, v1) = hs(th - 12, ph - 14, 1.0), hs(th + 12, ph + 14, 1.0); tip, vt = hs(th - 12, ph, 1.0 + ln_ / HR * 1.15)
                (back if v0 + v1 < 0 else post).append(([b0, b1, tip], -1))
        # 1. things behind the head
        for P_, vd in back:
            if fvis >= 0 or True:
                if isinstance(P_, tuple) and P_[0] == 'tail':
                    for a_, b_, r_ in P_[1]: body.part(capsule(a_, b_, r_ * sc, (r_ - .3) * sc, k), hc, ow=.5, sd=.7, hc=hl)
                elif hs_ in ('long', 'bob') and fvis < 0: pass
                else: body.part([('P', P_)], hc, ow=.6, sd=1.3, hc=hl)
        # 2. head sphere
        body.part([('C', hx, hy, Rk, Rk * VSC)], sk, ow=.7, sd=1.6, hd=.5)
        # 3. face
        if fvis > -.05:
            if T['faceless']:
                for sd_ in (-1, 1):
                    p, v = hs(-2, sd_ * 26, 1.0)
                    if v > .1: body.glow(p, 1.9, T['eye'], 120); body.part([('C', p[0], p[1], k * 1.25 * min(1, v * 1.6), k * .8)], T['eye'], ow=.25, ol=inkc(sk))
            else:
                for sd_ in (-1, 1):
                    p, v = hs(-8, sd_ * 28, 1.0)
                    if v > .12:
                        ew = HR * .25 * clamp(v * 1.35, .3, 1) * k; eh = HR * .39 * k * VSC; e = T['eye']; D = ImageDraw.Draw(body.img)
                        body.part([('C', p[0], p[1], ew, eh)], e, ow=.28, ol=(34, 24, 40))
                        D.ellipse([p[0] - ew * .96, p[1] + eh * .02, p[0] + ew * .96, p[1] + eh * .96], fill=body.rgba(mx(e, (255, 255, 255), .42)))    # lighter lower iris
                        D.ellipse([p[0] - ew * .52, p[1] - eh * .38, p[0] + ew * .52, p[1] + eh * .5], fill=body.rgba(sh(e, .32)))                       # pupil
                        D.line([(p[0] - ew * 1.08, p[1] - eh * .9), (p[0] + ew * 1.08, p[1] - eh * .9)], fill=body.rgba((28, 18, 34)), width=max(2, int(k * .6)))  # upper lash
                        D.ellipse([p[0] - ew * .62, p[1] - eh * .66, p[0] - ew * .02, p[1] - eh * .14], fill=body.rgba((255, 255, 255)))                    # big highlight
                        D.ellipse([p[0] + ew * .2, p[1] + eh * .3, p[0] + ew * .58, p[1] + eh * .62], fill=body.rgba((255, 255, 255), 215))
                pm, vm = hs(-46, 0, 1.0)
                if vm > .45: body.line((pm[0] - k * .8, pm[1]), (pm[0] + k * .8, pm[1]), mx(sk, (150, 60, 70), .6), .45)
                for sd_ in (-1, 1):
                    pb, vb = hs(-30, sd_ * 44, 1.0)
                    if vb > .4: body.dot(pb, 1.0, mx(sk, (255, 120, 140), .55), 110, ry=.55)
        # 4. hair in front of the face
        if hs_ != 'none':
            cap = hull(cap_pts()); body.part([('P', cap)], hc, ow=.65, sd=1.5, hd=1.5, hc=hl)
            if Fx > -.05 or fvis > 0:
                for ph, w, t0, t1, dd in ((-40, 13, 30, 8, 6), (-14, 12, 32, 2, 4), (13, 12, 32, 4, -4), (40, 13, 30, 10, -6), (-76, 10, 26, -26, 0), (76, 10, 26, -26, 0)):
                    poly, v = lock(ph, w, t0, t1, dd)
                    if v > .06: body.part([('P', poly)], hc, ow=.45, sd=.6, hc=hl)
            for P_, vd in post: body.part([('P', P_)], hc, ow=.55, sd=.6, hc=hl)
            if hs_ in ('long', 'bob') and fvis < 0:
                for P_, vd in back: body.part([('P', P_)], hc, ow=.6, sd=1.3, hc=hl)
        # 5. headgear
        hm = S['helm']
        if hm == 'wrap':
            ringp = [hs(22, a, 1.1)[0] for a in range(-180, 181, 18) if hs(22, a, 1.1)[1] > -.2]
            for a_, b_ in zip(ringp, ringp[1:]): body.line(a_, b_, inkc(S['pri']), 2.0)
            for a_, b_ in zip(ringp, ringp[1:]): body.line(a_, b_, S['pri'], 1.45)
            q0 = hs(20, 180, 1.1)[0]; q1 = S3(h3[0] - HR * 1.0 - 3, 0, h3[2] + 1 + fl); q2 = S3(h3[0] - HR * 1.0 - 6.4, 0, h3[2] - .6 - fl)
            body.part(capsule(q0, q1, 1.1 * sc, .9 * sc, k) + capsule(q1, q2, .9 * sc, .5 * sc, k), S['sec'], ow=.45, sd=.4)
        elif hm == 'circlet':
            for a_, b_ in zip(*(lambda r_: (r_, r_[1:]))([hs(38, a, 1.09)[0] for a in range(-80, 81, 16)])): body.line(a_, b_, S['acc'], 1.0)
            pc, vc = hs(38, 0, 1.1)
            if vc > .1: body.dot(pc, 1.0, S['emi']); body.glow(pc, 1.4, S['emi'], 110)
        elif hm == 'visor':
            pts = [hs(8, a, 1.1)[0] for a in range(-95, 96, 19) if hs(8, a, 1.1)[1] > -.15] + [hs(-14, a, 1.1)[0] for a in range(95, -96, -19) if hs(-14, a, 1.1)[1] > -.15]
            if len(pts) > 3 and fvis > -.15:
                body.part([('P', hull(pts))], S['pri'], ow=.55, sd=.7, hd=.4)
                for a in range(-70, 71, 10):
                    p, v = hs(-3, a, 1.1)
                    if v > .15: body.dot(p, .55, S['emi'])
        elif hm == 'helm':
            body.part([('C', hx, hy - HR * .1 * k, Rk * 1.12, Rk * 1.12 * VSC)], S['pri'], ow=.8, sd=1.7, hd=.7)
            pa, va = hs(-2, -62, 1.14); pb, vb = hs(-2, 62, 1.14)
            if fvis > -.1:
                pts = [hs(6, a, 1.15)[0] for a in range(-60, 61, 20)] + [hs(-10, a, 1.15)[0] for a in range(60, -61, -20)]
                body.part([('P', hull(pts))], (16, 14, 18), ow=.4)
                for a in range(-44, 45, 11):
                    p, v = hs(-2, a, 1.15)
                    if v > .2: body.dot(p, .6, T['eye'])
            q0 = hs(70, 0, 1.1)[0]; q1 = S3(h3[0] - HR * .6, 0, h3[2] + HR + 3 + fl); q2 = S3(h3[0] - HR * 1.4, 0, h3[2] + HR + 1.2 - fl)
            body.part(capsule(q0, q1, 1.2 * sc, .9 * sc, k) + capsule(q1, q2, .9 * sc, .4 * sc, k), S['acc'], ow=.5, sd=.5)
        elif hm == 'hood':
            pts = [hs(th, a, 1.2)[0] for a in range(-180, 181, 24) for th in (70, 20, -30) if hs(th, a, 1.2)[1] > -.4]
            if fvis < .15: pts += [S3(h3[0] - HR * 1.1, 0, h3[2] - HR * .6)]
            body.part([('P', hull(pts))], S['pri'], ow=.8, sd=1.9, hd=.5)
            if fvis > .12:
                win = [S3(h3[0] + HR * .86 * .85, math.sin(math.radians(a)) * HR * .62, h3[2] - HR * .06 + math.cos(math.radians(a)) * HR * .72) for a in range(0, 360, 30)]
                body.part([('P', win)], mx(sk, (14, 12, 22), .55), ow=.5)
                for sd_ in (-1, 1):
                    p, v = hs(-4, sd_ * 25, 1.0)
                    body.glow(p, 1.6, T['eye'], 110); body.part([('C', p[0], p[1], k * .9, k * 1.1)], T['eye'], ow=.2, ol=(30, 22, 30))
        elif hm == 'mandibles' and fvis > -.35:
            for sd_ in (-1, 1):
                pts = [S3(h3[0] + HR * .5, sd_ * HR * .25, h3[2] - HR * .55), S3(h3[0] + HR * 1.05, sd_ * HR * .6, h3[2] - HR * .7), S3(h3[0] + HR * .95, sd_ * HR * .3, h3[2] - HR * 1.15)]
                body.part([('P', pts)], S['acc'], ow=.5, sd=.4)
    add(gy(g.prof(hc2)) + .05, 6, head)

    # ---- arms (+ pauldrons)
    def arm(side, ee, hh):
        spl = asp[0 if side > 0 else 1]; lat = side * ws
        s3, e3, h3_ = (jl(K[q], side, lat, K['sho'], spl) for q in ('sho', ee, hh)); gd = sum(gy(q) for q in (s3, e3, h3_)) / 3
        shf = .74 + .26 * clamp(.5 + gd / 8, 0, 1)
        def draw():
            ch = S['chest']; sk = sh(T['skin'], shf); armored = ch in ('plate', 'chitin'); A_, B_, C_ = S3(*s3), S3(*e3), S3(*h3_)
            up = sh(S['pri'], shf) if (ch in ('coat', 'robe') or armored) else sk; lo = sh(S['pri'], shf) if (ch == 'robe' or armored) else sk
            rr = a1 * (1.3 if ch == 'robe' else 1.0)
            body.part(capsule(B_, C_, rr * .95, a2 * (1.5 if ch == 'robe' else 1), k), lo, ow=.65, sd=.8, hd=.3)
            if ch == 'wraps':
                for a_, b_ in ((.15, .4), (.55, .8)): body.part(capsule(S3(*lerp3(e3, h3_, a_)), S3(*lerp3(e3, h3_, b_)), a2 * 1.1, a2 * 1.05, k), sh(S['pri'], shf), ow=.4, sd=.4)
            body.part(capsule(A_, B_, rr, rr * .95, k), up, ow=.65, sd=.9, hd=.35)
            if S['pauldron'] or armored:
                body.part([('C', A_[0], A_[1] - .4 * k, 2.7 * k * sc, 2.5 * k * sc)], sh(S['pri'], shf), ow=.6, sd=1.0, hd=.5); body.dot((A_[0], A_[1] - 2.1 * k * sc), .55, S['acc'])
            gl = sh(T['glove'], shf)
            if S['weapon'] == 'gauntlets': body.part([('C', C_[0], C_[1], 3.0 * k * sc, 2.8 * k * sc)], sh(S['pri'], shf), ow=.65, sd=1.1, hd=.5); body.dot((C_[0] + .6 * k, C_[1] - .4 * k), .6, S['acc'])
            else: body.part([('C', C_[0], C_[1], hr_ * k, hr_ * k)], gl, ow=.6, sd=.7, hd=.3)
        add(gd, 7, draw)
    arm(1, 'fe', 'fh'); arm(-1, 'be', 'bh')

    # ---- weapons
    phi = math.radians(g.PHI_STYLE[style][f] if style else 28)
    def draw_weapon(kind, hand2, ang, mp, shade=1.0):
        dv_, pv2 = gs.axis(ang); at = lambda t, s_=0: (hand2[0] + dv_[0] * t + pv2[0] * s_, hand2[1] + dv_[1] * t + pv2[1] * s_)
        wpt = lambda p: tuple(c * k for c in mp(*p))
        def WP(pts, col, sd=.5, hd=.3, ow=.5, ol=None): body.part([('P', [wpt(p) for p in pts])], sh(col, shade), ow=ow, sd=sd, hd=hd, ol=ol)
        def WL(a, b, w, col, sd=.4): body.part(capsule(wpt(a), wpt(b), w / 2, w / 2, k), sh(col, shade), ow=.5, sd=sd)
        def blade(L, w0, w1, tip, col=STEEL, t0=1.0):
            WP([at(t0, -w0), at(L, -w1), at(L + tip, 0), at(L, w1), at(t0, w0)], col, sd=w0 * .8, hd=.5)
            body.line(wpt(at(t0 + .8, -w0 * .25)), wpt(at(L - .6, -w1 * .25)), (255, 255, 255), .22, 190)
        if kind in ('dagger', 'twinblades'):
            L = (7 if kind == 'dagger' else 9) * 1.15; WL(at(-2.6), at(.4), 1.5, GRIP); WL(at(.4, -2.5), at(.4, 2.5), 1.0, S['acc']); blade(L, 1.25, .8, 2.6)
        elif kind == 'longsword':
            WL(at(-4.6), at(0), 1.5, GRIP); WL(at(.4, -3.5), at(.4, 3.5), 1.15, S['acc']); x, y = wpt(at(-5.3)); body.part([('C', x, y, 1.1 * k, 1.1 * k)], sh(S['acc'], shade), ow=.4); blade(14.5, 1.55, 1.1, 3.2)
        elif kind == 'saber':
            WL(at(-3.2), at(0), 1.4, GRIP); WL(at(.4, -2.6), at(.4, 2.6), 1.0, S['acc'])
            ctr = [(1, 0), (5, .3), (9, 1.4), (13, 3.2)]; up_ = [at(t, s_ + (1.0 - i * .1)) for i, (t, s_) in enumerate(ctr)]; lo_ = [at(t, s_ - (1.0 - i * .1)) for i, (t, s_) in enumerate(ctr)]
            WP(up_ + [at(15.2, 5.0)] + lo_[::-1], STEEL, sd=.9, hd=.5)
        elif kind == 'spear':
            L = S.get('reach', 15); WL(at(-9), at(L), 1.15, WOODC); WP([at(L - 1.2, 0), at(L + 1, 2.4), at(L + 7.5, 0), at(L + 1, -2.4)], STEEL, sd=1.0, hd=.5)
            WP([at(L - 1.4, 0), at(L - 3.4, 2.2), at(L - 4.0, -1.8)], S['acc'], sd=.3, hd=0, ow=.35)
        elif kind == 'staff':
            WL(at(-10), at(13.5), 1.25, (112, 84, 62)); WL(at(12, -2.4), at(12, 2.4), .9, S['acc']); o = wpt(at(16.2))
            body.glow(o, 3.6, S['emi'], 120); body.part([('C', o[0], o[1], 2.3 * k, 2.3 * k)], S['emi'], ow=.5, sd=.6, hd=.7, hc=(255, 255, 255)); body.dot((o[0] - .7 * k, o[1] - .8 * k), .55, (255, 255, 255))
        elif kind == 'maul':
            WL(at(-7), at(13.5), 1.35, (124, 94, 66)); WP([at(11, -4.8), at(18.4, -4.8), at(18.4, 4.8), at(11, 4.8)], S['pri'], sd=1.4, hd=.7, ow=.65)
            WL(at(11.4, -4.6), at(11.4, 4.6), .9, S['acc']); WL(at(18.0, -4.6), at(18.0, 4.6), .9, S['acc']); WP([at(18.4, -1.6), at(20.4, 0), at(18.4, 1.6)], S['acc'], sd=.3, hd=0, ow=.35)
        elif kind == 'lantern':
            x0, y0 = hand2; wp2 = lambda dx, dy: wpt((x0 + dx, y0 + dy)); body.line(wp2(0, 0), wp2(0, 3.2), GRIP, .5)
            WP([(x0 - 2.5, y0 + 3.2), (x0 + 2.5, y0 + 3.2), (x0 + 2.2, y0 + 9.4), (x0 - 2.2, y0 + 9.4)], mx(S['emi'], (255, 255, 255), .25), sd=.5, hd=.2, ol=S['acc'])
            WP([(x0 - 3.0, y0 + 3.4), (x0, y0 + 1.2), (x0 + 3.0, y0 + 3.4)], S['acc'], sd=.3, hd=.3, ow=.4); c_ = wp2(0, 6.4); body.glow(c_, 5.2, S['emi'], 150)
        elif kind == 'tablet':
            c_ = S3(*g.vadd(g.prof(K['fh'], ws), (2, 0, 1))); w_, h_ = 3.6 * k, 5.2 * k; body.glow(c_, 5, S['emi'], 70)
            body.part([('P', [(c_[0] - w_, c_[1] - h_), (c_[0] + w_, c_[1] - h_), (c_[0] + w_, c_[1] + h_), (c_[0] - w_, c_[1] + h_)])], (30, 29, 36), ow=.5, sd=.0, ol=S['emi'])
            for i_, r_ in enumerate((-2.6, -.6, 1.4, 3.2)): body.line((c_[0] - w_ * .6, c_[1] + r_ * k), (c_[0] + w_ * (.15 + .5 * (i_ % 2)), c_[1] + r_ * k), mx(S['emi'], (0, 0, 0), .15), .4)
    if S['weapon'] not in ('none', 'gauntlets'):
        hand = g.prof(K['fh'], ws); mp = g.plane(cam, ws, phi, K['fh']); add(gy(hand) + .3, 8, lambda: draw_weapon(S['weapon'], K['fh'], P['w'], mp))
    if S['offhand'] == 'shield':
        def shield():
            hl = g.prof(K['bh'], -ws); psi = math.radians(P.get('psi', 35)); nv = (math.cos(psi), -math.sin(psi), 0); Wv = (math.sin(psi), math.cos(psi), 0)
            ctr = g.vadd(hl, (2.5, -1.0, -1.0)); V = [g.vadd(ctr, g.vadd(g.vmul(Wv, a_ * 1.2), (0, 0, -b_ * 1.2))) for a_, b_ in [(-4.4, -5.6), (4.4, -5.6), (4.4, 1), (0, 7.8), (-4.4, 1)]]
            wn = v_(cam.world(*nv), cam.world(0, 0, 0)); front = dot3(wn, VC) > 0; s_ = clamp(.82 + .3 * dot3(wn, g.LIGHT), .6, 1.1)
            col = sh(S['sec'], s_) if front else sh(S['sec'], .55)
            body.part([('P', [S3(*q) for q in V])], col, ow=.7, sd=1.3 if front else 0, hd=.5 if front else 0, ol=S['acc'] if front else sh(S['acc'], .6))
            if front:
                body.line(S3(*g.vadd(ctr, (0, 0, 4.8))), S3(*g.vadd(ctr, (0, 0, -3.8))), S['pri'], .8); c_ = S3(*ctr); body.glow(c_, 1.6, S['emi'], 120); body.dot(c_, .75, S['emi'])
        add(gy(g.vadd(g.prof(K['bh'], -ws), (2.5, -1, -1))) + .2, 8, shield)
    elif S['offhand'] != 'none' or S['weapon'] == 'twinblades':
        oh = S['offhand'] if S['offhand'] != 'none' else 'twinblades'; mpo = g.plane(cam, -ws)
        add(gy(g.prof(K['bh'], -ws)) + .3, 8, lambda: draw_weapon(oh, K['bh'], P['ow'], mpo, .85))

    for _, _, fn in sorted(parts, key=lambda t: (t[0], t[1])): fn()

    # ---- seal above the head, joint glow, aura, effects
    rk = S['rank']; rc = gs.RANK_COL[rk]; sx, sy = hpt[0], hpt[1] - (HR * VSC + 5 + .9 * math.sin(2 * math.pi * f / NF)) * k
    fx_p.glow((sx, sy), 3.2, rc, 70)
    if rk == 'Crown': fx_p.line((sx - 4.2 * k, sy), (sx + 4.2 * k, sy), rc, .55, 230); fx_p.dot((sx, sy), 1.2, rc, 120, ry=.5)
    elif rk == 'Unsealed':
        for a_, b_ in (((-3, 0), (0, -3)), ((-3, 0), (0, 3)), ((0, 3), (2, 1))): fx_p.line((sx + a_[0] * k, sy + a_[1] * k), (sx + b_[0] * k, sy + b_[1] * k), rc, .5, 230)
    else:
        d_ = 3.2 * k; fx_p.part([('P', [(sx, sy - d_), (sx + d_ * .85, sy), (sx, sy + d_), (sx - d_ * .85, sy)])], (10, 8, 14) if rk == 'Null' else sh(rc, .45), ow=.35, ol=rc)
        fx_p.dot((sx, sy), .55, rc)
    if S['jointglow']:
        for nm, l in (('fk', wh), ('bk', -wh), ('sho', 0), ('pel', 0), ('fh', ws), ('bh', -ws)): fx_p.glow(S3(*g.prof(K[nm], l)), 1.3, S['emi'], 150); fx_p.dot(S3(*g.prof(K[nm], l)), .5, (255, 255, 255))
    ak = S['aura']
    if ak != 'none':
        cols = gs.AURA[ak]; Rg = int(36 * sc); pulse = 70 + int(40 * math.sin(2 * math.pi * f / NF)); ax_, ay_ = g.AX * k, g.AY * k
        ImageDraw.Draw(aura_p.img).ellipse([ax_ - 11 * sc * k, ay_ - 5.5 * sc * k, ax_ + 11 * sc * k, ay_ + 5.5 * sc * k], outline=aura_p.rgba(cols[0], pulse), width=max(1, int(.8 * k)))
        for i in range(9):
            t = (((i * 53) % Rg) + f * Rg / NF) % Rg / Rg; x = ax_ + (((i * 37) % 21 - 10) * sc + 2 * math.sin(2 * math.pi * f / NF + i)) * k
            y = ay_ - (3 + (1 - t if ak == 'frost' else t) * Rg) * k; al = int(255 * (1 - t) ** .7); c = cols[i % 3]
            if ak in ('ember', 'light', 'frost'): aura_p.glow((x, y), .9, c, al // 2)
            if ak == 'void': aura_p.part([('P', [(x, y - 1.1 * k), (x + 1.1 * k, y), (x, y + 1.1 * k), (x - 1.1 * k, y)])], c, ow=.15, ol=cols[1])
            elif ak == 'venom': ImageDraw.Draw(aura_p.img).ellipse([x - 1.1 * k, y - 1.1 * k, x + 1.1 * k, y + 1.1 * k], outline=aura_p.rgba(c, al), width=max(1, int(.4 * k)))
            else: aura_p.dot((x, y), .65 if ak != 'frost' else .5, c, al)
    fx_effects(S, P, K, f, cam, cam0, ws, phi, fx_p, k, cp, S3, pel)

    fig = body.img
    if P['flash']:
        rgb = Image.blend(fig.convert('RGB'), Image.new('RGB', fig.size, (255, 255, 255)), P['flash']).convert('RGBA'); rgb.putalpha(fig.getchannel('A')); fig = rgb
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0)); out.alpha_composite(aura_p.img); out.alpha_composite(fig); out.alpha_composite(fx_p.img)
    out = out.resize((g.CELL * res, g.CELL * res), Image.BOX)
    C = g.CELL * res; bb = out.getchannel('A').getbbox()          # safety clamp: never let a frame touch / be clipped by the cell edge
    if bb and (bb[0] < 1 or bb[1] < 1 or bb[2] > C - 1 or bb[3] > C - 1):
        dx = 1 - bb[0] if bb[0] < 1 else (C - 1 - bb[2] if bb[2] > C - 1 else 0); dy = 1 - bb[1] if bb[1] < 1 else (C - 1 - bb[3] if bb[3] > C - 1 else 0)
        sh_ = Image.new('RGBA', out.size, (0, 0, 0, 0)); sh_.paste(out, (dx, dy)); out = sh_
    return out, pal

def fx_effects(S, P, K, f, cam, cam0, ws, phi, fx_p, k, cp, S3, pel):
    ec = S['emi']; pale = mx(ec, (255, 255, 255), .6); tip = gs.tip_of(S, S['weapon'], K['fh'], P['w']); tip = (min(tip[0], gs.CELL - 13), max(tip[1], 9))
    def quad(a, b, c, d, al, col=pale): fx_p.poly([a, b, c, d], col, al)
    for t in P['fx']:
        kk = t[0]
        if kk == 'arc':
            mp = g.plane(cam, ws, phi, K['sho']); sho = K['sho']; Rr = gs.dist(sho, K['fh']) + gs.WLEN.get(S['weapon'], 6) * .8; n_ = 18; o_ = []; i_ = []
            for i in range(n_ + 1):
                a = math.radians(t[1] + (t[2] - t[1]) * i / n_); wd = 3.6 * math.sin(math.pi * (i + .5) / (n_ + 1)) ** .6 + .3
                o_.append(tuple(c * k for c in mp(sho[0] + (Rr + .6) * math.sin(a), sho[1] + (Rr + .6) * math.cos(a)))); i_.append(tuple(c * k for c in mp(sho[0] + (Rr - wd) * math.sin(a), sho[1] + (Rr - wd) * math.cos(a))))
            for i in range(n_): quad(o_[i], o_[i + 1], i_[i + 1], i_[i], int(60 + 190 * i / n_))
            for i in range(n_): fx_p.line(o_[i], o_[i + 1], (255, 255, 255), .35, int(90 + 160 * i / n_))
        elif kk == 'streak':
            mp = g.plane(cam, ws, phi, K['sho']); hand = K['fh']
            for off in (-3.2, 3.2):
                a_ = tuple(c * k for c in mp(hand[0] - 8, hand[1] + off)); b_ = tuple(c * k for c in mp(tip[0] - 3, hand[1] + off)); fx_p.line(a_, b_, pale, .55, 170)
                fx_p.line(a_, tuple((a_[i] * 2 + b_[i]) / 3 for i in range(2)), (255, 255, 255), .3, 220)
        elif kk == 'shock':
            cx_, cy_ = [v * k for v in cam.scr(cam.world(tip[0] - gs.CX, ws, 0))]; r = 7 + f % 2 * 3
            for rr, al in ((r, 220), (r + 5, 110)): ImageDraw.Draw(fx_p.img).ellipse([cx_ - rr * k, cy_ - rr * g.YS * k, cx_ + rr * k, cy_ + rr * g.YS * k], outline=fx_p.rgba((236, 224, 200), al), width=max(1, int(.9 * k)))
            for i in range(7):
                a = i * math.pi / 3.5 + f; fx_p.dot((cx_ + (r + 2) * math.cos(a) * k, cy_ + ((r + 2) * math.sin(a) * g.YS - 2 - i % 3) * k), .6, (236, 224, 200), 220)
        elif kk == 'sweep':
            R = max(16, 10.4 * S['height'] * .9 + gs.WLEN.get(S['weapon'], 6) * .8); hz = g.prof(K['sho'])[2] - 2; n_ = 18; o_ = []; i_ = []; pl = g.prof(K['pel'])
            for i in range(n_ + 1):
                a = math.radians(t[1] + (t[2] - t[1]) * i / n_); wd = 3.2 * math.sin(math.pi * (i + .5) / (n_ + 1)) ** .6 + .2
                o_.append(tuple(v * k for v in cam0.scr(cam0.world(pl[0] + (R + .5) * math.cos(a), (R + .5) * math.sin(a), hz)))); i_.append(tuple(v * k for v in cam0.scr(cam0.world(pl[0] + (R - wd) * math.cos(a), (R - wd) * math.sin(a), hz))))
            for i in range(n_): quad(o_[i], o_[i + 1], i_[i + 1], i_[i], int(60 + 190 * i / n_))
            for i in range(n_): fx_p.line(o_[i], o_[i + 1], (255, 255, 255), .35, int(90 + 160 * i / n_))
        elif kk == 'pulse':
            pl = g.prof(K['pel']); cx_, cy_ = [v * k for v in cam0.scr(cam0.world(pl[0], 0, 0))]; r = t[1] * S['scale']
            for rr, al in ((r, 230), (r + 5, 110)): ImageDraw.Draw(fx_p.img).ellipse([cx_ - rr * k, cy_ - rr * g.YS * k, cx_ + rr * k, cy_ + rr * g.YS * k], outline=fx_p.rgba(ec, al), width=max(1, int(1.1 * k)))
            fx_p.glow((cx_, cy_), r * .5, ec, 40)
            for i in range(7): a = i * math.pi / 3.5 + f; fx_p.dot((cx_ + (r + 2) * math.cos(a) * k, cy_ + ((r + 2) * math.sin(a) * g.YS - 1 - i % 3) * k), .6, pale, 230)
        elif kk == 'spark_b':
            x, y = S3(*g.vadd(g.prof(K['bh'], -ws), (7, 0, 0)))
            for a_, b_ in (((-4.5, 0), (4.5, 0)), ((0, -4.5), (0, 4.5)), ((-3, -3), (3, 3)), ((-3, 3), (3, -3))): fx_p.line((x + a_[0] * k, y + a_[1] * k), (x + b_[0] * k, y + b_[1] * k), (255, 255, 255), .5, 235)
            fx_p.glow((x, y), 2.4, (255, 240, 200), 140)
        else:       # charge / burst / ring / impact / ash : camera-facing effects anchored to a joint
            if kk == 'impact': x, y = S3(*g.prof((K['sho'][0] + 5, K['sho'][1] - 2)))
            elif kk == 'ash': x, y = S3(*g.prof(K['pel']))
            else: x, y = [v * k for v in g.plane(cam, ws, phi, K['fh'])(*tip)]
            if kk == 'charge':
                r = t[1] + 1.5; fx_p.glow((x, y), r * 1.7, ec, 130); fx_p.dot((x, y), r, ec, 240); fx_p.dot((x - r * .25, y - r * .25), r * .45, (255, 255, 255), 230)
                for i in range(4): a = math.pi / 2 * i + f; fx_p.dot((x + (r + 4) * math.cos(a) * k, y + (r + 4) * math.sin(a) * k), .5, pale)
            elif kk == 'burst':
                for i in range(8): a = math.pi / 4 * i; fx_p.line((x + 3 * math.cos(a) * k, y + 3 * math.sin(a) * k), (x + (7 + i % 2 * 3) * math.cos(a) * k, y + (7 + i % 2 * 3) * math.sin(a) * k), ec, .7, 235)
                fx_p.glow((x, y), 3.4, ec, 140); fx_p.dot((x, y), 2.3, (255, 255, 255))
            elif kk == 'ring':
                for rr, al in ((7, 190), (11, 80)): ImageDraw.Draw(fx_p.img).ellipse([x - rr * k, y - rr * k, x + rr * k, y + rr * k], outline=fx_p.rgba(ec, al), width=max(1, int(.8 * k)))
            elif kk == 'impact':
                for a_, b_ in (((-5, 0), (5, 0)), ((0, -5), (0, 5)), ((-3.6, -3.6), (3.6, 3.6)), ((-3.6, 3.6), (3.6, -3.6))): fx_p.line((x + a_[0] * k, y + a_[1] * k), (x + b_[0] * k, y + b_[1] * k), (255, 255, 255), .6, 240)
                fx_p.glow((x, y), 3, (255, 245, 220), 150)
            elif kk == 'ash':
                for i in range(t[1]): fx_p.dot((x + (-14 + (i * 37) % 28 + (i % 3 - 1)) * k, y + (-3 - ((i * 7) % 6 + 3) * (1 if t[1] < 6 else 1.7) - (i % 4) * 2) * k), .6, (190, 184, 176), 200)

# ----------------------------------------------------------------------------------- sheets
def snap(img, pal):
    import numpy as np
    a = np.array(img); P = np.array(sorted(pal), dtype=np.int32)
    if not len(P): return img
    rgb = a[..., :3].reshape(-1, 3).astype(np.int32); idx = ((rgb[:, None, :] - P[None, :, :]) ** 2).sum(-1).argmin(1)
    out = np.dstack([P[idx].reshape(a.shape[:2] + (3,)).astype(np.uint8), np.where(a[..., 3] >= 112, 255, 0).astype(np.uint8)]); return Image.fromarray(out, 'RGBA')

def build_sheet(S, anim, res=2, mode='smooth'):
    T = look(S); C = g.CELL * res; sheet = Image.new('RGBA', (C * g.NF, C * len(g.DIRS)), (0, 0, 0, 0))
    for r in range(len(g.DIRS)):
        for f in range(g.NF):
            im, pal = render(S, T, anim, f, r * 45, res)
            if mode == 'pixel': im = snap(im, pal)
            sheet.alpha_composite(im, (f * C, r * C))
    return sheet

def anims_for(S):
    return ['idle', 'walk'] + [f'attack{i + 1}' for i in range(len(g.skills_for(S)))] + list(g.EXTRA) + list(g.BODY) + ['hit']

PITCHES = {'': None, 'p16': 16, 'p38': 38}
def main():
    ap = argparse.ArgumentParser(); ap.add_argument('out'); ap.add_argument('ids', nargs='*'); ap.add_argument('--res', type=int, default=2)
    ap.add_argument('--style', default='smooth'); ap.add_argument('--pitches', action='store_true'); ap.add_argument('--anims', default=''); ap.add_argument('--force', action='store_true')
    a = ap.parse_args(); os.makedirs(a.out, exist_ok=True); ids = a.ids or [s['id'] for s in gs.ROSTER]; only = a.anims.split(',') if a.anims else None
    tags = ['', 'p16', 'p38'] if a.pitches else ['']
    for tag in tags:
        g.set_pitch(PITCHES[tag] if PITCHES[tag] else g.E0)
        for S0 in gs.ROSTER:
            if S0['id'] not in ids: continue
            S = g.prep(S0); d = os.path.join(a.out, S['id'], tag); os.makedirs(d, exist_ok=True)
            for an in anims_for(S):
                if only and an not in only: continue
                if os.path.exists(os.path.join(d, an + '.png')) and not a.force: continue      # resumable: pass --force to redo
                build_sheet(S, an, a.res, a.style).save(os.path.join(d, an + '.png'))
            print('done', S['id'], tag or 'base', flush=True)
    g.set_pitch(g.E0)
    for tn, T_ in g.TIERS.items():
        s = g.shadow_img(tn)
        if a.res > 1: s = s.resize((s.width * a.res, s.height * a.res), Image.BILINEAR)
        s.save(os.path.join(a.out, f'shadow_{tn}.png'))
    json.dump(dict(style=a.style, res=a.res, cell_standard=96 * a.res, cell_large=128 * a.res), open(os.path.join(a.out, 'toon_render.json'), 'w'))

if __name__ == '__main__': main()
