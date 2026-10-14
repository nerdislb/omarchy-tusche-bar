#!/usr/bin/env python3
"""Ownership and recovery tests, with no real bar or desktop actions."""
import importlib.util
import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('focus_mode', Path(__file__).resolve().parents[1] / 'bin/focus-mode.py')
focus = importlib.util.module_from_spec(spec)
spec.loader.exec_module(focus)


class FocusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.flag = Path(self.temp.name) / 'bar-off'
        self.record = Path(self.temp.name) / 'owner.json'
        self.calls = []

    def toggle(self, command):
        self.calls.append(command)
        if command == 'on':
            self.flag.touch()
        else:
            self.flag.unlink(missing_ok=True)

    def run_action(self, action):
        return focus.act(action, self.flag, self.record, self.toggle)

    def test_own_hide_restores_and_has_private_record(self):
        self.assertTrue(self.run_action('start')['owned'])
        self.assertEqual(self.record.stat().st_mode & 0o777, 0o600)
        self.assertFalse(self.run_action('start')['changed'])
        self.assertEqual(self.calls, ['on'])
        self.assertFalse(self.run_action('release')['hidden'])
        self.assertFalse(self.record.exists())

    def test_prior_hidden_bar_is_not_claimed_or_shown(self):
        self.flag.touch()
        self.assertFalse(self.run_action('start')['owned'])
        self.assertTrue(self.run_action('release')['hidden'])
        self.assertEqual(self.calls, [])

    def test_later_user_hide_is_not_undone(self):
        self.run_action('start')
        stat = self.flag.stat()
        os.utime(self.flag, ns=(stat.st_atime_ns, stat.st_mtime_ns + 1_000_000))
        self.assertFalse(self.run_action('status')['owned'])
        self.assertTrue(self.run_action('release')['hidden'])
        self.assertEqual(self.calls, ['on'])

    def test_explicit_show_can_rescue_unowned_hide(self):
        self.flag.touch()
        self.assertFalse(self.run_action('show')['hidden'])
        self.assertEqual(self.calls, ['off'])

    def test_corrupt_record_blocks_automatic_release_but_not_explicit_show(self):
        self.flag.touch()
        self.record.write_text('not json')
        with self.assertRaises(ValueError):
            self.run_action('release')
        self.assertTrue(self.flag.exists())
        self.assertFalse(self.run_action('show')['hidden'])
        self.assertFalse(self.record.exists())
        archived = list(self.record.parent.glob('owner.json.corrupt-*'))
        self.assertEqual(len(archived), 1)
        self.assertEqual(archived[0].read_text(), 'not json')
        self.assertTrue(self.run_action('start')['owned'], 'recovery does not block the next start')

    def test_failed_record_write_rolls_back_owned_hide(self):
        with patch.object(focus, 'write_record', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.run_action('start')
        self.assertFalse(self.flag.exists())
        self.assertEqual(self.calls, ['on','off'])

    def test_native_failure_is_not_reported_as_success(self):
        with self.assertRaises(RuntimeError):
            focus.act('start', self.flag, self.record, lambda _: None)
        self.flag.touch()
        with self.assertRaises(RuntimeError):
            focus.act('show', self.flag, self.record, lambda _: None)

    def test_stale_record_does_not_hide_bar_on_release(self):
        self.record.write_text(json.dumps({'flag':[4,5]}))
        self.assertFalse(self.run_action('release')['hidden'])
        self.assertEqual(self.calls, [])
        self.assertFalse(self.record.exists())

    def test_timeout_after_native_hide_rolls_back(self):
        def interrupted(command):
            self.toggle(command)
            if command == 'on':
                raise subprocess.TimeoutExpired('native', 15)
        with self.assertRaises(subprocess.TimeoutExpired):
            focus.act('start', self.flag, self.record, interrupted)
        self.assertFalse(self.flag.exists())
        self.assertFalse(self.record.exists())

    def test_failed_timeout_rollback_retains_ownership_for_later_release(self):
        def interrupted(command):
            if command == 'on':
                self.flag.touch()
            raise subprocess.TimeoutExpired('native', 15)
        with self.assertRaises(subprocess.TimeoutExpired):
            focus.act('start', self.flag, self.record, interrupted)
        self.assertTrue(self.run_action('status')['owned'])
        self.assertFalse(self.run_action('release')['hidden'])


if __name__ == '__main__':
    unittest.main()
