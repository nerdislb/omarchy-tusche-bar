#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');
const {spawnSync} = require('node:child_process');

const root = path.resolve(__dirname, '..');
const model = {};
vm.createContext(model);
vm.runInContext(fs.readFileSync(path.join(root, 'StatusHints.js'), 'utf8'), model);
const plain = value => JSON.parse(JSON.stringify(value));
let passed = 0;
function test(name, run) { run(); passed++; console.log('PASS:', name); }
const audio = (percent, muted = false, id = 'speaker') => ({ready: true, id, name: 'Speakers', percent, muted});
const brightness = (percent, id = 'eDP-1') => ({ready: true, id, percent});
const bluetooth = (devices = [], on = true, id = 'hci0') => ({ready: true, id, devices: devices.map(d => typeof d === 'string' ? {id: d, name: d} : d), on});
const sample = (state, channel, value, at = 1000, suppressed = false) => model.observe(state, channel, value, at, suppressed);
function ready(channel, value, at = channel === 'bluetooth' ? -4000 : 0) { return sample(model.initial(true), channel, value, at); }
const disconnected = name => ({id: name, name, connected: false});

test('disabled means no baselines, hint or hidden event queue', () => {
  let state = model.initial(false);
  state = sample(state, 'audio', audio(50), 1000);
  assert.deepEqual(plain(state), {enabled: false, channels: {}, hint: null});
});
test('every channel starts silently, including sources that arrive much later', () => {
  let state = model.initial(true);
  state = sample(state, 'audio', audio(50), 1000);
  state = sample(state, 'brightness', {ready: false}, 2000);
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 8000);
  state = sample(state, 'brightness', brightness(60), 90000);
  assert.equal(state.hint, null);
  assert.equal(state.channels.brightness.settleUntil, 90000 + model.SETTLE_MS);
});
test('per-channel initialization bursts are silent through the settle boundary', () => {
  let state = ready('audio', audio(0));
  state = sample(state, 'audio', audio(35), model.SETTLE_MS - 1);
  assert.equal(state.hint, null);
  state = sample(state, 'audio', audio(36), model.SETTLE_MS);
  assert.equal(state.hint.text, 'Volume 36%');
});
test('normal changes show once; repeating identical readings does not extend expiry', () => {
  let state = ready('audio', audio(30));
  state = sample(state, 'audio', audio(35), 1000);
  assert.equal(state.hint.text, 'Volume 35%');
  assert.equal(state.hint.until, 1000 + model.HINT_MS);
  state = sample(state, 'audio', audio(35), 1500);
  assert.equal(state.hint.until, 1000 + model.HINT_MS);
});
test('expiry is exact at its boundary and no content is queued afterwards', () => {
  let state = sample(ready('audio', audio(30)), 'audio', audio(35), 1000);
  state = model.expire(state, 1000 + model.HINT_MS - 1);
  assert.equal(state.hint.text, 'Volume 35%');
  state = model.expire(state, 1000 + model.HINT_MS);
  assert.equal(state.hint, null);
  state = model.expire(state, 999999);
  assert.equal(state.hint, null);
});
test('the latest channel wins without moving or queuing the earlier hint', () => {
  let state = ready('audio', audio(30));
  state = sample(state, 'brightness', brightness(50), 0);
  state = sample(state, 'audio', audio(35), 1000);
  state = sample(state, 'brightness', brightness(60), 1100);
  assert.deepEqual(plain(state.hint), {kind: 'brightness', text: 'Brightness 60%', until: 1100 + model.HINT_MS});
});
test('integer display values filter measurement noise without blocking real changes', () => {
  let state = ready('audio', audio(49.8));
  state = sample(state, 'audio', audio(50.2), 1000);
  assert.equal(state.hint, null);
  state = sample(state, 'audio', audio(51), 1100);
  assert.equal(state.hint.text, 'Volume 51%');
});
test('mute announces, muted gain changes stay quiet, unmute shows latest gain', () => {
  let state = ready('audio', audio(50));
  state = sample(state, 'audio', audio(50, true), 1000);
  assert.equal(state.hint.text, 'Muted');
  state = sample(state, 'audio', audio(70, true), 1200);
  assert.equal(state.hint.text, 'Muted');
  assert.equal(state.hint.until, 1000 + model.HINT_MS);
  state = sample(state, 'audio', audio(70, false), 1500);
  assert.equal(state.hint.text, 'Volume 70%');
});
test('zero volume differs from mute and boosted output values remain accurate', () => {
  let state = ready('audio', audio(50));
  state = sample(state, 'audio', audio(0), 1000);
  assert.equal(state.hint.text, 'Volume 0%');
  state = sample(state, 'audio', audio(150), 1100);
  assert.equal(state.hint.text, 'Volume 150%');
});
test('output device changes name the real native output; renaming alone is silent', () => {
  let state = ready('audio', audio(50));
  state = sample(state, 'audio', {...audio(50, false, 'headset'), name: 'Buds'}, 1000);
  assert.equal(state.hint.text, 'Buds · 50%');
  state = sample(state, 'audio', {...audio(50, false, 'headset'), name: 'Renamed Buds'}, 1100);
  assert.equal(state.hint.until, 1000 + model.HINT_MS);
});
test('availability loss clears that source only and reconnection begins silently', () => {
  let state = ready('audio', audio(50));
  state = sample(state, 'brightness', brightness(50), 0);
  state = sample(state, 'audio', audio(60), 1000);
  state = sample(state, 'brightness', {ready: false}, 1010);
  assert.equal(state.hint.kind, 'audio');
  state = sample(state, 'audio', {ready: false}, 1020);
  assert.equal(state.hint, null);
  state = sample(state, 'audio', audio(80), 10000);
  assert.equal(state.hint, null);
});
test('invalid readings never become zero-valued or NaN hints', () => {
  for (const bad of [NaN, Infinity, -1, 1001, undefined, null, '50']) {
    const state = sample(ready('audio', audio(50)), 'audio', audio(bad), 1000);
    assert.equal(state.hint, null);
    assert.equal(state.channels.audio, undefined);
  }
  for (const bad of [-1, 101, NaN]) {
    const state = sample(ready('brightness', brightness(50)), 'brightness', brightness(bad), 1000);
    assert.equal(state.hint, null);
  }
});
test('monitor focus changes do not announce a different display as a level change', () => {
  let state = ready('brightness', brightness(50, 'eDP-1'));
  state = sample(state, 'brightness', brightness(80, 'DP-1'), 1000);
  assert.equal(state.hint, null);
  state = sample(state, 'brightness', brightness(85, 'DP-1'), 1100);
  assert.equal(state.hint.text, 'Brightness 85%');
});
test('Bluetooth connects and disconnects carry the changed device name', () => {
  let state = ready('bluetooth', bluetooth([disconnected('Buds')]));
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 1000);
  assert.equal(state.hint.text, 'Connected · Buds');
  state = sample(state, 'bluetooth', bluetooth(), 1100);
  assert.equal(state.hint.text, 'Disconnected · Buds');
});
test('late BlueZ objects already connected establish silent per-device baselines', () => {
  let state = ready('bluetooth', bluetooth());
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 20000);
  assert.equal(state.hint, null);
  state = sample(state, 'bluetooth', bluetooth([disconnected('Buds')]), 21000);
  assert.equal(state.hint.text, 'Disconnected · Buds');
  state = sample(state, 'bluetooth', bluetooth(['Buds']), 22000);
  assert.equal(state.hint.text, 'Connected · Buds');
});
test('Bluetooth readiness allows its native four-second enumeration burst', () => {
  let state = ready('bluetooth', bluetooth([disconnected('Buds')]), 0);
  state = sample(state, 'bluetooth', bluetooth(['Buds']), model.BLUETOOTH_SETTLE_MS - 1);
  assert.equal(state.hint, null);
  state = sample(state, 'bluetooth', bluetooth([disconnected('Buds')]), model.BLUETOOTH_SETTLE_MS);
  assert.equal(state.hint.text, 'Disconnected · Buds');
});
test('Bluetooth reordering and friendly-name updates do not announce reconnection', () => {
  let state = ready('bluetooth', bluetooth(['Buds', 'Mouse']));
  state = sample(state, 'bluetooth', bluetooth(['Mouse', 'Buds']), 1000);
  assert.equal(state.hint, null);
  state = sample(state, 'bluetooth', bluetooth([{id: 'Mouse', name: 'New name'}, 'Buds']), 1100);
  assert.equal(state.hint, null);
});
test('Bluetooth radio off wins over disconnect churn; adapter replacement stays quiet', () => {
  let state = ready('bluetooth', bluetooth(['Buds', 'Mouse']));
  state = sample(state, 'bluetooth', bluetooth([], false), 1000);
  assert.equal(state.hint.text, 'Bluetooth off');
  state = sample(state, 'bluetooth', bluetooth(['Mouse'], false), 1100);
  assert.equal(state.hint.until, 1000 + model.HINT_MS);
  state = model.expire(state, 10000);
  state = sample(state, 'bluetooth', bluetooth(['Mouse'], true, 'hci1'), 10000);
  assert.equal(state.hint, null);
});
test('simultaneous device transitions summarize the final connected count', () => {
  let state = ready('bluetooth', bluetooth(['Old buds', disconnected('New buds'), disconnected('Mouse')]));
  state = sample(state, 'bluetooth', bluetooth(['New buds', 'Mouse']), 1000);
  assert.equal(state.hint.text, '2 devices connected');
  state = sample(state, 'bluetooth', bluetooth(['Other buds']), 1100);
  assert.equal(state.hint.text, '1 device connected');
});
test('suppressed sources advance baselines without replay and clear their active hint', () => {
  let state = ready('audio', audio(50));
  state = sample(state, 'audio', audio(55), 1000);
  state = sample(state, 'audio', audio(60), 1100, true);
  assert.equal(state.hint, null);
  state = sample(state, 'audio', audio(60), 1200, false);
  assert.equal(state.hint, null);
  state = sample(state, 'audio', audio(65), 1300, false);
  assert.equal(state.hint.text, 'Volume 65%');
});
test('disable/re-enable discards old events and gives every source a fresh baseline', () => {
  let state = sample(ready('audio', audio(50)), 'audio', audio(60), 1000);
  state = model.configure(state, false);
  assert.deepEqual(plain(state), {enabled: false, channels: {}, hint: null});
  state = model.configure(state, true);
  state = sample(state, 'audio', audio(70), 9000);
  assert.equal(state.hint, null);
});
test('markup-shaped device labels stay literal and bounded single-line strings', () => {
  let state = ready('bluetooth', bluetooth([{id: 'safe', name: 'Buds', connected: false}]));
  state = sample(state, 'bluetooth', bluetooth([{id: 'safe', name: '<img src="https://example.invalid/tracker">\n\u001b[1m Buds'}]), 1000);
  assert(state.hint.text.includes('<img src='));
  assert(!/[\n\r\u001b]/.test(state.hint.text));
  assert(model.clean('x'.repeat(10000)).length <= 160);
});
test('device collections are bounded, deduplicated and prototype-shaped IDs remain data', () => {
  const devices = [{id: '__proto__', name: 'Safe'}, {id: '__proto__', name: 'Duplicate'}, ...Array.from({length: 1000}, (_, i) => ({id: String(i), name: 'n'}))];
  const value = model.normalized('bluetooth', {ready: true, on: true, devices});
  assert.equal(value.devices.filter(d => d.id === '__proto__').length, 1);
  assert(value.devices.length <= 64);
});
test('reducers do not mutate previous snapshots or caller-owned samples', () => {
  const value = Object.freeze(audio(50));
  const state = ready('audio', value);
  const before = JSON.stringify(state);
  Object.freeze(state.channels.audio.value);
  Object.freeze(state.channels.audio);
  Object.freeze(state.channels);
  Object.freeze(state);
  sample(state, 'audio', Object.freeze(audio(60)), 1000);
  assert.equal(JSON.stringify(state), before);
});
test('Island ownership honors active layout settings and explicit disabling', () => {
  const id = 'nerdibeard.tusche-island';
  const config = {bar: {layout: {center: [{id, volume: true, brightness: false, bluetooth: false}]}}};
  assert.deepEqual(plain(model.islandOwners(config)), {audio: true, brightness: false, bluetooth: false});
  config.disabledPlugins = [id];
  assert.deepEqual(plain(model.islandOwners(config)), {audio: false, brightness: false, bluetooth: false});
  assert.deepEqual(plain(model.islandOwners({bar: {layout: {center: [id]}}})), {audio: false, brightness: false, bluetooth: true});
});
test('Island OSD suppression requires actual native OSD takeover configuration', () => {
  const config = {plugins: [{id: 'nerdibeard.tusche-island', osd: true, bluetooth: false}]};
  assert.deepEqual(plain(model.islandOwners(config)), {audio: false, brightness: false, bluetooth: false});
  config.disabledPlugins = ['omarchy.osd'];
  assert.deepEqual(plain(model.islandOwners(config)), {audio: true, brightness: true, bluetooth: false});
});
test('live readout is plain text, fixed-width, motion-independent and has no click target', () => {
  const hint = fs.readFileSync(path.join(root, 'modules/StatusHint.qml'), 'utf8');
  const status = fs.readFileSync(path.join(root, 'modules/Status.qml'), 'utf8');
  const face = fs.readFileSync(path.join(root, 'modules/StatusFace.qml'), 'utf8');
  assert.equal((hint.match(/textFormat: Text\.PlainText/g) || []).length, 2);
  assert(hint.includes('implicitWidth: Style.space(166)'));
  assert(!/WidgetButton|MouseArea|TapHandler|HoverHandler|Timer|Process|FileView|reduceMotion/.test(hint));
  assert(!/WidgetButton|MouseArea|TapHandler|HoverHandler|Timer|Process|FileView/.test(face));
  assert(status.includes('width: root.hintsEnabled ? implicitWidth : 0'));
  assert(status.includes('running: root.hintsEnabled && root.hintFocused && !root.hintOwners.brightness'));
  assert(status.includes('typeof root.hintMonitor.refresh === "function"'));
  assert(!/reduceMotion/.test(fs.readFileSync(path.join(root, 'StatusHints.js'), 'utf8')));
});
console.log(`${passed} status-hint checks passed`);

