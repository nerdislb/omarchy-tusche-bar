#!/usr/bin/env node
// Control Center → Extras: live state, availability, staging, Use/Cancel plans
// and the health row (ControlCenter.js). bin/full-width.py has its own test
// (tests/full_width.py).
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

const SHEET = 'nerdibeard.shortcut-sheet';
const config = (sheetListed) => ({plugins: [{id: 'nerdibeard.tusche-bar'}].concat(sheetListed ? [{id: SHEET}] : []),
                                   bar: {layout: {left: [], center: [], right: []}}});
const facts = (fullWidth, sheetInstalled) => ({fullWidth, sheetInstalled});

test('the extras live in Windows and Input & keys; the old Extras name opens Windows', () => {
  assert.equal(cc.setting('extras.fullWidth').area, 'windows');
  assert.equal(cc.setting('extras.sheet').area, 'input');
  assert.ok(cc.isArea('extras'));
  assert.equal(cc.resolveArea('extras'), 'windows');
  assert.deepEqual(plain(cc.areaRows('windows', {extras: {fullWidth: 'edge', sheet: 'on'}}).filter(r => r.kind === 'row' && r.id.indexOf('extras.') === 0)),
                   [{kind: 'row', id: 'extras.fullWidth'}]);
});

test('live state: unread facts leave the domain out; the sheet follows shell.json', () => {
  assert.equal(cc.liveState({}, config(true), 'disabled').extras, null);
  assert.deepEqual(plain(cc.liveState({}, config(true), 'disabled', facts('edge', true)).extras), {fullWidth: 'edge', sheet: 'on'});
  assert.deepEqual(plain(cc.liveState({}, config(false), 'disabled', facts('gaps', true)).extras), {fullWidth: 'gaps', sheet: 'off'});
  assert.deepEqual(plain(cc.liveState({}, config(true), 'disabled', facts('', false)).extras), {fullWidth: 'unknown', sheet: 'missing'});
  assert.deepEqual(plain(cc.liveState({}, config(true), 'disabled', facts('nonsense', null)).extras), {fullWidth: 'unknown', sheet: 'unknown'});
  assert.equal(cc.liveState({}, config(true), 'disabled', facts('error', true)).extras.fullWidth, 'error');
});

test('only known, valid values can be staged', () => {
  const live = cc.liveState({}, config(false), 'disabled', facts('edge', true));
  assert(cc.available(live, 'extras.fullWidth') && cc.available(live, 'extras.sheet'));
  assert.deepEqual(plain(cc.stage({}, live, 'extras.fullWidth', 'gaps')), {'extras.fullWidth': 'gaps'});
  assert.deepEqual(plain(cc.stage({}, live, 'extras.fullWidth', 'edge')), {}, 'the live value is no edit');
  assert.deepEqual(plain(cc.stage({}, live, 'extras.fullWidth', 'sideways')), {}, 'unknown values are refused');
  const missing = cc.liveState({}, config(false), 'disabled', facts('error', false));
  assert(!cc.available(missing, 'extras.sheet') && !cc.available(missing, 'extras.fullWidth'));
  assert.deepEqual(plain(cc.stage({}, missing, 'extras.sheet', 'on')), {});
  assert.deepEqual(plain(cc.stage({}, missing, 'extras.fullWidth', 'edge')), {});
  // Other domains keep their old availability.
  assert(cc.available(live, 'bar.edge'));
  assert(!cc.available(cc.liveState({}, {}, ''), 'cards.override'));
});

test('Use runs the extras after the card picker and before the bar', () => {
  const live = cc.liveState({edge: 'none'}, config(false), 'enabled', facts('edge', true));
  let edits = cc.stage({}, live, 'bar.edge', 'theme');
  edits = cc.stage(edits, live, 'extras.sheet', 'on');
  edits = cc.stage(edits, live, 'cards.override', 'disabled');
  edits = cc.stage(edits, live, 'extras.fullWidth', 'gaps');
  const steps = plain(cc.plan(edits, live));
  assert.deepEqual(steps.map(s => s.domain + ':' + (s.key || '')), ['cards:override', 'extras:fullWidth', 'extras:sheet', 'bar:']);
  assert.deepEqual(steps[1], {domain: 'extras', key: 'fullWidth', value: 'gaps'});
  // After Use the applied extras drop out of the staged edits.
  const after = cc.liveState({edge: 'theme'}, config(true), 'disabled', facts('gaps', true));
  assert.deepEqual(plain(cc.prune(edits, after)), {});
});

test('Cancel restores only the extras Use touched, and only when it can', () => {
  const snapshot = cc.copy(cc.liveState({}, config(false), 'disabled', facts('edge', true)));
  const after = cc.liveState({}, config(true), 'disabled', facts('gaps', true));
  assert.deepEqual(plain(cc.revertPlan(snapshot, after, {})), []);
  assert.deepEqual(plain(cc.revertPlan(snapshot, after, {extras: true})),
    [{domain: 'extras', key: 'fullWidth', value: 'edge'}, {domain: 'extras', key: 'sheet', value: 'off'}]);
  // A plugin removed meanwhile is not switched back on; an unknown snapshot value is not restored.
  const gone = cc.liveState({}, config(true), 'disabled', facts('gaps', false));
  assert.deepEqual(plain(cc.revertPlan(snapshot, gone, {extras: true}).map(s => s.key)), ['fullWidth']);
  const blind = cc.copy(cc.liveState({}, config(false), 'disabled', facts('', null)));
  assert.deepEqual(plain(cc.revertPlan(blind, after, {extras: true})), []);
});

test('search finds the extras by label and value', () => {
  const live = cc.liveState({}, config(true), 'disabled', facts('edge', true));
  const index = cc.searchIndex(live, {}, []);
  assert.equal(cc.search(index, 'full width')[0].id, 'extras.fullWidth');
  assert.equal(cc.search(index, 'edge to edge')[0].id, 'extras.fullWidth');
  assert.equal(cc.search(index, 'shortcut')[0].id, 'extras.sheet');
  assert.equal(cc.search(index, 'extras').length, 2);
});

test('the health row reports the extras from facts only', () => {
  const row = f => plain(cc.healthChecks(f)).find(c => c.id === 'extras');
  assert.equal(row({}), undefined, 'without extras facts the row is not shown');
  assert.equal(row({extras: null}).state, 'unknown');
  assert.equal(row({extras: {fullWidth: 'unknown', sheet: 'on'}}).state, 'unknown');
  assert.equal(row({extras: {fullWidth: 'error', sheet: 'on'}}).state, 'issue');
  const ok = row({extras: {fullWidth: 'edge', sheet: 'missing'}});
  assert.equal(ok.state, 'ok');
  assert.match(ok.detail, /edge to edge/);
  assert.match(ok.detail, /not installed/);
  assert.equal(cc.healthSummary(cc.healthChecks({extras: {fullWidth: 'gaps', sheet: 'off'}})).issues >= 0, true);
});

console.log(passed + ' extras checks passed');
