#!/usr/bin/env node
// OmiShare.js: the Omi state protocol v1 as pure decisions, checked against the reference service's behaviour.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const share = {};
vm.createContext(share);
vm.runInContext(fs.readFileSync(path.join(root, 'OmiShare.js'), 'utf8').replace('.pragma library', ''), share);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }
const MODES = ['logo', 'idle', 'thinking', 'working', 'success', 'sad', 'confused'];
const start = () => ({ state: share.initial(1000) });

test('the state starts as the plain logo, set at the start', () => {
  assert.deepEqual(plain(share.initial(5)), { mode: 'logo', from: null, since: 5, instant: true });
  assert.deepEqual(plain(share.stateMessage(share.initial(5))), { type: 'state', protocol: 1, mode: 'logo', from: null, since: 5, instant: true });
});
test('the socket is $OMI_SOCKET, else the runtime directory, else nowhere', () => {
  assert.equal(share.socketPath('/x/omi', '/run/user/1000'), '/x/omi');
  assert.equal(share.socketPath('', '/run/user/1000'), '/run/user/1000/omi.sock');
  assert.equal(share.socketPath(undefined, '/run/user/1000/'), '/run/user/1000/omi.sock');
  assert.equal(share.socketPath('', ''), '');
  assert.equal(share.socketPath(undefined, undefined), '');
});
test('a set changes the state from the service\'s clock and tells everybody, the sender included', () => {
  const r = share.handle(start(), { type: 'set', mode: 'thinking', since: 1 }, 2000, MODES);
  assert.deepEqual(plain(r.model.state), { mode: 'thinking', from: 'logo', since: 2000, instant: false });
  assert.deepEqual(plain(r.broadcast), [{ type: 'state', protocol: 1, mode: 'thinking', from: 'logo', since: 2000, instant: false }]);
  assert.deepEqual(plain(r.send), []);
  assert.deepEqual(plain(r.timer), { clear: true }, 'a plain set cancels a pending timer');
});
test('instant carries over; setting the same mode changes nothing but is answered with the state', () => {
  const a = share.handle(start(), { type: 'set', mode: 'working', instant: true }, 2000, MODES);
  assert.equal(a.model.state.instant, true);
  const b = share.handle(a.model, { type: 'set', mode: 'working' }, 9000, MODES);
  assert.equal(b.model.state.since, 2000, 'since stays, so apps showing it do not restart');
  assert.deepEqual(plain(b.broadcast), []);
  assert.equal(b.send.length, 1);
  assert.equal(b.send[0].type, 'state');
  assert.deepEqual(plain(b.timer), { clear: true }, 'but it replaces a pending timer');
});
test('for and then start a timer that replaces the old one', () => {
  const r = share.handle(start(), { type: 'set', mode: 'success', for: 2, then: 'idle' }, 2000, MODES);
  assert.deepEqual(plain(r.timer), { clear: true, seconds: 2, then: 'idle' });
  const again = share.handle(r.model, { type: 'set', mode: 'success', for: 5, then: 'sad' }, 3000, MODES);
  assert.deepEqual(plain(again.timer), { clear: true, seconds: 5, then: 'sad' });
});
test('a timer is at most a day', () => {
  assert.equal(share.handle(start(), { type: 'set', mode: 'success', for: 1e12, then: 'idle' }, 2000, MODES).timer.seconds, 86400);
  assert.equal(share.handle(start(), { type: 'set', mode: 'success', for: 0.25, then: 'idle' }, 2000, MODES).timer.seconds, 0.25);
});
test('the timer running out changes to then, unless that is where Omi already is', () => {
  const m = share.handle(start(), { type: 'set', mode: 'success', for: 2, then: 'idle' }, 2000, MODES).model;
  const done = share.expire(m, 'idle', 4000, MODES);
  assert.deepEqual(plain(done.model.state), { mode: 'idle', from: 'success', since: 4000, instant: false });
  assert.equal(done.broadcast.length, 1);
  const noop = share.expire(done.model, 'idle', 5000, MODES);
  assert.deepEqual(plain(noop.broadcast), []);
  assert.equal(noop.model.state.since, 4000);
  assert.deepEqual(plain(share.expire(m, 'nonsense', 4000, MODES).broadcast), [], 'an unknown mode is not applied');
});
test('bad input is answered with an error and changes nothing, timers included', () => {
  const m = start();
  for (const [msg, text] of [
    [{ type: 'set' }, 'mode must be a mode id'],
    [{ type: 'set', mode: '' }, 'mode must be a mode id'],
    [{ type: 'set', mode: 7 }, 'mode must be a mode id'],
    [{ type: 'set', mode: 'thinkng' }, 'no mode "thinkng"'],
    [{ type: 'set', mode: 'idle', for: 2 }, 'mode must be a mode id'],
    [{ type: 'set', mode: 'idle', for: 0, then: 'idle' }, 'for must be a number of seconds above 0'],
    [{ type: 'set', mode: 'idle', for: '2', then: 'idle' }, 'for must be a number of seconds above 0'],
    [{ type: 'set', mode: 'idle', for: Infinity, then: 'idle' }, 'for must be a number of seconds above 0'],
    [{ type: 'set', mode: 'idle', for: 2, then: 'nonsense' }, 'no mode "nonsense"'],
    [{ type: 'set', mode: 'idle', then: 'idle' }, 'for must be a number of seconds above 0'],
  ]) {
    const r = share.handle(m, msg, 2000, MODES);
    assert.deepEqual(plain(r.send), [{ type: 'error', message: text }], JSON.stringify(msg));
    assert.equal(r.model, m);
    assert.equal(r.timer, null);
    assert.deepEqual(plain(r.broadcast), []);
  }
});
test('a service without a kit accepts any mode id', () => {
  const r = share.handle(start(), { type: 'set', mode: 'something-new' }, 2000, null);
  assert.equal(r.model.state.mode, 'something-new');
});
test('get is answered with the state, hello names the sender, the rest is ignored', () => {
  const m = share.handle(start(), { type: 'set', mode: 'thinking' }, 2000, MODES).model;
  const g = share.handle(m, { type: 'get' }, 3000, MODES);
  assert.deepEqual(plain(g.send), [plain(share.stateMessage(m.state))]);
  assert.equal(g.timer, null);
  assert.equal(share.handle(m, { type: 'hello', name: 'my-app' }, 3000, MODES).name, 'my-app');
  assert.equal(share.handle(m, { type: 'hello', name: 'a\nb\u0007' + 'x'.repeat(100) }, 3000, MODES).name.length, 60, 'a name is bounded');
  assert.ok(!/[\n\u0007]/.test(share.handle(m, { type: 'hello', name: 'a\nb\u0007' }, 3000, MODES).name));
  assert.equal(share.handle(m, { type: 'hello', name: 5 }, 3000, MODES).name, null);
  for (const odd of [null, undefined, 'x', 7, [], { type: 'future', x: 1 }, { type: 'state' }]) {
    const r = share.handle(m, odd, 3000, MODES);
    assert.equal(r.model, m); assert.deepEqual(plain(r.send.concat(r.broadcast)), []); assert.equal(r.timer, null);
  }
});
test('the model is never mutated', () => {
  const m = start(), snapshot = JSON.stringify(m);
  share.handle(m, { type: 'set', mode: 'thinking', for: 1, then: 'idle' }, 2000, MODES);
  share.expire(m, 'idle', 3000, MODES);
  assert.equal(JSON.stringify(m), snapshot);
});
test('following another service: its state message is the state, anything else is nothing', () => {
  const f = share.follow(start(), { type: 'state', protocol: 1, mode: 'thinking', from: 'idle', since: 1767225600000, instant: false }, MODES);
  assert.deepEqual(plain(f.state), { mode: 'thinking', from: 'idle', since: 1767225600000, instant: false });
  assert.equal(share.follow(start(), { type: 'state', mode: 'x' }, null).state.since, 0);
  for (const odd of [null, 'x', { type: 'error' }, { type: 'state' }, { type: 'state', mode: '' }, { type: 'state', mode: 5 }])
    assert.equal(share.follow(start(), odd, MODES), null);
});
test('what the seal shows: nothing for the logo and idle, any kit mode otherwise', () => {
  const s = mode => share.shown({ mode }, MODES);
  assert.equal(s('logo'), ''); assert.equal(s('idle'), ''); assert.equal(s(''), '');
  assert.equal(s('thinking'), 'thinking'); assert.equal(s('success'), 'success');
  assert.equal(s('party'), '', 'a mode the kit lacks is not shown');
  assert.equal(share.shown({ mode: 'party' }, null), 'party');
  assert.equal(share.shown(null, MODES), '');
  assert.equal(share.shown({ mode: 3 }, MODES), '');
});
console.log(`${passed} omi share checks passed`);
