#!/usr/bin/env python3
"""Native Qt/RHI render + lifecycle acceptance, without touching the desktop.

Runs production MaterialCard / GlassSurface and the real Omarchy Border
factory. Only palette/spacing and the authored backdrop are test fixtures.
Requires Xvfb, Quickshell and Qt's OpenGL RHI. No screen or inbox is captured.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run(out):
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='glass-qt-') as scratch:
        tmp = Path(scratch)
        commons = tmp / 'Commons'
        commons.mkdir()
        source = Path(os.environ.get('OMARCHY_PATH', str(Path.home() / 'omarchy'))) / 'shell/Commons'
        for name in ['Border.qml', 'BorderGeometry.js', 'Util.qml']:
            shutil.copy2(source / name, commons / name)
        (commons / 'qmldir').write_text('module qs.Commons\nsingleton Border 1.0 Border.qml\nsingleton Util 1.0 Util.qml\nsingleton Color 1.0 Color.qml\nsingleton Style 1.0 Style.qml\n')
        (commons / 'Color.qml').write_text('''pragma Singleton
import QtQuick
QtObject {
 property var shellValues: ({})
 property color foreground: "#171c24"
 property color accent: foreground
 property color urgent: "#b32525"
 property color background: "#e9edf0"
 property QtObject popups: QtObject { property color background: "#e9edf0"; property color text: "#171c24" }
 property QtObject bar: QtObject { property color background: "#e9edf0" }
}
''')
        (commons / 'Style.qml').write_text('''pragma Singleton
import QtQuick
QtObject { property bool reduceMotion: false; property int cornerRadius: 0; function space(n) { return n } function duration(n) { return n } }
''')
        for name in ['MaterialCard.qml', 'InkSheet.qml', 'MetalShape.qml', 'GlassMath.js', 'GlassBackdrop.qml', 'GlassSurface.qml']:
            shutil.copy2(ROOT / name, tmp / name)
        shutil.copytree(ROOT / 'shaders', tmp / 'shaders')
        svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="900"><defs><linearGradient id="g"><stop stop-color="#648bbe"/><stop offset=".5" stop-color="#b7c9d5"/><stop offset="1" stop-color="#142431"/></linearGradient><pattern id="lines" width="150" height="36" patternUnits="userSpaceOnUse"><text x="5" y="24" font-size="18" fill="#151b24">Behind the glass</text></pattern></defs><rect width="1100" height="900" fill="url(#g)"/><rect x="60" y="120" width="630" height="720" fill="url(#lines)"/><circle cx="450" cy="370" r="210" fill="#6b91bb" opacity=".35"/></svg>'''
        (tmp / 'backdrop.svg').write_text(svg)
        materials = {t: json.loads((ROOT / f'themes/{t}/bar-material.json').read_text()) for t in ['frost', 'smoke']}
        # Native KeyboardPanel/PopupCard shadow QsWindow.contentItem with a
        # list. A plain FloatingWindow alone hid coordinate-target bugs.
        (tmp / 'PopupHost.qml').write_text('''import QtQuick
import Quickshell
FloatingWindow {
 default property alias contentItem: holder.data
 Item { id: holder; anchors.fill: parent }
}
''')
        qml = r'''import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
import "GlassMath.js" as GlassMath
PopupHost {
 id: root
 visible: true; implicitWidth: 1100; implicitHeight: 900
 property var materials: MATERIALS
 property string theme: "frost"
 property int count: 0
 property var snapshots: []
 property real offsetX: 0
 property real offsetY: 0
 QtObject { id: panel; property bool open: false; property string barPos: "top"; property real gap: 0; property bool centerOnBar: false; property point anchorScreenPos: Qt.point(40, 0); property real anchorW: 20; property bool popoutSwitchClosing: false }
 Item { id: canvas; x: root.offsetX; y: root.offsetY; width: root.width; height: root.height
 Image { z: -10; anchors.fill: parent; source: "backdrop.svg" }
 Rectangle { z: -5; x: 60; y: 45; width: 630; height: 38; color: root.theme === "frost" ? "#e9edf0" : "#111419" }
 Rectangle {
  id: card; x: 60; y: 83; width: 500; height: 700; radius: 0
  color: Color.popups.background
  property var borderSpec: Border.flat(Color.popups.text, 2)
  opacity: panel.open ? 1 : 0
  Behavior on opacity { NumberAnimation { duration: 140; easing.type: Easing.OutCubic } }
  Item {
   anchors.fill: parent
   MaterialCard { id: materialCard; panel: panel; material: root.materials.frost; edge: false }
   Text { x: 26; y: 24; text: "AUDIO / " + root.theme.toUpperCase(); textFormat: Text.PlainText; font.pixelSize: 18; font.family: "monospace"; font.bold: true; color: Color.popups.text }
   Repeater { model: 4; delegate: Item {
    required property int index
    x: 26; y: 94 + index * 116; width: 448; height: 80
    Text { text: ["Output volume", "Input volume", "Speakers", "Microphone"][index]; textFormat: Text.PlainText; font.pixelSize: 17; color: Color.popups.text }
    Rectangle { y: 40; width: parent.width; height: 5; color: Qt.rgba(.45,.5,.6,.35); Rectangle { width: parent.width * .64; height: 5; color: Color.popups.text } }
    Text { y: 56; text: "Native Qt • existing square frame"; textFormat: Text.PlainText; font.pixelSize: 13; color: Color.popups.text }
   } }
  }
 }
 }
 Timer { id: later; property var action; onTriggered: action() }
 function schedule(ms, fn) { later.interval=ms; later.action=fn; later.restart() }
 function check(ok, label) { if (!ok) { console.error("FAIL " + label); Qt.exit(1); throw new Error(label) } count++; console.log("PASS " + label) }
 function shot(name, fn) { canvas.grabToImage(function(result) { check(result.saveToFile(OUT + "/" + name + ".png"), "saved " + name); snapshots.push(name); fn() }) }
 function endpoint() {
  check(!materialCard.springRunning && materialCard.roll === 1 && materialCard.rollVelocity === 0, theme + " settled spring clock off")
  check(card.radius === 0 && materialCard.glassBody.radius === card.radius, theme + " existing zero radius preserved")
  check(card.width === 500 && card.height === 700, theme + " unchanged frame dimensions")
  check(materialCard.glassBody.visible && materialCard.glassBody.active, theme + " material active")
  check(!materialCard.glassBody.glintRunning && materialCard.glassBody.strength === 0, theme + " settled light clock off")
 }
 function begin() {
  console.log("GLASS_DIAG " + JSON.stringify({card:!!materialCard.card,surface:!!materialCard.surface,parent:String(materialCard.parent),ancestor:String(materialCard.parent.parent),glass:!!materialCard.glassBody}))
  check(!!materialCard.glassBody, "native material created")
  materialCard.glassBody.testBackground=Qt.resolvedUrl("backdrop.svg")
  shot(theme + "-rest", function() {
   panel.open=true
   schedule(100, function() {
    check(materialCard.roll > .1 && materialCard.roll < .95, theme + " intermediate entry " + JSON.stringify({roll:materialCard.roll,spring:materialCard.springOn,running:materialCard.springRunning,reduced:materialCard.reduced}))
    var x=materialCard.roll, v=materialCard.rollVelocity
    panel.open=false
    check(Math.abs(materialCard.roll-x)<.00001 && Math.abs(materialCard.rollVelocity-v)<.00001, theme + " reverse continuous")
    shot(theme + "-reverse", function() { schedule(80, function() {
     check(materialCard.roll > .02 && materialCard.roll < .9, theme + " intermediate return")
     var x=materialCard.roll, v=materialCard.rollVelocity
     panel.open=true
     check(Math.abs(materialCard.roll-x)<.00001 && Math.abs(materialCard.rollVelocity-v)<.00001, theme + " reopen continuous")
     schedule(900, function() {
      endpoint()
      shot(theme + "-open", function() {
       panel.open=false
       // Mimic native Audio dropping content immediately at logical close.
       card.height=500
       check(materialCard.frameH===700 && materialCard.rollingIn, theme + " frozen full closing geometry")
       schedule(750, function() {
        check(materialCard.roll===0 && card.opacity===0 && !materialCard.glassBody.active, theme + " closed without orphan text or capture")
        card.height=700
        shot(theme + "-returned", function() { if (theme === "frost") nextTheme(); else switches() })
       })
      })
     })
    }) })
   })
  })
 }
 function nextTheme() {
  theme="smoke"; Color.popups.background="#111419"; Color.popups.text="#f0f3f7"; Color.bar.background="#111419"
  materialCard.material=materials.smoke
  schedule(200,begin)
 }
 function switches() {
  panel.open=true
  schedule(100,function() {
   materialCard.material=GlassMath.material(materials.smoke,"off","on")
   schedule(450,function() {
    check(!materialCard.glassOn && !materialCard.glassBody.active && !materialCard.glassBody.glintRunning, "disable mid-entry releases glass")
    check(String(card.color)!=="#00000000" && card.color.a===1, "solid fill binding restored")
    materialCard.material=GlassMath.material(materials.smoke,"on","off")
    schedule(350,function() {
     check(materialCard.glassOn && !materialCard.springOn && !materialCard.springRunning, "independent material-on / spring-off")
     materialCard.material=materials.smoke
     Style.reduceMotion=true
     panel.open=false
     schedule(250,function() {
      check(materialCard.roll===0 && !materialCard.springRunning && !materialCard.glassBody.active, "reduced-motion close fixed endpoint")
      panel.open=true
      schedule(350,function() {
       check(materialCard.roll===1 && !materialCard.springRunning && materialCard.glassBody.strength===0, "reduced-motion open no sweep/spring")
       shot("smoke-reduced",function() {
        panel.open=false
        schedule(250,function() {
         materialCard.material=null
         check(card.color.a===1 && !materialCard.glassOn, "theme-off restores original card binding")
         console.log("GLASS_RESULT " + JSON.stringify({checks:count,snapshots:snapshots,renderer:"Qt OpenGL RHI / Xvfb",captures:"authored backdrop only"}))
         Qt.exit(0)
        })
       })
      })
     })
    })
   })
  })
 }
 function checkOrigin(x, y, label) {
  var body = materialCard.glassBody
  check(!!body && Math.abs(body.screenX-x)<.001 && Math.abs(body.screenY-y)<.001,
        label + " " + (body ? JSON.stringify({x:body.screenX,y:body.screenY}) : "missing surface"))
 }
 Component.onCompleted: schedule(300,function() {
  checkOrigin(60,83,"popup-list host maps to actual scene root")
  offsetX=11; offsetY=17
  schedule(50,function() {
   checkOrigin(71,100,"origin follows ancestor position")
   offsetX=0; offsetY=0
   schedule(50,function() { checkOrigin(60,83,"origin restored"); begin() })
  })
 })
}
'''
        qml = qml.replace('MATERIALS', json.dumps(materials)).replace('OUT', json.dumps(str(out))).replace('Color.', 'Commons.Color.')
        (tmp / 'shell.qml').write_text(qml)
        env = {**os.environ, 'QT_QPA_PLATFORM': 'xcb', 'QSG_RHI_BACKEND': 'opengl', 'LIBGL_ALWAYS_SOFTWARE': '1', 'QT_LOGGING_RULES': 'quickshell.dbus*:false'}
        with (out / 'runtime.log').open('w') as log:
            process = subprocess.Popen(['xvfb-run', '-a', '-s', '-screen 0 1200x1000x24', 'quickshell', '-n', '-p', str(tmp)], env=env, stdout=log, stderr=subprocess.STDOUT, text=True, start_new_session=True)
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        text = (out / 'runtime.log').read_text()
        print(text)
        assert process.returncode == 0 and 'GLASS_RESULT ' in text, f'native acceptance failed ({process.returncode})'
        assert 'QQmlListReference' not in text and 'Passing incompatible arguments' not in text, 'invalid popup coordinate target'
        summary = next(line.split('GLASS_RESULT ',1)[1] for line in text.splitlines() if 'GLASS_RESULT ' in line)
        (out / 'runtime.json').write_text(json.dumps(json.loads(summary), indent=2) + '\n')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    run(parser.parse_args().output.resolve())
