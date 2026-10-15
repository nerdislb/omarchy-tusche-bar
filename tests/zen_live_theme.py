#!/usr/bin/env python3
"""Exercise the real path/service templates with installed Omazen in isolated state."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def systemctl(*args):
    return subprocess.run(['systemctl', '--user', *args], check=True, capture_output=True, text=True)


def until(predicate, label):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if predicate():
            print('PASS', label)
            return
        time.sleep(.1)
    raise AssertionError(label)


def run():
    home = Path.home()
    cli = home/'.local/bin/omazen'
    assert cli.is_file(), 'Existing Omazen installation required'
    unitdir = home/'.config/systemd/user'
    name = 'omazen-fixture-' + uuid.uuid4().hex[:12]
    units = []
    with tempfile.TemporaryDirectory(prefix='omazen-path-test-') as scratch:
        fixture = Path(scratch)
        current = fixture/'current'
        theme = current/'theme'
        theme.mkdir(parents=True)
        palette = fixture/'state/palette.json'
        light = (home/'.config/omarchy/themes/frost/colors.toml').read_text()
        dark = (home/'.config/omarchy/themes/smoke/colors.toml').read_text()
        colours = theme/'colors.toml'
        colours.write_text(dark)
        def mode():
            try: return json.loads(palette.read_text()).get('mode')
            except (OSError, ValueError): return None
        def write(data):
            temporary = theme/'next-colours'
            temporary.write_text(data)
            os.replace(temporary, colours)
        for suffix in ['service','path']:
            text = (ROOT/f'integrations/zen-live-theme/omazen-live-theme.{suffix}').read_text()
            text = text.replace('omazen-live-theme', name)
            text = text.replace('%h/.local/state/omarchy/current',str(current))
            text = text.replace('%h/.local/bin/omazen',str(cli))
            if suffix=='service':
                text += f'Environment=OMAZEN_STATE_DIR={fixture}/state\nEnvironment=OMAZEN_ACTIVE_COLORS={colours}\n'
            path = unitdir/f'{name}.{suffix}'
            assert not path.exists()
            path.write_text(text)
            units.append(path)
        try:
            systemctl('daemon-reload')
            systemctl('start',f'{name}.path')
            systemctl('start',f'{name}.service')
            until(lambda: mode()=='dark','initial sync')
            write(light)
            until(lambda: mode()=='light','atomic palette edit')
            replacement=current/'replacement'
            replacement.mkdir()
            (replacement/'colors.toml').write_text(dark)
            os.rename(theme,current/'retired')
            os.rename(replacement,theme)
            until(lambda: mode()=='dark','whole theme directory replacement')
            previous=palette.read_bytes()
            write('background = "invalid"\n')
            until(lambda: subprocess.check_output(['systemctl','--user','show',f'{name}.service','-p','Result','--value'],text=True).strip()=='exit-code','invalid input is rejected')
            assert palette.read_bytes()==previous,'last good palette must survive'
            print('PASS last-good retention')
            write(light)
            until(lambda: mode()=='light','recovery on next valid change')
            for data in [dark,light,dark,light,dark]:
                write(data)
                time.sleep(.04)
            until(lambda: mode()=='dark','rapid switches converge to latest palette')
            assert systemctl('is-active',f'{name}.path').stdout.strip()=='active'
            print('7 live path-service checks passed')
        finally:
            subprocess.run(['systemctl','--user','stop',f'{name}.path',f'{name}.service'],capture_output=True)
            subprocess.run(['systemctl','--user','reset-failed',f'{name}.path',f'{name}.service'],capture_output=True)
            for path in units: path.unlink()
            systemctl('daemon-reload')


if __name__=='__main__':
    run()
