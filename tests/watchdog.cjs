#!/usr/bin/env node
// Pure decisions of the notification watchdog (Watchdog.js) plus static guards
// on the QML that runs them. The native Qt run is tests/watchdog_runtime.py.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const model = {};
vm.createContext(model);
vm.runInContext(read('Watchdog.js').replace('.pragma library', ''), model);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }
const T = 1000000;

test('only "ok" and "nomarker" are answers; everything else counts as silence', () => {
  assert.equal(model.classify('ok'), 'ok');
  assert.equal(model.classify(' ok\n'), 'ok');
  assert.equal(model.classify('nomarker'), 'nomarker');
  for (const bad of ['', 'silent', 'Target not found.', 'OK', 'ok ok', undefined, null, 0, {}]) assert.equal(model.classify(bad), 'silent');
});
test('without the island\'s marker nothing is ever counted or handed back', () => {
  let state = model.initial();
  for (let i = 0; i < 10; i++) {
    const r = model.step(state, 'nomarker', T + i * 1000);
    assert.equal(r.action, null);
    assert.deepEqual([r.state.misses, r.state.armed], [0, false]);
    state = r.state;
  }
});
test('an answer clears the count and records when the island last spoke', () => {
  let r = model.step(model.initial(), 'silent', T);
  r = model.step(r.state, 'silent', T + 20000);
  assert.equal(r.state.misses, 2);
  r = model.step(r.state, 'ok', T + 40000);
  assert.deepEqual([r.state.misses, r.state.lastOk, r.action], [0, T + 40000, null]);
});
test('the service goes back exactly at the third silent answer', () => {
  let r = model.step(model.initial(), 'silent', T);
  assert.deepEqual([r.action, r.state.misses], [null, 1]);
  r = model.step(r.state, 'silent', T + 20000);
  assert.deepEqual([r.action, r.state.misses], [null, 2]);
  r = model.step(r.state, 'silent', T + 40000);
  assert.equal(r.action, 'handback');
  assert.deepEqual([r.state.misses, r.state.handedBackAt, r.state.armed], [0, T + 40000, false]);
  assert.equal(r.state.handedBacks, 0, 'it only counts once the service really went back');
});
test('a single silent answer between good ones never hands anything back', () => {
  let state = model.initial();
  for (const answer of ['ok', 'silent', 'ok', 'silent', 'silent', 'ok', 'silent']) {
    const r = model.step(state, answer, T);
    assert.equal(r.action, null);
    state = r.state;
  }
});
test('after a hand-back the pause holds, then the next silent answer retries', () => {
  let r = model.step({...model.initial(), misses: 2}, 'silent', T);
  assert.equal(r.action, 'handback');
  let state = r.state;
  for (let i = 1; i <= 5; i++) {
    r = model.step(state, 'silent', T + i * 20000);
    assert.equal(r.action, null, 'inside the pause');
    state = r.state;
  }
  assert(state.misses >= model.MISSES);
  r = model.step(state, 'silent', T + model.COOLDOWN_MS);
  assert.equal(r.action, 'handback', 'once the pause is over a persisting silence is acted on again');
});
test('handedBack counts a real hand-back and leaves its input alone', () => {
  const state = Object.freeze(model.initial());
  const next = model.handedBack(state);
  assert.equal(next.handedBacks, 1);
  assert.equal(state.handedBacks, 0);
  assert.equal(model.handedBack(next).handedBacks, 2);
});
test('the look is quick only while a silence is being confirmed', () => {
  assert.equal(model.nextDelay(model.initial()), model.SLOW_MS);
  assert.equal(model.nextDelay({...model.initial(), misses: 1}), model.FAST_MS);
  assert.equal(model.nextDelay(null), model.SLOW_MS);
  assert(model.FAST_MS * model.MISSES < 120000, 'a silence is confirmed within two minutes');
});
test('a takeover is the island\'s only when the service is disabled and the marker is there', () => {
  assert.equal(model.owned({disabled: true, marker: true}), true);
  assert.equal(model.owned({disabled: true, marker: false}), false, 'disabled by hand');
  assert.equal(model.owned({disabled: false, marker: true}), false);
  assert.equal(model.owned(null), false);
});
test('Health text tells armed, suspicious and handed-back apart', () => {
  assert.equal(model.describe(model.initial(), false, T).state, 'ok');
  assert.match(model.describe(model.initial(), false, T).detail, /Not needed/);
  assert.match(model.describe(model.initial(), true, T).detail, /Armed: first look/);
  assert.match(model.describe({...model.initial(), lastOk: T - 120000}, true, T).detail, /2 min ago/);
  assert.match(model.describe({...model.initial(), lastOk: T - 10000}, true, T).detail, /just now/);
  const suspicious = model.describe({...model.initial(), misses: 2}, true, T);
  assert.deepEqual([suspicious.state, /2 of 3/.test(suspicious.detail)], ['issue', true]);
  const looked = model.describe({...model.initial(), lastCheck: T - 1000, armed: false}, true, T);
  assert.deepEqual([looked.state, /not through the island/.test(looked.detail)], ['ok', true]);
  const back = model.describe({...model.initial(), handedBacks: 1}, false, T);
  assert.deepEqual([back.state, /1 time\b/.test(back.detail)], ['issue', true]);
  assert.match(model.describe({...model.initial(), handedBacks: 2}, false, T).detail, /2 times/);
});

