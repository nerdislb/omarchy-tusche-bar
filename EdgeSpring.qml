import QtQuick
import qs.Commons
import "GlassMath.js" as GlassMath

// The two edges of a sliding indicator, each on a spring: the edge in front
// leads and the one behind follows, so the indicator draws out a little on the
// way and gathers again as it lands, as Apple's tab bars and page dots do. A
// retarget mid-flight keeps both edges' velocity, so a burst of switches stays
// one movement. The caller draws from `start` and `end`.
// Item mode (`target`): the edges follow the target's x and width (y and
// height with `vertical`), in its parent's coordinates, and only a new `key`
// on the target glides. The same item moving, or a Repeater rebuilding it
// after a data reload (a fresh delegate stands at 0 until its positioner lays
// it out), is followed at once. Number mode (`numeric`): bind targetStart and
// targetEnd; every change glides.
// `live` false (a closed popup), Reduced Motion and the first placement put
// the edges in place; nothing ticks at rest.
Item {
  id: spring
  property Item target: null
  property bool vertical: false
  property bool numeric: false
  property real targetStart: target ? (vertical ? target.y : target.x) : 0
  property real targetEnd: target ? (vertical ? target.y + target.height : target.x + target.width) : 0
  property bool live: true
  // Apple's spring parameters: response in seconds, damping fraction.
  property real leadResponse: 0.22
  property real trailResponse: 0.30
  property real damping: 0.9
  // landed: this close, this slow (target units, units per second)
  property real epsilon: 0.2
  property real restSpeed: 4

  property real start: targetStart
  property real end: targetEnd
  property real startVelocity: 0
  property real endVelocity: 0
  // +1 heading toward larger values, -1 toward smaller ones
  property int heading: 0
  property bool placed: false
  property string placedKey: ""
  readonly property bool moving: glide.running
  readonly property real speed: Math.max(Math.abs(startVelocity), Math.abs(endVelocity))
  // how far the indicator is drawn out past the extent it heads for
  readonly property real stretch: Math.max(0, (end - start) - (targetEnd - targetStart))

  // Read from the target itself: a binding on it may still be stale when the
  // target's geometry announces the change.
  function keyOf(item) { return item && item.key !== undefined ? String(item.key) : "" }
  // An item letting go of the selection: dropped once the current change is
  // through, so the next item can take over first and the move still glides
  // (the order in which sibling bindings react is not defined).
  function release(item, stillSelected) {
    Qt.callLater(function() { if (spring.target === item && !(stillSelected && stillSelected())) spring.target = null })
  }
  function place() {
    glide.running = false
    start = targetStart; end = targetEnd
    startVelocity = 0; endVelocity = 0
    heading = 0
    placed = numeric || !!target
    placedKey = keyOf(target)
  }
  function retarget() {
    if (!numeric && !target) return
    if (!placed || !live || Style.reduceMotion || (!numeric && keyOf(target) === placedKey && !glide.running)) { place(); return }
    var from = (start + end) / 2, to = (targetStart + targetEnd) / 2
    if (Math.abs(to - from) > epsilon) heading = to > from ? 1 : -1
    glide.running = true
  }
  onTargetStartChanged: retarget()
  onTargetEndChanged: retarget()
  // Without a target (nothing hot) it rests, so the next one is placed, not flown to.
  onTargetChanged: if (!numeric && !target) place()
  onLiveChanged: if (live) place()
  Connections { target: Style; function onReduceMotionChanged() { if (Style.reduceMotion) spring.place() } }

  FrameAnimation {
    id: glide
    onTriggered: {
      var dt = Math.min(frameTime, 1 / 30)
      var startResponse = spring.heading < 0 ? spring.leadResponse : spring.trailResponse
      var endResponse = spring.heading > 0 ? spring.leadResponse : spring.trailResponse
      var s = GlassMath.step(spring.start, spring.startVelocity, spring.targetStart, dt, GlassMath.omega(startResponse), spring.damping)
      var e = GlassMath.step(spring.end, spring.endVelocity, spring.targetEnd, dt, GlassMath.omega(endResponse), spring.damping)
      spring.start = s.x; spring.startVelocity = s.v
      spring.end = e.x; spring.endVelocity = e.v
      if (Math.abs(s.x - spring.targetStart) < spring.epsilon && Math.abs(e.x - spring.targetEnd) < spring.epsilon
          && Math.abs(s.v) < spring.restSpeed && Math.abs(e.v) < spring.restSpeed) spring.place()
    }
  }
}
