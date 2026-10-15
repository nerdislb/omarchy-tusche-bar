#!/usr/bin/env python3
"""Move an Amiga Bar / Amiga Island setup over to the Tusche Bar / Island.

  migrate-from-amiga.py [--dry-run]

The Tusche Bar and Island are the Amiga Bar and Island renamed and cleaned
up: no Amiga effects, pixel font, A500 case form, fog look or menu strip.
This carries an existing setup across, so the bar looks the same afterwards:

- ~/.config/omarchy/shell.json (atomic, file mode kept):
  plugins[] and disabledPlugins: nerdibeard.amiga-bar -> nerdibeard.tusche-bar,
  nerdibeard.amiga-island -> nerdibeard.tusche-island; the bar's options keep
  the ones that still exist (removed variants map to their nearest one);
  bar.centerAnchor: the Amiga Island's id -> the Tusche Island's (the old id
  leaves Omarchy centring the whole middle group);
  bar.layout: amiga.* modules -> tusche.* with their sources in the new plugin
  folder (a drawer or A500 status strip becomes the groups, and the widgets
  the groups do not fold, such as the battery, go back into the bar), the island's entry -> nerdibeard.tusche-island (its settings kept,
  noteTopaz dropped, noteStyle "workbench" -> "window");
- ~/.local/state/amiga-bar: base.json (rewritten the same way), presets.json
  (options cleaned) and the boot-logo record go to ~/.local/state/tusche-bar;
- ~/.local/state/omarchy/amiga-island (inbox, live state, the notification
  and OSD takeover markers …) goes to .../tusche-island (bar-span.json, a
  file of the A500 form, stays behind); ~/.config/omarchy/amiga-island
  (calendars, preferences) to ~/.config/omarchy/tusche-island;
- ~/.config/hypr/bindings.lua: a "BEGIN Amiga Bar (managed)" block (status
  screen and menu strip keys) becomes the Tusche Bar's: Super+Alt+M opens the
  drop-down logo menu; the status screen is gone, so Super+M is let go.

Files that already exist at the new place are left alone, so a second run
changes nothing. The old plugin folders and state folders are not touched
(setup/install.sh moves the plugin folders into its backup). Prints what
changed.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile

HOME = Path.home()
SHELL = HOME / '.config/omarchy/shell.json'
OLD_STATE, NEW_STATE = HOME / '.local/state/amiga-bar', HOME / '.local/state/tusche-bar'
BINDINGS = HOME / '.config/hypr/bindings.lua'
BINDINGS_OLD = ('-- BEGIN Amiga Bar (managed)', '-- END Amiga Bar (managed)')
BINDINGS_NEW = """-- BEGIN Tusche Bar (managed)
-- The drop-down logo menu of the Tusche Bar (the focused screen's); was unbound.
o.bind("SUPER + ALT + M", "Tusche menu", "omarchy-shell tusche-bar menu")
-- END Tusche Bar (managed)"""
ISLAND_DIRS = [(HOME / '.local/state/omarchy/amiga-island', HOME / '.local/state/omarchy/tusche-island'),
               (HOME / '.config/omarchy/amiga-island', HOME / '.config/omarchy/tusche-island')]
OLD_BAR, NEW_BAR = 'nerdibeard.amiga-bar', 'nerdibeard.tusche-bar'
OLD_ISLAND, NEW_ISLAND = 'nerdibeard.amiga-island', 'nerdibeard.tusche-island'
IDS = {OLD_BAR: NEW_BAR, OLD_ISLAND: NEW_ISLAND}

# The Tusche Bar's options (Presets.js ELEMENTS) and where removed values go.
VALUES = {
    'workspaces': ['today', 'pips', 'stack', 'logo', 'minimap'],
    'ai': ['today', 'gauge', 'vu', 'rings', 'ondemand'],
    'right': ['today', 'groups', 'deviations'],
    'edge': ['none', 'theme'],
    'logo': ['omarchy', 'arch', 'nerdibeard'],
    'centre': ['today', 'calm'],
}
NEAREST = {
    'workspaces': {'cli': 'pips', 'boing': 'pips'},
    'ai': {'title': 'gauge'},
    'right': {'drawer': 'groups', 'hardware': 'groups', 'compact': 'groups'},
    'edge': {'workbench': 'none'},
    'logo': {'amiga': 'omarchy', 'boing': 'omarchy'},
}
# module id -> the option its "variant" carries
MODULE_OPTION = {'workspaces': 'workspaces', 'quota': 'ai', 'status': 'right'}
# What the status module's groups fold (Presets.js GROUPED). The drawer and the
# A500 strips folded more (the battery): those widgets go back into the bar.
GROUPED = {'omarchy.network', 'io.github.iamfitsum.omarchy-proton-vpn', 'omarchy.tailscale', 'omarchy.bluetooth',
           'flux', 'io.github.nerdislb.buds-control',
           'bitr0t.system-monitor', 'nerdibeard.monitor', 'nerdibeard.googledrive', 'com.omastorm.radar', 'community.plugin-manager'}


def value(key, v):
    v = NEAREST.get(key, {}).get(str(v), str(v))
    return v if v in VALUES[key] else None


def options(o):
    out = {}
    for key in VALUES:
        if isinstance(o, dict) and key in o and value(key, o[key]) is not None:
            out[key] = value(key, o[key])
    return out


def entry(e):
    if isinstance(e, str):
        return IDS.get(e, e)
    if not isinstance(e, dict):
        return e
    e = dict(e)
    i = e.get('id')
    if isinstance(i, str) and i.startswith('amiga.'):
        name = i[len('amiga.'):]
        e['id'] = 'tusche.' + name
        if isinstance(e.get('source'), str):
            e['source'] = e['source'].replace(f'/plugins/{OLD_BAR}/', f'/plugins/{NEW_BAR}/')
        key = MODULE_OPTION.get(name)
        # the workspaces module's "none" (menu logo only) is not an option value
        if key and 'variant' in e and e['variant'] != 'none':
            e['variant'] = value(key, e['variant']) or VALUES[key][1]
        if name == 'workspaces' and 'logo' in e:
            e['logo'] = value('logo', e['logo']) or 'omarchy'
    elif i in IDS:
        e['id'] = IDS[i]
        if i == OLD_ISLAND:
            e.pop('noteTopaz', None)
            if e.get('noteStyle') == 'workbench':
                e['noteStyle'] = 'window'
    return e


def layout(lay):
    if not isinstance(lay, dict):
        return lay
    out = {}
    for sec, items in lay.items():
        if not isinstance(items, list):
            out[sec] = items
            continue
        new = []
        for e in items:
            was = e.get('variant') if isinstance(e, dict) else None
            e = entry(e)
            new.append(e)
            # a status module that was a drawer or an A500 strip: what the groups
            # do not show comes back next to it, with its own settings
            if isinstance(e, dict) and e.get('id') == 'tusche.status' and was in NEAREST['right'] \
                    and isinstance(e.get('embeds'), dict):
                embeds = e['embeds']
                e['embeds'] = {k: v for k, v in embeds.items() if k in GROUPED}
                for k, v in embeds.items():
                    if k not in GROUPED:
                        new.append({'id': k, **v} if isinstance(v, dict) and v else k)
        out[sec] = new
    return out


def ids(lst):
    """plugins[] / disabledPlugins with the new ids; an old entry next to its new one goes."""
    if not isinstance(lst, list):
        return lst
    present = {x if isinstance(x, str) else x.get('id') for x in lst if isinstance(x, (str, dict))}
    out = []
    for x in lst:
        xid = x if isinstance(x, str) else x.get('id') if isinstance(x, dict) else None
        if xid in IDS and IDS[xid] in present:
            continue
        if isinstance(x, dict) and xid in IDS:
            x = entry(x) if xid == OLD_ISLAND else {**x, 'id': IDS[xid]}
            if xid == OLD_BAR and 'options' in x:
                x['options'] = options(x['options'])
        elif isinstance(x, str):
            x = IDS.get(x, x)
        out.append(x)
    return out


def write_json(path, data, dry, mode=None):
    if dry:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    if mode is None:
        mode = path.stat().st_mode & 0o777 if path.exists() else 0o644
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f'.{path.name}.')
    with os.fdopen(fd, 'w') as f:
        f.write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def migrate_shell(dry):
    if not SHELL.exists():
        return ['shell.json: not found, skipped']
    d = json.loads(SHELL.read_text())
    before = json.dumps(d, sort_keys=True)
    if 'plugins' in d:
        d['plugins'] = ids(d['plugins'])
    if 'disabledPlugins' in d:
        d['disabledPlugins'] = ids(d['disabledPlugins'])
    if isinstance(d.get('bar'), dict) and 'layout' in d['bar']:
        d['bar']['layout'] = layout(d['bar']['layout'])
    # the island anchors the bar's centre: the old id would be silently ignored
    if isinstance(d.get('bar'), dict) and d['bar'].get('centerAnchor') in IDS:
        d['bar']['centerAnchor'] = IDS[d['bar']['centerAnchor']]
    if json.dumps(d, sort_keys=True) == before:
        return ['shell.json: nothing of the Amiga Bar or Island in it']
    write_json(SHELL, d, dry)
    return ['shell.json: ids, bar options and layout entries moved to the Tusche Bar and Island']


def migrate_state(dry):
    out = []
    base_old, base_new = OLD_STATE / 'base.json', NEW_STATE / 'base.json'
    if base_old.exists() and not base_new.exists():
        b = json.loads(base_old.read_text())
        if isinstance(b, dict):
            b['layout'] = layout(b.get('layout'))
        write_json(base_new, b, dry, 0o644)
        out.append(f'{base_new}: from the Amiga Bar\'s baseline')
    presets_old, presets_new = OLD_STATE / 'presets.json', NEW_STATE / 'presets.json'
    if presets_old.exists() and not presets_new.exists():
        p = json.loads(presets_old.read_text() or '[]')
        p = [{**c, 'options': options(c.get('options'))} for c in p if isinstance(c, dict) and isinstance(c.get('name'), str)]
        write_json(presets_new, p, dry, 0o644)
        out.append(f'{presets_new}: {len(p)} saved combinations')
    logo_old, logo_new = OLD_STATE / 'boot-logo', NEW_STATE / 'boot-logo'
    if logo_old.is_dir() and not logo_new.exists():
        if not dry:
            shutil.copytree(logo_old, logo_new)
        out.append(f'{logo_new}: the boot logo record')
    for old, new in ISLAND_DIRS:
        if not old.is_dir():
            continue
        for f in sorted(old.iterdir()):
            target = new / f.name
            if f.name == 'bar-span.json' or target.exists():
                continue
            if not dry:
                new.mkdir(parents=True, exist_ok=True)
                (shutil.copytree if f.is_dir() else shutil.copy2)(f, target)
            out.append(f'{target}: from the Amiga Island')
    return out or ['state: nothing to carry over']


def migrate_bindings(dry):
    if not BINDINGS.exists():
        return []
    text = BINDINGS.read_text()
    start, end = BINDINGS_OLD
    i = text.find(start)
    j = text.find(end, i + 1) if i >= 0 else -1
    if i < 0 or j < 0:
        return []
    new = text[:i] + BINDINGS_NEW + text[j + len(end):]
    if not dry:
        mode = BINDINGS.stat().st_mode & 0o777
        fd, tmp = tempfile.mkstemp(dir=BINDINGS.parent, prefix=f'.{BINDINGS.name}.')
        with os.fdopen(fd, 'w') as f:
            f.write(new)
        os.chmod(tmp, mode)
        os.replace(tmp, BINDINGS)
    return [f'{BINDINGS}: the Amiga Bar block became the Tusche Bar\'s (Super+Alt+M: drop-down menu)']


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--dry-run', action='store_true')
    a = p.parse_args()
    for line in migrate_shell(a.dry_run) + migrate_state(a.dry_run) + migrate_bindings(a.dry_run):
        print(('[dry-run] ' if a.dry_run else '') + line)


if __name__ == '__main__':
    main()