// Optional real-Qt smoke. Only Commons palette/spacing is a fixture; the two
// renderers and transition model below are the unchanged production files.
// No live Status/backend is mounted and no device or installed config changes.
if (process.argv.includes('--qml')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'status-hints-qt-'));
  try {
    fs.mkdirSync(path.join(tmp, 'Commons'));
    fs.writeFileSync(path.join(tmp, 'Commons/qmldir'), 'module qs.Commons\nsingleton Style 1.0 Style.qml\nsingleton Util 1.0 Util.qml\n');
    fs.writeFileSync(path.join(tmp, 'Commons/Style.qml'), `pragma Singleton
import QtQuick
QtObject { property bool reduceMotion: false; property var font: ({family: "monospace", icon: 16, bodySmall: 12}); function space(n) { return n } }
`);
    fs.writeFileSync(path.join(tmp, 'Commons/Util.qml'), `pragma Singleton
import QtQuick
QtObject { function alpha(c, a) { return Qt.rgba(c.r, c.g, c.b, a) } }
`);
    for (const name of ['StatusFace.qml', 'StatusHint.qml']) fs.copyFileSync(path.join(root, 'modules', name), path.join(tmp, name));
    fs.copyFileSync(path.join(root, 'StatusHints.js'), path.join(tmp, 'StatusHints.js'));
    fs.writeFileSync(path.join(tmp, 'shell.qml'), `import QtQuick
import Quickshell
import qs.Commons
import "StatusHints.js" as Hints
FloatingWindow {
 id: app
 visible: true; implicitWidth: 480; implicitHeight: 100
 property var state: Hints.observe(Hints.initial(true), "audio", {ready:true,percent:50,id:"speaker"}, 0, false)
 property int phase: 0
 property int assertions: 0
 property real originalWidth: 0
 property real originalX: 0
 function check(ok, message) { assertions++; if (!ok) throw new Error(message) }
 Row {
  id: row
  anchors.centerIn: parent
  StatusFace { width:32; height:30; group:"net"; wifiUp:true; vpnUp:true; tailscaleUp:true; bluetoothConnected:true; ink:"#171c24"; accent:"#286c3a"; urgent:"#a52323" }
  StatusFace { width:58; height:30; group:"phone"; phone:({online:true,charge:15,charging:false}); ink:"#171c24"; urgent:"#a52323" }
  StatusFace { id: systemFace; width:32; height:30; group:"system"; cpu:.6; sysHot:true; ink:"#171c24"; urgent:"#a52323" }
  StatusHint { id: readout; barSize:30; ink:"#171c24"; text:app.state.hint ? app.state.hint.text : ""; kind:app.state.hint ? app.state.hint.kind : "" }
  Item { id: nextTarget; width:32; height:30 }
 }
 Timer {
  interval:100; repeat:true; running:true
  onTriggered: {
   try {
    if (app.phase === 0) {
     app.originalWidth = readout.width; app.originalX = nextTarget.x
     app.check(readout.text === "" && app.originalWidth === 166, "silent reserved-width baseline")
     app.check(systemFace.chipLevel(.6) === 4, "production chip fill")
     app.state = Hints.observe(app.state, "audio", {ready:true,percent:60,id:"speaker"}, 1000, false)
    } else if (app.phase === 1) {
     app.check(readout.text === "Volume 60%", "real-QML source transition is visible")
     app.check(readout.width === app.originalWidth && nextTarget.x === app.originalX, "hint appearance cannot move target")
     Style.reduceMotion = true
     app.state = Hints.observe(app.state, "audio", {ready:true,percent:65,id:"speaker"}, 1100, false)
    } else if (app.phase === 2) {
     app.check(readout.text === "Volume 65%", "reduced motion retains information")
     app.state = Hints.expire(app.state, 1100 + Hints.HINT_MS)
    } else if (app.phase === 3) {
     app.check(readout.text === "", "deadline clears real-QML readout")
     app.check(readout.width === app.originalWidth && nextTarget.x === app.originalX, "hint expiry cannot move target")
     app.state = {hint:{kind:"bluetooth",text:"<img src='https://example.invalid/tracker'>"}}
    } else if (app.phase === 4) {
     app.check(readout.text.indexOf("<img") === 0, "markup-shaped input stays literal")
     var texts = readout.children.filter(function(c) { return c.textFormat !== undefined })
     app.check(texts.length === 2, "both production Text nodes inspected")
     texts.forEach(function(t) { app.check(t.textFormat === Text.PlainText, "plain text only") })
     app.check(readout.width === app.originalWidth && nextTarget.x === app.originalX, "long device label cannot move target")
     console.log("STATUS_HINT_QML_PASS " + app.assertions)
     stop()
     Qt.exit(0)
    }
    app.phase++
   } catch (e) { stop(); console.error("STATUS_HINT_QML_FAIL " + e); Qt.exit(1) }
  }
 }
}
`);
    const result = spawnSync('timeout', ['--signal=TERM', '--kill-after=3s', '15s', 'xvfb-run', '-a', '-s', '-screen 0 640x240x24', 'quickshell', '-n', '-p', tmp], {
      encoding: 'utf8', timeout: 20000,
      env: {...process.env, QT_QPA_PLATFORM: 'xcb', QSG_RHI_BACKEND: 'opengl', LIBGL_ALWAYS_SOFTWARE: '1', QT_LOGGING_RULES: 'quickshell.dbus*:false'}
    });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.equal(result.status, 0, result.error ? String(result.error) + '\n' + output : output);
    assert.match(output, /STATUS_HINT_QML_PASS 12/, output);
    assert(!/ReferenceError|TypeError|Binding loop|STATUS_HINT_QML_FAIL|Failed to load/i.test(output), output);
    console.log('PASS: 12 native Qt checks (shared faces, plain text, stable target geometry, reduced motion, expiry)');
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
}
