#!/usr/bin/env python3
"""Merge Tiny5 and Tusche Pixel Symbols into one family, "Tusche Pixel".

Usage: fonttools-python -I merge_font.py FONTS_DIR

Reads FONTS_DIR/Tiny5-Regular.ttf and FONTS_DIR/TuschePixelSymbols.ttf, writes
FONTS_DIR/TuschePixel-{Regular,Bold}.ttf and FONTS_DIR/Tiny5-Bold.ttf. The Bold
files carry the Regular glyphs: Tiny5's own bold (wght 700) grows its pixels
off the grid and blurs, and a font without a Bold face makes Qt smear a
synthetic one. So bold text stays exactly as crisp as regular text. One family holds letters and
symbols, so Qt never has to pick a fallback for a symbol (its fallback choice
for the first text it lays out is not reliable). Both inputs use 1024 units
per em and the same 8-px grid. The result is under the SIL OFL 1.1 like Tiny5
(no Reserved Font Name); the symbols are our own drawings, some after YAMI (MIT).
"""
import os
import sys

from fontTools.merge import Merger
from fontTools.ttLib import TTFont

fonts = sys.argv[1]
symbols = os.path.join(fonts, "TuschePixelSymbols.ttf")


def set_style(font, family, style, extra=""):
    name = font["name"]
    for rec in list(name.names):
        if rec.nameID in (16, 17, 21, 22, 25) or (rec.platformID == 1 and rec.nameID in (1, 2, 3, 4, 6)):
            name.removeNames(nameID=rec.nameID, platformID=rec.platformID)
    ps = family.replace(" ", "") + "-" + style
    name.setName(family, 1, 3, 1, 0x409)
    name.setName(style, 2, 3, 1, 0x409)
    name.setName(ps + extra, 3, 3, 1, 0x409)
    name.setName(family if style == "Regular" else f"{family} {style}", 4, 3, 1, 0x409)
    name.setName(ps, 6, 3, 1, 0x409)
    os2 = font["OS/2"]
    bold = style == "Bold"
    os2.usWeightClass = 700 if bold else 400
    os2.fsSelection = (os2.fsSelection & ~0b1100001) | (0b100000 if bold else 0b1000000)
    font["head"].macStyle = 1 if bold else 0


# Tiny5 Bold with the Regular glyphs
tiny = TTFont(os.path.join(fonts, "Tiny5-Regular.ttf"))
set_style(tiny, "Tiny5", "Bold", ";Regular glyphs as Bold")
tiny.save(os.path.join(fonts, "Tiny5-Bold.ttf"))

merged = Merger().merge([os.path.join(fonts, "Tiny5-Regular.ttf"), symbols])
merged["name"].setName("Tiny5 copyright 2022-2024 The Tiny5 Project Authors (github.com/Gissio/font_tiny5); "
                       "symbols drawn for the Tusche pixel style, some after YAMI (MIT).", 0, 3, 1, 0x409)
merged["name"].setName("SIL Open Font License 1.1", 13, 3, 1, 0x409)
for style in ("Regular", "Bold"):
    set_style(merged, "Tusche Pixel", style, ";Tiny5 + Tusche Pixel Symbols")
    out = os.path.join(fonts, f"TuschePixel-{style}.ttf")
    merged.save(out)
    cm = merged.getBestCmap()
    print(out, len(cm), "codepoints", "symbols" if 0xF009A in cm else "NO SYMBOLS")
