#!/usr/bin/env python3
"""Omarchy's idle times in ~/.config/omarchy/shell.json.

    idle-times.py status          prints {"screensaver": <value>|null, "lock": <value>|null}
    idle-times.py set JSON        {"screensaver": <seconds>, "lock": <seconds>} (either or both)
    idle-times.py restore JSON    {"lock": {"value": <JSON as it was>} | {"absent": true}, …}

Omarchy's idle service reads idle.screensaver and idle.lock (seconds after
the computer goes idle, 0 turns that step off) live from shell.json and uses
its defaults (150 and 300) without a value. `set` (the Control Center's Use)
takes whole seconds from 0 to one day. `restore` (its Cancel) puts back
exactly what the file held at opening: any JSON value, or no value (the idle
object goes once it is empty). The read and the atomic write hold the
plugin's shell.json lock (shell_json_lock.py) and keep the file mode
(shell.json is 0600); everything else in the file stays as it is. Prints
the values after the write, as `status` does.
"""
import json
import os
from pathlib import Path
import sys
import tempfile

from shell_json_lock import locked

KEYS = ('screensaver', 'lock')
MAX_SECONDS = 86400
MAX_RESTORE = 1024           # characters of JSON a restored value may have


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


def seconds(value):
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return 0 <= value <= MAX_SECONDS
    if isinstance(value, float):
        return value.is_integer() and 0 <= value <= MAX_SECONDS
    return False


def restorable(value):
    if not isinstance(value, dict):
        return False
    if value == {'absent': True}:
        return True
    return list(value.keys()) == ['value'] and len(json.dumps(value['value'])) <= MAX_RESTORE


def changes_from(mode, text):
    changes = json.loads(text)
    check = seconds if mode == 'set' else restorable
    if (not isinstance(changes, dict) or not changes
            or any(key not in KEYS for key in changes) or not all(check(v) for v in changes.values())):
        return None
    if mode == 'set':
        return {key: ('value', int(v)) for key, v in changes.items()}
    return {key: ('absent', None) if v == {'absent': True} else ('value', v['value']) for key, v in changes.items()}


def apply(cfg, changes):
    idle = cfg.get('idle')
    if idle is not None and not isinstance(idle, dict):
        raise ValueError('shell.json idle is not an object')
    idle = dict(idle or {})
    for key, (kind, value) in changes.items():
        if kind == 'absent':
            idle.pop(key, None)
        else:
            idle[key] = value
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
        if len(argv) == 2 and argv[0] in ('set', 'restore'):
            changes = changes_from(argv[0], argv[1])
            if changes is None:
                print('idle-times.py: ' + ('give screensaver and/or lock as whole seconds (0-86400)' if argv[0] == 'set'
                                           else 'give screensaver and/or lock as {"value": …} or {"absent": true}'),
                      file=sys.stderr)
                return 2
            with locked(path):
                write(path, apply(read(path), changes))
                print(json.dumps(status_of(read(path))))
            return 0
    except (OSError, ValueError) as error:
        print('idle-times.py: ' + str(error), file=sys.stderr)
        return 1
    print('usage: idle-times.py status | set JSON | restore JSON', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
