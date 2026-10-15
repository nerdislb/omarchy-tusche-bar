import QtQuick
import Quickshell.Bluetooth
import Quickshell.Services.Pipewire
import "Announce.js" as Announce

// Device announcements (bar option `statusHints`): when the default audio
// output moves, or a Bluetooth device connects or disconnects, one line goes to
// Omarchy's on-screen display. The OSD is the quiet place for it: it takes
// the theme's popup look, and when the island owns the OSD the line lands in
// the island's HUD. Nothing is added to the bar, nothing is polled, and no
// native widget is read: PipeWire and BlueZ are observed through Quickshell's
// public services. The island already announces Bluetooth devices unless its own
// `bluetooth` setting is off; then this stays quiet for Bluetooth.
//
// One instance lives in the engine. The decisions are in Announce.js.
Item {
  id: root
  visible: false
  width: 0; height: 0

  property bool enabled: false
  property var config: null                 // shell.json, for the island's Bluetooth setting
  property var emit: null                   // function(argv): the engine passes Quickshell.execDetached
  property var clock: function() { return Date.now() }

  readonly property var sink: Pipewire.defaultAudioSink
  PwObjectTracker { objects: root.sink ? [root.sink] : [] }

  readonly property var outputSample: {
    var s = root.enabled ? root.sink : null
    return { ready: !!s, id: s ? String(s.name || "") : "",
             name: s ? String(s.description || s.nickname || s.name || "") : "" }
  }
  readonly property var bluetoothSample: {
    var a = root.enabled ? Bluetooth.defaultAdapter : null
    var devices = root.enabled && Bluetooth.devices ? Bluetooth.devices.values : []
    return { ready: !!a, id: a ? String(a.adapterId || a.name || "adapter") : "", on: !!(a && a.enabled),
      devices: devices.filter(function(d) { return !!d }).map(function(d) {
        return { id: String(d.address || d.name || ""), name: String(d.name || d.deviceName || "Bluetooth device"), connected: !!d.connected }
      }) }
  }
  readonly property bool islandShowsBluetooth: Announce.islandShowsBluetooth(root.config)

  property var model: Announce.initial(false)
  property var gateState: ({ last: -Infinity, pending: null })
  property int announced: 0

  Component.onCompleted: reset()
  onEnabledChanged: reset()
  onOutputSampleChanged: schedule()
  onBluetoothSampleChanged: schedule()
  onIslandShowsBluetoothChanged: schedule()

  function reset() {
    model = Announce.configure(model, enabled)
    gateState = { last: -Infinity, pending: null }
    announced = 0
    gateTimer.stop()
    sampleTimer.stop()
    if (enabled) schedule()
  }
  // Related properties of one device change together (name, connection, radio):
  // take one reading after they settle.
  function schedule() { if (enabled) sampleTimer.restart() }
  function sampleNow() {
    if (!enabled) return
    var now = root.clock()
    var next = Announce.configure(model, true)
    next = Announce.observe(next, "output", outputSample, now, false)
    next = Announce.observe(next, "bluetooth", bluetoothSample, now, islandShowsBluetooth)
    model = next
    // a waiting line whose source is gone is dropped, not announced later
    if (gateState.pending && !Announce.stillTrue(next, gateState.pending)) {
      gateState = { last: gateState.last, pending: null }
      gateTimer.stop()
    }
    if (next.hint && next.hint.seq > announced) {
      announced = next.hint.seq
      var gated = Announce.gate(gateState, next.hint, now)
      gateState = gated.state
      if (gated.emit) send(gated.emit)
      else if (gated.delay > 0) { gateTimer.interval = gated.delay; gateTimer.restart() }
    }
  }
  function send(hint) { if (typeof emit === "function") emit(Announce.argv(hint)) }

  Timer { id: sampleTimer; interval: 35; onTriggered: root.sampleNow() }
  Timer {
    id: gateTimer
    onTriggered: {
      var released = Announce.release(root.gateState, root.clock())
      root.gateState = released.state
      if (released.emit && !Announce.stillTrue(root.model, released.emit)) return
      if (released.emit) root.send(released.emit)
      else if (released.delay > 0) { gateTimer.interval = released.delay; gateTimer.restart() }
    }
  }

  function stateObject() {
    return { enabled: enabled, seq: model.seq, announced: announced, waiting: !!gateState.pending,
             output: outputSample.ready ? outputSample.name : "", bluetoothByIsland: islandShowsBluetooth }
  }
}
