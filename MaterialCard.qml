import QtQuick
import QtQuick.Effects
import qs.Commons
import qs.Commons as Commons
import "GlassMath.js" as GlassMath

// The theme material for an Omarchy KeyboardPanel's card. With a theme
// material (edge option "theme": the theme's bar-material.json, Tusche &
// Papier) the card takes the theme's light and shadow – a hard ink shadow
// (Papier), a light halo (Tusche) – and rolls out of the bar from the top,
// and back up when it closes.
// A material card with `bloom` (the Lavur themes) blooms instead: it takes
// the card's own fill and frame away and grows out of the bar behind it as
// a sheet of wet paper (InkSheet) – a drop under the anchor, then the card's
// size; ink fills it, the water clears it, and the pigment dries into a rim
// at its calm edge (frame round 03.10.2026), standing still once dry. The
// content fades in last. Closing: the content fades, the sheet shrinks back
// into the bar and a faint trace lingers for a moment. Top bars only.
// The metal family (Chrom & Platin: material.metal) keeps the rolling card
// and frames it with a chrome tube (MetalShape) instead of Omarchy's line; a
// glint runs along it once when the card opens.
// Without a material the card stays Omarchy's own, with a faint line and a
// soft shadow (`edge`).
// Declare it inside the panel.
// (Same component in the Tusche Island: keep both copies alike.)
Item {
  id: fp

  property var panel: null
  // The colour the bar ends in (opaque).
  property color color: Qt.rgba(Commons.Color.bar.background.r, Commons.Color.bar.background.g, Commons.Color.bar.background.b, 1)
  // Edge: a faint line in the text colour and a soft shadow, so a popup in
  // the bar's colour still stands apart from windows of the same colour
  // behind it.
  property bool edge: true
  readonly property bool lightTheme: 0.2126 * Commons.Color.popups.background.r + 0.7152 * Commons.Color.popups.background.g + 0.0722 * Commons.Color.popups.background.b > 0.55
  readonly property color rimColor: Util.alpha(Commons.Color.popups.text, lightTheme ? 0.24 : 0.22)
  // the bloom's pigment: the tide colour
  readonly property var tide: bloom && material && material.card ? material.card.tide || null : null

  // Wet bloom (Lavur): the ink fills the bloom, the water clears it from the
  // source outward and pushes the pigment into the edge, where it dries into
  // the rim (InkSheet); while wet the edge is soft and drifts, drying it
  // sharpens and stills.
  property real clearing: 1  // 0 = all ink, 1 = cleared up to the edge
  property real wet: 0       // 1 = wet, 0 = dry
  property real phase: 0     // the wet edge's movement
  readonly property color inkColor: tide ? rgba(tide.color, 1) : Commons.Color.popups.text
  // the clearing front's reach: the farthest corner of the card seen from the source, plus a margin
  readonly property real clearFar: {
    if (!card) return 1
    var sx = dropCx, sy = barBottom, far = 0
    var xs = [card.x, card.x + card.width], ys = [card.y, card.y + card.height]
    for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) far = Math.max(far, Math.hypot(xs[i] - sx, ys[j] - sy))
    return far + 30
  }
  ParallelAnimation {
    id: wetting
    // the water follows the ink: it starts clearing once the drop spreads
    // (the first ~30 % of the growth is the drop) and passes the far corner
    // after the bloom has reached its size
    SequentialAnimation {
      PauseAnimation { duration: 200 }
      NumberAnimation { target: fp; property: "clearing"; from: 0; to: 1; duration: 720; easing.type: Easing.InOutQuad }
    }
    NumberAnimation { target: fp; property: "wet"; from: 1; to: 0; duration: 1700; easing.type: Easing.InQuad }
    NumberAnimation { target: fp; property: "phase"; from: 0; to: 6.283; duration: 1700 }
  }
  function settle() { wetting.stop(); clearing = 1; wet = 0 }
  readonly property real shadowOpacity: lightTheme ? 0.22 : 0.55

  // Inside the panel we sit in its content holder; its parent is the card,
  // and the card's parent the panel window's root item.
  readonly property Item card: parent && parent.parent && parent.parent.borderSpec !== undefined ? parent.parent : null
  readonly property Item surface: card ? card.parent : null
  // Lavur material: the card grows out of the bar as a bloom
  readonly property bool bloomWanted: !!material && !!material.card && material.card.bloom === true
  readonly property bool active: bloomWanted && !!card && !!surface && !!panel && panel.barPos === "top"
  readonly property bool bloom: active
  readonly property bool reduced: Style.reduceMotion

  // Theme material (bar-material.json; set while the edge option is "theme").
  property var material: null
  readonly property var mat: material && material.card ? material.card : null
  readonly property bool matOn: !!mat && mat.bloom !== true && !!card && !!surface && !!panel
  readonly property bool rolls: matOn && mat.roll !== false && panel.barPos === "top"
  // metal family: a chrome rim around the card
  readonly property var metalSpec: material && material.metal ? material.metal : null
  readonly property bool metalOn: matOn && !!metalSpec && !glassOn
  readonly property var glassSpec: material && material.glass ? material.glass : null
  readonly property bool glassOn: matOn && !!glassSpec && glassSpec.enabled !== false
  readonly property bool springOn: rolls && !!glassSpec && glassSpec.spring !== false
  property real roll: 0      // 0 = rolled up into the bar, 1 = open
  property real rollVelocity: 0
  property real rollTarget: 0
  property bool springRunning: false
  // Geometry consumers use [0,1], the spring itself retains its overshoot
  // and velocity so a close/reopen never restarts from an endpoint.
  readonly property real reveal: Math.max(0, Math.min(1, roll))
  // only while it is out or on its way, and on closing until the rolled-in
  // card has faded: released earlier, the whole card flashed up at full
  // height for the panel's fade (closed, the card and its mask need no layer)
  readonly property bool rolling: rolls && roll < 0.999 && (panel.open || roll > 0.001 || (!!card && card.opacity > 0.001))
  // How far the card is out (0–1): the roll, the bloom's growth,
  // else its fade – a source tab stays until its card is back in the bar.
  readonly property real presence: rolls ? roll : active ? grow : (card ? card.opacity : 0)
  // Closing a rolling card: some panels drop part of their content the
  // moment they close (Omarchy's audio panel detaches its device lists), so
  // the card jumped to a smaller size before rolling in. While the card is
  // open a snapshot follows it, clipped away; on closing it freezes as it
  // was and rolls in instead of the card.
  readonly property bool rollingIn: rolls && !panel.open && roll > 0.001
  property real snapX: 0
  property real snapY: 0
  property real snapW: 1
  property real snapH: 1
  // taken a moment later, once the change has settled: a panel that drops
  // content on closing changes the card's size in the same breath as its
  // `open`, which may still read true at that instant
  function keepSnap() { Qt.callLater(fp.takeSnap) }
  function takeSnap() {
    if (!card || !panel || !panel.open) return
    snapX = card.x; snapY = card.y; snapW = card.width; snapH = card.height
  }
  Connections {
    target: fp.card
    function onXChanged() { fp.keepSnap() }
    function onYChanged() { fp.keepSnap() }
    function onWidthChanged() { fp.keepSnap() }
    function onHeightChanged() { fp.keepSnap() }
  }
  // where the card is drawn: the frozen snapshot while it rolls in
  readonly property real frameX: rollingIn ? snapX : (card ? card.x : 0)
  readonly property real frameY: rollingIn ? snapY : (card ? card.y : 0)
  readonly property real frameW: rollingIn ? snapW : (card ? card.width : 0)
  readonly property real frameH: rollingIn ? snapH : (card ? card.height : 0)
  function rgba(hex, alpha) { var c = Qt.color(hex || "#000000"); return Qt.rgba(c.r, c.g, c.b, alpha === undefined ? 1 : alpha) }
  // the card's own shadow/halo from the material (null: the default soft shadow)
  readonly property var matShadow: !mat ? null : (mat.shadow ? { color: rgba(mat.shadow.color, mat.shadow.alpha), dx: mat.shadow.dx || 0, dy: mat.shadow.dy || 0, blur: 0 }
    : mat.halo ? { color: rgba(mat.halo.color, mat.halo.alpha), dx: 0, dy: 6, blur: mat.halo.blur || 40 }
    : mat.glow ? { color: rgba(mat.glow.color, mat.glow.alpha), dx: 0, dy: 0, blur: mat.glow.blur || 18 } : null)

  property real grow: 0      // 0 = inside the bar, 1 = the card's size
  property real ink: 1       // the content's opacity

  readonly property real margin: 32
  readonly property real dropW: 52
  readonly property real dropH: 28
  readonly property real barBottom: card && panel ? card.y - panel.gap : 0
  readonly property real dropCx: {
    if (!card || !panel) return 0
    var cx = panel.centerOnBar ? card.x + card.width / 2 : panel.anchorScreenPos.x + panel.anchorW / 2
    return Math.max(card.x + dropW / 2, Math.min(card.x + card.width - dropW / 2, cx))
  }

  // The card's fill and frame give way to the bloom; its opacity carries
  // the content (kept just above 0 while the blob shrinks, so the panel,
  // which unmaps at opacity 0, stays up until the bloom is back in the bar).
  Binding { target: fp.card; property: "color"; value: "transparent"; when: fp.active }
  Binding { target: fp.card; property: "borderSpec"; value: Border.flat("transparent", Math.max(1, Style.space(2))); when: fp.active }
  Binding { target: fp.card; property: "opacity"; value: Math.max(fp.ink, fp.grow > 0.001 ? 0.004 : 0); when: fp.active }
  // metal: the chrome rim replaces the card's own frame
  Binding { target: fp.card; property: "borderSpec"; value: Border.flat("transparent", Math.max(1, Style.space(2))); when: fp.metalOn }
  Binding { target: fp.card; property: "color"; value: "transparent"; when: fp.glassOn }
  Binding { target: fp.card; property: "borderSpec"; value: Border.flat("transparent", Math.max(1, Style.space(2))); when: fp.glassOn && !fp.metalOn }
  // Rolling (material): the card stays up while it rolls back into the bar;
  // a mask on the card's layer shows only the rolled-out part.
  Binding { target: fp.card; property: "opacity"; value: fp.panel && (fp.panel.open || fp.roll > 0.001) ? 1 : 0; when: fp.rolls }
  // the card hangs flush from the bar: the inverted source tab runs into it
  Binding { target: fp.panel; property: "gap"; value: 0; when: fp.rolls }
  Binding { target: fp.card ? fp.card.layer : null; property: "enabled"; value: true; when: fp.rolling && !!fp.rollMask }
  Binding { target: fp.card ? fp.card.layer : null; property: "effect"; value: rollEffect; when: fp.rolling && !!fp.rollMask }
  Component {
    id: rollEffect
    MultiEffect { maskEnabled: true; maskSource: fp.rollMask; maskThresholdMin: 0.5; maskSpreadAtMin: 0; autoPaddingEnabled: false }
  }
  NumberAnimation { id: rollOut; target: fp; property: "roll"; to: 1; duration: 260; easing.type: Easing.OutCubic }
  NumberAnimation { id: rollIn; target: fp; property: "roll"; to: 0; duration: 200; easing.type: Easing.InCubic }
  FrameAnimation {
    running: fp.springRunning && fp.springOn && !fp.reduced
    onTriggered: {
      var s = GlassMath.step(fp.roll, fp.rollVelocity, fp.rollTarget, frameTime,
                             fp.glassSpec.omega || 22, fp.glassSpec.damping || 0.82)
      fp.roll = s.x; fp.rollVelocity = s.v
      if (GlassMath.settled(fp.roll, fp.rollVelocity, fp.rollTarget)) {
        fp.roll = fp.rollTarget; fp.rollVelocity = 0; fp.springRunning = false
      }
    }
  }

  function blobRect() {
    if (!card) return { x: 0, y: 0, w: 0, h: 0 }
    var d = Math.min(1, grow / 0.3)
    var e = Math.max(0, Math.min(1, (grow - 0.3) / 0.7))
    e = 1 - Math.pow(1 - e, 3)
    var fullH = card.y + card.height - barBottom
    var dx = dropCx - dropW / 2
    return {
      x: dx + (card.x - dx) * e,
      y: barBottom,
      w: dropW + (card.width - dropW) * e,
      h: d * dropH + (fullH - dropH) * e
    }
  }
  readonly property var blob: { grow; card ? card.x + card.y + card.width + card.height : 0; return blobRect() }

  SequentialAnimation {
    id: opening
    NumberAnimation { target: fp; property: "grow"; to: 1; duration: 480; easing.type: Easing.Linear }
    NumberAnimation { target: fp; property: "ink"; to: 1; duration: 140; easing.type: Easing.Linear }
  }
  SequentialAnimation {
    id: closing
    NumberAnimation { target: fp; property: "ink"; to: 0; duration: 110; easing.type: Easing.Linear }
    ScriptAction {
      script: {
        if (!fp.stage) return
        var g = fp.stage.ghost
        g.x = fp.blob.x - fp.stage.x; g.y = fp.blob.y - fp.stage.y
        g.width = fp.blob.w; g.height = fp.blob.h
        g.opacity = 0.16
        ghostFade.target = g
        ghostFade.restart()
      }
    }
    NumberAnimation { target: fp; property: "grow"; to: 0; duration: 380; easing.type: Easing.Linear }
  }
  NumberAnimation { id: ghostFade; property: "opacity"; to: 0; duration: 760; easing.type: Easing.InQuad }

  function followRoll() {
    // Same rule as the bloom below: when rolling stops applying, only stop –
    // never write roll through a Binding that is about to be released.
    if (!rolls) { rollOut.stop(); rollIn.stop(); return }
    if (springOn) {
      rollOut.stop(); rollIn.stop()
      rollTarget = panel.open ? 1 : 0
      if (reduced || panel.popoutSwitchClosing || (roll <= 0 && !panel.open)) {
        springRunning = false; rollVelocity = 0; roll = rollTarget
      } else springRunning = true
      return
    }
    if (panel.open) {
      rollIn.stop()
      if (reduced) { rollOut.stop(); roll = 1; return }
      rollOut.start()            // from where it is: 0 when fresh, partway when reopened
    } else {
      rollOut.stop()
      if (reduced || roll <= 0 || panel.popoutSwitchClosing) { rollIn.stop(); roll = 0; return }
      rollIn.start()
    }
  }
  // becoming a rolling card: take the state without animating (open = out, closed = in)
  onRollsChanged: { rollOut.stop(); rollIn.stop(); springRunning = false; rollVelocity = 0; if (rolls) roll = panel && panel.open ? 1 : 0 }
  onSpringOnChanged: { springRunning = false; rollVelocity = 0; if (rolls) followRoll() }
  onGlassOnChanged: if (!glassOn && glassBody) glassBody.stop()
  // Reduced Motion switched on mid-roll or mid-bloom: jump to where it is going
  onReducedChanged: {
    if (!reduced) return
    if (rolls && (rollOut.running || rollIn.running || springRunning)) followRoll()
    if (active && (opening.running || closing.running)) { opening.stop(); closing.stop(); follow() }
    if (wetting.running) settle()
  }

  function follow() {
    followRoll()
    // Bloom off: only stop. Writing grow/ink here would still go through the
    // card's opacity Binding (not yet released) and start the panel's
    // opacity Behavior, which then outlives the restored binding — closed
    // popups came back fully opaque and never unmapped. Turning the bloom
    // on again resets both below.
    if (!active) { opening.stop(); closing.stop(); settle(); return }
    if (panel.open) {
      closing.stop()
      if (reduced) { grow = 1; ink = 1; settle(); return }
      if (grow >= 1) ink = 1          // reopened while still up
      else {
        ink = 0; opening.start()
        // all ink from the first frame (the pause in `wetting` holds it)
        wetting.stop(); clearing = 0; wet = 1; phase = 0; wetting.start()
      }
    } else {
      opening.stop()
      // Switching to another bar popup closes this one at once (as
      // KeyboardPanel does): no shrinking bloom next to the new one.
      if (reduced || grow <= 0 || panel.popoutSwitchClosing) {
        closing.stop(); grow = 0; ink = 0
        if (stage) stage.ghost.opacity = 0
        return
      }
      closing.start()
    }
  }
  Connections {
    target: fp.panel
    function onOpenChanged() {
      fp.keepSnap(); fp.follow(); fp.glintPending = fp.panel.open; fp.glint()
      if (fp.glassBody) { if (fp.panel.open) fp.glassBody.play(); else fp.glassBody.stop() }
    }
  }
  onActiveChanged: follow()

  // The bloom, under the card in the panel window. Clipped at the bar's
  // lower edge: the sheet reaches up into the bar, but nothing may be
  // painted over the bar's widgets.
  // Created straight into the panel window, under the card.
  property Item stage: null
  readonly property real ghostOpacity: stage ? stage.ghost.opacity : 0
  Component {
    id: stageComponent
    Item {
      id: stageItem
      readonly property alias ghost: ghost
      visible: fp.active && (fp.grow > 0 || ghost.opacity > 0)
      x: fp.card ? fp.card.x - fp.margin : 0
      y: fp.barBottom
      width: fp.card ? fp.card.width + fp.margin * 2 : 0
      height: fp.card ? fp.card.y + fp.card.height + fp.margin - fp.barBottom : 0
      clip: true

      Item {
        anchors.fill: parent
        layer.enabled: stageItem.visible && ghost.opacity > 0
        layer.effect: MultiEffect { blurEnabled: true; blur: 1; blurMax: 48; autoPaddingEnabled: false }
        Rectangle { id: ghost; opacity: 0; radius: 12; color: fp.color }
      }

      // the bloom: one sheet of wet paper (layer coordinates: the bar's
      // lower edge at `margin`; the wet ink below its edge only)
      InkSheet {
        y: -fp.margin
        width: stageItem.width
        height: stageItem.height + fp.margin
        blobX: fp.blob.x - stageItem.x
        blobY: fp.margin
        blobW: fp.grow > 0 ? fp.blob.w : 0
        blobH: fp.blob.h
        barY: fp.margin
        originX: fp.margin
        originY: fp.card ? fp.card.y - fp.barBottom + fp.margin : fp.margin
        paper: fp.color
        ink: fp.inkColor
        light: fp.lightTheme
        rest: fp.mat ? fp.mat.rest || null : null
        haloBase: fp.mat ? fp.mat.halo || null : null
        clearing: fp.clearing
        wet: fp.wet
        phase: fp.phase
        // the source: where the blob leaves the bar
        sourceX: fp.dropCx - stageItem.x
        sourceY: fp.margin - 2
        reach: fp.clearFar
        inkTop: fp.margin - 4
        band: 58
        jitter: 26
        seed: 5
      }
    }
  }

  // Without the bloom: line on the card and a shadow (or the material's
  // shadow or halo) under it, fading with the card.
  property Item cardShadow: null
  property Item cardLine: null
  Component {
    id: cardShadowComponent
    Item {
      id: shade
      readonly property real spread: 40
      // material: the theme's hard shadow (no blur) or halo; else the soft default
      readonly property var spec: fp.matOn ? fp.matShadow : null
      readonly property bool soft: !spec || spec.blur > 0
      visible: (fp.edge || !!spec) && !fp.active && !!fp.card && fp.card.opacity > 0 && (!fp.matOn || !!spec)
      opacity: fp.card ? fp.card.opacity : 0
      x: fp.frameX - spread
      y: fp.frameY - spread
      width: fp.frameW + 2 * spread
      height: fp.frameH + 2 * spread
      layer.enabled: visible && soft
      layer.effect: MultiEffect { blurEnabled: true; blur: 1; blurMax: shade.spec ? Math.min(64, shade.spec.blur) : 32; autoPaddingEnabled: false }
      Rectangle {
        x: parent.spread + (shade.spec ? shade.spec.dx : 2)
        y: parent.spread + (shade.spec ? shade.spec.dy : 8)
        width: parent.width - 2 * parent.spread - (shade.spec ? 0 : 4)
        // rolls with the card
        height: (parent.height - 2 * parent.spread - (shade.spec ? 0 : 6)) * (fp.rolls ? fp.reveal : 1)
        radius: fp.card ? fp.card.radius : 0
        color: shade.spec ? shade.spec.color : Qt.rgba(0, 0, 0, fp.shadowOpacity)
      }
    }
  }
  // the roll mask: the card's top part, as far as it has rolled out
  property Item rollMask: null
  Component {
    id: rollMaskComponent
    Item {
      visible: false
      layer.enabled: fp.rolling
      x: fp.card ? fp.card.x : 0
      y: fp.card ? fp.card.y : 0
      width: fp.card ? fp.card.width : 1
      height: fp.card ? fp.card.height : 1
      Rectangle { width: parent.width; height: parent.height * fp.reveal; color: "white" }
    }
  }
  // the snapshot: follows the open card (clipped to nothing), frozen on
  // closing and cut to the part that is still out
  property Item rollSnap: null
  Component {
    id: rollSnapComponent
    Item {
      visible: fp.rolls
      x: fp.snapX
      y: fp.snapY
      width: fp.snapW
      height: fp.rollingIn ? fp.snapH * fp.reveal : 0
      clip: true
      ShaderEffectSource {
        width: fp.snapW
        height: fp.snapH
        sourceItem: fp.rolls ? fp.card : null
        live: !!fp.panel && fp.panel.open
        hideSource: fp.rollingIn
      }
    }
  }
  // the chrome rim (metal family): rolls out with the card, fades with it;
  // it glints once as the card opens – deferred until the rim is visible
  // (the card's opacity is still 0 at the moment `open` turns true)
  property Item metalRim: null
  property bool glintPending: false
  function glint() {
    if (!glintPending || !metalRim || !metalRim.visible || metalRim.width <= 0) return
    glintPending = false
    metalRim.play()
  }
  Component {
    id: metalRimComponent
    MetalShape {
      spec: fp.metalSpec
      visible: fp.metalOn && !!fp.card && fp.card.opacity > 0
      opacity: fp.card ? fp.card.opacity : 0
      pad: 3
      radius: fp.card ? fp.card.radius : 0
      x: fp.frameX - pad
      y: fp.frameY - pad
      width: fp.frameW + 2 * pad
      height: fp.frameH * (fp.rolls ? fp.reveal : 1) + 2 * pad
      onVisibleChanged: fp.glint()
    }
  }
  Component {
    id: cardLineComponent
    Rectangle {
      anchors.fill: parent
      z: 1000
      visible: fp.edge && !fp.active && !fp.matOn
      color: "transparent"
      radius: fp.card ? fp.card.radius : 0
      border.width: 1
      border.color: fp.rimColor
    }
  }

  property Item glassBody: null
  function stateObject() {
    return { glass: glassOn, spring: springOn, rolling: springRunning,
             reveal: reveal, velocity: rollVelocity,
             radius: card ? card.radius : null, size: [frameW, frameH],
             open: !!panel && panel.open, backing: glassSpec ? glassSpec.backing : null,
             captureBlocked: glassBody ? glassBody.captureBlocked : true,
             captures: glassBody ? glassBody.capturedWindows : 0,
             lightRunning: glassBody ? glassBody.glintRunning : false }
  }
  Component {
    id: glassBodyComponent
    GlassSurface {
      spec: fp.glassSpec
      visible: fp.glassOn && !!fp.card && fp.card.opacity > 0.001
      active: visible
      live: !!fp.panel && fp.panel.open
      opacity: fp.card ? fp.card.opacity : 0
      x: fp.frameX
      y: fp.frameY
      width: fp.frameW
      height: fp.frameH
      radius: fp.card ? fp.card.radius : 0
      reveal: fp.rolls ? fp.reveal : 1
      onVisibleChanged: if (visible && fp.panel && fp.panel.open) play()
    }
  }

  Component.onCompleted: {
    if (surface) {
      cardShadow = cardShadowComponent.createObject(surface, { z: card.z - 2 })
      stage = stageComponent.createObject(surface, { z: card.z - 1 })
      rollMask = rollMaskComponent.createObject(surface, { z: card.z - 3 })
      rollSnap = rollSnapComponent.createObject(surface, { z: card.z + 1 })
      metalRim = metalRimComponent.createObject(surface, { z: card.z + 2 })
      glassBody = glassBodyComponent.createObject(surface, { z: card.z - 0.5 })
    }
    keepSnap()
    if (card) cardLine = cardLineComponent.createObject(card)
    follow()
  }
  Component.onDestruction: {
    if (stage) stage.destroy()
    if (cardShadow) cardShadow.destroy()
    if (cardLine) cardLine.destroy()
    if (rollMask) rollMask.destroy()
    if (rollSnap) rollSnap.destroy()
    if (metalRim) metalRim.destroy()
    if (glassBody) glassBody.destroy()
  }
}
