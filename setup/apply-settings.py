#!/usr/bin/env python3
"""Carry the bar settings of setup/look.json into this machine's Omarchy config.

  apply-settings.py [--look FILE] [--dry-run]

- Saved Tusche Bar combinations: merged by name into
  ~/.local/state/tusche-bar/presets.json (the Control Center lists them; the
  installer then loads the chosen one, which builds the bar).
- Tusche Island: its bar entry gets look.json's settings. Without one it takes
  the place of Omarchy's clock in the centre (the island is the clock), else
  goes before the weather, else to the end of the centre.

Writes are atomic and keep the file mode. Prints what changed.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile

HERE = Path(__file__).resolve().parent
HOME = Path.home()
SHELL = HOME / '.config/omarchy/shell.json'
PRESETS = HOME / '.local/state/tusche-bar/presets.json'
ISLAND = 'nerdibeard.tusche-island'


def write_json(path, data, dry):
    text = json.dumps(data, indent=2, ensure_ascii=False) + '\n'
    if dry:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f'.{path.name}.')
    with os.fdopen(fd, 'w') as f:
        f.write(text)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def entry_id(e):
    return e if isinstance(e, str) else (e.get('id') if isinstance(e, dict) else None)


def merge_combinations(look, dry):
    current = []
    if PRESETS.exists():
        current = json.loads(PRESETS.read_text() or '[]')
    names = [c['name'] for c in look.get('barCombinations', [])]
    merged = [c for c in current if c.get('name') not in names] + look.get('barCombinations', [])
    merged.sort(key=lambda c: c['name'].lower())
    write_json(PRESETS, merged, dry)
    return f'bar combinations: {", ".join(names)} -> {PRESETS}'


def place_island(look, dry):
    settings = dict(look.get('island') or {})
    d = json.loads(SHELL.read_text())
    layout = d.setdefault('bar', {}).setdefault('layout', {})
    for sec in ('left', 'center', 'right'):
        layout.setdefault(sec, [])
    entry = {'id': ISLAND, **settings}
    for sec, entries in layout.items():
        if not isinstance(entries, list):
            continue
        for i, e in enumerate(entries):
            if entry_id(e) == ISLAND:
                old = e if isinstance(e, dict) else {'id': ISLAND}
                layout[sec][i] = {**old, **entry}
                write_json(SHELL, d, dry)
                return f'island: settings merged into its entry ({sec})'
    center = layout['center']
    ids = [entry_id(e) for e in center]
    if 'omarchy.clock' in ids:
        center[ids.index('omarchy.clock')] = entry
        where = 'in place of omarchy.clock'
    elif 'omarchy.weather' in ids:
        center.insert(ids.index('omarchy.weather'), entry)
        where = 'before omarchy.weather'
    else:
        center.append(entry)
        where = 'at the end of the centre'
    write_json(SHELL, d, dry)
    return f'island: placed {where}'


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--look', default=str(HERE / 'look.json'))
    p.add_argument('--dry-run', action='store_true')
    a = p.parse_args()
    look = json.loads(Path(a.look).read_text())
    if not SHELL.exists():
        sys.exit(f'apply-settings: {SHELL} not found (is Omarchy set up for this user?)')
    for line in (merge_combinations(look, a.dry_run), place_island(look, a.dry_run)):
        print(('[dry-run] ' if a.dry_run else '') + line)


if __name__ == '__main__':
    main()
