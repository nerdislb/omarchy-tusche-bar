#!/usr/bin/env node
// Pure model checks for the device announcements (Announce.js) plus static
// guards on how Announcer.qml and the engine use it. The native Qt run is
// tests/announce_runtime.py.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = {};
vm.createContext(model);
vm.runInContext(read('Announce.js').replace('.pragma library', ''), model);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }
const output = (id = 'speakers', name = 'Speakers') => ({ready: true, id, name});
const bluetooth = (devices = [], on = true, id = 'hci0') => ({ready: true, id, devices: devices.map(d => typeof d === 'string' ? {id: d, name: d} : d), on});
const disconnected = name => ({id: name, name, connected: false});
const sample = (state, channel, value, at = 1000, suppressed = false) => model.observe(state, channel, value, at, suppressed);
function ready(channel, value, at = channel === 'bluetooth' ? -4000 : 0) { return sample(model.initial(true), channel, value, at); }

test('disabled means no baselines and no hint', () => {
  const state = sample(model.initial(false), 'output', output(), 1000);
  assert.deepEqual(plain(state), {enabled: false, channels: {}, hint: null, seq: 0});
});
test('every channel starts silently, including sources that arrive much later', () => {
  let state = model.initial(true);
  state = sample(state, 'output', output(), 1000);
  state = sample(state, 'bluetooth', {ready: false}, 2000);
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 90000);
  assert.equal(state.hint, null);
  assert.equal(state.channels.bluetooth.settleUntil, 90000 + model.BLUETOOTH_SETTLE_MS);
});
test('an output change names the new device once it is past the settle window', () => {
  let state = ready('output', output('speakers', 'Built-in Audio'));
  state = sample(state, 'output', output('buds', 'Pixel Buds'), model.SETTLE_MS - 1);
  assert.equal(state.hint, null, 'inside the settle window it is only the baseline');
  state = sample(state, 'output', output('headset', 'WH-1000XM5'), model.SETTLE_MS);
  assert.deepEqual(plain(state.hint), {seq: 1, kind: 'output', icon: 'volume-high', text: 'WH-1000XM5'});
});
test('renaming the same output, or reading it again, is not news', () => {
  let state = ready('output', output('speakers', 'Built-in Audio'));
  state = sample(state, 'output', output('speakers', 'Speakers'), 1000);
  state = sample(state, 'output', output('speakers', 'Speakers'), 1100);
  assert.equal(state.hint, null);
  assert.equal(state.seq, 0);
});
test('each announcement gets its own sequence number; repeats do not', () => {
  let state = ready('output', output('a', 'A'));
  state = sample(state, 'output', output('b', 'B'), 1000);
  state = sample(state, 'output', output('b', 'B'), 1100);
  assert.equal(state.hint.seq, 1);
  state = sample(state, 'output', output('c', 'C'), 1200);
  assert.deepEqual([state.hint.seq, state.hint.text], [2, 'C']);
});
test('losing the output clears that source only and its return begins silently', () => {
  let state = ready('output', output('a', 'A'));
  state = sample(state, 'output', {ready: false}, 1000);
  assert.equal(state.channels.output, undefined);
  state = sample(state, 'output', output('b', 'B'), 10000);
  assert.equal(state.hint, null);
});
test('invalid readings never become hints or baselines', () => {
  for (const bad of [undefined, null, {}, {ready: false}, {ready: true}, {ready: true, id: '', name: 'x'}, {ready: true, id: '\u0001 \u007f'}]) {
    const state = sample(ready('output', output()), 'output', bad, 1000);
    assert.equal(state.hint, null);
    assert.equal(state.channels.output, undefined);
  }
});
test('Bluetooth connects and disconnects carry the changed device name', () => {
  let state = ready('bluetooth', bluetooth([disconnected('Buds')]));
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 1000);
  assert.deepEqual([state.hint.text, state.hint.icon], ['Connected · Buds', '\u{f00b1}']);
  state = sample(state, 'bluetooth', bluetooth(), 1100);
  assert.deepEqual([state.hint.text, state.hint.icon], ['Disconnected · Buds', '\u{f00b2}']);
});
test('late BlueZ objects already connected establish silent per-device baselines', () => {
  let state = ready('bluetooth', bluetooth());
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 20000);
  assert.equal(state.hint, null);
  state = sample(state, 'bluetooth', bluetooth([disconnected('Buds')]), 21000);
  assert.equal(state.hint.text, 'Disconnected · Buds');
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 22000);
  assert.equal(state.hint.text, 'Connected · Buds');
});
test('Bluetooth readiness allows its native four-second enumeration burst', () => {
  let state = ready('bluetooth', bluetooth([disconnected('Buds')]), 0);
  state = sample(state, 'bluetooth', bluetooth(['Buds']), model.BLUETOOTH_SETTLE_MS - 1);
  assert.equal(state.hint, null);
  state = sample(state, 'bluetooth', bluetooth([disconnected('Buds')]), model.BLUETOOTH_SETTLE_MS);
  assert.equal(state.hint.text, 'Disconnected · Buds');
});
test('Bluetooth reordering and friendly-name updates do not announce reconnection', () => {
  let state = ready('bluetooth', bluetooth(['Buds', 'Mouse']));
  state = sample(state, 'bluetooth', bluetooth(['Mouse', 'Buds']), 1000);
  assert.equal(state.hint, null);
  state = sample(state, 'bluetooth', bluetooth([{id: 'Mouse', name: 'New name'}, 'Buds']), 1100);
  assert.equal(state.hint, null);
});
test('the Bluetooth radio switching wins over the disconnect churn; a new adapter stays quiet', () => {
  let state = ready('bluetooth', bluetooth(['Buds', 'Mouse']));
  state = sample(state, 'bluetooth', bluetooth([], false), 1000);
  assert.deepEqual([state.hint.text, state.hint.icon], ['Bluetooth off', '\u{f00b2}']);
  state = sample(state, 'bluetooth', bluetooth(['Mouse'], false), 1100);
  assert.equal(state.hint.seq, 1, 'churn while the radio is off adds nothing');
  state = sample(state, 'bluetooth', bluetooth(['Mouse'], true, 'hci1'), 10000);
  assert.equal(state.hint.seq, 1, 'another adapter is a new baseline');
  state = sample(state, 'bluetooth', bluetooth(['Mouse'], false, 'hci1'), 10100);
  assert.deepEqual([state.hint.seq, state.hint.text], [2, 'Bluetooth off']);
  state = sample(state, 'bluetooth', bluetooth(['Mouse'], true, 'hci1'), 10200);
  assert.deepEqual([state.hint.seq, state.hint.text, state.hint.icon], [3, 'Bluetooth on', '\u{f00af}']);
});
test('simultaneous device transitions summarize the final connected count', () => {
  let state = ready('bluetooth', bluetooth(['Old buds', disconnected('New buds'), disconnected('Mouse')]));
  state = sample(state, 'bluetooth', bluetooth(['New buds', 'Mouse']), 1000);
  assert.equal(state.hint.text, '2 devices connected');
  state = sample(state, 'bluetooth', bluetooth(['Other buds']), 1100);
  assert.equal(state.hint.text, '1 device connected');
});
test('a channel somebody else shows keeps its baseline moving without replaying later', () => {
  let state = ready('bluetooth', bluetooth([disconnected('Buds')]));
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 1000, true);
  assert.equal(state.hint, null);
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 1100, false);
  assert.equal(state.hint, null, 'the connection that happened meanwhile is not announced afterwards');
  state = sample(state, 'bluetooth', bluetooth(), 1200, false);
  assert.equal(state.hint.text, 'Disconnected · Buds');
});
test('disable and re-enable discard the old line and give every source a fresh baseline', () => {
  let state = sample(ready('output', output('a', 'A')), 'output', output('b', 'B'), 1000);
  assert.equal(state.seq, 1);
  state = model.configure(state, false);
  assert.deepEqual(plain(state), {enabled: false, channels: {}, hint: null, seq: 0});
  state = model.configure(state, true);
  state = sample(state, 'output', output('c', 'C'), 9000);
  assert.equal(state.hint, null);
});
test('device names are one plain bounded line: markup, control characters and length are removed', () => {
  let state = ready('bluetooth', bluetooth([{id: 'safe', name: 'Buds', connected: false}]));
  state = sample(state, 'bluetooth', bluetooth([{id: 'safe', name: '<img src="https://example.invalid/t">\n\u001b[1m Buds'}]), 1000);
  assert(!/[<>\n\r\u001b]/.test(state.hint.text), state.hint.text);
  assert(state.hint.text.startsWith('Connected · '));
  assert(model.clean('x'.repeat(10000)).length <= model.MAX_TEXT);
  assert.equal(model.clean('', 'fallback'), 'fallback');
  assert.equal(model.clean(undefined), '');
});
test('device collections are bounded, deduplicated and prototype-shaped ids remain data', () => {
  const devices = [{id: '__proto__', name: 'Safe'}, {id: '__proto__', name: 'Duplicate'}, ...Array.from({length: 1000}, (_, i) => ({id: String(i), name: 'n'}))];
  const value = model.normalized('bluetooth', {ready: true, on: true, devices});
  assert.equal(value.devices.filter(d => d.id === '__proto__').length, 1);
  assert(value.devices.length <= 64);
});
test('reducers do not mutate previous snapshots or caller-owned samples', () => {
  const value = Object.freeze(output());
  const state = ready('output', value);
  const before = JSON.stringify(state);
  Object.freeze(state.channels.output.value);
  Object.freeze(state.channels.output);
  Object.freeze(state.channels);
  Object.freeze(state);
  sample(state, 'output', Object.freeze(output('other', 'Other')), 1000);
  assert.equal(JSON.stringify(state), before);
});
test('unknown channels and bad clocks leave the state alone', () => {
  const state = ready('output', output());
  assert.equal(sample(state, 'brightness', {ready: true, percent: 50}, 1000), state);
  assert.equal(model.observe(state, 'output', output('b'), NaN, false), state);
  assert.equal(model.observe(state, 'output', output('b'), '1000', false), state);
});

