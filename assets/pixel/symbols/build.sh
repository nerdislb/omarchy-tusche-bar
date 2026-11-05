#!/bin/bash
# Rebuild ../fonts/TuschePixelSymbols.ttf and Tusche Pixel (Tiny5 + symbols)
# from the VectorCraft master.
#
#   build.sh            master (edited in VectorCraft) -> SVG -> font
#   build.sh --redraw   glyphs.json (from build_glyphs.py) -> new master first
#
# Needs vectorcraft-cli and a Python with fontTools (FONTTOOLS_PYTHON, default
# python3). Every symbol is a path named "U+XXXX <nerd name>" on a 7x7 grid of
# 8-px cells; the font samples each cell's centre, so keep edits on the grid.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
py="${FONTTOOLS_PYTHON:-python3}"
work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT
if [[ ${1:-} == --redraw ]]; then
  python3 -I "$here/build_glyphs.py" "$here/codepoints.json" "$here/glyphs.json"
  python3 -I "$here/vc_draw.py" "$here/glyphs.json" "$work/out"
  cp "$work/out/tusche-pixel-symbols.vectorcraft" "$work/out/tusche-pixel-symbols.svg" \
     "$work/out/tusche-pixel-symbols.png" "$work/out/layout.json" "$here/"
fi
vectorcraft-cli convert "$here/tusche-pixel-symbols.vectorcraft" "$work/master.svg" >/dev/null
"$py" -I "$here/make_font.py" "$work/master.svg" "$here/layout.json" "$here/../fonts/TuschePixelSymbols.ttf"
# one family with Tiny5: no symbol depends on Qt's font fallback
"$py" -I "$here/merge_font.py" "$here/../fonts"
