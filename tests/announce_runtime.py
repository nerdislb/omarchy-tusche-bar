#!/usr/bin/env python3
"""Run the real Announcer.qml with fake PipeWire and BlueZ services, off the desktop.

Only the two service modules and the clock are fixtures; Announcer.qml and
Announce.js are the production files. Nothing here talks to the compositor, the
OSD or any device: the engine's `emit` is replaced by a recorder.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

QML = r'''import QtQuick
import QtTest
import Quickshell.Bluetooth
import Quickshell.Services.Pipewire

Item {
 id: canvas
 width: 100; height: 100
 property var lines: []
 property real offset: 0
 function stamp() { return Date.now() + canvas.offset }
 function newSink(name, description) { return Qt.createQmlObject('import QtQuick; QtObject { property string name: "' + name + '"; property string description: "' + description + '"; property string nickname: "" }', canvas) }
 readonly property string island: JSON.stringify({bar: {layout: {center: ["nerdibeard.tusche-island"]}}})
 readonly property string quiet: JSON.stringify({bar: {layout: {center: [{id: "nerdibeard.tusche-island", bluetooth: false}]}}})
 Component {
  id: make
  Announcer {
   active: true
   config: JSON.parse(canvas.quiet)
   clock: function() { return canvas.stamp() }
   emit: function(argv) { canvas.lines = canvas.lines.concat([argv]) }
  }
 }
 Component {
  id: makeCovered
  Announcer {
   active: true
   config: JSON.parse(canvas.island)
   clock: function() { return canvas.stamp() }
   emit: function(argv) { canvas.lines = canvas.lines.concat([argv]) }
  }
 }
 function reset() {
  canvas.lines = []
  canvas.offset = 0
  Pipewire.defaultAudioSink = null
  Bluetooth.defaultAdapter = null
  Bluetooth.devices = {values: []}
 }
 function adapter() { return {adapterId: "hci0", name: "hci0", enabled: true} }
 function device(name, connected, address) { return {address: address || name, name: name, deviceName: name, connected: connected} }
 TestCase {
  name: "Announcer"
  when: windowShown
  function init() { canvas.reset() }

  function test_01_a_moved_output_is_announced_once_after_a_silent_baseline() {
   Pipewire.defaultAudioSink = canvas.newSink("alsa_builtin", "Built-in Audio")
   var a = createTemporaryObject(make, canvas)
   verify(a)
   wait(120)
   compare(canvas.lines.length, 0)                         // the first reading is only the baseline
   canvas.offset += 1000                                   // past the settle window
   Pipewire.defaultAudioSink = canvas.newSink("bluez_headset", "WH-1000XM5")
   wait(160)
   compare(canvas.lines.length, 1)
   compare(canvas.lines[0], ["omarchy-osd", "-i", "volume-high", "-m", "WH-1000XM5", "-d", "2200"])
   wait(120)
   compare(canvas.lines.length, 1)                         // nothing repeats on its own
   compare(a.stateObject().announced, 1)
   compare(a.stateObject().output, "WH-1000XM5")
  }

  function test_02_the_same_output_renamed_is_quiet() {
   var sink = canvas.newSink("alsa_builtin", "Built-in Audio")
   Pipewire.defaultAudioSink = sink
   var a = createTemporaryObject(make, canvas)
   wait(120)
   canvas.offset += 1000
   sink.description = "Speakers"
   wait(160)
   compare(canvas.lines.length, 0)
  }

  function test_03_bluetooth_is_announced_only_when_the_island_does_not_show_it() {
   Bluetooth.defaultAdapter = canvas.adapter()
   Bluetooth.devices = {values: [canvas.device("Buds", false)]}
   var quiet = createTemporaryObject(make, canvas)                       // the island's bluetooth setting is off
   var island = createTemporaryObject(makeCovered, canvas)               // the island shows Bluetooth itself
   wait(120)
   canvas.offset += 5000                                                  // past the Bluetooth enumeration window
   Bluetooth.devices = {values: [canvas.device("Buds", true)]}
   wait(160)
   compare(canvas.lines.length, 1)                                        // only the instance the island does not cover
   compare(canvas.lines[0].slice(0, 5), ["omarchy-osd", "-i", "\u{f00b1}", "-m", "Connected · Buds"])
   compare(quiet.stateObject().bluetoothByIsland, false)
   compare(island.stateObject().bluetoothByIsland, true)
  }

  function test_04_a_hostile_device_name_stays_one_plain_argument() {
   Bluetooth.defaultAdapter = canvas.adapter()
   Bluetooth.devices = {values: [canvas.device("x", false, "AA:BB:CC:DD:EE:FF")]}
   var a = createTemporaryObject(make, canvas)
   wait(120)
   canvas.offset += 5000
   // the same device, now connected and carrying a hostile name
   Bluetooth.devices = {values: [canvas.device("<img src=\"https://example.invalid/t\"> $(touch /tmp/pwn) `id`", true, "AA:BB:CC:DD:EE:FF")]}
   wait(160)
   compare(canvas.lines.length, 1)
   compare(canvas.lines[0].length, 7)                                     // still exactly: cmd -i icon -m text -d ms
   verify(canvas.lines[0][4].indexOf("<") < 0 && canvas.lines[0][4].indexOf(">") < 0)
   verify(canvas.lines[0][4].indexOf("$(touch /tmp/pwn)") >= 0)           // literal data, never run
  }

  function test_05_a_flapping_output_ends_in_its_final_state_one_line_per_gap() {
   Pipewire.defaultAudioSink = canvas.newSink("a", "A")
   var a = createTemporaryObject(make, canvas)
   wait(120)
   canvas.offset += 1000
   Pipewire.defaultAudioSink = canvas.newSink("b", "B")
   wait(120)
   compare(canvas.lines.length, 1)
   Pipewire.defaultAudioSink = canvas.newSink("c", "C")                   // inside the gap: waits
   wait(120)
   Pipewire.defaultAudioSink = canvas.newSink("d", "D")                   // replaces the waiting one
   wait(120)
   compare(canvas.lines.length, 1)
   compare(a.stateObject().waiting, true)
   tryVerify(function() { return canvas.lines.length === 2 }, 2500)
   compare(canvas.lines[1][4], "D")
   wait(200)
   compare(canvas.lines.length, 2)
   compare(a.stateObject().waiting, false)
  }

  function test_06_disabled_is_inert_and_enabling_starts_a_fresh_baseline() {
   Pipewire.defaultAudioSink = canvas.newSink("a", "A")
   var a = createTemporaryObject(make, canvas, {active: false})
   wait(100)
   canvas.offset += 1000
   Pipewire.defaultAudioSink = canvas.newSink("b", "B")
   wait(160)
   compare(canvas.lines.length, 0)
   compare(a.outputSample.ready, false)                                   // it does not even read the services
   a.active = true
   wait(160)
   canvas.offset += 1000
   compare(canvas.lines.length, 0)                                        // the move that happened meanwhile is not replayed
   Pipewire.defaultAudioSink = canvas.newSink("c", "C")
   wait(160)
   compare(canvas.lines.length, 1)
   compare(canvas.lines[0][4], "C")
   a.active = false
   compare(a.stateObject().seq, 0)
  }

  function test_07_without_an_emit_function_nothing_is_sent_and_nothing_breaks() {
   Pipewire.defaultAudioSink = canvas.newSink("a", "A")
   var a = createTemporaryObject(make, canvas, {emit: null})
   wait(120)
   canvas.offset += 1000
   Pipewire.defaultAudioSink = canvas.newSink("b", "B")
   wait(160)
   compare(a.stateObject().announced, 1)
   compare(canvas.lines.length, 0)
  }


  function test_08_a_waiting_line_does_not_outlive_its_source() {
   Pipewire.defaultAudioSink = canvas.newSink("a", "Dock")
   var a = createTemporaryObject(make, canvas)
   wait(120)
   canvas.offset += 1000
   Pipewire.defaultAudioSink = canvas.newSink("b", "Dock 2")
   wait(120)
   compare(canvas.lines.length, 1)
   Pipewire.defaultAudioSink = canvas.newSink("c", "Headphones")      // inside the gap: waits
   wait(120)
   compare(a.stateObject().waiting, true)
   Pipewire.defaultAudioSink = null                                    // the output disappears
   wait(120)
   compare(a.stateObject().waiting, false)
   canvas.offset += 3000
   Pipewire.defaultAudioSink = canvas.newSink("d", "Speakers")         // a new baseline, silent
   wait(1900)
   compare(canvas.lines.length, 1)                                     // Headphones was never announced
  }
 }
}
'''


def run():
    with tempfile.TemporaryDirectory(prefix='tusche-announce-') as folder:
        tmp = Path(folder)
        shutil.copy2(ROOT / 'Announcer.qml', tmp / 'Announcer.qml')
        shutil.copy2(ROOT / 'Announce.js', tmp / 'Announce.js')

        def write(name, text):
            dest = tmp / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text)

        write('imports/Quickshell/Bluetooth/qmldir', 'module Quickshell.Bluetooth\nsingleton Bluetooth 1.0 Bluetooth.qml\n')
        write('imports/Quickshell/Bluetooth/Bluetooth.qml', 'pragma Singleton\nimport QtQuick\nQtObject { property var defaultAdapter: null; property var devices: ({values: []}) }\n')
        write('imports/Quickshell/Services/Pipewire/qmldir',
              'module Quickshell.Services.Pipewire\nsingleton Pipewire 1.0 Pipewire.qml\nPwObjectTracker 1.0 PwObjectTracker.qml\n')
        write('imports/Quickshell/Services/Pipewire/Pipewire.qml', 'pragma Singleton\nimport QtQuick\nQtObject { property var defaultAudioSink: null }\n')
        write('imports/Quickshell/Services/Pipewire/PwObjectTracker.qml', 'import QtQuick\nQtObject { property var objects: [] }\n')
        write('tst_announce.qml', QML)
        env = {**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'QT_QUICK_BACKEND': 'software'}
        result = subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', str(tmp / 'tst_announce.qml'), '-import', str(tmp / 'imports'), '-import', str(tmp)],
                                env=env, text=True, capture_output=True, timeout=60)
        print(result.stdout + result.stderr)
        if result.returncode:
            raise SystemExit(result.returncode)
        errors = ['ReferenceError:', 'TypeError:', 'Binding loop', 'Unable to assign', 'Cannot assign', 'is not a type', 'is not defined']
        assert not any(error in result.stdout + result.stderr for error in errors), 'runtime QML diagnostics'


if __name__ == '__main__':
    run()
