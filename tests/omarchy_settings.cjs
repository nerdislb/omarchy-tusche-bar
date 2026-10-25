#!/usr/bin/env node
// Control Center → Omarchy's settings and the Hyprland overrides: rows read
// from Omarchy's menu (OmarchySettings.js), their live values, staging, the
// Use/Cancel plans, search, the Changed only view and the health rows
// (ControlCenter.js). The window and its processes: tests/control_center_runtime.py;
// the override file: tests/hypr_overrides.py.
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

// A small menu in Omarchy's own format: a choice, a toggle, a reader menu,
// an entry behind sudo, a hardware toggle that is not there, a choice nobody
// has checked.
const MENU = `{
  "appearance": {"label": "Appearance"},
  "appearance.windows": {"label": "Windows"},
  "appearance.windows.corners": {"label": "Window Corners"},
  "appearance.windows.corners.theme": {"label": "Theme Corners", "checked": "[[ $(omarchy-hyprland-corners) == \\"theme\\" ]]", "action": "omarchy-hyprland-corners theme"},
  "appearance.windows.corners.sharp": {"label": "Sharp Corners", "checked": "[[ $(omarchy-hyprland-corners) == \\"sharp\\" ]]", "action": "omarchy-hyprland-corners sharp"},
  "appearance.windows.corners.rounded": {"label": "Rounded Corners", "checked": "[[ $(omarchy-hyprland-corners) == \\"rounded\\" ]]", "action": "omarchy-hyprland-corners rounded"},
  "appearance.windows.gaps-on": {"label": "Window Gaps On", "when": "omarchy-hyprland-toggle-enabled window-no-gaps", "action": "omarchy-hyprland-window-gaps-toggle"},
  "appearance.windows.gaps-off": {"label": "Window Gaps Off", "when": "! omarchy-hyprland-toggle-enabled window-no-gaps", "action": "omarchy-hyprland-window-gaps-toggle"},
  "appearance.windows.fancy-on": {"label": "Fancy Mode On", "when": "[[ $(fancy) == on ]]", "action": "fancy off"},
  "appearance.windows.fancy-off": {"label": "Fancy Mode Off", "when": "[[ $(fancy) != on ]]", "action": "fancy on"},
  "appearance.top-bar": {"label": "Menu Bar"},
  "appearance.top-bar.position": {"label": "Position Bar"},
  "appearance.top-bar.position.top": {"label": "Top Bar", "action": "omarchy-bar position top"},
  "appearance.top-bar.position.bottom": {"label": "Bottom Bar", "action": "omarchy-bar position bottom"},
  "appearance.workspace-layout": {"label": "Workspace Layout"},
  "appearance.workspace-layout.dwindle": {"label": "Tiling", "checked": "[[ $(omarchy-hyprland-workspace-layout-default) == \\"dwindle\\" ]]", "action": "omarchy-hyprland-workspace-layout-default dwindle"},
  "appearance.workspace-layout.scrolling": {"label": "Scrolling", "checked": "[[ $(omarchy-hyprland-workspace-layout-default) == \\"scrolling\\" ]]", "action": "omarchy-hyprland-workspace-layout-default scrolling"},
  "setup": {"label": "Setup"},
  "setup.network": {"label": "Network"},
  "setup.network.dns": {"label": "DNS"},
  "setup.network.dns.dhcp": {"label": "DHCP", "checked": "[[ \\"$(omarchy-dns)\\" == \\"DHCP\\" ]]", "action": "omarchy-dns DHCP"},
  "setup.network.dns.cloudflare": {"label": "Cloudflare", "checked": "[[ \\"$(omarchy-dns)\\" == \\"Cloudflare\\" ]]", "action": "omarchy-dns Cloudflare"},
  "setup.network.dns.custom": {"label": "Custom", "checked": "[[ \\"$(omarchy-dns)\\" == \\"Custom\\" ]]", "action": "omarchy-launch-floating-terminal-with-presentation 'omarchy-dns Custom'"},
  "trigger": {"label": "Trigger"},
  "trigger.hardware": {"label": "Hardware"},
  "trigger.hardware.touchscreen-on": {"label": "Enable Touchscreen", "when": "omarchy-hw-touchscreen && [[ -f ~/x ]]", "action": "omarchy-toggle-touchscreen"},
  "trigger.hardware.touchscreen-off": {"label": "Disable Touchscreen", "when": "omarchy-hw-touchscreen && [[ ! -f ~/x ]]", "action": "omarchy-toggle-touchscreen"}
}`;
const merged = MenuModel.mergeMenuSources(MenuModel.parseMenuJsonc(MENU), []);
const answers = {
  checked: {'appearance.windows.corners.theme': true, 'setup.network.dns.dhcp': true},
  when: {'appearance.windows.gaps-on': false, 'appearance.windows.gaps-off': true,
         'appearance.windows.fancy-on': true, 'appearance.windows.fancy-off': false,
         'trigger.hardware.touchscreen-on': false, 'trigger.hardware.touchscreen-off': false}
};
const facts = (over = {}) => Object.assign({items: merged.items, itemOrder: merged.itemOrder, evaluated: true,
  when: answers.when, checked: answers.checked, asking: {'omarchy-dns': true},
  readers: {'appearance.top-bar.position': {current: 'top', items: []},
            'appearance.font': {current: 'JetBrainsMono Nerd Font', items: [{value: 'JetBrainsMono Nerd Font', label: 'JetBrainsMono Nerd Font'}, {value: "Bob's Mono", label: "Bob's Mono"}]}},
  guardReaders: MenuModel.guardReaders}, over);
