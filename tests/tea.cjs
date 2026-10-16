// Rooibos / Kandis, the tea pair of the glass family (tools/build-tea-themes.py).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log('PASS ' + label); };
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const sha = f => crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = h => { const n = parseInt(h.slice(1), 16); return 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const toml = t => Object.fromEntries([...t.matchAll(/^([\w-]+)\s*=\s*"?(#[0-9a-fA-F]{6}|[\w.-]+)"?\s*$/gm)].map(m => [m[1], m[2]]));
const THEMES = { rooibos: 'dark', kandis: 'light' };
const PICTURES = { rooibos: ['1-teekanne.jpg', '2-abendbar.jpg', '3-lesesessel.jpg'], kandis: ['1-fensterbank.jpg', '2-milchschaum.jpg', '3-teeglas.jpg'] };

for (const [t, mode] of Object.entries(THEMES)) {
  const c = toml(read('themes', t, 'colors.toml'));
  check(`${t}: a complete theme folder`, () => {
    for (const f of ['colors.toml', 'hyprland.lua', 'bar-material.json', 'neovim.lua', 'icons.theme', 'shell.bar.toml', 'shell.launcher.toml', 'shell.menu.toml', 'unlock.png', 'preview.png', '.tusche-papier'])
      assert.ok(fs.existsSync(path.join(root, 'themes', t, f)), `${t}/${f}`);
    assert.equal(c.mode, mode);
  });
  check(`${t}: every text colour reaches 4.5:1 on its background`, () => {
    for (const k of ['foreground', 'dark_foreground', 'muted', 'accent', 'red', 'orange', 'yellow', 'green', 'blue', 'cyan', 'magenta', 'purple',
      'bright_red', 'bright_orange', 'bright_yellow', 'bright_green', 'bright_blue', 'bright_cyan', 'bright_magenta'])
      assert.ok(ratio(c[k], c.background) >= 4.5, `${t}: ${k} ${ratio(c[k], c.background).toFixed(2)}`);
    assert.ok(ratio(c.foreground, c.selection) >= 4.5, `${t}: foreground on selection`);
    const bar = toml(read('themes', t, 'shell.bar.toml'));
    assert.ok(ratio(bar.text, bar.background) >= 4.5 && ratio(bar.active, bar.background) >= 4.5, `${t}: bar text`);
    for (const f of ['shell.menu.toml', 'shell.launcher.toml']) {
      const m = toml(read('themes', t, f));
      assert.ok(ratio(m.text, m.background) >= 4.5 && ratio(m['selected-text'], m['selected-background']) >= 4.5, `${t}/${f}: text and selection`);
    }
  });
  check(`${t}: red is the one signal colour of the UI chrome`, () => {
    // a red by hue (amber, the accent, sits near 30° and is not one)
    const red = h => {
      const [r, g, b] = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx - mn < 0.25) return false;
      const hue = mx === r ? (60 * ((g - b) / (mx - mn)) + 360) % 360 : mx === g ? 60 * ((b - r) / (mx - mn)) + 120 : 60 * ((r - g) / (mx - mn)) + 240;
      return hue < 18 || hue > 340;
    };
    assert.ok(red(c.red) && !red(c.accent), `${t}: the heuristic tells the red from the amber accent`);
    for (const f of ['shell.bar.toml', 'shell.menu.toml', 'shell.launcher.toml']) for (const v of Object.values(toml(read('themes', t, f)))) if (/^#/.test(v)) assert.ok(!red(v), `${t}/${f}: ${v} is not a red`);
  });
  check(`${t}: tea glass is the glass family (no chrome), with a complete frame glint`, () => {
    const m = JSON.parse(read('themes', t, 'bar-material.json'));
    assert.equal(m.family, 'glass');
    assert.equal(m.metal, undefined);
    assert.equal(m.card.roll, true);
    assert.equal(m.glass.enabled, true); assert.equal(m.glass.spring, true); assert.equal(m.glass.light, mode === 'light');
    assert.ok(/^#[0-9a-f]{6}$/i.test(m.glass.tint) && m.glass.backing > 0.3 && m.glass.backing < 0.8, `${t}: amber tint and backing`);
    assert.ok(m.glass.gloss > 0, `${t}: the plate shows at rest, as Frost / Smoke`);
    const f = m.glass.frame;
    assert.ok(f && f.ms > 0 && f.band > 0 && f.amount > 0 && f.amount <= 1 && f.bloom >= 0 && f.shadeAmt >= 0);
    assert.ok(/^#[0-9a-f]{6}$/i.test(f.tint) && /^#[0-9a-f]{6}$/i.test(f.shade));
  });
  check(`${t}: a still amber stripe frame, a dark window shadow, no light focus halo`, () => {
    const h = read('themes', t, 'hyprland.lua');
    assert.match(h, /hl\.animation\(\{ leaf = "borderangle", enabled = false \}\)/);
    assert.match(h, /angle = 45 \}/);
    const shadow = /color = "rgba\(([0-9a-f]{6})([0-9a-f]{2})\)", color_inactive = "rgba\(00000000\)"/.exec(h);
    assert.ok(shadow && lum('#' + shadow[1]) < 0.02, `${t}: the shadow is dark (a light one read as a white halo on Smoke)`);
    assert.doesNotMatch(h.replace(/^--.*$/gm, ''), /loop/);
  });
  check(`${t}: its own three pictures, default first, exactly the generator's input`, () => {
    assert.deepEqual(fs.readdirSync(path.join(root, 'themes', t, 'backgrounds')).sort(), PICTURES[t]);
    for (const f of PICTURES[t]) assert.equal(sha(path.join(root, 'tools', 'tea-backgrounds', t, f)), sha(path.join(root, 'themes', t, 'backgrounds', f)), f);
    assert.equal(sha(path.join(root, 'tools', 'tea-backgrounds', t, 'preview.png')), sha(path.join(root, 'themes', t, 'preview.png')));
    for (const other of ['frost', 'smoke', 'chrom', 'platin']) {
      const own = new Set(PICTURES[t].map(f => sha(path.join(root, 'themes', t, 'backgrounds', f))));
      for (const f of fs.readdirSync(path.join(root, 'themes', other, 'backgrounds'))) assert.ok(!own.has(sha(path.join(root, 'themes', other, 'backgrounds', f))), `${t} shares no picture with ${other}`);
    }
  });
  check(`${t}: neovim keeps red for errors only`, () => {
    const n = read('themes', t, 'neovim.lua');
    assert.match(n, new RegExp(`local sig = "${c.red}"`));
    assert.match(n, new RegExp(`bright_red = "${c.accent}"`), 'aether uses bright_red decoratively: it gets the accent');
  });
}
check('the installer knows the tea pair', () => {
  assert.match(read('setup/install.sh'), /themes=\([^)]*\brooibos kandis\)/);
});
console.log(checks + ' tea checks passed');
