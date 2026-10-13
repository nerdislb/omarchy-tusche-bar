import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import Quickshell.Io
import "GlassMath.js" as GlassMath

// Reconstruct only the rectangle under a glass card. Toplevel-only capture
// cannot contain this shell's layer surfaces (no screen-copy feedback).
// All images remain GPU/RAM textures; nothing is saved or sent anywhere.
Item {
  id: root
  property bool active: false
  property bool live: true
  property var screen: null
  property real screenX: 0
  property real screenY: 0
  property color fallback: "#161d27"
  // Optional authored source for the native render acceptance harness.
  property url testBackground: ""
  property string backgroundPath: ""
  readonly property var monitor: screen ? Hyprland.monitorFor(screen) : null
  readonly property var region: ({ x: screen ? screen.x + screenX : screenX,
                                  y: screen ? screen.y + screenY : screenY,
                                  w: width, h: height })
  readonly property var monitorState: monitor ? monitor.lastIpcObject : null
  // Do not export application content on a sleeping or locked output.
  // These are Hyprland's ordinary monitor-status fields, not a lock service
  // capability or an authentication bypass.
  readonly property bool blocked: !monitorState || monitorState.dpmsStatus === false
    || (Array.isArray(monitorState.solitaryBlockedBy) && monitorState.solitaryBlockedBy.indexOf("LOCK") !== -1)
  readonly property bool captures: active && !!monitor && !blocked && !testBackground.toString()
  readonly property var clients: captures ? Hyprland.toplevels.values : []
  readonly property int readyCount: {
    var n = 0
    for (var i = 0; i < previews.count; i++) { var v = previews.itemAt(i); if (v && v.hasContent) n++ }
    return n
  }
  clip: true

  Rectangle { anchors.fill: parent; color: root.fallback }
  Image {
    id: wallpaper
    source: root.active ? (root.testBackground.toString() ? root.testBackground : root.backgroundPath ? "file://" + root.backgroundPath : "") : ""
    asynchronous: true
    cache: false
    x: -root.screenX
    y: -root.screenY
    width: root.screen ? root.screen.width : root.width
    height: root.screen ? root.screen.height : root.height
    fillMode: Image.PreserveAspectCrop
  }

  function refresh() {
    if (!active) return
    if (!testBackground.toString() && !background.running) background.running = true
    if (monitor && !testBackground.toString()) Hyprland.refreshMonitors()
    if (captures) Hyprland.refreshToplevels()
  }
  onActiveChanged: { if (active) refresh(); else backgroundPath = "" }
  onScreenChanged: refresh()
  // Only while visible. Geometry and the wallpaper link may change without
  // a theme switch; a one-second fallback refresh is not a frame timer.
  Timer { interval: 1000; repeat: true; running: root.active && root.live; onTriggered: root.refresh() }
  Timer { id: geometryRefresh; interval: 32; onTriggered: root.refresh() }
  Connections {
    target: Hyprland
    function onRawEvent(event) {
      if (root.captures && event && /^(openwindow|closewindow|movewindow|workspace|focusedmon|activewindow|changefloatingmode|fullscreen|configreloaded)/.test(event.name)) geometryRefresh.restart()
    }
  }
  Process {
    id: background
    command: ["readlink", "-f", Quickshell.env("HOME") + "/.local/state/omarchy/current/background"]
    stdout: StdioCollector {
      onStreamFinished: {
        var p = text.trim()
        // Video/GIF backgrounds retain the solid fallback. No second decoder
        // or unsynchronised video is spawned in every popup.
        if (root.active) root.backgroundPath = /\.(png|jpe?g|webp|bmp|avif)$/i.test(p) ? p : ""
      }
    }
  }
  Repeater {
    id: previews
    model: root.clients
    delegate: ScreencopyView {
      required property var modelData
      readonly property var client: modelData ? modelData.lastIpcObject : null
      readonly property var geo: GlassMath.clientRect(client, root.monitor ? root.monitor.lastIpcObject : null, root.region)
      readonly property bool eligible: root.captures && !!geo && !!modelData.wayland
      x: geo ? geo.x : 0
      y: geo ? geo.y : 0
      width: geo ? geo.w : 1
      height: geo ? geo.h : 1
      // Hyprland exposes focus history, not compositor stacking order. Tiled
      // windows do not overlap; floating windows and the latest focus win.
      z: geo ? geo.z + 1000 - Math.min(999, Number(client.focusHistoryID) || 0) : 0
      visible: eligible && hasContent
      captureSource: eligible ? modelData.wayland : null
      constraintSize: Qt.size(Math.min(width, 1600), Math.min(height, 1000))
      live: eligible && root.live
      paintCursor: false
    }
  }
}
