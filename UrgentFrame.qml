import QtQuick
import Quickshell.Hyprland
import qs.Commons as Commons
import "UrgentFrame.js" as Frame

// Bar option `urgentFrame`: a window that asks for you gets the theme's urgent
// colour as its inactive border until it is focused or closed (UrgentFrame.js).
// One instance, in the engine. Event-driven: nothing runs while nothing is urgent.
Item {
  id: root
  visible: false
  width: 0; height: 0

  property bool enabled: false
  property var run: null                    // function(argv): the engine passes Quickshell.execDetached
  property color urgentColour: Commons.Color.urgent
  property var model: Frame.initial()
  property int sent: 0

  // rrggbb of the colour, without relying on string conversion of the Qt type
  function hex(c) {
    function h(v) { var s = Math.round(v * 255).toString(16); return s.length < 2 ? "0" + s : s }
    return "#" + h(c.r) + h(c.g) + h(c.b)
  }
  function send(commands) {
    if (typeof run !== "function") return
    for (var i = 0; i < commands.length; i++) { run(commands[i]); sent++ }
  }
  function onEvent(name, data) {
    if (!enabled) return
    var r = Frame.handle(model, name, data, hex(urgentColour))
    model = r.state
    send(r.commands)
  }
  onEnabledChanged: if (!enabled) { var r = Frame.release(model); model = r.state; send(r.commands) }
  onUrgentColourChanged: if (enabled && model.urgent.length) { var r = Frame.recolour(model, hex(urgentColour)); model = r.state; send(r.commands) }

  Connections {
    target: Hyprland
    enabled: root.enabled
    function onRawEvent(event) { if (event) root.onEvent(String(event.name), event.data) }
  }

  function stateObject() { return { enabled: enabled, urgent: model.urgent.slice(), sent: sent } }
}
