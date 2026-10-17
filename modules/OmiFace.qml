import QtQuick
import qs.Commons
import "../FocusSeal.js" as Model
import "../OmiArt.js" as Art
import "../IdleDirector.js" as Director

// Omi, the Omarchy mascot (https://github.com/tahayvr/omi), as the face of
// the focus seal (option seal: omi). The plugin does not ship him: the player and
// the kit are read from the user's data directory (setup/omi-fetch.sh), and while
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
// While nothing else is going on he has an idle life, like a game character nobody is
// steering (IdleDirector.js decides, this plays): glances, fidgets from the kit, a fly
// to chase, a yawn, sleep, and a start when you come back. Hovering him for a moment
// swaps the bubble for the time.
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
  // The seal's window is on screen (the bar is hidden): only then does he have an idle life.
  property bool onScreen: true
  // The idle life: "lively", "gentle" or "off"; `userIdle` is the IdleMonitor's word that
  // nobody has touched anything for a while; `hovered` the pointer on him.
  property string intensity: "lively"
  property bool userIdle: false
  property bool hovered: false

  readonly property var omi: loader.item
  readonly property var modeIds: omi && omi.modes ? omi.modes.map(function(m) { return m.id }) : []
  readonly property bool available: !!omi && modeIds.length > 0
  property bool asleep: false
  readonly property string omiMode: Art.modeFor(asleep && companion.face === "calm" ? "asleep" : companion.face, modeIds)
  readonly property color tone: companion.tone === "urgent" ? urgent : accent
  readonly property color badgeTone: !showClock && companion.badge && companion.badge.tone === "urgent" ? urgent : accent
  readonly property bool showBattery: available && companion.face === "battery"
  readonly property string said: Model.describeCompanion(companion, companion.level)

  // A finished agent: a short reaction, then back to what he was doing.
  function react() { if (omi) omi.react("success") }
  // A new notification: the bubble pops.
  // (Not tied to the bubble being there yet: the count and the event arrive together.)
  function pop() { if (!Style.reduceMotion) popAnimation.restart() }
  readonly property real badgeScale: badgeLayer.scale

  // Omi and his outline, which lift for a yawn; the bubble, battery and fly stay put.
  property real lift: 0
  readonly property real cell: omi ? omi.unit * Art.CELL : 3
  Item {
    id: body
    width: face.width; height: face.height
    y: Math.round(face.lift)

    Loader {
      id: loader
      anchors.fill: parent
      active: face.active && face.packUrl.toString() !== ""
      source: face.packUrl
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

  // A kit rectangle (grid units) in this item's pixels, snapped as Omi snaps his own.
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

  // The speech bubble: outline, solid body, tail, the glyphs cut out of it.
  // Hovering him for a moment shows the time in its place.
  property bool showClock: false
  property string clockText: "00:00"
  readonly property var bubble: !available ? null
    : showClock ? Art.clock(clockText)
    : companion.badge ? Art.bubble(companion.badge.count) : null
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

  // ------------------------------------------------------------------ idle life

  readonly property bool idleLife: available && active && onScreen && intensity !== "off" && !Style.reduceMotion
  property var director: Director.initial()

  function perform(a) {
    if (!omi) return
    if (a.kind === "look") omi.look = [a.x, a.y]
    else if (a.kind === "react") omi.react(a.mode, a.seconds)
    else if (a.kind === "fly") startFly()
    else if (a.kind === "yawn") { stopFidgets(); yawnAnimation.restart() }
    else if (a.kind === "sleep") { stopFidgets(); asleep = true }
    else if (a.kind === "wake") { asleep = false; stopFidgets(); if (a.startle) omi.react("excited", 1) }
    else if (a.kind === "cancel") stopFidgets()
  }
  // Whatever is playing stops, he looks ahead again.
  function stopFidgets() {
    flyTimer.stop(); flyT = -1
    yawnAnimation.stop(); lift = 0
    if (omi) { omi.reaction = ""; omi.look = [0, 0] }
  }
  // A preview (`play("sleep")`) holds him for a while although you are plainly there.
  property real previewUntil: 0
  property real previewSeconds: 12
  // The preview ends by itself even when the director is not ticking (idle life off).
  Timer {
    id: previewWake
    interval: face.previewSeconds * 1000
    onTriggered: { face.previewUntil = 0; face.perform({ kind: "wake", startle: true }); face.director = Director.initial() }
  }
  function directorStep() {
    if (Date.now() < previewUntil && companion.face === "calm") return
    var now = new Date()
    var r = Director.step(director, { profileName: intensity, now: now.getTime(), idle: userIdle, calm: companion.face === "calm" || companion.face === "working", working: companion.face === "working",
                                      reduced: Style.reduceMotion, hour: now.getHours(), modes: modeIds, rnd: Math.random })
    director = r.model
    for (var i = 0; i < r.actions.length; i++) perform(r.actions[i])
  }
  Timer { interval: 500; repeat: true; running: face.idleLife; onTriggered: face.directorStep() }
  // Anything else to say (a failure, a waiting agent, the battery) ends whatever the idle life
  // is playing at once, whoever started it.
  // (A working agent does not count: he glances and fidgets on, but does not yawn or sleep.)
  readonly property bool calmFace: companion.face === "calm" || companion.face === "working"
  onCalmFaceChanged: if (!calmFace) { asleep = false; previewWake.stop(); stopFidgets() }
  onIdleLifeChanged: if (!idleLife) { asleep = false; stopFidgets(); director = Director.initial() }

  // A named piece of the idle life on demand (the IPC preview): any fidget of the director's
  // list by id, "glance", "yawn", "sleep", "wake", "clock", "stop".
  function play(name) {
    if (!available) return "Omi is not installed (setup/omi-fetch.sh)"
    if (name === "stop") { previewUntil = 0; previewWake.stop(); asleep = false; stopFidgets(); showClock = false; director = Director.initial(); return "ok" }
    if (name === "glance") { perform({ kind: "look", x: Math.random() < 0.5 ? -1 : 1, y: 0 }); lookAhead.restart(); return "ok" }
    if (name === "yawn") { perform({ kind: "yawn" }); return "ok" }
    if (name === "sleep") {
      director = Object.assign(Director.initial(), { phase: "asleep", active: true })
      previewUntil = Date.now() + previewSeconds * 1000
      previewWake.restart()
      perform({ kind: "sleep" }); return "ok"
    }
    if (name === "wake") { previewUntil = 0; previewWake.stop(); perform({ kind: "wake", startle: true }); director = Director.initial(); return "ok" }
    if (name === "clock") { clockText = Qt.formatTime(new Date(), "HH:mm"); showClock = true; clockHold.restart(); return "ok" }
    for (var i = 0; i < Director.FIDGETS.length; i++) {
      var f = Director.FIDGETS[i]
      if (f.id !== name) continue
      perform(f.kind === "react" ? { kind: "react", mode: f.mode, seconds: f.seconds } : { kind: "fly" })
      return "ok"
    }
    return "unknown: glance yawn sleep wake clock stop " + Director.FIDGETS.map(function(x) { return x.id }).join(" ")
  }
  Timer { id: lookAhead; interval: 2000; onTriggered: if (face.omi) face.omi.look = [0, 0] }

  // Yawn: the eyes squeeze shut, he stretches up two cells, holds, and settles back with a dip.
  SequentialAnimation {
    id: yawnAnimation
    ScriptAction { script: if (face.omi) face.omi.react("laughing", 2.4) }
    NumberAnimation { target: face; property: "lift"; to: -2 * face.cell; duration: 800; easing.type: Easing.OutCubic }
    PauseAnimation { duration: 700 }
    NumberAnimation { target: face; property: "lift"; to: face.cell; duration: 450; easing.type: Easing.InQuad }
    NumberAnimation { target: face; property: "lift"; to: 0; duration: 220; easing.type: Easing.OutQuad }
  }

  // The fly: a sprite on the grid that his eyes follow; when it has gone he raises a brow.
  property real flyT: -1
  property int flySeed: 0
  property real flyStart: 0
  readonly property var flyNow: flyT >= 0 ? Art.fly(flyT, flySeed) : null
  function startFly() {
    flySeed = Math.floor(Math.random() * 1000)
    flyStart = Date.now()
    flyT = 0
    flyTimer.restart()
  }
  Timer {
    id: flyTimer
    interval: 50; repeat: true
    onTriggered: {
      var t = (Date.now() - face.flyStart) / 1000
      var f = Art.fly(t, face.flySeed)
      if (!f.alive) {
        stop(); face.flyT = -1
        if (face.omi) { face.omi.look = [0, 0]; face.omi.react("skeptical", 1.2) }
        return
      }
      face.flyT = t
      if (f.visible && face.omi) face.omi.look = Art.lookAt(f.x, f.y)
    }
  }
  Item {
    anchors.fill: parent
    visible: !!face.flyNow && face.flyNow.visible
    Repeater {
      model: face.flyNow && face.flyNow.visible ? Art.flyRects(face.flyNow) : []
      delegate: Rectangle {
        required property var modelData
        readonly property var p: face.place(modelData, face.rim)
        x: p.x; y: p.y; width: p.w; height: p.h
        color: face.ground
        antialiasing: false
      }
    }
    Repeater {
      model: face.flyNow && face.flyNow.visible ? Art.flyRects(face.flyNow) : []
      delegate: Rectangle {
        required property var modelData
        readonly property var p: face.place(modelData, 0)
        x: p.x; y: p.y; width: p.w; height: p.h
        color: face.tone
        antialiasing: false
      }
    }
  }

  // Hovering: after a moment the bubble shows the time, until the pointer leaves.
  Timer {
    id: hoverDelay
    interval: 700
    running: face.hovered && face.available
    onTriggered: { face.clockText = Qt.formatTime(new Date(), "HH:mm"); face.showClock = true }
  }
  Timer { id: clockHold; interval: 4000; onTriggered: if (!face.hovered) face.showClock = false }
  Timer {
    interval: 1000; repeat: true
    running: face.showClock
    onTriggered: face.clockText = Qt.formatTime(new Date(), "HH:mm")
  }
  onHoveredChanged: if (!hovered && !clockHold.running) showClock = false
}
