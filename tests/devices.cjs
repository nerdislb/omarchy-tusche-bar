#!/usr/bin/env node
// Control Center → links and idle times: link rows from Omarchy's menu
// (OmarchySettings.LINKS) and to its device panels (ControlCenter.DEVICE_LINKS),
// where a panel can open from, the Sound & network area, Omarchy's idle times
// in shell.json (staging, the Use step, Cancel back to the value or no value).
// The window and its processes: tests/control_center_runtime.py; the
// shell.json helper: tests/idle_times.py.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const strip = t => t.replace(/^\.(pragma|import).*$/mg, '');
const presets = vm.createContext({});
vm.runInContext(read('Presets.js'), presets);
const watchdog = vm.createContext({});
vm.runInContext(strip(read('Watchdog.js')), watchdog);
const cc = vm.createContext({Presets: presets, Watchdog: watchdog});
vm.runInContext(strip(read('ControlCenter.js')), cc);
const om = vm.createContext({});
vm.runInContext(strip(read('OmarchySettings.js')), om);
const MenuModel = require(path.join(root, 'vendor/MenuModel.js'));
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }

const MENU = `{
  "setup": {"label": "Setup"},
  "setup.typing": {"label": "Typing"},
  "setup.typing.keyboard": {"label": "Keyboard Layouts", "action": "omarchy-setup-keyboard"},
  "setup.typing.input": {"label": "Input Methods", "action": "omarchy-setup-input"},
  "setup.input": {"label": "Input", "when": "[[ -f ~/.config/hypr/input.lua ]]", "action": "omarchy-launch-config-editor \\"$HOME/.config/hypr/input.lua\\""},
  "setup.network": {"label": "Network"},
  "setup.network.qr": {"label": "QR Code", "when": "omarchy-network-wifi-connected", "action": "omarchy-shell shell summon omarchy.wifiqr"},
  "setup.security": {"label": "Security"},
  "setup.security.fingerprint": {"label": "Fingerprint", "when": "omarchy-hw-fingerprint", "action": "omarchy-launch-floating-terminal-with-presentation omarchy-setup-security-fingerprint"},
  "setup.security.fido2": {"label": "Fido2", "action": "omarchy-launch-floating-terminal-with-presentation omarchy-setup-security-fido2"},
  "setup.security.sshd": {"label": "SSHD", "disabled": "true", "action": "omarchy-launch-floating-terminal-with-presentation omarchy-setup-security-sshd"},
  "update": {"label": "Update", "when": "false"},
  "update.timezone": {"label": "Timezone", "action": "omarchy-menu-timezone"}
}`;
const merged = MenuModel.mergeMenuSources(MenuModel.parseMenuJsonc(MENU), []);
const facts = (over = {}) => Object.assign({items: merged.items, itemOrder: merged.itemOrder, evaluated: true,
  when: {'setup.input': true, 'setup.network.qr': true, 'setup.security.fingerprint': false, update: false},
  checked: {}, disabled: {'setup.security.sshd': true}, asking: {}, readers: {}, guardReaders: MenuModel.guardReaders}, over);
const derived = om.derive(facts());
const link = key => derived.links.find(l => l.key === key);

test('menu entries in LINKS become link rows, run as the menu runs them', () => {
  const k = link('setup.typing.keyboard');
  assert.equal(k.id, 'link.setup.typing.keyboard');
  assert.equal(k.domain, 'link');
  assert.equal(k.kind, 'link');
  assert.equal(k.area, 'input');
  assert.equal(k.section, 'SETUP');
  assert.equal(k.label, 'Keyboard layouts');
  assert.equal(k.action, 'omarchy-setup-keyboard');
  assert.equal(k.path, 'Setup › Typing › Keyboard Layouts');
  assert.equal(k.opens, 'window');
  assert.deepEqual(plain(k.values), []);
});

test('what a link opens and the command it shows', () => {
  assert.equal(link('setup.security.fido2').opens, 'terminal');
  assert.equal(link('setup.security.fido2').hint, 'omarchy-setup-security-fido2');
  assert.equal(link('setup.input').opens, 'editor');
  assert.equal(link('setup.input').hint, '~/.config/hypr/input.lua');
  assert.equal(link('setup.network.qr').opens, 'panel');
  assert.equal(link('setup.network.qr').hint, 'omarchy.wifiqr');
  assert.equal(link('setup.network.qr').area, 'devices');
  assert.equal(om.linkHint("omarchy-launch-floating-terminal-with-presentation 'omarchy-dns Custom'"), 'omarchy-dns');
});

