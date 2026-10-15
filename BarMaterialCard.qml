import QtQuick
import qs.Commons

// Bar-only variant B: the dry themes opt into a persistent four-sided frame.
// The shared MaterialCard (also used by the Island) remains unchanged.
// Override only the painted card; the panel's layout and original spec stay intact.
MaterialCard {
  id: framed
  readonly property var frameSpec: matOn && !metalOn && !glassOn && mat.frame ? mat.frame : null
  readonly property alias cardFrame: outline
  // Paint over the native rim without replacing any of its bindings. Keeping
  // the outline inside the card also includes it in the closing roll snapshot.
  Rectangle {
    id: outline
    parent: framed.card
    anchors.fill: parent
    z: 1001
    visible: !!framed.frameSpec && !!framed.card
    color: "transparent"
    radius: framed.card ? framed.card.radius : 0
    border.width: framed.frameSpec ? framed.frameSpec.width : 0
    border.color: framed.frameSpec ? framed.frameSpec.color : "transparent"
  }
}
