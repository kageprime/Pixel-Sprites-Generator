#!/usr/bin/env python3
"""Veilspire - extra camera pitches. Renders the same 8-facing sheets at lower / higher elevations.
Usage: python3 gen_pitches.py OUT_DIR [char_id ...]   -> OUT_DIR/<char>/p16/<anim>.png, p38/...; shadows; 'pitches' in the JSON.
The shipped pitch (E0 = 26.565 deg, 2:1) stays at OUT_DIR/<char>/<anim>.png, untouched."""
import sys, os, json
import gen_iso as g
PITCHES = {'p16': 16, 'p38': 38}
ALL = ['idle','walk','attack1','attack2','attack3','launcher','air1','plunge','jump','hit','launch','tumble','knockdown','getup','guard','dash','death','victory','hit_heavy','hit_back','block_hit']
def sheets_for(S): return [a for a in ALL if not (a == 'attack3' and len(g.skills_for(S)) < 3)]   # every character gets every pitch
def main():
    out = sys.argv[1] if len(sys.argv) > 1 else 'out'; ids = sys.argv[2:] or [s['id'] for s in g.gs.ROSTER]; rep = {}
    for tag, e in PITCHES.items():
        g.set_pitch(e)
        for S0 in g.gs.ROSTER:
            if S0['id'] not in ids: continue
            S = g.prep(S0); d = f"{out}/{S['id']}/{tag}"; os.makedirs(d, exist_ok=True)
            for an in sheets_for(S):
                sh = g.build_sheet(S, an); sh.save(f'{d}/{an}.png')
                top = sh.getchannel('A').crop((0, 0, sh.width, 1)).getextrema()[1] > 0
                rep[(tag, S['id'], an)] = top
    g.set_pitch(g.E0)
    jp = f'{out}/veilspire_iso.json'; meta = json.load(open(jp))
    meta['pitches'] = dict(base=dict(elevation=round(g.E0, 3), dir=''), **{k: dict(elevation=v, dir=k + '/') for k, v in PITCHES.items()})
    meta['pitch_note'] = 'same layout as the base sheets; sprites for a pitch live in <char>/<dir>/<anim>.png. Never swap pitch mid-pose; swap on a camera cut.'
    json.dump(meta, open(jp, 'w'), indent=2)
    clipped = sorted(k for k, v in rep.items() if v); print('sheets', len(rep), 'touching top edge:', clipped or 'none')
if __name__ == '__main__': main()
