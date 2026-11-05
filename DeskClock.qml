import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// The pixel style's desktop clock: hours and minutes in the shell's pixel
// face, the date below and the day as 24 cells, on the wallpaper under every
// window. Minute resolution, no input, no reserved space, no frame timer.
Scope {
  id: root
  required property var modelData
  property var bar: null
  SystemClock { id: clock; precision: SystemClock.Minutes }
  readonly property var weekdays: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  readonly property var months: ["january", "february", "march", "april", "may", "june", "july", "august",
                                 "september", "october", "november", "december"]
  PanelWindow {
    id: desk
    screen: root.modelData
    readonly property real barSize: root.bar && root.bar.barSizeFor ? root.bar.barSizeFor(screen.name) : root.bar ? root.bar.barSize : 0
    readonly property bool barTop: !root.bar || root.bar.position === "top"
    color: "transparent"; surfaceFormat.opaque: false
    anchors { left: true; top: true }
    margins.left: 34
    margins.top: (barTop ? barSize : 0) + 30
    implicitWidth: 320
    implicitHeight: 130
    exclusionMode: ExclusionMode.Ignore
    mask: Region {}
    WlrLayershell.namespace: "tusche-bar-desk-clock"
    WlrLayershell.layer: WlrLayer.Bottom
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

    readonly property color ink: Commons.Color.foreground
    // sizes on the pixel font's grid ([tusche] pixel-em/pixel-text from the
    // pixel style; Tiny5: 8 and 16, so 64 and 16 stay as they are)
    readonly property var shellValues: Commons.Color.shellValues || {}
    readonly property int em: Math.max(1, Math.round(Number(shellValues["tusche.pixel-em"])) || 8)
    readonly property int minText: Math.max(1, Math.round(Number(shellValues["tusche.pixel-text"])) || 16)
    function onGrid(px) { return Math.max(minText, Math.round(px / em) * em) }
    Text {
      id: time
      renderType: Text.NativeRendering
      antialiasing: false
      textFormat: Text.PlainText
      text: Qt.formatTime(clock.date, "hh:mm")
      font.family: Style.font.family
      font.pixelSize: desk.onGrid(64)
      color: Util.alpha(desk.ink, 0.92)
    }
    Text {
      id: day
      y: time.height + 2
      renderType: Text.NativeRendering
      antialiasing: false
      textFormat: Text.PlainText
      text: root.weekdays[clock.date.getDay()] + ", " + clock.date.getDate() + " " + root.months[clock.date.getMonth()]
      font.family: Style.font.family
      font.pixelSize: desk.onGrid(16)
      color: Util.alpha(desk.ink, 0.55)
    }
    Row {
      y: day.y + day.height + 8
      spacing: 2
      Repeater {
        model: 24
        Rectangle {
          required property int index
          readonly property int hour: clock.date.getHours()
          width: 8; height: 3
          antialiasing: false
          color: index < hour ? Util.alpha(desk.ink, 0.5) : index === hour ? Commons.Color.accent : Util.alpha(desk.ink, 0.12)
        }
      }
    }
  }
}
