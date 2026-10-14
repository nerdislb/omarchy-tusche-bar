import QtQuick
import qs.Commons

// An inert, fixed-width readout. The wrapper reserves this entire width for as
// long as hints are enabled, so appearing/disappearing text cannot move targets.
Item {
  id: root
  property string text: ""
  property string kind: ""
  property color ink: "white"
  property int barSize: 30
  implicitWidth: Style.space(166)
  implicitHeight: barSize

  Text {
    id: icon
    anchors.left: parent.left
    anchors.leftMargin: Style.space(8)
    anchors.verticalCenter: parent.verticalCenter
    width: Style.space(18)
    visible: root.text !== ""
    text: root.kind === "brightness" ? "\u{f0379}" : root.kind === "bluetooth" ? "\u{f00af}" : "\u{f057e}"
    color: root.ink
    textFormat: Text.PlainText
    renderType: Text.NativeRendering
    font.family: Style.font.family
    font.pixelSize: Style.font.icon
  }
  Text {
    anchors.left: icon.right
    anchors.right: parent.right
    anchors.leftMargin: Style.space(5)
    anchors.rightMargin: Style.space(6)
    anchors.verticalCenter: parent.verticalCenter
    text: root.text
    textFormat: Text.PlainText
    renderType: Text.NativeRendering
    elide: Text.ElideRight
    maximumLineCount: 1
    font.family: Style.font.family
    font.pixelSize: Style.font.bodySmall
    color: root.ink
  }
}
