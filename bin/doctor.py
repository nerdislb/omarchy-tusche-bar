#!/usr/bin/env python3
"""Check the Tusche desktop's configuration and say what is off.

    doctor.py            readable report, exit 1 if anything failed
    doctor.py --json     the same as JSON

Read-only. It checks what the Tusche Bar and Island depend on:
  * ~/.config/omarchy/shell.json parses; every plugin it lists or lays out is
    installed; the bar's own modules point at files of an installed generation;
  * the bar's options are known values (an unknown one silently falls back to
    the first variant, which this names);
  * the Tusche Bar and Island manifests point at existing generations;
  * ~/.config/omarchy/shell.toml: lines the shell's reader would skip;
  * the pixel style: its recorded state against shell.toml, the Umbriel include,
    the native-text flag, the theme hook and the background;
  * Umbriel's configuration includes exist, and the last config reload
    reported no error.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
import umbriel_include  # noqa: E402

HERE = Path(__file__).resolve().parent.parent
HOME = Path(os.environ.get('HOME') or Path.home())
CONFIG = Path(os.environ.get('XDG_CONFIG_HOME') or HOME / '.config')
STATE = Path(os.environ.get('XDG_STATE_HOME') or HOME / '.local' / 'state')
PLUGINS = CONFIG / 'omarchy' / 'plugins'

results = []


def report(level, area, text):
    results.append({'level': level, 'area': area, 'text': text})


def ok(area, text):
    report('ok', area, text)


def warn(area, text):
    report('warn', area, text)


def fail(area, text):
    report('fail', area, text)


def load_json(path):
    try:
        return json.loads(path.read_text()), None
    except OSError as e:
        return None, str(e)
    except ValueError as e:
        return None, 'not valid JSON: ' + str(e)


def elements():
    """Presets.ELEMENTS through node, so the check uses the bar's own list."""
    if not shutil.which('node'):
        return None
    js = (HERE / 'Presets.js').read_text().replace('.pragma library', '')
    code = js + '\nprocess.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(ELEMENTS).map(' \
        '([k, e]) => [k, e.variants.map(v => v.id)]))))'
    try:
        out = subprocess.run(['node', '-e', code], capture_output=True, text=True, timeout=20)
        return json.loads(out.stdout) if out.returncode == 0 else None
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def check_shell_json():
    path = CONFIG / 'omarchy' / 'shell.json'
    config, error = load_json(path)
    if config is None:
        fail('shell.json', f'{path}: {error}')
        return None
    ok('shell.json', 'parses')
    installed = set()
    for d in (PLUGINS.iterdir() if PLUGINS.is_dir() else []):
        installed.add(d.name)
        manifest, _ = load_json(d / 'manifest.json')
        if isinstance(manifest, dict) and manifest.get('id'):
            installed.add(str(manifest['id']))
    listed = []
    for entry in config.get('plugins', []):
        pid = entry if isinstance(entry, str) else entry.get('id') if isinstance(entry, dict) else None
        if pid:
            listed.append(pid)
    missing = [p for p in listed if p not in installed and not p.startswith('omarchy.')]
    if missing:
        fail('plugins', 'listed but not installed: ' + ', '.join(sorted(missing)))
    else:
        ok('plugins', f'{len(listed)} listed, all installed')
    layout = config.get('bar', {}).get('layout', {})
    stale = []
    for section, entries in layout.items():
        if not isinstance(entries, list):
            continue
        for e in entries:
            if not isinstance(e, dict):
                continue
            pid, src = str(e.get('id', '')), e.get('source')
            if src and not Path(src).is_file():
                stale.append(f'{pid} → {src}')
            elif not src and pid and not pid.startswith('omarchy.') and not pid.startswith('tusche.') and pid not in installed:
                stale.append(f'{pid} (not installed)')
    if stale:
        fail('bar layout', 'entries without code: ' + '; '.join(stale))
    else:
        ok('bar layout', 'every entry has its code')
    disabled = config.get('disabledPlugins', [])
    if disabled:
        ok('plugins', 'disabled: ' + ', '.join(disabled))
    return config