const derived = om.derive(facts());
const spec = key => derived.specs.find(s => s.key === key);

test('nothing before the guards answered', () => {
  assert.equal(om.derive(facts({evaluated: false})), null);
  assert.equal(om.derive(null), null);
});

test('a menu of checked entries is one choice row, the checked entry live, labels shortened', () => {
  const s = spec('appearance.windows.corners');
  assert.equal(s.kind, 'choice');
  assert.equal(s.id, 'omarchy.appearance.windows.corners');
  assert.deepEqual(plain(s.values.map(v => v.label)), ['Theme', 'Sharp', 'Rounded']);
  assert.equal(s.label, 'Corners');
  assert.equal(s.area, 'windows');
  assert.equal(s.path, 'Appearance › Windows › Window Corners');
  assert.equal(s.hint, 'omarchy-hyprland-corners');
  assert.equal(derived.values['appearance.windows.corners'], 'appearance.windows.corners.theme');
  assert.equal(s.readOnly, false);
  assert.equal(s.values[1].action, 'omarchy-hyprland-corners sharp');
});

test('two neighbours with opposite guards are one toggle row; live is the entry the menu does not offer', () => {
  const s = spec('appearance.windows.gaps-on');
  assert.equal(s.kind, 'toggle');
  assert.equal(s.label, 'Gaps');
  assert.deepEqual(plain(s.values.map(v => [v.id, v.label])), [['appearance.windows.gaps-on', 'On'], ['appearance.windows.gaps-off', 'Off']]);
  // the menu offers "Gaps Off", so gaps are on
  assert.equal(derived.values['appearance.windows.gaps-on'], 'appearance.windows.gaps-on');
});

test('an unknown toggle pair is found by its guards and named from its labels', () => {
  const s = spec('appearance.windows.fancy-on');
  assert.ok(s, 'the == on / != on pair is a toggle');
  assert.equal(s.label, 'Fancy Mode');
  assert.deepEqual(plain(s.values.map(v => v.label)), ['On', 'Off']);
  assert.equal(derived.values['appearance.windows.fancy-on'], 'appearance.windows.fancy-off');
  assert.equal(s.area, 'system', 'unplaced settings go to System');
  assert.equal(s.section, 'MORE FROM OMARCHY');
});

