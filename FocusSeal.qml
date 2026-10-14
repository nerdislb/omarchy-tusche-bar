import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "modules" as Modules
import "bridge" as Bridge

// A return path while the real bar is hidden. It reserves no screen space
// and never steals keyboard focus. Native widgets keep their own services.
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
  Rectangle {
    anchors.fill: parent
    color: Commons.Color.popups.background
    border.width: Math.max(1, Style.normalBorderWidth)
    border.color: Commons.Color.popups.border
    Modules.SealLogo { anchors.centerIn: parent; ink: Commons.Color.popups.text; pressed: pointer.pressed; pressInk: Commons.Color.accent }
    MouseArea {
      id: pointer
      anchors.fill: parent; cursorShape: Qt.PointingHandCursor
      acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
      onClicked: function(mouse) {
        if (mouse.button === Qt.LeftButton) sealWindow.host.open('{"area":"quick"}')
        else sealWindow.host.focusAction("show")
      }
    }
    Accessible.role: Accessible.Button
    Accessible.name: "Focus seal. Open the control center; right-click to restore the bar."
    Accessible.onPressAction: if (sealWindow.host) sealWindow.host.open('{"area":"quick"}')
  }
}
