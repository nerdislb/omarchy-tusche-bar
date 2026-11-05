#!/usr/bin/env python3
"""Switch the desktop between the Tusche style and the pixel style.

    pixel-style.py status                 prints the state as JSON
    pixel-style.py set pixel|tusche [--no-restart] [--no-background]
    pixel-style.py ensure-include         adds this style's file to Umbriel's includes
    pixel-style.py retheme                after a theme switch: a new dot grid (theme-set hook)

The pixel style is a layer over the theme: its palette stays. Switching to it
records what it replaces (Omarchy's corner choice, the current background) and
then:

  * appends a managed block to ~/.config/omarchy/shell.toml (Tiny5 for the shell
    alone, font sizes on the pixel grid, opaque plates), which the shell reads
    live;
  * squares the corners with Omarchy's own toggle (`omarchy-hyprland-corners`),
    which shell and Umbriel both follow;
  * writes ~/.config/umbriel/tusche-pixel.toml (no blur behind shell surfaces),
    which Umbriel includes last;
  * sets a dot-grid background drawn from the theme's colours;
  * turns on native text for the shell (Qt's default text blurs a pixel face)
    and restarts the shell, the one step that cannot happen live.

Switching back removes exactly what was added and restores what was recorded,
so ~/.config/omarchy/shell.toml returns byte for byte when nobody edited it in
between. Every step is idempotent: `set` with the current style only repairs.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent.parent
ASSETS = HERE / 'assets' / 'pixel'
BEGIN = '# >>> tusche pixel style'
END = '# <<< tusche pixel style <<<'
INCLUDE = 'tusche-pixel.toml'


def home():
    return Path(os.environ.get('HOME') or Path.home())


def state_home():
    return Path(os.environ.get('XDG_STATE_HOME') or home() / '.local' / 'state')


def config_home():
    return Path(os.environ.get('XDG_CONFIG_HOME') or home() / '.config')


def paths():
    s, c = state_home(), config_home()
    return {
        'state': s / 'tusche-bar' / 'pixel-style.json',
        'backgrounds': s / 'tusche-bar' / 'pixel-backgrounds',
        'shell_toml': c / 'omarchy' / 'shell.toml',
        'umbriel_dir': c / 'umbriel',
        'umbriel_include': c / 'umbriel' / INCLUDE,
        'native_flag': s / 'omarchy' / 'toggles' / 'shell-native-text',
        'background': s / 'omarchy' / 'current' / 'background',
        'colors': s / 'omarchy' / 'current' / 'theme' / 'colors.toml',
        'theme_name': s / 'omarchy' / 'current' / 'theme.name',
        'hook': c / 'omarchy' / 'hooks' / 'theme-set.d' / '80-tusche-pixel',
    }


def sha(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data, mode=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if mode is None:
        mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    fd, tmp = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def load_state(p):
    try:
        return json.loads(p['state'].read_text())
    except (OSError, ValueError):
        return {'style': 'tusche'}


def save_state(p, state):
    atomic_write(p['state'], (json.dumps(state, indent=2, sort_keys=True) + '\n').encode(), 0o600)


def run(argv, timeout=60, check=True):
    result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    if check and result.returncode != 0:
        lines = (result.stderr or result.stdout).strip().splitlines()
        raise RuntimeError(lines[-1] if lines else ' '.join(argv) + ' failed')
    return result.stdout.strip()


# ---------------------------------------------------------------- shell.toml

def block_text():
    return (ASSETS / 'shell-block.toml').read_bytes()


def has_block(data):
    return BEGIN.encode() in data and END.encode() in data


def add_block(p, state):
    path = p['shell_toml']
    data = path.read_bytes() if path.exists() else b''
    if has_block(data):
        return
    sep = b'' if not data or data.endswith(b'\n') else b'\n'
    added = sep + block_text()
    state['shell_toml'] = {'before': sha(data), 'added': added.decode(), 'existed': path.exists()}
    atomic_write(path, data + added, 0o600 if not path.exists() else None)


def remove_block(p, state):
    path = p['shell_toml']
    if not path.exists():
        return
    data = path.read_bytes()
    record = state.get('shell_toml') or {}
    added = record.get('added', '').encode()
    if added and data.endswith(added):
        rest = data[:-len(added)]
    elif has_block(data):
        # edited since: cut only the marked lines, keep everything else as it is
        text = data.decode()
        start = text.index(BEGIN)
        start = text.rfind('\n', 0, start) + 1
        end = text.index(END) + len(END)
        if text[end:end + 1] == '\n':
            end += 1
        rest = (text[:start] + text[end:]).encode()
    else:
        return
    if not rest and record.get('existed') is False:
        path.unlink()
    else:
        atomic_write(path, rest)
    state.pop('shell_toml', None)


# ---------------------------------------------------------------- Umbriel

def ensure_include(p):
    """Add tusche-pixel.toml as the last optional include of Umbriel's config."""
    config = p['umbriel_dir'] / 'config.toml'
    if not config.exists():
        return 'no umbriel config'
    text = config.read_text()
    if INCLUDE in text:
        return 'present'
    section = re.search(r'^\[include\.optional\]\s*$', text, re.M)
    if not section:
        return 'no [include.optional]'
    line = re.compile(r'^(files\s*=\s*\[)(.*?)(\]\s*)$', re.M)
    m = line.search(text, section.end())
    nxt = re.search(r'^\[', text[section.end():], re.M)
    if not m or (nxt and m.start() > section.end() + nxt.start()):
        return 'no files list'
    inner = m.group(2).rstrip()
    new_inner = (inner + ', ' if inner.strip() else '') + '"' + INCLUDE + '"'
    shutil.copy2(config, config.with_name(config.name + '.bak-tusche-pixel'))
    atomic_write(config, (text[:m.start()] + m.group(1) + new_inner + m.group(3) + text[m.end():]).encode())
    return 'added'


