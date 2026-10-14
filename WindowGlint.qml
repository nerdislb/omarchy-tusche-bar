import QtQuick
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons

// A glint on the focused window's frame (bar option `frames`; 08.10.2026).
// Hyprland can only turn a linear gradient on its border (borderangle): in 1°
// steps, racing along the edges and lingering at the corners. So the glint is
// drawn here instead, over Hyprland's own border, in one of two styles:
//   "sweep" (frames glint) – the cards' glint: a light band crosses the frame
//            diagonally once and fades (material `sweepMs`, 900 ms, as a popup
//            opening; the quietest, the owner's pick);
//   "orbit" (frames orbit) – a comet once round the frame, placed by arc length
//            so it keeps an even pace round the corners, slowing and fading.
// Two renderers. The metal family (Chrom & Platin: material.metal) draws a
// chrome glint, MetalShape kind "frame". The glass family (Frost & Smoke:
// material.glass, 14.10.2026) has its own, quiet one, GlassFrameGlint: the
// light a Bevel Lens card catches as it opens (650 ms, wide, cool and soft, no
// steel shoulders or colour fringes), the sweep only; a theme with both takes
// the glass one. The glass glint follows the glass material switch.
//
// Only while it runs is there a surface: a click-through Overlay layer the
// size of the frame, on every monitor the frame reaches. It starts once the
// window has settled (open and workspace animations) and stops as soon as the
// window moves or resizes (watched while it runs), goes fullscreen or closes,
// or the workspace changes – it never trails a moving window. A workspace
// switch shows on the bar (rings and logo), not on the window: one glint at a
// time. trigger() glints the focused window on demand (IPC `glintWindow`),
// for other events to reuse.
Scope {
  id: root

  property bool enabled: false
  property string style: "sweep"
  // the theme's material.metal (independent of the bar's edge option)
  property var metal: null
  // the theme's material.glass, while the glass material is on: its `frame` object tunes the glass glint
  property var glass: null
  readonly property bool glassFrame: !!glass
  readonly property var glassSpec: glass && glass.frame ? glass.frame : ({})
  // the glass glint is the sweep only
  readonly property bool orbit: style === "orbit" && !glassFrame
  // orbit: one turn, the comet's lead in px (its tail is 2.5× as long);
  // sweep: as a card's glint
  readonly property int durationMs: metal && Number(metal.frameGlintMs) > 0 ? Number(metal.frameGlintMs) : 2800
  readonly property int sweepMs: glassFrame ? (Number(glassSpec.ms) > 0 ? Number(glassSpec.ms) : 650)
                                            : (metal && Number(metal.sweepMs) > 0 ? Number(metal.sweepMs) : 900)
  // the sweep's strength at its start (fading to nothing): the metal glint's, or the glass one's
  readonly property real startAmount: glassFrame ? (glassSpec.amount !== undefined ? Number(glassSpec.amount) : 0.66) : 0.95
  readonly property real leadPx: 90

  // the frame being glinted, in global layout coordinates (logical px)
  property real gx: 0
  property real gy: 0
  property real fw: 0
  property real fh: 0
  property real tube: 2
  property var mons: []
  property string address: ""
  property string geometryKey: ""
  property bool running: false
  property real sweep: 0
  property real amount: 0

  property int borderSize: 2
  property real rounding: 0
  property bool justOpened: false
  // every start or stop bumps it: a query that comes back later is stale
  property int generation: 0
  property bool manual: false

  function stop() {
    generation++
    settle.stop()
    watch.stop()
    anim.stop()
    cardSweep.stop()
    running = false
    amount = 0
  }
  function eligible() { return (!!metal || glassFrame) && !Style.reduceMotion && (manual || enabled) }
  function schedule(ms) {
    stop()
    settle.interval = ms
    settle.restart()
  }
  function trigger() {
    if ((!metal && !glassFrame) || Style.reduceMotion) return false
    manual = true
    schedule(40)
    return true
  }

  Connections {
    target: Hyprland
    function onRawEvent(event) {
      var n = event ? event.name : ""
      if (n === "configreloaded") { if (!options.running) options.running = true; return }
      if (n === "openwindow") root.justOpened = true
      if (n === "activewindowv2") {
        root.manual = false
        root.stop()
        if (!root.eligible()) return
        // a new window animates in (windowsIn ~0.4 s)
        root.schedule(root.justOpened ? 480 : 300)
        root.justOpened = false
      } else if (n === "workspacev2" || n === "movewindowv2" || n === "fullscreen" || n === "changefloatingmode" || n === "closewindow") {
        root.stop()
      }
    }
  }
  Connections {
    target: Style
    function onReduceMotionChanged() { if (Style.reduceMotion) root.stop() }
  }
  onEnabledChanged: if (!enabled) stop()
  onStyleChanged: stop()
  onMetalChanged: stop()
  onGlassChanged: stop()

  Timer {
    id: settle
    interval: 300
    onTriggered: {
      // Do not relabel a still-running query with the next generation.
      if (query.running) { settle.restart(); return }
      query.gen = root.generation
      query.running = true
    }
  }

  // border size and corner rounding, read again on config reloads
  Process {
    id: options
    running: true
    command: ["sh", "-c", "hyprctl -j getoption general:border_size; echo; hyprctl -j getoption decoration:rounding"]
    stdout: StdioCollector {
      onStreamFinished: {
        var parts = String(text || "").split(/\n(?=\{)/)
        try { root.borderSize = Math.max(0, Number(JSON.parse(parts[0]).int)) } catch (e) {}
        try { root.rounding = Math.max(0, Number(JSON.parse(parts[1]).int)) } catch (e) {}
      }
    }
  }

  function key(w) { return w && w.at && w.size ? [w.address, w.at[0], w.at[1], w.size[0], w.size[1], w.fullscreen, w.workspace ? w.workspace.id : ""].join(",") : "" }

  Process {
    id: query
    property int gen: -1
    command: ["sh", "-c", "hyprctl -j activewindow; printf '\\n---\\n'; hyprctl -j monitors"]
    stdout: StdioCollector {
      onStreamFinished: {
        if (query.gen !== root.generation || !root.eligible()) return
        var parts = String(text || "").split("\n---\n")
        var w, mons
        try { w = JSON.parse(parts[0]); mons = JSON.parse(parts[1]) } catch (e) { return }
        if (!w || !w.address || !w.size || w.fullscreen > 0 || w.hidden) return
        var mon = null, list = []
        for (var i = 0; i < mons.length; i++) {
          var m = mons[i], s = Number(m.scale) > 0 ? Number(m.scale) : 1
          var rot = Number(m.transform) % 2 === 1
          list.push({ name: m.name, x: m.x, y: m.y, w: (rot ? m.height : m.width) / s, h: (rot ? m.width : m.height) / s })
          if (m.id === w.monitor) mon = m
        }
        if (!mon) return
        // Hyprland rounds the border to whole device pixels
        var sc = Number(mon.scale) > 0 ? Number(mon.scale) : 1
        var b = Math.round(root.borderSize * sc) / sc
        root.mons = list
        root.tube = Math.max(1 / sc, b)
        root.gx = w.at[0] - b
        root.gy = w.at[1] - b
        root.fw = w.size[0] + 2 * b
        root.fh = w.size[1] + 2 * b
        if (root.fw < 40 || root.fh < 40) return
        root.address = w.address
        root.geometryKey = root.key(w)
        root.running = true
        if (root.orbit) anim.restart(); else cardSweep.restart()
        watch.restart()
      }
    }
  }

  // while it runs: the window must stay where it is (a drag or resize has no
  // event of its own)
  Timer {
    id: watch
    interval: 150
    repeat: true
    onTriggered: if (!watchProc.running) { watchProc.gen = root.generation; watchProc.running = true }
  }
  Process {
    id: watchProc
    property int gen: -1
    command: ["hyprctl", "-j", "activewindow"]
    stdout: StdioCollector {
      onStreamFinished: {
        if (watchProc.gen !== root.generation || !root.running) return
        var w
        try { w = JSON.parse(text) } catch (e) { return }
        if (root.key(w) !== root.geometryKey) root.stop()
      }
    }
  }

  // one turn from the top edge's left end and a little past it, slowing towards
  // the end (OutQuad: OutCubic crept for half a second at the start corner).
  // The glint fades in over the first 0.2 s and is gone at 80 % of the turn,
  // while it still moves (at 0.4× its mean pace): it slows, it never crawls.
  ParallelAnimation {
    id: anim
    NumberAnimation { target: root; property: "sweep"; from: 0; to: 1.06; duration: root.durationMs; easing.type: Easing.OutQuad }
    SequentialAnimation {
      NumberAnimation { target: root; property: "amount"; from: 0; to: 1; duration: 200; easing.type: Easing.OutQuad }
      NumberAnimation { target: root; property: "amount"; from: 1; to: 0; duration: Math.max(0, Math.round(root.durationMs * 0.8) - 200); easing.type: Easing.InCubic }
      // nothing left to draw: drop the surface and the watch (the turn runs out unseen)
      ScriptAction { script: { root.running = false; watch.stop() } }
    }
    onFinished: { root.running = false; root.amount = 0; watch.stop() }
  }
  // sweep: exactly a card's glint (MetalShape.play()): from just before the
  // top-left corner to just past the bottom-right one, fading as it goes
  ParallelAnimation {
    id: cardSweep
    NumberAnimation { target: root; property: "sweep"; from: -0.15; to: 1.15; duration: root.sweepMs; easing.type: Easing.InOutQuad }
    NumberAnimation { target: root; property: "amount"; from: root.startAmount; to: 0; duration: root.sweepMs; easing.type: Easing.InQuad }
    onFinished: { root.running = false; root.amount = 0; watch.stop() }
  }

  Variants {
    model: Quickshell.screens
    delegate: Component {
      PanelWindow {
        id: win
        required property var modelData
        screen: modelData
        readonly property real pad: 4
        // this monitor's place in the layout
        readonly property var mon: {
          for (var i = 0; i < root.mons.length; i++) if (root.mons[i].name === modelData.name) return root.mons[i]
          return null
        }
        // the frame in this monitor's coordinates, the surface on whole pixels around it
        readonly property real lx: mon ? root.gx - mon.x - pad : 0
        readonly property real ly: mon ? root.gy - mon.y - pad : 0
        readonly property int ox: Math.floor(lx)
        readonly property int oy: Math.floor(ly)
        readonly property bool reaches: !!mon && root.gx < mon.x + mon.w && root.gx + root.fw > mon.x
                                        && root.gy < mon.y + mon.h && root.gy + root.fh > mon.y
        visible: root.running && reaches
        color: "transparent"
        surfaceFormat.opaque: false
        anchors { top: true; left: true }
        margins.left: ox
        margins.top: oy
        implicitWidth: Math.ceil(root.fw + 2 * pad + (lx - ox))
        implicitHeight: Math.ceil(root.fh + 2 * pad + (ly - oy))
        exclusionMode: ExclusionMode.Ignore
        WlrLayershell.namespace: "tusche-bar-window-glint"
        WlrLayershell.layer: WlrLayer.Overlay
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.None
        mask: Region {}

        GlassFrameGlint {
          visible: root.glassFrame
          x: win.lx - win.ox
          y: win.ly - win.oy
          width: root.fw + 2 * win.pad
          height: root.fh + 2 * win.pad
          spec: root.glass
          pad: win.pad
          radius: root.rounding > 0 ? root.rounding + root.tube : 0
          tube: root.tube
          sweep: root.sweep
          amount: root.amount
        }
        MetalShape {
          visible: !root.glassFrame
          x: win.lx - win.ox
          y: win.ly - win.oy
          width: root.fw + 2 * win.pad
          height: root.fh + 2 * win.pad
          spec: root.metal
          kind: "frame"
          pad: win.pad
          radius: root.rounding > 0 ? root.rounding + root.tube : 0
          tube: root.tube
          // orbit: the comet's lead along the perimeter; sweep: the band's half width (a card's)
          ringStyle: root.orbit ? 0 : 1
          arc: root.orbit ? root.leadPx / Math.max(1, 2 * (root.fw + root.fh)) : 0.04
          sweep: root.sweep
          sweepAmt: root.amount
        }
      }
    }
  }
}