test('only real negations pair: complementary literals yes, other literal pairs and swapped negations no', () => {
  assert.equal(om.negatedGuards('! omarchy-toggle-enabled bar-off', 'omarchy-toggle-enabled bar-off'), true);
  assert.equal(om.negatedGuards('omarchy-hw-laptop && [[ $(x) != true ]]', 'omarchy-hw-laptop && [[ $(x) == true ]]'), true);
  assert.equal(om.negatedGuards('[[ ! -f ~/a ]]', '[[ -f ~/a ]]'), true);
  assert.equal(om.negatedGuards('[[ $(omarchy-dock autohide) == "off" ]]', '[[ $(omarchy-dock autohide) == "on" ]]'), true);
  assert.equal(om.negatedGuards('[[ $(theme) == light ]]', '[[ $(theme) == dark ]]'), false);
  assert.equal(om.negatedGuards('a && ! b', '! a && b'), false);
  assert.equal(om.negatedGuards('x', 'x'), false);
  assert.equal(om.negatedGuards('! grep -q \'"mode": "Hybrid"\' /etc/x', 'grep -q \'"mode": "Hybrid"\' /etc/x'), true);
});

test('a reader menu reads its value through the reader batch', () => {
  const s = spec('appearance.top-bar.position');
  assert.equal(s.kind, 'choice');
  assert.equal(s.reader, 'omarchy-bar position');
  assert.equal(derived.values['appearance.top-bar.position'], 'appearance.top-bar.position.top');
  assert.equal(om.derive(facts({readers: {}})).specs.some(x => x.key === 'appearance.top-bar.position'), false, 'not before the reader answered');
  assert.deepEqual(plain(om.readerGroups(merged.items, merged.itemOrder, MenuModel.guardReaders)), [{key: 'appearance.top-bar.position', reader: 'omarchy-bar position'}]);
});

test('lists the native menu fills from bash need their menu entry; values are quoted actions', () => {
  assert.equal(spec('appearance.font'), undefined, 'the test menu has no font entry');
  const withFont = MenuModel.mergeMenuSources(MenuModel.parseMenuJsonc(MENU.replace('"appearance": {"label": "Appearance"},', '"appearance": {"label": "Appearance"}, "appearance.font": {"label": "Font", "provider": "fonts"},')), []);
  const d = om.derive(facts({items: withFont.items, itemOrder: withFont.itemOrder}));
  const s = d.specs.find(x => x.key === 'appearance.font');
  assert.equal(s.area, 'cards');
  assert.equal(d.values['appearance.font'], 'JetBrainsMono Nerd Font');
  assert.equal(s.values[1].action, "omarchy-font-set 'Bob'\\''s Mono'");
  assert.ok(s.values.every(v => v.pick));
});

test('scripts behind sudo are read-only and show only the live value; terminals are never picked', () => {
  const s = spec('setup.network.dns');
  assert.equal(s.readOnly, true);
  assert.deepEqual(plain(s.values.map(v => v.label)), ['DHCP']);
  assert.match(s.note, /password/);
  assert.equal(om.runnable("omarchy-launch-floating-terminal-with-presentation 'omarchy-dns Custom'", {}), false);
  assert.equal(om.runnable('background=$(omarchy-theme-bg-switcher); omarchy-theme-bg-set "$background"', {}), false);
  assert.equal(om.runnable('omarchy-bar set omarchy.clock format "dddd HH:mm"', {}), true);
  assert.equal(om.runnable("omarchy-bar set omarchy.clock verticalFormat $'HH\\n—\\nmm'", {}), true);
  assert.equal(om.runnable('a; b', {}), false);
  assert.equal(om.runnable('omarchy-dns Google', {'omarchy-dns': true}), false);
});

