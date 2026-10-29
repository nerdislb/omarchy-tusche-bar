#!/usr/bin/env python3
"""Hyprland values set by the Control Center, as an Omarchy toggle file.

    hypr-overrides.py status OPTION...       prints JSON: values, effective, error
    hypr-overrides.py apply JSON OPTION...   applies {option: value | null}, prints status

The values live in 00-tusche-settings.lua in Omarchy's toggle directory
(~/.local/state/omarchy/toggles/hypr). Omarchy loads that directory after the
user's own hypr config and the theme, in name order, so this file wins over
both but comes before Omarchy's other toggles: Gaps Off, Sharp or Rounded
corners and Animations Off still win over a value here.

The file carries its values on a `-- tusche-overrides: {...}` line, which is
what this script reads back; the Lua below it is generated from them. A file
of that name without the line is left alone (status reports an error). `apply`
merges the given values (null drops one), writes the file atomically (or
removes it when nothing is left), reloads Hyprland and checks
`hyprctl configerrors`; a failed reload or new config errors restore the
previous file. `effective` is what Hyprland runs with now, from
`hyprctl getoption`, as text ("5", "0.4", "true", "flat"; "" when unset).
"""
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

NAME = '00-tusche-settings.lua'
HEADER = '-- tusche-overrides: '
OPTION = re.compile(r'^(general|decoration|input|cursor|misc|gestures|animations)(:[a-z0-9_-]+)+$')
TEXT = re.compile(r'^[A-Za-z0-9_. -]{0,64}$')
INTRO = """-- Written by the Tusche Bar Control Center (Windows and Input & keys, the
-- rows tagged Override). Change or reset the values there; the line below is
-- what the Control Center reads back, the Lua after it is generated from it.
-- Delete this file and run `hyprctl reload` to drop them all.
-- It loads after your hypr config and the theme, before Omarchy's other
-- toggles: Gaps Off, Sharp or Rounded corners and Animations Off still win.
"""


class Refused(Exception):
    pass


def toggle_dir():
    state = os.environ.get('XDG_STATE_HOME') or str(Path.home() / '.local' / 'state')
    return Path(state) / 'omarchy' / 'toggles' / 'hypr'


def target():
    return toggle_dir() / NAME


def valid(option, value):
    if not OPTION.match(option):
        return False
    if isinstance(value, bool):
        return True
    if isinstance(value, int):
        return abs(value) < 10 ** 6
    if isinstance(value, float):
        return math.isfinite(value) and abs(value) < 10 ** 6
    if isinstance(value, str):
        return bool(TEXT.match(value))
    return False


def read_values():
    """The values in the file: {} when there is none; Refused when it is not ours."""
    path = target()
    if not path.exists():
        return {}
    try:
        text = path.read_text()
    except OSError as error:
        raise Refused('cannot read ' + str(path) + ': ' + str(error)) from error
    for line in text.splitlines():
        if line.startswith(HEADER):
            try:
                data = json.loads(line[len(HEADER):])
            except ValueError as error:
                raise Refused(NAME + ': unreadable values line') from error
            if not isinstance(data, dict) or not all(valid(k, v) for k, v in data.items()):
                raise Refused(NAME + ': unexpected values')
            return data
    raise Refused(NAME + ' was not written by the Control Center; leaving it alone')


def lua_value(value):
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return format(value, '.6f').rstrip('0').rstrip('.') if value != int(value) else str(int(value))
    return '"' + value.replace('\\', '\\\\').replace('"', '\\"') + '"'


def lua_key(key):
    return key if re.match(r'^[A-Za-z_][A-Za-z0-9_]*$', key) else '["' + key + '"]'


def render(values):
    tree = {}
    for option in sorted(values):
        node = tree
        parts = option.split(':')
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = values[option]

    def block(node, depth):
        pad = '  ' * depth
        out = []
        for key in sorted(node):
            if isinstance(node[key], dict):
                out.append(pad + lua_key(key) + ' = {')
                out.extend(block(node[key], depth + 1))
                out.append(pad + '},')
            else:
                out.append(pad + lua_key(key) + ' = ' + lua_value(node[key]) + ',')
        return out

    return (INTRO + HEADER + json.dumps(values, sort_keys=True, separators=(', ', ': ')) + '\n'
            + 'hl.config({\n' + '\n'.join(block(tree, 1)) + '\n})\n')


