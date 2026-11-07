#!/usr/bin/env python3
"""Render old/new secondary labels with real Qt and compare their pixels."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run(output):
    from PIL import Image, ImageChops
    data = json.loads((output / 'contrast.json').read_text())
    with tempfile.TemporaryDirectory(prefix='strand-f-contrast-') as folder:
        tmp = Path(folder)
        shutil.copy2(ROOT / 'BarContrast.js', tmp / 'BarContrast.js')
        qml = r'''import QtQuick
import QtTest
import "BarContrast.js" as Contrast
Item {
 id: canvas
 width: 520; height: 120
 property var palettes: PALETTES
 Component {
  id: sample
  Item {
   id: root
   width: 520; height: 120
   property var palette
   property bool corrected: false
   property color ink: palette.foreground
   property color background: palette.background
   property color accent: palette.accent
   property var surfaces: Contrast.backgrounds(ink,background,accent,true)
   Repeater {
    model: root.surfaces
    Rectangle {
     required property var modelData
     required property int index
     x:0; y:index*30; width:520; height:30
     color:Qt.rgba(modelData.r,modelData.g,modelData.b,1)
     Text {
      x:10; anchors.verticalCenter:parent.verticalCenter
      text:"scrolling   X 67.5k cr   channel two"
      textFormat:Text.PlainText
      renderType:Text.NativeRendering
      font.family:"JetBrains Mono"; font.pixelSize:14
      color:root.corrected ? Contrast.color(root.ink,root.surfaces,.62) : Qt.rgba(root.ink.r,root.ink.g,root.ink.b,.62)
     }
    }
   }
  }
 }
 TestCase {
  name:"BarContrastPixels"
  when:windowShown
  function test_palette_pixels() {
   for(var i=0;i<canvas.palettes.length;i++) {
    var p=canvas.palettes[i]
    var item=createTemporaryObject(sample,canvas,{palette:p})
    verify(item)
    wait(5)
    grabImage(item).save(OUTPUT+"/"+p.name+"-before.png")
    item.corrected=true
    wait(5)
    grabImage(item).save(OUTPUT+"/"+p.name+"-after.png")
    item.destroy()
    wait(1)
   }
  }
 }
}'''
        (tmp / 'tst_contrast.qml').write_text(qml.replace('PALETTES', json.dumps(data['report'])).replace('OUTPUT', json.dumps(str(tmp))))
        result = subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', str(tmp / 'tst_contrast.qml')],
            env={**os.environ, 'QT_QPA_PLATFORM':'offscreen','QT_QUICK_BACKEND':'software',
                 'QT_QPA_PLATFORMTHEME':'','QT_STYLE_OVERRIDE':''}, capture_output=True, text=True, timeout=30)
        print(result.stdout + result.stderr)
        assert result.returncode == 0
        assert not any(s in result.stdout + result.stderr for s in ['TypeError','ReferenceError','Unable to assign'])
        checks = []
        for palette in data['report']:
            name = palette['name']
            before, after = [Image.open(tmp / f'{name}-{kind}.png').convert('RGBA') for kind in ['before','after']]
            difference = ImageChops.difference(before, after)
            # RGB differences are meaningful even though the alpha delta is zero.
            box = difference.convert('RGB').getbbox()
            unchanged = box is None
            alpha = next(r['alpha'] for r in palette['rows'] if r['old'] == .62 and r['plate'])
            assert unchanged == (alpha == .62), (name, alpha, box)
            checks.append({'theme':name, 'mode':palette['mode'], 'unchanged':unchanged,'changedBounds':box})
            if name in ['look-funk','look-tusche','morgenraster','papier']:
                for kind in ['before','after']:
                    shutil.copy2(tmp / f'{name}-{kind}.png', output / f'{name}-text-{kind}.png')
        (output / 'contrast-pixels.json').write_text(json.dumps(checks, indent=2))
        dark = [c for c in checks if c['mode'] == 'dark']
        print(f"PASS {len(checks)} real Qt before/after comparisons; {sum(c['unchanged'] for c in dark)}/{len(dark)} dark themes pixel-identical at .62")
        print('Dark themes requiring a raise: ' + ', '.join(c['theme'] for c in dark if not c['unchanged']))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    run(parser.parse_args().output.resolve())
