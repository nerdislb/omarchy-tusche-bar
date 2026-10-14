const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'GlassMath.js'), 'utf8').replace('.pragma library', ''), ctx);
let checks = 0;
const check = (label, fn) => { fn(); checks++; console.log('PASS ' + label); };
const plain = x => JSON.parse(JSON.stringify(x));

for (const fps of [30, 60, 144]) {
  check('spring settles and stops at ' + fps + ' fps', () => {
    let x = 0, v = 0, peak = 0, frames = 0;
    do {
      const s = ctx.step(x, v, 1, 1/fps, 24.5, 0.78);
      x = s.x; v = s.v; peak = Math.max(peak, x); frames++;
      assert(Number.isFinite(x) && Number.isFinite(v));
    } while (!ctx.settled(x, v, 1) && frames < fps*3);
    assert(frames < fps, 'settles within one second');
    assert(peak > 1 && peak < 1.025, 'restrained overshoot, not a liquid blob');
  });
}
check('mid-entry reverse and reopen preserve position and velocity', () => {
  let x = 0, v = 0;
  for (let i=0;i<6;i++) { const s=ctx.step(x,v,1,1/60,24.5,0.78); x=s.x; v=s.v; }
  assert(x > 0.4 && x < 0.85);
  const exact=ctx.step(x,v,0,0,24.5,0.78);
  assert(Math.abs(exact.x-x)<1e-12 && Math.abs(exact.v-v)<1e-12);
  for (let i=0;i<6;i++) { const s=ctx.step(x,v,0,1/60,24.5,0.78); x=s.x; v=s.v; }
  assert(x > 0.05 && x < 0.5);
  const reopen=ctx.step(x,v,1,0,24.5,0.78);
  assert(Math.abs(reopen.x-x)<1e-12 && Math.abs(reopen.v-v)<1e-12);
});
check('suspend-sized delta is bounded, not unstable', () => {
  assert.deepEqual(plain(ctx.step(.4,2,1,300,24.5,.78)),plain(ctx.step(.4,2,1,.05,24.5,.78)));
});
const monitor = {activeWorkspace:{id:3},specialWorkspace:{id:0}};
const region = {x:1200,y:1110,w:500,h:400};
const client={mapped:true,hidden:false,workspace:{id:3},at:[1250,1140],size:[600,400]};
check('capture uses global logical geometry, including output offsets', () => {
  assert.deepEqual(plain(ctx.clientRect(client,monitor,region)),{x:50,y:30,w:600,h:400,z:0});
});
check('parked, hidden, invalid and other-workspace windows are excluded', () => {
  for (const patch of [{mapped:false},{hidden:true},{workspace:{id:4}},{at:[-3000,1140]},{size:[0,10]},{at:[NaN,0]},{size:[Infinity,10]}])
    assert.equal(ctx.clientRect({...client,...patch},monitor,region),null);
});
check('an open special workspace can be captured', () => {
  assert(ctx.clientRect({...client,workspace:{id:-99}}, {...monitor,specialWorkspace:{id:-99}}, region));
});
check('material and motion switches are independent and never mutate source', () => {
  const source={glass:{enabled:true,spring:true},card:{roll:true},family:'glass'};
  const a=plain(ctx.material(source,'off','on')), b=plain(ctx.material(source,'on','off'));
  assert(!a.glass.enabled && a.glass.spring);
  assert(b.glass.enabled && !b.glass.spring);
  assert.deepEqual(source,{glass:{enabled:true,spring:true},card:{roll:true},family:'glass'});
});
check('new themes retain the exact native window frame configs', () => {
  for (const [theme,base] of [['frost','platin'],['smoke','chrom']])
    assert.equal(fs.readFileSync(path.join(root,'themes',theme,'hyprland.lua'),'utf8'),fs.readFileSync(path.join(root,'themes',base,'hyprland.lua'),'utf8'));
});
check('Frost and Smoke carry their own pictures, not Platin\'s and Chrom\'s', () => {
  const sha = f => require('node:crypto').createHash('sha1').update(fs.readFileSync(f)).digest('hex');
  const themeDir = (t, ...p) => path.join(root, 'themes', t, ...p);
  const expected = { frost: ['1-raureif.jpg', '2-gletscherlicht.jpg', '3-prisma.jpg'], smoke: ['1-rauchband.jpg', '2-regenglas.jpg', '3-rauchquarz.jpg'] };
  for (const [theme, base] of [['frost', 'platin'], ['smoke', 'chrom']]) {
    assert.deepEqual(fs.readdirSync(themeDir(theme, 'backgrounds')).sort(), expected[theme], theme + ': its three pictures, default first');
    const own = new Set(fs.readdirSync(themeDir(theme, 'backgrounds')).map(f => sha(themeDir(theme, 'backgrounds', f))));
    for (const f of fs.readdirSync(themeDir(base, 'backgrounds'))) assert(!own.has(sha(themeDir(base, 'backgrounds', f))), theme + ' shares no picture with ' + base);
    assert.notEqual(sha(themeDir(theme, 'preview.png')), sha(themeDir(base, 'preview.png')), theme + ' has a preview of its own');
    // the generator's input is what the theme ships
    for (const f of expected[theme]) assert.equal(sha(path.join(root, 'tools', 'glass-backgrounds', theme, f)), sha(themeDir(theme, 'backgrounds', f)), f);
    assert.equal(sha(path.join(root, 'tools', 'glass-backgrounds', theme, 'preview.png')), sha(themeDir(theme, 'preview.png')), theme + ' preview');
  }
});
console.log(checks + ' glass checks passed');
