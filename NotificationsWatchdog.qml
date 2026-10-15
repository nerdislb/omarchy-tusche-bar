import QtQuick
import Quickshell.Io
import "Watchdog.js" as Watchdog

// Hands Omarchy's notification service back when the island took it over and
// then went silent (decisions: Watchdog.js). One instance, in the engine.
//
// A look is one short shell command: nothing without the island's marker file,
// else `omarchy-shell notifications ping` with a time limit. The hand-back is
// the same two steps the island itself uses when it lets go: enable the plugin,
// then remove the marker. The marker path is an argument, never part of the
// script text.
Item {
  id: root
  visible: false
  width: 0; height: 0

  property bool enabled: false            // the engine: config loaded and omarchy.notifications is disabled
  property string markerPath: ""
  property int firstMs: Watchdog.FIRST_MS
  property int fastMs: Watchdog.FAST_MS
  property int slowMs: Watchdog.SLOW_MS
  property var clock: function() { return Date.now() }

  property var model: Watchdog.initial()
  property string note: ""                // what the last hand-back did, for Health

  Component.onCompleted: sync()
  onEnabledChanged: sync()

  function sync() {
    look.stop()
    if (!enabled) {
      probe.running = false
      // what already went back, and when, is kept: Health shows it and the pause holds
      model = Object.assign(Watchdog.initial(), { handedBacks: model.handedBacks, handedBackAt: model.handedBackAt })
      return
    }
    look.interval = firstMs
    look.restart()
  }
  function schedule() {
    if (!enabled) return
    look.interval = Watchdog.nextDelay(model) === Watchdog.FAST_MS ? fastMs : slowMs
    look.restart()
  }
  function onAnswer(text) {
    if (!enabled) return
    var result = Watchdog.step(model, Watchdog.classify(text), clock())
    model = result.state
    if (result.action === "handback") {
      note = "Handing Omarchy's notification service back (the island stayed silent) …"
      handback.running = true
      return
    }
    schedule()
  }

  Timer { id: look; onTriggered: if (root.enabled && !probe.running) probe.running = true }

  Process {
    id: probe
    command: ["sh", "-c",
      "[ -f \"$1\" ] || { echo nomarker; exit 0; }; timeout 4 omarchy-shell notifications ping 2>/dev/null || echo silent",
      "sh", root.markerPath]
    stdout: StdioCollector { onStreamFinished: root.onAnswer(text) }
  }

  Process {
    id: handback
    command: ["sh", "-c",
      "[ -f \"$1\" ] && omarchy-plugin-enable omarchy.notifications && rm -f \"$1\"",
      "sh", root.markerPath]
    onExited: function(code) {
      if (code === 0) root.model = Watchdog.handedBack(root.model)
      root.note = code === 0 ? "Omarchy's notification service was handed back (the island stayed silent)"
                             : "Handing the notification service back failed (exit " + code + ")"
      root.schedule()
    }
  }

  function stateObject() {
    return { enabled: enabled, armed: model.armed, misses: model.misses, handedBacks: model.handedBacks,
             lastOk: model.lastOk === -Infinity ? null : model.lastOk, note: note }
  }
}