def check_options(config):
    entry = next((p for p in config.get('plugins', []) if isinstance(p, dict) and p.get('id') == 'nerdibeard.tusche-bar'), None)
    if not entry:
        warn('bar options', 'the Tusche Bar has no entry in shell.json')
        return
    known = elements()
    if known is None:
        warn('bar options', 'node missing: options not checked')
        return
    options = entry.get('options') or {}
    def valid(key, value):
        if key == 'logoImage':
            return isinstance(value, str) and (value == '' or re.fullmatch(r'/[^\x00-\x1f]*\.(?i:svg|png)', value))
        return str(value) in known[key]
    bad = [f'{k}={v} (falls back to {known[k][0]})' for k, v in options.items() if k in known and not valid(k, v)]
    unknown = [k for k in options if k not in known]
    if bad:
        warn('bar options', 'unknown values: ' + ', '.join(bad))
    if unknown:
        warn('bar options', 'unknown keys (ignored): ' + ', '.join(unknown))
    if not bad and not unknown:
        ok('bar options', f'{len(options)} options, all known')


def check_generations():
    for pid in ('nerdibeard.tusche-bar', 'nerdibeard.tusche-island'):
        root = PLUGINS / pid
        meta, error = load_json(root / 'installed-generation.json')
        if meta is None:
            warn(pid, 'no installed generation: ' + str(error))
            continue
        gen = root / 'generations' / str(meta.get('generation'))
        manifest, merr = load_json(root / 'manifest.json')
        points = [v for v in (manifest or {}).get('entryPoints', {}).values()]
        broken = [v for v in points if not (root / v).is_file()]
        if not gen.is_dir():
            fail(pid, f'generation {meta.get("generation")} missing')
        elif broken:
            fail(pid, 'entry points missing: ' + ', '.join(broken))
        else:
            src = meta.get('source', '')
            ok(pid, f'generation {meta.get("generation")} from {src}')
            if src and not Path(src).exists():
                warn(pid, f'its source {src} no longer exists (rollback needs another checkout)')


SECTION = re.compile(r'^\[([A-Za-z0-9_-]+)\]\s*(#.*)?$')
VALUE = re.compile(r'^([A-Za-z0-9_-]+)\s*=\s*(["\'][^"\']+["\']|-?\d+(\.\d+)?(\s+-?\d+(\.\d+)?){0,3}|[A-Za-z][A-Za-z0-9_-]*)\s*(#.*)?$')


def check_shell_toml():
    path = CONFIG / 'omarchy' / 'shell.toml'
    if not path.exists():
        ok('shell.toml', 'none (theme values only)')
        return
    skipped, section = [], ''
    for n, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        m = SECTION.match(line)
        if m:
            section = m.group(1)
            continue
        if not VALUE.match(line) or not section:
            skipped.append(f'line {n}: {line[:60]}')
    if skipped:
        warn('shell.toml', 'the shell skips: ' + '; '.join(skipped))
    else:
        ok('shell.toml', 'every line is read')


