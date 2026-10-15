#!/usr/bin/env python3
"""Run the real NotificationsWatchdog.qml with a fake Quickshell.Io, off the desktop.

Only the Process and StdioCollector types are fixtures: a started Process
records its command and answers from a script. The watchdog, its timers and
Watchdog.js are the production files. Nothing here runs omarchy-shell or touches
the notification service or any marker file.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

QML = r'''import QtQuick
import QtTest
import Quickshell.Io

Item {
 id: root
 width: 100; height: 100
 readonly property string marker: "/tmp/it's a marker with spaces and $(touch pwned)"
 Component {
  id: make
  NotificationsWatchdog {
   markerPath: root.marker
   firstMs: 30; fastMs: 30; slowMs: 90
   enabled: false
  }
 }
 function probes() { return IoProbe.calls.filter(function(c) { return c[2].indexOf("notifications ping") >= 0 }) }
 function handbacks() { return IoProbe.calls.filter(function(c) { return c[2].indexOf("omarchy-plugin-enable") >= 0 }) }
 TestCase {
  name: "NotificationsWatchdog"
  when: windowShown
  function init() { IoProbe.calls = []; IoProbe.sequence = []; IoProbe.fallback = "ok"; IoProbe.handbackExit = 0 }

  function test_01_disabled_never_starts_a_process() {
   var w = createTemporaryObject(make, root)
   verify(w)
   wait(300)
   compare(IoProbe.calls.length, 0)
  }

  function test_02_enabled_looks_after_the_first_delay_and_then_slowly() {
   var w = createTemporaryObject(make, root)
   w.enabled = true
   wait(10)
   compare(IoProbe.calls.length, 0)
   tryVerify(function() { return root.probes().length >= 1 }, 600)
   var call = root.probes()[0]
   compare(call[0], "sh"); compare(call[1], "-c")
   compare(call[3], "sh")
   compare(call[4], root.marker)                       // the marker is an argument element, verbatim
   verify(call[2].indexOf("pwned") < 0 && call[2].indexOf(" marker ") < 0)   // never part of the script text
   tryVerify(function() { return root.probes().length >= 3 }, 900)
   compare(root.handbacks().length, 0)
   compare(w.stateObject().misses, 0)
   verify(w.stateObject().lastOk !== null)
  }

  function test_03_a_missing_marker_is_one_look_then_idle_until_shell_json_changes() {
   IoProbe.fallback = "nomarker"
   var w = createTemporaryObject(make, root)
   w.enabled = true
   tryVerify(function() { return root.probes().length >= 1 }, 600)
   wait(500)                                            // several slow periods would have passed
   compare(root.probes().length, 1)                     // nothing is scheduled without the island's marker
   compare(root.handbacks().length, 0)
   compare(w.stateObject().armed, false)
   compare(w.stateObject().misses, 0)
   w.rearm = w.rearm + 1                                // the engine read shell.json again (the island's takeover writes it)
   tryVerify(function() { return root.probes().length === 2 }, 600)
   IoProbe.fallback = "ok"                              // the marker is there now and the island answers
   w.rearm = w.rearm + 1
   tryVerify(function() { return root.probes().length >= 4 }, 900)   // armed: the slow look goes on
   compare(w.stateObject().armed, true)
   var armedProbes = root.probes().length
   w.rearm = w.rearm + 1                                // a rewrite never disturbs an armed watchdog
   wait(40)
   verify(root.probes().length <= armedProbes + 1)
  }

  function test_04_three_silent_answers_hand_the_service_back_once() {
   IoProbe.fallback = "silent"
   var w = createTemporaryObject(make, root)
   w.enabled = true
   tryVerify(function() { return root.handbacks().length === 1 }, 1500)
   verify(root.probes().length >= 3)
   var call = root.handbacks()[0]
   compare(call[4], root.marker)
   verify(call[2].indexOf("omarchy-plugin-enable omarchy.notifications") >= 0)
   tryVerify(function() { return w.stateObject().handedBacks === 1 }, 500)
   verify(w.stateObject().note.indexOf("handed back") >= 0)
   wait(600)                                            // the island is still silent: the pause holds
   compare(root.handbacks().length, 1)
   w.enabled = false                                    // the engine sees the service enabled again
   compare(w.stateObject().handedBacks, 1)              // what happened stays visible for Health
   var seen = IoProbe.calls.length
   wait(300)
   compare(IoProbe.calls.length, seen)                  // and nothing looks any more
  }

  function test_05_one_silent_answer_between_good_ones_never_acts() {
   IoProbe.sequence = ["ok", "silent", "ok", "silent", "ok"]
   var w = createTemporaryObject(make, root)
   w.enabled = true
   tryVerify(function() { return root.probes().length >= 7 }, 1500)
   compare(root.handbacks().length, 0)
   compare(w.stateObject().handedBacks, 0)
  }

  function test_06_a_failed_hand_back_is_reported_and_not_counted() {
   IoProbe.fallback = "silent"
   IoProbe.handbackExit = 3
   var w = createTemporaryObject(make, root)
   w.enabled = true
   tryVerify(function() { return root.handbacks().length === 1 }, 1500)
   tryVerify(function() { return w.stateObject().note.indexOf("failed (exit 3)") >= 0 }, 500)
   compare(w.stateObject().handedBacks, 0)
  }

  function test_07_turning_it_off_and_on_starts_a_fresh_first_delay() {
   var w = createTemporaryObject(make, root)
   w.enabled = true
   tryVerify(function() { return root.probes().length >= 1 }, 600)
   w.enabled = false
   var seen = IoProbe.calls.length
   wait(250)
   compare(IoProbe.calls.length, seen)
   w.enabled = true
   wait(10)
   compare(IoProbe.calls.length, seen)
   tryVerify(function() { return IoProbe.calls.length > seen }, 600)
  }
 }
}
'''


def run():
    with tempfile.TemporaryDirectory(prefix='tusche-watchdog-') as folder:
        tmp = Path(folder)
        shutil.copy2(ROOT / 'NotificationsWatchdog.qml', tmp / 'NotificationsWatchdog.qml')
        shutil.copy2(ROOT / 'Watchdog.js', tmp / 'Watchdog.js')

        def write(name, text):
            dest = tmp / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text)

        write('imports/Quickshell/Io/qmldir', 'module Quickshell.Io\nProcess 1.0 Process.qml\nStdioCollector 1.0 StdioCollector.qml\nsingleton IoProbe 1.0 IoProbe.qml\n')
        write('imports/Quickshell/Io/IoProbe.qml', '''pragma Singleton
import QtQuick
QtObject {
 property var calls: []
 property var sequence: []
 property string fallback: "ok"
 property int handbackExit: 0
 function nextAnswer() {
  if (sequence.length) { var s = sequence.slice(); var a = s.shift(); sequence = s; return a }
  return fallback
 }
}
''')
        write('imports/Quickshell/Io/StdioCollector.qml', 'import QtQuick\nQtObject { property string text: ""; signal streamFinished() }\n')
        write('imports/Quickshell/Io/Process.qml', '''import QtQuick
Item {
 id: proc
 property var command: []
 property var stdout: null
 property bool running: false
 signal exited(int exitCode, int exitStatus)
 onRunningChanged: if (running) { IoProbe.calls = IoProbe.calls.concat([proc.command.slice()]); done.start() } else done.stop()
 Timer {
  id: done
  interval: 12
  onTriggered: {
   var isProbe = String(proc.command[2]).indexOf("notifications ping") >= 0
   if (proc.stdout) { proc.stdout.text = isProbe ? IoProbe.nextAnswer() : ""; proc.stdout.streamFinished() }
   proc.running = false
   proc.exited(isProbe ? 0 : IoProbe.handbackExit, 0)
  }
 }
}
''')
        write('tst_watchdog.qml', QML)
        env = {**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'QT_QUICK_BACKEND': 'software'}
        result = subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', str(tmp / 'tst_watchdog.qml'), '-import', str(tmp / 'imports'), '-import', str(tmp)],
                                env=env, text=True, capture_output=True, timeout=90)
        print(result.stdout + result.stderr)
        if result.returncode:
            raise SystemExit(result.returncode)
        errors = ['ReferenceError:', 'TypeError:', 'Binding loop', 'Unable to assign', 'Cannot assign', 'is not a type', 'is not defined']
        assert not any(error in result.stdout + result.stderr for error in errors), 'runtime QML diagnostics'


if __name__ == '__main__':
    run()
