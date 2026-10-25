#!/usr/bin/env python3
"""Omarchy's idle times in ~/.config/omarchy/shell.json.

    idle-times.py status        prints {"screensaver": <value>|null, "lock": <value>|null}
    idle-times.py set JSON      JSON: {"screensaver": <seconds>|null, "lock": …}

Omarchy's idle service reads idle.screensaver and idle.lock (seconds after
the computer goes idle, 0 turns that step off) live from shell.json and uses
its defaults (150 and 300) without a value. `set` changes only the keys it
is given: a whole number of seconds (0 to one day) sets it, a string up to
32 characters puts back a value as it was (Cancel), null removes it (and the
idle object once it is empty). The write is atomic and keeps the file mode
(shell.json is 0600); everything else in the file stays as it is. Prints the
values after the write, as `status` does.
"""
import json
import os
from pathlib import Path
import sys
import tempfile

KEYS = ('screensaver', 'lock')
MAX_SECONDS = 86400


def config_path():
    return Path(os.environ.get('OMARCHY_SHELL_JSON', Path.home() / '.config/omarchy/shell.json'))


def read(path):
    cfg = json.loads(path.read_text())
    if not isinstance(cfg, dict):
        raise ValueError('shell.json is not an object')
    return cfg


def status_of(cfg):
    idle = cfg.get('idle')
    idle = idle if isinstance(idle, dict) else {}
    return {key: idle.get(key) for key in KEYS}


def valid(value):
    if value is None:
        return True
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return 0 <= value <= MAX_SECONDS
    if isinstance(value, float):
        return value.is_integer() and 0 <= value <= MAX_SECONDS
    if isinstance(value, str):
        return len(value) <= 32
    return False


def apply(cfg, changes):
    idle = cfg.get('idle')
    if idle is not None and not isinstance(idle, dict):
        raise ValueError('shell.json idle is not an object')
    idle = dict(idle or {})
    for key, value in changes.items():
        if value is None:
            idle.pop(key, None)
        else:
            idle[key] = int(value) if isinstance(value, float) else value
    if idle:
        cfg['idle'] = idle
    else:
        cfg.pop('idle', None)
    return cfg


def write(path, cfg):
    mode = path.stat().st_mode & 0o777
    fd, tmp = tempfile.mkstemp(prefix='.shell-idle.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as fh:
            fh.write(json.dumps(cfg, indent=2) + '\n')
        os.chmod(tmp, mode)
        os.replace(tmp, path)
    finally:
        if Path(tmp).exists():
            Path(tmp).unlink()


def main(argv):
    path = config_path()
    try:
        if argv == ['status']:
            print(json.dumps(status_of(read(path))))
            return 0
        if len(argv) == 2 and argv[0] == 'set':
            changes = json.loads(argv[1])
            if (not isinstance(changes, dict) or not changes
                    or any(key not in KEYS for key in changes) or not all(valid(v) for v in changes.values())):
                print('idle-times.py: give screensaver and/or lock as seconds (0-86400), a saved string or null',
                      file=sys.stderr)
                return 2
            cfg = read(path)
            write(path, apply(cfg, changes))
            print(json.dumps(status_of(read(path))))
            return 0
    except (OSError, ValueError) as error:
        print('idle-times.py: ' + str(error), file=sys.stderr)
        return 1
    print('usage: idle-times.py status | set JSON', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
