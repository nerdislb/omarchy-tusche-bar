#!/usr/bin/env node
// Pure decisions of the focus seal (FocusSeal.js) and static guards on how the
// window, the face and the engine use them. The pixels are checked by
// tests/focus_seal_runtime.py.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = {};
vm.createContext(model);
vm.runInContext(read('FocusSeal.js').replace('.pragma library', ''), model);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }
const bat = (level, charging = false, present = true) => ({present, level, charging});

test('the seal is calm: no battery line while charging, full, or without a battery', () => {
  for (const b of [bat(0.2, true), bat(0.31), bat(1), bat(0.5, false, false), null, undefined, {}, {present: 'yes'}])
    assert.equal(model.battery(b).line, false, JSON.stringify(b));
  assert.equal(model.state({battery: bat(0.9), urgent: 0}).mark, false);
});
test('the line appears at 30 % and below while discharging, and turns urgent at 15 %', () => {
  assert.deepEqual(plain(model.battery(bat(0.30))), {line: true, fill: 0.3, low: false});
  assert.deepEqual(plain(model.battery(bat(0.16))), {line: true, fill: 0.16, low: false});
  assert.deepEqual(plain(model.battery(bat(0.15))), {line: true, fill: 0.15, low: true});
  assert.deepEqual(plain(model.battery(bat(0))), {line: true, fill: 0, low: true});
  assert.equal(model.battery(bat(0.3000001)).line, false);
});
test('charging calms even a low battery; the level is clamped and junk is zero', () => {
  assert.deepEqual(plain(model.battery(bat(0.05, true))), {line: false, fill: 0.05, low: false});
  assert.equal(model.battery(bat(7)).fill, 1);
  assert.equal(model.battery(bat(-3)).fill, 0);
  assert.equal(model.battery(bat(NaN)).fill, 0);
  assert.equal(model.battery(bat('0.2')).fill, 0.2);
  assert.equal(model.battery(bat(undefined)).fill, 0);
});
test('the square marks an urgent workspace or an urgently low battery, nothing else', () => {
  assert.equal(model.state({battery: bat(0.2), urgent: 0}).mark, false, 'a low-ish line alone is not alarming');
  assert.equal(model.state({battery: bat(0.14), urgent: 0}).mark, true);
  assert.equal(model.state({battery: bat(0.9), urgent: 1}).mark, true);
  assert.equal(model.state({battery: bat(0.9), urgent: 3}).urgent, 3);
  for (const odd of [undefined, null, NaN, -2, 'x', 2.9]) assert.doesNotThrow(() => model.state({urgent: odd}));
  assert.equal(model.state({urgent: -2}).urgent, 0);
  assert.equal(model.state({urgent: 2.9}).urgent, 2);
  assert.deepEqual(plain(model.state(null)), {line: false, fill: 0, low: false, mark: false, urgent: 0});
});
test('the words for assistive technology list battery before workspaces', () => {
  const s = f => model.state(f);
  assert.equal(model.describe(s({battery: bat(0.9), urgent: 0}), 0.9), '');
  assert.equal(model.describe(s({battery: bat(0.25), urgent: 0}), 0.25), 'battery at 25 percent');
  assert.equal(model.describe(s({battery: bat(0.12), urgent: 1}), 0.12), 'battery low at 12 percent, a workspace needs you');
  assert.equal(model.describe(s({battery: bat(0.9), urgent: 2}), 0.9), '2 workspaces need you');
});
test('a click brings the bar back; only the middle button opens the Control Center', () => {
  assert.equal(model.clickAction('primary'), 'show');
  assert.equal(model.clickAction('secondary'), 'show');
  assert.equal(model.clickAction('middle'), 'open');
  assert.equal(model.clickAction(undefined), 'show');
});

test('the window reads public services only and wires clicks through the model', () => {
  const seal = read('FocusSeal.qml');
  assert(/import Quickshell\.Services\.UPower/.test(seal));
  assert(/readonly property var urgentIds: \{\s*var w = visible \? Bridge\.ModuleBus\.pick\("workspaces"\) : null/.test(seal), 'workspaces are read only while the seal shows');
  assert(!/Process|FileView|execDetached|hyprctl/.test(seal), 'no processes of its own');
  assert(seal.includes('mouse.button === Qt.MiddleButton ? "middle" : "primary"'));
  assert(seal.includes('if (Model.clickAction(button) === "open") host.open(\'{"area":"quick"}\')'));
  assert(seal.includes('else host.focusAction("show")'));
  assert(!/focusAction\("start"\)|focusAction\("release"\)/.test(seal), 'the seal only ever brings the bar back');
  assert(/Accessible\.name: "Focus seal\. Show the bar; middle-click opens the Control Center\."/.test(seal));
  assert(seal.includes('WlrLayershell.keyboardFocus: WlrKeyboardFocus.None'));
  assert(seal.includes('exclusionMode: ExclusionMode.Ignore'));
});
test('the engine accepts toggle and maps it onto the existing guarded start and show', () => {
  const engine = read('Engine.qml');
  assert(engine.includes('["start", "show", "release", "toggle"].indexOf(action) < 0'));
  assert(engine.includes('if (action === "toggle") action = edgeBar && edgeBar.barHidden ? "show" : "start"'));
  const toggle = engine.indexOf('if (action === "toggle")');
  assert(toggle < engine.indexOf('if (action === "start" && options.seal !== "on")'), 'toggle becomes start before the seal guard, so it cannot park the bar without a way back');
  assert(engine.includes('function focus(action: string): string { return root.focusAction(action || "start") }'));
});
console.log(`${passed} focus seal checks passed`);
