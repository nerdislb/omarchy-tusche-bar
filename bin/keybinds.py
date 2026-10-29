#!/usr/bin/env python3
"""Super+Space for the Tusche Bar's menu: bar | omarchy | status.

  keybinds.py bar       Super+Space opens the menu under the logo with the
                        search line, Super+Alt+Space opens it on the Apps
                        list; without the bar running Omarchy's own menus open
  keybinds.py omarchy   Omarchy's own bindings again (the block is removed)
  keybinds.py status    prints bar or omarchy

Keeps one managed block in ~/.config/hypr/bindings.lua (between the
"BEGIN/END Tusche Bar keys (managed)" lines), written atomically with the
file's mode kept; nothing else in the file is touched. Hyprland reloads the
file by itself; omarchy-restart-hyprctl is asked for as well, which on Umbriel
translates the bindings anew.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

PATH = Path(os.environ.get('OMARCHY_HYPR_BINDINGS', Path.home() / '.config/hypr/bindings.lua'))
BEGIN = '-- BEGIN Tusche Bar keys (managed)'
END = '-- END Tusche Bar keys (managed)'
BLOCK = f'''{BEGIN}
-- Super+Space / Super+Alt+Space open the Tusche Bar's menu under the logo
-- (search line / Apps list); without the bar, Omarchy's own menus open.
hl.unbind("SUPER + SPACE")
hl.unbind("SUPER + ALT + SPACE")
o.bind("SUPER + SPACE", "Omarchy menu", "omarchy-shell tusche-bar search || omarchy-menu toggle root")
o.bind("SUPER + ALT + SPACE", "Apps menu", "omarchy-shell tusche-bar apps || omarchy-menu toggle apps")
{END}'''


def read():
    return PATH.read_text() if PATH.exists() else ''


def strip(text):
    """Every complete managed block out (a copied block must not survive)."""
    while True:
        i = text.find(BEGIN)
        if i < 0:
            return text
        j = text.find(END, i)
        if j < 0:
            return text
        j += len(END)
        head, tail = text[:i].rstrip('\n'), text[j:].lstrip('\n')
        text = head + ('\n\n' if head and tail else '\n' if head else '') + tail


def write(text):
    PATH.parent.mkdir(parents=True, exist_ok=True)
    mode = PATH.stat().st_mode & 0o777 if PATH.exists() else 0o644
    fd, tmp = tempfile.mkstemp(dir=PATH.parent, prefix=f'.{PATH.name}.')
    with os.fdopen(fd, 'w') as f:
        f.write(text)
    os.chmod(tmp, mode)
    os.replace(tmp, PATH)
    subprocess.run(['omarchy-restart-hyprctl'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else 'status'
    text = read()
    if action == 'status':
        print('bar' if BEGIN in text else 'omarchy')
    elif action == 'bar':
        base = strip(text).rstrip('\n')
        new = (base + '\n\n' if base else '') + BLOCK + '\n'
        if new != text:
            write(new)
        print('bar')
    elif action == 'omarchy':
        if BEGIN in text:
            write(strip(text))
        print('omarchy')
    else:
        sys.exit('usage: keybinds.py bar|omarchy|status')


if __name__ == '__main__':
    main()
