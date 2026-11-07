import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import "bridge" as Bridge
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
    margins.top: 0
    margins.bottom: 0
    implicitHeight: nowNotch.visible ? 5 : Math.max(2, Math.ceil(2 / scale))
    exclusionMode: ExclusionMode.Ignore
    mask: Region {}
    WlrLayershell.namespace: "tusche-bar-day-progress"
    // Match the native bar's fullscreen stacking, including Lua Hyprland
    // builds whose Quickshell monitor metadata is unavailable.
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    ScreenMoveRemap { id: remap; window: line }
    // Light of the day: the gradient spans 24 h across the full width and the
    // clip reveals it up to now, so the line's colour at any point is the
    // colour of the sky at that time (night grey, dawn blue, red, midday
    // yellow, evening orange, night grey).
    Item {
      id: progress
      y: line.top ? 0 : parent.height - height
      height: 1 / line.scale
      width: Math.floor(parent.width * (clock.date.getHours() * 60 + clock.date.getMinutes()) / 1440 * line.scale) / line.scale
      clip: true
      opacity: 0.8
      Rectangle {
        height: parent.height
        width: line.width
        gradient: Gradient {
          orientation: Gradient.Horizontal
          GradientStop { position: 0.00; color: "#2b2b33" }
          GradientStop { position: 0.17; color: "#3b4a7a" }
          GradientStop { position: 0.23; color: "#6f9bff" }
          GradientStop { position: 0.31; color: "#ff6b7d" }
          GradientStop { position: 0.45; color: "#ffd68f" }
          GradientStop { position: 0.58; color: "#ffe27a" }
          GradientStop { position: 0.75; color: "#ffb27a" }
          GradientStop { position: 0.87; color: "#6a4a4a" }
          GradientStop { position: 1.00; color: "#2b2b33" }
        }
      }
    }
    Rectangle {
      id: nowNotch
      visible: !!Bridge.ModuleBus.engine && Bridge.ModuleBus.engine.options.daylineNow === "on"
      x: Math.max(0, Math.min(line.width - width, progress.width - width / 2))
      y: line.top ? 0 : line.height - height
      width: 2
      height: 5
      color: Commons.Color.accent
    }

  }
}
