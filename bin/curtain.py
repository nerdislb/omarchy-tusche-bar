#!/usr/bin/env python3
"""A privacy curtain for screen sharing and recording.

    curtain.py status | on | off | toggle

While the curtain is on, every window is capture-protected (Umbriel's
`block_capture`): it stays visible locally, but screenshots, recordings and
screen shares show what lies underneath, the wallpaper and the bar. The island
holds its notifications while the screen is shared or recorded anyway.
Curtain on means ~/.config/umbriel/tusche-curtain.toml holds the rule, which
Umbriel includes last and reloads by itself; off leaves only a comment there.
`Super+Shift+H` toggles it: the binding lives in the same file, on and off.
"""
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

HOME = Path(os.environ.get('HOME') or Path.home())
CONFIG = Path(os.environ.get('XDG_CONFIG_HOME') or HOME / '.config')
UMBRIEL = CONFIG / 'umbriel'
FILE = UMBRIEL / 'tusche-curtain.toml'
SCRIPT = Path(__file__).resolve()

HEAD = """# Written by the Tusche Bar's privacy curtain (bin/curtain.py). Included last
# by ~/.config/umbriel/config.toml. Super+Shift+H switches the curtain.
[keybinds]
"Super+Shift+H" = {{ action = "spawn {cmd}", repeat = false }}
"""
ON = """
# Curtain on: every window stays visible here and is left out of captures.
[[window_rule]]
block_capture = true
"""


def command():
    # the plugin's current generation, resolved when the key is pressed
    # spawn runs the rest of its string through the shell
    return ('p=$HOME/.config/omarchy/plugins/nerdibeard.tusche-bar; '
            'python3 $p/generations/$(jq -r .generation $p/installed-generation.json)/bin/curtain.py toggle')


def text(on):
    return HEAD.format(cmd=command()) + (ON if on else '')


def atomic(path, data):
    fd, tmp = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    with os.fdopen(fd, 'w') as f:
        f.write(data)
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)


def ensure_include():
    cfg = UMBRIEL / 'config.toml'
    if not cfg.exists():
        raise SystemExit('no Umbriel configuration')
    data = cfg.read_text()
    if FILE.name in data:
        return
    section = re.search(r'^\[include\.optional\]\s*$', data, re.M)
    m = re.compile(r'^(files\s*=\s*\[)(.*?)(\]\s*)$', re.M).search(data, section.end()) if section else None
    if not m:
        raise SystemExit('no [include.optional] files list in ' + str(cfg))
    inner = m.group(2).rstrip()
    shutil.copy2(cfg, cfg.with_name(cfg.name + '.bak-tusche-curtain'))
    atomic(cfg, data[:m.start()] + m.group(1) + (inner + ', ' if inner.strip() else '') + f'"{FILE.name}"' + m.group(3) + data[m.end():])


def state():
    return FILE.exists() and 'block_capture = true' in FILE.read_text()


def notify(on):
    if shutil.which('omarchy-notification-send'):
        subprocess.run(['omarchy-notification-send', '-g', '\U000f0209' if on else '\U000f0208',
                        'Curtain on: captures show the wallpaper' if on else 'Curtain off'], capture_output=True, timeout=10)


def set_curtain(on):
    FILE.parent.mkdir(parents=True, exist_ok=True)
    # the file first, so the include never names a missing file
    atomic(FILE, text(on))
    ensure_include()


def main(argv):
    cmd = argv[1] if len(argv) > 1 else 'status'
    if cmd == 'status':
        print('on' if state() else 'off')
        return 0
    if cmd in ('on', 'off', 'toggle'):
        on = (not state()) if cmd == 'toggle' else cmd == 'on'
        set_curtain(on)
        if cmd == 'toggle':
            notify(on)
        print('on' if on else 'off')
        return 0
    print(__doc__.strip(), file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
