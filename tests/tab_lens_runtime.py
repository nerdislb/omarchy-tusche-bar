#!/usr/bin/env python3
"""Real Qt run of TabLens, the AI quota popup's sliding agent lens.

A switch glides the lens to the next tab on two springs: the edge in front
leads, so the lens draws out on the way, gives up a touch of height for it and
lands on the tab's exact geometry without a bounce, then stops its clock. A
retarget mid-flight continues from where the lens is, without a jump. The same
tab moving or rebuilt (a fresh delegate at x 0) takes the lens along at once. A closed
popup, Reduced Motion and the first placement put it straight in place; calm
motion glides without drawing out. Translucent popups make it glass (rim, no
underline); opaque ones the ink fill with the underline. Only the palette and
spacing environment is stubbed (as flat_motion_runtime.py).
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
import qs.Commons as Commons
FloatingWindow {
 id: root
 visible: true; implicitWidth: 400; implicitHeight: 100
 property int sel: 0
 property bool live: true
 property bool rebuilt: false
 Item {
  width: 400; height: 30
  TabLens { id: lens; target: root.rebuilt ? fresh : [t0, t1, t2][root.sel]; live: root.live }
  Row {
   Item { id: t0; property string key: "a"; width: 80; height: 30 }
   Item { id: t1; property string key: "b"; width: 100; height: 30 }
   Item { id: t2; property string key: "c"; width: 110; height: 30 }
  }
  // the second tab as a Repeater rebuilds it: a fresh delegate, at x 0 until laid out
  Item { id: fresh; property string key: "b"; width: 100; height: 30 }
 }
 function fail(m) { console.log("FAIL " + m); Qt.exit(1) }
 function at(x, w) { return Math.abs(lens.x - x) < 0.01 && Math.abs(lens.width - w) < 0.01 && Math.abs(lens.height - 30) < 0.01 }
 property int step: 0
 property int ticks: 0
 property real maxStretch: 0
 property real minHeight: 30
 property real maxRight: 0
 property bool rightLed: false
 property real glideStretch: 0
 FrameAnimation {
  running: true
  onTriggered: {
   root.ticks++
   if (lens.moving) {
    root.maxStretch = Math.max(root.maxStretch, lens.stretch)
    root.minHeight = Math.min(root.minHeight, lens.height)
    root.maxRight = Math.max(root.maxRight, lens.x + lens.width)
    // heading right: the right edge is further along than the left one
    if ((lens.x + lens.width - 80) / 210 > (lens.x / 180) + 0.1) root.rightLed = true
   }
   if (root.step === 0) {
    if (!at(0, 80) || lens.moving) return fail("first placement: not on the first tab at rest")
    if (!lens.glass || lens.underline.visible) return fail("translucent popups: the lens is not glass")
    root.ticks = 0; root.step = 1; root.sel = 2
   } else if (root.step === 1) {
    if (root.ticks === 1 && !lens.moving) return fail("a switch did not glide: " + lens.placedKey + " -> " + lens.keyOf(lens.target) + " placed=" + lens.placed + " x=" + lens.x)
    if (lens.moving) { if (root.ticks > 90) fail("the glide did not settle within 1.5 s"); return }
    if (!at(180, 110)) return fail("did not land on the third tab: " + lens.x + " " + lens.width)
    if (!root.rightLed) return fail("the leading edge did not lead")
    if (root.maxStretch < 10 || root.maxStretch > 60) return fail("stretch out of range: " + root.maxStretch)
    if (root.minHeight >= 30 || root.minHeight < 30 - 2 * 2 - 0.01) return fail("squeeze out of range: " + root.minHeight)
    if (root.maxRight > 290 + 1) return fail("bounced past the tab: " + root.maxRight)
    if (lens.energy !== 0 || lens.squeeze !== 0) return fail("not at rest after landing")
    root.glideStretch = root.maxStretch
    root.ticks = 0; root.step = 2; root.sel = 0
   } else if (root.step === 2) {
    if (root.ticks === 6) {   // retarget mid-flight: same place, same velocity
     var x0 = lens.x, w0 = lens.width, v0 = lens.leftVelocity
     if (!lens.moving || v0 >= 0) return fail("not heading left mid-flight")
     root.sel = 1
     if (lens.x !== x0 || lens.width !== w0 || lens.leftVelocity !== v0 || !lens.moving) return fail("retarget jumped or lost its velocity")
    }
    if (root.ticks <= 6 || lens.moving) { if (root.ticks > 90) fail("retarget did not settle"); return }
    if (!at(80, 100)) return fail("retarget did not land on the second tab")
    root.rebuilt = true
    if (!at(0, 100) || lens.moving) return fail("rebuilt tab: the lens glided instead of going along")
    fresh.x = 80
    if (!at(80, 100) || lens.moving) return fail("rebuilt tab laid out: the lens glided")
    fresh.x = 90
    if (!at(90, 100) || lens.moving) return fail("same tab moved: the lens glided")
    root.rebuilt = false
    if (!at(80, 100) || lens.moving) return fail("back on the tab: the lens glided")
    root.step = 3; root.live = false; root.sel = 2
    if (!at(180, 110) || lens.moving) return fail("closed popup: the lens did not wait on its tab")
    root.live = true
    Style.reduceMotion = true; root.sel = 0
    if (!at(0, 80) || lens.moving) return fail("Reduced Motion: the lens glided")
    Style.reduceMotion = false
    lens.motion = "calm"; root.maxStretch = 0; root.ticks = 0; root.step = 4; root.sel = 2
   } else if (root.step === 4) {
    if (lens.moving) { if (root.ticks > 90) fail("calm glide did not settle"); return }
    if (!at(180, 110)) return fail("calm: did not land")
    if (root.maxStretch > 2) return fail("calm drew out: " + root.maxStretch)
    Commons.Color.popups.background = "#0f121a"
    if (lens.glass || !lens.underline.visible) return fail("opaque popups: no ink underline")
    console.log("PASS real Qt: lens glides with the leading edge first (stretch " + root.glideStretch.toFixed(1)
      + " px, calm " + root.maxStretch.toFixed(1) + " px), lands without a bounce, retargets without a jump, follows a moved or rebuilt tab at once, waits while closed, Reduced Motion, glass vs ink")
    Qt.exit(0)
   }
  }
 }
}
'''


def run():
    with tempfile.TemporaryDirectory(prefix="tab-lens-", dir=os.environ.get("TMPDIR")) as tmp:
        tmp = Path(tmp)
        commons = tmp / "Commons"
        commons.mkdir(parents=True)
        for name in ["Util.qml"]:
            shutil.copy2(COMMONS / name, commons / name)
        (commons / "qmldir").write_text("module qs.Commons\nsingleton Util 1.0 Util.qml\nsingleton Color 1.0 Color.qml\nsingleton Style 1.0 Style.qml\n")
        (commons / "Color.qml").write_text('''pragma Singleton
import QtQuick
QtObject {
 property color foreground: "#eeeeee"
 property QtObject popups: QtObject { property color background: "#a314101c"; property color text: "#efeaf6" }
 property QtObject bar: QtObject { property color background: "#0c0a12" }
}
''')
        (commons / "Style.qml").write_text('''pragma Singleton
import QtQuick
QtObject { property bool reduceMotion: false; property int cornerRadius: 6; function space(n) { return n } function duration(n) { return reduceMotion ? 0 : n } }
''')
        for name in ["TabLens.qml", "GlassMath.js", "Presets.js"]:
            shutil.copy2(ROOT / name, tmp / name)
        shutil.copytree(ROOT / "bridge", tmp / "bridge")
        (tmp / "test.qml").write_text(TEST)
        result = subprocess.run(["quickshell", "-p", str(tmp / "test.qml")],
                                env={**os.environ, "QT_QPA_PLATFORM": "offscreen", "QT_QUICK_BACKEND": "software", "QT_FORCE_STDERR_LOGGING": "1", "QT_LOGGING_RULES": "qml=true;qml.*=true"},
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=30)
        print(result.stdout, end="")
        assert result.returncode == 0, f"tab lens assertions failed (exit {result.returncode})"
        assert "PASS real Qt:" in result.stdout, "Qt did not complete the assertions"
        assert not any(error in result.stdout for error in ("ReferenceError:", "TypeError:", "Unable to assign", "Binding loop", "is not a type")), result.stdout


if __name__ == "__main__":
    run()
