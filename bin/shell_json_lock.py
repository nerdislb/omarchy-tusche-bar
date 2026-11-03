"""One writer at a time for shell.json among this plugin's helpers.

apply-layout.py (the bar) and idle-times.py (the Control Center's idle times)
each read shell.json, change their part and replace the file. Without a lock
two of them running at once both read the old file and the second replace
drops the first one's change. The bar's and the island's install-generation.py
move their module URLs in it too. They take this lock around the whole
read-modify-write. Omarchy's own writers do not know it; it only orders ours.
"""
import contextlib
import fcntl
import hashlib
import os
from pathlib import Path


def lock_path(config):
    runtime = os.environ.get('XDG_RUNTIME_DIR') or '/tmp'
    key = hashlib.sha256(str(Path(config).resolve()).encode()).hexdigest()[:12]
    return Path(runtime) / ('tusche-shell-json-' + key + '.lock')


@contextlib.contextmanager
def locked(config):
    fd = os.open(lock_path(config), os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)
