"""Umbriel's [include.optional] files list: read it and add to it safely.

Shared by pixel-style.py and curtain.py. Only an active (uncommented) `files`
array inside the [include.optional] table counts; a name that appears in a
comment or elsewhere does not.
"""
import re
import shutil

_SECTION = re.compile(r'^\[include\.optional\]\s*(?:#.*)?$', re.M)
_TABLE = re.compile(r'^\s*\[', re.M)
_FILES = re.compile(r'^([ \t]*files\s*=\s*\[)(.*?)(\][ \t]*(?:#[^\n]*)?)$', re.M | re.S)
_ENTRY = re.compile(r'"((?:[^"\\]|\\.)*)"|\'([^\']*)\'')


def _strip_comments(inner):
    return '\n'.join(line.split('#', 1)[0] for line in inner.split('\n'))


def files_list(text):
    """(match, entries) for the active files array of [include.optional], or (None, [])."""
    section = _SECTION.search(text)
    if not section:
        return None, []
    nxt = _TABLE.search(text, section.end())
    end = nxt.start() if nxt else len(text)
    m = _FILES.search(text, section.end(), end)
    if not m:
        return None, []
    entries = [a if a else b for a, b in _ENTRY.findall(_strip_comments(m.group(2)))]
    return m, entries


def is_included(config, name):
    if not config.exists():
        return False
    return name in files_list(config.read_text())[1]


def ensure(config, name, backup_suffix, write):
    """Append `name` to the active files list. Returns 'present', 'added' or why not."""
    if not config.exists():
        return 'no umbriel config'
    text = config.read_text()
    m, entries = files_list(text)
    if m is None:
        return 'no [include.optional] files list'
    if name in entries:
        return 'present'
    inner = m.group(2)
    # insert right after the last real entry, so a trailing comma or a comment
    # after it stays where it is: "a", -> "a", "b",   "a" # x -> "a", "b" # x
    last = None
    offset = 0
    for line in inner.split('\n'):
        code = line.split('#', 1)[0]
        for e in _ENTRY.finditer(code):
            last = offset + e.end()
        offset += len(line) + 1
    new = '"' + name + '"'
    inner = inner[:last] + ', ' + new + inner[last:] if last is not None else new + inner
    shutil.copy2(config, config.with_name(config.name + backup_suffix))
    write(config, text[:m.start()] + m.group(1) + inner + m.group(3) + text[m.end():])
    return 'added'