test('no link where the menu does not offer the entry: its guard, disabled, a hidden menu above', () => {
  assert.equal(link('setup.security.fingerprint'), undefined, 'no fingerprint reader');
  assert.equal(link('setup.security.sshd'), undefined, 'disabled');
  assert.equal(link('update.timezone'), undefined, 'its menu is hidden');
  assert.ok(link('update.timezone') === undefined && om.derive(facts({when: Object.assign({}, facts().when, {update: true})})).links.some(l => l.key === 'update.timezone'));
  assert.equal(om.derive(facts({evaluated: false})), null);
});

// ---------------------------------------------------------------- device links
const options = presets.normalizeOptions({right: 'groups'});
const config = {plugins: [{id: 'nerdibeard.tusche-bar', options}],
                bar: {layout: {left: [], center: [], right: [{id: 'omarchy.audio'}, {id: 'tusche.status'}]}},
                idle: {screensaver: 150}};
const plugins = ['nerdibeard.display-layout', 'nerdibeard.monitor', 'nerdibeard.tusche-bar'];

test('device panels open where they sit: in the bar or folded into a status group', () => {
  assert.equal(cc.widgetPlaced(config, options, 'omarchy.audio'), true, 'in the layout');
  assert.equal(cc.widgetPlaced(config, options, 'omarchy.network'), true, 'folded by the groups variant');
  const today = presets.normalizeOptions({right: 'today'});
  assert.equal(cc.widgetPlaced({bar: {layout: {right: []}}}, today, 'omarchy.network'), false);
});

test('device links: Omarchy panels, the display editor and brightness when installed', () => {
  const links = plain(cc.deviceLinks(config, options, plugins));
  const byKey = k => links.find(l => l.key === k);
  assert.deepEqual(links.map(l => l.key), ['sound', 'network', 'tailscale', 'bluetooth', 'arrange', 'brightness']);
  assert.equal(byKey('sound').widget, 'omarchy.audio');
  assert.equal(byKey('sound').available, true);
  assert.equal(byKey('arrange').action, 'omarchy-shell display-layout open');
  assert.equal(byKey('arrange').available, true, 'its host (nerdibeard.monitor) is folded in');
  assert.equal(byKey('brightness').widget, 'nerdibeard.monitor');
  const bare = plain(cc.deviceLinks({bar: {layout: {right: []}}}, presets.normalizeOptions({right: 'today'}), []));
  assert.deepEqual(bare.map(l => l.key), ['sound', 'network', 'tailscale', 'bluetooth', 'brightness-omarchy']);
  assert.ok(bare.every(l => l.available === false && /Not in the bar: add omarchy\./.test(l.why)), 'not placed: shown with the reason');
  assert.equal(plain(cc.deviceLinks(config, options, null)).some(l => l.key === 'arrange'), false, 'plugins not read yet');
});

const live = cc.liveState(options, config, 'disabled', null, derived, null, plugins);

test('links join the live state; they stage nothing and open only while placed', () => {
  assert.ok(live.linkSpecs.some(l => l.id === 'link.sound') && live.linkSpecs.some(l => l.id === 'link.setup.typing.keyboard'));
  assert.equal(cc.setting('link.sound', live).label, 'Sound');
  assert.equal(cc.available(live, 'link.sound'), true);
  assert.deepEqual(plain(cc.stage({}, live, 'link.sound', 'x')), {});
  assert.equal(cc.acceptable(live, 'link.sound', ''), false);
  const bare = cc.liveState(presets.normalizeOptions({right: 'today'}), {bar: {layout: {right: []}}}, 'disabled', null, null, null, []);
  assert.equal(cc.available(bare, 'link.network'), false);
  assert.equal(cc.sourceOf(cc.setting('link.sound', live)), 'Link');
  assert.equal(cc.changedRows(live, {}).some(r => String(r.id).indexOf('link.') === 0), false, 'links never count as changed');
});

