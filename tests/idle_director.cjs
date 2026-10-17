#!/usr/bin/env node
// IdleDirector.js: the stairs of the Omi seal's idle life, simulated with a fake clock and seeded randomness.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const dir = {};
vm.createContext(dir);
vm.runInContext(fs.readFileSync(path.join(root, 'IdleDirector.js'), 'utf8').replace('.pragma library', ''), dir);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const MODES = ['logo', 'idle', 'wink', 'skeptical', 'shy', 'thinking-dots', 'typing', 'laughing', 'peek', 'sleeping', 'excited'];

// Runs `seconds` of simulated time in 0.5 s ticks; returns [{ t (seconds), a }] for every action.
function run(opts) {
  const o = Object.assign({ profileName: 'lively', idle: true, calm: true, reduced: false, hour: 14, modes: MODES, seed: 1, seconds: 600 }, opts);
  const rnd = rng(o.seed);
  let model = o.model || dir.initial(), log = [];
  for (let ms = 0; ms <= o.seconds * 1000; ms += 500) {
    const r = dir.step(model, { profileName: o.profileName, now: 1000000 + ms, idle: o.idle, calm: o.calm, reduced: o.reduced, hour: o.hour, modes: o.modes, rnd });
    model = r.model;
    for (const a of r.actions) log.push({ t: ms / 1000, a: plain(a) });
  }
  return { log, model };
}
const kinds = log => log.map(e => e.a.kind);
// The idle report arrives `idleSec` into the user's absence, so idleFor = idleSec + t.
const idleFor = (name, t) => dir.idleSeconds(name) + t;

