#!/usr/bin/env python3
"""Render the real FocusSealFace.qml offscreen and read its pixels, off the desktop.

Only Commons.Style is a fixture (the seal logo reads reduceMotion). The face,
the seal logo and FocusSeal.js are the production files. Four seals are
rendered at the window's size and their pixels inspected: calm, a low-ish
battery, an urgently low battery with its square, and an urgent workspace alone.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SIZE = 34
GROUND, INK, ACCENT, URGENT, FRAME = (255, 255, 255), (0, 0, 0), (32, 96, 192), (192, 32, 32), (128, 128, 128)

QML = r'''import QtQuick
import QtTest

Item {
 id: root
 width: 200; height: 60
 property var cases: [
  {name: "calm",   facts: {battery: {present: true, level: 0.9, charging: false}, urgent: 0}},
  {name: "lowish", facts: {battery: {present: true, level: 0.25, charging: false}, urgent: 0}},
  {name: "urgent_battery", facts: {battery: {present: true, level: 0.10, charging: false}, urgent: 0}},
  {name: "workspace", facts: {battery: {present: true, level: 0.9, charging: false}, urgent: 2}},
  {name: "charging_low", facts: {battery: {present: true, level: 0.05, charging: true}, urgent: 0}}
 ]
 Component {
  id: make
  FocusSealFace {
   width: __SIZE__; height: __SIZE__
   ground: "#ffffff"; ink: "#000000"; accent: "#2060c0"; urgent: "#c02020"; frame: "#808080"
   frameWidth: 1
  }
 }
 TestCase {
  name: "FocusSealFace"
  when: windowShown
  function test_01_render_every_state() {
   var saved = 0
   for (var i = 0; i < root.cases.length; i++) {
    var c = root.cases[i]
    var face = createTemporaryObject(make, root, {facts: c.facts, x: 10, y: 10})
    verify(face)
    wait(420)                       // the seal logo's arrival is over
    var done = false
    verify(face.grabToImage(function(r) { if (r.saveToFile("__OUT__/" + c.name + ".png")) saved++; done = true }))
    tryVerify(function() { return done })
    face.destroy()
   }
   compare(saved, root.cases.length)
  }
  function test_02_the_face_reports_what_it_draws() {
   var f = createTemporaryObject(make, root, {facts: {battery: {present: true, level: 0.10, charging: false}, urgent: 1}})
   compare(f.model.line, true)
   compare(f.model.low, true)
   compare(f.model.mark, true)
   f.facts = {battery: {present: true, level: 0.9, charging: false}, urgent: 0}
   compare(f.model.line, false)
   compare(f.model.mark, false)
  }
 }
}
'''


def run(keep=None):
    with tempfile.TemporaryDirectory(prefix='tusche-seal-') as folder:
        tmp = Path(folder)
        out = tmp / 'out'
        out.mkdir()
        for name in ['FocusSealFace.qml', 'FocusSeal.js']:
            shutil.copy2(ROOT / name, tmp / name)
        (tmp / 'modules').mkdir()
        shutil.copy2(ROOT / 'modules/SealLogo.qml', tmp / 'modules/SealLogo.qml')
        imports = tmp / 'imports/qs/Commons'
        imports.mkdir(parents=True)
        (imports / 'qmldir').write_text('module qs.Commons\nsingleton Style 1.0 Style.qml\n')
        (imports / 'Style.qml').write_text('pragma Singleton\nimport QtQuick\nQtObject { property bool reduceMotion: true }\n')
        (tmp / 'tst_seal.qml').write_text(QML.replace('__SIZE__', str(SIZE)).replace('__OUT__', str(out)))
        env = {**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'QT_QUICK_BACKEND': 'software'}
        result = subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', str(tmp / 'tst_seal.qml'), '-import', str(tmp / 'imports'), '-import', str(tmp)],
                                env=env, text=True, capture_output=True, timeout=90)
        print(result.stdout + result.stderr)
        if result.returncode:
            raise SystemExit(result.returncode)
        errors = ['ReferenceError:', 'TypeError:', 'Binding loop', 'Unable to assign', 'Cannot assign', 'is not a type', 'is not defined']
        assert not any(error in result.stdout + result.stderr for error in errors), 'runtime QML diagnostics'
        check_pixels(out)
        if keep:
            keep.mkdir(parents=True, exist_ok=True)
            for png in out.glob('*.png'):
                shutil.copy2(png, keep / png.name)


def near(a, b, tol=6):
    return all(abs(int(x) - int(y)) <= tol for x, y in zip(a[:3], b[:3]))


def load(out, name):
    image = Image.open(out / f'{name}.png').convert('RGB')
    assert image.size == (SIZE, SIZE), (name, image.size)
    return image


def count(image, colour):
    data = image.tobytes()
    return sum(1 for pixel in zip(data[0::3], data[1::3], data[2::3]) if near(pixel, colour))


def check_pixels(out):
    # calm: neither the accent nor the urgent colour is anywhere
    calm = load(out, 'calm')
    assert count(calm, ACCENT) == 0 and count(calm, URGENT) == 0, 'calm seal carries a state colour'
    assert near(calm.getpixel((0, 0)), FRAME) and near(calm.getpixel((SIZE // 2, 0)), FRAME), 'the frame is drawn'
    assert count(calm, INK) > 40, 'the seal itself is drawn in ink'

    # low-ish battery: a 2 px accent line inside the frame's lower edge, 25 % of the inner width, no square
    lowish = load(out, 'lowish')
    width = round((SIZE - 2) * 0.25)
    for x in range(1, 1 + width):
        for y in (SIZE - 3, SIZE - 2):
            assert near(lowish.getpixel((x, y)), ACCENT), f'line pixel {x},{y} is {lowish.getpixel((x, y))}'
    assert not near(lowish.getpixel((1 + width + 1, SIZE - 2)), ACCENT), 'the line stops at its fill'
    assert not near(lowish.getpixel((SIZE - 3, SIZE - 2)), ACCENT), 'nothing beyond the fill'
    assert count(lowish, URGENT) == 0, 'a low-ish battery is not an alarm'

    # urgently low battery: the line in the urgent colour, and the square in the corner
    urgent = load(out, 'urgent_battery')
    width = round((SIZE - 2) * 0.10)
    for x in range(1, 1 + width):
        assert near(urgent.getpixel((x, SIZE - 2)), URGENT), f'urgent line pixel {x}'
    square = max(3, round(SIZE / 7))
    left = SIZE - 1 - square - 2
    for x in range(left, left + square):
        for y in range(3, 3 + square):
            assert near(urgent.getpixel((x, y)), URGENT), f'square pixel {x},{y}'
    assert near(urgent.getpixel((left - 2, 3)), GROUND) or not near(urgent.getpixel((left - 2, 3)), URGENT), 'the square has its own size'

    # an urgent workspace alone: the square, no line
    workspace = load(out, 'workspace')
    for x in range(left, left + square):
        assert near(workspace.getpixel((x, 4)), URGENT)
    assert count(workspace, ACCENT) == 0
    assert all(not near(workspace.getpixel((x, SIZE - 2)), URGENT) for x in range(1, SIZE - 1)), 'no battery line'

    # charging calms even a nearly empty battery
    charging = load(out, 'charging_low')
    assert count(charging, ACCENT) == 0 and count(charging, URGENT) == 0
    print('PASS: pixels of five seal states (calm, low-ish line, urgent line + square, workspace square, charging)')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--keep', type=Path, help='copy the rendered seals here')
    run(parser.parse_args().keep)