test('the Sound & network area: sound, network (with DNS), Bluetooth', () => {
  const om2 = {specs: [{id: 'omarchy.setup.network.dns', domain: 'omarchy', key: 'setup.network.dns', area: 'devices', section: 'NETWORK', label: 'DNS', values: [{id: 'a', label: 'DHCP'}], readOnly: true}],
               values: {'setup.network.dns': 'a'}, links: derived.links};
  const l2 = cc.liveState(options, config, 'disabled', null, om2, null, plugins);
  const rows = plain(cc.areaRows('devices', l2, {}));
  assert.deepEqual(rows.filter(r => r.kind === 'head').map(r => r.text), ['SOUND', 'NETWORK', 'BLUETOOTH']);
  assert.deepEqual(rows.filter(r => r.kind === 'row').map(r => r.id),
    ['link.sound', 'link.network', 'link.tailscale', 'omarchy.setup.network.dns', 'link.setup.network.qr', 'link.bluetooth']);
  assert.ok(cc.isArea('wifi') && cc.resolveArea('bluetooth') === 'devices', 'cc wifi / sound / bluetooth open it');
  assert.deepEqual(plain(cc.sidebar().filter(r => r.kind === 'group').map(r => r.id)), ['overview', 'appearance', 'bar', 'work', 'devices', 'system']);
  assert.equal(cc.areaOf('power').group, 'devices');
  const screens = plain(cc.areaRows('screens', live, {})).filter(r => r.kind === 'row').map(r => r.id);
  assert.deepEqual(screens, ['link.arrange', 'link.brightness']);
  const input = plain(cc.areaRows('input', live, {})).filter(r => r.kind === 'head').map(r => r.text);
  assert.equal(input[input.length - 1], 'SETUP');
});

test('search finds links by name, command and menu path', () => {
  const index = cc.searchIndex(live, {});
  const ids = q => cc.search(index, q, 20).map(h => h.id);
  assert.equal(ids('bluetooth')[0], 'link.bluetooth');
  assert.ok(ids('omarchy-setup-keyboard').indexOf('link.setup.typing.keyboard') >= 0);
  assert.ok(ids('typing').indexOf('link.setup.typing.keyboard') >= 0, 'menu path word');
  assert.ok(ids('fido2').indexOf('link.setup.security.fido2') >= 0);
  assert.ok(ids('display-layout').indexOf('link.arrange') >= 0);
});

// ---------------------------------------------------------------- idle times
test('idle times: what Omarchy runs with, what shell.json holds', () => {
  assert.deepEqual(plain(live.idle), {screensaver: '150', lock: '300'}, 'lock falls back to Omarchy\'s default');
  assert.deepEqual(plain(live.idleRaw), {screensaver: 150});
  assert.equal(cc.liveState(options, {}, 'disabled', null, null, null, null).idle, null, 'shell.json not read yet');
  assert.deepEqual(plain(cc.idleFacts({idle: {screensaver: -5, lock: '600'}}).values), {screensaver: '150', lock: '600'});
  assert.deepEqual(plain(cc.idleFacts({idle: {screensaver: 90.7, lock: true}}).values), {screensaver: '90', lock: '300'});
  assert.deepEqual(plain(cc.idleFacts({idle: 'nonsense'}).values), {screensaver: '150', lock: '300'});
});

test('idle labels and choices; a value set elsewhere joins the choices', () => {
  assert.deepEqual([0, 45, 60, 150, 300, 3600, 5400, 420].map(cc.idleLabel), ['Off', '45 s', '1 min', '2.5 min', '5 min', '1 h', '1 h 30 min', '7 min']);
  const s = cc.setting('idle.lock', live);
  assert.equal(s.area, 'power');
  assert.equal(s.section, 'IDLE TIMES');
  assert.deepEqual(plain(s.values.map(v => v.id)), ['0', '60', '120', '150', '300', '600', '900', '1800', '3600']);
  const odd = cc.liveState(options, {idle: {lock: 420}}, 'disabled', null, null, null, null);
  assert.deepEqual(plain(cc.setting('idle.lock', odd).values.map(v => v.id)), ['0', '60', '120', '150', '300', '420', '600', '900', '1800', '3600']);
  assert.equal(cc.sourceOf(s), 'Omarchy');
  assert.deepEqual(plain(cc.areaRows('power', live, {})).filter(r => r.kind === 'row').map(r => r.id), ['idle.screensaver', 'idle.lock']);
});