test('off, reduced motion, a busy face and an active user all stay still', () => {
  assert.deepEqual(run({ profileName: 'off' }).log, []);
  assert.deepEqual(run({ reduced: true }).log, []);
  assert.deepEqual(run({ calm: false }).log, []);
  assert.deepEqual(run({ idle: false }).log, []);
  assert.equal(dir.idleSeconds('off'), 0);
  assert.equal(dir.idleSeconds('lively'), 20);
  assert.equal(dir.idleSeconds('gentle'), 40);
  assert.equal(dir.idleSeconds('nonsense'), 20, 'an unknown profile reads as the default');
});
test('the first glance comes soon after the idle report, and he looks ahead again after it', () => {
  const { log } = run({ seconds: 12 });
  assert.equal(log[0].a.kind, 'look');
  assert.ok(log[0].t >= 3 && log[0].t <= 3.5, 'at ' + log[0].t);
  assert.ok(Math.abs(log[0].a.x) + Math.abs(log[0].a.y) > 0);
  assert.deepEqual(log[1].a, { kind: 'look', x: 0, y: 0 });
  assert.ok(log[1].t - log[0].t >= 1.5 && log[1].t - log[0].t <= 3.5);
});
test('before the fidgets begin there are only glances, after it the whole repertoire', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const { log } = run({ seed, seconds: 300 });
    for (const e of log) if (idleFor('lively', e.t) < 40) assert.ok(e.a.kind === 'look', 'only looks early, seed ' + seed + ': ' + JSON.stringify(e));
  }
  const kindsSeen = new Set();
  for (let seed = 1; seed <= 20; seed++) for (const e of run({ seed, seconds: 140 }).log) kindsSeen.add(e.a.kind === 'react' ? e.a.mode : e.a.kind);
  for (const wanted of ['look', 'wink', 'skeptical', 'shy', 'thinking-dots', 'typing', 'laughing', 'peek', 'fly']) assert.ok(kindsSeen.has(wanted), wanted + ' comes up');
});
test('one yawn at 150 s, sleep at 300 s of absence, and then nothing until he is woken', () => {
  const { log } = run({ seconds: 900 });
  const yawn = log.filter(e => e.a.kind === 'yawn'), sleep = log.filter(e => e.a.kind === 'sleep');
  assert.equal(yawn.length, 1);
  assert.equal(sleep.length, 1);
  assert.ok(Math.abs(idleFor('lively', yawn[0].t) - 150) <= 0.5, 'yawn at ' + idleFor('lively', yawn[0].t));
  assert.ok(Math.abs(idleFor('lively', sleep[0].t) - 300) <= 0.5, 'sleep at ' + idleFor('lively', sleep[0].t));
  assert.ok(log.every(e => e.t <= sleep[0].t), 'nothing after he fell asleep');
  assert.ok(log.indexOf(yawn[0]) < log.indexOf(sleep[0]));
});
test('a glance still pending when he yawns or falls asleep is put right first', () => {
  const at = (model, ms) => dir.step(model, { profileName: 'lively', now: 1000000 + ms, idle: true, calm: true, reduced: false, hour: 14, modes: MODES, rnd: () => 0.5 });
  // lively: the yawn is due 130 s after the idle report, sleep at 280 s; a glance is queued just before
  for (const [dueMs, kind] of [[130000, 'yawn'], [280000, 'sleep']]) {
    const start = at(dir.initial(), 0).model;
    const pending = Object.assign({}, plain(start), { yawned: kind === 'sleep', queue: [{ at: 1000000 + dueMs + 2500, action: { kind: 'look', x: 0, y: 0 } }], nextAt: 1000000 + dueMs + 100000 });
    const r = at(pending, dueMs);
    assert.deepEqual(plain(r.actions), [{ kind: 'look', x: 0, y: 0 }, { kind }], kind);
    assert.deepEqual(plain(r.model.queue), []);
  }
  const quiet = at(at(dir.initial(), 0).model, 130000);
  assert.deepEqual(plain(quiet.actions), [{ kind: 'yawn' }], 'no look reset when nothing is pending');
});
test('gentle is slower than lively: later, rarer', () => {
  const lively = run({ seconds: 280 }).log.filter(e => e.a.kind !== 'look' || e.a.x || e.a.y).length;
  const gentle = run({ profileName: 'gentle', seconds: 280 }).log.filter(e => e.a.kind !== 'look' || e.a.x || e.a.y).length;
  assert.ok(gentle < lively, gentle + ' < ' + lively);
  const g = run({ profileName: 'gentle', seconds: 900 }).log;
  assert.ok(Math.abs(idleFor('gentle', g.find(e => e.a.kind === 'sleep').t) - 600) <= 0.5);
});
test('the small hours bring yawn and sleep forward by half', () => {
  const { log } = run({ hour: 2, seconds: 900 });
  assert.ok(Math.abs(idleFor('lively', log.find(e => e.a.kind === 'yawn').t) - 75) <= 0.5);
  assert.ok(Math.abs(idleFor('lively', log.find(e => e.a.kind === 'sleep').t) - 150) <= 0.5);
  assert.equal(dir.night(23), true); assert.equal(dir.night(5), true); assert.equal(dir.night(6), false); assert.equal(dir.night(22), false);
});
test('never the same fidget twice in a row, and none while another is still playing', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const shown = run({ seed, seconds: 149 }).log.filter(e => e.a.kind === 'fly' || e.a.kind === 'react' || (e.a.kind === 'look' && (e.a.x || e.a.y)));
    const names = shown.map(e => e.a.kind === 'react' ? e.a.mode : e.a.kind === 'look' ? 'glance' : 'fly');
    for (let i = 1; i < names.length; i++) if (names[i] !== 'glance') assert.notEqual(names[i], names[i - 1], 'seed ' + seed + ': ' + names.join(','));
    const looks = shown.filter(e => e.a.kind === 'look');
    for (let i = 1; i < looks.length; i++) if (shown.indexOf(looks[i]) === shown.indexOf(looks[i - 1]) + 1)
      assert.notDeepEqual([looks[i].a.x, looks[i].a.y], [looks[i - 1].a.x, looks[i - 1].a.y], 'the same glance twice, seed ' + seed);
    for (let i = 1; i < shown.length; i++) assert.ok(shown[i].t - shown[i - 1].t >= 3, 'overlap at ' + shown[i].t + ' seed ' + seed);
  }
});
test('a pack without a mode never gets it asked for', () => {
  const modes = MODES.filter(m => m !== 'wink' && m !== 'typing');
  for (let seed = 1; seed <= 12; seed++)
    for (const e of run({ seed, modes, seconds: 149 }).log) if (e.a.kind === 'react') assert.ok(modes.includes(e.a.mode), e.a.mode);
});
test('the first sign of you wakes him: with a start from sleep, quietly from a fidget', () => {
  const asleep = run({ seconds: 400 });
  assert.equal(asleep.model.phase, 'asleep');
  const woke = dir.step(asleep.model, { now: 5000000, idle: false, calm: true, reduced: false, hour: 14, modes: MODES, rnd: rng(1) });
  assert.deepEqual(plain(woke.actions), [{ kind: 'wake', startle: true }]);
  assert.equal(woke.model.phase, 'awake');
  const again = dir.step(woke.model, { now: 5000500, idle: false, calm: true, reduced: false, hour: 14, modes: MODES, rnd: rng(1) });
  assert.deepEqual(plain(again.actions), [], 'nothing twice');
  const mid = run({ seconds: 60 });
  assert.equal(mid.model.active, true);
  const stop = dir.step(mid.model, { now: 6000000, idle: false, calm: true, reduced: false, hour: 14, modes: MODES, rnd: rng(1) });
  assert.deepEqual(plain(stop.actions), [{ kind: 'cancel' }]);
  assert.equal(dir.step(stop.model, { now: 6000500, idle: false, calm: true, reduced: false, hour: 14, modes: MODES, rnd: rng(1) }).actions.length, 0);
});
test('anything else to say wakes him without a start and he starts over afterwards', () => {
  const asleep = run({ seconds: 400 });
  const woke = dir.step(asleep.model, { now: 5000000, idle: true, calm: false, reduced: false, hour: 14, modes: MODES, rnd: rng(1) });
  assert.deepEqual(plain(woke.actions), [{ kind: 'wake', startle: false }]);
  const next = run({ model: woke.model, seconds: 12 });
  assert.equal(next.log[0].a.kind, 'look', 'the stairs begin again from the bottom');
});
test('the model is not mutated and survives odd input', () => {
  const m = dir.initial(), snapshot = JSON.stringify(m);
  dir.step(m, { now: 1, idle: true, calm: true, reduced: false, hour: 1, modes: MODES, rnd: rng(3) });
  assert.equal(JSON.stringify(m), snapshot);
  assert.doesNotThrow(() => dir.step(undefined, { now: 1, idle: true, calm: true, rnd: rng(3) }));
  assert.doesNotThrow(() => dir.step(dir.initial(), { now: 1, idle: true, calm: true, modes: 'x', hour: NaN, rnd: rng(3) }));
});
console.log(`${passed} idle director checks passed`);
