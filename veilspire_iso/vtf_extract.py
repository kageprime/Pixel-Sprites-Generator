"""Extract arena reference pixels from Source-engine VTFs (read-only input).

Reads Tournament textures from misc/World_Martial_Arts_Tournament.zip
(VTF v7.2, DXT1/DXT5) and writes pixelized PNGs to veilspire_iso/arena/:
  audXX_a.png / audXX_b.png  - crowd billboard frames (~64px, 8 variants)
  bannerN.png                - banner strips (4)
Also prints palette stats for the procedural floor/sky (te_tile, te_Sky).

Usage (from repo root): python veilspirit_iso/vtf_extract.py  (run from veilspire_iso/)
"""
import struct
import zipfile
import os
from PIL import Image, ImageStat

ROOT = os.path.dirname(os.path.abspath(__file__))
ZPATH = os.path.join(ROOT, "..", "misc", "World_Martial_Arts_Tournament.zip")
P = "usermod/materials/models/Dragon Ball/Stage/World Martial Arts Tournament/"
OUT = os.path.join(ROOT, "arena")

ZF = zipfile.ZipFile(ZPATH)


def rgb565(c):
    return ((c >> 11 & 31) * 255 // 31, (c >> 5 & 63) * 255 // 63, (c & 31) * 255 // 31)


def decode_vtf(name):
    """Return full-res RGBA PIL Image from a VTF in the zip."""
    d = ZF.read(P + name)
    w, h = struct.unpack("<2H", d[16:20])
    hires = struct.unpack("<i", d[52:56])[0]
    mip = d[56]
    lores = struct.unpack("<i", d[57:61])[0]
    lw, lh = d[61], d[62]
    is5 = (hires == 15)
    bbl = 16 if lores == 15 else 8
    off = 80 + max(1, (lw + 3) // 4) * max(1, (lh + 3) // 4) * bbl
    tw, th, sizes = w, h, []
    for _ in range(mip):
        sizes.append(max(1, (tw + 3) // 4) * max(1, (th + 3) // 4) * (16 if is5 else 8))
        tw, th = max(1, tw // 2), max(1, th // 2)
    off += sum(sizes[1:])
    raw = d[off:off + sizes[0]]
    assert len(raw) == sizes[0], (name, len(raw), sizes[0])
    img = Image.new("RGBA", (w, h))
    px = img.load()
    bw = (w + 3) // 4
    p = 0
    bl = 16 if is5 else 8
    for by in range((h + 3) // 4):
        for bx in range(bw):
            blk = raw[p:p + bl]
            p += bl
            o = 0
            if is5:
                a0, a1 = blk[0], blk[1]
                bits = int.from_bytes(blk[2:8], "little")
                o = 8
                al = []
                for i in range(16):
                    s = (bits >> (3 * i)) & 7
                    if s == 0:
                        al.append(a0)
                    elif s == 1:
                        al.append(a1)
                    elif a0 > a1:
                        al.append(((8 - s) * a0 + (s - 1) * a1) // 7)
                    elif s < 6:
                        al.append(((6 - s) * a0 + (s - 1) * a1) // 5)
                    else:
                        al.append(0 if s == 6 else 255)
            c0, c1 = struct.unpack("<2H", blk[o:o + 4])
            o += 4
            r0, r1 = rgb565(c0), rgb565(c1)
            if c0 > c1:
                pal = [r0, r1,
                       tuple((2 * a + b) // 3 for a, b in zip(r0, r1)),
                       tuple((a + 2 * b) // 3 for a, b in zip(r0, r1))]
            else:
                pal = [r0, r1, tuple((a + b) // 2 for a, b in zip(r0, r1)), (0, 0, 0)]
            idx = struct.unpack("<I", blk[o:o + 4])[0]
            for i in range(16):
                x, y = bx * 4 + (i % 4), by * 4 + (i // 4)
                if x < w and y < h:
                    code = (idx >> (2 * i)) & 3
                    r, g, b = pal[code]
                    a = al[i] if is5 else (0 if (c0 <= c1 and code == 3) else 255)
                    px[x, y] = (r, g, b, a)
    return img


def pixelize(im, size):
    """Downscale to pixel-art size with sharp pixels kept."""
    small = im.resize((size, size), Image.LANCZOS)
    return small


def signature(im):
    """Diversity signature: mean color + edge/alpha stats."""
    st = ImageStat.Stat(im.convert("RGB"))
    a = ImageStat.Stat(im.getchannel("A")).mean[0]
    return tuple(round(v) for v in st.mean) + (round(a),)


def main():
    os.makedirs(OUT, exist_ok=True)
    # Palette probes (procedural floor/sky reference)
    for name in ("te_tile.vtf", "te_Sky.vtf", "te_RingSide.vtf"):
        im = decode_vtf(name)
        print("palette", name, "mean=", tuple(round(v) for v in ImageStat.Stat(im.convert("RGB")).mean))
    # Crowd: decode all 24 variants, pick 8 most diverse by signature
    cands = []
    for i in range(1, 25):
        im = decode_vtf("te_audience%02d.vtf" % i)
        cands.append((i, im, signature(im)))
    picked, rest = [cands[0]], cands[1:]
    while len(picked) < 8 and rest:
        def dist(c):
            return min(sum((a - b) ** 2 for a, b in zip(c[2], p[2])) for p in picked)
        rest.sort(key=dist, reverse=True)
        picked.append(rest.pop(0))
    picked.sort(key=lambda c: c[0])
    print("picked audience variants:", [c[0] for c in picked])
    for i, im, _ in picked:
        W, H = im.size
        # 2x2 atlas: two poses (top row), each W/2 x H/2
        for f, box in enumerate(((0, 0, W // 2, H // 2), (W // 2, 0, W, H // 2))):
            frame = pixelize(im.crop(box), 64)
            frame.save(os.path.join(OUT, "aud%02d_%s.png" % (i, "ab"[f])))
    # Banners: 4 horizontal strips
    b = decode_vtf("te_banner.vtf")
    W, H = b.size
    for n in range(4):
        strip = pixelize(b.crop((0, H * n // 4, W, H * (n + 1) // 4)).resize((256, 64)), 128)
        strip.save(os.path.join(OUT, "banner%d.png" % n))
    print("wrote", len(os.listdir(OUT)), "files to", OUT)


if __name__ == "__main__":
    main()
