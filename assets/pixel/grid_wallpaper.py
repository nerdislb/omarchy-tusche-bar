#!/usr/bin/env python3
"""Dot-grid wallpaper for a theme palette, as SVG (VectorCraft renders it).

  grid_wallpaper.py <colors.toml> <out.svg> [width height]
"""
import sys
import tomllib


c = tomllib.load(open(sys.argv[1], "rb"))
W, H = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1920, 1080)
STEP, DOT = 24, 2
dark = c.get("mode", "dark") == "dark"
bg, fg, acc = c["background"], c["foreground"], c["accent"]
dot_a = 0.075 if dark else 0.11
glow_a = 0.16 if dark else 0.12
out = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
       '<defs>',
       f'<radialGradient id="glow" cx="{W*0.86:.0f}" cy="{H*0.96:.0f}" r="{W*0.55:.0f}" gradientUnits="userSpaceOnUse">',
       f'<stop offset="0" stop-color="{acc}" stop-opacity="{glow_a}"/>',
       f'<stop offset="1" stop-color="{acc}" stop-opacity="0"/></radialGradient>',
       '</defs>',
       f'<rect id="paper" width="{W}" height="{H}" fill="{bg}"/>',
       f'<rect id="glow-field" width="{W}" height="{H}" fill="url(#glow)"/>',
       f'<g id="dots" fill="{fg}" fill-opacity="{dot_a}">']
off = STEP // 2
for y in range(off, H, STEP):
    for x in range(off, W, STEP):
        out.append(f'<rect x="{x}" y="{y}" width="{DOT}" height="{DOT}"/>')
out += ['</g>', '</svg>']
open(sys.argv[2], "w").write("\n".join(out))