test('a waiting line is only still true while its source is there', () => {
  let state = ready('output', output('a', 'A'));
  state = sample(state, 'output', output('b', 'B'), 1000);
  assert.equal(model.stillTrue(state, state.hint), true);
  const gone = sample(state, 'output', {ready: false}, 1100);
  assert.equal(model.stillTrue(gone, state.hint), false, 'the output disappeared');
  assert.equal(model.stillTrue(model.configure(state, false), state.hint), false, 'announcements are off');
  for (const bad of [null, undefined, {}, {kind: 'nothing'}]) assert.equal(model.stillTrue(state, bad), false, JSON.stringify(bad));
  assert.equal(model.stillTrue(null, state.hint), false);
  const other = sample(state, 'bluetooth', bluetooth(['Buds']), 1200);
  assert.equal(model.stillTrue(other, state.hint), true, 'another channel coming does not matter');
});
test('the gate lets one line through per gap; a waiting line is replaced by a newer one', () => {
  const hint = n => ({seq: n, kind: 'output', icon: 'volume-high', text: 'D' + n});
  let g = null, r = model.gate(g, hint(1), 10000);
  assert.deepEqual([r.emit.seq, r.delay], [1, 0]);
  g = r.state;
  r = model.gate(g, hint(2), 10200);
  assert.equal(r.emit, null);
  assert.equal(r.delay, model.MIN_GAP_MS - 200);
  g = r.state;
  r = model.gate(g, hint(3), 10400);
  assert.equal(r.emit, null, 'still inside the gap');
  assert.equal(r.state.pending.seq, 3, 'the newer line replaced the waiting one');
  g = r.state;
  r = model.release(g, 10000 + model.MIN_GAP_MS - 1);
  assert.equal(r.emit, null);
  assert.equal(r.delay, 1);
  r = model.release(g, 10000 + model.MIN_GAP_MS);
  assert.equal(r.emit.seq, 3);
  assert.equal(r.state.pending, null);
  assert.equal(model.release(r.state, 99999).emit, null);
});
test('a quiet gap re-arms the gate and an empty hint changes nothing', () => {
  const hint = {seq: 1, kind: 'bluetooth', icon: 'x', text: 'T'};
  let r = model.gate(null, hint, 0);
  r = model.gate(r.state, {...hint, seq: 2}, model.MIN_GAP_MS + 1);
  assert.equal(r.emit.seq, 2);
  const kept = model.gate(r.state, null, 5);
  assert.deepEqual([kept.emit, kept.delay], [null, 0]);
  assert.equal(kept.state, r.state);
});
test('the OSD command line is a plain argv: a hostile name stays one element', () => {
  const text = '$(touch /tmp/x) `id` "q" \'s\' ; rm -rf ~';
  assert.deepEqual(plain(model.argv({icon: 'volume-high', text})),
    ['omarchy-osd', '-i', 'volume-high', '-m', text, '-d', String(model.DURATION_MS)]);
});
test('the island is taken to show Bluetooth unless it is off, disabled or not configured', () => {
  const id = 'nerdibeard.tusche-island';
  assert.equal(model.islandShowsBluetooth(null), false);
  assert.equal(model.islandShowsBluetooth({bar: {layout: {center: ['omarchy.clock']}}}), false);
  assert.equal(model.islandShowsBluetooth({bar: {layout: {center: [id]}}}), true);
  assert.equal(model.islandShowsBluetooth({bar: {layout: {center: [{id, bluetooth: true}]}}}), true);
  assert.equal(model.islandShowsBluetooth({bar: {layout: {center: [{id, volume: true}]}}}), true, 'the default is on');
  assert.equal(model.islandShowsBluetooth({bar: {layout: {center: [{id, bluetooth: false}]}}}), false);
  assert.equal(model.islandShowsBluetooth({bar: {layout: {center: [{id, enabled: false}]}}}), false);
  assert.equal(model.islandShowsBluetooth({plugins: [{id, bluetooth: false}], bar: {layout: {}}}), false);
  assert.equal(model.islandShowsBluetooth({plugins: [{id}], disabledPlugins: [id]}), false);
});

