#!/usr/bin/env python3
"""Compile the VectorCraft master export into the "Tusche Pixel Symbols" font.

Usage: venv/bin/python -I make_font.py MASTER.svg LAYOUT.json OUT.ttf

Every SVG element named "U+XXXX <name>" (VectorCraft keeps object names as
data-name) becomes the glyph for codepoint XXXX. Its geometry is sampled at
cell centres of the 7x7 slot it sits in, so the font is exactly what the
master shows, cell for cell. Metrics follow Tiny5 (1024 units per em, 8 font
pixels per em): a symbol is 7x7 font pixels from one pixel below the
baseline to one above the caps, with one pixel of space on the right.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

svg_path, layout_path, out_path = sys.argv[1:4]
layout = json.load(open(layout_path))
CELL, GRID, PITCH = layout["cell"], layout["grid"], layout["pitch"]
UPM, PX = 1024, 128
import os
_HERE = os.path.dirname(os.path.abspath(__file__))
TINY5 = next(p for p in (os.path.join(_HERE, "..", "fonts", "Tiny5-Regular.ttf"),
                         os.path.expanduser("~/.local/share/fonts/tiny5/Tiny5-Regular.ttf")) if os.path.exists(p))

NUM = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def parse_transform(t):
    m = [1, 0, 0, 1, 0, 0]
    for name, args in re.findall(r"(\w+)\s*\(([^)]*)\)", t or ""):
        v = [float(a) for a in NUM.findall(args)]
        if name == "translate":
            n = [1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0]
        elif name == "matrix":
            n = v
        elif name == "scale":
            n = [v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0]
        else:
            raise SystemExit(f"unsupported transform {name}")
        a, b, c, d, e, f = m
        m = [a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3],
             b * n[2] + d * n[3], a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f]
    return m


def apply(m, x, y):
    return m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]


def polygons_of_path(d):
    """Absolute/relative M, L, H, V, Z polygons (all VectorCraft writes for grid art)."""
    polys, cur, x, y, sx, sy = [], None, 0.0, 0.0, 0.0, 0.0
    for cmd, args in re.findall(r"([MmLlHhVvZz])([^MmLlHhVvZz]*)", d):
        v = [float(a) for a in NUM.findall(args)]
        if cmd in "Zz":
            if cur:
                polys.append(cur)
            cur, x, y = None, sx, sy
            continue
        i = 0
        while i < len(v) or (cmd in "Mm" and i == 0):
            if cmd in "Mm":
                x, y = (v[i], v[i + 1]) if cmd == "M" else (x + v[i], y + v[i + 1])
                if cur:
                    polys.append(cur)
                cur, sx, sy = [(x, y)], x, y
                i += 2
                cmd = "L" if cmd == "M" else "l"
            elif cmd in "Ll":
                x, y = (v[i], v[i + 1]) if cmd == "L" else (x + v[i], y + v[i + 1])
                cur.append((x, y)); i += 2
            elif cmd in "Hh":
                x = v[i] if cmd == "H" else x + v[i]
                cur.append((x, y)); i += 1
            elif cmd in "Vv":
                y = v[i] if cmd == "V" else y + v[i]
                cur.append((x, y)); i += 1
    if cur:
        polys.append(cur)
    return polys


def winding(polys, px, py):
    w = 0
    for poly in polys:
        for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1]):
            if y1 <= py < y2 and (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) > 0:
                w += 1
            elif y2 <= py < y1 and (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) < 0:
                w -= 1
    return w


ns = {"svg": "http://www.w3.org/2000/svg"}
root = ET.parse(svg_path).getroot()
glyph_cells, names = {}, {}


def walk(el, m):
    m = m
    if el.get("transform"):
        a = parse_transform(el.get("transform"))
        m = [m[0] * a[0] + m[2] * a[1], m[1] * a[0] + m[3] * a[1], m[0] * a[2] + m[2] * a[3],
             m[1] * a[2] + m[3] * a[3], m[0] * a[4] + m[2] * a[5] + m[4], m[1] * a[4] + m[3] * a[5] + m[5]]
    tag = el.tag.split("}")[-1]
    label = el.get("data-name") or ""
    hit = re.match(r"U\+([0-9A-Fa-f]{4,6})\s+(.*)", label)
    if hit and tag in ("path", "rect"):
        if tag == "rect":
            x, y = float(el.get("x", 0)), float(el.get("y", 0))
            w, h = float(el.get("width")), float(el.get("height"))
            polys = [[(x, y), (x + w, y), (x + w, y + h), (x, y + h)]]
        else:
            polys = polygons_of_path(el.get("d"))
        polys = [[apply(m, px, py) for px, py in p] for p in polys]
        xs = [p[0] for poly in polys for p in poly]
        ys = [p[1] for poly in polys for p in poly]
        slot_x = int(((min(xs) + max(xs)) / 2) // (PITCH * CELL))
        slot_y = int(((min(ys) + max(ys)) / 2) // (PITCH * CELL))
        ox, oy = (1 + slot_x * PITCH) * CELL, (1 + slot_y * PITCH) * CELL
        cells = [[winding(polys, ox + (c + 0.5) * CELL, oy + (r + 0.5) * CELL) != 0
                  for c in range(GRID)] for r in range(GRID)]
        cp = int(hit.group(1), 16)
        if cp in glyph_cells:
            raise SystemExit(f"U+{cp:X} appears twice in the master")
        glyph_cells[cp], names[cp] = cells, hit.group(2).strip()
    for child in el:
        walk(child, m)


walk(root, [1, 0, 0, 1, 0, 0])
if not glyph_cells:
    raise SystemExit("no named symbols found in the SVG")

tiny = TTFont(TINY5)
order = [".notdef", "space"] + [f"u{cp:04X}" for cp in sorted(glyph_cells)]
glyphs, metrics = {}, {}

pen = TTGlyphPen(None)
glyphs[".notdef"] = pen.glyph(); metrics[".notdef"] = (6 * PX, 0)
pen = TTGlyphPen(None)
glyphs["space"] = pen.glyph(); metrics["space"] = (4 * PX, 0)
for cp in sorted(glyph_cells):
    pen = TTGlyphPen(None)
    cells = glyph_cells[cp]
    for r in range(GRID):
        c = 0
        while c < GRID:
            if cells[r][c]:
                s = c
                while c < GRID and cells[r][c]:
                    c += 1
                x0, x1 = s * PX, c * PX
                # row 0 spans 5..6 font px, row 6 spans -1..0: centred on the 5-px caps
                y1 = (6 - r) * PX
                y0 = y1 - PX
                pen.moveTo((x0, y0)); pen.lineTo((x0, y1)); pen.lineTo((x1, y1)); pen.lineTo((x1, y0))
                pen.closePath()
            else:
                c += 1
    name = f"u{cp:04X}"
    glyphs[name] = pen.glyph()
    cols = [c for r in range(GRID) for c in range(GRID) if cells[r][c]]
    metrics[name] = (8 * PX, min(cols) * PX if cols else 0)

fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(order)
fb.setupCharacterMap({32: "space", **{cp: f"u{cp:04X}" for cp in glyph_cells}})
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics(metrics)
hh = tiny["hhea"]
fb.setupHorizontalHeader(ascent=hh.ascent, descent=hh.descent)
fb.setupNameTable({
    "familyName": "Tusche Pixel Symbols", "styleName": "Regular",
    "uniqueFontIdentifier": "Tusche Pixel Symbols Regular 1.0",
    "fullName": "Tusche Pixel Symbols", "psName": "TuschePixelSymbols-Regular",
    "version": "Version 1.000",
    "copyright": "Tusche pixel symbols, drawn in VectorCraft for the Tusche pixel style (2026). "
                 "Some bitmaps adapted from YAMI (MIT, YAMI contributors).",
    "licenseDescription": "Private use with the Tusche Bar and Island.",
})
os2 = tiny["OS/2"]
fb.setupOS2(sTypoAscender=os2.sTypoAscender, sTypoDescender=os2.sTypoDescender,
            sTypoLineGap=os2.sTypoLineGap, usWinAscent=os2.usWinAscent, usWinDescent=os2.usWinDescent,
            sCapHeight=5 * PX, sxHeight=4 * PX, fsType=0, usWeightClass=400)
fb.setupPost()
fb.font["head"].flags |= 1 << 3  # integer ppem scaling
fb.save(out_path)
print(json.dumps({"glyphs": len(glyph_cells), "out": out_path}))
