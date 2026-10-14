// Pure compositor-geometry acceptance; does not interact with the desktop.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../WorkspaceGeometry.js'), 'utf8').replace('.pragma library', ''), ctx);
const plain = v => JSON.parse(JSON.stringify(v));
const near = (a, b) => assert(Math.abs(a - b) < 1e-10, `${a} ≠ ${b}`);
let groups = 0;
function test(label, fn) { fn(); groups++; console.log(`PASS: ${label}`); }
const monitor = {id: 7, name: 'DP-1', x: -1920, y: 500, width: 1920, height: 1080, scale: 1, transform: 0, reserved: [10, 30, 10, 20]};
const workspace = {id: 27, name: '27', monitorID: 7, monitor: 'DP-1'};
function client(address, x, y, width, height, more = {}) {
  return {address, at: [x - 1910, y + 530], size: [width, height], workspace: {id: 27}, monitor: 7, mapped: true, hidden: false, ...more};
}

test('logical monitor bounds preserve negative offsets and all reserved edges', () => {
  assert.deepEqual(plain(ctx.monitorRect(monitor)), {x: -1910, y: 530, width: 1900, height: 1030});
});
test('scale and every rotated/mirrored transform are applied once to dimensions', () => {
  for (let transform = 0; transform < 8; transform++) {
    const area = ctx.monitorRect({...monitor, width: 3840, height: 2160, scale: 2, transform, reserved: [0, 30, 0, 0]});
    assert.equal(area.x, -1920);
    assert.equal(area.y, 530);
    assert.equal(area.width, transform % 2 ? 1080 : 1920);
    assert.equal(area.height, (transform % 2 ? 1920 : 1080) - 30);
  }
});
test('real unequal two-dimensional tiles are not reduced to equal columns', () => {
  const clients = [client('0xa', 0, 0, 570, 1030), client('0xb', 570, 0, 1330, 515), client('0xc', 570, 515, 1330, 515)];
  const map = ctx.layoutOf(workspace, clients, [monitor], 'b');
  const byAddress = Object.fromEntries(map.rectangles.map(r => [r.address, r]));
  assert.equal(map.rectangles.length, 3);
  near(byAddress['0xa'].width, .3);
  near(byAddress['0xb'].width, .7);
  near(byAddress['0xb'].height, .5);
  near(byAddress['0xc'].y, .5);
  assert.equal(byAddress['0xb'].focused, true);
  assert.equal(map.rectangles.at(-1).address, '0xb');
});
test('portrait fractional-scale map uses logical client positions without rotation twice', () => {
  const portrait = {...monitor, width: 2400, height: 1350, scale: 1.5, transform: 1, x: 200, y: -1600, reserved: [0, 40, 0, 0]};
  const clients = [{address: 'c', workspace: {id: 27}, monitor: 7, at: [650, -780], size: [450, 780]}];
  const rect = ctx.layoutOf(workspace, clients, [portrait], '').rectangles[0];
  near(rect.x, .5); near(rect.y, .5); near(rect.width, .5); near(rect.height, .5);
});
test('fullscreen clips to usable monitor and floating windows remain distinct above tiles', () => {
  const map = ctx.layoutOf(workspace, [
    client('tile', 0, 0, 1900, 1030),
    client('float', 950, 515, 950, 515, {floating: true}),
    client('full', -10, -30, 1920, 1080, {fullscreen: 2})
  ], [monitor], 'full');
  assert.deepEqual(plain(map.rectangles.map(r => r.address)), ['tile', 'float', 'full']);
  const full = map.rectangles.at(-1);
  assert(full.fullscreen && full.clipped && full.focused);
  assert.deepEqual([full.x, full.y, full.width, full.height], [0, 0, 1, 1]);
  assert.equal(map.rectangles[1].floating, true);
});
test('parked pages are counted per edge; partial intersections retain correct visible area', () => {
  const map = ctx.layoutOf(workspace, [
    client('left', -2000, 0, 100, 100), client('right', 2000, 0, 100, 100),
    client('top', 0, -100, 100, 100), client('bottom', 0, 1030, 100, 100),
    client('corner', -100, -100, 100, 100), client('partial', -190, -103, 380, 206)
  ], [monitor], '');
  assert.deepEqual(plain(map.offscreen), {left: 2, right: 1, top: 2, bottom: 1, total: 5});
  assert.equal(map.rectangles.length, 1);
  assert.deepEqual([map.rectangles[0].x, map.rectangles[0].y], [0, 0]);
  near(map.rectangles[0].width, .1); near(map.rectangles[0].height, .1);
});
test('hidden, unmapped, wrong-monitor/workspace and malformed clients never become tiles', () => {
  const clients = [client('valid', 0, 0, 100, 100),
    client('hidden', 0, 0, 100, 100, {hidden: true}), client('unmapped', 0, 0, 100, 100, {mapped: false}),
    client('other', 0, 0, 100, 100, {workspace: {id: 1}}), client('other-monitor', 0, 0, 100, 100, {monitor: 8}),
    client('invalid', NaN, 0, 100, 100), client('zero', 0, 0, 0, 100), client('infinity', 0, 0, Infinity, 100), null, {}];
  assert.deepEqual(plain(ctx.layoutOf(workspace, clients, [monitor], '').rectangles.map(r => r.address)), ['valid']);
});
test('monitor source is workspace/client, never whichever display happens to be focused', () => {
  const other = {...monitor, id: 8, name: 'HDMI-A-1', x: 5000, focused: true};
  const map = ctx.layoutOf(workspace, [client('a', 0, 0, 1900, 1030)], [other, monitor], '');
  assert.equal(map.monitor, 'DP-1'); assert.equal(map.rectangles[0].width, 1);
  assert.equal(ctx.layoutOf({id: 27, name: '27'}, [client('a', 0, 0, 1900, 1030)], [other, monitor], '').monitor, 'DP-1');
  assert.equal(ctx.layoutOf(workspace, [], [], '').available, false);
  assert.equal(ctx.layoutOf(workspace, [], [{...monitor, disabled: true}], '').available, false);
  assert.equal(ctx.layoutOf(workspace, [], [{...monitor, width: 0}], '').available, false);
  assert.equal(ctx.layoutOf(workspace, [], [other], '').available, false, 'a disconnected source is not replaced by the remaining monitor');
});
test('incomplete monitor updates cannot produce negative/NaN usable bounds', () => {
  assert.deepEqual(plain(ctx.monitorRect({...monitor, reserved: [9999, Infinity, 9999, -10]})), {x: -1920, y: 500, width: 1920, height: 1080});
  assert.equal(ctx.monitorRect(null), null);
  assert.equal(ctx.monitorRect({...monitor, height: NaN}), null);
});
test('all regular IDs, including high IDs and named workspaces, survive; special IDs do not', () => {
  const all = [{id: 1}, {id: 11}, {id: 999}, {id: 11}, {id: -1337, name: 'editing'}, {id: -99, name: 'special:scratch'}, {id: 0}, {id: -999}];
  assert.deepEqual(plain(ctx.workspaceIds(all, 4500)), [-1337, 1, 11, 999, 4500]);
  assert.equal(ctx.workspaceSelector(all[4], -1337), 'name:editing');
  assert.equal(ctx.workspaceSelector(all[2], 999), '999');
  assert.equal(ctx.layoutOf(all[5], [], [monitor], '').available, false);
});
test('geometry is translation invariant and input objects are not mutated', () => {
  const clients = [client('a', 100, 50, 500, 300)];
  const before = JSON.stringify({workspace, clients, monitor});
  Object.freeze(clients[0].at); Object.freeze(clients[0].size); Object.freeze(clients[0]); Object.freeze(clients);
  const first = plain(ctx.layoutOf(workspace, clients, [monitor], 'a'));
  const shift = [4000, -2000];
  const shifted = clients.map(c => ({...c, at: [c.at[0] + shift[0], c.at[1] + shift[1]]}));
  assert.deepEqual(plain(ctx.layoutOf(workspace, shifted, [{...monitor, x: monitor.x + shift[0], y: monitor.y + shift[1]}], 'a')), first);
  assert.equal(JSON.stringify({workspace, clients, monitor}), before);
});
test('geometry events are selective; title/keyboard/network noise does not refresh IPC', () => {
  for (const name of ['openwindow', 'closewindow', 'movewindowv2', 'fullscreen', 'changefloatingmode', 'workspacev2', 'activewindowv2', 'configreloaded', 'monitorremoved', 'closelayer']) assert.equal(ctx.eventAffectsGeometry(name), true, name);
  for (const name of ['windowtitle', 'windowtitlev2', 'activelayout', 'urgent', 'screencast', 'unknown', '']) assert.equal(ctx.eventAffectsGeometry(name), false, name);
  assert.equal(ctx.eventAffectsMonitors('activewindowv2'), false);
  assert.equal(ctx.eventAffectsMonitors('monitoraddedv2'), true);
});
test('native-metadata fallback parses concatenated JSON safely and discards private fields', () => {
  const data = [[monitor], [{...workspace, windows: 1, lastwindowtitle: 'private window'}],
    [client('a',0,0,1900,1030,{title:'}] [ escaped " \\ newline\n',pid:123})], {...workspace, private:'unused'}];
  const text = data.map(x=>JSON.stringify(x)).join('\n\n\n');
  const snapshot = ctx.parseSnapshot(text);
  assert(snapshot);
  assert.equal(snapshot.workspaces[0].id, 27);
  assert.equal(snapshot.active.id, 27);
  assert.equal(snapshot.clients[0].address, 'a');
  assert(!JSON.stringify(snapshot).includes('private'));
  assert.equal(snapshot.clients[0].title, undefined);
  assert.equal(snapshot.clients[0].pid, undefined);
  assert.equal(ctx.layoutOf(snapshot.workspaces[0], snapshot.clients, snapshot.monitors, '').rectangles.length, 1);
  for (const malformed of ['', text.slice(0,-1), text+' unexpected', '{}', '[] [] [] null', '[] [] [] {}', text.replace('1920','NaN')]) assert.equal(ctx.parseSnapshot(malformed), null);
});
console.log(`WORKSPACE_GEOMETRY_RESULT ${JSON.stringify({groups})}`);
