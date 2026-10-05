import sys, json
from PIL import Image, ImageDraw, ImageFont
import gen_iso as g
cid = sys.argv[1]; anim_cols = [('idle', 0), ('walk', 0), ('walk', 2), ('walk', 4), ('attack', 1), ('attack', 3), ('attack', 4)]
Z = 2; PAD = 0
W = len(anim_cols) * g.CELL * Z; H = len(g.DIRS) * g.CELL * Z
bg = Image.new('RGBA', (W + 56, H), (26, 26, 32, 255)); dr = ImageDraw.Draw(bg)
shadow = Image.open('out/shadow_standard.png')
for r, dn in enumerate(g.DIRS):
    dr.text((6, r * g.CELL * Z + g.AY * Z - 6), dn, fill=(200, 160, 100))
    for c, (an, fi) in enumerate(anim_cols):
        sheet = Image.open(f'out/{cid}/{an}.png')
        cell = Image.new('RGBA', (g.CELL, g.CELL), (0, 0, 0, 0))
        # tile diamond 64x32 centred on anchor
        td = ImageDraw.Draw(cell); ax, ay = g.AX, g.AY
        td.polygon([(ax, ay - 16), (ax + 32, ay), (ax, ay + 16), (ax - 32, ay)], outline=(60, 62, 76, 255), fill=(34, 36, 44, 255))
        cell.alpha_composite(shadow)
        cell.alpha_composite(sheet.crop((fi * g.CELL, r * g.CELL, (fi + 1) * g.CELL, (r + 1) * g.CELL)))
        cell = cell.resize((g.CELL * Z, g.CELL * Z), Image.NEAREST)
        bg.alpha_composite(cell, (56 + c * g.CELL * Z, r * g.CELL * Z))
bg.convert('RGB').save(f'out/{cid}_preview.png'); print(bg.size)
