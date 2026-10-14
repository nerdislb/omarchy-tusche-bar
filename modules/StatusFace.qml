import QtQuick
import qs.Commons

// Shared, inert presentation: production owns the registered click wrapper;
// Control Center supplies a snapshot. No services, timers or device operations.
Item {
  id: root
  property string group: ""
  property string glyph: ""
  property bool chip: false
  property color ink: "white"
  property color accent: ink
  property color urgent: ink
  property color linkInk: ink
  property color glyphInk: ink
  property int barSize: 30
  property bool wifiUp: true
  property bool vpnUp: false
  property bool tailscaleUp: false
  property bool bluetoothConnected: false
  property var phone: null
  property real cpu: 0
  property bool sysHot: false

  function chipLevel(load) {
    var l = Math.min(1, Math.max(0, Number(load) || 0))
    return l > 0.02 ? Math.max(1, Math.ceil(l * 6 - 1e-4)) : 0
  }

  component Glyph: Text {
    renderType: Text.NativeRendering
    textFormat: Text.PlainText
    font.family: Style.font.family
    font.pixelSize: Style.font.icon + 2
    color: root.ink
  }

  Glyph {
    visible: root.group === "net"
    anchors.centerIn: parent
    anchors.verticalCenterOffset: -Style.space(2)
    text: root.wifiUp ? "\u{f0928}" : "\u{f05aa}"
    color: root.wifiUp ? root.ink : root.urgent
  }
  Row {
    visible: root.group === "net"
    anchors.horizontalCenter: parent.horizontalCenter
    y: root.barSize - Style.space(7)
    spacing: Style.space(2)
    Rectangle { width: Style.space(3); height: width; color: root.vpnUp ? root.accent : Util.alpha(root.ink, 0.25) }
    Rectangle { width: Style.space(3); height: width; color: root.tailscaleUp ? root.linkInk : Util.alpha(root.ink, 0.25) }
    Rectangle { width: Style.space(3); height: width; color: root.bluetoothConnected ? root.ink : Util.alpha(root.ink, 0.25) }
  }
  Row {
    visible: root.group === "phone"
    anchors.centerIn: parent
    spacing: Style.space(3)
    Glyph { text: "\u{f011c}"; color: root.phone && root.phone.online ? root.ink : Util.alpha(root.ink, 0.45) }
    Text {
      renderType: Text.NativeRendering
      textFormat: Text.PlainText
      anchors.verticalCenter: parent.verticalCenter
      text: root.phone && root.phone.charge >= 0 ? root.phone.charge + "%" : "–"
      font.family: Style.font.family
      font.pixelSize: Style.font.bodySmall
      color: root.phone && root.phone.charge >= 0 && root.phone.charge <= 20 && !root.phone.charging ? root.urgent : Util.alpha(root.ink, 0.75)
    }
  }
  Glyph { visible: root.group === "" && !root.chip; anchors.centerIn: parent; text: root.glyph; color: root.glyphInk }
  ChipFace { visible: root.group === "system" || root.chip; anchors.centerIn: parent; level: root.cpu }

  // The existing 04.10. chip: three pins per side, 2px ink outline; only its
  // six bottom-up load rows take the warning tone. Whole-pixel scaling stays.
  component ChipFace: Item {
    id: chip
    property real level: 0
    readonly property int u: Math.max(1, Math.round((Style.font.icon + 2) / 18))
    readonly property color ink: root.ink
    readonly property color fillInk: root.sysHot ? root.urgent : root.ink
    width: 16 * u; height: 16 * u
    Repeater {
      model: 12
      Rectangle {
        required property int index
        readonly property int side: Math.floor(index / 3)
        readonly property int k: index % 3
        color: chip.ink
        antialiasing: false
        width: (side < 2 ? 2 : 1) * chip.u; height: (side < 2 ? 1 : 2) * chip.u
        x: (side === 0 ? 0 : side === 1 ? 14 : 4 + k * 3) * chip.u
        y: (side === 2 ? 0 : side === 3 ? 14 : 4 + k * 3) * chip.u
      }
    }
    Rectangle {
      x: 2 * chip.u; y: 2 * chip.u; width: 12 * chip.u; height: 12 * chip.u
      color: "transparent"; border.width: 2 * chip.u; border.color: chip.ink; radius: chip.u
      Rectangle {
        readonly property int rows: root.chipLevel(chip.level)
        x: 3 * chip.u; width: 6 * chip.u
        height: rows * chip.u; y: (9 - rows) * chip.u
        visible: rows > 0
        color: chip.fillInk
        antialiasing: false
      }
    }
  }
}
