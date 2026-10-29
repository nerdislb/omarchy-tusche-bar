#!/usr/bin/env python3
"""Real Qt run of EdgeSpring, the two-edge spring under the sliding indicators.

Number mode (the workspace marker): every change glides, the front edge
leads so the marker draws out, it lands exactly and stops its clock; a burst
of retargets keeps the velocity. Vertical item mode (the menu's hot row):
it follows y and height, glides only to a new key, follows the same key at
once, and with no target it rests, so the next row is placed rather than
flown to; an item letting go before the next one takes over still glides.
Reduced Motion places at once. Only the spacing environment is
stubbed (as tab_lens_runtime.py).
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
COMMONS = Path(os.environ.get("OMARCHY_PATH", str(Path.home() / "omarchy"))) / "shell/Commons"

TEST = '''import QtQuick
import Quickshell
import qs.Commons
FloatingWindow {
 id: root
 visible: true; implicitWidth: 200; implicitHeight: 200
 property int active: 0
 EdgeSpring {
  id: marker
  numeric: true
  targetStart: root.active
  targetEnd: root.active + 1
  leadResponse: 0.22; trailResponse: 0.32; damping: 0.86
  epsilon: 0.004; restSpeed: 0.05
 }
 Item {
  Item { id: r0; property string key: "0"; y: 0; height: 24; width: 100 }
  Item { id: r1; property string key: "1"; y: 24; height: 24; width: 100 }
  Item { id: r5; property string key: "5"; y: 120; height: 24; width: 100 }
  EdgeSpring { id: hot; vertical: true; leadResponse: 0.16; trailResponse: 0.20; damping: 1 }
 }
 function fail(m) { console.log("FAIL " + m); Qt.exit(1) }
 property int step: 0
 property int ticks: 0
 property real maxSpan: 1
 property real maxEnd: 0
 FrameAnimation {
  running: true
  onTriggered: {
   root.ticks++
   if (marker.moving) { root.maxSpan = Math.max(root.maxSpan, marker.end - marker.start); root.maxEnd = Math.max(root.maxEnd, marker.end) }
   if (root.step === 0) {
    if (marker.moving || marker.start !== 0 || marker.end !== 1) return fail("number mode: not at rest on 0")
    root.active = 3; root.ticks = 0; root.step = 1
   } else if (root.step === 1) {
    if (root.ticks === 1 && !marker.moving) return fail("number mode: no glide")
    if (marker.moving) { if (root.ticks > 90) fail("marker did not settle"); return }
    if (marker.start !== 3 || marker.end !== 4) return fail("marker did not land: " + marker.start + " " + marker.end)
    if (root.maxSpan < 1.3) return fail("marker did not draw out: " + root.maxSpan)
    if (root.maxEnd > 4.03) return fail("marker overshot: " + root.maxEnd)
    root.ticks = 0; root.step = 2; root.active = 0
   } else if (root.step === 2) {
    if (root.ticks === 5) {
     var s0 = marker.start, v0 = marker.startVelocity
     root.active = 1
     if (marker.start !== s0 || marker.startVelocity !== v0 || !marker.moving) return fail("retarget lost the velocity")
    }
    if (root.ticks <= 5 || marker.moving) { if (root.ticks > 90) fail("burst did not settle"); return }
    if (marker.start !== 1) return fail("burst did not land on 1")
    // vertical item mode
    hot.target = r0
    if (hot.moving || hot.start !== 0 || hot.end !== 24) return fail("first row not placed")
    hot.target = r5; root.ticks = 0; root.step = 3
   } else if (root.step === 3) {
    if (root.ticks === 1 && !hot.moving) return fail("vertical: no glide to a new key")
    if (hot.moving) { if (root.ticks > 60) fail("vertical did not settle"); return }
    if (hot.start !== 120 || hot.end !== 144) return fail("vertical did not land")
    r5.y = 96
    if (hot.moving || hot.start !== 96) return fail("same key moved: glided instead of following")
    hot.target = null
    hot.target = r1
    if (hot.moving || hot.start !== 24 || hot.end !== 48) return fail("after no target: flew instead of placing")
    // A lets go before B takes over (sibling handlers in either order): still a glide
    hot.release(r1, function() { return false })
    hot.target = r5
    if (!hot.moving) return fail("release then take over: placed instead of gliding")
    root.ticks = 0; root.step = 4
   } else if (root.step === 4) {
    if (hot.moving) { if (root.ticks > 60) fail("take-over glide did not settle"); return }
    if (hot.target !== r5 || hot.start !== 96) return fail("released item dropped the new target")
    hot.release(r5, function() { return false })
    root.ticks = 0; root.step = 5
   } else if (root.step === 5) {
    if (hot.target !== null) return fail("a release with nothing taking over kept the target")
    Style.reduceMotion = true
    root.active = 4
    if (marker.moving || marker.start !== 4) return fail("Reduced Motion: marker glided")
    console.log("PASS real Qt: marker draws out to " + root.maxSpan.toFixed(2) + " cells and lands without a visible overshoot, keeps velocity in a burst; vertical rows glide to a new key, follow a moved one, rest without a target, glide when one lets go before the next takes over; Reduced Motion")
    Qt.exit(0)
   }
  }
 }
}
'''


def run():
    with tempfile.TemporaryDirectory(prefix="edge-spring-", dir=os.environ.get("TMPDIR")) as tmp:
        tmp = Path(tmp)
        commons = tmp / "Commons"
        commons.mkdir(parents=True)
        (commons / "qmldir").write_text("module qs.Commons\nsingleton Style 1.0 Style.qml\n")
        (commons / "Style.qml").write_text('''pragma Singleton
import QtQuick
QtObject { property bool reduceMotion: false; function space(n) { return n } function duration(n) { return reduceMotion ? 0 : n } }
''')
        for name in ["EdgeSpring.qml", "GlassMath.js"]:
            shutil.copy2(ROOT / name, tmp / name)
        (tmp / "test.qml").write_text(TEST)
        result = subprocess.run(["quickshell", "-p", str(tmp / "test.qml")],
                                env={**os.environ, "QT_QPA_PLATFORM": "offscreen", "QT_QUICK_BACKEND": "software", "QT_FORCE_STDERR_LOGGING": "1", "QT_LOGGING_RULES": "qml=true;qml.*=true"},
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        print(result.stdout, end="")
        assert result.returncode == 0, f"edge spring assertions failed (exit {result.returncode})"
        assert "PASS real Qt:" in result.stdout, "Qt did not complete the assertions"
        assert not any(error in result.stdout for error in ("ReferenceError:", "TypeError:", "Unable to assign", "Binding loop", "is not a type")), result.stdout


if __name__ == "__main__":
    run()