test('the QML passes the marker as an argument, limits the ping and uses the island\'s own two-step hand-back', () => {
  const qml = read('NotificationsWatchdog.qml');
  // the QML string literals as the shell sees them (\" -> ")
  const scripts = [...qml.matchAll(/"sh", "-c",\s*\n\s*"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\"/g, '"'));
  assert.equal(scripts.length, 2, 'exactly the probe and the hand-back');
  for (const script of scripts) {
    assert(script.includes('"$1"'), 'the marker is read from $1');
    assert(!/markerPath|\$\{|`|\$\(/.test(script), 'nothing is interpolated into the script text');
  }
  assert(scripts[0].includes('timeout 4 omarchy-shell notifications ping'));
  assert(scripts[0].includes('echo nomarker'));
  assert(scripts[1].includes('[ -f "$1" ] && omarchy-plugin-enable omarchy.notifications || exit 1'), 'only with the marker, and only a successful enable goes on');
  assert(scripts[1].includes('[ $? -eq 1 ] && rm -f "$1"'), 'the marker goes only when jq says the plugin is no longer disabled (exit 1), not on an unreadable file (exit 2)');
  assert(/sleep 2; jq -e/.test(scripts[1]), 'a short wait before looking, so a reviving island can take the service over again first');
  assert((qml.match(/"sh", root\.markerPath\]/g) || []).length === 2, 'the marker path is the argument after the shell name');
  assert(!/repeat:\s*true/.test(qml), 'it re-arms a single-shot timer; there is no fixed polling loop');
  assert(/if \(answer === "nomarker"\) return/.test(qml), 'without the island\'s marker nothing is scheduled');
  assert(qml.includes('onRearmChanged: if (enabled && !probe.running && !handback.running && !model.armed)'), 'a shell.json rewrite re-arms an idle watchdog');
});
test('the real probe and hand-back scripts, run against fake omarchy programs, behave as promised', () => {
  const os = require('node:os');
  const cp = require('node:child_process');
  const qml = read('NotificationsWatchdog.qml');
  const [probe, handback] = [...qml.matchAll(/"sh", "-c",\s*\n\s*"((?:[^"\\]|\\.)*)"/g)].map(m => m[1].replace(/\\"/g, '"'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchdog-sh-'));
  try {
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const log = path.join(dir, 'calls.log');
    const put = (name, body) => { fs.writeFileSync(path.join(bin, name), '#!/bin/sh\n' + body + '\n', {mode: 0o755}); };
    // $FAKE_PING: ok | fail | hang ; $FAKE_ENABLE: 0 | 1 (exit status)
    put('omarchy-shell', 'echo "shell $*" >> "$LOG"\n[ "$1 $2" = "notifications ping" ] || exit 2\ncase "$FAKE_PING" in ok) echo ok;; hang) sleep 30;; *) echo "Target not found." >&2; exit 1;; esac');
    put('omarchy-plugin-enable', 'echo "enable $*" >> "$LOG"\nexit ${FAKE_ENABLE:-0}');
    const sh = (script, marker, env = {}) => cp.spawnSync('sh', ['-c', script, 'sh', marker], {
      encoding: 'utf8', timeout: 12000,
      env: {PATH: bin + ':/usr/bin:/bin', LOG: log, HOME: dir, ...env}
    });
    const calls = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
    // a marker path that would break a careless script
    const marker = path.join(dir, "it's a $(touch pwned) marker `x`");
    // no marker: nothing is asked of the shell at all
    let r = sh(probe, marker);
    assert.equal(r.stdout.trim(), 'nomarker');
    assert.equal(calls(), '');
    // marker + answering island
    fs.writeFileSync(marker, '');
    r = sh(probe, marker, {FAKE_PING: 'ok'});
    assert.equal(r.stdout.trim(), 'ok');
    // marker + missing target, and a hung shell (the time limit ends it)
    r = sh(probe, marker, {FAKE_PING: 'fail'});
    assert.equal(model.classify(r.stdout), 'silent');
    const started = Date.now();
    r = sh(probe, marker, {FAKE_PING: 'hang'});
    assert.equal(model.classify(r.stdout), 'silent');
    assert(Date.now() - started < 9000, 'the ping is time-limited');
    assert(!fs.existsSync(path.join(dir, 'pwned')), 'the marker path was never run as code');
    // hand-back without the marker does nothing
    fs.unlinkSync(marker);
    fs.writeFileSync(log, '');
    r = sh(handback, marker);
    assert.notEqual(r.status, 0);
    assert(!calls().includes('enable'), 'no marker: the service is not touched');
    // hand-back with the marker: enabled, then (after the wait) the marker goes
    const shellJson = path.join(dir, '.config/omarchy/shell.json');
    fs.mkdirSync(path.dirname(shellJson), {recursive: true});
    const listed = names => fs.writeFileSync(shellJson, JSON.stringify({disabledPlugins: names, plugins: []}));
    listed(['omarchy.something-else']);
    fs.writeFileSync(marker, '');
    r = sh(handback, marker, {FAKE_ENABLE: '0'});
    assert.equal(r.status, 0);
    assert(calls().includes('enable omarchy.notifications'));
    assert(!fs.existsSync(marker), 'marker removed after a hand-back that held');
    // a reviving island disables the service again within the wait: its marker stays, so a later failure is still caught
    listed(['omarchy.notifications']);
    fs.writeFileSync(marker, '');
    r = sh(handback, marker, {FAKE_ENABLE: '0'});
    assert.equal(r.status, 0);
    assert(fs.existsSync(marker), 'marker kept when the service is disabled again');
    // an unreadable shell.json is not proof: the marker stays
    fs.writeFileSync(shellJson, 'not json');
    r = sh(handback, marker, {FAKE_ENABLE: '0'});
    assert(fs.existsSync(marker), 'marker kept when shell.json cannot be read');
    fs.unlinkSync(shellJson);
    r = sh(handback, marker, {FAKE_ENABLE: '0'});
    assert(fs.existsSync(marker), 'marker kept when shell.json is missing');
    // a failing enable keeps the marker, reports failure and never waits
    listed([]);
    const before = Date.now();
    r = sh(handback, marker, {FAKE_ENABLE: '1'});
    assert.notEqual(r.status, 0);
    assert(fs.existsSync(marker), 'marker kept when the hand-back failed');
    assert(Date.now() - before < 1500, 'a failed enable does not wait');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
test('the engine arms it only while Omarchy\'s notification service is disabled', () => {
  const engine = read('Engine.qml');
  assert(engine.includes('NotificationsWatchdog {'));
  assert(engine.includes('enabled: root.configLoaded && root.takeoverDisabled'));
  assert(engine.includes('rearm: root.configSerial') && engine.includes('root.configSerial++'), 'the engine bumps a serial on every read of shell.json');
  assert(engine.includes('markerPath: root.stateRoot + "/tusche-island/notifications-takeover"'));
  assert(/takeoverDisabled: !!\(config && Array\.isArray\(config\.disabledPlugins\) && config\.disabledPlugins\.indexOf\("omarchy\.notifications"\) >= 0\)/.test(engine));
});
console.log(`${passed} watchdog checks passed`);
