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

With FONTS_DIR/DepartureMono-Regular.otf and FONTS_DIR/TuscheDepartureSymbols.ttf
(the same symbols on Departure Mono's 11-px grid) it also writes
FONTS_DIR/TuscheDeparture-{Regular,Bold}.ttf, "Tusche Departure": Departure Mono's
letters (outlines converted to TrueType, exact for its square pixels) plus the
symbols. SIL OFL 1.1 like Departure Mono (no Reserved Font Name). Departure Mono
has no bold, so Bold carries the Regular glyphs here as well.
"""
import os
import sys

from fontTools.merge import Merger
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable

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


# ------------------------------------------------------------ Tusche Departure

def to_truetype(font):
    """CFF outlines to glyf, as fontTools' otf2ttf snippet does. Departure Mono
    draws only straight edges on its pixel grid, so nothing is approximated."""
    order = font.getGlyphOrder()
    glyph_set = font.getGlyphSet()
    glyphs = {}
    for name in order:
        pen = TTGlyphPen(glyph_set)
        glyph_set[name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        glyphs[name] = pen.glyph()
    font["loca"] = newTable("loca")
    font["glyf"] = glyf = newTable("glyf")
    glyf.glyphOrder = order
    glyf.glyphs = glyphs
    del font["CFF "]
    glyf.compile(font)
    for name in order:
        width = font["hmtx"][name][0]
        font["hmtx"][name] = (width, getattr(glyphs[name], "xMin", 0) or 0)
    maxp = newTable("maxp")
    maxp.tableVersion = 0x00010000
    for key in ("maxZones",):
        setattr(maxp, key, 1)
    for key in ("maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs",
                "maxStackElements", "maxSizeOfInstructions", "maxComponentElements"):
        setattr(maxp, key, 0)
    font["maxp"] = maxp
    maxp.compile(font)
    post = font["post"]
    post.formatType = 2.0
    post.extraNames, post.mapping, post.glyphOrder = [], {}, order
    font.sfntVersion = "\000\001\000\000"
    font["head"].flags |= 1 << 3  # integer ppem scaling


def add_symbols(font, symbols_font):
    """The symbols' glyphs and codepoints into the letters' font; a codepoint
    the letters already draw keeps the letters' glyph."""
    have = font.getBestCmap()
    order = list(font.getGlyphOrder())
    glyf, hmtx = font["glyf"], font["hmtx"]
    added = {}
    for cp, name in sorted(symbols_font.getBestCmap().items()):
        if cp in have:
            continue
        new = "tusche." + name
        glyf.glyphs[new] = symbols_font["glyf"][name]
        hmtx.metrics[new] = symbols_font["hmtx"][name]
        order.append(new)
        added[cp] = new
    glyf.glyphOrder = order
    font.setGlyphOrder(order)
    mapping = {**have, **added}
    cmap = font["cmap"]
    for table in cmap.tables:
        if table.isUnicode() and table.format == 4:
            table.cmap.update({cp: n for cp, n in added.items() if cp <= 0xFFFF})
    for platform, encoding in ((3, 10), (0, 4)):
        if not any(t.platformID == platform and t.platEncID == encoding for t in cmap.tables):
            table = CmapSubtable.newSubtable(12)
            table.platformID, table.platEncID, table.language = platform, encoding, 0
            table.cmap = dict(mapping)
            cmap.tables.append(table)
        else:
            for t in cmap.tables:
                if t.platformID == platform and t.platEncID == encoding:
                    t.cmap.update(added)
    font["OS/2"].recalcUnicodeRanges(font)
    return len(added)


departure = os.path.join(fonts, "DepartureMono-Regular.otf")
departure_symbols = os.path.join(fonts, "TuscheDepartureSymbols.ttf")
if os.path.exists(departure) and os.path.exists(departure_symbols):
    font = TTFont(departure)
    to_truetype(font)
    count = add_symbols(font, TTFont(departure_symbols))
    font["name"].setName("Departure Mono copyright 2022-2024 Helena Zhang (helenazhang.com); "
                         "symbols drawn for the Tusche pixel style, some after YAMI (MIT).", 0, 3, 1, 0x409)
    font["name"].setName("SIL Open Font License 1.1", 13, 3, 1, 0x409)
    font["name"].setName("https://openfontlicense.org", 14, 3, 1, 0x409)
    for style in ("Regular", "Bold"):
        set_style(font, "Tusche Departure", style, ";Departure Mono + Tusche Pixel Symbols")
        out = os.path.join(fonts, f"TuscheDeparture-{style}.ttf")
        font.save(out)
        font = TTFont(out)
        cm = font.getBestCmap()
        print(out, len(cm), "codepoints,", count, "symbols", "" if 0xF009A in cm else "NO SYMBOLS")
