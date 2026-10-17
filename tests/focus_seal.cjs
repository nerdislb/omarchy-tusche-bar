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
test('urgent workspaces come from our module when there is one, else from the native list', () => {
  assert.equal(model.urgentCount([3, 7], [{urgent: true}, {urgent: true}, {urgent: true}]), 2, 'our module wins');
  assert.equal(model.urgentCount([], [{urgent: true}]), 0, 'an empty answer from our module is an answer');
  assert.equal(model.urgentCount(null, [{urgent: true}, {urgent: false}, {urgent: true}, {}, null]), 2);
  assert.equal(model.urgentCount(undefined, [{urgent: 'yes'}]), 0, 'only a real true counts');
  for (const odd of [undefined, null, 'x', {}]) assert.equal(model.urgentCount(null, odd), 0);
  assert.equal(model.urgentCount('x', []), 0);
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
  assert(/readonly property int urgentCount: \{\s*if \(!visible\) return 0/.test(seal), 'workspaces are read only while the seal shows');
  assert(seal.includes('Model.urgentCount(w && w.urgentIds ? w.urgentIds : null, native)') && /import Quickshell\.Hyprland/.test(seal), 'native workspaces are the fallback');
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
  assert(toggle < engine.indexOf('if (action === "start" && !sealEnabled)'), 'toggle becomes start before the seal guard, so it cannot park the bar without a way back');
  assert(engine.includes('readonly property bool sealEnabled: options.seal === "on" || options.seal === "omi"'), 'both faces give the bar a way back');
  assert(engine.includes('readonly property bool releaseFocus: configLoaded && !sealEnabled'), 'turning the seal off releases our hide flag');
  assert(engine.includes('function focus(action: string): string { return root.focusAction(action || "start") }'));
});

// ---- the companion (seal: omi) ----
const isl = (o = {}) => ({unread: 0, alerts: 0, dnd: false, blocked: 0, working: 0, doneSerial: 0, ...o});
const comp = (f = {}) => plain(model.companion({battery: bat(0.9), urgent: 0, island: isl(), ...f}));
test('the companion is calm without anything to say, and without an island at all', () => {
  assert.deepEqual(comp(), {face: 'calm', tone: 'accent', level: 0.9, badge: null});
  assert.equal(comp({island: null}).face, 'calm');
  for (const odd of [undefined, 'x', 7, [], {unread: 'many'}]) assert.doesNotThrow(() => model.companion({island: odd}));
  assert.deepEqual(plain(model.companion(null)), {face: 'calm', tone: 'accent', level: 0, badge: null});
  assert.equal(model.island('x'), null);
  assert.equal(model.island(null), null);
});
test('island() is idempotent: the normalized reading can pass through it again', () => {
  const once = model.island(isl({unread: 3, alerts: 1, dnd: true, blocked: 2, working: 4, doneSerial: 7}));
  assert.deepEqual(plain(model.island(once)), plain(once));
  assert.equal(once.done, 7);
});
test('the face follows the importance: battery, alert, waiting, workspace, drained, working', () => {
  const everything = {battery: bat(0.1), urgent: 2, island: isl({alerts: 1, blocked: 1, working: 1})};
  assert.equal(comp(everything).face, 'battery');
  assert.equal(comp({...everything, battery: bat(0.1, true)}).face, 'alert', 'charging calms the battery');
  assert.equal(comp({...everything, battery: bat(0.9), island: isl({blocked: 1, working: 1})}).face, 'waiting');
  assert.equal(comp({...everything, battery: bat(0.9), island: isl({working: 1})}).face, 'attention');
  assert.equal(comp({battery: bat(0.25), urgent: 0, island: isl({working: 2})}).face, 'drained');
  assert.equal(comp({island: isl({working: 2})}).face, 'working');
});
test('battery and alert are urgent, the rest keeps the accent', () => {
  assert.equal(comp({battery: bat(0.1)}).tone, 'urgent');
  assert.equal(comp({island: isl({alerts: 1})}).tone, 'urgent');
  for (const f of [comp({island: isl({blocked: 1})}), comp({urgent: 1}), comp({battery: bat(0.25)}), comp({island: isl({working: 1})})])
    assert.equal(f.tone, 'accent');
});
test('the badge counts unread notifications, caps at 99, hides in Do Not Disturb, turns urgent with an alert', () => {
  assert.equal(comp({island: isl({unread: 1})}).badge.count, 1);
  assert.equal(comp({island: isl({unread: 21})}).badge.count, 21);
  assert.equal(comp({island: isl({unread: 400})}).badge.count, 99);
  assert.equal(comp({island: isl({unread: 3, dnd: true})}).badge, null);
  assert.equal(comp({island: isl({unread: 0})}).badge, null);
  assert.equal(comp({island: isl({unread: 3})}).badge.tone, 'accent');
  assert.equal(comp({island: isl({unread: 3, alerts: 1})}).badge.tone, 'urgent');
  assert.equal(comp({island: isl({unread: 2.9})}).badge.count, 2);
  assert.equal(comp({island: isl({unread: -4})}).badge, null);
});
test('observe: a finished agent and a new notification are events; baselines and resets are not', () => {
  const n = o => model.island(isl(o));
  assert.deepEqual(plain(model.observe(null, n())), {done: false, pop: false});
  assert.deepEqual(plain(model.observe(n(), null)), {done: false, pop: false});
  assert.deepEqual(plain(model.observe(n({doneSerial: 2}), n({doneSerial: 3}))), {done: true, pop: false});
  assert.deepEqual(plain(model.observe(n({doneSerial: 3}), n({doneSerial: 0}))), {done: false, pop: false}, 'the island restarted');
  assert.deepEqual(plain(model.observe(n({unread: 2}), n({unread: 3}))), {done: false, pop: true});
  assert.deepEqual(plain(model.observe(n({unread: 3}), n({unread: 1}))), {done: false, pop: false}, 'reading is not an event');
  assert.equal(model.observe(n({unread: 2}), n({unread: 3, dnd: true})).pop, false, 'Do Not Disturb stays quiet');
});
test('the companion is described for assistive technology', () => {
  const d = f => { const c = model.companion(f); return model.describeCompanion(c, c.level); };
  assert.equal(d({battery: bat(0.9), island: isl()}), '');
  assert.equal(d({battery: bat(0.1), island: isl({unread: 2})}), 'battery almost empty at 10 percent, 2 unread notifications');
  assert.equal(d({battery: bat(0.9), island: isl({alerts: 1, unread: 1})}), 'something failed, 1 unread notification');
  assert.equal(d({battery: bat(0.9), island: isl({blocked: 1})}), 'an agent is waiting for you');
  assert.equal(d({battery: bat(0.9), urgent: 1, island: isl()}), 'a workspace needs you');
  assert.equal(d({battery: bat(0.2), island: isl()}), 'battery low at 20 percent');
  assert.equal(d({battery: bat(0.9), island: isl({working: 1})}), 'an agent is working');
});

test('the feed ignores a read that finishes after it was switched off', () => {
  const feed = read('CompanionFeed.qml');
  assert(/function take\(text\) \{\n\s+if \(!active\) return/.test(feed));
  assert(/onActiveChanged:[\s\S]*?island = null/.test(feed), 'going quiet forgets the reading');
  assert(!/sendMessage|write\(|execDetached/.test(feed), 'read only');
});
test('the idle life asks the compositor only while Omi is on screen, respects inhibitors, and has an off switch', () => {
  const watch = read('IdleWatch.qml'), seal = read('FocusSeal.qml'), face = read('modules/OmiFace.qml'), presets = read('Presets.js');
  assert(watch.includes('IdleMonitor {') && watch.includes('respectInhibitors: true'));
  assert(watch.includes('enabled: watch.active && watch.seconds > 0'));
  assert(seal.includes('active: sealWindow.visible && sealWindow.useOmi && sealWindow.intensity !== "off"'), 'no monitor while the bar is shown or the idle life is off');
  assert(seal.includes('seconds: IdleLife.idleSeconds(sealWindow.intensity)'));
  assert(seal.includes('userIdle: idleWatch.idle') && seal.includes('hovered: hover.hovered'));
  assert(face.includes('readonly property bool idleLife: available && active && onScreen && intensity !== "off" && !Style.reduceMotion'), 'off the screen, reduced motion and off silence him');
  assert(seal.includes('onScreen: sealWindow.visible'));
  assert(face.includes('onCalmFaceChanged: if (!calmFace) { asleep = false; previewWake.stop(); stopFidgets() }'), 'anything else to say ends the idle pieces');
  assert(/running: face\.idleLife; onTriggered: face\.directorStep\(\)/.test(face), 'the director only ticks while his idle life is on');
  assert(face.includes('onIdleLifeChanged: if (!idleLife) { asleep = false; stopFidgets()'), 'switching it off wakes him');
  assert(/sealIdle: \{[\s\S]*?variants: \[\s*\{ id: "lively"[\s\S]*?\{ id: "gentle"[\s\S]*?\{ id: "off"/.test(presets), 'lively by default, gentle, off');
  const engine = read('Engine.qml');
  assert(engine.includes('function omi(action: string): string { return sealUi.omiPlay(action || "") }'));
  assert(engine.includes('omi: sealUi.omiState()'));
  assert(!/execDetached|Process/.test(watch + face), 'the idle life starts no processes');
});
test('the Omi install in use is a validated directory name from the pointer file, never a path', () => {
  assert.equal(model.kitDirName('omi-v1.0.0-20261017111138\n'), 'omi-v1.0.0-20261017111138');
  assert.equal(model.kitDirName('omi-legacy'), 'omi-legacy');
  for (const bad of ['', '\n', '../../etc', 'omi-../x', '/etc/passwd', 'omi-a/b', 'omi-', 'other-dir', 'omi-x y', null, undefined, 42])
    assert.equal(model.kitDirName(bad), '', JSON.stringify(bad));
  assert.equal(model.kitDirName('omi-ok\nsecond line'), 'omi-ok', 'only the first line counts');
  const kit = read('OmiKit.qml'), seal = read('FocusSeal.qml'), fetch = read('setup/omi-fetch.sh');
  assert(kit.includes('Model.kitDirName(pointer.text())') && kit.includes('watchChanges: true'));
  assert(kit.includes('"file://" + dir + "/" + name + "/Omi.qml"'), 'the URL carries the install directory, so a new install is a new URL');
  assert(seal.includes('packUrl: omiKit.url') && seal.includes('OmiKit { id: omiKit; dir: sealWindow.dataDir }'));
  assert(!/execDetached|Process\b/.test(kit), 'the pointer is read, nothing is run');
  assert(fetch.includes('mv -f -- "$base/current.tmp" "$current"'), 'the pointer changes in one atomic step');
  assert(/sha256sum/.test(fetch) && fetch.includes('refusing to install'));
});
test('the shared Omi is wired to the face and its own option, and runs only for an installed Omi', () => {
  const seal = read('FocusSeal.qml'), face = read('modules/OmiFace.qml'), share = read('OmiShare.qml'), presets = read('Presets.js'), fetch = read('setup/omi-fetch.sh');
  assert(seal.includes('active: sealWindow.wantsOmi && sealWindow.shareOn && omiFace.available'), 'only while Omi is wanted, installed, and sharing is on');
  assert(seal.includes('modes: omiFace.modeIds') && seal.includes('shared: omiShare.state'));
  assert(face.includes('readonly property string sharedMode: companion.face === "calm" || companion.face === "working" ? Share.shown(shared, modeIds) : ""'), 'his own states come first');
  assert(face.includes('readonly property bool calmFace: (companion.face === "calm" || companion.face === "working") && sharedMode === ""'), 'the idle life stands down for the shared face');
  assert(/sealShare: \{[\s\S]*?\{ id: "on"[\s\S]*?\{ id: "off"/.test(presets), 'on by default, off');
  assert(share.includes('Proto.socketPath(Quickshell.env("OMI_SOCKET"), Quickshell.env("XDG_RUNTIME_DIR"))'), 'only the user\'s own runtime directory');
  assert(!/execDetached|Process\b/.test(share), 'the service starts no processes');
  const hook = read('setup/omi-shell.bash');
  assert(hook.includes('__omi_trap EXIT __omi_exit') && hook.includes('__omi_trap DEBUG __omi_before'), 'the hook ends cleanly with its shell and keeps the traps it finds');
  assert(!/bashrc/.test(fetch), 'nothing from upstream is sourced into a shell: our own hook is used');
  assert(read('Engine.qml').includes('omi: sealUi.omiState()'));
});
console.log(`${passed} focus seal checks passed`);
