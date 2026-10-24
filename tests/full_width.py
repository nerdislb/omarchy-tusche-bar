#!/usr/bin/env python3
"""bin/full-width.py against a scratch state directory and a fake hyprctl.

Never touches the real toggle directory or Hyprland: XDG_STATE_HOME and PATH
point at a temporary folder for every call.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'bin' / 'full-width.py'

FAKE_HYPRCTL = """#!/bin/bash
echo "$*" >> "$FAKE_LOG"
if [[ $1 == reload && -n ${FAKE_RELOAD_FAIL:-} && -f $XDG_STATE_HOME/omarchy/toggles/hypr/tusche-full-width.lua ]]; then exit 1; fi
if [[ $1 == configerrors ]]; then
  if [[ -n ${FAKE_BREAK:-} && -f $XDG_STATE_HOME/omarchy/toggles/hypr/tusche-full-width.lua ]]; then echo "broken rule"; fi
  exit 0
fi
exit 0
"""


def call(env, *args):
    return subprocess.run([sys.executable, '-I', str(SCRIPT), *args], env=env, capture_output=True, text=True)


def main():
    passed = 0
    with tempfile.TemporaryDirectory(prefix='full-width-test-') as scratch:
        tmp = Path(scratch)
        bin_dir = tmp / 'bin'
        bin_dir.mkdir()
        hyprctl = bin_dir / 'hyprctl'
        hyprctl.write_text(FAKE_HYPRCTL)
        hyprctl.chmod(0o755)
        log = tmp / 'hyprctl.log'
        env = {'PATH': str(bin_dir) + ':/usr/bin:/bin', 'XDG_STATE_HOME': str(tmp / 'state'),
               'HOME': str(tmp / 'home'), 'FAKE_LOG': str(log)}
        toggle = tmp / 'state' / 'omarchy' / 'toggles' / 'hypr' / 'tusche-full-width.lua'

        r = call(env, 'status')
        assert r.returncode == 0 and r.stdout.strip() == 'gaps', r
        passed += 1

        r = call(env, 'set', 'edge')
        assert r.returncode == 0 and r.stdout.strip() == 'edge', r
        assert toggle.read_bytes() == (ROOT / 'assets' / 'hypr' / 'full-width-edge.lua').read_bytes()
        assert oct(toggle.stat().st_mode & 0o777) == '0o644'
        assert 'reload' in log.read_text().split()
        passed += 1

        log.write_text('')
        r = call(env, 'set', 'edge')
        assert r.returncode == 0 and r.stdout.strip() == 'edge' and 'reload' not in log.read_text(), 'no reload without a change'
        passed += 1

        r = call(env, 'set', 'gaps')
        assert r.returncode == 0 and r.stdout.strip() == 'gaps' and not toggle.exists(), r
        passed += 1

        broken = dict(env, FAKE_BREAK='1')
        r = call(broken, 'set', 'edge')
        assert r.returncode == 1 and 'config errors' in r.stderr and not toggle.exists(), r
        assert call(env, 'status').stdout.strip() == 'gaps'
        passed += 1

        failing = dict(env, FAKE_RELOAD_FAIL='1')
        r = call(failing, 'set', 'edge')
        assert r.returncode == 1 and 'did not reload' in r.stderr and not toggle.exists(), r
        passed += 1

        for bad in (['set', 'sideways'], ['set'], [], ['status', 'x']):
            r = call(env, *bad)
            assert r.returncode == 2 and r.stdout == '', (bad, r)
        assert not toggle.exists() and not list(toggle.parent.glob('.tusche-full-width*'))
        passed += 1

        # Only its own file: other toggles stay as they are.
        other = toggle.parent / 'bar-glassy.lua'
        other.write_text('-- someone else\n')
        call(env, 'set', 'edge')
        call(env, 'set', 'gaps')
        assert other.read_text() == '-- someone else\n'
        passed += 1
    print(f'{passed} full-width checks passed')


if __name__ == '__main__':
    main()