def write_umbriel(p, style):
    src = ASSETS / ('umbriel-pixel.toml' if style == 'pixel' else 'umbriel-tusche.toml')
    data = src.read_bytes()
    dst = p['umbriel_include']
    if not dst.exists() or dst.read_bytes() != data:
        atomic_write(dst, data)


# ---------------------------------------------------------------- corners

def corners_now():
    try:
        out = run(['omarchy-hyprland-corners'], timeout=10)
    except (OSError, RuntimeError, subprocess.SubprocessError):
        return None
    return out if out in ('theme', 'sharp', 'rounded') else None


def set_corners(value):
    if value and corners_now() != value:
        run(['omarchy-hyprland-corners', value], timeout=60)


# ---------------------------------------------------------------- background

def background_now(p):
    try:
        return os.path.realpath(p['background']) if p['background'].exists() else None
    except OSError:
        return None


def grid_background(p):
    """The theme's dot grid as PNG, drawn by VectorCraft (PIL if it is missing)."""
    colors = p['colors']
    theme = p['theme_name'].read_text().strip() if p['theme_name'].exists() else 'theme'
    size = screen_size()
    out_dir = p['backgrounds']
    out_dir.mkdir(parents=True, exist_ok=True)
    key = sha(colors.read_bytes() + repr(size).encode())[:10]
    png = out_dir / f'{theme}-grid-{key}.png'
    if png.exists():
        return png
    svg = out_dir / f'.{theme}-grid-{key}.svg'
    run([sys.executable, '-I', str(ASSETS / 'grid_wallpaper.py'), str(colors), str(svg), str(size[0]), str(size[1])])
    try:
        if shutil.which('vectorcraft-cli'):
            run(['vectorcraft-cli', 'convert', str(svg), str(png)], timeout=120)
    except (OSError, RuntimeError, subprocess.SubprocessError):
        png.unlink(missing_ok=True)
    if not png.exists():
        pil_grid(colors, png, size)
    svg.unlink(missing_ok=True)
    return png


def pil_grid(colors, png, size):
    import tomllib
    from PIL import Image, ImageDraw
    c = tomllib.load(open(colors, 'rb'))
    im = Image.new('RGB', size, c['background'])
    d = ImageDraw.Draw(im)
    fg = tuple(int(c['foreground'][i:i + 2], 16) for i in (1, 3, 5))
    bg = tuple(int(c['background'][i:i + 2], 16) for i in (1, 3, 5))
    a = 0.075 if c.get('mode', 'dark') == 'dark' else 0.11
    dot = tuple(round(b + (f - b) * a) for f, b in zip(fg, bg))
    for y in range(12, size[1], 24):
        for x in range(12, size[0], 24):
            d.rectangle((x, y, x + 1, y + 1), fill=dot)
    im.save(png)


def screen_size():
    """The largest enabled output's mode, 1920x1080 when Umbriel cannot say."""
    try:
        out = run(['umbriel', 'outputs'], timeout=10)
    except (OSError, RuntimeError, subprocess.SubprocessError):
        return (1920, 1080)
    best = (1920, 1080)
    for m in re.finditer(r'(\d{3,5})x(\d{3,5}) @ [\d.]+ Hz \([^)]*current', out):
        w, h = int(m.group(1)), int(m.group(2))
        if w * h > best[0] * best[1]:
            best = (w, h)
    return best


def set_background(path):
    if path and Path(path).is_file():
        run(['omarchy-theme-bg-set', str(path)], timeout=60)


# ---------------------------------------------------------------- shell

