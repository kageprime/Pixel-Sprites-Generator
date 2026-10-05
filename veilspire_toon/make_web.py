#!/usr/bin/env python3
"""Veilspire toon web set: quantize OUT/ sheets (smooth 2x anime) down to
256-color PNGs under web/, preserving the <char>/[p16|p38/]<anim>.png layout.

Same quantization as source/build.py's embed step, but written as files so
combat.html can lazy-load the toon skin per fight instead of embedding 222 MB.
Run from veilspire_toon/. Output: web/ (~40 MB, Vercel-safe under 100 MB).
OUT/ itself stays local-only (gitignored, vercelignored)."""
import os
from PIL import Image

SRC = 'veilspire_iso/OUT'
DST = 'web'
SKIP = {'toon_render.json'}


def conv(src, dst):
    im = Image.open(src).convert('RGBA')
    q = im.quantize(256, method=Image.FASTOCTREE, dither=Image.NONE)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    q.save(dst, 'PNG', optimize=True)


def main():
    n = 0
    for dp, _dn, fn in os.walk(SRC):
        for f in sorted(fn):
            if f in SKIP or not f.endswith('.png'):
                continue
            s = os.path.join(dp, f)
            d = os.path.join(DST, os.path.relpath(s, SRC))
            if os.path.exists(d):
                n += 1
                continue
            conv(s, d)
            n += 1
    total = sum(
        os.path.getsize(os.path.join(dp, f))
        for dp, _dn, fn in os.walk(DST) for f in fn
    )
    print(f'{n} sheets, web/ = {total / 1048576:.1f} MB')


if __name__ == '__main__':
    main()
