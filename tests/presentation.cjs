const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const root = path.resolve(__dirname, '..');
const p = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'Presets.js'), 'utf8'), p);
const cc = vm.createContext({Presets:p});
vm.runInContext(fs.readFileSync(path.join(root, 'ControlCenter.js'), 'utf8').replace(/^\.(pragma|import).*$/mg,''), cc);
const plain = x => JSON.parse(JSON.stringify(x));
let checks = 0;
function test(label, run) { run(); checks++; console.log('PASS ' + label); }

test('optional additions default off and never rebuild the native layout', () => {
  for (const key of ['statusHints','seal','dayline','urgentFrame']) {
    assert.equal(p.normalizeOptions({})[key], 'off');
    assert.equal(p.layoutDiffers({[key]:'on'},{}), false);
    assert.equal(p.keepLook(p.PRESETS[1].options,{[key]:'on'})[key], 'on');
  }
});
test('profiles are presentation-only with deterministic validation and fallback', () => {
  const profiles = JSON.parse('{"HDMI-A-1":"detailed","eDP-1":"compact","bad name":"compact","constructor":"compact","__proto__":"detailed","DP-1":"other"}');
  assert.deepEqual(plain(p.normalizeScreens(profiles)), {'HDMI-A-1':'detailed','eDP-1':'compact'});
  assert.equal(p.screenValue(profiles,'HDMI-A-1','workspaces','pips'),'minimap');
  assert.equal(p.screenValue(profiles,'eDP-1','ai','rings'),'ondemand');
  assert.equal(p.screenValue(profiles,'HDMI-A-1','logo','nerdibeard'),'nerdibeard');
  assert.equal(p.screenValue(profiles,'DP-2','right','groups'),'groups');
  assert.deepEqual(plain(p.normalizeScreens(['compact'])),{});
});
const config = profiles => ({unrelated:{keep:1},plugins:[{id:'nerdibeard.tusche-bar',screenProfiles:profiles}]});
test('profile choices stage without writes and prune after Use', () => {
  const live = cc.liveState({},config({'eDP-1':'compact'}),'disabled');
  const before = JSON.stringify(live);
  const edits = cc.stage({},live,'screens.eDP-1','detailed');
  assert.equal(cc.pendingState(live,edits).screens['eDP-1'],'detailed');
  assert.equal(JSON.stringify(live),before);
  const step = cc.plan(edits,live)[0];
  assert.equal(step.domain,'screens');
  const next = cc.screenOptions(step,{'eDP-1':'compact','DP-2':'detailed'});
  assert.deepEqual(plain(next),{'DP-2':'detailed','eDP-1':'detailed'});
  assert.deepEqual(plain(cc.prune(edits,cc.liveState({},config(next),'disabled'))),{});
  assert.deepEqual(plain(cc.stage({},live,'screens.constructor','compact')),{});
  assert.deepEqual(plain(cc.stage({},live,'screens.eDP-1','unknown')),{});
});
test('Cancel restores only touched screens and preserves later unrelated overrides', () => {
  const before = cc.liveState({},config({'eDP-1':'compact'}),'disabled');
  const live = cc.liveState({},config({'eDP-1':'detailed','DP-1':'compact','DP-2':'detailed'}),'disabled');
  const restore = cc.revertPlan(before,live,{screens:{'eDP-1':true,'DP-1':true}});
  assert.equal(restore.length,1);
  assert.deepEqual(plain(cc.screenOptions(restore[0],live.screens)),{'DP-2':'detailed','eDP-1':'compact'});
  assert.equal(cc.revertPlan(before,live,{}).length,0);
  const inherited = cc.plan(cc.stage({},live,'screens.eDP-1','inherit'),live)[0];
  assert.equal(cc.screenOptions(inherited,live.screens)['eDP-1'],undefined);
});
test('bar and screen writes are separate ordered steps', () => {
  const live=cc.liveState({},config({}),'disabled');
  let edits=cc.stage({},live,'screens.eDP-1','detailed');
  edits=cc.stage(edits,live,'bar.dayline','on');
  assert.deepEqual(plain(cc.plan(edits,live).map(s=>s.domain)),['bar','screens']);
});
test('atomic profile writer preserves layout, options, unrelated config and private mode', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bar-profile-test-'));
  try {
    const file=path.join(dir,'shell.json');
    const original={bar:{position:'bottom',layout:{left:['omamail'],right:['audio']}},
      plugins:[{id:'nerdibeard.tusche-bar',options:{edge:'theme',logo:'nerdibeard'},other:'keep'},{id:'another',value:7}],custom:{keep:true}};
    fs.writeFileSync(file,JSON.stringify(original),{mode:0o600});
    const run=request=>cp.spawnSync('python3',[path.join(root,'bin/apply-layout.py')],{env:{...process.env,OMARCHY_SHELL_JSON:file},input:JSON.stringify({pluginId:'nerdibeard.tusche-bar',profilesOnly:true,...request}),encoding:'utf8'});
    assert.equal(run({screenProfiles:{'eDP-1':'detailed'}}).status,0);
    const result=JSON.parse(fs.readFileSync(file));
    assert.deepEqual(result.plugins[0].screenProfiles,{'eDP-1':'detailed'});
    delete result.plugins[0].screenProfiles;
    assert.deepEqual(result,original);
    assert.equal(fs.statSync(file).mode & 0o777,0o600);
    const before=fs.readFileSync(file,'utf8');
    for (const profile of [null,[],{'bad name':'compact'},{'DP-1':'invalid'},JSON.parse('{"__proto__":"compact"}')]) {
      assert.notEqual(run({screenProfiles:profile}).status,0);
      assert.equal(fs.readFileSync(file,'utf8'),before);
    }
    assert.equal(run({screenProfiles:{}}).status,0);
    assert.deepEqual(JSON.parse(fs.readFileSync(file)).plugins[0].screenProfiles,{});
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
console.log('PRESENTATION_RESULT '+checks);
