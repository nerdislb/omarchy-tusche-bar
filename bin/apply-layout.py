#!/usr/bin/env python3
"""Write a Tusche Bar layout into ~/.config/omarchy/shell.json.

Reads {"layout": {...}, "options": {...}, "pluginId": "..."} on stdin,
replaces bar.layout, stores the options in the plugin's plugins[] entry,
and writes atomically while keeping the file mode (shell.json is 0600).
Everything else in shell.json is left as it is. The read and the write hold
the plugin's shell.json lock (shell_json_lock.py), so idle-times.py never
writes in between.
"""
import json
import os
import sys
import tempfile
import re
from pathlib import Path

from shell_json_lock import locked

path = Path(os.environ.get("OMARCHY_SHELL_JSON", Path.home() / ".config/omarchy/shell.json"))
req = json.load(sys.stdin)
profiles_only = req.get("profilesOnly") is True
profiles = req.get("screenProfiles")
if profiles_only:
    if not isinstance(profiles, dict) or len(profiles) > 32:
        raise ValueError("screenProfiles must be an object with at most 32 entries")
    for name, profile in profiles.items():
        if (not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", name)
                or name in {"__proto__", "constructor", "prototype"}
                or profile not in {"compact", "detailed"}):
            raise ValueError("Invalid screen presentation profile")
with locked(path):
    cfg = json.loads(path.read_text())
    if not profiles_only:
        bar = cfg.setdefault("bar", {})
        bar["layout"] = req["layout"]
    plugins = cfg.setdefault("plugins", [])
    entry = next((p for p in plugins if isinstance(p, dict) and p.get("id") == req["pluginId"]), None)
    if entry is None:
        entry = {"id": req["pluginId"]}
        plugins.append(entry)
    if profiles_only:
        entry["screenProfiles"] = profiles
    else:
        entry["options"] = req["options"]
    mode = path.stat().st_mode & 0o777
    fd, tmp = tempfile.mkstemp(prefix=".shell-tusche-bar.", dir=path.parent)
    with os.fdopen(fd, "w") as fh:
        fh.write(json.dumps(cfg, indent=2) + "\n")
    os.chmod(tmp, mode)
    os.replace(tmp, path)
print("ok")
