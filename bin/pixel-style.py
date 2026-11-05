#!/usr/bin/env python3
"""Switch the desktop between the Tusche style and the pixel style.

    pixel-style.py status                 prints the state as JSON
    pixel-style.py set pixel|tusche [--no-restart] [--no-background]
    pixel-style.py ensure-include         adds this style's file to Umbriel's includes
    pixel-style.py ensure-fonts           installs Tusche Pixel (Tiny5 + the pixel symbols)
    pixel-style.py retheme                after a theme switch: a new dot grid (theme-set hook)

The pixel style is a layer over the theme: its palette stays. Switching to it
records what it replaces (Omarchy's corner choice, the current background) and
then:

  * appends a managed block to ~/.config/omarchy/shell.toml (Tusche Pixel for the shell
    alone, font sizes on the pixel grid, opaque plates), which the shell reads
    live;
  * squares the corners with Omarchy's own toggle (`omarchy-hyprland-corners`),
    which shell and Umbriel both follow;
  * writes ~/.config/umbriel/tusche-pixel.toml (no blur behind shell surfaces,
    windows dissolving in and out on a Bayer grid), which Umbriel includes last;
  * sets a dot-grid background drawn from the theme's colours;
  * switches Tusche Cursor, when installed, to its pixel family;
  * installs Tusche Pixel: Tiny5's letters and 7x7 pixel symbols for the
    Nerd Font codepoints in one family, so no symbol depends on Qt's font
    fallback (it stays installed; nothing else asks for it);
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import umbriel_include  # noqa: E402

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
        'shell_json': c / 'omarchy' / 'shell.json',
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

def base_size(p):
    """[font] base-size outside our block (the shell's default is 12)."""
    path = p['shell_toml']
    text = path.read_text() if path.exists() else ''
    if BEGIN in text and END in text:
        text = text[:text.index(BEGIN)] + text[text.index(END) + len(END):]
    section, size = '', 12
    for line in text.splitlines():
        line = line.split('#', 1)[0].strip()
        if line.startswith('[') and line.endswith(']'):
            section = line[1:-1].strip()
        elif section == 'font' and re.match(r'base-size\s*=', line):
            try:
                size = int(line.split('=', 1)[1].strip().strip('"'))
            except ValueError:
                pass
    return max(1, size)


def block_text(p):
    # the shell scales [bar] icon-font by base-size / 12 and rounds: pick the
    # whole number that lands on Tiny5's 16-px grid size
    icon_font = round(16 * 12 / base_size(p))
    return (ASSETS / 'shell-block.toml').read_bytes().replace(b'@ICON_FONT@', str(icon_font).encode())


def has_block(data):
    return BEGIN.encode() in data and END.encode() in data


def add_block(p, state):
    path = p['shell_toml']
    data = path.read_bytes() if path.exists() else b''
    if has_block(data):
        refresh_block(p, state, data)
        return
    sep = b'' if not data or data.endswith(b'\n') else b'\n'
    added = sep + block_text(p)
    state['shell_toml'] = {'before': sha(data), 'added': added.decode(), 'existed': path.exists()}
    atomic_write(path, data + added, 0o600 if not path.exists() else None)


def refresh_block(p, state, data):
    """An older block of ours at the end of the file: swap in the current one."""
    record = state.get('shell_toml') or {}
    added = record.get('added', '').encode()
    if not added or not data.endswith(added):
        return
    sep = b'\n' if added.startswith(b'\n') else b''
    fresh = sep + block_text(p)
    if fresh == added:
        return
    record['added'] = fresh.decode()
    state['shell_toml'] = record
    atomic_write(p['shell_toml'], data[:-len(added)] + fresh)


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


# ---------------------------------------------------------------- shell.json

def json_locked(path):
    import importlib.util
    spec = importlib.util.spec_from_file_location('shell_json_lock', HERE / 'bin' / 'shell_json_lock.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.locked(path)


def bar_background_now(p):
    try:
        bar = json.loads(p['shell_json'].read_text()).get('bar', {})
    except (OSError, ValueError):
        return None
    return bar.get('background')


def set_bar_background(p, value):
    """Omarchy's bar look (opaque, glassy, none); None removes the key."""
    path = p['shell_json']
    if not path.exists():
        return
    with json_locked(path):
        config = json.loads(path.read_text())
        bar = config.setdefault('bar', {})
        if bar.get('background') == value or (value is None and 'background' not in bar):
            return
        if value is None:
            bar.pop('background', None)
        else:
            bar['background'] = value
        atomic_write(path, (json.dumps(config, indent=2) + '\n').encode())


# ---------------------------------------------------------------- Umbriel

def ensure_include(p):
    """Add tusche-pixel.toml as the last optional include of Umbriel's config."""
    return umbriel_include.ensure(p['umbriel_dir'] / 'config.toml', INCLUDE, '.bak-tusche-pixel',
                                  lambda path, text: atomic_write(path, text.encode()))


SHADER = 'tusche-pixel-dither.glsl'


def write_umbriel(p, style):
    """The include and, for the pixel style, its window dissolve shader.
    The shader goes first, so Umbriel never reads a preset without its file."""
    shader = p['umbriel_dir'] / SHADER
    if style == 'pixel':
        data = (ASSETS / SHADER).read_bytes()
        if not shader.exists() or shader.read_bytes() != data:
            atomic_write(shader, data)
    src = ASSETS / ('umbriel-pixel.toml' if style == 'pixel' else 'umbriel-tusche.toml')
    data = src.read_bytes()
    dst = p['umbriel_include']
    if not dst.exists() or dst.read_bytes() != data:
        atomic_write(dst, data)
    if style != 'pixel' and shader.exists():
        shader.unlink()


# ---------------------------------------------------------------- corners

def corners_now():
    try:
        out = run(['omarchy-hyprland-corners'], timeout=10)
    except (OSError, RuntimeError, subprocess.SubprocessError):
        return None
    return out if out in ('theme', 'sharp', 'rounded') else None


def set_corners(value):
    if value and corners_now() != value:
        try:
            run(['omarchy-hyprland-corners', value], timeout=60)
        except RuntimeError:
            # it saves the choice first and then reloads and notifies: a failed
            # notification (no notification server yet) still switched it
            if corners_now() != value:
                raise


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


# ---------------------------------------------------------------- cursor

def cursor_bin():
    path = home() / '.local' / 'bin' / 'tusche-cursor'
    return path if path.exists() else None


def cursor_family():
    try:
        return json.loads((config_home() / 'tusche-cursor' / 'config.json').read_text()).get('family', 'auto')
    except (OSError, ValueError):
        return None


def set_cursor_family(family):
    """Tusche Cursor's material (auto, ink, glass, pixel), when it is installed."""
    tool = cursor_bin()
    if not tool or not family or cursor_family() == family:
        return
    run([str(tool), '--family', family, '--save', '--apply', '--quiet'], timeout=300)


# ---------------------------------------------------------------- fonts

OUR_CONF = '60-tusche-pixel-symbols.conf'   # an earlier fallback rule of ours


def font_paths():
    data = Path(os.environ.get('XDG_DATA_HOME') or home() / '.local' / 'share')
    return {
        'tiny5': data / 'fonts' / 'tiny5',
        'pixel': data / 'fonts' / 'tusche-pixel',
        'old_symbols': data / 'fonts' / 'tusche-pixel-symbols',
        'old_conf': config_home() / 'fontconfig' / 'conf.d' / OUR_CONF,
        'replaced': state_home() / 'tusche-bar' / 'replaced-fonts',
    }


def ensure_fonts():
    """Tusche Pixel (Regular and a Bold that keeps the Regular pixels) and a
    static Tiny5. They stay installed when the Tusche style returns: nothing
    else asks for them. Returns True when something changed (the shell reads
    fonts at start)."""
    src = ASSETS / 'fonts'
    fp = font_paths()
    changed = False
    variable = fp['tiny5'] / 'Tiny5.ttf'
    if variable.exists():
        # the variable Tiny5 draws bold as a smeared synthetic bold in Qt
        fp['replaced'].mkdir(parents=True, exist_ok=True)
        shutil.move(str(variable), str(fp['replaced'] / 'Tiny5-variable.ttf'))
        changed = True
    # the separate symbol font with its fontconfig fallback came first; Qt's
    # fallback choice was not reliable, so it is gone again
    conf = fp['old_conf']
    if conf.exists() and 'Tusche Bar' in conf.read_text(errors='replace'):
        conf.unlink()
        changed = True
    if fp['old_symbols'].is_dir() and (fp['old_symbols'] / 'TuschePixelSymbols.ttf').exists():
        shutil.rmtree(fp['old_symbols'])
        changed = True
    wanted = [(src / name, fp['tiny5'] / name) for name in ('Tiny5-Regular.ttf', 'Tiny5-Bold.ttf', 'OFL-tiny5.txt')]
    wanted += [(src / name, fp['pixel'] / name)
               for name in ('TuschePixel-Regular.ttf', 'TuschePixel-Bold.ttf', 'OFL-tiny5.txt', 'LICENSE-symbols.txt')]
    for source, target in wanted:
        if not source.exists():
            continue
        data = source.read_bytes()
        if target.exists() and target.read_bytes() == data:
            continue
        atomic_write(target, data, 0o644)
        changed = True
    if changed and shutil.which('fc-cache'):
        run(['fc-cache', '-f', str(fp['tiny5']), str(fp['pixel'])], timeout=120, check=False)
    return changed


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


def umbriel_env():
    """The environment with a live UMBRIEL_SOCKET: a stale one (left in the
    systemd user environment by an earlier session) makes omarchy-restart-shell
    stop the shell and fall back to Hyprland's dispatcher, which never starts it."""
    env = dict(os.environ)
    sock = env.get('UMBRIEL_SOCKET', '')
    if sock and Path(sock).is_socket():
        return env
    runtime = env.get('XDG_RUNTIME_DIR') or f'/run/user/{os.getuid()}'
    candidate = Path(runtime) / f"umbriel-{env.get('WAYLAND_DISPLAY') or 'wayland-0'}.sock"
    if candidate.is_socket():
        env['UMBRIEL_SOCKET'] = str(candidate)
    return env


def shell_running():
    return subprocess.run(['pgrep', '-x', 'quickshell'], capture_output=True).returncode == 0


def restart_shell():
    env = umbriel_env()
    subprocess.run(['omarchy-restart-shell'], capture_output=True, text=True, timeout=120, env=env)
    # never leave the desktop without its shell: start it through Umbriel if
    # the restart stopped it and nothing brought it back
    import time
    for _ in range(20):
        if shell_running():
            return
        time.sleep(0.5)
    if env.get('UMBRIEL_SOCKET') and shutil.which('umbriel'):
        subprocess.run(['umbriel', 'msg', 'spawn', 'omarchy-launch-shell'], capture_output=True, timeout=30, env=env)


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
            # barBackground as found: None (no key in shell.json) is restored as no key
            state['previous'] = {'corners': corners_now() or 'theme', 'background': background_now(p),
                                 'barBackground': bar_background_now(p), 'cursorFamily': cursor_family(),
                                 'nativeText': p['native_flag'].exists()}
        state['style'] = 'pixel'
        save_state(p, state)
        add_block(p, state)
        save_state(p, state)
        write_umbriel(p, 'pixel')
        set_bar_background(p, 'opaque')
        set_corners('sharp')
        if background:
            grid = grid_background(p)
            if background_now(p) != os.path.realpath(grid):
                set_background(grid)
        install_hook(p, True)
        try:
            set_cursor_family('pixel')
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            print('warning: cursor: ' + str(error), file=sys.stderr)
        try:
            fonts_changed = ensure_fonts()
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            print('warning: fonts: ' + str(error), file=sys.stderr)
            fonts_changed = False
        changed_text = native_text(p, True) or fonts_changed
    else:
        previous = state.get('previous', {})
        remove_block(p, state)
        write_umbriel(p, 'tusche')
        if 'barBackground' in previous and bar_background_now(p) == 'opaque':
            set_bar_background(p, previous['barBackground'])
        set_corners(previous.get('corners') or 'theme')
        # only a grid of ours goes back; a background chosen meanwhile stays
        if background and previous.get('background') and in_grid_dir(p, background_now(p)):
            set_background(previous['background'])
        install_hook(p, False)
        if 'cursorFamily' in previous and cursor_family() == 'pixel':
            try:
                # no Tusche Cursor config before: its default family
                set_cursor_family(previous['cursorFamily'] or 'auto')
            except (OSError, RuntimeError, subprocess.SubprocessError) as error:
                print('warning: cursor: ' + str(error), file=sys.stderr)
        # native text that was on before the pixel style stays on
        changed_text = native_text(p, False) if not previous.get('nativeText') else False
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
    if len(argv) >= 2 and argv[1] == 'ensure-fonts':
        print(json.dumps({'changed': ensure_fonts()}))
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
