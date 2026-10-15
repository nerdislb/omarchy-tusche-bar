#!/usr/bin/env node
// Pure decisions of the urgent window frame (UrgentFrame.js) plus static guards
// on the QML. The Qt run with a fake Hyprland is tests/urgent_frame_runtime.py.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = {};
vm.createContext(model);
vm.runInContext(read('UrgentFrame.js').replace('.pragma library', ''), model);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }
const RED = '#b32525';
const set = a => ['hyprctl', 'setprop', 'address:0x' + a, 'inactive_border_color', 'rgba(b32525ff)'];
const unset = a => ['hyprctl', 'setprop', 'address:0x' + a, 'inactive_border_color', 'unset'];
const run = (state, name, data, colour = RED) => plain(model.handle(state, name, data, colour));

test('an urgent window gets the theme colour as its inactive border', () => {
  const r = run(model.initial(), 'urgent', '5a1f3c');
  assert.deepEqual(r.commands, [set('5a1f3c')]);
  assert.deepEqual(r.state.urgent, ['5a1f3c']);
});
test('focusing that window lets its border go; focusing another changes nothing', () => {
  let r = run(model.initial(), 'urgent', '5a1f3c');
  let other = run(r.state, 'activewindowv2', 'aaaa');
  assert.deepEqual(other.commands, []);
  assert.deepEqual(other.state.urgent, ['5a1f3c']);
  r = run(r.state, 'activewindowv2', '5a1f3c');
  assert.deepEqual(r.commands, [unset('5a1f3c')]);
  assert.deepEqual(r.state.urgent, []);
  assert.deepEqual(run(r.state, 'activewindowv2', '5a1f3c').commands, [], 'a second focus has nothing left to undo');
});
test('a closed window is forgotten without a command (it is gone)', () => {
  let r = run(model.initial(), 'urgent', 'abc');
  r = run(r.state, 'closewindow', 'abc');
  assert.deepEqual(r.commands, []);
  assert.deepEqual(r.state.urgent, []);
  assert.deepEqual(run(model.initial(), 'closewindow', 'abc').commands, []);
});
test('a repeated urgent event re-sets the colour once and tracks the window once', () => {
  let r = run(model.initial(), 'urgent', 'abc');
  r = run(r.state, 'urgent', 'ABC');
  assert.deepEqual(r.state.urgent, ['abc']);
  assert.deepEqual(r.commands, [set('abc')]);
});
test('addresses are normalized: the 0x prefix, case and whitespace; anything else is ignored', () => {
  assert.deepEqual(run(model.initial(), 'urgent', '0x5A1F3C').commands, [set('5a1f3c')]);
  assert.deepEqual(run(model.initial(), 'urgent', ' 5a1f3c\n').commands, [set('5a1f3c')]);
  for (const bad of ['', undefined, null, 'zz', '0x', 'not an address', '5a1f3c;rm -rf ~', '$(touch x)', 'a'.repeat(17), '12 34', '-1'])
    assert.deepEqual(run(model.initial(), 'urgent', bad), {state: {urgent: []}, commands: []}, String(bad));
});
test('only a six-digit colour is accepted; the command carries a fixed property and a fixed alpha', () => {
  assert.deepEqual(run(model.initial(), 'urgent', 'a', '#B32525').commands, [set('a')]);
  assert.deepEqual(run(model.initial(), 'urgent', 'a', 'b32525').commands, [set('a')]);
  for (const bad of ['', undefined, null, 'red', '#fff', '#b32525ff', 'rgba(1,2,3,4)', '#b32525; touch x', '#gggggg'])
    assert.deepEqual(plain(model.handle(model.initial(), 'urgent', 'a', bad)), {state: {urgent: []}, commands: []}, String(bad));   // not run(): undefined must stay undefined
});
test('unrelated events do nothing', () => {
  for (const name of ['openwindow', 'workspacev2', 'windowtitle', 'activewindow', '', undefined])
    assert.deepEqual(run(model.initial(), name, 'abc'), {state: {urgent: []}, commands: []}, String(name));
});
test('at most 64 windows are tracked; the oldest is let go when the 65th arrives', () => {
  let state = model.initial(), last;
  for (let i = 1; i <= 64; i++) { last = run(state, 'urgent', i.toString(16)); state = last.state; }
  assert.equal(state.urgent.length, 64);
  last = run(state, 'urgent', 'ffff');
  assert.equal(last.state.urgent.length, 64);
  assert.deepEqual(last.commands, [unset('1'), set('ffff')]);
  assert(!last.state.urgent.includes('1') && last.state.urgent.includes('ffff'));
});
test('release lets every tracked window go and empties the state', () => {
  let r = run(model.initial(), 'urgent', 'a');
  r = run(r.state, 'urgent', 'b');
  const out = plain(model.release(r.state));
  assert.deepEqual(out.commands, [unset('a'), unset('b')]);
  assert.deepEqual(out.state, {urgent: []});
  assert.deepEqual(plain(model.release(null)), {state: {urgent: []}, commands: []});
});
test('a theme switch re-colours the windows that are still urgent', () => {
  let r = run(model.initial(), 'urgent', 'a');
  r = run(r.state, 'urgent', 'b');
  const out = plain(model.recolour(r.state, '#a52323'));
  const redder = a => ['hyprctl', 'setprop', 'address:0x' + a, 'inactive_border_color', 'rgba(a52323ff)'];
  assert.deepEqual(out.commands, [redder('a'), redder('b')]);
  assert.deepEqual(plain(model.recolour(r.state, 'bad')).commands, []);
  assert.deepEqual(plain(model.recolour(model.initial(), '#a52323')).commands, []);
});
test('the reducers never mutate their input', () => {
  const state = Object.freeze({urgent: Object.freeze(['a'])});
  assert.doesNotThrow(() => { model.handle(state, 'urgent', 'b', RED); model.handle(state, 'activewindowv2', 'a', RED); model.release(state); model.recolour(state, RED); });
  assert.deepEqual(plain(state), {urgent: ['a']});
  assert.deepEqual(plain(model.handle(null, 'urgent', 'a', RED).state), {urgent: ['a']});
  assert.deepEqual(plain(model.handle({urgent: 'x'}, 'urgent', 'a', RED).state), {urgent: ['a']});
});

test('the option is a look option, off by default, and survives presets', () => {
  const presets = vm.createContext({});
  vm.runInContext(read('Presets.js'), presets);
  assert.equal(presets.normalizeOptions({}).urgentFrame, 'off');
  assert(plain(presets.LOOK).includes('urgentFrame'));
  assert.equal(presets.layoutDiffers({urgentFrame: 'on'}, {}), false, 'switching it never rebuilds the native bar');
  assert.equal(presets.keepLook(presets.PRESETS[1].options, {urgentFrame: 'on'}).urgentFrame, 'on');
});
test('the QML sets one property of one window per command, through an argv, only while enabled', () => {
  const qml = read('UrgentFrame.qml');
  assert(qml.includes('if (!enabled) return'), 'events are ignored while off');
  assert(qml.includes('target: Hyprland') && qml.includes('enabled: root.enabled'));
  assert(!/Process\b|FileView|repeat:\s*true|Timer/.test(qml), 'no processes, files or timers: purely event driven');
  assert(qml.includes('run(commands[i])'), 'each command goes out as its own argv');
  const engine = read('Engine.qml');
  assert(engine.includes('enabled: root.configLoaded && root.options.urgentFrame === "on"'));
  assert(engine.includes('run: function(argv) { Quickshell.execDetached(argv) }'));
});
console.log(`${passed} urgent frame checks passed`);
