#!/usr/bin/env python3
"""Native Qt/RHI render acceptance of the glass frame glint, without touching the desktop.

Runs the production GlassFrameGlint and its shader on Frost's and Smoke's own `glass.frame` values over a
fixed fake window with a fake border (a still grey line): no Hyprland, no screen capture, no inbox. Checks
that at rest and after the glint nothing is drawn (pixel-identical to the scene without the item), that
mid-glint light appears along the frame and only a short way outside it (the window's inside stays
untouched), and that the light is cool or neutral (no warm fringes or sparks, as the metal glint has).
Requires Xvfb, Quickshell, Qt's OpenGL RHI and Pillow.

    python3 tests/glass_frame_runtime.py --output /tmp/glass-frame-evidence
"""
import argparse
import json
import os
import shutil
import signal
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[1]
W, H = 520, 360
WIN = (60, 50, 400, 260)   # the window's inside: x, y, w, h; the 2 px border lies just outside it
BORDER = 2
THEMES = {'smoke': ('#1b222c', '#111419'), 'frost': ('#d8dfe7', '#e9edf0')}

QML = r'''import QtQuick
import Quickshell
import qs.Commons
FloatingWindow {
 id: root
 visible: true; implicitWidth: __W__; implicitHeight: __H__
 property var themes: __THEMES__
 property var materials: __MATERIALS__
 property string theme: "smoke"
 property int count: 0
 property real sweepV: 0.5
 property real amountV: 0
 property bool itemOn: true
 function amountAt(p) { return materials[theme].glass.frame.amount * (1 - p * p) }
 function sweepAt(p) { var e = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p); return -0.15 + 1.3 * e }
 Item {
  id: canvas; anchors.fill: parent
  Rectangle { anchors.fill: parent; color: root.themes[root.theme][0] }
  Rectangle { x: __WX__ - __B__; y: __WY__ - __B__; width: __WW__ + 2 * __B__; height: __WH__ + 2 * __B__; color: "#6a6c72" }
  Rectangle { x: __WX__; y: __WY__; width: __WW__; height: __WH__; color: root.themes[root.theme][1] }
  GlassFrameGlint {
   visible: root.itemOn
   spec: root.materials[root.theme].glass
   pad: 4; radius: 0; tube: __B__
   x: __WX__ - __B__ - pad; y: __WY__ - __B__ - pad
   width: __WW__ + 2 * __B__ + 2 * pad; height: __WH__ + 2 * __B__ + 2 * pad
   sweep: root.sweepV
   amount: root.amountV
  }
 }
 Timer { id: later; property var action; onTriggered: action() }
 function schedule(ms, fn) { later.interval = ms; later.action = fn; later.restart() }
 function shot(name, fn) { canvas.grabToImage(function(r) {
  if (!r.saveToFile(OUT + "/" + theme + "-" + name + ".png")) { console.error("FAIL save " + name); Qt.exit(1); return }
  count++; fn() }) }
 function state(sw, am, on, name, fn) { sweepV = sw; amountV = am; itemOn = on; schedule(160, function() { shot(name, fn) }) }
 function run(i) {
  var names = Object.keys(themes)
  if (i >= names.length) { console.log("FRAME_RESULT " + count); Qt.exit(0); return }
  theme = names[i]
  state(0.5, 0, true, "rest", function() {
   state(0.5, 0, false, "base", function() {
    state(sweepAt(0.35), amountAt(0.35), true, "mid", function() {
     state(sweepAt(0.7), amountAt(0.7), true, "late", function() {
      state(1.15, 0, true, "end", function() { run(i + 1) }) }) }) }) })
 }
 Component.onCompleted: schedule(400, function() { run(0) })
}
'''


