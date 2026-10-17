#!/usr/bin/env python3
"""Render the real OmiFace.qml with the real Omi player offscreen and read its pixels.

Omi's player and kit are not part of this repository: they are read from the data
directory setup/omi-fetch.sh fills (or --pack DIR). Without them the test is skipped.
Only two things are fixtures: Quickshell.Io's FileView (reads the pack with a
synchronous XHR) and qs.Commons' Style. OmiFace, FocusSeal.js and OmiArt.js are the
production files. Every face is rendered at the window's size on a flat grey, in a
light and a dark palette, and its pixels inspected; a second run lets time pass.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SIZE = 66
BACKDROP = (120, 120, 120)
PALETTES = {
    'light': {'ground': (245, 240, 230), 'accent': (32, 96, 192), 'urgent': (192, 32, 32)},
    'dark': {'ground': (24, 24, 28), 'accent': (240, 170, 60), 'urgent': (230, 70, 70)},
}
CASES = [
    ('calm', {'face': 'calm', 'tone': 'accent', 'level': 0.9, 'badge': None}),
    ('working', {'face': 'working', 'tone': 'accent', 'level': 0.9, 'badge': None}),
    ('waiting', {'face': 'waiting', 'tone': 'accent', 'level': 0.9, 'badge': None}),
    ('attention', {'face': 'attention', 'tone': 'accent', 'level': 0.9, 'badge': None}),
    ('drained', {'face': 'drained', 'tone': 'accent', 'level': 0.25, 'badge': None}),
    ('alert', {'face': 'alert', 'tone': 'urgent', 'level': 0.9, 'badge': None}),
    ('battery', {'face': 'battery', 'tone': 'urgent', 'level': 0.1, 'badge': None}),
    ('calm_3', {'face': 'calm', 'tone': 'accent', 'level': 0.9, 'badge': {'count': 3, 'tone': 'accent'}}),
    ('alert_21', {'face': 'alert', 'tone': 'urgent', 'level': 0.9, 'badge': {'count': 21, 'tone': 'urgent'}}),
    ('battery_9', {'face': 'battery', 'tone': 'urgent', 'level': 0.1, 'badge': {'count': 9, 'tone': 'accent'}}),
]

FILEVIEW = '''import QtQuick
Item {
 property string path
 property bool blockLoading: false
 function text() {
  var x = new XMLHttpRequest()
  x.open("GET", "file://" + path, false)
  x.send()
  return x.responseText
 }
}
'''

QML = r'''import QtQuick
import QtTest
import qs.Commons
import "modules" as Modules

Item {
 id: root
 width: 400; height: 120
 property var cases: __CASES__
 Component {
  id: make
  Rectangle {
   id: backdrop
   width: __SIZE__; height: __SIZE__
   color: "#787878"
   property alias face: omiFace
   Modules.OmiFace {
    id: omiFace
    anchors.fill: parent
    packUrl: "file://__PACK__/Omi.qml"
    ground: "__GROUND__"; accent: "__ACCENT__"; urgent: "__URGENT__"
   }
  }
 }
 TestCase {
  name: "OmiFace"
  when: windowShown
  function shot(item, name) {
   var done = false, ok = false
   verify(item.grabToImage(function(r) { ok = r.saveToFile("__OUT__/" + name + ".png"); done = true }))
   tryVerify(function() { return done })
   verify(ok)
  }
  function test_01_render_every_face() {
   Style.reduceMotion = true
   for (var i = 0; i < root.cases.length; i++) {
    var c = root.cases[i]
    var b = createTemporaryObject(make, root, { x: 10, y: 10 })
    verify(b)
    tryVerify(function() { return b.face.available }, 3000)
    b.face.companion = c.comp
    compare(b.face.omiMode, c.mode)
    wait(1700)                       // the morph from the logo has landed
    shot(b, c.name)
    b.destroy()
   }
  }
  function test_02_motion() {
   Style.reduceMotion = false
   var b = createTemporaryObject(make, root, { x: 10, y: 10 })
   tryVerify(function() { return b.face.available }, 3000)
   b.face.companion = { face: "battery", tone: "urgent", level: 0.1, badge: { count: 2, tone: "accent" } }
   wait(300)
   var seen = {}
   for (var i = 0; i < 24; i++) { seen[b.face.blinkOn] = true; wait(120) }
   verify(seen["true"] && seen["false"], "the battery blinks")
   b.face.companion = { face: "calm", tone: "accent", level: 0.9, badge: { count: 2, tone: "accent" } }
   wait(1200)
   compare(b.face.blinkOn, true)
   compare(b.face.omi.showing, "idle")
   b.face.react()
   tryCompare(b.face.omi, "showing", "success", 500)
   wait(300); shot(b, "react_early")
   tryCompare(b.face.omi, "showing", "idle", 4000)
   var scales = []
   b.face.pop()
   for (var j = 0; j < 8; j++) { scales.push(b.face.badgeScale); wait(40) }
   verify(Math.max.apply(null, scales) > 1.1, "the bubble pops: " + scales)
   wait(500)
   compare(b.face.badgeScale, 1)
   // the first notification: the event can come before the bubble exists
   b.face.companion = { face: "calm", tone: "accent", level: 0.9, badge: null }
   wait(100)
   b.face.pop()
   b.face.companion = { face: "calm", tone: "accent", level: 0.9, badge: { count: 1, tone: "accent" } }
   scales = []
   for (var k = 0; k < 8; k++) { scales.push(b.face.badgeScale); wait(40) }
   verify(Math.max.apply(null, scales) > 1.1, "the first bubble pops too: " + scales)
   b.destroy()
  }
  function test_05_the_idle_life_plays_and_is_interrupted() {
   Style.reduceMotion = false
   var b = createTemporaryObject(make, root, { x: 10, y: 10 })
   tryVerify(function() { return b.face.available }, 3000)
   var calm = { face: "calm", tone: "accent", level: 0.9, badge: null }
   b.face.companion = calm
   b.face.intensity = "lively"
   wait(300)
   // asleep: the mode follows, waking ends it
   compare(b.face.play("sleep"), "ok")
   compare(b.face.asleep, true)
   tryCompare(b.face, "omiMode", "sleeping", 500)
   b.face.userIdle = false              // you are plainly there, but a preview holds him asleep for a while
   wait(1500)
   compare(b.face.asleep, true)
   b.face.previewUntil = 0              // the hold is over: the director wakes him on its next tick
   tryCompare(b.face, "asleep", false, 2000)
   tryCompare(b.face, "omiMode", "idle", 500)
   // a glance looks somewhere, then ahead again
   compare(b.face.play("glance"), "ok")
   verify(b.face.omi.look[0] !== 0, "he looks aside")
   tryVerify(function() { return b.face.omi.look[0] === 0 }, 4000)
   // the fly: appears, his eyes follow, it goes, he raises a brow
   compare(b.face.play("fly"), "ok")
   var seen = false, looked = false
   for (var i = 0; i < 40; i++) {
    if (b.face.flyNow && b.face.flyNow.visible) { seen = true; if (b.face.omi.look[0] !== 0 || b.face.omi.look[1] !== 0) looked = true }
    wait(100)
   }
   verify(seen, "the fly is on screen")
   verify(looked, "his eyes follow it")
   b.face.flyStart = Date.now() - 8700
   tryVerify(function() { return b.face.flyNow === null }, 2000)
   tryVerify(function() { return b.face.omi.look[0] === 0 && b.face.omi.look[1] === 0 }, 1000)
   // the yawn lifts him and puts him back
   compare(b.face.play("yawn"), "ok")
   var low = 0
   for (var j = 0; j < 30; j++) { low = Math.min(low, b.face.lift); wait(100) }
   verify(low <= -2 * b.face.cell + 0.5, "he stretches up: " + low)
   tryCompare(b.face, "lift", 0, 3000)
   // the clock: hovering shows the time, leaving takes it away
   b.face.hovered = true
   tryCompare(b.face, "showClock", true, 1500)
   verify(/^\d\d:\d\d$/.test(b.face.clockText), b.face.clockText)
   compare(b.face.bubble.text, b.face.clockText)
   b.face.hovered = false
   tryCompare(b.face, "showClock", false, 500)
   verify(b.face.play("nonsense").indexOf("unknown") === 0)
   b.destroy()
  }
  function test_05b_interruptions_and_previews_end_cleanly() {
   Style.reduceMotion = false
   var b = createTemporaryObject(make, root, { x: 10, y: 10 })
   tryVerify(function() { return b.face.available }, 3000)
   var calm = { face: "calm", tone: "accent", level: 0.9, badge: null }
   b.face.companion = calm
   // a fly in flight is stopped by a failure, the eyes look ahead again, nothing is left over
   b.face.play("fly")
   wait(1500)
   verify(b.face.flyNow !== null)
   b.face.companion = { face: "alert", tone: "urgent", level: 0.9, badge: null }
   tryVerify(function() { return b.face.flyNow === null }, 1000)
   tryVerify(function() { return b.face.omi.look[0] === 0 && b.face.omi.look[1] === 0 }, 1000)
   wait(300)
   verify(b.face.omi.showing !== "skeptical", "no stale reaction after the interruption")
   // falling asleep while a fly is out ends the fly
   b.face.companion = calm
   wait(300)
   b.face.play("fly")
   wait(800)
   b.face.perform({ kind: "sleep" })
   compare(b.face.flyNow, null)
   compare(b.face.asleep, true)
   b.face.play("wake")
   // the sleep preview wakes by itself even when the idle life is off
   b.face.intensity = "off"
   b.face.previewSeconds = 1
   wait(200)
   b.face.play("sleep")
   compare(b.face.asleep, true)
   tryCompare(b.face, "asleep", false, 2500)
   // ... and a failure during the preview wakes him at once
   b.face.intensity = "lively"
   b.face.previewSeconds = 12
   b.face.play("sleep")
   compare(b.face.asleep, true)
   b.face.companion = { face: "waiting", tone: "accent", level: 0.9, badge: null }
   tryCompare(b.face, "asleep", false, 1000)
   // off the screen there is no idle life at all
   b.face.companion = calm
   b.face.onScreen = false
   compare(b.face.idleLife, false)
   b.face.onScreen = true
   b.destroy()
  }
  function test_05c_a_working_agent_does_not_stop_the_glances() {
   Style.reduceMotion = false
   var b = createTemporaryObject(make, root, { x: 10, y: 10 })
   tryVerify(function() { return b.face.available }, 3000)
   b.face.companion = { face: "working", tone: "accent", level: 0.9, badge: null }
   b.face.intensity = "lively"
   wait(800)
   b.face.userIdle = true
   tryVerify(function() { return b.face.omi.look[0] !== 0 || b.face.omi.look[1] !== 0 }, 7000)
   compare(b.face.asleep, false)
   b.face.userIdle = false
   tryVerify(function() { return b.face.omi.look[0] === 0 && b.face.omi.look[1] === 0 }, 2000)
   b.destroy()
  }
  function test_06_the_director_drives_him_while_you_are_away() {
   Style.reduceMotion = false
   var b = createTemporaryObject(make, root, { x: 10, y: 10 })
   tryVerify(function() { return b.face.available }, 3000)
   b.face.companion = { face: "calm", tone: "accent", level: 0.9, badge: null }
   b.face.intensity = "lively"
   wait(1000)
   compare(b.face.omi.look[0], 0)
   b.face.userIdle = true               // the first glance comes about three seconds later
   tryVerify(function() { return b.face.omi.look[0] !== 0 || b.face.omi.look[1] !== 0 }, 7000)
   b.face.userIdle = false              // back at the keyboard: whatever he was doing stops
   tryVerify(function() { return b.face.omi.look[0] === 0 && b.face.omi.look[1] === 0 }, 2000)
   // anything to say stops it too, and reduced motion silences it altogether
   b.face.userIdle = true
   tryVerify(function() { return b.face.omi.look[0] !== 0 || b.face.omi.look[1] !== 0 }, 7000)
   b.face.companion = { face: "alert", tone: "urgent", level: 0.9, badge: null }
   tryVerify(function() { return b.face.omi.look[0] === 0 && b.face.omi.look[1] === 0 }, 2000)
   b.face.companion = { face: "calm", tone: "accent", level: 0.9, badge: null }
   b.face.userIdle = false
   wait(1100)
   Style.reduceMotion = true
   b.face.userIdle = true
   wait(4500)
   compare(b.face.omi.look[0], 0)
   compare(b.face.omi.look[1], 0)
   Style.reduceMotion = false
   b.destroy()
  }
  function test_07_stills_of_the_idle_pieces() {
   Style.reduceMotion = true
   var calm = { face: "calm", tone: "accent", level: 0.9, badge: null }
   var specs = [
    { name: "asleep", prep: function(f) { f.asleep = true } },
    { name: "clock", prep: function(f) { f.clockText = "09:41"; f.showClock = true } },
    { name: "fly", prep: function(f) { f.flySeed = 0; f.flyT = 4.5 } },
    { name: "yawn", prep: function(f) { f.lift = -6 } }
   ]
   for (var i = 0; i < specs.length; i++) {
    var b = createTemporaryObject(make, root, { x: 10, y: 10 })
    tryVerify(function() { return b.face.available }, 3000)
    b.face.companion = calm
    specs[i].prep(b.face)
    wait(specs[i].name === "asleep" ? 2500 : 1700)
    shot(b, specs[i].name)
    b.destroy()
   }
  }
  function test_04_unloading_and_loading_again_is_quiet() {
   Style.reduceMotion = true
   var b = createTemporaryObject(make, root, { x: 10, y: 10 })
   tryVerify(function() { return b.face.available }, 3000)
   b.face.companion = { face: "alert", tone: "urgent", level: 0.9, badge: { count: 5, tone: "urgent" } }
   wait(300)
   b.face.active = false
   wait(300)
   compare(b.face.available, false)
   b.face.active = true
   tryVerify(function() { return b.face.available }, 3000)
   b.destroy()
  }
  function test_03_without_the_pack_nothing_is_available() {
   var b = createTemporaryObject(make, root, { x: 10, y: 10 })
   b.face.packUrl = "file:///nonexistent/Omi.qml"
   wait(200)
   compare(b.face.available, false)
   b.face.packUrl = ""
   wait(100)
   compare(b.face.available, false)
   b.destroy()
  }
 }
}
'''


def default_pack():
    base = Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share')
    return base / 'tusche-bar/omi'


def mode_of(face):
    return {'calm': 'idle', 'working': 'working', 'waiting': 'listening', 'attention': 'warning',
            'drained': 'low-battery', 'alert': 'angry', 'battery': 'logo'}[face]


def js(value):
    import json
    return json.dumps(value)


def run(pack, keep=None):
    for needed in ('Omi.qml', 'omi.js', 'omi.json'):
        if not (pack / needed).is_file():
            print(f'SKIP: {pack / needed} is missing (run setup/omi-fetch.sh)')
            return
    for palette_name, colours in PALETTES.items():
        with tempfile.TemporaryDirectory(prefix='tusche-omi-') as folder:
            tmp = Path(folder)
            out = tmp / 'out'
            out.mkdir()
            (tmp / 'modules').mkdir()
            shutil.copy2(ROOT / 'modules/OmiFace.qml', tmp / 'modules/OmiFace.qml')
            for name in ['FocusSeal.js', 'OmiArt.js', 'IdleDirector.js']:
                shutil.copy2(ROOT / name, tmp / name)
            plugin = tmp / 'pack'
            plugin.mkdir()
            for needed in ('Omi.qml', 'omi.js', 'omi.json'):
                shutil.copy2(pack / needed, plugin / needed)
            commons = tmp / 'imports/qs/Commons'
            commons.mkdir(parents=True)
            (commons / 'qmldir').write_text('module qs.Commons\nsingleton Style 1.0 Style.qml\n')
            (commons / 'Style.qml').write_text('pragma Singleton\nimport QtQuick\nQtObject { property bool reduceMotion: true }\n')
            io = tmp / 'imports/Quickshell/Io'
            io.mkdir(parents=True)
            (io / 'qmldir').write_text('module Quickshell.Io\nFileView 1.0 FileView.qml\n')
            (io / 'FileView.qml').write_text(FILEVIEW)
            hexed = lambda c: '#%02x%02x%02x' % c
            cases = [{'name': n, 'comp': c, 'mode': mode_of(c['face'])} for n, c in CASES]
            (tmp / 'tst_omi.qml').write_text(
                QML.replace('__CASES__', js(cases)).replace('__SIZE__', str(SIZE)).replace('__PACK__', str(plugin))
                   .replace('__GROUND__', hexed(colours['ground'])).replace('__ACCENT__', hexed(colours['accent']))
                   .replace('__URGENT__', hexed(colours['urgent'])).replace('__OUT__', str(out)))
            env = {**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'QT_QUICK_BACKEND': 'software', 'QML_XHR_ALLOW_FILE_READ': '1'}
            result = subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', str(tmp / 'tst_omi.qml'),
                                     '-import', str(tmp / 'imports'), '-import', str(tmp)],
                                    env=env, text=True, capture_output=True, timeout=240)
            print(result.stdout + result.stderr)
            if result.returncode:
                raise SystemExit(result.returncode)
            errors = ['ReferenceError:', 'TypeError:', 'Binding loop', 'Unable to assign', 'Cannot assign', 'is not a type', 'is not defined']
            assert not any(error in result.stdout + result.stderr for error in errors), 'runtime QML diagnostics'
            if keep:
                keep.mkdir(parents=True, exist_ok=True)
                for png in out.glob('*.png'):
                    shutil.copy2(png, keep / f'{palette_name}-{png.name}')
            check_pixels(out, colours, palette_name)


def near(a, b, tol=10):
    return all(abs(int(x) - int(y)) <= tol for x, y in zip(a[:3], b[:3]))


def load(out, name):
    image = Image.open(out / f'{name}.png').convert('RGB')
    assert image.size == (SIZE, SIZE), (name, image.size)
    return image


def count(image, colour, box=None):
    region = image.crop(box) if box else image
    data = region.tobytes()
    return sum(1 for pixel in zip(data[0::3], data[1::3], data[2::3]) if near(pixel, colour))


BUBBLE_BOX = (46, 0, SIZE, 28)       # where the bubble sits (pack units * 0.15 + 10.5)
FACE_BOX = (0, 24, 60, SIZE)         # the logo's lower part, clear of the bubble


def check_pixels(out, colours, palette):
    ground, accent, urgent = colours['ground'], colours['accent'], colours['urgent']
    shots = {name: load(out, name) for name, _ in CASES}
    for name, image in shots.items():
        assert image.getpixel((0, 0)) == BACKDROP, f'{name}: the backdrop is untouched at the corner'

    # a face is drawn in exactly one colour: the accent, or for a failure the urgent one
    for name in ('calm', 'working', 'waiting', 'attention', 'drained'):
        assert count(shots[name], accent) > 120, f'{name}: Omi is drawn in the accent'
        assert count(shots[name], urgent) == 0, f'{name}: no alarm colour'
    assert count(shots['alert'], urgent) > 120 and count(shots['alert'], accent) == 0, 'a failure is urgent all over'
    # the outline: Omi's pieces sit in a rim of the ground colour on the grey
    assert count(shots['calm'], ground) > 40, 'the ground-coloured rim is drawn'

    # different faces really differ
    def differs(a, b):
        return sum(1 for p, q in zip(shots[a].tobytes()[0::3], shots[b].tobytes()[0::3]) if abs(p - q) > 4) > 6
    # (`working` stands still like `calm`: it differs in motion, which test_02 does not compare)
    for a, b in [('calm', 'waiting'), ('calm', 'attention'), ('calm', 'drained'), ('calm', 'alert'), ('calm', 'battery')]:
        assert differs(a, b), f'{a} and {b} look alike'

    # speech bubble: solid in its tone at the top right, digits cut out in the ground colour
    for name, tone in (('calm_3', accent), ('alert_21', urgent), ('battery_9', accent)):
        assert count(shots[name], tone, BUBBLE_BOX) > 150, f'{name}: bubble body'
        assert count(shots[name], ground, BUBBLE_BOX) > 40, f'{name}: digits and rim'
    assert count(shots['calm'], accent, BUBBLE_BOX) < count(shots['calm_3'], accent, BUBBLE_BOX), 'no bubble without unread'
    wide = count(shots['alert_21'], urgent, BUBBLE_BOX)
    narrow = count(shots['calm_3'], accent, BUBBLE_BOX)
    assert wide > narrow, 'two digits make a wider bubble'

    # the battery stands where the face was: urgent pixels in the middle, none of the accent
    middle = (22, 26, 48, 44)
    assert count(shots['battery'], urgent, middle) > 25, 'a battery in the middle'
    assert count(shots['battery'], accent) == 0
    assert count(shots['calm'], urgent, middle) == 0
    # the idle pieces
    for name in ('asleep', 'clock', 'fly', 'yawn'):
        shots[name] = load(out, name)
    def topmost(image, colour):
        for y in range(SIZE):
            if count(image, colour, (0, y, SIZE, y + 1)) > 3:
                return y
        return SIZE
    assert count(shots['asleep'], accent) > 80, 'asleep: still drawn in the accent'
    assert sum(1 for p, q in zip(shots['asleep'].tobytes()[0::3], shots['calm'].tobytes()[0::3]) if abs(p - q) > 4) > 40, 'asleep differs from calm'
    clock_region = (0, 0, SIZE, 28)
    assert count(shots['clock'], accent, clock_region) > 350, 'the clock bubble is a wide solid block'
    assert count(shots['clock'], accent, clock_region) > count(shots['calm_3'], accent, clock_region) + 120, 'wider than a count bubble'
    assert count(shots['clock'], ground, clock_region) > 60, 'the digits are cut out'
    assert sum(1 for p, q in zip(shots['fly'].tobytes()[0::3], shots['calm'].tobytes()[0::3]) if abs(p - q) > 4) > 8, 'the fly is drawn'
    assert topmost(shots['yawn'], accent) <= topmost(shots['calm'], accent) - 3, 'the yawn lifts him by about two cells'
    print(f'PASS ({palette}): faces, outline, bubbles, battery and the idle pieces')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', type=Path, default=default_pack(), help="directory with Omi.qml, omi.js, omi.json")
    parser.add_argument('--keep', type=Path, help='copy the rendered faces here')
    args = parser.parse_args()
    run(args.pack, args.keep)
