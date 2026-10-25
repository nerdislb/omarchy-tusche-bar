#!/usr/bin/env python3
"""bin/idle-times.py against a scratch shell.json (OMARCHY_SHELL_JSON).

Sets idle.screensaver / idle.lock (Use), puts back exactly what the file held
(Cancel: any JSON value, or no value), keeps the file mode and every other
key, refuses what is not whole seconds, fails cleanly on a file it cannot
use, and waits for the plugin's shell.json lock that apply-layout.py takes
too. Never touches the real ~/.config/omarchy/shell.json.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / 'bin' / 'idle-times.py'
sys.path.insert(0, str(ROOT / 'bin'))
from shell_json_lock import locked, lock_path  # noqa: E402

passed = 0


def check(ok, label):
    global passed
    if not ok:
        print('FAIL ' + label)
        sys.exit(1)
    passed += 1
    print('PASS ' + label)


def env(path, runtime):
    return {**os.environ, 'OMARCHY_SHELL_JSON': str(path), 'XDG_RUNTIME_DIR': runtime}


with tempfile.TemporaryDirectory(prefix='idle-times-') as scratch:
    runtime = str(Path(scratch) / 'run')
    os.mkdir(runtime, 0o700)
    os.environ['XDG_RUNTIME_DIR'] = runtime

    def run(path, *args):
        return subprocess.run([sys.executable, str(HELPER), *args], capture_output=True, text=True, env=env(path, runtime), timeout=20)

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

    # Cancel puts back exactly what was there, whatever Omarchy makes of it
    for value in [150.5, 90000, '300', None, False, {'odd': [1]}]:
        r = run(path, 'restore', json.dumps({'lock': {'value': value}}))
        check(r.returncode == 0 and json.loads(path.read_text())['idle']['lock'] == value, 'restore puts back ' + json.dumps(value))
    r = run(path, 'restore', json.dumps({'lock': {'absent': True}}))
    check(r.returncode == 0 and json.loads(path.read_text())['idle'] == {'screensaver': 0}, 'restore absent removes the key')
    r = run(path, 'restore', json.dumps({'screensaver': {'absent': True}}))
    check(r.returncode == 0 and 'idle' not in json.loads(path.read_text()), 'the idle object goes once it is empty')
    check(json.loads(run(path, 'status').stdout) == {'screensaver': None, 'lock': None}, 'status without values: null')

    before = path.read_text()
    for bad in [{'lock': -1}, {'lock': 1.5}, {'lock': True}, {'lock': 86401}, {'lock': '300'}, {'lock': None},
                {'dim': 10}, {}, [], 'lock']:
        r = run(path, 'set', json.dumps(bad))
        check(r.returncode == 2 and path.read_text() == before, 'set refuses without a write: ' + json.dumps(bad))
    for bad in [{'lock': 300}, {'lock': {'value': 1, 'x': 2}}, {'lock': {'absent': False}}, {'lock': {'value': 'x' * 2000}}, {'dim': {'absent': True}}]:
        r = run(path, 'restore', json.dumps(bad))
        check(r.returncode == 2 and path.read_text() == before, 'restore refuses without a write: ' + json.dumps(bad)[:60])
    r = run(path, 'set', 'not json')
    check(r.returncode != 0 and path.read_text() == before, 'refuses text that is not JSON')
    check(run(path).returncode == 2 and run(path, 'nonsense').returncode == 2, 'usage on anything else')

    # the plugin's shell.json lock: a writer holding it (apply-layout.py) goes first
    path.write_text(json.dumps(original, indent=2) + '\n')
    with locked(path):
        proc = subprocess.Popen([sys.executable, str(HELPER), 'set', json.dumps({'lock': 900})], env=env(path, runtime),
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        time.sleep(0.6)
        check(proc.poll() is None, 'the helper waits while another writer holds the lock')
        held = json.loads(path.read_text())
        held['bar']['layout']['left'].append({'id': 'written-meanwhile'})
        path.write_text(json.dumps(held, indent=2) + '\n')
    proc.wait(timeout=20)
    cfg = json.loads(path.read_text())
    check(proc.returncode == 0 and cfg['idle']['lock'] == 900 and cfg['bar']['layout']['left'][-1] == {'id': 'written-meanwhile'},
          'then reads the file afresh: the other write stays')
    check(lock_path(path).parent == Path(runtime), 'the lock lives in the runtime directory')

    layout = subprocess.run([sys.executable, str(ROOT / 'bin' / 'apply-layout.py')], env=env(path, runtime), text=True,
                            capture_output=True, timeout=20,
                            input=json.dumps({'pluginId': 'nerdibeard.tusche-bar', 'layout': {'left': []}, 'options': {'edge': 'none'}}))
    cfg = json.loads(path.read_text())
    check(layout.returncode == 0 and cfg['idle']['lock'] == 900 and cfg['bar']['layout'] == {'left': []}, 'apply-layout.py takes the same lock and keeps the idle times')

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