def analyse(out, theme, frame):
    img = {k: Image.open(out / f'{theme}-{k}.png').convert('RGB') for k in ('rest', 'base', 'mid', 'late', 'end')}
    assert ImageChops.difference(img['rest'], img['base']).getbbox() is None, f'{theme}: at rest nothing is drawn'
    assert ImageChops.difference(img['end'], img['base']).getbbox() is None, f'{theme}: nothing is left after the glint'
    base = img['base'].load()
    x0, y0, w, h = WIN
    ox0, oy0, ox1, oy1 = x0 - BORDER, y0 - BORDER, x0 + w + BORDER, y0 + h + BORDER   # the frame's outer rectangle
    report = {}
    for name in ('mid', 'late'):
        px = img[name].load()
        changed, inside, outside, warm, light = 0, 0, 0, 0, 0
        for y in range(H):
            for x in range(W):
                a, b = px[x, y], base[x, y]
                d = [a[i] - b[i] for i in range(3)]
                if max(abs(v) for v in d) <= 2:
                    continue
                changed += 1
                if x0 + 6 < x < x0 + w - 6 and y0 + 6 < y < y0 + h - 6:
                    inside += 1                       # deeper than the soft light reaches (about 4 px): untouched
                if not (ox0 - 5 <= x <= ox1 + 5 and oy0 - 5 <= y <= oy1 + 5):
                    outside += 1                      # beyond the item's reach
                if a[0] - a[2] > 25 and d[0] - d[2] > 14:
                    warm += 1                         # a warm result (red well above blue): the metal glint's orange sparks
                if sum(d) > 0:
                    light += 1
        report[name] = {'changed': changed, 'inside': inside, 'outside': outside, 'warm': warm, 'lighter': light}
    mid = report['mid']
    assert mid['changed'] >= 40, f'{theme}: the glint is visible ({mid})'
    assert mid['inside'] == 0, f'{theme}: the window\'s inside beyond the soft light is untouched ({mid})'
    assert mid['outside'] == 0, f'{theme}: nothing beyond the item ({mid})'
    assert mid['warm'] == 0, f'{theme}: no warm fringes or sparks ({mid})'
    assert mid['lighter'] > 0, f'{theme}: it is light'
    assert report['late']['changed'] < mid['changed'], f'{theme}: it fades'
    report['frame'] = frame
    return report


def run(out):
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='glass-frame-') as scratch:
        tmp = Path(scratch)
        commons = tmp / 'Commons'
        commons.mkdir()
        (commons / 'qmldir').write_text('module qs.Commons\nsingleton Style 1.0 Style.qml\n')
        (commons / 'Style.qml').write_text('pragma Singleton\nimport QtQuick\nQtObject { property bool reduceMotion: false }\n')
        shutil.copy2(ROOT / 'GlassFrameGlint.qml', tmp / 'GlassFrameGlint.qml')
        shutil.copytree(ROOT / 'shaders', tmp / 'shaders')
        materials = {t: json.loads((ROOT / f'themes/{t}/bar-material.json').read_text()) for t in THEMES}
        x, y, w, h = WIN
        qml = (QML.replace('__THEMES__', json.dumps(THEMES)).replace('__MATERIALS__', json.dumps(materials)).replace('OUT', json.dumps(str(out)))
               .replace('__W__', str(W)).replace('__H__', str(H)).replace('__WX__', str(x)).replace('__WY__', str(y))
               .replace('__WW__', str(w)).replace('__WH__', str(h)).replace('__B__', str(BORDER)))
        (tmp / 'shell.qml').write_text(qml)
        env = {**os.environ, 'QT_QPA_PLATFORM': 'xcb', 'QSG_RHI_BACKEND': 'opengl', 'LIBGL_ALWAYS_SOFTWARE': '1', 'QT_LOGGING_RULES': 'quickshell.dbus*:false'}
        with (out / 'runtime.log').open('w') as log:
            process = subprocess.Popen(['xvfb-run', '-a', '-s', f'-screen 0 {W + 80}x{H + 80}x24', 'quickshell', '-n', '-p', str(tmp)],
                                       env=env, stdout=log, stderr=subprocess.STDOUT, text=True, start_new_session=True)
            try:
                process.wait(timeout=60)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGTERM)
                process.wait(timeout=5)
        text = (out / 'runtime.log').read_text()
        assert process.returncode == 0 and 'FRAME_RESULT ' in text, f'native render failed ({process.returncode}):\n' + '\n'.join(text.splitlines()[-15:])
        result = {t: analyse(out, t, materials[t]['glass']['frame']) for t in THEMES}
        (out / 'frame-runtime.json').write_text(json.dumps(result, indent=2) + '\n')
        for t, r in result.items():
            print(f"PASS {t}: rest and end pixel-identical to the scene without the glint; mid {r['mid']['changed']} px changed along the frame, none deeper than 6 px inside the window, none warm")
        print(len(result) * 6, 'frame glint checks passed')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--output', type=Path, required=True)
    run(parser.parse_args().output.resolve())
