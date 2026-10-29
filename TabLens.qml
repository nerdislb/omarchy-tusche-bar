import QtQuick
import qs.Commons
import qs.Commons as Commons
import "bridge" as Bridge
import "GlassMath.js" as GlassMath

// The selection lens of a row of tabs (the AI quota popup's agents). It
// glides to the selected tab on two springs, one per edge: the edge in front
// leads, the one behind follows, so the lens draws out a little on the way and
// gathers again as it lands, the way Apple's glass tab bars move, without a
// bounce: square as the theme (a radius of 3 px at most), or, as the lens of a
// segmented row (`capsule`), a capsule in the row's capsule track. A retarget
// mid-flight keeps both edges' velocity, so a burst of switches stays one
// smooth movement.
// On glass themes (the theme's glass material, or translucent popups) the lens
// is a pane of glass: a light fill, the material's hairline rim and a sheen
// along its top edge that brightens with speed. Elsewhere it is the tabs' ink
// fill with the 2 px underline. Motion "calm" glides without drawing out;
// Reduced Motion and a popup that is not open put it straight in place.
// It glides only when the selection changes (the target's `key`): the same
// tab moving, or a Repeater rebuilding it after a data reload, takes the lens
// along at once (EdgeSpring).
Item {
  id: lens
  // the selected tab, a sibling's child at the lens's x origin, with a `key`
  property Item target: null
  function keyOf(item) { return edges.keyOf(item) }
  // false while the popup is closed: the lens waits on its tab, without flying in
  property bool live: true
  property color ink: Commons.Color.popups.text
  // A segmented row's lens is a capsule, like its track.
  property bool capsule: false
  property real radius: capsule ? GlassMath.capsule(Style, height) : Math.min(Style.cornerRadius, 3)
  property string motion: Bridge.ModuleBus.motion

  readonly property var glassSpec: {
    var m = Bridge.ModuleBus.material || (Bridge.ModuleBus.engine ? Bridge.ModuleBus.engine.presentationMaterial : null)
    return m && m.glass && m.glass.enabled !== false ? m.glass : null
  }
  readonly property bool glass: !!glassSpec || Commons.Color.popups.background.a < 0.95
  readonly property bool light: glassSpec ? glassSpec.light === true : Bridge.ModuleBus.isLight(Commons.Color.popups.background)
  readonly property bool calm: motion === "calm"

  EdgeSpring {
    id: edges
    target: lens.target
    live: lens.live
    leadResponse: lens.calm ? 0.30 : 0.22
    trailResponse: 0.30
    damping: lens.calm ? 0.99 : 0.9
  }
  readonly property real edgeLeft: edges.start
  readonly property real edgeRight: edges.end
  readonly property real leftVelocity: edges.startVelocity
  readonly property real rightVelocity: edges.endVelocity
  // +1 heading right, -1 heading left
  readonly property int heading: edges.heading
  readonly property bool placed: edges.placed
  readonly property string placedKey: edges.placedKey
  readonly property bool moving: edges.moving
  function place() { edges.place() }
  // 0 at rest, 1 at a brisk glide (px/s): the sheen and the fill brighten with it
  readonly property real energy: Math.min(1, edges.speed / 1600)
  // How far the lens is drawn out past its tab; it gives up a little height for it.
  readonly property real stretch: edges.stretch
  readonly property real squeeze: Math.min(Style.space(2), stretch * 0.05)

  x: edgeLeft
  y: squeeze
  width: Math.max(0, edgeRight - edgeLeft)
  height: Math.max(0, (parent ? parent.height : 0) - 2 * squeeze)
  visible: !!target

  // The pane: glass fill and hairline rim, or the ink fill.
  Rectangle {
    anchors.fill: parent
    radius: lens.radius
    color: !lens.glass ? Util.alpha(lens.ink, 0.1)
      : lens.light ? Qt.rgba(1, 1, 1, 0.5 + 0.15 * lens.energy)
      : Qt.rgba(1, 1, 1, 0.07 + 0.04 * lens.energy)
    border.width: lens.glass ? 1 : 0
    border.color: lens.glassSpec && lens.glassSpec.line ? lens.glassSpec.line
      : lens.light ? Qt.rgba(0, 0, 0, 0.12) : Qt.rgba(1, 1, 1, 0.14)
  }
  // The sheen: light caught along the top edge, fading out to the corners.
  Rectangle {
    visible: lens.glass
    x: lens.radius + 1
    y: 1
    width: Math.max(0, parent.width - 2 * (lens.radius + 1))
    height: 1
    opacity: lens.light ? 0.9 : 0.3 + 0.35 * lens.energy
    gradient: Gradient {
      orientation: Gradient.Horizontal
      GradientStop { position: 0; color: "transparent" }
      GradientStop { position: 0.5; color: "white" }
      GradientStop { position: 1; color: "transparent" }
    }
  }
  // In motion a soft band of light rides near the leading edge.
  Item {
    anchors.fill: parent
    anchors.margins: 1
    visible: lens.glass && lens.energy > 0.02
    clip: true
    Rectangle {
      width: parent.width * 0.55
      height: parent.height
      x: lens.heading < 0 ? 0 : parent.width - width
      opacity: lens.energy * (lens.light ? 0.5 : 1)
      gradient: Gradient {
        orientation: Gradient.Horizontal
        GradientStop { position: 0; color: "transparent" }
        GradientStop { position: lens.heading < 0 ? 0.3 : 0.7; color: Qt.rgba(1, 1, 1, 0.09) }
        GradientStop { position: 1; color: "transparent" }
      }
    }
  }
  // Ink themes: the underline the tabs had, drawn out with the lens.
  readonly property alias underline: underline
  Rectangle {
    id: underline
    visible: !lens.glass
    anchors.bottom: parent.bottom
    anchors.bottomMargin: -lens.squeeze
    x: Math.max(Style.space(7), lens.radius)
    width: Math.max(0, parent.width - 2 * x)
    height: 2
    color: lens.ink
  }
}
