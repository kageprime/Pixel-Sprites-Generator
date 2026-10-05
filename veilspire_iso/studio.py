#!/usr/bin/env python3
"""Veilspire Studio - local web UI over the real generators (gen_iso, gen_pitches, audit, build).
Usage (from veilspire_iso/):  python3 studio.py [port]   ->  open http://localhost:8765
Custom/edited characters live in custom_roster.json; the generator scripts themselves are never modified."""
import sys, os, io, re, json, base64, time, subprocess, threading, traceback
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import gen_sprites as gs, gen_iso as g, gen_pitches as gp

LOCK = threading.Lock(); CUSTOM = os.path.join(HERE, 'custom_roster.json')
BUILTIN = [dict(s) for s in gs.ROSTER]; BUILTIN_OVR = dict(g.OVR)
COLORS = ('tone', 'pri', 'sec', 'acc', 'emi'); BODY_ONLY = ('launcher', 'air', 'plunge')
_skills = g.skills_for
g.skills_for = lambda S: [k for k in S['skills'] if k] if any(S.get('skills') or []) else _skills(S)   # per-character skill override

def fix(c):
    c = dict(c)
    for k in COLORS:
        if k in c: c[k] = tuple(int(v) for v in c[k])
    for k in ('thick', 'height'):
        if k in c: c[k] = float(c[k])
    c['id'] = re.sub(r'\W+', '_', (c.get('id') or c.get('name', 'new')).lower()).strip('_') or 'new'
    return c

def load_custom(): return json.load(open(CUSTOM)) if os.path.exists(CUSTOM) else []

def sync():
    """gs.ROSTER = built-ins, overridden/extended by custom_roster.json"""
    ros = {s['id']: dict(s) for s in BUILTIN}; g.OVR.clear(); g.OVR.update(BUILTIN_OVR)
    for c in map(fix, load_custom()):
        ros[c['id']] = gs.spec(**{**ros.get(c['id'], {}), **c})
        if c.get('big'): g.OVR[c['id']] = dict(tier='large', scale=1.2)
    gs.ROSTER[:] = list(ros.values())

def _render(c, anim, pitch):
    for k, v in (c.get('moves') or {}).items():
        if len(v) != 6: raise ValueError(f'move "{k}" needs exactly 6 poses, got {len(v)}')
        g.TABLES[k] = [dict(p) for p in v]; g.EXTRA['move_' + k] = k; g.PHI_STYLE.setdefault(k, [10] * 6)
    if c.get('big'): g.OVR[c['id']] = dict(tier='large', scale=1.2)
    g.set_pitch(pitch)
    try: S = g.prep(gs.spec(**c)); return g.build_sheet(S, anim), S
    finally: g.set_pitch(g.E0)

def png(im): b = io.BytesIO(); im.save(b, 'PNG'); return base64.b64encode(b.getvalue()).decode()

def state():
    with LOCK: sync()
    pick = lambda k: sorted({s[k] for s in BUILTIN})
    return dict(roster=gs.ROSTER, custom=[c['id'] for c in map(fix, load_custom())], dirs=g.DIRS, anims=gp.ALL,
                meta={k: list(v) for k, v in g.ANIM_META.items()}, tables={**g.TABLES, **g.BODY},
                styles=[k for k in g.TABLES if k not in BODY_ONLY], pitches=dict(base=g.E0, p16=16, p38=38),
                opts=dict(role=pick('role'), rank=list(gs.RANK_COL), helm=pick('helm'), chest=pick('chest'), legs=pick('legs'),
                          back=pick('back'), weapon=list(g.WEAPON_SKILLS), offhand=pick('offhand'), aura=['none'] + list(gs.AURA)))

def render(d):
    c = fix(d['char']); t = time.time()
    with LOCK:
        sync(); im, S = _render(c, d['anim'], float(d.get('pitch', g.E0)))
    return dict(png=png(im), cell=g.CELL, ax=g.AX, ay=g.AY, ms=int((time.time() - t) * 1000))

def save(d):
    c = fix(d['char']); rows = [x for x in load_custom() if fix(x)['id'] != c['id']] + [c]
    json.dump(rows, open(CUSTOM, 'w'), indent=1); return dict(id=c['id'])

def delete(d):
    cid = fix(d['char'])['id']; json.dump([x for x in load_custom() if fix(x)['id'] != cid], open(CUSTOM, 'w'), indent=1); return dict(ok=1)

def export(d):
    """Writes <id>/<anim>.png (+p16/p38) and updates veilspire_iso.json via the real generator mains."""
    c = fix(d['char']); save(d); t = time.time(); made = []
    with LOCK:
        sync(); argv = sys.argv; sys.argv = ['studio', HERE, c['id']]
        try:
            g.main(); made.append('base sheets')
            if d.get('pitches'): gp.main(); made.append('p16 + p38 sheets')
            for k in (c.get('moves') or {}):
                im, _ = _render(c, 'move_' + k, g.E0); im.save(f"{HERE}/{c['id']}/move_{k}.png"); made.append('move_' + k)
        finally: sys.argv = argv
    return dict(log=f"{c['id']}: {', '.join(made)} in {int(time.time() - t)}s")

def run(d):
    cmd, cwd = {'audit': ([sys.executable, 'audit_sprites.py', '.'], HERE),
                'build': ([sys.executable, 'build.py'], os.path.join(HERE, '..', 'source'))}[d['cmd']]
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True); return dict(log=(r.stdout + r.stderr)[-2500:])

ROUTES = dict(render=render, save=save, delete=delete, export=export, run=run)

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, code, body, ct='application/json'):
        b = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code); self.send_header('Content-Type', ct); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        if self.path == '/api/state': return self.send(200, state())
        if self.path in ('/', '/index.html'): return self.send(200, open(f'{HERE}/studio.html', 'rb').read(), 'text/html; charset=utf-8')
        self.send(404, {'error': 'not found'})
    def do_POST(self):
        try: self.send(200, ROUTES[self.path[5:]](json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')))
        except Exception as e: traceback.print_exc(); self.send(500, {'error': str(e)})

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print(f'Veilspire Studio -> http://localhost:{port}   (Ctrl+C to stop)'); ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
