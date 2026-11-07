#!/usr/bin/env python3
"""Check production contrast math against every installed theme (read-only)."""
import argparse
import json
from pathlib import Path
import subprocess
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def palette(folder):
    colors = tomllib.loads((folder / 'colors.toml').read_text())
    shell_file = folder / 'shell.toml'
    shell = tomllib.loads(shell_file.read_text()) if shell_file.exists() else {}
    bar = shell.get('bar', {})

    def resolve(value):
        seen = set()
        while not str(value).startswith('#') and value not in seen:
            seen.add(value)
            value = colors.get(value, value)
        return value

    return {'name': folder.name, 'mode': colors.get('mode', ''),
            'foreground': resolve(bar.get('text', colors.get('foreground', colors.get('color7')))),
            'background': resolve(bar.get('background', colors.get('background', colors.get('color0')))),
            'accent': resolve(colors.get('accent', colors.get('color4')))}


def run(output):
    themes = sorted((Path.home() / '.config/omarchy/themes').glob('*/colors.toml'))
    palettes = [palette(theme.parent) for theme in themes]
    assert {'look-tusche', 'morgenraster', 'papier'} <= {p['name'] for p in palettes}
    script = r'''
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(process.argv[1], 'utf8').replace(/^\.pragma.*$/mg,''),ctx);
const palettes=JSON.parse(fs.readFileSync(0,'utf8'));
function rgb(hex) {
  assert.match(hex,/^#[a-f0-9]{6}$/i);
  return {r:parseInt(hex.slice(1,3),16)/255,g:parseInt(hex.slice(3,5),16)/255,b:parseInt(hex.slice(5,7),16)/255};
}
function ratio(a,b) {
  function lum(c) {
    const values=['r','g','b'].map(k=>c[k]>.04045?((c[k]+.055)/1.055)**2.4:c[k]/12.92);
    return values[0]*.2126+values[1]*.7152+values[2]*.0722;
  }
  let x=lum(a)+.05,y=lum(b)+.05;
  return Math.max(x/y,y/x);
}
function quantize(c) { return Object.fromEntries(['r','g','b'].map(k=>[k,Math.round(c[k]*255)/255])); }
let report=[], checks=0, darkExact=0, darkChanged=0;
for(const p of palettes) {
  let fg=rgb(p.foreground), bg=rgb(p.background), accent=rgb(p.accent), rows=[];
  for(const plate of [false,true]) {
    let surfaces=ctx.backgrounds(fg,bg,accent,plate);
    for(const old of [.42,.45,.6,.62,.65,.75,.78]) {
      let alpha=ctx.opacity(fg,surfaces,old);
      assert(alpha>=old);
      let before=Math.min(...surfaces.map(s=>ratio(ctx.composite(fg,s,old),s)));
      if(before>=4.6) assert.equal(alpha,old,'passing alpha stays bit-identical');
      // Cover alpha quantization and the final 8-bit compositor target.
      let stored=Math.round(alpha*255)/255;
      let min=Infinity;
      // Include the plate animation between foreground and accent tints.
      let frames=surfaces.slice();
      if(plate) for(let t=0;t<=20;t++) frames.push(ctx.composite(
        ctx.composite(accent,fg,t/20),bg,.13+(.2-.13)*t/20));
      for(let s of frames) {
        let surface=quantize(s), text=quantize(ctx.composite(fg,surface,stored));
        let contrast=ratio(text,surface);
        assert(contrast>=4.5,`${p.name} plate=${plate} old=${old} alpha=${alpha} ratio=${contrast}`);
        min=Math.min(min,contrast);checks++;
      }
      if(ctx.luminance(bg)<.5) {if(alpha===old)darkExact++;else darkChanged++;}
      rows.push({plate,old,alpha,before,min});
    }
  }
  report.push({...p,rows});
}
console.log(JSON.stringify({themes:palettes.length,checks,darkExact,darkChanged,report},null,2));
'''
    result = subprocess.run(['node', '-e', script, str(ROOT / 'BarContrast.js')],
                            input=json.dumps(palettes), text=True, capture_output=True)
    if result.returncode:
        raise AssertionError(result.stderr)
    data = json.loads(result.stdout)
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(result.stdout)
    for name in ['look-funk', 'look-tusche', 'morgenraster', 'papier']:
        p = next(p for p in data['report'] if p['name'] == name)
        row = next(r for r in p['rows'] if r['old'] == .62 and r['plate'])
        print(f"{name}: secondary .62 -> {row['alpha']:.6f}; worst plate contrast {row['min']:.4f}:1")
    print(f"PASS {data['themes']} installed palettes, {data['checks']} contrasts; "
          f"dark alpha unchanged: {data['darkExact']}, raised: {data['darkChanged']}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path)
    run(parser.parse_args().output)
