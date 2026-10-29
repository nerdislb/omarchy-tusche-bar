#!/usr/bin/env python3
"""bin/hypr-overrides.py against a scratch state directory and a fake hyprctl.

Never touches the real toggle directory or Hyprland: XDG_STATE_HOME and PATH
point at a temporary folder for every call. The fake hyprctl answers
getoption from the values in the override file (else a fixed default), fails
a reload on request and reports config errors on request.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'bin' / 'hypr-overrides.py'

FAKE_HYPRCTL = r"""#!/usr/bin/env python3
import json, os, re, sys
log = os.environ['FAKE_LOG']
args = sys.argv[1:]
with open(log, 'a') as f:
    f.write(' '.join(args) + '\n')
path = os.path.join(os.environ['XDG_STATE_HOME'], 'omarchy/toggles/hypr/00-tusche-settings.lua')
values = {}
if os.path.exists(path):
    for line in open(path):
        if line.startswith('-- tusche-overrides: '):
            values = json.loads(line[len('-- tusche-overrides: '):])
if args[:1] == ['reload']:
    sys.exit(1 if os.environ.get('FAKE_RELOAD_FAIL') and values else 0)
if args[:1] == ['configerrors']:
    if os.environ.get('FAKE_BREAK') and values.get('general:gaps_out') == 12:
        print('config error: bad value')
    sys.exit(0)
if args[:2] == ['--batch', '-j']:
    defaults = {'general:gaps_out': {'css': '5 5 5 5'}, 'input:sensitivity': {'float': 0.0},
                'decoration:blur:enabled': {'bool': True}, 'input:accel_profile': {'str': '[[EMPTY]]'}}
    for cmd in args[2].split(';'):
        option = cmd.strip().split(' ', 1)[1]
        answer = dict(defaults.get(option, {'int': 1}))
        if option in values:
            v = values[option]
            key = next(iter(answer))
            answer = {'bool': v} if isinstance(v, bool) else {'css': '%s %s %s %s' % (v, v, v, v)} if key == 'css' else {key: v}
        answer.update({'option': option, 'set': True})
        print(json.dumps(answer, indent=1))
        print()
    sys.exit(0)
