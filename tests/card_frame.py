#!/usr/bin/env python3
"""Exercise real Qt bindings across steady state, reopen and material changes.

Only the palette/spacing environment is stubbed. MaterialCard, its render
components and Omarchy's Border factory/geometry execute unchanged in Qt.
No compositor, installed plugin, inbox or active theme is modified.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
COMMONS = Path(os.environ.get("OMARCHY_PATH", str(Path.home() / "omarchy"))) / "shell/Commons"


def run():
    with tempfile.TemporaryDirectory(prefix="card-frame-", dir=os.environ.get("TMPDIR")) as tmp:
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
 property color foreground: "#111111"
 property color accent: "#111111"
 property color urgent: "red"
 property color background: "#dfdacb"
 property QtObject popups: QtObject { property color background: "#dfdacb"; property color text: "#111111" }
 property QtObject bar: QtObject { property color background: "#dfdacb" }
}
''')
        (commons / "Style.qml").write_text('''pragma Singleton
import QtQuick
QtObject { property bool reduceMotion: false; function space(n) { return n } function duration(n) { return n } }
''')
        for name in ["MaterialCard.qml", "InkSheet.qml", "MetalShape.qml", "GlassMath.js", "GlassSurface.qml", "GlassBackdrop.qml"]:
            shutil.copy2(ROOT / name, tmp / name)
        shutil.copytree(ROOT / "shaders", tmp / "shaders")
        # Before implementation this exercises the existing unframed card,
        # yielding an assertion failure rather than a missing-component error.
        card_type = "MaterialCard"
        if (ROOT / "BarMaterialCard.qml").exists():
            shutil.copy2(ROOT / "BarMaterialCard.qml", tmp / "BarMaterialCard.qml")
            card_type = "BarMaterialCard"
        materials = {t: json.loads((ROOT / f"themes/{t}/bar-material.json").read_text())
                     for t in ["papier", "tusche", "papier-lavur", "tusche-lavur", "chrom", "platin", "frost", "smoke"]}
        (tmp / "test.qml").write_text('''import QtQuick
import Quickshell
import qs.Commons
FloatingWindow {
 id: root
 visible: true; implicitWidth: 400; implicitHeight: 500
 property var materials: MATERIALS
 property int step: 0
 property string expected: "#111111"
 QtObject { id: panel; property bool open: true; property string barPos: "top"; property real gap: 0; property bool centerOnBar: false; property point anchorScreenPos: Qt.point(20, 0); property real anchorW: 20; property bool popoutSwitchClosing: false; property var borderSpec: Border.flat("transparent", 2) }
 Item {
  width: 400; height: 500
  Rectangle {
   id: card; y: 30; width: 300; height: 400
   property var borderSpec: panel.borderSpec
   Item { CARD_TYPE { id: materialCard; panel: panel; material: root.materials.papier; edge: false } }
  }
 }
 function checkFrame() {
  var frame = materialCard.cardFrame
  var s = frame ? Border.flat(frame.border.color, frame.border.width) : card.borderSpec
  if (frame && (!frame.visible || frame.parent !== card || frame.width !== card.width || frame.height !== card.height)) { console.error("FAIL frame geometry"); Qt.exit(1); return false }
  if (!Border.sameColor(s.color, expected) || [s.widths.top, s.widths.right, s.widths.bottom, s.widths.left].some(function(w) { return w !== 2 })) {
   console.error("FAIL persistent frame step " + step + ": " + JSON.stringify(s) + " expected " + expected + " on all four sides")
   Qt.exit(1); return false
  }
  return true
 }
 Timer {
  interval: 450; running: true; repeat: true
  onTriggered: {

   if (step < 6 && !root.checkFrame()) return
   if (step === 0) panel.open = false
   if (step === 1) panel.open = true
   if (step === 2) { expected = "#ffffff"; materialCard.material = root.materials.tusche }
   if (step === 3) panel.open = false
   if (step === 4) panel.open = true
   if (step === 5) materialCard.material = null
   if (step === 6) {
    if (materialCard.cardFrame && materialCard.cardFrame.visible) { console.error("FAIL frame without material"); Qt.exit(1); return }
    if (String(card.borderSpec.color) !== "transparent") { console.error("FAIL original binding not restored: " + JSON.stringify(card.borderSpec) + " panel: " + JSON.stringify(panel.borderSpec)); Qt.exit(1); return }
    materialCard.material = root.materials.chrom
   }
   if (step === 7) {
    if (materialCard.cardFrame && materialCard.cardFrame.visible) { console.error("FAIL flat frame over metal"); Qt.exit(1); return }
    if (!materialCard.metalOn || String(card.borderSpec.color) !== "transparent") { console.error("FAIL metal rim changed"); Qt.exit(1); return }
    materialCard.material = root.materials["papier-lavur"]
   }
   if (step === 8) {
    if (materialCard.cardFrame && materialCard.cardFrame.visible) { console.error("FAIL flat frame over Lavur"); Qt.exit(1); return }
    if (!materialCard.bloom || String(card.borderSpec.color) !== "transparent") { console.error("FAIL Lavur rim changed"); Qt.exit(1); return }
    materialCard.material = root.materials.papier
   }
   if (step === 9) {
    expected = "#111111"; if (!root.checkFrame()) return
    // Even an inherited dry-frame key cannot paint over the glass material.
    var frost = JSON.parse(JSON.stringify(root.materials.frost))
    frost.card.frame = { color: "#ff0000", width: 2 }
    materialCard.material = frost
   }
   if (step === 10) {
    if (!materialCard.glassOn || materialCard.cardFrame.visible) { console.error("FAIL flat frame over Frost"); Qt.exit(1); return }
    materialCard.material = root.materials.smoke
   }
   if (step === 11) {
    if (!materialCard.glassOn || materialCard.cardFrame.visible) { console.error("FAIL flat frame over Smoke"); Qt.exit(1); return }
    materialCard.material = root.materials.papier
   }
   if (step === 12) {
    if (!root.checkFrame()) return
    Style.reduceMotion = true
    panel.open = false
   }
   if (step === 13) {
    if (materialCard.roll !== 0) { console.error("FAIL reduced close"); Qt.exit(1); return }
    panel.open = true
   }
   if (step === 14) {
    if (!root.checkFrame() || materialCard.roll !== 1) { console.error("FAIL reduced reopen"); Qt.exit(1); return }
    console.log("PASS real Qt: Papier/Tusche persistent four-sided 2 px frame, reopen, null restoration, metal, Lavur, Frost/Smoke, Reduced Motion")
    Qt.exit(0)
   }
   step++
  }
 }
}
'''.replace("MATERIALS", json.dumps(materials)).replace("CARD_TYPE", card_type))
        result = subprocess.run(["quickshell", "-p", str(tmp / "test.qml")],
                                env={**os.environ, "QT_QPA_PLATFORM": "offscreen", "QT_QUICK_BACKEND": "software", "QT_FORCE_STDERR_LOGGING": "1", "QT_LOGGING_RULES": "qml=true;qml.*=true"},
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=15)
        print(result.stdout, end="")
        assert result.returncode == 0, f"Qt frame assertions failed (exit {result.returncode})"
        assert "PASS real Qt:" in result.stdout, "Qt did not complete the assertions"
        assert not any(error in result.stdout for error in ("ReferenceError:", "TypeError:", "Unable to assign", "Binding loop", "is not a type")), result.stdout


if __name__ == "__main__":
    run()
