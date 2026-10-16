#!/usr/bin/env python3
"""Build Rooibos / Kandis, the tea pair of the glass family (design round 16.10.2026, "Herbst", recommendation R).

Tea glass is the Frost / Smoke Bevel Lens surface steeped in amber: the same shader, spring, gloss and frame glint
(glass.frame), only the tint, the backing and the colours change. Unlike Frost / Smoke these two are not derived from a
metal base: the window frame is an amber stripe of its own (hyprland.lua, still, 45°, no borderangle turn) with Frost's
soft dark window shadow, warmed; no light focus halo (dropped for Smoke on 15.10.2026).

The palette: browns, honey and one red for the UI; muted secondary colours (sage, Earl Grey blue, hibiscus) colour
only code and terminal output. Every text colour reaches 4.5:1 on its own background (tests/tea.cjs checks it).

tools/tea-backgrounds/<theme>/ holds the pictures in their order (1- is the default) and preview.png (rendered, not a
capture of the live desktop). The pictures are generated (gpt-image-2) and upscaled with Real-ESRGAN x4plus to 1080p.
"""
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PICTURES = ROOT / 'tools' / 'tea-backgrounds'

THEMES = {
    'rooibos': {
        'mode': 'dark',
        'colors': {
            'accent': '#eda55a', 'selection': '#46261b', 'muted': '#a7836c',
            'background': '#1b0e0a', 'dark_background': '#140a07', 'darker_background': '#0d0604', 'lighter_background': '#2a1711',
            'foreground': '#f3e0cd', 'dark_foreground': '#cba78f', 'light_foreground': '#ead2bd', 'bright_foreground': '#fff4e8',
            'red': '#ee7a64', 'orange': '#eda55a', 'yellow': '#e9c47c', 'green': '#adb98c', 'blue': '#a2b4bb', 'cyan': '#93b8aa',
            'magenta': '#d6919a', 'purple': '#c39ab6', 'brown': '#9a5b3e',
            'bright_red': '#f68f79', 'bright_orange': '#f4b773', 'bright_yellow': '#f2d394', 'bright_green': '#c1cba0',
            'bright_blue': '#b6c6cc', 'bright_cyan': '#a9c9bd', 'bright_magenta': '#e2a6ad',
        },
        'bar': {'background': '#1b0e0a', 'alpha': 0.82, 'text': '#cba78f', 'active': '#f4b773'},
        'select': {'background': '#eda55a', 'text': '#1b0e0a'},
        'border': ['#5a2a14', '#f6c98a', '#b8733a', '#2a120a', '#7a3c1c', '#f3b86e', '#9a5a2c', '#2a120a', '#6a321a', '#f6c98a'],
        'inactive': '#2e1912',
        'shadow': 'rgba(0d06032e)',
        'glass': {'tint': '#3b170a', 'backing': 0.55, 'blur': 22, 'gloss': 0.8},
        'frame': {'ms': 650, 'band': 0.10, 'amount': 0.6, 'shadeAmt': 0.12, 'bloom': 0.7, 'tint': '#ffc27a', 'shade': '#0d0603'},
        'edge': {'color': '#e8c49a', 'alpha': 0.22},
        'halo': 0.5,
        'icons': 'Yaru-dark',
        'unlock': ('smoke', '#1b0e0a', '#f6c98a'),
    },
    'kandis': {
        'mode': 'light',
        'colors': {
            'accent': '#9a5216', 'selection': '#f0dbb2', 'muted': '#7f624a',
            'background': '#f7efdf', 'dark_background': '#eee2cc', 'darker_background': '#e2d2b6', 'lighter_background': '#fcf8ef',
            'foreground': '#2d1b10', 'dark_foreground': '#5a3f2a', 'light_foreground': '#24150b', 'bright_foreground': '#140b05',
            'red': '#a63d2c', 'orange': '#9a5216', 'yellow': '#7d5b0b', 'green': '#56673a', 'blue': '#3f5e6a', 'cyan': '#3b6a60',
            'magenta': '#8e4a59', 'purple': '#6c5068', 'brown': '#6b4227',
            'bright_red': '#96331f', 'bright_orange': '#8a4810', 'bright_yellow': '#6e5007', 'bright_green': '#4c5c2c',
            'bright_blue': '#33505c', 'bright_cyan': '#2f5c52', 'bright_magenta': '#7c3d4c',
        },
        'bar': {'background': '#f7efdf', 'alpha': 0.82, 'text': '#5a3f2a', 'active': '#8a4810'},
        'select': {'background': '#87420e', 'text': '#fffaf2'},
        'border': ['#9a5a26', '#fff0d2', '#d39a5c', '#5a3214', '#b07038', '#ffe6bc', '#c88a4c', '#5a3214', '#a8662e', '#fff0d2'],
        'inactive': '#dccab0',
        'shadow': 'rgba(2a170c2a)',
        'glass': {'tint': '#f2d09a', 'backing': 0.54, 'blur': 18, 'gloss': 1.0},
        'frame': {'ms': 650, 'band': 0.10, 'amount': 0.7, 'shadeAmt': 0.16, 'bloom': 0.8, 'tint': '#ffe9c4', 'shade': '#5a3214'},
        'edge': {'color': '#fff6e6', 'alpha': 0.55},
        'halo': 0.34,
        'icons': 'Yaru',
        'unlock': ('frost', '#5a3214', '#fcf3e3'),
    },
}

