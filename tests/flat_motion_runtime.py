#!/usr/bin/env python3
"""Real Qt run of MaterialCard's flat motion (no material, no bloom).

A fresh open pops out of the anchor on a spring with a short overshoot and
rests at an identity transform; closing shrinks back without one; a popup
switch hands the outgoing card's rect to the incoming card, whose plate
springs from there while the outgoing content fades out; Reduced Motion
leaves only the panel's own fade. Without a material no extra shadow or line
is drawn. Only the palette/spacing environment is stubbed (as card_frame.py).
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
COMMONS = Path(os.environ.get("OMARCHY_PATH", str(Path.home() / "omarchy"))) / "shell/Commons"

PANEL = '''QtObject {
  id: PID
  property bool open: false
  property string barPos: "top"
  property real gap: 8
  property bool centerOnBar: false
  property point anchorScreenPos: Qt.point(AX, 0)
  property real anchorW: 30
  property real anchorH: 30
  property bool popoutSwitching: false
  property bool popoutSwitchClosing: false
  property var screen: ({ name: "T" })
  property var borderSpec: Border.flat("#445566", 1)
  // KeyboardPanel's order: it raises popoutSwitching, then the bar closes the other popup
  property var switchFrom: null
  onOpenChanged: {
    if (open && switchFrom && switchFrom.open) { popoutSwitching = true; switchFrom.popoutSwitchClosing = true; switchFrom.open = false }
    if (!open) popoutSwitching = false
  }
}'''

CARD = '''Rectangle {
  id: CID
  x: CX; y: 40; width: CW; height: CH
  color: "#334455"
  radius: 6
  property var borderSpec: PID.borderSpec
  // as Omarchy's BorderSurface draws a flat line
  border.color: Border.color(borderSpec)
  border.width: Border.uniformWidth(borderSpec)
  opacity: PID.open || PID.popoutSwitching ? 1 : 0
  Item { id: HID; anchors.fill: parent; MaterialCard { id: MID; panel: PID; material: null } }
}'''


def panel(pid, ax):
    return PANEL.replace("PID", pid).replace("AX", str(ax))


def card(cid, pid, hid, mid, x, w, h):
    return (CARD.replace("CID", cid).replace("PID", pid).replace("HID", hid).replace("MID", mid)
            .replace("CX", str(x)).replace("CW", str(w)).replace("CH", str(h)))


def run():
    with tempfile.TemporaryDirectory(prefix="flat-motion-", dir=os.environ.get("TMPDIR")) as tmp:
        tmp = Path(tmp)
        commons = tmp / "Commons"
        commons.mkdir(parents=True)
        for name in ["Border.qml", "BorderGeometry.js", "Util.qml"]:
            shutil.copy2(COMMONS / name, commons / name)
        (commons / "qmldir").write_text("module qs.Commons\nsingleton Border 1.0 Border.qml\nsingleton Util 1.0 Util.qml\nsingleton Color 1.0 Color.qml\nsingleton Style 1.0 Style.qml\n")
        (commons / "Color.qml").write_text('''pragma Singleton
import QtQuick
QtObject {
 property var shellValues: ({})
 property color foreground: "#eeeeee"
 property color accent: "#ff7d62"
 property color urgent: "red"
 property color background: "#0f121a"
 property QtObject popups: QtObject { property color background: "#0f121a"; property color text: "#eeeeee" }
 property QtObject bar: QtObject { property color background: "#090b10" }
}
''')
        (commons / "Style.qml").write_text('''pragma Singleton
import QtQuick
QtObject { property bool reduceMotion: false; function space(n) { return n } function duration(n) { return n } }
''')
        for name in ["MaterialCard.qml", "InkSheet.qml", "MetalShape.qml", "GlassMath.js", "GlassSurface.qml", "GlassBackdrop.qml"]:
            shutil.copy2(ROOT / name, tmp / name)
        shutil.copytree(ROOT / "shaders", tmp / "shaders")
        (tmp / "test.qml").write_text('''import QtQuick
import Quickshell
import qs.Commons
FloatingWindow {
 id: root
 visible: true; implicitWidth: 640; implicitHeight: 400
 PANEL_A
 PANEL_B
 PANEL_C
 Item {
  width: 640; height: 400
  CARD_A
  CARD_B
 }
 property real maxPop: 0
 property real springPop: 0
 property real minClose: 1
 property bool closing: false
 Connections {
  target: ma
  function onPopChanged() {
   if (!root.closing) root.maxPop = Math.max(root.maxPop, ma.pop)
   else root.minClose = Math.min(root.minClose, ma.pop)
  }
 }
 function fail(msg) { console.error("FAIL " + msg); Qt.exit(1) }
 // calm: a card warming up (its first slow frames) stays unseen, whatever
 // binding gives way to another meanwhile
 Connections {
  target: cardA
  function onOpacityChanged() { if (ma.calm && ma.warming && cardA.opacity > 0) root.fail("calm: card shows while it warms up: " + cardA.opacity) }
 }
 function identity(c) {
  if (c.transform.length !== 2) return false
  var s = c.transform[0], t = c.transform[1]
  return s.xScale === 1 && s.yScale === 1 && t.x === 0 && t.y === 0
 }
 property int step: 0
 Timer {
  interval: 60; running: true; repeat: true
  property int ticks: 0
  onTriggered: {
   ticks++
   if (step === 0) {
    if (!ma.popOn || !mb.popOn) return fail("flat path off without a material")
    if (ma.cardShadow.visible || ma.cardLine.visible) return fail("shadow or extra line without a material")
    // closed: waiting at the pop's start (unseen)
    if (cardA.transform.length !== 2 || cardA.transform[0].xScale !== 0.85) return fail("closed card not at the pop start")
    pa.open = true; step = 1; ticks = 0; return
   }
   if (step === 1) {
    if (ticks === 1 && !(ma.popRunning || ma.warming)) return fail("no pop on a fresh open")
    if (ticks === 1) {
     var o = ma.popOrigin
     if (Math.abs(o.x - (30 + 15 - 20)) > 0.01 || o.y !== 0) return fail("pop origin " + o.x + "," + o.y)
    }
    if (ma.popRunning || ma.warming) return
    if (ma.pop !== 1 || !identity(cardA)) return fail("pop did not rest at 1")
    if (root.maxPop < 1.04 || root.maxPop > 1.12) return fail("overshoot " + root.maxPop + " (damping 0.64 wants ~1.07)")
    if (cardA.opacity !== 1) return fail("card opacity not restored after warming: " + cardA.opacity)
    root.closing = true; pa.open = false; step = 2; ticks = 0; return
   }
   if (step === 2) {
    if (ma.popRunning) return
    if (ma.pop !== 0 || root.minClose < -0.001) return fail("close bounced or did not rest: " + root.minClose)
    root.closing = false
    pa.open = true; step = 3; ticks = 0; return
   }
   if (step === 3) {
    if (ma.popRunning || ma.warming) return
    // switch A -> B: B's plate springs from A's rect, A's content fades out
    pb.switchFrom = pa
    pb.open = true
    if (pa.open) return fail("switch did not close A")
    if (!ma.swapOut) return fail("A did not see the switch")
    if (!mb.swapIn || !mb.swapReady) return fail("B took no rect")
    if (mb.fromX !== cardA.x || mb.fromW !== cardA.width || mb.fromH !== cardA.height) return fail("B's plate starts at " + [mb.fromX, mb.fromY, mb.fromW, mb.fromH] + " not A's rect")
    if (String(cardB.color) !== "#00000000" || String(cardA.color) !== "#00000000") return fail("card fills not handed to the plate")
    if (String(cardB.border.color) !== "#00000000" || String(cardA.border.color) !== "#00000000") return fail("card lines not handed to the plate")
    if (Border.uniformWidth(cardB.borderSpec) !== 1) return fail("line widths (content insets) changed")
    if (!mb.swapPlate.visible) return fail("plate not shown")
    if (mb.pop !== 1) return fail("incoming card popped on a switch")
    step = 4; ticks = 0; return
   }
   if (step === 4) {
    if (ticks === 3) {
     if (hA.opacity > 0.01 || cardA.opacity !== 0) return fail("A's content still up after 180 ms: " + hA.opacity + " / " + cardA.opacity)
    }
    if (mb.swapIn) return
    if (String(cardB.color) !== "#334455" || mb.swapPlate.visible || cardB.opacity !== 1) return fail("B not restored after the switch")
    if (String(cardB.border.color) !== "#445566") return fail("B line not restored")
    if (!identity(cardB)) return fail("B not at identity after the switch")
    if (ma.pop !== 0) return fail("A (switched away) not back at the pop's start: " + ma.pop)
    // B closes, A opens fresh: it pops again
    pb.switchFrom = null; pa.switchFrom = null
    pb.open = false
    pa.open = true
    if (!(ma.warming || ma.popRunning) || ma.swapIn) return fail("A did not pop on a fresh open after a switch")
    step = 45; ticks = 0; return
   }
   if (step === 45) {
    if (ma.popRunning || ma.warming || mb.popRunning) return
    if (!identity(cardA)) return fail("A not at rest after its fresh pop")
    pa.open = false
    // a switch from a popup without our card (another plugin): no rect, B pops
    pc.open = true
    pb.switchFrom = pc
    pb.open = true
    step = 44; ticks = 0; return
   }
   if (step === 44) {
    if (ticks === 1 && (mb.swapIn || !mb.popRunning)) return fail("switch without a rect did not fall back to a pop")
    if (mb.popRunning) return
    if (!identity(cardB) || String(cardB.color) !== "#334455") return fail("B not at rest after the fallback pop")
    pb.open = false; pb.switchFrom = null
    // Reduced Motion: no pop, no switch plate, the card's own size throughout
    Style.reduceMotion = true
    if (!identity(cardA)) return fail("reduced: closing card not at identity")
    step = 46; ticks = 0; return
   }
   if (step === 46) {
    if (ma.popRunning) return fail("reduced close runs a spring")
    pb.open = true
    pb.open = false
    if (!identity(cardB)) return fail("reduced: B not at identity")
    step = 5; ticks = 0; return
   }
   if (step === 5) {
    if (mb.popRunning || mb.pop !== 0) return fail("reduced close moved")
    pb.switchFrom = null
    pa.switchFrom = null
    pb.open = true
    if (mb.popRunning || mb.warming || mb.pop !== 1) return fail("reduced open moved")
    if (!identity(cardB)) return fail("reduced open not at identity")
    pa.switchFrom = pb
    pa.open = true
    if (ma.swapIn || mb.swapOut) return fail("reduced switch used the plate")
    // A: back from swapOut, its own fill and line restored
    if (String(cardA.color) !== "#334455" || String(cardA.border.color) !== "#445566" || hA.opacity !== 1) return fail("A not restored on reopen")
    root.springPop = root.maxPop
    Style.reduceMotion = false
    pa.switchFrom = null; pb.switchFrom = null
    pa.open = false; pb.open = false
    step = 6; ticks = 0; return
   }
   if (step === 6) {
    if (ma.popRunning || ma.warming || mb.popRunning || mb.warming) return
    // Calm (nbshell's motion): timed, from 98.5 %, no overshoot
    ma.calm = true
    if (ma.pop !== 0 || cardA.transform[0].xScale !== 0.985) return fail("calm: closed card not at 98.5 %")
    root.maxPop = 0; root.closing = false
    pa.open = true; step = 7; ticks = 0; return
   }
   if (step === 7) {
    if (ticks > 10) return fail("calm: open still running after 600 ms")
    if (!ma.warming && Math.abs(cardA.opacity - ma.pop) > 0.001) return fail("calm: opacity " + cardA.opacity + " does not follow the pop " + ma.pop)
    if (ma.popRunning || ma.warming) return
    if (root.maxPop > 1.0001) return fail("calm: overshoot " + root.maxPop)
    if (ma.pop !== 1 || !identity(cardA) || cardA.opacity !== 1) return fail("calm: open did not rest")
    root.closing = true; root.minClose = 1; pa.open = false; step = 8; ticks = 0; return
   }
   if (step === 8) {
    if (cardA.transform[1].y !== 0) return fail("calm: closing card moved " + cardA.transform[1].y)
    if (ma.popRunning) return
    if (ma.pop !== 0 || cardA.opacity !== 0 || root.minClose < -0.001) return fail("calm: close did not rest at 0")
    console.log("PASS real Qt: flat pop (overshoot " + root.springPop.toFixed(3) + "), close without bounce, switch handoff, fresh pop after a switch, fallback pop without a rect, Reduced Motion, calm motion")
    Qt.exit(0)
   }
   if (ticks > 60) fail("timeout in step " + step)
  }
 }
}
'''.replace("PANEL_A", panel("pa", 30)).replace("PANEL_B", panel("pb", 300)).replace("PANEL_C", panel("pc", 500))
   .replace("CARD_A", card("cardA", "pa", "hA", "ma", 20, 200, 150))
   .replace("CARD_B", card("cardB", "pb", "hB", "mb", 260, 260, 220)))
        result = subprocess.run(["quickshell", "-p", str(tmp / "test.qml")],
                                env={**os.environ, "QT_QPA_PLATFORM": "offscreen", "QT_QUICK_BACKEND": "software", "QT_FORCE_STDERR_LOGGING": "1", "QT_LOGGING_RULES": "qml=true;qml.*=true"},
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        print(result.stdout, end="")
        assert result.returncode == 0, f"flat motion assertions failed (exit {result.returncode})"
        assert "PASS real Qt:" in result.stdout, "Qt did not complete the assertions"
        assert not any(error in result.stdout for error in ("ReferenceError:", "TypeError:", "Unable to assign", "Binding loop", "is not a type")), result.stdout


if __name__ == "__main__":
    run()