def native_text(p, on):
    flag = p['native_flag']
    if on and not flag.exists():
        flag.parent.mkdir(parents=True, exist_ok=True)
        flag.write_text('Written by the Tusche Bar pixel style: native text for the shell.\n')
        return True
    if not on and flag.exists():
        flag.unlink()
        return True
    return False


def restart_shell():
    run(['omarchy-restart-shell'], timeout=120)


# ---------------------------------------------------------------- theme hook

HOOK = """#!/bin/bash
# Written by the Tusche Bar's pixel style: after a theme switch, draw the new
# theme's dot grid. Removed again when the Tusche style returns.
plugin="$HOME/.config/omarchy/plugins/nerdibeard.tusche-bar"
generation=$(jq -r .generation "$plugin/installed-generation.json" 2>/dev/null) || exit 0
script="$plugin/generations/$generation/bin/pixel-style.py"
[[ -f $script ]] && python3 "$script" retheme >/dev/null 2>&1
exit 0
"""


def install_hook(p, on):
    hook = p['hook']
    if on:
        if not hook.exists() or hook.read_text() != HOOK:
            atomic_write(hook, HOOK.encode(), 0o755)
    elif hook.exists() and hook.read_text() == HOOK:
        hook.unlink()


def notify(text):
    for argv in (['omarchy-notification-send', '-g', '\U000f0d4f', text], ['notify-send', '-a', 'Tusche', text]):
        if shutil.which(argv[0]):
            subprocess.run(argv, capture_output=True, timeout=10)
            return


def in_grid_dir(p, path):
    return bool(path) and str(path).startswith(str(p['backgrounds']) + os.sep)


# ---------------------------------------------------------------- commands

def status(p):
    state = load_state(p)
    data = p['shell_toml'].read_bytes() if p['shell_toml'].exists() else b''
    return {
        'style': state.get('style', 'tusche'),
        'shellBlock': has_block(data),
        'umbrielInclude': p['umbriel_include'].exists() and b'layer_rule' in p['umbriel_include'].read_bytes(),
        'nativeText': p['native_flag'].exists(),
        'corners': corners_now(),
        'background': background_now(p),
        'previous': state.get('previous', {}),
    }


def set_style(p, style, restart=True, background=True):
    if style not in ('pixel', 'tusche'):
        raise RuntimeError('style must be pixel or tusche')
    state = load_state(p)
    ensure_include(p)
    changed_text = False
    if style == 'pixel':
        if state.get('style') != 'pixel':
            state['previous'] = {'corners': corners_now() or 'theme', 'background': background_now(p)}
        state['style'] = 'pixel'
        save_state(p, state)
        add_block(p, state)
        save_state(p, state)
        write_umbriel(p, 'pixel')
        set_corners('sharp')
        if background:
            grid = grid_background(p)
            if background_now(p) != os.path.realpath(grid):
                set_background(grid)
        install_hook(p, True)
        changed_text = native_text(p, True)
    else:
        previous = state.get('previous', {})
        remove_block(p, state)
        write_umbriel(p, 'tusche')
        set_corners(previous.get('corners') or 'theme')
        # only a grid of ours goes back; a background chosen meanwhile stays
        if background and previous.get('background') and in_grid_dir(p, background_now(p)):
            set_background(previous['background'])
        install_hook(p, False)
        changed_text = native_text(p, False)
        state = {'style': 'tusche'}
        save_state(p, state)
    if restart and changed_text:
        notify('Pixel style' if style == 'pixel' else 'Tusche style')
        restart_shell()
    return status(p)


def retheme(p):
    """A theme switch set the new theme's background: remember it, show the grid."""
    state = load_state(p)
    if state.get('style') != 'pixel':
        return status(p)
    current = background_now(p)
    if current and not in_grid_dir(p, current):
        state.setdefault('previous', {})['background'] = current
        save_state(p, state)
    set_background(grid_background(p))
    return status(p)


def main(argv):
    p = paths()
    if len(argv) >= 2 and argv[1] == 'status':
        print(json.dumps(status(p), indent=2))
        return 0
    if len(argv) >= 2 and argv[1] == 'retheme':
        try:
            print(json.dumps(retheme(p), indent=2))
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            print('error: ' + str(error), file=sys.stderr)
            return 1
        return 0
    if len(argv) >= 2 and argv[1] == 'ensure-include':
        print(ensure_include(p))
        return 0
    if len(argv) >= 3 and argv[1] == 'set':
        try:
            out = set_style(p, argv[2], restart='--no-restart' not in argv, background='--no-background' not in argv)
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            print('error: ' + str(error), file=sys.stderr)
            return 1
        print(json.dumps(out, indent=2))
        return 0
    print(__doc__.strip(), file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
