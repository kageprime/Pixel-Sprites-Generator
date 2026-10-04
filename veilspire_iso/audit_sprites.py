#!/usr/bin/env python3
"""Veilspire - sprite inventory. Compares what the roster NEEDS with what exists on disk and what the page actually loads.
Usage: python3 audit_sprites.py [ROOT=.]   -> sprite_inventory.json + sprite_inventory.md   (re-run after every generator change)"""
import sys, os, json, re
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_sprites as gs, gen_iso as g
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
PITCH_TAGS = ['p16', 'p38']
BUILD = open(os.path.join(ROOT, '..', 'source', 'build.py')).read() if os.path.exists(os.path.join(ROOT, '..', 'source', 'build.py')) else ''
IN_PAGE = {c for c in ('bram_holt', 'cinder', 'orin_vale', 'floor_voice', 'the_carapace') if f"{c}/" in BUILD or c in BUILD}
CORE = ['idle', 'walk', 'jump', 'hit', 'launch', 'tumble', 'knockdown', 'getup', 'launcher', 'air1', 'plunge', 'guard', 'dash', 'death', 'victory', 'hit_heavy', 'hit_back', 'block_hit']
def check(path, cell):
    if not os.path.exists(path): return 'missing'
    im = Image.open(path).convert('RGBA')
    if im.size != (cell * g.NF, cell * 8): return f'bad size {im.size}'
    a = im.getchannel('A'); empty = [(r, f) for r in range(8) for f in range(g.NF) if not a.crop((f*cell, r*cell, (f+1)*cell, (r+1)*cell)).getbbox()]
    return f'{len(empty)} empty frames' if empty else 'ok'
inv = []; total = ok = 0
for S0 in gs.ROSTER:
    S = g.prep(S0); cell = g.CELL; need = ['attack%d' % (i + 1) for i in range(len(g.skills_for(S)))] + CORE
    d = os.path.join(ROOT, S['id']); sheets = {an: check(os.path.join(d, an + '.png'), cell) for an in need}
    pit = {t: sum(os.path.exists(os.path.join(d, t, an + '.png')) for an in need) for t in PITCH_TAGS}
    n_ok = sum(v == 'ok' for v in sheets.values()); total += len(need); ok += n_ok
    inv.append(dict(id=S['id'], name=S['name'], role=S['role'], weapon=S['weapon'], cell=cell, ground_skills=g.skills_for(S), need=len(need), ok=n_ok,
                    missing=[a for a, v in sheets.items() if v != 'ok'], pitch_sheets=pit, in_page=S['id'] in IN_PAGE, issues={a: v for a, v in sheets.items() if v not in ('ok', 'missing')}))
json.dump(dict(frames=g.NF, directions=8, total_needed=total, total_ok=ok, characters=inv), open(os.path.join(ROOT, 'sprite_inventory.json'), 'w'), indent=1)
L = ['# Sprite inventory (generated)', '', f'{ok}/{total} base sheets present and valid. Each sheet = 8 facings x {g.NF} frames.', '',
     '| Character | Role | Weapon | Cell | Base sheets | Missing | Low p16 | High p38 | In page |', '|---|---|---|---|---|---|---|---|---|']
for c in inv: L.append(f"| {c['name']} | {c['role']} | {c['weapon']} | {c['cell']} | {c['ok']}/{c['need']} | {', '.join(c['missing']) or '-'} | {c['pitch_sheets']['p16']} | {c['pitch_sheets']['p38']} | {'yes' if c['in_page'] else 'no'} |")
open(os.path.join(ROOT, 'sprite_inventory.md'), 'w').write('\n'.join(L) + '\n'); print('\n'.join(L))
