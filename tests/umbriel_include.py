#!/usr/bin/env python3
"""bin/umbriel_include.py: only an active [include.optional] files entry counts,
and adding one keeps the TOML valid.

    python3 tests/umbriel_include.py
"""
from pathlib import Path
import sys
import tempfile
import tomllib
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'bin'))
import umbriel_include  # noqa: E402

NAME = 'tusche-curtain.toml'


def write(path, text):
    path.write_text(text)


class IncludeTest(unittest.TestCase):
    def run_case(self, text):
        config = Path(tempfile.mkdtemp()) / 'config.toml'
        config.write_text(text)
        before = umbriel_include.is_included(config, NAME)
        result = umbriel_include.ensure(config, NAME, '.bak', write)
        after = config.read_text()
        tomllib.loads(after)
        return before, result, umbriel_include.is_included(config, NAME), after

    def test_single_line(self):
        self.assertEqual(self.run_case('[include.optional]\nfiles = ["a.toml", "b.toml"]\n[x]\n')[:3],
                         (False, 'added', True))

    def test_trailing_comma(self):
        before, result, after, text = self.run_case('[include.optional]\nfiles = ["a.toml",]\n')
        self.assertEqual((result, after), ('added', True))
        self.assertNotIn(',,', text)

    def test_empty_list(self):
        self.assertEqual(self.run_case('[include.optional]\nfiles = []\n')[1:3], ('added', True))

    def test_comment_after_last_entry(self):
        text = self.run_case('[include.optional]\nfiles = [\n  "a.toml", # one\n  "b.toml" # two\n]\n')[3]
        self.assertIn(f'"b.toml", "{NAME}" # two', text)

    def test_commented_name_does_not_count(self):
        self.assertEqual(self.run_case(f'[include.optional]\n# "{NAME}"\nfiles = ["a.toml"]\n')[:3],
                         (False, 'added', True))

    def test_files_of_another_table_do_not_count(self):
        before, result, after, _ = self.run_case(f'[include.optional]\n[other]\nfiles = ["{NAME}"]\n')
        self.assertEqual((before, after), (False, False))
        self.assertNotIn(result, ('added', 'present'))

    def test_present_stays_untouched(self):
        text = f'[include.optional]\nfiles = ["a.toml", "{NAME}"]\n'
        self.assertEqual(self.run_case(text), (True, 'present', True, text))


if __name__ == '__main__':
    unittest.main()
