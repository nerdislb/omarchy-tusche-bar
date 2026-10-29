#!/usr/bin/env python3
"""Full width windows edge to edge, as an Omarchy Hyprland toggle.

    full-width.py status        prints edge | gaps
    full-width.py set edge|gaps prints the state after the change

`edge` copies assets/hypr/full-width-edge.lua into Omarchy's toggle directory
(~/.local/state/omarchy/toggles/hypr, loaded after the user's own config, the
same place `omarchy-hyprland-toggle` uses); `gaps` removes it. Either way
Hyprland reloads. If the reload reports new config errors, the previous state
is restored and the command fails. On Umbriel, Omarchy's translation of the
Hyprland config takes the toggle instead (a maximize then fills the edges),
and a config Umbriel would refuse restores the previous state.
"""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

NAME = 'tusche-full-width.lua'
SOURCE = Path(__file__).resolve().parent.parent / 'assets' / 'hypr' / 'full-width-edge.lua'


def toggle_dir():
    state = os.environ.get('XDG_STATE_HOME') or str(Path.home() / '.local' / 'state')
    return Path(state) / 'omarchy' / 'toggles' / 'hypr'


def status():
    return 'edge' if (toggle_dir() / NAME).is_file() else 'gaps'


def config_errors():
    try:
        out = subprocess.run(['hyprctl', 'configerrors'], capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    return out.strip()


def reload():
    subprocess.run(['hyprctl', 'reload'], capture_output=True, text=True, timeout=10, check=True)


def on_umbriel():
    return not os.environ.get('HYPRLAND_INSTANCE_SIGNATURE') and bool(os.environ.get('UMBRIEL_SOCKET'))


def restyle_umbriel():
    """omarchy-restart-hyprctl writes Umbriel's look and bindings from the
    Hyprland config, toggles included; then the config Umbriel includes has
    to hold."""
    for argv in (['omarchy-restart-hyprctl'], ['umbriel', 'config', 'validate']):
        result = subprocess.run(argv, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            lines = (result.stderr or result.stdout).strip().splitlines()
            raise subprocess.SubprocessError(lines[-1] if lines else ' '.join(argv) + ' failed')


def write(want):
    target = toggle_dir() / NAME
    if want == 'edge':
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix='.' + NAME + '.', dir=target.parent)
        try:
            with os.fdopen(fd, 'wb') as file:
                file.write(SOURCE.read_bytes())
            os.chmod(name, 0o644)
            os.replace(name, target)
        finally:
            if Path(name).exists():
                Path(name).unlink()
    elif target.exists():
        target.unlink()


def set_state(want):
    before = status()
    if want == before:
        return before
    if on_umbriel():
        write(want)
        try:
            restyle_umbriel()
        except (OSError, subprocess.SubprocessError) as error:
            write(before)
            try:
                restyle_umbriel()
            except (OSError, subprocess.SubprocessError):
                pass
            raise RuntimeError('Umbriel did not take it, kept ' + before + ': ' + str(error)) from error
        return status()
    errors_before = config_errors()
    write(want)
    try:
        reload()
    except (OSError, subprocess.SubprocessError) as error:
        write(before)
        try:
            reload()
        except (OSError, subprocess.SubprocessError):
            pass
        raise RuntimeError('Hyprland did not reload, kept ' + before + ': ' + str(error)) from error
    errors_after = config_errors()
    if errors_after and errors_after != errors_before:
        write(before)
        reload()
        raise RuntimeError('Hyprland reported config errors, kept ' + before + ': ' + errors_after.splitlines()[0])
    return status()


def main(argv):
    if argv == ['status']:
        print(status())
        return 0
    if len(argv) == 2 and argv[0] == 'set' and argv[1] in ('edge', 'gaps'):
        if argv[1] == 'edge' and not SOURCE.is_file():
            print('full-width.py: missing ' + str(SOURCE), file=sys.stderr)
            return 1
        try:
            print(set_state(argv[1]))
        except (OSError, subprocess.SubprocessError, RuntimeError) as error:
            print('full-width.py: ' + str(error), file=sys.stderr)
            return 1
        return 0
    print('usage: full-width.py status | set edge|gaps', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
