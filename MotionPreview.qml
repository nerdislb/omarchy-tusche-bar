import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Presets.js" as Presets
import "VisualEditor.js" as Visual
import "GlassMath.js" as GlassMath

// An isolated in-window stage. These are the production material renderers,
// not a second animation design. No PanelWindow, focus capture, IPC or overlay.
Item {
  id: root
  property var options: ({})
  property var material: null
  readonly property var opts: Presets.normalizeOptions(options)
  readonly property var quiet: Visual.quietMaterial(material)
  readonly property var previewMaterial: GlassMath.material(quiet, opts.glass, opts.glassMotion)
  readonly property var popupMaterial: opts.edge === "theme" ? previewMaterial : null
  readonly property var glass: previewMaterial && previewMaterial.glass && previewMaterial.glass.enabled !== false ? previewMaterial.glass : null
  readonly property var metal: previewMaterial && previewMaterial.metal ? previewMaterial.metal : null
  readonly property bool glassFrame: !!glass
  readonly property bool orbit: opts.frames === "orbit" && !!metal && !glassFrame
  readonly property bool canFrame: (opts.frames === "glint" || opts.frames === "orbit") && (!!glass || !!metal)
  readonly property bool reduced: Style.reduceMotion
  readonly property int sweepMs: glassFrame ? (glass.frame && Number(glass.frame.ms) > 0 ? Number(glass.frame.ms) : 650)
    : metal && Number(metal.sweepMs) > 0 ? Number(metal.sweepMs) : 900
  readonly property int orbitMs: metal && Number(metal.frameGlintMs) > 0 ? Number(metal.frameGlintMs) : 2800
  readonly property real startAmount: glassFrame ? (glass.frame && glass.frame.amount !== undefined ? Number(glass.frame.amount) : 0.66) : 0.95
  property real sweep: 0
  property real amount: 0
  property int playbackGeneration: 0
  property bool ready: false
  readonly property var cardMaterial: popupLoader.item ? popupLoader.item.materialCard : null
  readonly property url localBackdrop: "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="320"><rect width="600" height="320" fill="' +
    String(Commons.Color.popups.background) + '"/><path d="M0 72H600M0 144H600M0 216H600" stroke="' +
    String(Commons.Color.popups.text) + '" stroke-opacity=".14" stroke-width="2"/></svg>')
  readonly property bool frameRunning: sweepAnimation.running || orbitAnimation.running
  readonly property bool popupRunning: popupLoader.active
  implicitHeight: content.implicitHeight
  Component.onCompleted: ready = true
  onVisibleChanged: if (!visible) stop()
  onMaterialChanged: stop()
  onOptionsChanged: stop()
  onReducedChanged: if (reduced) { sweepAnimation.stop(); orbitAnimation.stop(); amount = 0 }
  function stop() {
    playbackGeneration++
    if (!ready) return
    closeTimer.stop(); releaseTimer.stop(); sweepAnimation.stop(); orbitAnimation.stop(); amount = 0
    popupPanel.popoutSwitchClosing = true
    popupPanel.open = false
    if (cardMaterial) { cardMaterial.follow(); cardMaterial.settle() }
    // Destroy local material animations as well as their dynamic surfaces;
    // a stopped Lavur return must not leave its fading ghost behind.
    popupLoader.active = false
    popupPanel.popoutSwitchClosing = false
  }
  function playPopup() {
    if (!visible) return
    stop()
    popupLoader.active = true
    // Route the production glass through its authored-backdrop input. This
    // stage never captures real windows or starts the wallpaper probe.
    if (cardMaterial.glassBody) {
      cardMaterial.glassBody.testBackground = localBackdrop
      cardMaterial.glassBody.screen = null
      cardMaterial.glassBody.screenX = 0
      cardMaterial.glassBody.screenY = 0
      cardMaterial.glassBody.live = false
    }
    var generation = playbackGeneration
    Qt.callLater(function() { if (root.visible && generation === root.playbackGeneration) { popupPanel.open = true; closeTimer.restart() } })
  }
  function playFrame() {
    if (!visible || reduced || !canFrame) return
    sweepAnimation.stop(); orbitAnimation.stop(); amount = 0
    if (orbit) orbitAnimation.restart()
    else sweepAnimation.restart()
  }
  Timer { id: closeTimer; interval: 1800; onTriggered: { popupPanel.open = false; releaseTimer.restart() } }
  Timer { id: releaseTimer; interval: 1100; onTriggered: popupLoader.active = false }
  ParallelAnimation {
    id: sweepAnimation
    NumberAnimation { target: root; property: "sweep"; from: -0.15; to: 1.15; duration: root.sweepMs; easing.type: Easing.InOutQuad }
    NumberAnimation { target: root; property: "amount"; from: root.startAmount; to: 0; duration: root.sweepMs; easing.type: Easing.InQuad }
  }
  ParallelAnimation {
    id: orbitAnimation
    NumberAnimation { target: root; property: "sweep"; from: 0; to: 1.06; duration: root.orbitMs; easing.type: Easing.OutQuad }
    SequentialAnimation {
      NumberAnimation { target: root; property: "amount"; from: 0; to: 1; duration: 200; easing.type: Easing.OutQuad }
      NumberAnimation { target: root; property: "amount"; from: 1; to: 0; duration: Math.max(0, Math.round(root.orbitMs * 0.8) - 200); easing.type: Easing.InCubic }
    }
    onFinished: root.amount = 0
  }
  QtObject {
    id: popupPanel
    property bool open: false
    property string barPos: "top"
    property real gap: 0
    property bool centerOnBar: true
    property point anchorScreenPos: Qt.point(0, 0)
    property real anchorW: 20
    property bool popoutSwitchClosing: false
  }
  component Label: Text {
    textFormat: Text.PlainText; renderType: Text.NativeRendering
    font.family: Style.font.family; font.pixelSize: Style.font.caption
    color: Commons.Color.popups.text
    wrapMode: Text.Wrap
  }
  component PlayButton: FocusScope {
    id: button
    property string label: ""
    signal triggered()
    implicitWidth: buttonText.implicitWidth + Style.space(22)
    implicitHeight: Math.max(Style.space(32), buttonText.implicitHeight + Style.space(12))
    activeFocusOnTab: enabled
    Accessible.role: Accessible.Button
    Accessible.name: label
    Accessible.onPressAction: if (enabled) triggered()
    Keys.onReturnPressed: if (enabled) triggered()
    Keys.onEnterPressed: if (enabled) triggered()
    Keys.onSpacePressed: if (enabled) triggered()
    opacity: enabled ? 1 : 0.45
    Rectangle {
      anchors.fill: parent
      color: pointer.containsMouse ? Util.alpha(Commons.Color.popups.text, 0.06) : "transparent"
      border.width: button.activeFocus ? 2 : 1
      border.color: button.activeFocus ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.25)
    }
    Label { id: buttonText; anchors.centerIn: parent; text: button.label }
    MouseArea { id: pointer; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { button.forceActiveFocus(); button.triggered() } }
  }
  Column {
    id: content
    width: root.width
    spacing: Style.space(8)
    Label { width: parent.width; text: "Try the motion"; font.pixelSize: Style.font.body; font.bold: true }
    Label {
      width: parent.width
      opacity: 0.65
      text: root.reduced ? "Reduced motion is on. Popup states remain readable; movement and glints are suppressed."
        : "One playback at the production speed, including the popup's return. Nothing moves at rest."
    }
    Flow {
      width: parent.width
      spacing: Style.space(8)
      PlayButton { label: root.reduced ? "Show popup" : "Play popup"; onTriggered: root.playPopup() }
      PlayButton { label: "Play frame"; enabled: root.canFrame && !root.reduced; onTriggered: root.playFrame() }
      PlayButton { label: "Stop"; enabled: root.popupRunning || root.frameRunning; onTriggered: root.stop() }
    }
    Item {
      id: scene
      width: parent.width; height: Style.space(200)
      clip: true
      Rectangle { anchors.fill: parent; color: Util.alpha(Commons.Color.popups.text, 0.025); border.width: 1; border.color: Util.alpha(Commons.Color.popups.text, 0.12) }
      Rectangle {
        x: Style.space(16); y: Style.space(18)
        width: (scene.width - Style.space(48)) / 2; height: Style.space(24)
        color: Qt.rgba(Commons.Color.bar.background.r, Commons.Color.bar.background.g, Commons.Color.bar.background.b, 1)
      }
      Loader {
        id: popupLoader
        anchors.fill: parent
        active: false
        sourceComponent: Component {
          Item {
            readonly property alias materialCard: popupMaterialRenderer
            Rectangle {
              id: popupCard
              x: Style.space(16); y: Style.space(42)
              width: (scene.width - Style.space(48)) / 2; height: Style.space(130)
              color: Commons.Color.popups.background
              radius: Style.cornerRadius
              property var borderSpec: Border.flat(Commons.Color.popups.text, 1)
              border.width: borderSpec.widths.top; border.color: borderSpec.color
              opacity: popupPanel.open ? 1 : 0
              Behavior on opacity { NumberAnimation { duration: root.reduced ? 0 : 140; easing.type: Easing.OutCubic } }
              Item {
                anchors.fill: parent
                BarMaterialCard { id: popupMaterialRenderer; panel: popupPanel; material: root.popupMaterial }
                Column {
                  x: Style.space(14); y: Style.space(14)
                  width: parent.width - Style.space(28)
                  spacing: Style.space(12)
                  Label { width: parent.width; text: "Popup material"; font.bold: true; font.pixelSize: Style.font.bodySmall }
                  Rectangle { width: parent.width * 0.75; height: 2; color: Util.alpha(Commons.Color.popups.text, 0.35) }
                  Label { width: parent.width; text: "The current theme's card"; opacity: 0.7 }
                }
              }
            }
          }
        }
      }
      Rectangle {
        id: frame
        x: scene.width / 2 + Style.space(8); y: Style.space(42)
        width: (scene.width - Style.space(48)) / 2; height: Style.space(130)
        color: Commons.Color.popups.background
        radius: Style.cornerRadius
        border.width: 2; border.color: Commons.Color.accent
        Label { anchors.centerIn: parent; width: parent.width - Style.space(24); horizontalAlignment: Text.AlignHCenter; text: root.canFrame ? "Window-frame effect" : "No frame effect selected" }
      }
      GlassFrameGlint {
        visible: root.glassFrame && root.amount > 0
        spec: root.glass
        x: frame.x - pad; y: frame.y - pad
        width: frame.width + 2 * pad; height: frame.height + 2 * pad
        radius: frame.radius; tube: frame.border.width
        sweep: root.sweep; amount: root.amount
      }
      MetalShape {
        visible: !root.glassFrame && !!root.metal && root.amount > 0
        spec: root.metal; kind: "frame"
        x: frame.x - pad; y: frame.y - pad
        width: frame.width + 2 * pad; height: frame.height + 2 * pad
        radius: frame.radius; tube: frame.border.width
        ringStyle: root.orbit ? 0 : 1
        arc: root.orbit ? 90 / Math.max(1, 2 * (frame.width + frame.height)) : 0.04
        sweep: root.sweep
        sweepAmt: root.amount
      }
    }
    Label {
      width: parent.width
      opacity: 0.65
      text: "Real material on a local backdrop. Native window focus and Island transitions are not triggered or simulated here."
    }
  }
}