test('idle staging: only offered values; Use writes both as one step', () => {
  let e = cc.stage({}, live, 'idle.lock', '600');
  e = cc.stage(e, live, 'idle.screensaver', '0');
  assert.deepEqual(plain(cc.stage({}, live, 'idle.lock', '601')), {}, 'not a choice');
  assert.deepEqual(plain(cc.stage({}, live, 'idle.lock', '300')), {}, 'the live value');
  const steps = plain(cc.plan(e, live));
  assert.deepEqual(steps, [{domain: 'idle', keys: ['screensaver', 'lock'], changes: {screensaver: 0, lock: 600}}]);
  const withHypr = plain(cc.plan(cc.stage(cc.stage({}, cc.liveState(options, config, 'disabled', null, null,
    cc.hyprFacts(JSON.stringify({values: {}, effective: {}, error: ''})), plugins), 'hypr.general:gaps_out', '8'), live, 'idle.lock', '600'),
    cc.liveState(options, config, 'disabled', null, null, cc.hyprFacts(JSON.stringify({values: {}, effective: {}, error: ''})), plugins)));
  assert.deepEqual(withHypr.map(s => s.domain), ['hypr', 'idle'], 'after the overrides, before the island and the bar');
  assert.ok(cc.changedRows(live, {}).some(r => r.id === 'idle.screensaver') === false, 'at the default: not changed');
  const away = cc.liveState(options, {idle: {lock: 600}}, 'disabled', null, null, null, null);
  assert.ok(cc.changedRows(away, {}).some(r => r.id === 'idle.lock'), 'away from the default');
});

test('Cancel puts back what shell.json held at opening: the value, or no value', () => {
  const after = cc.liveState(options, {idle: {screensaver: 0, lock: 600}}, 'disabled', null, null, null, null);
  const steps = plain(cc.revertPlan(live, after, {idle: {screensaver: true, lock: true}}));
  assert.deepEqual(steps, [{domain: 'idle', keys: ['screensaver', 'lock'], changes: {screensaver: 150, lock: null}}]);
  assert.deepEqual(plain(cc.revertPlan(live, live, {idle: {lock: true}})), [], 'nothing differs: nothing runs');
  const outside = cc.liveState(options, {idle: {screensaver: 150, lock: 900}}, 'disabled', null, null, null, null);
  assert.deepEqual(plain(cc.revertPlan(live, outside, {idle: {screensaver: true}})), [], 'only keys Use touched');
  assert.equal(cc.idleRestoreValue({a: 1}), null);
  assert.equal(cc.idleRestoreValue('300'), '300');
});

test('the Use step is confirmed from the host\'s copy of shell.json', () => {
  assert.equal(cc.idleHolds({idle: {screensaver: 0, lock: 600}}, {screensaver: 0, lock: 600}), true);
  assert.equal(cc.idleHolds({idle: {screensaver: 0}}, {screensaver: 0, lock: null}), true, 'null: the key is gone');
  assert.equal(cc.idleHolds({idle: {screensaver: 150}}, {screensaver: 0}), false);
  assert.equal(cc.idleHolds({}, {lock: null}), true);
});

// Omarchy's real menu: every entry LINKS names is still there and has an action.
const omarchy = process.env.OMARCHY_PATH || '/usr/share/omarchy';
const realMenu = path.join(omarchy, 'default/omarchy/omarchy-menu.jsonc');
if (fs.existsSync(realMenu)) {
  test("Omarchy's own menu has every linked entry, each with an action", () => {
    const m = MenuModel.mergeMenuSources(MenuModel.parseMenuJsonc(fs.readFileSync(realMenu, 'utf8')), []);
    Object.keys(om.LINKS).forEach(key => {
      assert.ok(m.items[key], 'LINKS names ' + key + ', which the menu no longer has');
      assert.ok(m.items[key].action && !m.items[key].provider, key + ' has an action of its own');
    });
    const all = {};
    m.itemOrder.forEach(id => { all[id] = true });
    const d = om.derive({items: m.items, itemOrder: m.itemOrder, evaluated: true, when: new Proxy({}, {get: () => true}),
                         checked: {}, disabled: {}, asking: {}, readers: {}, guardReaders: MenuModel.guardReaders});
    assert.equal(d.links.length, Object.keys(om.LINKS).length, 'every guard true: every link');
  });
}

console.log(passed + ' device and idle checks passed');
