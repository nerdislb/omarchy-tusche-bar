// Black-box compatibility with Omarchy's centre box and tray drawer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/^\.(?:pragma|import).*$/gm, '');
const p = vm.createContext({}); vm.runInContext(read('Presets.js'), p);
const plain = x => JSON.parse(JSON.stringify(x));
const island = {id:'nerdibeard.tusche-island', bluetooth:true, notifications:true};
const base = {left:['omarchy.menu','omarchy.workspaces'], centerBegin:['omarchy.elsewhen'],
  center:[island], centerEnd:['omarchy.weather'],
  right:['omarchy.audio','omamail'], tray:[{id:'omarchy.tailscale', custom:42},'nerdibeard.ai-usage'],
  future:[{id:'third-party',keep:{a:true}}], metadata:{keep:true}};
const before = JSON.stringify(base);
for (const preset of p.PRESETS) {
  const built = p.build(base, preset.options, '/plugin/modules');
  assert.deepEqual(plain(built.center), [island]);
  assert.deepEqual(plain(built.centerBegin), base.centerBegin);
  assert.deepEqual(plain(built.future), base.future);
  assert.deepEqual(plain(built.metadata), base.metadata);
  assert(built.right.some(e => p.entryId(e) === 'omamail'));
  if (preset.id === 'today') assert.deepEqual(plain(built), base);
  else {
    assert(built.centerEnd.some(e => p.entryId(e) === 'tusche.centre'));
    assert(built.tray.some(e => p.entryId(e) === 'tusche.quota'));
  }
}
assert.equal(JSON.stringify(base), before, 'source untouched');
const current = p.build(base, p.presetById('tidy').options, '/plugin/modules');
current.right.find(e => e.id === 'tusche.status').embeds['omarchy.tailscale'].custom = 99;
current.right.unshift({id:'new-native-plugin', options:{keep:true}});
current.centerBegin.push({id:'new-side-widget', setting:'kept'});
const merged = p.mergeEmbeddedSettings(base, current);
const restored = p.build(merged, p.presetById('today').options, '/plugin/modules');
assert.equal(restored.tray.find(e => e.id === 'omarchy.tailscale').custom, 99);
assert.equal(restored.right[0].id, 'new-native-plugin');
assert.deepEqual(plain(restored.centerBegin.at(-1)), {id:'new-side-widget', setting:'kept'});
assert.equal(restored.right.filter(e => e.id === 'new-native-plugin').length, 1);
assert.deepEqual(plain(p.mergeEmbeddedSettings(merged, current)), plain(merged), 'merge is idempotent');
const recovered = p.reconstructBase(current);
assert(recovered.tray.some(e => p.entryId(e) === 'nerdibeard.ai-usage'));
assert.deepEqual(plain(recovered.future), base.future);
assert(!p.hasOwn(recovered));
assert(p.hasOwn({tray:[{id:'tusche.quota'}]}), 'own modules recognised outside old sections');
const cc = vm.createContext({Presets:p, Watchdog:{}}); vm.runInContext(read('ControlCenter.js'), cc);
const ann = vm.createContext({}); vm.runInContext(read('Announce.js'), ann);
const centre = cc.healthChecks({anchor:cc.anchorFacts({bar:{layout:base}})}).find(c => c.id === 'anchor');
assert.equal(centre.state, 'ok');
assert(centre.detail.includes('centre box') && centre.detail.includes(island.id));
for (const section of ['centerBegin','centerEnd','tray']) {
  const config = {bar:{layout:{[section]:[island]}}};
  assert.deepEqual(plain(cc.islandEntry(config)), island, 'CC finds island in '+section);
  assert(ann.islandShowsBluetooth(config), 'avoid double Bluetooth announcement in '+section);
}
console.log('PASS: all presets preserve six sections, future sections and metadata; native additions and folded settings round-trip; recovery and island discovery');
