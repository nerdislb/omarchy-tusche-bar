import QtQuick
import QtQuick.Effects
import Quickshell
import qs.Commons

// Bevel Lens material, not a geometry override. The caller hands over its
// existing radius, width and height; at rest there is no animation clock.
Item {
  id: root
  property var spec: null
  property bool active: visible && !!spec
  property bool live: true
  property bool moving: false
  property real radius: 0
  property real reveal: 1
  property var screen: window ? window.screen : null
  property real screenX: origin.x
  property real screenY: origin.y
  property url testBackground: ""
  readonly property var window: QsWindow.window
  // KeyboardPanel/PopupCard shadow window.contentItem with a children list.
  // Walk the visual parents instead: mapToItem/TransformWatcher need an Item.
  readonly property Item sceneRoot: {
    var item = root
    while (item.parent) item = item.parent
    return item
  }
  readonly property point origin: {
    originWatcher.transform
    if (!window || !sceneRoot) return Qt.point(0, 0)
    var p = root.mapToItem(sceneRoot, 0, 0)
    // PanelWindow card positions are screen-local. Note columns start below
    // the bar; include their anchored margins without assuming output (0,0).
    var m = window.margins
    return Qt.point(p.x + (m && window.anchors.left ? m.left : 0), p.y + (m && window.anchors.top ? m.top : 0))
  }
  readonly property real padding: 48
  readonly property bool light: !!spec && spec.light === true
  readonly property color tint: spec && spec.tint ? spec.tint : light ? "#e7eef7" : "#121b27"
  readonly property real blurRadius: spec && spec.blur ? Number(spec.blur) : light ? 18 : 22
  readonly property real backing: spec && spec.backing !== undefined ? Number(spec.backing) : light ? 0.62 : 0.66
  readonly property int capturedWindows: scene.readyCount
  readonly property bool captureBlocked: scene.blocked
  readonly property bool glintRunning: glint.running
  property real sweep: 0
  property real strength: 0
  TransformWatcher { id: originWatcher; a: root.sceneRoot; b: root }

  function play() {
    if (!active || Style.reduceMotion) return
    glint.restart()
  }
  function stop() { glint.stop(); strength = 0 }
  onActiveChanged: if (!active) { stop(); raw.scheduleUpdate(); frosted.scheduleUpdate() }
  onSpecChanged: stop()
  Connections { target: Style; function onReduceMotionChanged() { if (Style.reduceMotion) root.stop() } }
  ParallelAnimation {
    id: glint
    NumberAnimation { target: root; property: "sweep"; from: -0.15; to: 1.15; duration: 650; easing.type: Easing.InOutQuad }
    NumberAnimation { target: root; property: "strength"; from: 0.8; to: 0; duration: 650; easing.type: Easing.InQuad }
  }

  GlassBackdrop {
    id: scene
    x: -root.padding; y: -root.padding
    width: root.width + 2 * root.padding
    height: root.height + 2 * root.padding
    active: root.active
    live: root.live
    screen: root.screen
    screenX: root.screenX - root.padding
    screenY: root.screenY - root.padding
    fallback: root.tint
    testBackground: root.testBackground
  }
  ShaderEffectSource {
    id: raw
    sourceItem: scene
    textureSize: root.active ? Qt.size(scene.width, scene.height) : Qt.size(1, 1)
    hideSource: true
    live: root.active
    visible: false
  }
  MultiEffect {
    id: frost
    x: -root.padding; y: -root.padding
    width: scene.width; height: scene.height
    source: raw
    blurEnabled: true
    blurMax: 64
    blur: Math.min(1, root.blurRadius / 64)
    autoPaddingEnabled: false
  }
  ShaderEffectSource {
    id: frosted
    sourceItem: frost
    textureSize: root.active ? Qt.size(scene.width, scene.height) : Qt.size(1, 1)
    hideSource: true
    live: root.active
    visible: false
  }
  ShaderEffect {
    anchors.fill: parent
    visible: root.active && root.width > 0 && root.height > 0
    property var src: frosted
    property vector2d size: Qt.vector2d(width, height)
    property vector2d textureSize_: Qt.vector2d(scene.width, scene.height)
    property real padding: root.padding
    property real radius: root.radius
    property real bevel: root.spec && root.spec.bevel ? Number(root.spec.bevel) : 9
    property real bend: root.spec && root.spec.bend ? Number(root.spec.bend) : 5
    property real backing: root.backing
    property real lightOn: root.light ? 1 : 0
    property real reveal: Math.max(0, Math.min(1, root.reveal))
    property real sweep: root.sweep
    property real strength: root.strength
    property real gloss: root.spec && root.spec.gloss ? Number(root.spec.gloss) : 0
    property color tint: root.tint
    fragmentShader: Qt.resolvedUrl("shaders/glass.frag.qsb")
    blending: true
  }
}
