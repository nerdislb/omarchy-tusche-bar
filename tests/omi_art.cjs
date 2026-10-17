#!/usr/bin/env node
// OmiArt.js: the modes a face maps to, the speech bubble and the battery, as rectangles.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const art = {};
vm.createContext(art);
vm.runInContext(fs.readFileSync(path.join(root, 'OmiArt.js'), 'utf8').replace('.pragma library', ''), art);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }
const inView = r => r.x >= art.VIEW.x && r.y >= art.VIEW.y && r.x + r.w <= art.VIEW.x + art.VIEW.w && r.y + r.h <= art.VIEW.y + art.VIEW.h;
const onGrid = r => [r.x, r.y, r.w, r.h].every(v => Number.isInteger(v / art.CELL));
const covers = (rects, x, y) => rects.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

const pack = ['logo', 'idle', 'thinking', 'working', 'listening', 'warning', 'low-battery', 'angry', 'skeptical', 'sleeping'];

test('every face has a mode in the pack', () => {
  const want = {calm: 'idle', working: 'working', waiting: 'listening', attention: 'warning', drained: 'low-battery', alert: 'angry', battery: 'logo'};
  for (const [face, mode] of Object.entries(want)) assert.equal(art.modeFor(face, pack), mode, face);
});
test('a pack that dropped a mode falls back, ending at idle and the bare logo', () => {
  assert.equal(art.modeFor('alert', pack.filter(m => m !== 'angry')), 'warning');
  assert.equal(art.modeFor('alert', ['idle', 'logo']), 'idle');
  assert.equal(art.modeFor('drained', pack.filter(m => m !== 'low-battery')), 'sleeping');
  assert.equal(art.modeFor('alert', ['logo']), 'logo');
  assert.equal(art.modeFor('alert', null), 'logo');
  assert.equal(art.modeFor('nonsense', pack), 'idle');
  assert.equal(art.fallbackMode('alert'), 'angry');
});
test('the bubble sits inside the view, on the grid, at its top right', () => {
  for (const n of [1, 7, 9, 10, 21, 99]) {
    const b = art.bubble(n);
    for (const r of [b.body].concat(b.tail, b.digits)) { assert(inView(r), n + ' ' + JSON.stringify(r)); assert(onGrid(r), n + ' ' + JSON.stringify(r)); }
    assert.equal(b.body.x + b.body.w, art.EDGE.right, 'flush with the right edge');
    assert.equal(b.body.y, art.EDGE.top, 'flush with the top');
  }
});
test('one digit makes a narrow bubble, two a wider one; counts are clamped to 1..99', () => {
  assert.equal(art.bubble(5).body.w, 5 * art.CELL);
  assert.equal(art.bubble(42).body.w, 9 * art.CELL);
  assert.equal(art.bubble(400).text, '99');
  assert.equal(art.bubble(0).text, '1');
  assert.equal(art.bubble(NaN).text, '1');
  assert.equal(art.bubble(7.9).text, '7');
});
test('the digits are cut from inside the body and read as the number', () => {
  const b = art.bubble(10);
  for (const r of b.digits) {
    assert(r.x >= b.body.x + art.CELL && r.x + r.w <= b.body.x + b.body.w - art.CELL, 'padding left and right');
    assert(r.y >= b.body.y + art.CELL && r.y + r.h <= b.body.y + b.body.h - art.CELL, 'padding above and below');
  }
  // sample "1" and "0": the 0 is a ring, the 1 has its stem in the middle column
  const x1 = b.body.x + art.CELL, x0 = b.body.x + 5 * art.CELL, y = b.body.y + art.CELL;
  assert.equal(covers(b.digits, x1 + art.CELL, y + 2 * art.CELL), true, 'the stem of the 1');
  assert.equal(covers(b.digits, x0 + art.CELL, y + 2 * art.CELL), false, 'the hole of the 0');
  assert.equal(covers(b.digits, x0, y + 2 * art.CELL), true, 'the wall of the 0');
  const sum = a => a.reduce((n, r) => n + r.w * r.h, 0);
  assert.equal(sum(b.digits), (8 + 12) * art.CELL * art.CELL, 'a 1 is eight cells, a 0 twelve');
});
test('every digit 0-9 has its own 3 x 5 shape', () => {
  assert.equal(new Set(Object.values(art.DIGITS).map(rows => rows.join('/'))).size, 10);
  for (const rows of Object.values(art.DIGITS)) { assert.equal(rows.length, 5); assert(rows.every(r => /^[01]{3}$/.test(r))); }
});
test('the battery sits in the logo\'s frame, on the grid, and fills cell by cell', () => {
  for (let n = 0; n <= 4; n++) {
    const b = art.battery(n);
    assert.equal(b.fill.length, n);
    for (const r of b.outline.concat(b.fill)) { assert(onGrid(r)); assert(r.x >= 60 && r.x + r.w <= 240 && r.y >= 60 && r.y + r.h <= 240, JSON.stringify(r)); }
  }
  assert.equal(art.battery(9).fill.length, 4);
  assert.equal(art.battery(-1).fill.length, 0);
  const b = art.battery(1);
  assert.equal(covers(b.outline.concat(b.fill), 110, 150), true, 'the filled cell');
  assert.equal(covers(b.outline.concat(b.fill), 150, 150), false, 'an empty cell is a hole');
});
test('a charge under 5 % shows an empty battery, anything above one cell', () => {
  assert.equal(art.batteryCells(0.15), 1);
  assert.equal(art.batteryCells(0.05), 1);
  assert.equal(art.batteryCells(0.049), 0);
  assert.equal(art.batteryCells(0), 0);
  assert.equal(art.batteryCells(NaN), 0);
});
test('no pack data is bundled', () => {
  const src = fs.readFileSync(path.join(root, 'OmiArt.js'), 'utf8');
  assert(!/"pieces"|\bomi\.json\b.*\{/.test(src));
  assert(!fs.existsSync(path.join(root, 'omi.json')) && !fs.existsSync(path.join(root, 'omi.js')));
});
console.log(`${passed} omi art checks passed`);