test('a script that restarts the shell (the window with it) is read-only with that reason', () => {
  const withFont = MenuModel.mergeMenuSources(MenuModel.parseMenuJsonc(MENU.replace('"appearance": {"label": "Appearance"},', '"appearance": {"label": "Appearance"}, "appearance.font": {"label": "Font", "provider": "fonts"},')), []);
  const d = om.derive(facts({items: withFont.items, itemOrder: withFont.itemOrder, asking: om.parseAsking('restart omarchy-font-set\npassword omarchy-dns\npassword omarchy-font-set\nnonsense\n')}));
  const s = d.specs.find(x => x.key === 'appearance.font');
  assert.equal(s.readOnly, true);
  assert.match(s.note, /restarts the shell this window runs in: use Omarchy's menu \(Appearance › Font\)/);
  assert.deepEqual(plain(om.parseAsking('password a\nrestart a\npassword b')), {a: 'restart', b: 'password'});
  assert.match(om.askingScript(), /omarchy-restart-shell/);
});

test('a choice nobody checked is read-only with a reason; hardware that is not there has no row', () => {
  const s = spec('appearance.workspace-layout');
  assert.equal(derived.values['appearance.workspace-layout'], 'unknown');
  assert.equal(s.readOnly, true);
  assert.match(s.note, /none of these/);
  assert.equal(spec('trigger.hardware.touchscreen-on'), undefined);
});

test('the reader batch prints lines parseReaders reads back', () => {
  const script = om.readerScript([{key: 'appearance.top-bar.position', reader: 'omarchy-bar position'}]);
  assert.match(script, /printf '%s\\tcurrent\\t%s\\n' 'appearance.top-bar.position' "\$\(omarchy-bar position 2>\/dev\/null \| head -n1\)"/);
  assert.match(script, /omarchy-language list 2>\/dev\/null \| while IFS=\$'\\t' read -r name code english/);
  assert.deepEqual(plain(om.parseReaders('power-profile\tcurrent\tbalanced\npower-profile\titem\tbalanced\tbalanced\nx\nsetup.language\titem\tde\tDeutsch\n')),
    {'power-profile': {current: 'balanced', items: [{value: 'balanced', label: 'balanced'}]}, 'setup.language': {current: '', items: [{value: 'de', label: 'Deutsch'}]}});
  assert.match(om.askingScript(), /\\<\(sudo\|pkexec\)\\>/);
  assert.ok(om.actionWords(merged.items, merged.itemOrder).indexOf('omarchy-dns') >= 0);
});

// Omarchy's real menu: every toggle the Control Center names is still a pair
// there, and nothing else pairs up by accident.
const omarchy = process.env.OMARCHY_PATH || '/usr/share/omarchy';
const realMenu = path.join(omarchy, 'default/omarchy/omarchy-menu.jsonc');
if (fs.existsSync(realMenu)) {
  test("Omarchy's own menu: the toggle pairs are exactly the known ones", () => {
    const m = MenuModel.mergeMenuSources(MenuModel.parseMenuJsonc(fs.readFileSync(realMenu, 'utf8')), []);
    const pairs = [];
    for (let i = 0; i + 1 < m.itemOrder.length; i++) {
      const a = m.items[m.itemOrder[i]], b = m.items[m.itemOrder[i + 1]];
      if (om.togglePair(a, b)) { pairs.push(a.id); i++; }
    }
    assert.deepEqual(plain(pairs.slice().sort()), plain(Object.keys(om.TOGGLES).sort()), 'TOGGLES in OmarchySettings.js matches the menu');
    const groups = plain(om.readerGroups(m.items, m.itemOrder, MenuModel.guardReaders).map(g => g.key));
    assert.deepEqual(groups, ['appearance.top-bar.position']);
    Object.keys(om.PLACE).forEach(key => {
      const known = m.items[key] || om.LISTS.some(l => l.key === key)
      assert.ok(known, 'PLACE names ' + key + ', which the menu no longer has');
    });
  });
}

// ---------------------------------------------------------------- ControlCenter.js
const config = {plugins: [{id: 'nerdibeard.tusche-bar'}], bar: {layout: {left: [], center: [], right: []}}};
const hypr = cc.hyprFacts(JSON.stringify({values: {'general:gaps_out': 8}, effective: {'general:gaps_out': '8', 'general:gaps_in': '3', 'decoration:rounding': '6'}, error: ''}));
const live = cc.liveState({}, config, 'disabled', null, derived, hypr);

test('live state carries the Omarchy rows and the overrides', () => {
  assert.equal(live.omarchy['appearance.windows.corners'], 'appearance.windows.corners.theme');
  assert.equal(live.hypr['general:gaps_out'], '8');
  assert.equal(live.hypr['general:gaps_in'], '');
  assert.equal(live.hyprEffective['decoration:rounding'], '6');
  assert.equal(cc.liveState({}, config, 'disabled', null, null, null).omarchy, null);
  assert.equal(cc.liveState({}, config, 'disabled', null, null, {values: {}, effective: {}, error: 'not ours'}).hypr, null);
  assert.equal(cc.setting('omarchy.appearance.windows.corners', live).label, 'Corners');
  assert.equal(cc.setting('omarchy.appearance.windows.corners'), null, 'Omarchy rows come with the live state');
});

test('override values are kept canonical; steps stay in range', () => {
  assert.equal(cc.hyprValue('general:gaps_out', '8'), '8');
  assert.equal(cc.hyprValue('general:gaps_out', '8.5'), null);
  assert.equal(cc.hyprValue('general:gaps_out', '99'), null);
  assert.equal(cc.hyprValue('input:sensitivity', '-0.30000001'), '-0.3');
  assert.equal(cc.hyprValue('decoration:blur:enabled', 'yes'), null);
  assert.equal(cc.hyprValue('input:accel_profile', 'flat'), 'flat');
  assert.equal(cc.hyprValue('nope:option', '1'), null);
  assert.equal(cc.hyprStep('general:gaps_out', '40', 1), '40');
  assert.equal(cc.hyprStep('input:repeat_delay', '250', 1), '275');
  assert.equal(cc.hyprStep('decoration:dim_strength', '0.5', -1), '0.45');
  assert.deepEqual(plain(cc.hyprPayload({'general:gaps_out': '8', 'decoration:blur:enabled': 'false', 'input:accel_profile': 'flat', 'input:sensitivity': ''})),
    {'general:gaps_out': 8, 'decoration:blur:enabled': false, 'input:accel_profile': 'flat', 'input:sensitivity': null});
  assert.equal(cc.hyprFacts('nonsense'), null);
});

test('staging: only pickable Omarchy values, never on read-only rows; overrides only canonical', () => {
  let e = cc.stage({}, live, 'omarchy.appearance.windows.corners', 'appearance.windows.corners.sharp');
  assert.deepEqual(plain(e), {'omarchy.appearance.windows.corners': 'appearance.windows.corners.sharp'});
  assert.deepEqual(plain(cc.stage({}, live, 'omarchy.appearance.windows.corners', 'bogus')), {});
  assert.deepEqual(plain(cc.stage({}, live, 'omarchy.setup.network.dns', 'setup.network.dns.cloudflare')), {});
  assert.deepEqual(plain(cc.stage({}, live, 'omarchy.appearance.workspace-layout', 'appearance.workspace-layout.dwindle')), {});
  assert.equal(cc.available(live, 'omarchy.setup.network.dns'), false);
  e = cc.stage(e, live, 'hypr.general:gaps_out', '');
  e = cc.stage(e, live, 'hypr.decoration:rounding', '4');
  e = cc.stage(e, live, 'hypr.decoration:rounding', '4.5');
  assert.equal(e['hypr.general:gaps_out'], '');
  assert.equal(e['hypr.decoration:rounding'], '4');
});

test('Use: Omarchy actions first, one each, then the overrides as one step', () => {
  let e = cc.stage({}, live, 'omarchy.appearance.windows.corners', 'appearance.windows.corners.sharp');
  e = cc.stage(e, live, 'omarchy.appearance.windows.gaps-on', 'appearance.windows.gaps-off');
  e = cc.stage(e, live, 'hypr.general:gaps_out', '');
  e = cc.stage(e, live, 'hypr.decoration:rounding', '4');
  e = cc.stage(e, live, 'bar.edge', 'theme');
  const steps = plain(cc.plan(e, live));
  assert.deepEqual(steps.slice(0, 2), [
    {domain: 'omarchy', key: 'appearance.windows.corners', value: 'appearance.windows.corners.sharp', action: 'omarchy-hyprland-corners sharp'},
    {domain: 'omarchy', key: 'appearance.windows.gaps-on', value: 'appearance.windows.gaps-off', action: 'omarchy-hyprland-window-gaps-toggle'}]);
  assert.equal(steps[2].domain, 'hypr');
  assert.deepEqual(steps[2].changes, {'decoration:rounding': '4', 'general:gaps_out': ''});
  assert.deepEqual(steps[2].keys.slice().sort(), ['decoration:rounding', 'general:gaps_out']);
  assert.equal(steps[steps.length - 1].domain, 'bar');
});

test('Cancel: touched Omarchy rows and overrides back to the state from opening', () => {
  const snapshot = cc.copy(live);
  const after = cc.copy(live);
  after.omarchy['appearance.windows.corners'] = 'appearance.windows.corners.sharp';
  after.omarchy['appearance.windows.gaps-on'] = 'appearance.windows.gaps-off';
  after.hypr['general:gaps_out'] = '';
  after.hypr['decoration:rounding'] = '4';
  after.hypr['general:gaps_in'] = '7';             // changed outside, not by Use
  const steps = plain(cc.revertPlan(snapshot, after, {omarchy: {'appearance.windows.corners': true, 'appearance.windows.gaps-on': true},
                                                      hypr: {'general:gaps_out': true, 'decoration:rounding': true}}));
  assert.deepEqual(steps.slice(0, 2), [
    {domain: 'omarchy', key: 'appearance.windows.gaps-on', value: 'appearance.windows.gaps-on', action: 'omarchy-hyprland-window-gaps-toggle'},
    {domain: 'omarchy', key: 'appearance.windows.corners', value: 'appearance.windows.corners.theme', action: 'omarchy-hyprland-corners theme'}]);
  assert.equal(steps[2].domain, 'hypr');
  assert.deepEqual(steps[2].changes, {'general:gaps_out': '8', 'decoration:rounding': ''});
  assert.deepEqual(plain(cc.revertPlan(snapshot, snapshot, {omarchy: {'appearance.windows.corners': true}})), [], 'nothing differs: nothing runs');
});

test('Cancel runs in reverse and takes the action from opening for a row hidden now', () => {
  const snapshot = cc.copy(live);
  const after = cc.copy(live);
  after.omarchySpecs = after.omarchySpecs.filter(x => x.key !== 'appearance.windows.corners');   // hidden by another change
  after.omarchy['appearance.windows.corners'] = 'unknown';
  after.omarchy['appearance.windows.gaps-on'] = 'appearance.windows.gaps-off';
  const steps = plain(cc.revertPlan(snapshot, after, {omarchy: {'appearance.windows.corners': true, 'appearance.windows.gaps-on': true}}));
  assert.deepEqual(steps.map(x => x.key), ['appearance.windows.gaps-on', 'appearance.windows.corners']);
  assert.equal(steps[1].action, 'omarchy-hyprland-corners theme');
  const opened = cc.liveState({}, config, 'disabled', null, null, null);
  assert.equal(cc.fillSnapshot(opened, live, 'omarchy', {}).omarchySpecs.length, live.omarchySpecs.length, 'the rows at opening join the snapshot with their values');
});

test('a late answer fills the snapshot, except for rows Use touched', () => {
  const opened = cc.liveState({}, config, 'disabled', null, null, null);
  const filled = cc.fillSnapshot(opened, live, 'omarchy', {});
  assert.equal(filled.omarchy['appearance.windows.corners'], 'appearance.windows.corners.theme');
  const half = cc.copy(live); half.omarchy['appearance.windows.corners'] = 'unknown';
  const later = cc.copy(live); later.omarchy['appearance.windows.corners'] = 'appearance.windows.corners.sharp';
  assert.equal(cc.fillSnapshot(half, later, 'omarchy', {'appearance.windows.corners': true}), null);
  assert.equal(cc.fillSnapshot(half, later, 'omarchy', {}).omarchy['appearance.windows.corners'], 'appearance.windows.corners.sharp');
});

test('search finds Omarchy rows and overrides by command, option and menu path', () => {
  const index = cc.searchIndex(live, {});
  const ids = q => cc.search(index, q, 20).map(h => h.id);
  assert.ok(ids('corners')[0] === 'omarchy.appearance.windows.corners');
  assert.ok(ids('omarchy-hyprland-corners').indexOf('omarchy.appearance.windows.corners') >= 0);
  assert.equal(ids('gaps_out')[0], 'hypr.general:gaps_out');
  assert.ok(ids('appearance windows').indexOf('omarchy.appearance.windows.gaps-on') >= 0, 'menu path words');
  assert.ok(ids('sharp').indexOf('omarchy.appearance.windows.corners') >= 0, 'value labels');
  const gap = cc.search(index, 'outer gap', 1)[0];
  assert.equal(gap.value, '8 px');
  assert.equal(cc.search(index, 'inner gap', 1)[0].value, 'default · 3');
});

test('areas lay out their generic rows by section; advanced rows only on request', () => {
  const rows = plain(cc.areaRows('windows', live, {}));
  const heads = rows.filter(r => r.kind === 'head').map(r => r.text);
  assert.deepEqual(heads, ['WINDOWS', 'FINE VALUES', 'LAYOUT']);
  assert.ok(!rows.some(r => r.id === 'hypr.decoration:blur:size'));
  assert.ok(plain(cc.areaRows('windows', live, {advanced: true})).some(r => r.id === 'hypr.decoration:blur:size'));
  assert.deepEqual(plain(cc.areaRows('input', cc.liveState({}, config, 'disabled', null, null, null), {})).filter(r => r.kind === 'head').map(r => r.text),
                   ['KEYBOARD', 'POINTER', 'TOUCHPAD'], 'overrides show before the helper answered (as not available)');
  assert.ok(cc.sidebar().filter(r => r.kind === 'area').length === cc.AREAS.length);
});

test('Changed only: staged rows, set overrides, Tusche options away from defaults', () => {
  const rows = plain(cc.changedRows(live, cc.stage({}, live, 'omarchy.appearance.windows.corners', 'appearance.windows.corners.sharp')));
  const ids = rows.filter(r => r.kind === 'row').map(r => r.id);
  assert.ok(ids.indexOf('omarchy.appearance.windows.corners') >= 0, 'staged Omarchy row');
  assert.ok(ids.indexOf('hypr.general:gaps_out') >= 0, 'set override');
  assert.ok(ids.indexOf('omarchy.appearance.windows.gaps-on') < 0, 'unstaged Omarchy rows have no default');
  assert.ok(ids.indexOf('hypr.general:gaps_in') < 0);
  assert.equal(rows[0].kind, 'head');
});

test('health: Omarchy settings and the override file', () => {
  const rows = f => plain(cc.healthChecks(f));
  const byId = (f, id) => rows(f).find(c => c.id === id);
  assert.equal(byId({omarchy: {state: 'ok', rows: 30, readOnly: 5}}, 'omarchy').state, 'ok');
  assert.match(byId({omarchy: {state: 'ok', rows: 30, readOnly: 5}}, 'omarchy').detail, /30 read .* 5 read-only/);
  assert.equal(byId({omarchy: {state: 'failed'}}, 'omarchy').state, 'issue');
  assert.equal(byId({omarchy: {state: 'reading'}}, 'omarchy').state, 'unknown');
  assert.equal(byId({overrides: null}, 'overrides').state, 'unknown');
  assert.equal(byId({overrides: {values: {}, effective: {}, error: 'not ours'}}, 'overrides').state, 'issue');
  assert.match(byId({overrides: hypr}, 'overrides').detail, /1 value in 00-tusche-settings\.lua: general:gaps_out/);
  assert.equal(byId({}, 'overrides'), undefined, 'not shown without the facts');
});

console.log(passed + ' omarchy settings checks passed');
