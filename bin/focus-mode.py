#!/usr/bin/env python3
"""Temporarily hide the native bar without replacing or destroying widgets.

An ownership record avoids showing a bar the user subsequently hid themselves.
`show` is an explicit user action; `release` only undoes our unchanged flag.
"""
import argparse
import fcntl
import json
import os
import subprocess
import tempfile
import uuid
from pathlib import Path


def fingerprint(flag):
    try:
        stat = flag.stat()
        return [stat.st_ino, stat.st_mtime_ns]
    except FileNotFoundError:
        return None


def read_record(record):
    if not record.exists():
        return None
    data = json.loads(record.read_text())
    if not isinstance(data, dict) or not isinstance(data.get('flag'), list) or len(data['flag']) != 2:
        raise ValueError('Unreadable focus ownership record; left unchanged')
    return data


def write_record(record, data):
    record.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.focus-', dir=record.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            json.dump(data, file)
            file.flush()
            os.fsync(file.fileno())
        os.chmod(temporary, 0o600)
        os.replace(temporary, record)
    finally:
        if Path(temporary).exists():
            Path(temporary).unlink()


def act(action, flag, record, toggle):
    current = fingerprint(flag)
    try:
        saved = read_record(record)
    except (ValueError, OSError):
        # Explicit recovery must still work if an ownership record is broken.
        # Automatic release must never guess ownership or discard evidence.
        if action != 'show':
            raise
        toggle('off')
        if fingerprint(flag):
            raise RuntimeError('Native bar did not become visible')
        archived = record.with_name(record.name + '.corrupt-' + uuid.uuid4().hex)
        os.replace(record, archived)
        return {'hidden': False, 'owned': False, 'changed': bool(current),
                'note': 'Unreadable ownership record archived as ' + archived.name}
    owned = bool(saved and saved['flag'] == current)
    if action == 'start':
        if current:
            return {'hidden': True, 'owned': owned, 'changed': False}
        try:
            toggle('on')
        except Exception:
            # The native command writes the flag before its IPC nudge. A
            # timeout can therefore mean hidden, not unchanged. Preserve an
            # ownership path even if the best-effort rollback also fails.
            claimed = fingerprint(flag)
            if claimed:
                try:
                    write_record(record, {'version': 1, 'flag': claimed})
                except OSError:
                    pass
                try:
                    if fingerprint(flag) == claimed:
                        toggle('off')
                except Exception:
                    pass
                if not fingerprint(flag):
                    try:
                        saved = read_record(record)
                        if saved and saved['flag'] == claimed:
                            record.unlink()
                    except (OSError, ValueError):
                        pass
            raise
        claimed = fingerprint(flag)
        if not claimed:
            raise RuntimeError('Native bar did not become hidden')
        try:
            write_record(record, {'version': 1, 'flag': claimed})
        except Exception:
            if fingerprint(flag) == claimed:
                toggle('off')
            raise
        return {'hidden': True, 'owned': True, 'changed': True}
    if action == 'show' or (action == 'release' and owned):
        toggle('off')
        if fingerprint(flag):
            raise RuntimeError('Native bar did not become visible')
    if action in {'release', 'show'} and saved:
        record.unlink()
    return {'hidden': bool(fingerprint(flag)), 'owned': owned if action == 'status' else False,
            'changed': action == 'show' and bool(current) or action == 'release' and owned}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['start', 'release', 'show', 'status'])
    args = parser.parse_args()
    state = Path.home() / '.local/state'
    flag = state / 'omarchy/toggles/bar-off'
    record = state / 'tusche-bar/focus-owner.json'

    def toggle(action):
        subprocess.run(['omarchy-toggle-bar', action], check=True, timeout=15,
                       stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)

    if args.action == 'status':
        # Strictly read-only (the Health page runs it): no state directory and no
        # lock file. The record is replaced atomically, so a plain read is
        # consistent, and a missing record just means nothing is owned.
        print(json.dumps(act('status', flag, record, toggle)))
        return
    record.parent.mkdir(parents=True, exist_ok=True)
    with (record.parent / 'focus.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        print(json.dumps(act(args.action, flag, record, toggle)))


if __name__ == '__main__':
    main()