test('Announcer observes only public services, never polls, and goes through the engine\'s emit', () => {
  const announcer = read('Announcer.qml');
  assert(/import Quickshell\.Bluetooth/.test(announcer) && /import Quickshell\.Services\.Pipewire/.test(announcer));
  assert(!/repeat:\s*true/.test(announcer), 'no repeating timer');
  assert(!/Process\b|FileView|Hyprland|slotsIn|activeItem|lastIpcObject/.test(announcer), 'no processes, widget internals or compositor reads');
  assert(announcer.includes('Announce.argv('), 'the command line comes from the model');
  assert((announcer.match(/Announce\.stillTrue\(/g) || []).length === 2, 'a waiting line is re-checked when the source changes and when its turn comes');
  const engine = read('Engine.qml');
  assert(engine.includes('options.statusHints === "on"'));
  assert(engine.includes('emit: function(argv) { Quickshell.execDetached(argv) }'), 'a plain argv, no shell');
});
test('the bar module carries no announcement code any more', () => {
  const status = read('modules/Status.qml');
  assert(!/hint|slotsIn|activeItem|volumeSink|monitor\.refresh|hintMonitor/i.test(status), 'no announcement code and no reach into native widgets');
  assert(!fs.existsSync(path.join(root, 'modules/StatusHint.qml')));
  assert(!fs.existsSync(path.join(root, 'StatusHints.js')));
});
console.log(`${passed} announcement checks passed`);
