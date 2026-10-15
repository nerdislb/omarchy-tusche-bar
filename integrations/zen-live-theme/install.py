#!/usr/bin/env python3
"""Enable the optional, user-local palette watcher for an existing Omazen install."""
from datetime import datetime, timezone
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

NAMES = ('omazen-live-theme.service', 'omazen-live-theme.path')


def install():
    home = Path.home()
    cli = home/'.local/bin/omazen'
    if not cli.is_file() or not os.access(cli, os.X_OK):
        raise SystemExit('Install and activate Omazen first; this helper does not install browser loaders.')
    source = Path(__file__).resolve().parent
    target = home/'.config/systemd/user'
    target.mkdir(parents=True, exist_ok=True)
    backup = home/'.local/state/omazen-live-theme/backups'/datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    for name in NAMES:
        path = target/name
        if path.is_symlink():
            raise SystemExit(f'Refusing to overwrite a symlink: {path}')
        data = (source/name).read_bytes()
        if path.exists() and path.read_bytes() == data:
            continue
        if path.exists():
            backup.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, backup/name)
        fd, temporary = tempfile.mkstemp(prefix='.'+name+'.', dir=target)
        try:
            with os.fdopen(fd, 'wb') as stream:
                stream.write(data)
            os.chmod(temporary, 0o644)
            os.replace(temporary, path)
        finally:
            if Path(temporary).exists():
                Path(temporary).unlink()
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', NAMES[1]], check=True)
    subprocess.run(['systemctl', '--user', 'restart', NAMES[1]], check=True)
    subprocess.run(['systemctl', '--user', 'start', NAMES[0]], check=True)
    print('Zen palette watcher enabled. Browser sessions, profiles and existing hooks were not changed.')


if __name__ == '__main__':
    install()
