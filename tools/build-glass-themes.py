#!/usr/bin/env python3
"""Build Frost / Smoke from the existing Platin / Chrom frames and palettes.

The glass lives only in shell cards, not in every application window.
Window border geometry, font sizes, compositor blur and hardware settings
are deliberately absent from this generator's overrides.

The glass family carries no chrome (design round 14.10.2026): the metal
family's logo frame, quota rings and meters, hover tube, rim round the
Island's segment and workspace glint all hang on `material.metal`, so the
glass themes have none. Their window-frame glint is the glass one
(`glass.frame`, WindowGlint → GlassFrameGlint): the light a Bevel Lens card
catches as it opens, wide, cool and soft. The frame's own stripes (hyprland.lua)
stay literally Platin's / Chrom's.

Frost and Smoke carry pictures of their own (design round 14.10.2026), not
Platin's and Chrom's: tools/glass-backgrounds/<theme>/ holds the stills in
their order (1- is the theme's default) and preview.png (rendered, not a
capture of the live desktop). Without that folder the base theme's pictures
stay, as before.
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICTURES = ROOT / 'tools' / 'glass-backgrounds'
PAIRS = {
    'frost': ('platin', {
        '#dde0e4': '#e9edf0', '#cdd0d4': '#d8dfe7', '#c0c3c7': '#c8d1dc',
        '#eaedf1': '#f0f5fa', '#27292b': '#171c24', '#414346': '#444c59',
        '#17191b': '#11151b', '#b02614': '#b32525', '#646568': '#515b69',
    }),
    'smoke': ('chrom', {
        '#000000': '#111419', '#090a0b': '#0b1017', '#050505': '#080c12',
        '#111214': '#1b222c', '#e0e0e1': '#f0f3f7', '#a5a6a8': '#b0bac8',
        '#747679': '#a0abb9', '#2c2e32': '#303c4c', '#ff4a2b': '#ff6969',
        '#ff6b50': '#ff7d7d',
    }),
}
# the glass frame glint (see GlassFrameGlint.qml): ms, band (half width), amount (start strength), shade/shadeAmt (the
# bevel shadow beside the band), bloom (soft light outside the frame), tint (the light)
FRAME = {
    'frost': {'ms': 650, 'band': 0.10, 'amount': 0.66, 'shadeAmt': 0.15, 'bloom': 0.8, 'tint': '#ffffff', 'shade': '#3a5675'},
    # Smoke a little quieter than Frost: light on a dark frame reads at once, a pale frame on a pale picture needs more
    'smoke': {'ms': 650, 'band': 0.10, 'amount': 0.56, 'shadeAmt': 0.12, 'bloom': 0.65, 'tint': '#cfe3ff', 'shade': '#03060b'},
}


def own_pictures(name, dst):
    """Replace the pictures (and the preview) inherited from the base theme with the glass pair's own."""
    own = PICTURES / name
    stills = sorted(own.glob('*.jpg')) if own.is_dir() else []
    if not stills:
        return 0
    shutil.rmtree(dst / 'backgrounds', ignore_errors=True)
    (dst / 'backgrounds').mkdir()
    for p in stills:
        shutil.copy2(p, dst / 'backgrounds' / p.name)
    if (own / 'preview.png').exists():
        shutil.copy2(own / 'preview.png', dst / 'preview.png')
    return len(stills)


def build(name, base, colors):
    src = ROOT / 'themes' / base
    dst = ROOT / 'themes' / name
    shutil.copytree(src, dst, dirs_exist_ok=True)
    pictures = own_pictures(name, dst)
    for p in dst.iterdir():
        # Frames are literally retained from the mature metal family.
        if p.name == 'hyprland.lua' or p.suffix not in ('.toml', '.lua'):
            continue
        txt = re.sub(r'#[a-fA-F0-9]{6}\b', lambda m: colors.get(m[0].lower(), m[0]), p.read_text())
        if p.name == 'colors.toml':
            txt = re.sub(r'^#.*\n', f'# {name.title()} — Bevel Lens glass family. Red is the signal colour.\n', txt, count=1)
        if p.name == 'shell.bar.toml':
            txt = re.sub(r'(?m)^(background-alpha\s*=\s*)[\d.]+', r'\g<1>0.82', txt)
        p.write_text(txt)
    light = name == 'frost'
    mat = json.loads((src / 'bar-material.json').read_text())
    mat['family'] = 'glass'
    mat['glass'] = {
        'enabled': True, 'spring': True, 'light': light,
        'tint': '#f0f5fa' if light else '#0e1116',
        'backing': 0.42 if light else 0.46, 'blur': 18 if light else 22,
        'bevel': 9, 'bend': 4, 'omega': 24.5, 'damping': 0.78,
        'frame': FRAME[name],
    }
    mat['edge'] = {
        'kind': 'dry',
        'line': {'color': '#ffffff' if light else '#c3cedd', 'alpha': 0.55 if light else 0.22, 'width': 1},
        'haze': {'color': '#17202d', 'height': 16, 'stops': [[0, 0.18], [0.5, 0.06], [1, 0]]},
    }
    mat['card'] = {'roll': True, 'halo': {'color': '#101722', 'alpha': 0.23 if light else 0.5, 'blur': 24}}
    mat['tones'] = {'strong': '#171c24' if light else '#f0f3f7'}
    mat['source'] = {'fill': '#171c24' if light else '#f0f3f7', 'text': '#e9edf0' if light else '#111419'}
    # No chrome: the metal block switches on the logo frame, rings, meters, hover tube, segment rim, pulse and the
    # chrome window glint; the glass family has its own glint (glass.frame). GlassSurface replaces the popup rim.
    mat.pop('metal', None)
    (dst / 'bar-material.json').write_text(json.dumps(mat, indent=2) + '\n')
    (dst / '.tusche-papier').write_text('built by tools/build-glass-themes.py (Frost / Smoke)\n')
    return pictures


if __name__ == '__main__':
    for name, (base, colors) in PAIRS.items():
        n = build(name, base, colors)
        print(f'{name}: Bevel Lens, existing {base} frame, ' + (f'{n} pictures of its own' if n else f'the {base} pictures'))
