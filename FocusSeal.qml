import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import Quickshell.Services.UPower
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "FocusSeal.js" as Model
import "IdleDirector.js" as IdleLife
import "bridge" as Bridge
import "modules" as Modules

// A return path while the real bar is hidden. It reserves no screen space
// and never steals keyboard focus. Native widgets keep their own services.
// Calm until it matters: the seal shows a thin battery line when the charge is
// low and a small square when a workspace wants you (FocusSeal.js). A click
// brings the bar back, the middle button opens the Control Center.
// With `seal: omi` the face is Omi (modules/OmiFace.qml, if he is installed): the
// same facts plus what the island reports (CompanionFeed.qml), said by his face,
// a speech bubble with a counter and a blinking battery.
PanelWindow {
  id: sealWindow
  property var host: null
  screen: {
    var name = Bridge.ModuleBus.focusedScreenName()
    for (var i = 0; i < Quickshell.screens.length; i++) if (Quickshell.screens[i].name === name) return Quickshell.screens[i]
    return Quickshell.screens.length ? Quickshell.screens[0] : null
  }
  visible: !!host && (host.options.seal === "on" || host.options.seal === "omi") && !!host.edgeBar && host.edgeBar.barHidden && !remap.remapping
  color: "transparent"; surfaceFormat.opaque: false
  anchors { top: true; right: true }
  margins { top: Style.space(8); right: Style.space(8) }
  implicitWidth: Style.space(useOmi ? 66 : 34); implicitHeight: implicitWidth
  exclusionMode: ExclusionMode.Ignore
  WlrLayershell.namespace: "tusche-bar-focus-seal"
  WlrLayershell.layer: WlrLayer.Top
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
  ScreenMoveRemap { id: remap; window: sealWindow }

  // Facts: UPower's display device (the same public service the island reads) and
  // the workspaces that want you, from the bar's own workspace module or, with
  // native workspaces, from Hyprland's public list. Read only while the seal shows.
  readonly property var battery: UPower.displayDevice
  readonly property bool hasBattery: !!(battery && battery.isPresent)
  readonly property real level: hasBattery ? Math.max(0, Math.min(1, Number(battery.percentage) || 0)) : 0
  readonly property bool charging: hasBattery && battery.state !== UPowerDeviceState.Discharging
    && battery.state !== UPowerDeviceState.Empty && battery.state !== UPowerDeviceState.Unknown
  readonly property int urgentCount: {
    if (!visible) return 0
    var w = Bridge.ModuleBus.pick("workspaces")
    var native = Hyprland.workspaces ? Hyprland.workspaces.values.map(function(x) { return { urgent: x.urgent === true } }) : []
    return Model.urgentCount(w && w.urgentIds ? w.urgentIds : null, native)
  }
  readonly property var facts: ({ battery: { present: hasBattery, level: level, charging: charging }, urgent: urgentCount })
  readonly property var sealState: Model.state(facts)
  readonly property string said: Model.describe(sealState, level)

  // The Omi face, when it is asked for and installed; else the plain seal below.
  readonly property bool wantsOmi: !!host && host.options.seal === "omi"
  readonly property bool useOmi: wantsOmi && omiFace.available
  readonly property string dataDir: (Quickshell.env("XDG_DATA_HOME") || (Quickshell.env("HOME") + "/.local/share")) + "/tusche-bar"
  CompanionFeed { id: feed; active: sealWindow.visible && sealWindow.useOmi }
  // His idle life ("lively", "gentle", "off") and whether you are away (IdleWatch.qml).
  readonly property string intensity: !!host ? String(host.options.sealIdle) : "lively"
  IdleWatch {
    id: idleWatch
    active: sealWindow.visible && sealWindow.useOmi && sealWindow.intensity !== "off"
    seconds: IdleLife.idleSeconds(sealWindow.intensity)
  }
  // The IPC preview: `omarchy-shell tusche-bar omi fly|yawn|sleep|wake|clock|stop|…`.
  function omiPlay(name) { return omiFace.play(String(name)) }
  // For the engine's state IPC: is he there, is his idle life on, are you away, is he asleep.
  function omiState() {
    return { wanted: wantsOmi, available: omiFace.available, shown: useOmi && visible, intensity: intensity,
             idleMonitor: idleWatch.active, away: idleWatch.idle, asleep: omiFace.asleep, face: companion.face }
  }
  readonly property var companion: Model.companion({ battery: facts.battery, urgent: urgentCount, island: feed.island })
  property var lastIsland: null
  Connections {
    target: feed
    function onIslandChanged() {
      var seen = Model.observe(sealWindow.lastIsland, feed.island)
      sealWindow.lastIsland = feed.island
      if (seen.done) omiFace.react()
      if (seen.pop) omiFace.pop()
    }
  }

  Modules.OmiFace {
    id: omiFace
    anchors.fill: parent
    visible: sealWindow.useOmi
    // Loaded while the option is on, so the window opens at Omi's size at once; a hidden
    // window costs nothing (Omi only animates while on screen).
    active: sealWindow.wantsOmi
    onScreen: sealWindow.visible
    packUrl: "file://" + sealWindow.dataDir + "/omi/Omi.qml"
    intensity: sealWindow.intensity
    userIdle: idleWatch.idle
    hovered: hover.hovered
    companion: sealWindow.companion
    HoverHandler { id: hover }
    ground: Commons.Color.popups.background
    accent: Commons.Color.accent
    urgent: Commons.Color.urgent
    MouseArea {
      anchors.fill: parent; cursorShape: Qt.PointingHandCursor
      acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
      onClicked: function(mouse) { sealWindow.act(mouse.button === Qt.MiddleButton ? "middle" : "primary") }
    }
    Accessible.role: Accessible.Button
    Accessible.name: "Focus seal. Show the bar; middle-click opens the Control Center." + (omiFace.said ? " " + omiFace.said + "." : "")
    Accessible.onPressAction: sealWindow.act("primary")
  }

  FocusSealFace {
    id: seal
    visible: !sealWindow.useOmi
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
