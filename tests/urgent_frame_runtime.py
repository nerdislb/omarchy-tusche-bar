#!/usr/bin/env python3
"""Run the real UrgentFrame.qml with a fake Quickshell.Hyprland, off the desktop.

Only the Hyprland singleton (a rawEvent signal) and Commons.Color are fixtures;
UrgentFrame.qml and UrgentFrame.js are the production files. The engine's `run`
is replaced by a recorder, so no hyprctl ever runs.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

QML = r'''import QtQuick
import QtTest
import Quickshell.Hyprland
import qs.Commons as Commons

Item {
 id: root
 width: 100; height: 100
 property var lines: []
 Component {
  id: make
  UrgentFrame {
   enabled: true
   run: function(argv) { root.lines = root.lines.concat([argv.join(" ")]) }
  }
 }
 function ev(name, data) { Hyprland.rawEvent({name: name, data: data}) }
 TestCase {
  name: "UrgentFrame"
  when: windowShown
  function init() { root.lines = []; Commons.Color.urgent = "#b32525" }

  function test_01_an_urgent_window_is_set_then_let_go_when_focused() {
   var f = createTemporaryObject(make, root)
   verify(f)
   root.ev("urgent", "5a1f3c")
   compare(root.lines, ["hyprctl setprop address:0x5a1f3c inactive_border_color rgba(b32525ff)"])
   compare(f.stateObject().urgent, ["5a1f3c"])
   root.ev("activewindowv2", "ffff")
   compare(root.lines.length, 1)                                  // another window: nothing
   root.ev("activewindowv2", "5a1f3c")
   compare(root.lines[1], "hyprctl setprop address:0x5a1f3c inactive_border_color unset")
   compare(f.stateObject().urgent, [])
   compare(f.stateObject().sent, 2)
  }

  function test_02_a_closed_window_needs_no_command() {
   var f = createTemporaryObject(make, root)
   root.ev("urgent", "abc")
   root.ev("closewindow", "abc")
   compare(root.lines.length, 1)
   compare(f.stateObject().urgent, [])
  }

  function test_03_disabled_ignores_events_and_turning_it_off_lets_everything_go() {
   var f = createTemporaryObject(make, root, {enabled: false})
   root.ev("urgent", "a")
   compare(root.lines.length, 0)
   f.onEvent("urgent", "a")                                       // the connection is off, and the handler guards itself as well
   compare(root.lines.length, 0)
   f.enabled = true
   root.ev("urgent", "a")
   root.ev("urgent", "b")
   compare(root.lines.length, 2)
   f.enabled = false
   compare(root.lines.slice(2), ["hyprctl setprop address:0xa inactive_border_color unset", "hyprctl setprop address:0xb inactive_border_color unset"])
   compare(f.stateObject().urgent, [])
   root.ev("urgent", "c")
   compare(root.lines.length, 4)                                  // off again: ignored
  }

  function test_04_a_theme_switch_recolours_the_windows_still_urgent() {
   var f = createTemporaryObject(make, root)
   root.ev("urgent", "a")
   Commons.Color.urgent = "#a52323"
   compare(root.lines[1], "hyprctl setprop address:0xa inactive_border_color rgba(a52323ff)")
   compare(root.lines.length, 2)
   root.ev("activewindowv2", "a")
   Commons.Color.urgent = "#111111"
   compare(root.lines.length, 3)                                  // nothing urgent: no recolour
  }

  function test_05_hostile_event_data_never_reaches_a_command() {
   var f = createTemporaryObject(make, root)
   root.ev("urgent", "5a1f3c; touch /tmp/pwn")
   root.ev("urgent", "$(touch /tmp/pwn)")
   root.ev("urgent", undefined)
   compare(root.lines.length, 0)
   Hyprland.rawEvent(null)
   compare(root.lines.length, 0)
  }

  function test_06_without_a_run_function_it_tracks_but_sends_nothing() {
   var f = createTemporaryObject(make, root, {run: null})
   root.ev("urgent", "a")
   compare(root.lines.length, 0)
   compare(f.stateObject().sent, 0)
  }
 }
}
'''


def run():
    with tempfile.TemporaryDirectory(prefix='tusche-urgent-') as folder:
        tmp = Path(folder)
        shutil.copy2(ROOT / 'UrgentFrame.qml', tmp / 'UrgentFrame.qml')
        shutil.copy2(ROOT / 'UrgentFrame.js', tmp / 'UrgentFrame.js')

        def write(name, text):
            dest = tmp / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text)

        write('imports/Quickshell/Hyprland/qmldir', 'module Quickshell.Hyprland\nsingleton Hyprland 1.0 Hyprland.qml\n')
        write('imports/Quickshell/Hyprland/Hyprland.qml', 'pragma Singleton\nimport QtQuick\nQtObject { signal rawEvent(var event) }\n')
        write('imports/qs/Commons/qmldir', 'module qs.Commons\nsingleton Color 1.0 Color.qml\n')
        write('imports/qs/Commons/Color.qml', 'pragma Singleton\nimport QtQuick\nQtObject { property color urgent: "#b32525" }\n')
        write('tst_urgent.qml', QML)
        env = {**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'QT_QUICK_BACKEND': 'software'}
        result = subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', str(tmp / 'tst_urgent.qml'), '-import', str(tmp / 'imports'), '-import', str(tmp)],
                                env=env, text=True, capture_output=True, timeout=90)
        print(result.stdout + result.stderr)
        if result.returncode:
            raise SystemExit(result.returncode)
        errors = ['ReferenceError:', 'TypeError:', 'Binding loop', 'Unable to assign', 'Cannot assign', 'is not a type', 'is not defined']
        assert not any(error in result.stdout + result.stderr for error in errors), 'runtime QML diagnostics'


if __name__ == '__main__':
    run()