sys.exit(2)
"""


def call(env, *args):
    return subprocess.run([sys.executable, '-I', str(SCRIPT), *args], env=env, capture_output=True, text=True)


OPTIONS = ['general:gaps_out', 'input:sensitivity', 'decoration:blur:enabled', 'input:accel_profile']


def main():
    passed = 0
    with tempfile.TemporaryDirectory(prefix='hypr-overrides-test-') as scratch:
        tmp = Path(scratch)
        bin_dir = tmp / 'bin'
        bin_dir.mkdir()
        hyprctl = bin_dir / 'hyprctl'
        hyprctl.write_text(FAKE_HYPRCTL.replace('#!/usr/bin/env python3', '#!' + sys.executable, 1))
        hyprctl.chmod(0o755)
        log = tmp / 'hyprctl.log'
        env = {'PATH': str(bin_dir) + ':/usr/bin:/bin', 'XDG_STATE_HOME': str(tmp / 'state'),
               'HOME': str(tmp / 'home'), 'FAKE_LOG': str(log)}
        target = tmp / 'state' / 'omarchy' / 'toggles' / 'hypr' / '00-tusche-settings.lua'

        def status():
            r = call(env, 'status', *OPTIONS)
            assert r.returncode == 0, r
            return json.loads(r.stdout)

        s = status()
        assert s['values'] == {} and s['error'] == '' and not target.exists(), s
        assert s['effective'] == {'general:gaps_out': '5', 'input:sensitivity': '0', 'decoration:blur:enabled': 'true', 'input:accel_profile': ''}, s
        passed += 1

        r = call(env, 'apply', json.dumps({'general:gaps_out': 8, 'input:sensitivity': -0.3, 'decoration:blur:enabled': False}), *OPTIONS)
        assert r.returncode == 0, r
        s = json.loads(r.stdout)
        assert s['values'] == {'general:gaps_out': 8, 'input:sensitivity': -0.3, 'decoration:blur:enabled': False}, s
        assert s['effective']['general:gaps_out'] == '8' and s['effective']['input:sensitivity'] == '-0.3' and s['effective']['decoration:blur:enabled'] == 'false', s
        text = target.read_text()
        assert 'hl.config({' in text and '    gaps_out = 8,' in text and '    sensitivity = -0.3,' in text and '      enabled = false,' in text, text
        assert 'reload' in log.read_text()
        passed += 1

        # merge: one value changes, one is dropped, the rest stay
        r = call(env, 'apply', json.dumps({'general:gaps_out': None, 'input:accel_profile': 'flat'}), *OPTIONS)
        assert r.returncode == 0, r
        assert json.loads(r.stdout)['values'] == {'input:sensitivity': -0.3, 'decoration:blur:enabled': False, 'input:accel_profile': 'flat'}
        assert 'accel_profile = "flat",' in target.read_text()
        passed += 1

        # nothing changes: no write, no reload
        log.write_text('')
        before = target.read_text()
        r = call(env, 'apply', json.dumps({'input:accel_profile': 'flat'}), *OPTIONS)
        assert r.returncode == 0 and target.read_text() == before and 'reload' not in log.read_text(), r
        passed += 1

        # refused values leave the file alone
        for bad in [{'general:gaps_out': 'x;y'}, {'general:gaps_out': [1]}, {'os.execute': 1}, {'general:gaps_out': float('inf')}, ['general:gaps_out']]:
            r = call(env, 'apply', json.dumps(bad), *OPTIONS)
            assert r.returncode == 1 and target.read_text() == before, (bad, r)
        r = call(env, 'apply', 'not json', *OPTIONS)
        assert r.returncode == 1 and target.read_text() == before, r
        passed += 1

        # a reload that fails or new config errors restore the previous file
        r = call({**env, 'FAKE_RELOAD_FAIL': '1'}, 'apply', json.dumps({'general:gaps_out': 12}), *OPTIONS)
        assert r.returncode == 1 and 'did not reload' in r.stderr and target.read_text() == before, r
        r = call({**env, 'FAKE_BREAK': '1'}, 'apply', json.dumps({'general:gaps_out': 12}), *OPTIONS)
        assert r.returncode == 1 and 'config errors' in r.stderr and target.read_text() == before, r
        passed += 1

        # dropping the last values removes the file
        r = call(env, 'apply', json.dumps({'input:sensitivity': None, 'decoration:blur:enabled': None, 'input:accel_profile': None}), *OPTIONS)
        assert r.returncode == 0 and not target.exists() and json.loads(r.stdout)['values'] == {}, r
        passed += 1

        # a file of that name the Control Center did not write is left alone
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('hl.config({ general = { gaps_out = 2 } })\n')
        s = status()
        assert s['values'] == {} and 'not written by the Control Center' in s['error'], s
        r = call(env, 'apply', json.dumps({'general:gaps_out': 9}), *OPTIONS)
        assert r.returncode == 1 and target.read_text() == 'hl.config({ general = { gaps_out = 2 } })\n', r
        passed += 1

        # Umbriel: the values go through Omarchy's translation, never hyprctl,
        # and a config Umbriel would refuse restores the previous file
        target.unlink()
        for name, body in [('omarchy-restart-hyprctl', 'echo restyle >>"$FAKE_LOG"'),
                           ('umbriel', 'echo "umbriel $*" >>"$FAKE_LOG"; [[ -z $FAKE_UMBRIEL_INVALID ]] || ! grep -q "gaps_out = 12" "$XDG_STATE_HOME/omarchy/toggles/hypr/00-tusche-settings.lua" 2>/dev/null')]:
            tool = bin_dir / name
            tool.write_text('#!/bin/bash\n' + body + '\n')
            tool.chmod(0o755)
        umbriel_env = {**env, 'UMBRIEL_SOCKET': str(tmp / 'umbriel.sock')}
        log.write_text('')
        r = call(umbriel_env, 'apply', json.dumps({'general:gaps_out': 7}), *OPTIONS)
        assert r.returncode == 0 and json.loads(r.stdout)['values'] == {'general:gaps_out': 7}, r
        assert log.read_text().splitlines()[:2] == ['restyle', 'umbriel config validate'] and 'reload' not in log.read_text(), log.read_text()
        before = target.read_text()
        r = call({**umbriel_env, 'FAKE_UMBRIEL_INVALID': '1'}, 'apply', json.dumps({'general:gaps_out': 12}), *OPTIONS)
        assert r.returncode == 1 and 'Umbriel did not take the values' in r.stderr and target.read_text() == before, r
        passed += 1

        assert call(env).returncode == 2
        passed += 1
    print(f'{passed} hypr-overrides checks passed')


if __name__ == '__main__':
    main()