ORDER = ['accent', 'selection', 'muted', '', 'background', 'dark_background', 'darker_background', 'lighter_background', '',
         'foreground', 'dark_foreground', 'light_foreground', 'bright_foreground', '',
         'red', 'orange', 'yellow', 'green', 'blue', 'cyan', 'magenta', 'purple', 'brown', '',
         'bright_red', 'bright_orange', 'bright_yellow', 'bright_green', 'bright_blue', 'bright_cyan', 'bright_magenta']


def rgba(h, a='ff'):
    return f'rgba({h.lstrip("#")}{a})'


def colors_toml(name, t):
    lines = [f'# {name.title()}: tea glass, the glass family steeped in amber. Red is the signal colour.', f'mode = "{t["mode"]}"']
    for k in ORDER:
        lines.append(f'{k} = "{t["colors"][k]}"' if k else '')
    lines += ['', f'hyprland_active_border = "{" ".join(rgba(c) for c in t["border"])} 45deg"',
              f'hyprland_inactive_border = "{rgba(t["inactive"])}"', '']
    return '\n'.join(lines)


def hyprland_lua(name, t):
    stops = ', '.join(f'"{rgba(c)}"' for c in t['border'])
    return f'''-- {name}: a still amber stripe border on a diagonal (no borderangle turn, as Frost / Smoke); focus shows as the
-- border and the Tusche Bar's frame glint. The window shadow is a soft warm dark, as Frost's: no light focus halo.
local active_border_color = {{ colors = {{ {stops} }}, angle = 45 }}
local inactive_border_color = "{rgba(t['inactive'])}"

hl.config({{
  general = {{
    col = {{
      active_border = active_border_color,
      inactive_border = inactive_border_color,
    }},
  }},

  group = {{
    col = {{
      border_active = active_border_color,
      border_inactive = inactive_border_color,
    }},
  }},

  decoration = {{
    shadow = {{ enabled = true, range = 24, render_power = 3, offset = {{ 0, 4 }}, color = "{t['shadow']}", color_inactive = "rgba(00000000)" }},
  }},
}})

hl.animation({{ leaf = "borderangle", enabled = false }})
'''


def neovim_lua(t):
    c = t['colors']
    pal = {
        'bg': c['background'], 'dark_bg': c['dark_background'], 'darker_bg': c['darker_background'], 'lighter_bg': c['lighter_background'],
        'fg': c['foreground'], 'dark_fg': c['dark_foreground'], 'light_fg': c['light_foreground'], 'bright_fg': c['bright_foreground'],
        'muted': c['muted'], 'red': c['red'], 'yellow': c['yellow'], 'orange': c['orange'], 'green': c['green'], 'cyan': c['cyan'],
        'blue': c['blue'], 'magenta': c['magenta'], 'brown': c['brown'],
        # bright_red is decoration in aether (tags, headings): give it the accent, keep red for errors
        'bright_red': c['accent'], 'bright_yellow': c['bright_yellow'], 'bright_green': c['bright_green'], 'bright_cyan': c['bright_cyan'],
        'bright_blue': c['bright_blue'], 'bright_magenta': c['bright_magenta'], 'accent': c['accent'], 'cursor': c['accent'],
        'foreground': c['foreground'], 'background': c['background'], 'selection': c['selection'],
        'selection_foreground': c['bright_foreground'], 'selection_background': c['selection'],
    }
    body = '\n'.join(f'        {k} = "{v}",' for k, v in pal.items())
    return f'''-- aether with the theme palette; red is the signal colour only (errors, diagnostics, deletions).
return {{
  {{
    "omacom/aether.nvim",
    branch = "v3",
    name = "aether",
    priority = 1000,
    opts = {{
      styles = {{ comments = {{ italic = true }}, keywords = {{ bold = true }}, functions = {{ bold = true }} }},
      colors = {{
{body}
      }},
      on_highlights = function(hl, c)
        local sig = "{c['red']}"
        for _, g in ipairs({{ "Error", "ErrorMsg", "DiagnosticError", "DiagnosticSignError", "DiagnosticVirtualTextError",
          "DiagnosticFloatingError", "diffRemoved", "Removed", "GitSignsDelete", "DiffviewFilePanelDeletions", "SpellBad" }}) do
          hl[g] = {{ fg = sig, bold = g == "Error" or g == "ErrorMsg" }}
        end
        hl.DiagnosticUnderlineError = {{ undercurl = true, sp = sig }}
        hl.Comment = {{ fg = c.muted, italic = true }}
        hl.CursorLineNr = {{ fg = "{c['accent']}", bold = true }}
        hl.Todo = {{ fg = c.bg, bg = "{c['accent']}", bold = true }}
      end,
    }},
  }},
  {{
    "LazyVim/LazyVim",
    opts = {{
      colorscheme = "aether",
    }},
  }},
}}
'''


