import QtQuick
import qs.Commons
import "../FocusSeal.js" as Model
import "../OmiArt.js" as Art

// Omi, the Omarchy mascot (https://github.com/tahayvr/meet-omi), as the face of
// the focus seal (option seal: omi). The plugin does not ship him: the player and
// the pack are read from the user's data directory (setup/omi-fetch.sh), and while
// they are missing `available` stays false and the seal keeps its plain face.
//
// What he says comes from FocusSeal.js `companion`: one face by importance, in the
// accent or, for a failure and a nearly empty battery, the urgent colour; an unread
// count as a solid speech bubble in the corner; a blinking battery in place of the
// face when the charge is all but gone. The bubble and the battery are drawn with
// Omi's own kind of piece, rectangles on his 20-unit grid. Pieces are outlined
// with one device pixel of the ground colour so a single-colour face stays
// readable on any window.
//
// Facts in, pixels out: the window, clicks and data are FocusSeal.qml's.
Item {
  id: face

  property var companion: ({ face: "calm", tone: "accent", level: 1, badge: null })
  property color ground: "white"
  property color accent: "blue"
  property color urgent: "red"
  // Omi.qml, from the data directory. Empty: nothing is loaded.
  property url packUrl: ""
  property bool active: true

  readonly property var omi: loader.item
  readonly property var modeIds: omi && omi.modes ? omi.modes.map(function(m) { return m.id }) : []
  readonly property bool available: !!omi && modeIds.length > 0
  readonly property string omiMode: Art.modeFor(companion.face, modeIds)
  readonly property color tone: companion.tone === "urgent" ? urgent : accent
  readonly property color badgeTone: companion.badge && companion.badge.tone === "urgent" ? urgent : accent
  readonly property bool showBattery: available && companion.face === "battery"
  readonly property string said: Model.describeCompanion(companion, companion.level)

  // A finished agent: a short reaction, then back to what he was doing.
  function react() { if (omi) omi.react("success") }
  // A new notification: the bubble pops.
  // (Not tied to the bubble being there yet: the count and the event arrive together.)
  function pop() { if (!Style.reduceMotion) popAnimation.restart() }
  readonly property real badgeScale: badgeLayer.scale

  Loader {
    id: loader
    anchors.fill: parent
    active: face.active && face.packUrl.toString() !== ""
    source: face.packUrl
  }

  Binding { target: face.omi; property: "color"; value: face.tone; when: !!face.omi }
  Binding { target: face.omi; property: "mode"; value: face.omiMode; when: face.available }
  // Calm in a corner: no hops and bobs, long still times between blinks, nothing moves
  // at all with reduced motion.
  Binding { target: face.omi; property: "bodyMotion"; value: false; when: !!face.omi }
  Binding { target: face.omi; property: "rest"; value: 2; when: !!face.omi }
  Binding { target: face.omi; property: "animate"; value: !Style.reduceMotion; when: !!face.omi }

  // One device pixel of the ground colour round every piece.
  readonly property real rim: omi ? 1 / omi.dpr : 1

  // A pack rectangle (grid units) in this item's pixels, snapped as Omi snaps his own.
  function place(r, grow) {
    if (!omi) return { x: 0, y: 0, w: 0, h: 0 }     // a binding can run once more while Omi unloads
    var u = omi.unit, x0 = omi.snap(r.x * u + omi.ox), y0 = omi.snap(r.y * u + omi.oy)
    var x1 = omi.snap((r.x + r.w) * u + omi.ox), y1 = omi.snap((r.y + r.h) * u + omi.oy)
    return { x: x0 - grow, y: y0 - grow, w: Math.max(0, x1 - x0) + 2 * grow, h: Math.max(0, y1 - y0) + 2 * grow }
  }
  function placed(list, grow) {
    var out = []
    for (var i = 0; i < list.length; i++) out.push(place(list[i], grow))
    return out
  }

  // The outline under Omi's own pieces (they move every frame, so it follows `rects`).
  Repeater {
    model: face.available ? face.omi.rects.length : 0
    delegate: Rectangle {
      required property int index
      readonly property var r: (face.omi && face.omi.rects && face.omi.rects[index]) || { x: 0, y: 0, w: 0, h: 0, o: 0 }
      readonly property var p: face.place(r, face.rim)
      x: p.x; y: p.y; width: p.w; height: p.h
      color: face.ground
      // only solid pieces get a rim: the dimmed ones (a drained frame) stay ghosts
      opacity: Math.max(0, Math.min(1, (r.o - 0.5) * 2))
      antialiasing: false
      z: -1
    }
  }

  // The speech bubble: outline, solid body, tail, the digits cut out of it.
  readonly property var bubble: companion.badge && available ? Art.bubble(companion.badge.count) : null
  Item {
    id: badgeLayer
    anchors.fill: parent
    visible: !!face.bubble
    transformOrigin: Item.TopRight
    SequentialAnimation {
      id: popAnimation
      NumberAnimation { target: badgeLayer; property: "scale"; to: 1.35; duration: 110; easing.type: Easing.OutQuad }
      NumberAnimation { target: badgeLayer; property: "scale"; to: 1; duration: 240; easing.type: Easing.OutBack }
    }
    Repeater {
      model: face.bubble ? [face.bubble.body].concat(face.bubble.tail) : []
      delegate: Rectangle {
        required property var modelData
        readonly property var p: face.place(modelData, face.rim)
        x: p.x; y: p.y; width: p.w; height: p.h
        color: face.ground
        antialiasing: false
      }
    }
    Repeater {
      model: face.bubble ? [face.bubble.body].concat(face.bubble.tail) : []
      delegate: Rectangle {
        required property var modelData
        readonly property var p: face.place(modelData, 0)
        x: p.x; y: p.y; width: p.w; height: p.h
        color: face.badgeTone
        antialiasing: false
      }
    }
    Repeater {
      model: face.bubble ? face.bubble.digits : []
      delegate: Rectangle {
        required property var modelData
        readonly property var p: face.place(modelData, 0)
        x: p.x; y: p.y; width: p.w; height: p.h
        color: face.ground
        antialiasing: false
      }
    }
  }

  // The battery in place of the face: blinks while the charge is nearly gone.
  readonly property var cells: showBattery ? Art.battery(Art.batteryCells(companion.level)) : null
  property bool blinkOn: true
  Timer {
    interval: 550; repeat: true
    running: face.showBattery && !Style.reduceMotion
    onRunningChanged: if (!running) face.blinkOn = true
    onTriggered: face.blinkOn = !face.blinkOn
  }
  Item {
    anchors.fill: parent
    visible: face.showBattery
    opacity: face.blinkOn ? 1 : 0.25
    Repeater {
      model: face.cells ? face.cells.outline.concat(face.cells.fill) : []
      delegate: Rectangle {
        required property var modelData
        readonly property var p: face.place(modelData, face.rim)
        x: p.x; y: p.y; width: p.w; height: p.h
        color: face.ground
        antialiasing: false
      }
    }
    Repeater {
      model: face.cells ? face.cells.outline.concat(face.cells.fill) : []
      delegate: Rectangle {
        required property var modelData
        readonly property var p: face.place(modelData, 0)
        x: p.x; y: p.y; width: p.w; height: p.h
        color: face.urgent
        antialiasing: false
      }
    }
  }
}
