import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Optional minute-resolution day progress, inside the existing bar footprint.
// No keyboard/pointer target, display reservation, or per-frame timer.
Scope {
  id: root
  required property var modelData
  property var bar: null
  SystemClock { id: clock; precision: SystemClock.Minutes }
  PanelWindow {
    id: line
    screen: root.modelData
    readonly property bool top: !root.bar || root.bar.position === "top"
    readonly property real scale: Math.max(1, devicePixelRatio)
    readonly property real barSize: root.bar && root.bar.barSizeFor ? root.bar.barSizeFor(screen.name) : root.bar ? root.bar.barSize : 0
    visible: !!root.bar && !root.bar.barHidden && !remap.remapping && barSize > 0
      && (root.bar.position === "top" || root.bar.position === "bottom")
    color: "transparent"; surfaceFormat.opaque: false
    anchors { left: true; right: true; top: line.top; bottom: !line.top }
    margins.top: top ? Math.max(0, barSize - implicitHeight) : 0
    margins.bottom: top ? 0 : Math.max(0, barSize - implicitHeight)
    implicitHeight: Math.max(2, Math.ceil(2 / scale))
    exclusionMode: ExclusionMode.Ignore
    mask: Region {}
    WlrLayershell.namespace: "tusche-bar-day-progress"
    // Match the native bar's fullscreen stacking, including Lua Hyprland
    // builds whose Quickshell monitor metadata is unavailable.
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    ScreenMoveRemap { id: remap; window: line }
    Rectangle {
      y: line.top ? parent.height - height : 0
      height: 1 / line.scale
      width: Math.floor(parent.width * (clock.date.getHours() * 60 + clock.date.getMinutes()) / 1440 * line.scale) / line.scale
      color: Commons.Color.accent; opacity: 0.65
    }
  }
}