def shell_tomls(t):
    c, b, s = t['colors'], t['bar'], t['select']
    bar = (f'background       = "{b["background"]}"\nbackground-alpha = {b["alpha"]}\ntext             = "{b["text"]}"\n'
           f'active           = "{b["active"]}"\nscale-with-font  = true\nsize-horizontal  = 26\nsize-vertical    = 28\n')
    def card(alpha):
        return (f'background                = "{c["background"]}"\nbackground-alpha          = {alpha}\ntext                      = "{c["foreground"]}"\n'
                f'border                    = "hyprland.active-border-foreground"\nborder-alpha              = 1.0\n'
                f'scrim                     = "{c["background"]}"\nscrim-alpha               = 0.5\n'
                f'selected-background       = "{s["background"]}"\nselected-background-alpha = 1.0\nselected-text             = "{s["text"]}"\n'
                f'selected-border           = "hyprland.active-border-foreground"\nselected-border-alpha     = 0.0\n')
    return bar, card(1.0), card(0.95)


def material(t):
    light = t['mode'] == 'light'
    g = t['glass']
    return {
        'family': 'glass',
        'edge': {
            'kind': 'dry',
            'line': {'color': t['edge']['color'], 'alpha': t['edge']['alpha'], 'width': 1},
            'haze': {'color': '#2a170c', 'height': 16, 'stops': [[0, 0.18], [0.5, 0.06], [1, 0]]},
        },
        'card': {'roll': True, 'halo': {'color': '#1a0d06', 'alpha': t['halo'], 'blur': 28}},
        'source': {'fill': t['colors']['foreground'], 'text': t['colors']['background']},
        'tones': {'strong': t['colors']['foreground']},
        'glass': {
            'enabled': True, 'spring': True, 'light': light,
            'tint': g['tint'], 'backing': g['backing'], 'blur': g['blur'],
            'bevel': 9, 'bend': 4, 'gloss': g['gloss'], 'omega': 24.5, 'damping': 0.78,
            'frame': t['frame'],
        },
    }


def unlock(name, t, dst):
    """The lock-screen glyphs of Smoke (dark) / Frost (light), mapped onto the tea palette (alpha kept)."""
    base, dark, light = t['unlock']
    subprocess.run(['magick', str(ROOT / 'themes' / base / 'unlock.png'), '(', '-size', '1x256', f'gradient:{dark}-{light}', ')',
                    '-clut', '-strip', str(dst / 'unlock.png')], check=True)


def build(name, t):
    dst = ROOT / 'themes' / name
    shutil.rmtree(dst, ignore_errors=True)
    (dst / 'backgrounds').mkdir(parents=True)
    own = PICTURES / name
    stills = sorted(own.glob('*.jpg'))
    for p in stills:
        shutil.copy2(p, dst / 'backgrounds' / p.name)
    shutil.copy2(own / 'preview.png', dst / 'preview.png')
    (dst / 'colors.toml').write_text(colors_toml(name, t))
    (dst / 'hyprland.lua').write_text(hyprland_lua(name, t))
    (dst / 'neovim.lua').write_text(neovim_lua(t))
    (dst / 'icons.theme').write_text(t['icons'] + '\n')
    bar, menu, launcher = shell_tomls(t)
    (dst / 'shell.bar.toml').write_text(bar)
    (dst / 'shell.menu.toml').write_text(menu)
    (dst / 'shell.launcher.toml').write_text(launcher)
    (dst / 'bar-material.json').write_text(json.dumps(material(t), indent=2) + '\n')
    unlock(name, t, dst)
    (dst / '.tusche-papier').write_text('built by tools/build-tea-themes.py (Rooibos / Kandis)\n')
    return len(stills)


if __name__ == '__main__':
    for name, t in THEMES.items():
        print(f'{name}: tea glass, {build(name, t)} pictures of its own')