def write(values):
    path = target()
    if not values:
        if path.exists():
            path.unlink()
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.' + NAME + '.', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            file.write(render(values))
        os.chmod(name, 0o644)
        os.replace(name, path)
    finally:
        if Path(name).exists():
            Path(name).unlink()


def hyprctl(*args):
    return subprocess.run(['hyprctl', *args], capture_output=True, text=True, timeout=10)


def config_errors():
    try:
        return hyprctl('configerrors').stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def reload():
    result = hyprctl('reload')
    if result.returncode != 0:
        raise subprocess.SubprocessError((result.stderr or result.stdout).strip() or 'hyprctl reload failed')


def on_umbriel():
    return not os.environ.get('HYPRLAND_INSTANCE_SIGNATURE') and bool(os.environ.get('UMBRIEL_SOCKET'))


def restyle_umbriel():
    """Umbriel takes these values through Omarchy's translation of the Hyprland
    look and rules, which omarchy-restart-hyprctl writes; then the config it
    includes has to hold."""
    for argv in (['omarchy-restart-hyprctl'], ['umbriel', 'config', 'validate']):
        result = subprocess.run(argv, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            lines = (result.stderr or result.stdout).strip().splitlines()
            raise subprocess.SubprocessError(lines[-1] if lines else ' '.join(argv) + ' failed')


def text_of(answer):
    if 'css' in answer:
        parts = str(answer['css']).split()
        return parts[0] if parts and all(p == parts[0] for p in parts) else str(answer['css'])
    if 'bool' in answer:
        return 'true' if answer['bool'] else 'false'
    if 'int' in answer:
        return str(answer['int'])
    if 'float' in answer:
        return format(float(answer['float']), '.6f').rstrip('0').rstrip('.') or '0'
    if 'str' in answer:
        return '' if answer['str'] == '[[EMPTY]]' else str(answer['str'])
    return ''


def effective(options):
    options = [o for o in options if OPTION.match(o)]
    if not options:
        return {}
    try:
        out = hyprctl('--batch', '-j', '; '.join('getoption ' + o for o in options)).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    decoder, at, found = json.JSONDecoder(), 0, {}
    while True:
        while at < len(out) and out[at] not in '{':
            at += 1
        if at >= len(out):
            break
        try:
            answer, at = decoder.raw_decode(out, at)
        except ValueError:
            break
        if isinstance(answer, dict) and answer.get('option') in options:
            found[answer['option']] = text_of(answer)
    return found


def status(options, error=''):
    try:
        values = read_values()
    except Refused as refused:
        values, error = {}, error or str(refused)
    return {'file': str(target()), 'values': values, 'effective': effective(options), 'error': error}


def apply(changes):
    if not isinstance(changes, dict):
        raise Refused('apply takes a JSON object')
    before = read_values()
    after = dict(before)
    for option, value in changes.items():
        if value is None:
            if not OPTION.match(option):
                raise Refused('not a Hyprland option: ' + option)
            after.pop(option, None)
        elif valid(option, value):
            after[option] = value
        else:
            raise Refused('not a value for ' + option + ': ' + json.dumps(value))
    if after == before:
        return
    if on_umbriel():
        write(after)
        try:
            restyle_umbriel()
        except (OSError, subprocess.SubprocessError) as error:
            write(before)
            try:
                restyle_umbriel()
            except (OSError, subprocess.SubprocessError):
                pass
            raise Refused('Umbriel did not take the values, kept the previous values: ' + str(error)) from error
        return
    errors_before = config_errors()
    write(after)
    try:
        reload()
    except (OSError, subprocess.SubprocessError) as error:
        write(before)
        try:
            reload()
        except (OSError, subprocess.SubprocessError):
            pass
        raise Refused('Hyprland did not reload, kept the previous values: ' + str(error)) from error
    errors_after = config_errors()
    if errors_after and errors_after != errors_before:
        write(before)
        reload()
        raise Refused('Hyprland reported config errors, kept the previous values: ' + errors_after.splitlines()[0])


def main(argv):
    if argv and argv[0] == 'status':
        print(json.dumps(status(argv[1:])))
        return 0
    if len(argv) >= 2 and argv[0] == 'apply':
        try:
            apply(json.loads(argv[1]))
        except (ValueError, OSError, subprocess.SubprocessError, Refused) as error:
            print('hypr-overrides.py: ' + str(error), file=sys.stderr)
            return 1
        print(json.dumps(status(argv[2:])))
        return 0
    print('usage: hypr-overrides.py status OPTION... | apply JSON OPTION...', file=sys.stderr)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
