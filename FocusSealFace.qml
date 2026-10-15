import QtQuick
import "FocusSeal.js" as Model
import "modules" as Modules

// The drawing of the focus seal: the seal in a square frame, a thin line under
// it when the battery is low, a small square when something needs you. Inert:
// facts in, pixels out (FocusSeal.qml owns the window, the clicks and the data).
Rectangle {
  id: face

  property color ground: "white"
  property color ink: "black"
  property color accent: "red"
  property color urgent: "red"
  property color frame: ink
  property real frameWidth: 1
  property var facts: ({})
  property bool pressed: false
  readonly property var model: Model.state(facts)

  color: ground
  border.width: frameWidth
  border.color: frame

  Modules.SealLogo { anchors.centerIn: parent; ink: face.ink; pressInk: face.accent; pressed: face.pressed }

  // battery: a line inside the frame's lower edge, as long as the charge is
  Rectangle {
    visible: face.model.line
    x: face.frameWidth
    y: face.height - face.frameWidth - height
    height: Math.max(1, Math.round(face.height / 17))
    width: Math.max(1, Math.round((face.width - 2 * face.frameWidth) * face.model.fill))
    color: face.model.low ? face.urgent : face.accent
  }
  // a square in the upper right corner: something wants you
  Rectangle {
    visible: face.model.mark
    x: face.width - face.frameWidth - width - 2
    y: face.frameWidth + 2
    width: Math.max(3, Math.round(face.width / 7)); height: width
    color: face.urgent
  }
}
