#!/usr/bin/env node
// Health checks added in round 2: pure facts → check mapping (ControlCenter.js)
// and static guards that the probes behind them only read.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const presets = vm.createContext({});
vm.runInContext(read('Presets.js'), presets);
const watchdog = vm.createContext({});
vm.runInContext(read('Watchdog.js').replace('.pragma library', ''), watchdog);
const cc = vm.createContext({Presets: presets, Watchdog: watchdog});
vm.runInContext(read('ControlCenter.js').replace(/^\.(pragma|import).*$/mg, ''), cc);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }
const check = (facts, id) => plain(cc.healthChecks(facts)).find(c => c.id === id);
const GEN = 'b15c4a797a1b1527', NEW = '0123456789abcdef';

test('every existing check is still reported, and the new ones come with them', () => {
  const ids = cc.healthChecks({}).map(c => c.id);
  for (const id of ['base', 'usage', 'notes', 'cards', 'apply', 'saved']) assert(ids.includes(id), id);
  for (const id of ['generation', 'hypr', 'focus', 'menumodel', 'anchor']) assert(ids.includes(id), id);
  assert(!ids.includes('watchdog'), 'without watchdog facts the row is not shown');
  assert(cc.healthChecks({watchdog: {state: null, enabled: false, now: 0}}).some(c => c.id === 'watchdog'));
});
test('the notification safety net says armed, suspicious or handed back', () => {
  const T = 5000000;
  assert.equal(check({watchdog: {state: watchdog.initial(), enabled: false, now: T}}, 'watchdog').state, 'ok');
  assert.match(check({watchdog: {state: watchdog.initial(), enabled: true, now: T}}, 'watchdog').detail, /Armed/);
  const suspicious = check({watchdog: {state: {...plain(watchdog.initial()), misses: 2}, enabled: true, now: T}}, 'watchdog');
  assert.deepEqual([suspicious.state, /2 of 3/.test(suspicious.detail)], ['issue', true]);
  const back = check({watchdog: {state: {...plain(watchdog.initial()), handedBacks: 1}, enabled: false, now: T}}, 'watchdog');
  assert.deepEqual([back.state, /handed back/.test(back.detail)], ['issue', true]);
});
test('a stale loaded generation is an issue; equal or unknown is not', () => {
  assert.equal(check({generation: {loaded: GEN, installed: GEN}}, 'generation').state, 'ok');
  assert.equal(check({generation: {loaded: '', installed: GEN}}, 'generation').state, 'ok', 'a development checkout has no generation folder');
  const stale = check({generation: {loaded: GEN, installed: NEW}}, 'generation');
  assert.equal(stale.state, 'issue');
  assert(stale.detail.includes(GEN.slice(0, 8)) && stale.detail.includes(NEW.slice(0, 8)));
  assert.equal(check({generation: {loaded: GEN, installed: ''}}, 'generation').state, 'unknown');
  assert.equal(check({}, 'generation').state, 'unknown');
});
test('generation names are read strictly from the code directory and installed-generation.json', () => {
  assert.equal(cc.loadedGeneration('/h/.config/omarchy/plugins/nerdibeard.tusche-bar/generations/' + GEN), GEN);
  assert.equal(cc.loadedGeneration('/h/.config/omarchy/plugins/nerdibeard.tusche-bar/generations/' + GEN + '/'), GEN);
  assert.equal(cc.loadedGeneration('/home/n/src/omarchy-tusche-bar'), '');
  assert.equal(cc.loadedGeneration('/p/generations/../etc'), '');
  assert.equal(cc.pluginRoot('/h/plugins/x/generations/' + GEN), '/h/plugins/x');
  assert.equal(cc.pluginRoot('/home/n/src/bar'), '/home/n/src/bar');
  assert.equal(cc.generationOf(JSON.stringify({generation: GEN, files: 71})), GEN);
  for (const bad of ['', 'not json', '{}', '{"generation":"../x"}', '{"generation":5}', '{"generation":"ZZZZZZZZZZ"}', 'null']) assert.equal(cc.generationOf(bad), '', bad);
});
test('Hyprland data: native is fine, the snapshot is expected here, nothing at all is an issue', () => {
  assert.equal(check({hypr: 'unused'}, 'hypr').state, 'ok');
  assert.equal(check({hypr: 'native'}, 'hypr').state, 'ok');
  const snap = check({hypr: 'snapshot'}, 'hypr');
  assert.deepEqual([snap.state, /expected/.test(snap.detail)], ['ok', true]);
  assert.equal(check({hypr: 'missing'}, 'hypr').state, 'issue');
  assert.equal(check({}, 'hypr').state, 'unknown');
});
test('focus mode: visible, hidden by you, parked by focus mode, and a broken record', () => {
  assert.equal(check({focus: null}, 'focus').state, 'unknown');
  assert.match(check({focus: {hidden: false, owned: false}}, 'focus').detail, /visible/);
  const own = check({focus: {hidden: true, owned: true}}, 'focus');
  assert.deepEqual([own.state, /Focus mode is on/.test(own.detail)], ['ok', true]);
  const yours = check({focus: {hidden: true, owned: false}}, 'focus');
  assert.deepEqual([yours.state, /not by focus mode/.test(yours.detail)], ['ok', true]);
  const broken = check({focus: {error: true}}, 'focus');
  assert.deepEqual([broken.state, /unreadable/.test(broken.detail)], ['issue', true]);
});
test('focus-mode.py status output is parsed strictly', () => {
  assert.deepEqual(plain(cc.focusFacts(0, '{"hidden": true, "owned": true, "changed": false}')), {hidden: true, owned: true, error: false});
  assert.deepEqual(plain(cc.focusFacts(0, '{"hidden": false, "owned": false, "changed": false}')), {hidden: false, owned: false, error: false});
  for (const bad of [[1, ''], [1, '{"hidden": false}'], [0, 'not json'], [0, '0'], [0, '{}'], [0, '{"hidden":"yes"}'], [0, 'null']])
    assert.deepEqual(plain(cc.focusFacts(...bad)), {error: true}, JSON.stringify(bad));
});
test('menu model: identical, drifted and not comparable', () => {
  assert.equal(cc.menuModelFacts(0), 'same');
  assert.equal(cc.menuModelFacts(1), 'different');
  assert.equal(cc.menuModelFacts(2), 'missing');
  assert.equal(cc.menuModelFacts(127), 'missing');
  assert.equal(check({menuModel: 'same'}, 'menumodel').state, 'ok');
  const drift = check({menuModel: 'different'}, 'menumodel');
  assert.deepEqual([drift.state, /vendor\/README\.md/.test(drift.detail)], ['issue', true]);
  assert.equal(check({menuModel: 'missing'}, 'menumodel').state, 'ok');
  assert.equal(check({}, 'menumodel').state, 'unknown');
});
test('the centre anchor must be a centre widget; a renamed island is recognised and named', () => {
  const layout = center => ({bar: {centerAnchor: 'nerdibeard.amiga-island', layout: {left: [], center, right: []}}});
  const stale = plain(cc.anchorFacts(layout(['omarchy.indicators', {id: 'nerdibeard.tusche-island', agents: true}, 'omarchy.weather'])));
  assert.deepEqual([stale.anchor, stale.suggest], ['nerdibeard.amiga-island', 'nerdibeard.tusche-island']);
  const bad = check({anchor: stale}, 'anchor');
  assert.equal(bad.state, 'issue');
  assert(bad.detail.includes('nerdibeard.amiga-island') && bad.detail.includes('set it to nerdibeard.tusche-island'));
  const fine = plain(cc.anchorFacts({bar: {centerAnchor: 'nerdibeard.tusche-island', layout: {center: [{id: 'nerdibeard.tusche-island'}]}}}));
  assert.equal(check({anchor: fine}, 'anchor').state, 'ok');
  assert.equal(check({anchor: plain(cc.anchorFacts({bar: {layout: {center: ['omarchy.clock']}}}))}, 'anchor').state, 'ok', 'no anchor set is a valid choice');
  const other = plain(cc.anchorFacts({bar: {centerAnchor: 'omarchy.clock', layout: {center: ['omarchy.weather']}}}));
  assert.deepEqual([other.suggest, check({anchor: other}, 'anchor').state], ['', 'issue'], 'no guess for a non-island anchor');
  for (const odd of [null, {}, {bar: null}, {bar: {centerAnchor: 5}}, {bar: {layout: {center: 'x'}}}]) assert.doesNotThrow(() => cc.anchorFacts(odd));
});
test('the new probes only read: a status call, a byte comparison and a file print', () => {
  const qml = read('ControlCenter.qml');
  const probe = id => { const m = new RegExp('id: ' + id + '\\n\\s+command: (\\[[^\\n]*\\])').exec(qml); assert(m, id); return m[1]; };
  assert.match(probe('focusProbe'), /^\["python3", win\.codeDir \+ "\/bin\/focus-mode\.py", "status"\]$/);
  assert.match(probe('menuProbe'), /^\["cmp", "-s", win\.codeDir \+ "\/vendor\/MenuModel\.js", win\.omarchyRoot \+ "\/shell\/plugins\/menu\/MenuModel\.js"\]$/);
  assert.match(probe('generationProbe'), /^\["cat", CC\.pluginRoot\(win\.codeDir\) \+ "\/installed-generation\.json"\]$/);
  assert(!/"(start|show|release)"/.test(qml.slice(qml.indexOf('id: focusProbe'), qml.indexOf('id: menuProbe'))), 'never a focus action');
  assert(qml.includes('Nothing here changes anything.'));
});
console.log(`${passed} health checks passed`);
