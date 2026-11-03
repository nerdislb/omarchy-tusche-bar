#!/usr/bin/env python3
"""Install immutable plugin code URLs without restarting the shell/locker.

Only this plugin's manifest and its owned custom-module source URLs change.
Existing layout entries, options, credentials and unrelated plugin files are
preserved. Old code generations are retained for reversible local recovery.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile

SKIP_DIRS = {'.git', 'generations', 'tests', 'themes', 'setup', 'docs', 'tools', '__pycache__'}


def payload_files(source):
    return sorted(p for p in source.rglob('*') if p.is_file()
                  and not any(part in SKIP_DIRS for part in p.relative_to(source).parts)
                  and not any(part.startswith('.') for part in p.relative_to(source).parts)
                  and p.name not in {'dev-install.sh', 'installed-generation.json'})


def shell_json_locked(path):
    # the plugin's file lock (shell_json_lock.py), loaded by path so this file
    # also works as an imported module; keyed by the path it guards
    spec = importlib.util.spec_from_file_location('shell_json_lock', Path(__file__).resolve().parent / 'shell_json_lock.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.locked(path)


def atomic(path, data):
    if path.exists() and path.read_text() == data:
        return
    mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
    fd, name = tempfile.mkstemp(prefix='.' + path.name + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(data)
        os.chmod(name, mode)
        os.replace(name, path)
    finally:
        if Path(name).exists():
            Path(name).unlink()


def install(source, target, config):
    # One install of a plugin at a time: its generation, module URLs and
    # manifest are published together, never mixed from two runs.
    with shell_json_locked(Path(target).resolve()):
        return publish(source, target, config)


def publish(source, target, config):
    source, target = source.resolve(), target.resolve()
    manifest = json.loads((source / 'manifest.json').read_text())
    assert manifest['id'] in {'nerdibeard.tusche-bar', 'nerdibeard.tusche-island'}
    assert target.name == manifest['id'], 'Target must match the plugin id'
    files = payload_files(source)
    h = hashlib.sha256()
    for p in files:
        h.update(str(p.relative_to(source)).encode() + b'\0' + p.read_bytes())
    generation = h.hexdigest()[:16]
    folder = target / 'generations' / generation
    target.mkdir(parents=True, exist_ok=True)
    if not folder.exists():
        # Publish the complete generation in one rename on the same filesystem;
        # the manifest never points to a half-copied payload.
        folder.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='.staging-', dir=target.parent.parent) as scratch:
            stage = Path(scratch) / generation
            stage.mkdir()
            for p in files:
                dest = stage / p.relative_to(source)
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, dest)
            os.replace(stage, folder)
    else:
        for p in files:
            existing = folder / p.relative_to(source)
            assert existing.is_file() and existing.read_bytes() == p.read_bytes(), 'Existing generation was modified: ' + str(existing)
    published = json.loads(json.dumps(manifest))
    for key, value in published['entryPoints'].items():
        # The source manifest is canonical, not an already-generated manifest.
        assert not value.startswith('generations/') and '..' not in value
        published['entryPoints'][key] = 'generations/' + generation + '/' + value
    # Each plugin moves only its own entries: those whose source lies in its
    # own folder (the bar's tusche.* modules, the island's bell).
    if config.exists():
        with shell_json_locked(config):
            update_sources(config, target, folder)
    atomic(target / 'manifest.json', json.dumps(published, indent=2) + '\n')
    atomic(target / 'installed-generation.json', json.dumps({'generation': generation, 'source': str(source), 'files': len(files)}, indent=2) + '\n')
    return generation


# This plugin's custom-module entries (their source in its own folder) point at
# module files of the new generation.
def update_sources(config, target, folder):
    current = json.loads(config.read_text())
    next_config = json.loads(json.dumps(current))
    layout = next_config.get('bar', {}).get('layout', {})
    for entries in layout.values():
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            old = entry.get('source')
            if not isinstance(old, str) or not old.startswith(str(target) + '/'):
                continue
            rel = old[len(str(target)) + 1:]
            # only plain paths into this plugin's own folder: no "..", no way out
            if '..' in Path(rel).parts:
                continue
            if rel.startswith('generations/'):
                parts = rel.split('/', 2)
                rel = parts[2] if len(parts) == 3 else ''
            new = folder / rel
            if (rel.startswith('modules/') and new.is_file() and not new.is_symlink()
                    and new.resolve().is_relative_to(folder.resolve())):
                entry['source'] = str(new)
    if next_config != current:
        atomic(config, json.dumps(next_config, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    parser.add_argument('--config', type=Path, default=Path.home() / '.config/omarchy/shell.json')
    args = parser.parse_args()
    print(install(args.source, args.target, args.config))