def check_pixel():
    state, _ = load_json(STATE / 'tusche-bar' / 'pixel-style.json')
    style = (state or {}).get('style', 'tusche')
    block = '>>> tusche pixel style' in ((CONFIG / 'omarchy' / 'shell.toml').read_text() if (CONFIG / 'omarchy' / 'shell.toml').exists() else '')
    include = CONFIG / 'umbriel' / 'tusche-pixel.toml'
    include_on = include.exists() and 'layer_rule' in include.read_text()
    flag = (STATE / 'omarchy' / 'toggles' / 'shell-native-text').exists()
    hook = (CONFIG / 'omarchy' / 'hooks' / 'theme-set.d' / '80-tusche-pixel').exists()
    dither = include.exists() and 'tusche-dither' in include.read_text()
    want = style == 'pixel'
    # what each style should have: (found, expected); mix = the Tusche style's
    # shell with the pixel style's windows and dot grid
    parts = {'shell.toml block': (block, want), 'Umbriel include': (include_on, want),
             'window dissolve': (dither, style in ('pixel', 'mix')), 'native text': (flag, want),
             'theme hook': (hook, style in ('pixel', 'mix'))}
    # `font normal` and mix keep the shell's own font: native text is not
    # needed then, and may still be on when it was before the pixel style
    if style == 'mix' or (want and (state or {}).get('font') == 'normal'):
        parts.pop('native text')
    wrong = [(k, e) for k, (v, e) in parts.items() if v != e]
    if wrong:
        fail('pixel style', f'recorded {style}, but ' + ', '.join(f'{k} {"missing" if e else "left over"}' for k, e in wrong)
             + ' (pixel-style.py set ' + style + ' repairs it)')
    else:
        ok('pixel style', f'{style}, consistent')
    umbriel_cfg = CONFIG / 'umbriel' / 'config.toml'
    if umbriel_cfg.exists() and not umbriel_include.is_included(umbriel_cfg, 'tusche-pixel.toml'):
        warn('pixel style', 'Umbriel does not include tusche-pixel.toml yet (the first switch adds it)')
    if want:
        check_fonts()


def check_fonts():
    data = Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local' / 'share') / 'fonts'
    problems = []
    for name in ('TuschePixel-Regular.ttf', 'TuschePixel-Bold.ttf'):
        if not (data / 'tusche-pixel' / name).exists():
            problems.append(name + ' missing')
    if (data / 'tiny5' / 'Tiny5.ttf').exists():
        problems.append('the variable Tiny5.ttf is still installed (smeared bold)')
    if (CONFIG / 'fontconfig' / 'conf.d' / '60-tusche-pixel-symbols.conf').exists():
        problems.append('the old symbol fallback rule is still there')
    if problems:
        fail('pixel fonts', '; '.join(problems) + ' (pixel-style.py ensure-fonts repairs it)')
    else:
        ok('pixel fonts', 'Tusche Pixel installed')


def check_umbriel():
    cfg = CONFIG / 'umbriel' / 'config.toml'
    if not cfg.exists():
        ok('umbriel', 'no Umbriel configuration')
        return
    names = umbriel_include.files_list(cfg.read_text())[1]
    missing = [n for n in names if not n.startswith('$') and not (cfg.parent / n).exists()]
    if missing:
        warn('umbriel', 'optional includes not there: ' + ', '.join(missing))
    else:
        ok('umbriel', f'{len(names)} optional includes')
    try:
        out = subprocess.run(['journalctl', '--user', '-u', 'umbriel', '-n', '400', '--no-pager', '-o', 'cat'],
                             capture_output=True, text=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return
    lines = [l for l in out.splitlines() if 'config' in l.lower()]
    last = lines[-1] if lines else ''
    lowered = last.lower()
    # "0 errors" is a clean load, not a failure
    errors = re.search(r'\b(?!0 )(\d+ )?errors?\b', lowered) and not re.search(r'\b0 errors?\b', lowered)
    if '[ERR]' in last or errors or 'rejected' in lowered:
        fail('umbriel', 'last config message: ' + last.strip()[-160:])
    elif last:
        ok('umbriel', 'last config message: ' + last.strip()[-100:])


def main(argv):
    config = check_shell_json()
    if config:
        check_options(config)
    check_generations()
    check_shell_toml()
    check_pixel()
    check_umbriel()
    failed = any(r['level'] == 'fail' for r in results)
    if '--json' in argv:
        print(json.dumps({'ok': not failed, 'results': results}, indent=2))
    else:
        mark = {'ok': '  ok  ', 'warn': ' warn ', 'fail': ' FAIL '}
        for r in results:
            print(f"{mark[r['level']]} {r['area']}: {r['text']}")
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
