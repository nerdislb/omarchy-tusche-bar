#!/usr/bin/env python3
"""bin/idle-times.py against a scratch shell.json (OMARCHY_SHELL_JSON).

Sets, puts back and removes idle.screensaver / idle.lock, keeps the file mode
and every other key, refuses what Omarchy's idle service would not read as
seconds, and fails cleanly on a file it cannot use. Never touches the real
~/.config/omarchy/shell.json.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'bin' / 'idle-times.py'
passed = 0


def check(ok, label):
    global passed
    if not ok:
        print('FAIL ' + label)
        sys.exit(1)
    passed += 1
    print('PASS ' + label)


def run(path, *args):
    env = {**os.environ, 'OMARCHY_SHELL_JSON': str(path)}
    return subprocess.run([sys.executable, str(HELPER), *args], capture_output=True, text=True, env=env, timeout=20)


with tempfile.TemporaryDirectory(prefix='idle-times-') as scratch:
    path = Path(scratch) / 'shell.json'
    original = {'version': 1, 'bar': {'layout': {'left': [{'id': 'omarchy.menu'}]}},
                'idle': {'lock': 300, 'screensaver': 150}, 'plugins': ['nerdibeard.tusche-bar']}
    path.write_text(json.dumps(original, indent=2) + '\n')
    path.chmod(0o600)

    r = run(path, 'status')
    check(r.returncode == 0 and json.loads(r.stdout) == {'screensaver': 150, 'lock': 300}, 'status reads both values')

    r = run(path, 'set', json.dumps({'lock': 600}))
    cfg = json.loads(path.read_text())
    check(r.returncode == 0 and json.loads(r.stdout) == {'screensaver': 150, 'lock': 600}, 'set prints the values after the write')
    check(cfg['idle'] == {'lock': 600, 'screensaver': 150}, 'only the given key changes')
    check({k: v for k, v in cfg.items() if k != 'idle'} == {k: v for k, v in original.items() if k != 'idle'}, 'everything else stays')
    check(list(cfg.keys()) == list(original.keys()), 'key order stays')
    check((path.stat().st_mode & 0o777) == 0o600, 'the file mode stays 0600')
    check(not [p for p in Path(scratch).iterdir() if p.name.startswith('.shell-idle.')], 'no temporary file is left behind')

    r = run(path, 'set', json.dumps({'screensaver': 0, 'lock': 1800.0}))
    check(r.returncode == 0 and json.loads(path.read_text())['idle'] == {'lock': 1800, 'screensaver': 0}, '0 turns a step off; a whole float is written as an integer')

    r = run(path, 'set', json.dumps({'lock': '300'}))
    check(r.returncode == 0 and json.loads(path.read_text())['idle']['lock'] == '300', 'a saved string goes back as it was (Cancel)')

    r = run(path, 'set', json.dumps({'lock': None}))
    check(r.returncode == 0 and json.loads(path.read_text())['idle'] == {'screensaver': 0}, 'null removes the key')
    r = run(path, 'set', json.dumps({'screensaver': None}))
    check(r.returncode == 0 and 'idle' not in json.loads(path.read_text()), 'the idle object goes once it is empty')
    check(json.loads(run(path, 'status').stdout) == {'screensaver': None, 'lock': None}, 'status without values: null')

    before = path.read_text()
    for bad in [{'lock': -1}, {'lock': 1.5}, {'lock': True}, {'lock': 86401}, {'dim': 10}, {}, {'lock': 'x' * 33}, [], 'lock']:
        r = run(path, 'set', json.dumps(bad))
        check(r.returncode == 2 and path.read_text() == before, 'refused without a write: ' + json.dumps(bad))
    r = run(path, 'set', 'not json')
    check(r.returncode != 0 and path.read_text() == before, 'refuses text that is not JSON')
    check(run(path).returncode == 2 and run(path, 'nonsense').returncode == 2, 'usage on anything else')

    path.write_text('{"idle": [1, 2]}\n')
    r = run(path, 'set', json.dumps({'lock': 60}))
    check(r.returncode == 1 and 'not an object' in r.stderr and path.read_text() == '{"idle": [1, 2]}\n', 'an idle that is not an object is left alone')
    path.write_text('{broken')
    r = run(path, 'set', json.dumps({'lock': 60}))
    check(r.returncode == 1 and path.read_text() == '{broken', 'a broken shell.json is not overwritten')
    missing = Path(scratch) / 'nope.json'
    r = run(missing, 'set', json.dumps({'lock': 60}))
    check(r.returncode == 1 and not missing.exists(), 'no shell.json: nothing is created')

print(f'{passed} idle-times checks passed')
