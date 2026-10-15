import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Services.UPower
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "FocusSeal.js" as Model
import "bridge" as Bridge

// A return path while the real bar is hidden. It reserves no screen space
// and never steals keyboard focus. Native widgets keep their own services.
// Calm until it matters: the seal shows a thin battery line when the charge is
// low and a small square when a workspace wants you (FocusSeal.js). A click
// brings the bar back, the middle button opens the Control Center.
PanelWindow {
  id: sealWindow
  property var host: null
  screen: {
    var name = Bridge.ModuleBus.focusedScreenName()
    for (var i = 0; i < Quickshell.screens.length; i++) if (Quickshell.screens[i].name === name) return Quickshell.screens[i]
    return Quickshell.screens.length ? Quickshell.screens[0] : null
  }
  visible: !!host && host.options.seal === "on" && !!host.edgeBar && host.edgeBar.barHidden && !remap.remapping
  color: "transparent"; surfaceFormat.opaque: false
  anchors { top: true; right: true }
  margins { top: Style.space(8); right: Style.space(8) }
  implicitWidth: Style.space(34); implicitHeight: Style.space(34)
  exclusionMode: ExclusionMode.Ignore
  WlrLayershell.namespace: "tusche-bar-focus-seal"
  WlrLayershell.layer: WlrLayer.Top
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
  ScreenMoveRemap { id: remap; window: sealWindow }

  // Facts: UPower's display device (the same public service the island reads)
  // and the workspaces the bar's own module reports as urgent. Read only while
  // the seal is showing.
  readonly property var battery: UPower.displayDevice
  readonly property bool hasBattery: !!(battery && battery.isPresent)
  readonly property real level: hasBattery ? Math.max(0, Math.min(1, Number(battery.percentage) || 0)) : 0
  readonly property bool charging: hasBattery && battery.state !== UPowerDeviceState.Discharging
    && battery.state !== UPowerDeviceState.Empty && battery.state !== UPowerDeviceState.Unknown
  readonly property var urgentIds: {
    var w = visible ? Bridge.ModuleBus.pick("workspaces") : null
    return w && w.urgentIds ? w.urgentIds : []
  }
  readonly property var facts: ({ battery: { present: hasBattery, level: level, charging: charging }, urgent: urgentIds.length })
  readonly property var sealState: Model.state(facts)
  readonly property string said: Model.describe(sealState, level)

  FocusSealFace {
    id: seal
    anchors.fill: parent
    ground: Commons.Color.popups.background
    ink: Commons.Color.popups.text
    accent: Commons.Color.accent
    urgent: Commons.Color.urgent
    frame: Commons.Color.popups.border
    frameWidth: Math.max(1, Style.normalBorderWidth)
    facts: sealWindow.facts
    pressed: pointer.pressed
    MouseArea {
      id: pointer
      anchors.fill: parent; cursorShape: Qt.PointingHandCursor
      acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
      onClicked: function(mouse) { sealWindow.act(mouse.button === Qt.MiddleButton ? "middle" : "primary") }
    }
    Accessible.role: Accessible.Button
    Accessible.name: "Focus seal. Show the bar; middle-click opens the Control Center." + (sealWindow.said ? " " + sealWindow.said + "." : "")
    Accessible.onPressAction: sealWindow.act("primary")
  }

  function act(button) {
    if (!host) return
    if (Model.clickAction(button) === "open") host.open('{"area":"quick"}')
    else host.focusAction("show")
  }
}
