import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import qs.Ui
import "bridge" as Bridge

// The bar's light and shadow from the current theme (option `edge theme`).
// A theme opts in with bar-material.json; its `edge` object decides what
// hangs under the bar (bar round 03.10.2026, recommendation „stille Kante“):
//
//   kind "dry"   – `line`: a line over the bar's lower edge (Tusche: light,
//                  Papier: ink), on the Overlay layer;
//                  below the bar: `shadow` (a short hard shadow), `glow`
//                  (light right under the line) and `haze` (a still gradient
//                  that runs out downwards).
//   kind "lavur" – `texture`: a pre-rendered wash (PNG in the theme folder,
//                  1920 px wide, starting `top` px above the bar's lower
//                  edge); `fallback` (a dry edge) while the image is missing.
//   kind "metal" – a chrome tube along the bar's lower edge (MetalShape, the
//                  theme's material.metal: Chrom & Platin) that stands still
//                  (a glint along the whole bar on every change was too much;
//                  material.metal `edgeGlint: true` brings it back);
//                  `haze` below the bar as with "dry".
//
// Below the bar lives on the Top layer: on Bottom, Hyprland here blends a
// layer surface additively (alpha ignored – a black haze never shows). So
// that it never darkens a window, it only reaches into the gap above the
// windows while the workspace has any (Hyprland's gaps_out), and runs out
// in full on an empty one. Nothing moves; everything hides under fullscreen.
Scope {
  id: root

  required property var modelData
  property var spec: null           // the theme's `edge` object
  property string themeDir: ""
  // bumped on every theme switch: both Lavur themes name their texture
  // bar-lavur.png, so the Image must be told to load it again
  property int stamp: 0
  property int barHeight: Style.bar.sizeHorizontal

  readonly property bool lavur: !!spec && spec.kind === "lavur" && !!spec.texture
  readonly property var metal: !!spec && spec.kind === "metal" ? Bridge.ModuleBus.metal : null
  readonly property var dry: !spec ? null : (spec.kind === "dry" || spec.kind === "metal" ? spec : (lavur && texture.status === Image.Error ? spec.fallback || null : null))

  function rgba(hex, alpha) {
    var c = Qt.color(hex || "#000000")
    return Qt.rgba(c.r, c.g, c.b, alpha === undefined ? 1 : alpha)
  }

  // the line over the bar's lower edge (exactly whole device pixels)
  PanelWindow {
    id: lineWin
    screen: root.modelData
    readonly property var line: root.dry ? root.dry.line || null : null
    readonly property real scale: devicePixelRatio > 0 ? devicePixelRatio : 1
    // metal: room for the tube and its soft edge
    readonly property real tube: root.metal ? Number(root.metal.rim || 1.6) : 0
    readonly property int px: root.metal ? Math.max(2, Math.round((tube + 1) * scale)) : line ? Math.max(1, Math.round((line.width || 1) * scale)) : 1
    readonly property var geometry: {
      // one transparent device pixel above the line: a 1 px tall layer surface is never drawn
      var bottom = Math.round(root.barHeight * scale)
      var top = Math.floor((bottom - px - 1) / scale)
      var origin = Math.round(top * scale)
      return { top: top, height: Math.max(1, Math.ceil((bottom - origin) / scale)), lineY: (bottom - origin - px) / scale }
    }
    readonly property var hyprMonitor: Hyprland.monitorFor(screen)
    readonly property bool fullscreen: !hyprMonitor || !hyprMonitor.activeWorkspace || hyprMonitor.activeWorkspace.hasFullscreen
    visible: (!!line || !!root.metal) && !fullscreen
    color: "transparent"
    surfaceFormat.opaque: false
    anchors { top: true; left: true; right: true }
    margins.top: geometry.top
    implicitHeight: geometry.height
    // Ignore alone: an exclusiveZone would force Normal and push it below the bar.
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "tusche-bar-theme-line"
    WlrLayershell.layer: WlrLayer.Overlay
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    mask: Region {}
    // Hyprland 0.57 moves the surface with its monitor (Omarchy's
    // ScreenMoveRemap is gone), so there is no remap pulse to hide for.

    Rectangle {
      visible: !root.metal
      y: lineWin.geometry.lineY
      width: parent.width
      height: lineWin.px / lineWin.scale
      color: lineWin.line ? root.rgba(lineWin.line.color, lineWin.line.alpha) : "transparent"
    }
    // the chrome tube: the lower rim of a shape far wider and taller than the
    // window, so only its bottom edge shows, ending on the bar's lower edge
    MetalShape {
      id: edgeMetal
      visible: !!root.metal
      spec: root.metal
      tube: lineWin.tube
      x: -40
      width: parent.width + 80
      height: 400
      y: parent.height - height + pad
      Connections {
        target: Bridge.ModuleBus
        function onMetalPulse() { if (root.metal && root.metal.edgeGlint === true) edgeMetal.play() }
      }
    }
  }

  // the gap above tiled windows (Hyprland general:gaps_out, top value);
  // read again on config reloads and whenever windows come or go
  property int gap: 5
  function readGap() { if (!gapReader.running) gapReader.running = true }
  Connections {
    target: Hyprland
    function onRawEvent(event) { if (event && event.name === "configreloaded") root.readGap() }
  }
  Process {
    id: gapReader
    running: true
    command: ["hyprctl", "getoption", "general:gaps_out", "-j"]
    stdout: StdioCollector {
      onStreamFinished: {
        try {
          var o = JSON.parse(text), v = String(o.custom || o.int || "5").trim().split(/\s+/)[0]
          var n = parseInt(v, 10)
          if (n >= 0) root.gap = n
        } catch (e) {}
      }
    }
  }

  // shadow, glow and haze – or the Lavur wash – below the bar
  PanelWindow {
    id: underWin
    screen: root.modelData
    readonly property var hyprMonitor: Hyprland.monitorFor(screen)
    readonly property var workspace: hyprMonitor ? hyprMonitor.activeWorkspace : null
    readonly property bool fullscreen: !workspace || workspace.hasFullscreen
    // windows on this workspace: only the gap above them (never over a window)
    readonly property bool busy: !workspace || !workspace.toplevels || workspace.toplevels.values.length > 0
    readonly property int windows: workspace && workspace.toplevels ? workspace.toplevels.values.length : -1
    onWindowsChanged: root.readGap()
    // a surface under 2 px is never drawn: with no real gap there is nothing to show
    readonly property real height_: busy ? Math.min(depth + top, root.gap) : depth + top
    readonly property real top: root.lavur && texture.status !== Image.Error ? Number(root.spec.top || 0) : 0
    readonly property real depth: {
      if (root.lavur && texture.status !== Image.Error) return texture.implicitHeight > 0 ? texture.implicitHeight : 140
      var d = root.dry
      if (!d) return 1
      return Math.max(d.haze ? d.haze.height || 0 : 0, d.glow ? d.glow.height || 0 : 0, d.shadow ? d.shadow.height || 0 : 0, 1)
    }
    visible: (!!root.dry || root.lavur) && !fullscreen && height_ >= 2
    color: "transparent"
    surfaceFormat.opaque: false
    anchors { top: true; left: true; right: true }
    // the Lavur wash starts a little above the bar's edge: skip that part (it is the bar's own colour)
    margins.top: root.barHeight
    implicitHeight: Math.max(2, Math.ceil(height_))
    exclusionMode: ExclusionMode.Ignore
    WlrLayershell.namespace: "tusche-bar-theme-edge"
    WlrLayershell.layer: WlrLayer.Top
    WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
    mask: Region {}

    Image {
      id: texture
      visible: root.lavur && status === Image.Ready
      y: underWin.top
      width: parent.width
      height: implicitHeight
      source: root.lavur ? "file://" + root.themeDir + "/" + root.spec.texture : ""
      // a theme switch between the two Lavur themes keeps the same URL: reload
      Connections {
        target: root
        function onStampChanged() {
          if (!root.lavur) return
          texture.source = ""
          Qt.callLater(function() { texture.source = Qt.binding(function() { return root.lavur ? "file://" + root.themeDir + "/" + root.spec.texture : "" }) })
        }
      }
      fillMode: Image.Stretch
      cache: false
      smooth: true
    }

    // dry: haze first, then the glow and the hard shadow on top of it
    Rectangle {
      id: haze
      readonly property var spec: root.dry ? root.dry.haze || null : null
      // three stops [position, alpha] (bar round materials); missing ones run out to 0
      function stop(i, k, d) { var s = spec && Array.isArray(spec.stops) ? spec.stops[i] : null; return s ? Number(s[k]) : d }
      visible: !!spec
      width: parent.width
      height: spec ? spec.height : 0
      gradient: Gradient {
        GradientStop { position: haze.stop(0, 0, 0); color: root.rgba(haze.spec ? haze.spec.color : "#000000", haze.stop(0, 1, 0.8)) }
        GradientStop { position: haze.stop(1, 0, 0.5); color: root.rgba(haze.spec ? haze.spec.color : "#000000", haze.stop(1, 1, 0.3)) }
        GradientStop { position: haze.stop(2, 0, 1); color: root.rgba(haze.spec ? haze.spec.color : "#000000", haze.stop(2, 1, 0)) }
      }
    }
    Rectangle {
      id: glow
      readonly property var spec: root.dry ? root.dry.glow || null : null
      visible: !!spec
      width: parent.width
      height: spec ? spec.height : 0
      gradient: Gradient {
        GradientStop { position: 0; color: glow.spec ? root.rgba(glow.spec.color, glow.spec.alpha) : "transparent" }
        GradientStop { position: 1; color: glow.spec ? root.rgba(glow.spec.color, 0) : "transparent" }
      }
    }
    Rectangle {
      readonly property var shadow: root.dry ? root.dry.shadow || null : null
      visible: !!shadow
      width: parent.width
      height: shadow ? shadow.height : 0
      color: shadow ? root.rgba(shadow.color, shadow.alpha) : "transparent"
    }
  }
}
