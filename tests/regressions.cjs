const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
// The Tusche Island next to the bar (its folder before the rename as the fallback).
const islandDir = process.env.TUSCHE_ISLAND_DIR || ['../omarchy-tusche-island', '../omarchy-amiga-island'].map(d => path.resolve(root, d)).find(d => fs.existsSync(d));
assert(islandDir, 'the Tusche Island repository next to the bar (../omarchy-tusche-island)');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'Presets.js'), 'utf8').replace('.pragma library', ''), ctx);
const plain = value => JSON.parse(JSON.stringify(value));
const base = {left: ['omarchy.menu', 'omarchy.workspaces', 'nerdibeard.ai-usage'], center: ['nerdibeard.tusche-island', 'omarchy.weather'], right: [{id:'omarchy.tailscale', recentMullvadRegions:['old']}, 'omarchy.network', 'flux', 'omamail', 'io.github.moizibnyousaf.omawhatsapp', 'omarchy.audio']};
for (const preset of ctx.PRESETS) {
 const original = JSON.stringify(base);
 const built = ctx.build(base, preset.options, '/plugin/modules');
 assert.equal(JSON.stringify(base), original);
 assert(built.right.some(e => ctx.entryId(e) === 'omamail'));
 assert(built.right.some(e => ctx.entryId(e) === 'io.github.moizibnyousaf.omawhatsapp'));
 if (preset.id === 'today') assert.deepEqual(plain(built), base);
 else assert(ctx.hasOwn(built));
}
const current = ctx.build(base, ctx.presetById('tidy').options, '/plugin/modules');
current.right.find(e => e.id === 'tusche.status').embeds['omarchy.tailscale'].recentMullvadRegions = ['new'];
const merged = ctx.mergeEmbeddedSettings(base, current);
assert.deepEqual(plain(ctx.build(merged, ctx.presetById('today').options, '/plugin/modules')).right[0].recentMullvadRegions, ['new']);
assert.deepEqual(base.right[0].recentMullvadRegions, ['old']);
// Actual QML functions in isolation: each scope gets an independent startup baseline.
function functionSource(text, name, indent = '  ') {
 const from=text.indexOf(indent+'function '+name+'(');
 assert(from >= 0, name);
 const to=text.indexOf('\n'+indent+'}', from)+indent.length+2;
 return text.slice(from,to);
}
const failures=fs.readFileSync(path.join(islandDir, 'sources/Failures.qml'),'utf8');
const alarms=[];
const failureCtx={initializedScopes:{},knownUnits:null,island:{announceFailure:e=>alarms.push(e)}};
vm.createContext(failureCtx);
vm.runInContext(functionSource(failures,'quote')+'\n'+functionSource(failures,'scanned'),failureCtx);
failureCtx.scanned('user','old-user.service failed');
failureCtx.scanned('system','old-system.service failed');
assert.equal(alarms.length,0);
failureCtx.scanned('system','old-system.service failed\nfoo\\x2dbar.service failed');
assert.equal(alarms.length,1);
assert.deepEqual([alarms[0].kind, alarms[0].scope, alarms[0].name], ['unit', 'system', 'foo\\x2dbar.service']);
assert(alarms[0].command.includes("'foo\\x2dbar.service'"));
const cp=require('node:child_process');
for (const value of ["foo\\x2dbar.service", "strange'name.service", '$(echo nope).service']) {
 const out=cp.execFileSync('sh',['-c','printf %s '+failureCtx.quote(value)],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 assert.equal(out,value);
}
// Focus routing uses one shared handler and chooses the visible focused output.
const bus=fs.readFileSync(path.join(root,'bridge/ModuleBus.qml'),'utf8');
const mk=name=>({QsWindow:{window:{visible:true,screen:{name}}}});
const a=mk('eDP-1'), b=mk('HDMI-A-1');
const bc={instances:{status:[a,b]},Hyprland:{focusedMonitor:{name:'HDMI-A-1'}}};
vm.createContext(bc); vm.runInContext(functionSource(bus,'focusedScreenName')+'\n'+functionSource(bus,'pick'),bc);
assert.equal(bc.pick('status'),b);
b.QsWindow.window.visible=false;
assert.equal(bc.pick('status'),a);
bc.Hyprland.focusedMonitor = null;
bc.instances.workspaces = [{snapshot:{active:{id:3},workspaces:[{id:3,monitor:'HDMI-A-1'}]}}];
b.QsWindow.window.visible = true;
assert.equal(bc.pick('status'),b,'Lua monitor fallback reuses the existing workspace snapshot');
bc.instances.workspaces = [];
assert.equal(bc.pick('status'),a,'unknown focus chooses one visible owner, never all monitors');
console.log('PASS: presets, native-widget preservation, embedded settings round-trip, startup alarms, shell quoting, focused-output routing');
// Layout-induced hover events at a stationary global position must not take
// selection away from keyboard navigation in the drop-down. Local coordinates may change.
const menuSource = fs.readFileSync(path.join(root, 'DropMenu.qml'), 'utf8');
const pointerCtx = {pointerKnown:false, pointerX:0, pointerY:0, keyboard:true, keys:{}};
vm.createContext(pointerCtx);
vm.runInContext(functionSource(menuSource, 'pointerMoved', '    '), pointerCtx);
const areaAt = (x,y) => ({mapToItem:(_,mx,my)=>({x:x+mx,y:y+my})});
assert.equal(pointerCtx.pointerMoved(areaAt(0,0), {x:55,y:15}), false);
assert.equal(pointerCtx.pointerMoved(areaAt(40,0), {x:15,y:15}), false);
assert.equal(pointerCtx.keyboard, true);
assert.equal(pointerCtx.pointerMoved(areaAt(40,0), {x:16,y:15}), true);
assert.equal(pointerCtx.keyboard, false, 'real motion hands selection back to the pointer');
assert.equal(pointerCtx.pointerMoved(areaAt(40,0), {x:16,y:15}), false);
console.log('PASS: stationary/recreated hover ignored; physical pointer motion accepted');

// Preset ids of the Amiga Bar this grew out of: heute/k1/k3 still resolve, k2 is gone.
{
  assert.deepEqual(plain(ctx.PRESETS.map(p => p.id)), ['today', 'tidy', 'focus']);
  assert.equal(ctx.presetById('heute').id, 'today');
  assert.equal(ctx.presetById('k1').id, 'tidy');
  assert.equal(ctx.presetById('k3').id, 'focus');
  assert.equal(ctx.presetById('k2'), null);
  assert.equal(ctx.presetById('nope'), null);
  // Own module ids: tusche.*, and the Amiga Bar's amiga.* (a layout it built is recognised and replaced).
  assert(ctx.isOwn('tusche.status') && ctx.isOwn('amiga.status'));
  assert(!ctx.isOwn('omarchy.workspaces') && !ctx.isOwn('nerdibeard.tusche-island') && !ctx.isOwn(undefined));
  assert.equal(ctx.ownName('tusche.quota'), 'quota');
  assert.equal(ctx.ownName('amiga.quota'), 'quota');
  assert.equal(ctx.ownName('omarchy.audio'), 'omarchy.audio');
  const old = {left: [{id: 'amiga.workspaces', variant: 'pips', logo: 'omarchy'}, {id: 'amiga.quota', variant: 'gauge'}],
               center: ['omarchy.weather', {id: 'amiga.centre'}],
               right: [{id: 'amiga.status', variant: 'groups', embeds: {'omarchy.network': {keep: 2}}}, 'omarchy.audio']};
  assert(ctx.hasOwn(old));
  assert.deepEqual(plain(ctx.stripOwn(old)), {left: [], center: ['omarchy.weather'], right: ['omarchy.audio']});
  assert.deepEqual(plain(ctx.reconstructBase(old)), {left: ['omarchy.menu', 'omarchy.workspaces', 'nerdibeard.ai-usage', 'omarchy.agents'],
    center: ['omarchy.weather'], right: [{id: 'omarchy.network', keep: 2}, 'omarchy.audio']});
  const native = {left: ['omarchy.menu', 'omarchy.workspaces'], center: [], right: ['omarchy.network', 'omarchy.audio']};
  assert.deepEqual(plain(ctx.mergeEmbeddedSettings(native, old)).right[0], {id: 'omarchy.network', keep: 2}, 'embeds of an amiga.status entry survive');
  const rebuilt = ctx.build(ctx.reconstructBase(old), ctx.presetById('tidy').options, '/plugin/modules');
  assert(['left', 'center', 'right'].every(s => rebuilt[s].every(e => !ctx.entryId(e).startsWith('amiga.'))));
  console.log('PASS: legacy preset ids (k1 → tidy, no k2) and legacy module ids (amiga.*)');
}

// Lost base.json: every preset's layout turns back into the same native widgets.
{
  const ids = o => ['left', 'center', 'right'].flatMap(s => o[s].map(e => ctx.entryId(e))).sort();
  const full = {left: ['omarchy.menu', 'omarchy.workspaces', 'nerdibeard.ai-usage', 'omarchy.agents'], center: ['omarchy.weather'],
                right: [{id: 'omarchy.tailscale', keep: 1}, 'omarchy.network', 'flux', 'omamail', 'omarchy.bluetooth', 'omarchy.audio', 'omarchy.power']};
  for (const preset of ctx.PRESETS.concat(['groups', 'deviations'].map(right => ({options: {workspaces: 'minimap', ai: 'ondemand', right, centre: 'calm', logo: 'arch'}})))) {
    const rebuilt = ctx.reconstructBase(ctx.build(full, preset.options, '/plugin/modules'));
    assert.deepEqual(ids(rebuilt), ids(full));
    assert(!ctx.hasOwn(rebuilt));
    const ts = ['left', 'center', 'right'].flatMap(s => rebuilt[s]).find(e => ctx.entryId(e) === 'omarchy.tailscale');
    assert.equal(ts.keep, 1);
  }
  console.log('PASS: base reconstruction');
}

// The edge (and the Super+Space keys, the window frames) are look options: presets keep them, preset matching ignores them.
{
  assert.deepEqual(plain(ctx.LOOK), ['edge', 'keys', 'frames', 'glass', 'glassMotion', 'statusHints', 'dayline', 'seal', 'urgentFrame']);
  assert.equal(ctx.matchPreset(Object.assign({}, ctx.presetById('tidy').options, {frames: 'glint'})), 'tidy');
  assert.equal(ctx.layoutDiffers(Object.assign({}, ctx.presetById('tidy').options, {frames: 'glint'}), ctx.presetById('tidy').options), false, 'the frame glint never rebuilds the bar');
  const tidy = ctx.presetById('tidy').options;
  assert.equal(tidy.edge, undefined);
  assert.equal(ctx.keepLook(tidy, {edge: 'theme'}).edge, 'theme', 'a preset without an edge keeps the current one');
  assert.equal(ctx.keepLook(tidy, {edge: 'theme'}).workspaces, 'pips');
  assert.equal(ctx.keepLook(null, {edge: 'theme'}).edge, 'theme');
  assert.equal(ctx.keepLook(Object.assign({}, tidy, {edge: 'none'}), {edge: 'theme'}).edge, 'none', 'a combination saved with an edge brings it');
  assert.equal(ctx.matchPreset(Object.assign({}, tidy, {edge: 'theme'})), 'tidy');
  console.log('PASS: keepLook keeps the edge out of presets');
}

// Status variants: normalisation, folding, build/restoration; the edge never consumes a bar slot.
{
  assert.deepEqual(plain(ctx.ELEMENTS.right.variants.map(v => v.id)), ['today', 'groups', 'deviations']);
  assert.deepEqual(plain(ctx.ELEMENTS.edge.variants.map(v => v.id)), ['none', 'theme']);
  assert.equal(ctx.normalizeOptions({}).edge, 'none');
  assert.equal(ctx.normalizeOptions({edge: 'unknown'}).edge, 'none');
  assert.equal(ctx.normalizeOptions({right: 'deviations', edge: 'theme'}).right, 'deviations');
  assert.equal(ctx.normalizeOptions({right: 'unknown'}).right, 'today');
  for (const preset of ctx.PRESETS) {
    assert.equal(ctx.normalizeOptions(preset.options).edge, 'none');
    assert.equal(ctx.matchPreset(preset.options), preset.id);
  }
  for (const ai of ctx.ELEMENTS.ai.variants.map(v => v.id)) {
    assert.deepEqual(plain(ctx.foldedIds({right: 'groups', ai})), plain(ctx.foldedIds({right: 'deviations', ai})));
  }
  const grouped = plain(ctx.groupedIds());
  const full = {left: ['omarchy.menu', 'omarchy.workspaces', 'omarchy.agents'], center: ['omarchy.weather'],
    right: grouped.map(id => ({id, keep: id})).concat([{id: 'omarchy.power', keep: 'battery'},
      'omamail', 'io.github.moizibnyousaf.omawhatsapp', 'omarchy.audio'])};
  const original = JSON.stringify(full);
  const groups = ctx.build(full, {right: 'groups', edge: 'theme'}, '/plugin/modules');
  const deviations = ctx.build(full, {right: 'deviations'}, '/plugin/modules');
  const status = groups.right.find(e => e.id === 'tusche.status');
  assert.equal(status.variant, 'groups');
  assert.equal(status.source, '/plugin/modules/Status.qml');
  assert.deepEqual(plain(status.embeds), plain(deviations.right.find(e => e.id === 'tusche.status').embeds));
  assert.deepEqual(Object.keys(status.embeds).sort(), grouped.slice().sort());
  assert.equal(status.embeds['omarchy.tailscale'].keep, 'omarchy.tailscale');
  assert.deepEqual(plain(groups.right.map(ctx.entryId)),
    ['omarchy.power', 'omamail', 'io.github.moizibnyousaf.omawhatsapp', 'tusche.status', 'omarchy.audio']);
  assert.equal(JSON.stringify(full), original);
  assert.deepEqual(plain(ctx.build(full, {edge: 'theme'}, '/plugin/modules')), full);
  assert.deepEqual(plain(ctx.build(full, {right: 'groups', edge: 'none'}, '/plugin/modules')), plain(groups));
  status.embeds['omarchy.tailscale'].keep = 'edited';
  const restored = ctx.build(ctx.mergeEmbeddedSettings(full, groups), {}, '/plugin/modules');
  assert.equal(restored.right.find(e => e.id === 'omarchy.tailscale').keep, 'edited');
  assert.equal(restored.right.find(e => e.id === 'omarchy.power').keep, 'battery');
  console.log('PASS: status variants (normalisation, folding, build/restoration) and the slot-free edge');
}

// Edge "theme": light and shadow from the theme's bar-material.json (Tusche & Papier, 03.10.2026).
{
  assert.equal(ctx.ELEMENTS.edge.variants.find(v => v.id === 'theme').label, 'From the theme (light & shadow)');
  assert.equal(ctx.normalizeOptions({edge: 'theme'}).edge, 'theme');
  assert.equal(ctx.matchPreset(Object.assign({}, ctx.presetById('tidy').options, {edge: 'theme'})), 'tidy');
  const te = fs.readFileSync(path.join(root, 'ThemeEdge.qml'), 'utf8');
  assert.match(te, /bottom - px - 1/, 'the line surface keeps a transparent device pixel (1 px surfaces are never drawn)');
  assert.match(te, /WlrLayershell\.layer: WlrLayer\.Overlay/, 'the line sits over the bar');
  assert.match(te, /WlrLayershell\.layer: WlrLayer\.Top/, 'shadow/haze on Top: Bottom blends additively here');
  assert.doesNotMatch(te, /WlrLayer\.Bottom/);
  assert.match(te, /Math\.min\(depth \+ top, root\.gap\)/, 'with windows on the workspace only the gap above them');
  const mc = fs.readFileSync(path.join(root, 'MaterialCard.qml'), 'utf8');
  assert.match(mc, /matOn: !!mat && mat\.bloom !== true/, 'a material card rolls; a bloom never rolls');
  assert.match(mc, /if \(!rolls\) \{ rollOut\.stop\(\); rollIn\.stop\(\); return \}/, 'never write roll through a releasing Binding');
  assert.match(mc, /property: "gap"; value: 0; when: fp\.rolls/, 'the rolling card hangs flush from the bar');
  assert.match(mc, /rolling: rolls && roll < 0\.999 && \(panel\.open \|\| roll > 0\.001 \|\| \(!!card && card\.opacity > 0\.001\)\)/,
    'the roll mask stays until the rolled-in card has faded (no full-height flash on closing)');
  assert.match(mc, /height: parent\.height \* fp\.reveal; color: "white"/, 'a rolled-in card shows nothing (no 1 px rest), spring overshoot stays out of the mask');
  assert.match(mc, /presence: rolls \? roll : active \? grow : \(card \? card\.opacity : 0\)/, 'how far the card is out');
  // a panel that drops content on closing (Omarchy's audio panel) rolls in as it was while open
  assert.match(mc, /rollingIn: rolls && !panel\.open && roll > 0\.001/);
  assert.match(mc, /function keepSnap\(\) \{ Qt\.callLater\(fp\.takeSnap\) \}/, 'the snapshot geometry settles before it is taken');
  assert.match(mc, /live: !!fp\.panel && fp\.panel\.open\n\s*hideSource: fp\.rollingIn/, 'the snapshot freezes on closing and stands in for the card');
  assert.match(mc, /height: fp\.rollingIn \? fp\.snapH \* fp\.reveal : 0\n\s*clip: true/, 'cut to the part that is still out');
  assert.match(mc, /x: fp\.frameX - spread/, 'the shadow follows the frozen frame');
  const wsTab = fs.readFileSync(path.join(root, 'modules/Workspaces.qml'), 'utf8');
  assert.match(wsTab, /inverted: !!source && \(root\.dropOpen \|\| \(!!dropLoader\.item && dropLoader\.item\.cardPresence > 0\.01\)\)/,
    'the logo stays the menu\'s tab until the card is back in the bar');
  assert.match(fs.readFileSync(path.join(root, 'DropMenu.qml'), 'utf8'), /readonly property real cardPresence: materialCard\.presence/);
  // one MaterialCard for both repos (the island's copy differs only in its pointer line)
  const strip = t => t.replace(/^\/\/ \(Same component in the Tusche (Island|Bar): keep both copies alike\.\)$/m, '');
  const islandCard = path.join(islandDir, 'views/MaterialCard.qml');
  if (fs.existsSync(islandCard)) assert.equal(strip(fs.readFileSync(islandCard, 'utf8')), strip(mc), 'both MaterialCard copies alike');
  // callers hand over the panel and the material only
  for (const [file, re] of [['DropMenu.qml', /MaterialCard \{ id: materialCard; panel: menu; material: Bridge\.ModuleBus\.material \}/],
                            ['modules/Status.qml', /Root\.MaterialCard \{ panel: popup; material: Bridge\.ModuleBus\.material \}/],
                            ['modules/Quota.qml', /Root\.MaterialCard \{ panel: popup; material: Bridge\.ModuleBus\.material \}/]])
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), re, file);
  const engine = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  assert.match(engine, /current\/theme\.name/, 'reloads the material on theme switch');
  assert.match(engine, /materialOn: options\.edge === "theme" && !!material\n/);
  assert.match(engine, /themeEdgeVisible: materialOn && !!material\.edge && barReady\n/);
  assert.match(engine, /property: "material"; value: root\.materialOn \? root\.presentationMaterial : null/);
  assert.match(mc, /bloomWanted: !!material && !!material\.card && material\.card\.bloom === true/, 'Lavur cards bloom');
  assert.match(mc, /readonly property bool bloom: active\n/);
  assert.doesNotMatch(mc, /scallop/, 'no scallops: the dried rim replaced them (frame round, recommendation 6)');
  assert.match(mc, /InkSheet \{\n\s*y: -fp\.margin\n/, 'a bloom is one sheet of wet paper');
  const dm = fs.readFileSync(path.join(root, 'DropMenu.qml'), 'utf8');
  assert.match(dm, /visible: row\.hot && menu\.inverting && \(!menu\.brushFile \|\| brushImage\.status !== Image\.Ready\)/, 'hard inversion (Tusche/Papier, or while the brush is missing)');
  assert.match(mc, /if \(active && \(opening\.running \|\| closing\.running\)\) \{ opening\.stop\(\); closing\.stop\(\); follow\(\) \}/, 'reduced motion mid-bloom jumps to the end');
  assert.match(dm, /themeStamp/, 'the brush reloads on a theme switch');
  const ws = fs.readFileSync(path.join(root, 'modules/Workspaces.qml'), 'utf8');
  assert.match(ws, /tones\.strong/, 'logo and active number in the strong tone');
  // wet bloom: the shader and its compiled form ship next to MaterialCard in both repos
  for (const dir of [root, path.join(islandDir, 'views')]) {
    if (!fs.existsSync(dir)) continue;
    assert.ok(fs.existsSync(path.join(dir, 'shaders/wetink.frag.qsb')), `compiled wet-ink shader in ${dir}`);
    const frag = fs.readFileSync(path.join(dir, 'shaders/wetink.frag'), 'utf8');
    for (const u of ['size', 'center', 'region', 'ink', 'front', 'band', 'body', 'ridge', 'resid', 'jitter', 'seed'])
      assert.match(frag, new RegExp(`\\b${u};`), `uniform ${u}`);
  }
  assert.match(mc, /else \{\n\s*ink = 0; opening\.start\(\)\n[^\n]*\n\s*wetting\.stop\(\); clearing = 0; wet = 1; phase = 0; wetting\.start\(\)/, 'all ink from the first frame');
  assert.match(mc, /if \(wetting\.running\) settle\(\)/, 'reduced motion dries at once');
  // the dried rim (frame round 03.10.2026, recommendation 6): InkSheet and its shaders, alike in both repos
  const ink = fs.readFileSync(path.join(root, 'InkSheet.qml'), 'utf8');
  const islandInk = path.join(islandDir, 'views/InkSheet.qml');
  if (fs.existsSync(islandInk)) assert.equal(strip(fs.readFileSync(islandInk, 'utf8')), strip(ink), 'both InkSheet copies alike');
  for (const s of ['wetink', 'gauss', 'bloomcut', 'restink', 'halo'])
    assert.match(ink, new RegExp(`fragmentShader: Qt\\.resolvedUrl\\("shaders/${s}\\.frag\\.qsb"\\)`), `InkSheet uses ${s}`);
  assert.doesNotMatch(ink, /function smooth\(/, 'no method named like the Item property `smooth`');
  assert.doesNotMatch(ink, /MultiEffect/, 'the halo is exact (analytic Gaussian), no blurred layers');
  assert.match(ink, /wetAlpha: clearing < 0\.999 \? 1 : sstep\(0, 0\.7, wet\)/, 'the wet residue evaporates with the water');
  assert.match(ink, /show: sstep\(0\.55, 1, clearing\)/, 'the rim comes in as the front reaches the edge');
  assert.match(ink, /sourceItem: cut\n/, 'the paper itself is the mask of ink and pigment (one mask per sheet)');
  const uniforms = {
    gauss: ['dir', 's1', 's2', 'first'],
    bloomcut: ['size', 'origin', 'drift', 'lo', 'hi', 'amp', 'paper'],
    restink: ['size', 'origin', 'ink', 'ridge', 'pool', 'echo', 'resid', 'show', 'dry', 'barY'],
    halo: ['size', 'box', 'radius', 'sigma', 'tint', 'alpha'],
  };
  for (const dir of [root, path.join(islandDir, 'views')]) {
    if (!fs.existsSync(dir)) continue;
    for (const [s, list] of Object.entries(uniforms)) {
      const file = path.join(dir, `shaders/${s}.frag`);
      assert.ok(fs.existsSync(file + '.qsb'), `compiled ${s} shader in ${dir}`);
      const frag = fs.readFileSync(file, 'utf8');
      for (const u of list) assert.match(frag, new RegExp(`\\b${u};`), `${s}: uniform ${u}`);
      if (dir !== root) assert.equal(frag, fs.readFileSync(path.join(root, `shaders/${s}.frag`), 'utf8'), `${s} alike in both repos`);
    }
  }
  const rest = fs.readFileSync(path.join(root, 'shaders/restink.frag'), 'utf8');
  assert.match(rest, /\(d\.r - \(0\.53 \+ 0\.1 \* wN\)\)/, 'the rim just inside the edge (σ 2.2 distance)');
  assert.match(rest, /\(d\.g - 0\.82\) \/ 0\.045/, 'the drying line ~3–4 px further in (σ 4 distance)');
  assert.match(rest, /smoothstep\(barY \+ 2\.0, barY \+ 16\.0, px\.y\)/, 'no rim up into the bar');
  const gauss = fs.readFileSync(path.join(root, 'shaders/gauss.frag'), 'utf8');
  assert.match(gauss, /for \(int i = -24; i <= 24; i\+\+\)/, 'constant loop bounds (GLSL ES 100 target)');
  console.log('PASS: theme edge option, material wiring, rolling cards, blooms, hover, tones, wet ink, dried rim');
}

// The theme edge hangs under the native bar only: on top, shown, not replaced,
// and only for a theme whose material has an edge.
{
  const engine = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  const readyExpr = engine.match(/readonly property bool barReady: ([\s\S]*?)\n  \/\//)[1];
  const materialExpr = engine.match(/readonly property bool materialOn: ([^\n]*)/)[1];
  const expression = engine.match(/readonly property bool themeEdgeVisible: ([^\n]*)/)[1];
  const edgeVisible = (edge, bar, id, material = {edge: {kind: 'dry'}}) => {
    const c = {options: {edge}, edgeBar: bar, shell: {barConfig: {id}}, material};
    c.barReady = !!vm.runInNewContext(readyExpr, c);
    c.materialOn = !!vm.runInNewContext(materialExpr, c);
    return !!vm.runInNewContext(expression, c);
  };
  const bar = {barSize: 26, position: 'top', barHidden: false};
  assert(edgeVisible('theme', bar));
  assert(edgeVisible('theme', bar, 'omarchy.bar'));
  assert(!edgeVisible('none', bar));
  assert(!edgeVisible('theme', bar, undefined, null), 'a theme without bar-material.json: no edge');
  assert(!edgeVisible('theme', bar, undefined, {card: {}}), 'a material without an edge object: no edge');
  assert(!edgeVisible('theme', null));
  assert(!edgeVisible('theme', {...bar, barSize: 0}));
  assert(!edgeVisible('theme', {...bar, barHidden: true}));
  assert(!edgeVisible('theme', bar, 'another.bar'));
  for (const position of ['bottom', 'left', 'right']) assert(!edgeVisible('theme', {...bar, position}));
  console.log('PASS: theme edge visibility');
}

// Stale usage records: a limit past its reset time counts as 0 %, not its last value.
{
  const modelCtx = {};
  vm.createContext(modelCtx);
  vm.runInContext(fs.readFileSync(path.join(islandDir, 'IslandModel.js'), 'utf8').replace('.pragma library', ''), modelCtx);
  const past = new Date(Date.now() - 2 * 3600e3).toISOString(), future = new Date(Date.now() + 3600e3).toISOString();
  const record = JSON.stringify({id: 'claude', limits: [
    {label: 'Session (5-hour)', percent: 1.0, resetsAt: past},
    {label: 'Weekly (7-day)', percent: 0.07, resetsAt: future}]});
  const limits = modelCtx.usageLimits(record, 'claude');
  assert.equal(limits[0].percent, 0);
  assert.equal(limits[1].percent, 0.07);
  assert.equal(modelCtx.limitPercent({percent: 1, resetsAt: future}, Date.now() + 2 * 3600e3), 0);
  // the island follows the bar's options (its edge): the new id first, the former one as a fallback
  assert.deepEqual(plain(modelCtx.barOptions({plugins: [{id: 'nerdibeard.amiga-bar', options: {edge: 'none'}}, {id: 'nerdibeard.tusche-bar', options: {edge: 'theme'}}]})), {edge: 'theme'});
  assert.deepEqual(plain(modelCtx.barOptions({plugins: [{id: 'nerdibeard.amiga-bar', options: {edge: 'theme'}}]})), {edge: 'theme'});
  assert.deepEqual(plain(modelCtx.barOptions({})), {});
  console.log('PASS: expired usage limits read as reset; the island reads the bar options');
}

// Logo option: with native workspaces only the menu logo becomes ours.
{
  const layoutBase = {left: ['omarchy.menu', 'omarchy.workspaces', 'nerdibeard.ai-usage'], center: [], right: ['omarchy.audio']};
  const opts = Object.assign({}, ctx.presetById('today').options, {logo: 'arch'});
  const built = ctx.build(layoutBase, opts, '/plugin/modules');
  assert.deepEqual(plain(built.left.map(ctx.entryId)), ['tusche.workspaces', 'omarchy.workspaces', 'nerdibeard.ai-usage']);
  assert.equal(built.left[0].variant, 'none');
  assert.equal(built.left[0].logo, 'arch');
  assert.equal(built.left[0].source, '/plugin/modules/Workspaces.qml');
  assert.deepEqual(plain(ctx.reconstructBase(built).left), layoutBase.left);
  assert.equal(ctx.build(layoutBase, ctx.presetById('today').options, '/plugin/modules').left[0], 'omarchy.menu');
  console.log('PASS: logo option (menu-only module with native workspaces)');
}

// Control Center model: staging, Save · Use · Cancel plans, search, health.
{
  const watchdogCtx = {};
  vm.createContext(watchdogCtx);
  vm.runInContext(fs.readFileSync(path.join(root, 'Watchdog.js'), 'utf8').replace('.pragma library', ''), watchdogCtx);
  const cc = {Presets: ctx, Watchdog: watchdogCtx};
  vm.createContext(cc);
  vm.runInContext(fs.readFileSync(path.join(root, 'ControlCenter.js'), 'utf8')
    .replace('.pragma library', '').replace(/^\.import .*$/mg, ''), cc);
  const config = {
    bar: {layout: {left: [], center: [{id: 'nerdibeard.tusche-island', notifications: true, noteStyle: 'window'}], right: []}},
    plugins: [{id: 'nerdibeard.tusche-bar', options: {}}, {id: 'nerdibeard.card-picker'}, {id: 'nerdibeard.tusche-island', noteStyle: 'bubble'}]
  };
  const live = cc.liveState({edge: 'none'}, config, 'enabled');
  // The island's bar.layout entry wins over its plugins[] entry; defaults fill the rest.
  assert.deepEqual(plain(live.island), {notifications: 'true', noteStyle: 'window'});
  assert.deepEqual(plain(cc.islandValues(cc.islandEntry({plugins: [{id: 'nerdibeard.tusche-island', noteStyle: 'bubble'}]}))),
    {notifications: 'false', noteStyle: 'bubble'});
  assert.equal(cc.islandEntry({bar: {layout: {center: ['nerdibeard.tusche-island']}}}), null);
  assert.equal(cc.liveState({}, {}, '').island, null);
  assert.equal(cc.liveState({}, {}, 'missing').cards, null);
  assert(cc.listed(config, 'nerdibeard.card-picker'));
  // Registry follows Presets.ELEMENTS (new rows appear automatically).
  assert.deepEqual(plain(cc.barIds()), Object.keys(ctx.ELEMENTS).map(k => 'bar.' + k));
  assert.deepEqual(plain(cc.settings().map(s => s.id)), Object.keys(ctx.ELEMENTS).map(k => 'bar.' + k)
    .concat(['island.notifications', 'island.noteStyle', 'cards.override']));
  assert.deepEqual(plain(cc.QUICK), ['bar.edge', 'bar.logo', 'bar.keys', 'island.notifications', 'island.noteStyle']);
  for (const id of cc.QUICK) assert(cc.setting(id), id);
  // Staging is an overlay; staging the live value removes the edit.
  let edits = cc.stage({}, live, 'bar.edge', 'theme');
  edits = cc.stage(edits, live, 'island.noteStyle', 'bubble');
  edits = cc.stage(edits, live, 'cards.override', 'disabled');
  assert.deepEqual(plain(edits), {'bar.edge': 'theme', 'island.noteStyle': 'bubble', 'cards.override': 'disabled'});
  assert.deepEqual(plain(cc.stage(edits, live, 'bar.edge', 'none')), {'island.noteStyle': 'bubble', 'cards.override': 'disabled'});
  assert.deepEqual(plain(cc.stage({}, cc.liveState({}, {}, ''), 'island.noteStyle', 'bubble')), {});
  assert.equal(cc.pendingState(live, edits).bar.edge, 'theme');
  assert.equal(live.bar.edge, 'none');
  assert.deepEqual(plain(cc.changes(edits, live).map(c => c.id)), ['bar.edge', 'island.noteStyle', 'cards.override']);
  // Use/Save plan: island first, card picker next, the bar last as ONE apply.
  edits = cc.stage(edits, live, 'bar.logo', 'arch');
  const steps = cc.plan(edits, live);
  assert.deepEqual(plain(steps.map(s => s.domain)), ['island', 'cards', 'bar']);
  assert.deepEqual(plain(steps[0]), {domain: 'island', key: 'noteStyle', value: 'bubble'});
  assert.equal(cc.barOptions(steps[2], live.bar).edge, 'theme');
  assert.equal(cc.barOptions(steps[2], live.bar).logo, 'arch');
  assert.deepEqual(plain(steps[2].keys), ['edge', 'logo']);
  // Computed when the step runs: a change applied in between survives.
  assert.equal(cc.barOptions(steps[2], Object.assign({}, live.bar, {workspaces: 'stack'})).workspaces, 'stack');
  assert.deepEqual(plain(cc.plan({}, live)), []);
  // Presets stage all bar keys and keep the look options.
  const tidy = cc.stageBar({}, live, ctx.keepLook(ctx.presetById('tidy').options, cc.pendingState(live, {'bar.edge': 'theme'}).bar));
  assert.equal(cc.pendingState(live, tidy).bar.workspaces, 'pips');
  assert.equal(cc.pendingState(live, tidy).bar.edge, 'theme');
  assert.deepEqual(plain(cc.commitBar({edge: 'theme', nonsense: 'x'})), plain(ctx.normalizeOptions({edge: 'theme'})));
  // Cancel after Use: back to the snapshot, only in the domains Use touched.
  const snapshot = cc.copy(live);
  const after = cc.liveState({edge: 'theme', logo: 'arch'},
    {bar: {layout: {center: [{id: 'nerdibeard.tusche-island', notifications: true, noteStyle: 'bubble'}]}}}, 'disabled');
  assert.deepEqual(plain(cc.revertPlan(snapshot, after, {})), []);
  const back = cc.revertPlan(snapshot, after, {island: true, cards: true, bar: true});
  assert.deepEqual(plain(back.map(s => s.domain + ':' + (s.key || ''))), ['island:noteStyle', 'cards:override', 'bar:']);
  assert.equal(back[0].value, 'window');
  assert.equal(back[1].value, 'enabled');
  assert.equal(cc.barOptions(back[2], after.bar).edge, 'none');
  assert.equal(cc.barOptions(back[2], after.bar).logo, 'omarchy');
  // After Use: applied edits drop out.
  assert.deepEqual(plain(cc.prune(edits, after)), {});
  // Island IPC state confirms what was set.
  assert(cc.islandReports({wants: true, style: 'bubble'}, 'notifications', 'true'));
  assert(cc.islandReports({wants: true, style: 'bubble'}, 'noteStyle', 'bubble'));
  assert(!cc.islandReports({wants: true, style: 'bubble'}, 'noteStyle', 'window'));
  assert(cc.islandReports({wants: false, style: 'workbench'}, 'noteStyle', 'window'), 'an island from before the rename');
  assert(!cc.islandReports(null, 'noteStyle', 'bubble'));
  // Search: label, value and area matches; every token must match.
  const index = cc.searchIndex(live, {'bar.logo': 'arch'}, [{id: 'bar.presets', area: 'bar', label: 'Presets', values: ['Today', 'Tidy', 'Focus'], current: ''}]);
  assert.equal(cc.search(index, 'edge')[0].id, 'bar.edge');
  const valueHit = cc.search(index, 'light shadow')[0];
  assert.equal(valueHit.id, 'bar.edge');
  assert.equal(valueHit.value, 'From the theme (light & shadow)');
  assert(valueHit.matchedValue);
  assert.equal(cc.search(index, 'logo')[0].value, 'Arch Linux');   // current = pending value
  assert.equal(cc.search(index, 'bubble')[0].id, 'island.noteStyle');
  {
    const hits = cc.search(index, 'island');
    for (const id of ['island.notifications', 'island.noteStyle']) assert(hits.some(h => h.id === id), id);
    assert.equal(hits.find(h => h.id === 'island.notifications').value, 'Island, in the bar');   // value matches count too
  }
  assert.equal(cc.search(index, 'tidy')[0].id, 'bar.presets');
  assert.deepEqual(plain(cc.search(index, 'edge nonsense')), []);
  assert.deepEqual(plain(cc.search(index, '  ')), []);
  assert(cc.search(index, 'a', 3).length <= 3);
  assert(cc.searchIndex(cc.liveState({}, {}, ''), {}, []).every(e => e.area === 'bar'));
  // Health: only real facts; unknown facts are not counted as issues.
  const good = {hasBase: true, usageFolded: true, usageIntervalSec: 900, usageAgeSec: 120,
                islandConfigured: true, islandWants: true, islandState: {serving: true, omarchyDisabled: true}, marker: true,
                cards: 'enabled', cardsConfigured: true, lastResult: 'ok', savedCount: 2,
                // round 2: the safety net, the loaded code, Hyprland data, the hide flag, the menu model, the anchor
                watchdog: {state: watchdogCtx.initial(), enabled: true, now: 1000},
                generation: {loaded: 'b15c4a797a1b1527', installed: 'b15c4a797a1b1527'}, hypr: 'snapshot',
                focus: {hidden: false, owned: false, error: false}, menuModel: 'same',
                anchor: {anchor: 'nerdibeard.tusche-island', centre: ['nerdibeard.tusche-island'], suggest: ''}};
  assert.deepEqual(plain(cc.healthSummary(cc.healthChecks(good))), {issues: 0, unknown: 0, label: 'OK'});
  assert.deepEqual(plain(cc.healthChecks(good).map(c => c.id)),
    ['base', 'usage', 'notes', 'cards', 'watchdog', 'generation', 'hypr', 'focus', 'menumodel', 'anchor', 'apply', 'saved']);
  const issues = f => cc.healthChecks(Object.assign({}, good, f)).filter(c => c.state === 'issue').map(c => c.id);
  assert.deepEqual(plain(issues({hasBase: false})), ['base']);
  assert.deepEqual(plain(issues({usageAgeSec: 3 * 900})), ['usage']);
  assert.deepEqual(plain(issues({usageAgeSec: -1})), ['usage']);
  assert.deepEqual(plain(issues({usageFolded: false, usageAgeSec: -1})), []);
  assert.deepEqual(plain(issues({marker: false, islandState: {serving: true, omarchyDisabled: false}})), ['notes']);
  assert.deepEqual(plain(issues({marker: false})), []);   // Omarchy's were already off by hand
  assert.deepEqual(plain(issues({islandWants: false})), ['notes']);   // marker left behind
  assert.deepEqual(plain(issues({islandWants: false, marker: false})), []);
  assert.deepEqual(plain(issues({islandState: {serving: false, omarchyDisabled: true}})), ['notes']);
  assert.deepEqual(plain(issues({islandState: false})), ['notes']);
  assert.deepEqual(plain(issues({cards: 'missing'})), ['cards']);
  assert.deepEqual(plain(issues({cards: 'missing', cardsConfigured: false})), []);
  assert.deepEqual(plain(issues({lastResult: 'error: boom'})), ['apply']);
  assert.deepEqual(plain(issues({savedError: 'Cannot read saved combinations'})), ['saved']);
  assert.equal(cc.healthSummary(cc.healthChecks(Object.assign({}, good, {hasBase: false, lastResult: 'error: x'}))).label, '2 issues');
  assert.equal(cc.healthSummary(cc.healthChecks(Object.assign({}, good, {marker: null}))).label, '…');
  assert(cc.isArea('health') && !cc.isArea('nope'));
  console.log('PASS: control center staging, Save/Use/Cancel plans, search, health');
}

// Control Center wiring: replaces the options window, argv-only processes,
// IPC for areas, a plain fade.
{
  const engine = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  const qml = fs.readFileSync(path.join(root, 'ControlCenter.qml'), 'utf8');
  assert(engine.includes('ControlCenter {') && !engine.includes('OptionsWindow'));
  assert(/function cc\(area: string\): string/.test(engine));
  assert(engine.includes('cc: controlCenter.stateObject()'));
  assert(engine.includes('label: "Control Center …"'));
  assert(qml.includes('["omarchy-shell", "tusche-island", "set", step.key, String(step.value)]'));
  assert(qml.includes('["omarchy-shell", "tusche-island", "state"]'));
  assert(qml.includes('/.local/state/omarchy/tusche-island/notifications-takeover"'));
  assert(!/"sh",\s*"-c"/.test(qml), 'no shell strings in the Control Center');
  // reveal shows the card: a plain fade
  assert(/property real reveal: 0\n\s*opacity: reveal/.test(qml));
  // All text goes through the Body/Caption/Strong components (native
  // rendering, plain text); no stray Text items.
  const rawText = [...qml.matchAll(/^(.*)\bText \{/gm)].filter(m => !/component \w+: $/.test(m[1]));
  assert.deepEqual(rawText.map(m => m[0]), []);
  for (const c of ['Body', 'Strong']) {
    const body = qml.slice(qml.indexOf('component ' + c + ': Text {'));
    const block = body.slice(0, body.indexOf('\n  }'));
    assert(block.includes('renderType: Text.NativeRendering') && block.includes('textFormat: Text.PlainText'), c);
  }
  console.log('PASS: control center wiring (engine, IPC, argv processes, fade)');
}

// IPC and logo clicks: the targets and functions the menus, shims and keys call.
{
  const en = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  const handlers = {};
  for (const m of en.matchAll(/IpcHandler \{\n    target: "([^"]+)"\n([\s\S]*?)\n  \}/g))
    handlers[m[1]] = [...m[2].matchAll(/^    function (\w+)\(/gm)].map(f => f[1]);
  assert.deepEqual(handlers, {
    'tusche-status': ['group', 'member', 'close', 'state'],
    'tusche-quota': ['toggle', 'select', 'state'],
    'tusche-bar': ['options', 'cc', 'save', 'load', 'ask', 'menu', 'search', 'apps', 'preset', 'set', 'focus', 'screenProfile', 'glintWindow', 'recaptureBase', 'state']});
  assert(en.includes('Quickshell.env("HOME") + "/.local/state/tusche-bar"'));
  assert(en.includes('"nerdibeard.tusche-bar"'));
  // logo: left = the drop-down, right = Omarchy's own menu, middle = the Control Center
  const ws = fs.readFileSync(path.join(root, 'modules/Workspaces.qml'), 'utf8');
  const runs = [];
  let toggles = 0;
  const wc = {Qt: {LeftButton: 1, RightButton: 2, MiddleButton: 4}, bar: {run: c => runs.push(c)}, toggleDrop: () => toggles++};
  vm.createContext(wc);
  vm.runInContext(functionSource(ws, 'openMenu'), wc);
  wc.openMenu(1);
  assert.equal(toggles, 1);
  wc.openMenu(4);
  wc.openMenu(2);
  assert.deepEqual(runs, ['omarchy-shell tusche-bar options', 'omarchy-shell shell toggle omarchy.menu \'{"menu":"root"}\'']);
  assert.equal(toggles, 1);
  wc.bar = null;
  wc.openMenu(1);
  assert.equal(toggles, 1, 'no bar, no menu');
  console.log('PASS: IPC targets and functions, state dir, logo clicks');
}

// Nested drop-down menu (0.7.0): Apps, fonts and the questions of the actions
// it runs (omarchy-menu-select / -input) open inside the drop-down, never in
// the centred menu.
{
  const os = require('node:os');
  const shellQuote = v => "'" + String(v || '').replace(/'/g, "'\\''") + "'";   // qs.Commons Util.shellQuote
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.id, 'nerdibeard.tusche-bar');
  const [major, minor] = manifest.version.split(/[.-]/).map(Number);
  assert.ok(major > 0 || minor >= 7, `nested drop-down since 0.7.0 (version ${manifest.version})`);
  assert.deepEqual(manifest.kinds, ['panel', 'menu'], '"menu" brings the app-library facade; "panel" keeps the loader');
  // omarchy-plugin-validate: every kind needs its entry point
  const entryFor = {bar: 'bar', 'bar-widget': 'barWidget', menu: 'menu', overlay: 'overlay', panel: 'panel', service: 'service'};
  for (const k of manifest.kinds) assert.equal(manifest.entryPoints[entryFor[k]], 'Engine.qml', k);

  const dm = fs.readFileSync(path.join(root, 'DropMenu.qml'), 'utf8');
  const oms = fs.readFileSync(path.join(root, 'OmarchyMenuSource.qml'), 'utf8');
  const en = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  const ws = fs.readFileSync(path.join(root, 'modules/Workspaces.qml'), 'utf8');
  const providersOf = text => {
    const from = text.indexOf('readonly property var providers: ');
    const c = {Util: {shellQuote}};
    vm.createContext(c);
    return vm.runInContext(text.slice(text.indexOf('({', from), text.indexOf('\n  })', from) + 5), c);
  };

  // Omarchy's own shell, where installed: the plugin still loads as the same
  // keep-loaded panel; only its scoped shell gains the application library.
  const omarchy = [process.env.OMARCHY_PATH, path.join(os.homedir(), '.local/share/omarchy'), path.join(os.homedir(), 'omarchy'), '/usr/share/omarchy']
    .find(d => d && fs.existsSync(path.join(d, 'shell/shell.qml')));
  if (omarchy) {
    const shellQml = fs.readFileSync(path.join(omarchy, 'shell/shell.qml'), 'utf8');
    const sc = {};
    vm.createContext(sc);
    vm.runInContext(['manifestHasKind', 'pluginShellCapabilityProfile', 'computePanelEntries', 'isBarWidgetPanelPlugin']
      .map(n => functionSource(shellQml, n)).join('\n'), sc);
    sc.shell = {manifestHasKind: sc.manifestHasKind, pluginRegistry: {installedPlugins: {}, isEnabled: () => true}};
    const before = Object.assign({}, manifest, {kinds: ['panel'], entryPoints: {panel: 'Engine.qml'}});
    for (const m of [before, manifest]) {
      sc.shell.pluginRegistry.installedPlugins = {[m.id]: m};
      assert.deepEqual(plain(sc.computePanelEntries().map(e => [e.id, e.kind, e.keepLoaded])), [[m.id, 'panel', true]]);
      assert.equal(sc.isBarWidgetPanelPlugin(m.id), false);
    }
    assert.equal(sc.pluginShellCapabilityProfile(before, true, false), 'own-service|no-bar|no-menu');
    assert.equal(sc.pluginShellCapabilityProfile(manifest, true, false), 'own-service|no-bar|menu');
    assert.match(shellQml, /appLibrary: shell\.manifestHasKind\(manifest, "menu"\)/, 'menu plugins get the app library facade');
    // the providers are the native menu's, unchanged
    const mine = providersOf(oms), native = providersOf(fs.readFileSync(path.join(omarchy, 'shell/plugins/menu/Menu.qml'), 'utf8'));
    assert.deepEqual(Object.keys(mine), Object.keys(native));
    for (const k of Object.keys(native)) {
      assert.equal(mine[k].script, native[k].script, k);
      assert.equal(mine[k].icon, native[k].icon, k);
      assert.equal(!!mine[k].volatile, !!native[k].volatile, k);
      assert.equal(mine[k].actionFor("Fira Code's"), native[k].actionFor("Fira Code's"), k);
    }
    assert.equal(fs.readFileSync(path.join(root, 'vendor/MenuModel.js'), 'utf8'),
      fs.readFileSync(path.join(omarchy, 'shell/plugins/menu/MenuModel.js'), 'utf8'), 'vendor/MenuModel.js: refresh the copy (vendor/README.md)');
  } else console.log('(no Omarchy shell source found: shell checks skipped)');

  // Questions, read the native way: the glyph never comes back, a subtext does.
  const dc = {menu: {requestSerial: 0, query: ''}};
  vm.createContext(dc);
  vm.runInContext(['choiceRow', 'makeRequest', 'listRows'].map(n => functionSource(dm, n)).join('\n'), dc);
  assert.deepEqual(plain(dc.choiceRow('Berlin', 0)), {kind: 'choice', id: 'choice.0', icon: '', label: 'Berlin', note: '', answer: 'Berlin'});
  assert.deepEqual(plain(dc.choiceRow('G\tOnly', 1)), {kind: 'choice', id: 'choice.1', icon: 'G', label: 'Only', note: '', answer: 'Only'});
  assert.deepEqual(plain(dc.choiceRow('\u{f0431}\tTusche Bar\tnerdibeard.tusche-bar', 2)),
    {kind: 'choice', id: 'choice.2', icon: '\u{f0431}', label: 'Tusche Bar', note: 'nerdibeard.tusche-bar', answer: 'Tusche Bar\tnerdibeard.tusche-bar'});
  assert.equal(dc.choiceRow('G\tL\tsub\tmore', 3).answer, 'L\tsub\tmore');
  const rq = dc.makeRequest({mode: 'select', prompt: 'Set timezone', options: ['A', 'B'], selectionFile: '/t/s', doneFile: '/t/d', width: 520, maxHeight: '400', token: 'tok'});
  assert.deepEqual([rq.id, rq.mode, rq.rows.length, rq.width, rq.maxHeight, rq.token], [1, 'select', 2, 520, 400, 'tok']);
  const inp = dc.makeRequest({mode: 'input', doneFile: '/t/d'});
  assert.deepEqual([inp.id, inp.prompt, inp.rows.length, inp.width, inp.token], [2, 'Input', 0, 0, '']);
  assert.equal(dc.makeRequest({mode: 'other', doneFile: '/t/d'}).prompt, 'Select');
  // typing inside a list level filters it by label and subtext
  const zones = ['a\tEurope/Berlin\tCET', 'b\tAmerica/New_York\tEST', 'c\tAsia/Tokyo'].map(dc.choiceRow);
  dc.menu.query = 'est';
  assert.deepEqual(plain(dc.listRows(zones).map(r => r.label)), ['America/New_York']);
  dc.menu.query = ' TOKYO ';
  assert.deepEqual(plain(dc.listRows(zones).map(r => r.label)), ['Asia/Tokyo']);
  dc.menu.query = 'browser';
  assert.equal(dc.listRows([{kind: 'app', label: 'Zen', sub: 'Web Browser'}])[0].label, 'Zen');
  dc.menu.query = 'zzz';
  assert.deepEqual(plain(dc.listRows(zones).map(r => [r.label, r.disabled])), [['No matches', true]]);
  dc.menu.query = '';
  assert.equal(dc.listRows(zones).length, 3);
  assert.equal(dc.listRows([])[0].label, 'Nothing here');

  // Actions that ask, providers, apps (OmarchyMenuSource).
  const MenuModel = require(path.join(root, 'vendor/MenuModel.js'));
  const sc2 = {MenuModel, Util: {shellQuote}, askWords: {}, providers: providersOf(oms)};
  vm.createContext(sc2);
  vm.runInContext(['firstWord', 'asks', 'askScript', 'providerList', 'appRow', 'loadApps', 'appHits'].map(n => functionSource(oms, n)).join('\n'), sc2);
  assert.equal(sc2.firstWord('omarchy-menu-plugin enable'), 'omarchy-menu-plugin');
  assert.equal(sc2.firstWord('  omarchy-menu-keybindings'), 'omarchy-menu-keybindings');
  assert.equal(sc2.firstWord("omarchy-launch-webapp 'https://x'"), 'omarchy-launch-webapp');
  assert.equal(sc2.firstWord('background=$(omarchy-theme-bg-switcher); x'), '');
  sc2.askWords = {'omarchy-menu-plugin': true, 'omarchy-capture-screenrecording-with-webcam': true};
  assert(sc2.asks('omarchy-menu-plugin enable'));
  assert(!sc2.asks('omarchy-menu-plugins enable'));
  assert(!sc2.asks('omarchy-capture-screenrecording-with-webcam'), 'screen captures never wait in the drop-down');
  const fonts = sc2.providerList('style.font', 'fonts', 'Fira Code\tFira Code\tJetBrains Mono\nJetBrains Mono\tJetBrains Mono\tJetBrains Mono\n\nFira-Code\tFira-Code\tJetBrains Mono\n');
  assert.deepEqual(plain(fonts.map(r => [r.label, r.checked, r.id, r.kind])), [
    ['Fira Code', false, 'style.font.fira-code', 'action'], ['JetBrains Mono', true, 'style.font.jetbrains-mono', 'action'],
    ['Fira-Code', false, 'style.font.fira-code-', 'action']]);
  assert.equal(fonts[0].action, "omarchy-font-set 'Fira Code'");
  assert.equal(fonts[0].icon, '\ue659');
  assert.deepEqual(plain(sc2.providerList('x', 'unknown', 'a\tb')), []);
  // The new native provider keeps native names, code-based actions and the
  // current checkmark; English names and codes also find a row in its level.
  const languages = sc2.providerList('setup.language', 'languages',
    'English\ten\tda\tEnglish\nDansk\tda\tda\tDanish\nPortuguês (Brasil)\tpt-BR\tda\tPortuguese (Brazil)\n');
  assert.deepEqual(plain(languages.map(r => [r.label, r.checked, r.id, r.action, r.icon])), [
    ['English', false, 'setup.language.en', "omarchy-language 'en'", '\uf1ab'],
    ['Dansk', true, 'setup.language.da', "omarchy-language 'da'", '\uf1ab'],
    ['Português (Brasil)', false, 'setup.language.pt-br', "omarchy-language 'pt-BR'", '\uf1ab']]);
  for (const [query, label] of [[' DAnIsH ', 'Dansk'], ['dansk', 'Dansk'], ['pt-BR', 'Português (Brasil)']]) {
    dc.menu.query = query;
    assert.deepEqual(plain(dc.listRows(languages).map(r => r.label)), [label]);
  }
  dc.menu.query = '';

  if (omarchy) {
    // Follow the shipped Setup > Language and Style > Font definitions
    // through the real row, provider-load and activation functions. Capture
    // detached commands: tests must not change the user's language or font.
    const merged = MenuModel.mergeMenuSources(MenuModel.parseMenuJsonc(
      fs.readFileSync(path.join(omarchy, 'default/omarchy/omarchy-menu.jsonc'), 'utf8')), []);
    Object.assign(sc2, {items: merged.items, checkedResults: {}, disabledResults: {},
      providerRows: {}, providerQueue: [], providerRevision: 0, providerProc: {running: false}});
    vm.runInContext(['row', 'loadProvider'].map(n => functionSource(oms, n)).join('\n'), sc2);
    vm.runInContext(oms.match(/^  function hasProvider\(.*$/m)[0], sc2);
    const routed = [];
    Object.assign(dc, {source: sc2, shimDir: '', push: level => routed.push(level),
      Qt: {callLater: fn => fn()}, Util: {shellQuote, execDetached: cmd => routed.push(cmd)}});
    vm.runInContext(['activate', 'openProvider', 'finish', 'runAction', 'prefixed']
      .map(n => functionSource(dm, n)).join('\n'), dc);
    dc.menu.close = () => routed.push('close');
    dc.menu.runAction = dc.runAction;
    for (const [parent, id, provider] of [['setup', 'setup.language', 'languages'], ['style', 'style.font', 'fonts']]) {
      assert.equal(merged.items[id].parent, parent);
      dc.activate(sc2.row(merged.items[parent]));
      assert.equal(routed.at(-1).id, parent);
      dc.activate(sc2.row(merged.items[id]));
      assert.deepEqual(plain(routed.at(-1)), {kind: 'provider', id, provider, title: merged.items[id].label});
      assert.deepEqual(plain(sc2.providerProc.command), ['bash', '-lc', sc2.providers[provider].script]);
      assert.equal(sc2.providerProc.running, true);
      sc2.providerProc.running = false;
      sc2.providerRows[id] = [];
      sc2.loadProvider(id, provider);
      assert.equal(sc2.providerProc.running, true, `${provider} refreshes on re-entry`);
      sc2.providerProc.running = false;
    }
    routed.length = 0;
    dc.activate(languages[1]);
    assert.deepEqual(routed, ['close', "omarchy-language 'da'"], 'close the drop-down, then run the native command');
  }
  const entries = [{id: 'zen', name: 'Zen Browser', genericName: 'Web Browser', icon: 'zen'},
    {id: 'alacritty', name: 'Alacritty', genericName: 'Terminal', icon: '/x/a.svg'}, {id: 'zen', name: 'Zen Browser', icon: 'zen'}, {id: '', name: 'Nameless'}];
  sc2.appLibrary = {
    sortedEntries: q => entries.filter(e => !q || e.name.toLowerCase().includes(q.toLowerCase())).map(entry => ({entry})),
    entryName: e => e.name, entrySubtext: e => e.genericName || ''
  };
  sc2.loadApps();
  assert.deepEqual(plain(sc2.appRows.map(r => [r.id, r.appId, r.label, r.sub, r.path, r.appIcon])), [
    ['apps.alacritty', 'alacritty', 'Alacritty', 'Terminal', 'Terminal', '/x/a.svg'], ['apps.zen', 'zen', 'Zen Browser', 'Web Browser', 'Web Browser', 'zen']]);
  assert.deepEqual(plain(sc2.appHits('browser', 8).map(r => [r.label, r.path])), [['Zen Browser', 'Apps']]);
  assert.equal(sc2.appHits('a', 1).length, 1);
  assert.deepEqual(plain(sc2.appHits(' ', 8)), []);
  sc2.appLibrary = null;
  sc2.loadApps();
  assert.deepEqual(plain(sc2.appRows), []);
  assert.deepEqual(plain(sc2.appHits('zen', 8)), []);

  // The engine routes a question to a drop-down, or refuses (the shim then
  // runs Omarchy's own command).
  const ec = {};
  vm.createContext(ec);
  vm.runInContext(['screenOf', 'dropTarget', 'ask'].map(n => functionSource(en, n)).join('\n'), ec);
  const inst = (name, more) => Object.assign({QsWindow: {window: {visible: true, screen: {name}}}, dropAvailable: true, dropOpen: false,
    tracked: [], asked: [], accepts: true, dropTracks(t) { return this.tracked.includes(t) }, dropAsk(p) { this.asked.push(p); return this.accepts }}, more || {});
  const A = inst('eDP-1'), B = inst('HDMI-A-1'), C = inst('DP-2', {dropAvailable: false});
  ec.Bridge = {ModuleBus: {instances: {workspaces: [C, A, B]}, pick: () => B}};
  ec.root = {lastDropScreen: '', dropTarget: t => ec.dropTarget(t), screenOf: i => ec.screenOf(i)};
  const payload = more => JSON.stringify(Object.assign({mode: 'select', prompt: 'P', options: ['a'], selectionFile: '/tmp/s', doneFile: '/tmp/d'}, more));
  for (const bad of ['not json', '"text"', payload({mode: 'menu'}), payload({doneFile: ''}), payload({doneFile: 'rel/d'}), payload({selectionFile: 'rel/s'})])
    assert.equal(ec.ask(bad), 'invalid payload', bad);
  assert.equal(ec.ask(payload({})), 'ok');
  assert.equal(B.asked.length, 1, 'no history: the focused screen');
  ec.root.lastDropScreen = 'eDP-1';
  assert.equal(ec.ask(payload({mode: 'input', selectionFile: undefined})), 'ok');
  assert.equal(A.asked.length, 1, 'the screen that had it last');
  B.dropOpen = true;
  ec.ask(payload({}));
  assert.equal(B.asked.length, 2, 'an open drop-down');
  A.tracked = ['tok'];
  ec.ask(payload({token: 'tok'}));
  assert.equal(A.asked.length, 2, 'the drop-down that launched the asking action');
  assert.equal(C.asked.length, 0, 'never one that is not available');
  A.accepts = false;
  assert.equal(ec.ask(payload({token: 'tok'})), 'no drop-down');
  ec.Bridge.ModuleBus = {instances: {workspaces: [C]}, pick: () => null};
  assert.equal(ec.ask(payload({})), 'no drop-down');
  assert.match(en, /function ask\(payload: string\): string \{ return root\.ask\(payload\) \}/);
  assert.match(en, /readonly property string shimDir: pluginDir \+ "\/bin\/menu-shim"/);
  assert.match(en, /ask: root\.askState\(\)/);
  assert.match(ws, /if \(!dropAvailable \|\| !m \|\| !m\.takeRequest\(request\)\) return false\n    if \(m\.hasPending\(\)\) open\(\)/,
    'opens only for a pending question (an abandoned one is cancelled quietly)');

  // DropMenu wiring: nested levels, look kept, every close cancels.
  assert.match(dm, /readonly property bool opens: r\.kind === "menu" \|\| r\.kind === "group" \|\| r\.kind === "more" \|\| r\.kind === "provider" \|\| r\.asks === true/, 'chevrons for the new levels');
  assert.match(dm, /ListView \{\n        id: list/);
  assert.doesNotMatch(dm, /Repeater/);
  assert.match(dm, /else if \(r\.kind === "app"\) \{ var lib = appLibrary; finish\(function\(\) \{ if \(lib\) lib\.launch\(r\.appId, r\.label\) \}\) \}/, 'close, then launch');
  assert.match(dm, /if \(!source\.hasProvider\(r\.provider\)\) \{\n      finish\(function\(\) \{ Util\.execDetached\("omarchy-menu summon " \+ Util\.shellQuote\(r\.id\)\) \}\)/,
    'unknown providers (or Apps without the library) keep the native menu');
  assert.match(dm, /function runAction\(action\) \{\n    Util\.execDetached\(prefixed\(action, ""\)\)/, 'every action gets the shims');
  assert.match(dm, /proc\.command = launchCommand\(r\.action, token\)/);
  assert.match(dm, /if \(!menu\.open\) \{ menu\.searchMode = false; menu\.dropClosed\(\); return \}/, 'every close cancels what is pending');
  assert.match(dm, /Component\.onDestruction: cancelAll\(\)/);
  assert.match(dm, /visible: row\.isApp && status === Image\.Ready/, "an app's own icon, the glyph until it is there");

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tusche-bar-test-'));
  try {
    const put = (dir, name, text, mode = 0o755) => {
      fs.mkdirSync(dir, {recursive: true});
      fs.writeFileSync(path.join(dir, name), text);
      fs.chmodSync(path.join(dir, name), mode);
    };
    const clean = {HOME: tmp, LANG: 'C.UTF-8'};
    const shimDir = path.join(root, 'bin/menu-shim');

    // The PATH prefix and the tracked launch: shims first, the token along,
    // the action waited for – and still running after its waiter is killed.
    const lc = {Util: {shellQuote}, shimDir: "/x/it's dir"};
    vm.createContext(lc);
    vm.runInContext(functionSource(dm, 'prefixed') + '\n' + functionSource(dm, 'launchCommand'), lc);
    const sh = (cmd, env) => cp.execFileSync('bash', ['-c', cmd], {encoding: 'utf8', env: Object.assign({PATH: '/usr/bin:/bin'}, clean, env)});
    assert.equal(sh(lc.prefixed('printf "%s|%s" "${PATH%%:*}" "${TUSCHE_BAR_ASK_TOKEN-unset}"', 'tok')), "/x/it's dir|tok");
    assert.equal(sh(lc.prefixed('printf "%s" "${TUSCHE_BAR_ASK_TOKEN-unset}"', '')), 'unset');
    lc.shimDir = shimDir;
    const timed = Date.now();
    const waited = cp.spawnSync(...(a => [a[0], a.slice(1)])(lc.launchCommand('sleep 0.3; exit 7', 't')), {env: Object.assign({PATH: '/usr/bin:/bin'}, clean)});
    assert.equal(waited.status, 7, 'the waiter ends with the action');
    assert(Date.now() - timed >= 300);
    const marker = path.join(tmp, 'marker');
    const argv = lc.launchCommand('sleep 0.6; printf "%s|%s" "$(command -v omarchy-menu-select)" "$TUSCHE_BAR_ASK_TOKEN" > ' + shellQuote(marker), 'tok9');
    const survived = cp.execFileSync('bash', ['-c', '"$@" & w=$!; sleep 0.2; kill -9 $w; wait $w 2>/dev/null; sleep 1; cat ' + shellQuote(marker), 'bash', ...argv],
      {encoding: 'utf8', env: Object.assign({PATH: '/usr/bin:/bin'}, clean)});
    assert.equal(survived, path.join(shimDir, 'omarchy-menu-select') + '|tok9', 'the action outlives its waiter');

    // The drop-down's writes, run as the QML runs them: the answer, then the
    // done file; a cancel is the done file alone; nothing once the asker left.
    const writes = [];
    const wc = {Quickshell: {execDetached: argv => writes.push(argv)}};
    vm.createContext(wc);
    vm.runInContext(functionSource(dm, 'writeAnswer') + '\n' + functionSource(dm, 'writeCancel'), wc);
    const runWrite = () => { const a = writes.pop(); cp.execFileSync(a[0], a.slice(1)); return a };
    const sel = path.join(tmp, 'sel'), done = path.join(tmp, 'done');
    fs.writeFileSync(sel, '');
    wc.writeAnswer({selectionFile: sel, doneFile: done}, 'Europe/Berlin\tCET');
    const answerArgv = runWrite();
    assert.equal(fs.readFileSync(sel, 'utf8'), 'Europe/Berlin\tCET\n');
    assert(fs.existsSync(done));
    fs.writeFileSync(sel, ''); fs.rmSync(done);
    wc.writeCancel({selectionFile: sel, doneFile: done});
    const cancelArgv = runWrite();
    assert.equal(fs.readFileSync(sel, 'utf8'), '');
    assert(fs.existsSync(done));
    fs.rmSync(done);
    wc.writeAnswer({selectionFile: sel, doneFile: done}, "$(echo nope) 'q' \\n");
    runWrite();
    assert.equal(fs.readFileSync(sel, 'utf8'), "$(echo nope) 'q' \\n\n", 'answers stay literal');
    fs.rmSync(sel); fs.rmSync(done);
    wc.writeAnswer({selectionFile: sel, doneFile: done}, 'x'); runWrite();
    wc.writeCancel({selectionFile: sel, doneFile: done}); runWrite();
    assert(!fs.existsSync(sel) && !fs.existsSync(done), 'the asker has gone: nothing written');

    // The detection: only `#!` scripts that call omarchy-menu-select / -input.
    const bin = path.join(tmp, 'detect');
    put(bin, 'asker', '#!/bin/bash\nx=$(omarchy-menu-select "Pick" a b)\n');
    put(bin, 'typer', '#!/bin/sh\nomarchy-menu-input Name\n');
    put(bin, 'quiet', '#!/bin/bash\necho hello\n');
    put(bin, 'binary', '\x7fELF omarchy-menu-select\n');
    put(bin, 'plain', '#!/bin/bash\nomarchy-menu-select x\n', 0o644);
    const asking = cp.execFileSync('bash', ['-c', sc2.askScript(), 'bash', 'asker', 'typer', 'quiet', 'binary', 'plain', 'missing', 'echo', path.join(bin, 'asker')],
      {encoding: 'utf8', env: Object.assign({PATH: bin + ':/usr/bin:/bin'}, clean)});
    assert.deepEqual(asking.split('\n').filter(Boolean).sort(), [path.join(bin, 'asker'), 'asker', 'typer'].sort());

    // The shims end to end: a fake omarchy-shell that answers as the
    // drop-down does (with its own write commands), one that fails, one that
    // refuses; a fake original for the fallback.
    const tmpdir = path.join(tmp, 't'), log = path.join(tmp, 'payload.json');
    fs.mkdirSync(tmpdir);
    const fakeOk = '#!/bin/bash\n'
      + '[[ ${1:-} == tusche-bar && ${2:-} == ask ]] || { echo "Function not found." >&2; exit 1; }\n'
      + 'printf "%s" "$3" > "$FAKE_LOG"\n'
      + 'sel=$(perl -MJSON::PP -e \'print decode_json($ARGV[0])->{selectionFile}\' "$3")\n'
      + 'done=$(perl -MJSON::PP -e \'print decode_json($ARGV[0])->{doneFile}\' "$3")\n'
      + '( sleep 0.2\n'
      + '  if [[ -n ${FAKE_ANSWER+x} ]]; then sh -c "$FAKE_WRITE_ANSWER" sh "$sel" "$done" "$FAKE_ANSWER"\n'
      + '  else sh -c "$FAKE_WRITE_CANCEL" sh "$sel" "$done"; fi ) >/dev/null 2>&1 &\n'
      + 'echo ok\n';
    put(path.join(tmp, 'shell-ok'), 'omarchy-shell', fakeOk);
    put(path.join(tmp, 'shell-fail'), 'omarchy-shell', '#!/bin/bash\necho "omarchy-shell is not running" >&2\nexit 1\n');
    put(path.join(tmp, 'shell-refuse'), 'omarchy-shell', '#!/bin/bash\necho "no drop-down"\n');
    const fakeOriginal = '#!/bin/bash\n'
      + 'printf "original"; for a in "$@"; do printf " [%s]" "$a"; done; printf "\\n"\n'
      + 'case ":$PATH:" in *":$SHIM_DIR"*|*":$SHIM_LINK"*) echo "shim still on PATH" ;; esac\n'
      + 'if [[ ! -t 0 ]]; then while IFS= read -r line; do printf "stdin [%s]\\n" "$line"; done; fi\n'
      + 'exit "${FAKE_EXIT:-0}"\n';
    put(path.join(tmp, 'orig'), 'omarchy-menu-select', fakeOriginal);
    put(path.join(tmp, 'orig'), 'omarchy-menu-input', fakeOriginal);
    const link = path.join(tmp, 'shim-link');
    fs.symlinkSync(shimDir, link);
    const shim = (name, args, mode, opts = {}) => {
      fs.rmSync(log, {force: true});
      const r = cp.spawnSync(name, args, {input: opts.input || '', encoding: 'utf8', timeout: 20000,
        env: Object.assign({}, clean, {TMPDIR: tmpdir, SHIM_DIR: shimDir, SHIM_LINK: link, FAKE_LOG: log,
          FAKE_WRITE_ANSWER: answerArgv[2], FAKE_WRITE_CANCEL: cancelArgv[2],
          PATH: [opts.lead || shimDir, path.join(tmp, 'shell-' + mode), path.join(tmp, 'orig'), '/usr/bin', '/bin'].join(':')}, opts.env || {})});
      assert.equal(r.error, undefined, String(r.error));
      assert.deepEqual(fs.readdirSync(tmpdir), [], 'no temp file left behind');
      return r;
    };
    const sent = () => JSON.parse(fs.readFileSync(log, 'utf8'));
    for (const name of ['omarchy-menu-select', 'omarchy-menu-input']) {
      const file = path.join(shimDir, name), text = fs.readFileSync(file, 'utf8');
      assert(fs.statSync(file).mode & 0o111, name + ' is executable');
      cp.execFileSync('bash', ['-n', file]);
      assert.match(text, /^#!\/bin\/bash\n/);
      assert.match(text, /\nset -euo pipefail\n/);
    }
    // select, answered in the drop-down (options as arguments, menu arguments, token)
    let r = shim('omarchy-menu-select', ['Set timezone', 'Europe/Berlin', 'Asia/Tokyo', '--', '--width', '520', '--height', '400'], 'ok',
      {env: {FAKE_ANSWER: 'Asia/Tokyo', TUSCHE_BAR_ASK_TOKEN: 'tok1'}});
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'Asia/Tokyo\n');
    let p = sent();
    assert.deepEqual([p.mode, p.prompt, p.options, p.width, p.maxHeight, p.token], ['select', 'Set timezone', ['Europe/Berlin', 'Asia/Tokyo'], 520, 400, 'tok1']);
    assert(path.isAbsolute(p.selectionFile) && path.isAbsolute(p.doneFile) && !fs.existsSync(p.selectionFile));
    // options from stdin, with glyph and subtext; the answer keeps the subtext
    r = shim('omarchy-menu-select', ['Enable plugin'], 'ok', {input: '\u{f0431}\tTusche Bar\tnerdibeard.tusche-bar\nplain\n', env: {FAKE_ANSWER: 'Tusche Bar\tnerdibeard.tusche-bar'}});
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, 'Tusche Bar\tnerdibeard.tusche-bar\n');
    p = sent();
    assert.deepEqual(p.options, ['\u{f0431}\tTusche Bar\tnerdibeard.tusche-bar', 'plain']);
    assert(!('token' in p) && !('width' in p) && !('maxHeight' in p));
    // cancelled in the drop-down: exit 1, nothing printed (as the original)
    r = shim('omarchy-menu-select', ['Pick'], 'ok', {input: 'a\nb\n'});
    assert.deepEqual([r.status, r.stdout], [1, '']);
    // usage errors stay the original's, without asking anyone
    r = shim('omarchy-menu-select', ['Pick'], 'ok', {input: ''});
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Usage: omarchy-menu-select/);
    assert(!fs.existsSync(log));
    r = shim('omarchy-menu-select', [], 'ok');
    assert.equal(r.status, 1);
    // input, answered (an empty answer is an answer, as in the native menu)
    r = shim('omarchy-menu-input', ['Reminder in minutes', '--width', '400'], 'ok', {env: {FAKE_ANSWER: '15'}});
    assert.deepEqual([r.status, r.stdout], [0, '15\n']);
    p = sent();
    assert.deepEqual([p.mode, p.prompt, p.width, 'options' in p], ['input', 'Reminder in minutes', 400, false]);
    r = shim('omarchy-menu-input', [], 'ok', {env: {FAKE_ANSWER: ''}});
    assert.deepEqual([r.status, r.stdout, sent().prompt], [0, '\n', 'Input']);
    r = shim('omarchy-menu-input', ['Name'], 'ok');
    assert.deepEqual([r.status, r.stdout], [1, '']);
    // no drop-down (shell failing or refusing): the original, same arguments, same stdin
    for (const mode of ['fail', 'refuse']) {
      r = shim('omarchy-menu-select', ['Pick', 'a b', 'c', '--', '--width', '520'], mode);
      assert.deepEqual([r.status, r.stdout], [0, 'original [Pick] [a b] [c] [--] [--width] [520]\n'], mode);
      r = shim('omarchy-menu-select', ['Pick', '--', '--maxheight', '300'], mode, {input: 'one\n--\n  spaced  \n\u{f0431}\tlabel\tsub\n', env: {FAKE_EXIT: '3'}});
      assert.equal(r.status, 3, 'the original\'s exit status');
      assert.equal(r.stdout, 'original [Pick] [--] [--maxheight] [300]\nstdin [one]\nstdin [--]\nstdin [  spaced  ]\nstdin [\u{f0431}\tlabel\tsub]\n');
      r = shim('omarchy-menu-input', ['Name', '--width', '300'], mode);
      assert.deepEqual([r.status, r.stdout], [0, 'original [Name] [--width] [300]\n'], mode);
      r = shim('omarchy-menu-input', [], mode);
      assert.deepEqual([r.status, r.stdout], [0, 'original\n'], mode);
    }
    // the shim directory spelled three ways on PATH: still no loop, and the
    // original never sees it
    r = shim('omarchy-menu-select', ['Pick', 'x'], 'fail', {lead: [link, shimDir + '/', shimDir].join(':')});
    assert.deepEqual([r.status, r.stdout], [0, 'original [Pick] [x]\n']);
  } finally {
    fs.rmSync(tmp, {recursive: true, force: true});
  }
  console.log('PASS: nested drop-down (manifest kind, shell facade, providers, questions, routing, writes, detection, shims end to end)');
}

// Omarchy's own popups (native widgets folded into the status groups) take
// the theme material: NativeMaterial finds their KeyboardPanel and hangs a
// MaterialCard into its content holder; without material nothing changes.
{
  const nm = fs.readFileSync(path.join(root, 'NativeMaterial.qml'), 'utf8');
  const st = fs.readFileSync(path.join(root, 'modules/Status.qml'), 'utf8');
  assert(nm.includes('readonly property Component cardComponent: Component { MaterialCard {} }'));
  assert(nm.includes('cardComponent.createObject(holder, {'));
  assert(nm.includes('edge: false'), 'no extra line or shadow on Omarchy popups without material');
  assert(/o\.borderSpec !== undefined && o\.anchorItem !== undefined/.test(nm));
  assert(nm.includes('h.parent.borderSpec !== undefined'), 'the holder sits in the card, as MaterialCard expects');
  assert(nm.includes('dressed.indexOf(p) !== -1'), 'never two MaterialCards in one popup');
  assert(st.includes('Root.NativeMaterial { id: nativeMaterial }'));
  assert(st.includes('Qt.callLater(function() { nativeMaterial.attach(it) })'));
  // Omarchy's widgets in its own bar keep their trusted bar; only their popups are dressed
  assert(nm.includes('function dressBar(from)') && st.includes('nativeMaterial.dressBar(root)'));
  assert(/nativeIds: \["omarchy\.audio", "omarchy\.power"/.test(nm), 'only Omarchy panel widgets');
  assert(nm.includes('o.activeItem !== undefined && o.region !== undefined'), 'bar slots recognised by their API');
  console.log('PASS: native popups take the theme material');
}

// Logos from the logo design round (04.10.): Arch (the official mark,
// unaltered) and the Nerdibeard seal, each with the reviewed motion.
{
  assert.deepEqual(plain(ctx.ELEMENTS.logo.variants.map(v => v.id)), ['omarchy', 'arch', 'nerdibeard']);
  const layoutBase = {left: ['omarchy.menu', 'omarchy.workspaces'], center: [], right: []};
  for (const logo of ['arch', 'nerdibeard']) {
    const built = ctx.build(layoutBase, Object.assign({}, ctx.presetById('today').options, {logo}), '/plugin/modules');
    assert.equal(built.left[0].id, 'tusche.workspaces');
    assert.equal(built.left[0].variant, 'none');
    assert.equal(built.left[0].logo, logo);
  }
  // the seal: 16 × 16, 169 ink pixels; rank 0 = the letters' edges (80), 1…89 the rest, each once
  const seal = fs.readFileSync(path.join(root, 'modules/SealLogo.qml'), 'utf8');
  const rows = JSON.parse(seal.match(/readonly property var rows: (\[[\s\S]*?\])\n/)[1]);
  const ranks = JSON.parse(seal.match(/readonly property var ranks: (\[[\s\S]*?\])\n/)[1]);
  assert.equal(rows.length, 16);
  assert(rows.every(r => r.length === 16 && /^[.#x]+$/.test(r)));
  assert.equal(ranks.length, 256);
  const cells = rows.join('');
  assert(ranks.every((r, i) => (cells[i] === '#') === (r >= 0)), 'a rank exactly for every ink pixel');
  assert.equal(ranks.filter(r => r === 0).length, 80);
  const rest = ranks.filter(r => r > 0).sort((a, b) => a - b);
  assert.deepEqual(rest, Array.from({length: 89}, (_, i) => i + 1));
  assert(seal.includes('readonly property int restCount: 89'));
  assert(/duration: 320/.test(seal) && /1 - Math\.pow\(1 - p, 1\.6\)/.test(seal), 'one impression in 0.32 s');
  assert(/if \(Style\.reduceMotion\) \{ p = 1; opacity = 0; fadeIn\.start\(\) \}/.test(seal), 'reduced motion: a cross-fade');
  // Arch: the first path of the filesystem package's archlinux-logo.svg, one even-odd fill, a fade only
  const arch = fs.readFileSync(path.join(root, 'modules/ArchLogo.qml'), 'utf8');
  const archPath = arch.match(/PathSvg \{ path: "([^"]+)" \}/)[1];
  const svgFile = '/usr/share/pixmaps/archlinux-logo.svg';
  if (fs.existsSync(svgFile)) assert.equal(archPath, fs.readFileSync(svgFile, 'utf8').match(/ d="([^"]+)"/)[1], 'the mark unaltered');
  assert(arch.includes('fillRule: ShapePath.WindingFill'), 'one contour without holes: winding = the SVG\'s even-odd');
  assert(!/m[0-9.]+ [0-9.]+[^z]*z\s*m/i.test(archPath), 'a single closed contour');
  assert(/duration: Style\.reduceMotion \? 120 : 220/.test(arch));
  assert(!/Behavior on (x|y|scale)/.test(arch), 'motion only as a whole: no movement');
  // Workspaces: only the chosen logo is loaded; the seal's tab bleeds once; the menu title follows
  const ws = fs.readFileSync(path.join(root, 'modules/Workspaces.qml'), 'utf8');
  assert(ws.includes('active: root.variant !== "logo" && root.logo === "arch"'));
  assert(ws.includes('active: root.variant !== "logo" && root.logo === "nerdibeard"'));
  assert(ws.includes('visible: root.variant !== "logo" && ["arch", "nerdibeard"].indexOf(root.logo) === -1'), 'the Omarchy glyph otherwise');
  assert(ws.includes('visible: menuSlot.inverted && (root.logo !== "nerdibeard" || root.variant === "logo")'), 'the seal brings its own tab; the numbered frame keeps the plain one');
  assert(/property: "bleed"; from: 0; to: 1; duration: 240; easing\.type: Easing\.OutCubic/.test(ws));
  assert(ws.includes('pressed: menuMouse.pressed && !root.dropOpen'), 'press feedback in both motion modes');
  assert(ws.includes('readonly property bool target: reduced ? on && root.dropOpen : on'));
  assert(ws.includes('tab: sealTab.target'), 'the seal changes colour in step with its tab');
  assert(/Behavior on color \{ enabled: Style\.reduceMotion; ColorAnimation \{ duration: 120 \} \}/.test(seal), 'reduced motion: colour cross-fades');
  const dm = fs.readFileSync(path.join(root, 'DropMenu.qml'), 'utf8');
  const titleBody = dm.match(/readonly property string rootTitle: \{([\s\S]*?)\n  \}/)[1];
  const rootTitle = new Function('owner', titleBody);
  assert.equal(rootTitle({logo: 'arch', variant: 'none'}), 'Arch Linux');
  assert.equal(rootTitle({logo: 'nerdibeard', variant: 'stack'}), 'Nerdibeard');
  assert.equal(rootTitle({logo: 'nerdibeard', variant: 'logo'}), 'Omarchy', 'the numbered frame shows no mark');
  assert.equal(rootTitle({logo: 'omarchy', variant: 'pips'}), 'Omarchy');
  assert.equal(rootTitle(null), 'Omarchy');
  assert(dm.includes('(menu.level ? menu.level.title : menu.rootTitle).toUpperCase()'));
  console.log('PASS: logos Arch and Nerdibeard seal (variants, seal raster and order, unaltered Arch path, tab, menu title)');
}

// The system group's face (design round 04.10., recommendation 6): a drawn chip outline that fills
// like the battery; only the fill warns (CPU > 85 % or RAM > 90 %); a single-icon cell.
{
  const st = fs.readFileSync(path.join(root, 'modules/Status.qml'), 'utf8');
  const shared = fs.readFileSync(path.join(root, 'modules/StatusFace.qml'), 'utf8');
  const chipCtx = {};
  vm.createContext(chipCtx);
  vm.runInContext(functionSource(shared, 'chipLevel'), chipCtx);
  const lv = x => chipCtx.chipLevel(x);
  assert.deepEqual([0, 0.01, 0.02, 0.03, 0.08, 0.17, 0.45, 0.5, 0.51, 0.93, 1, 1.4, -1, NaN].map(lv),
                   [0, 0, 0, 1, 1, 2, 3, 3, 4, 6, 6, 6, 0, 0]);
  assert(st.includes('readonly property bool sysHot: cpu > 0.85 || mem > 0.9'));
  assert(st.includes('if (id === "bitr0t.system-monitor") return sysHot'));
  assert(st.includes('if (sysHot) out.push({ chip: true, color: Commons.Color.urgent, member: "bitr0t.system-monitor" })'));
  assert(st.includes('width: modelData.id === "phone" ? Style.space(58) : root.barSize + Style.space(2)'), 'the system group is a single-icon cell');
  assert(st.includes('StatusFace {'), 'the production row uses the same inert renderer as its preview');
  const face = shared.slice(0, shared.indexOf('component ChipFace'));
  assert(!face.includes('\\u{f061a}') && face.includes('ChipFace {'), 'no filled chip glyph, no meters');
  const chip = shared.slice(shared.indexOf('component ChipFace'));
  assert(/readonly property color ink: root\.ink/.test(chip) && /readonly property color fillInk: root\.sysHot \? root\.urgent : root\.ink/.test(chip),
         'the outline stays the bar ink; only the fill takes the alarm tone');
  assert(/border\.width: 2 \* chip\.u/.test(chip) && /model: 12/.test(chip), '2 px stroke, three pins per side');
  console.log('PASS: system face (chip outline, fill rows, warning, single cell)');
}

// Omarchy's own popups stay dressed when its widgets appear late (seen after
// the 04.10. Omarchy bar startup change): the dress timer keeps watching, and
// `tusche-bar state` reports what the search sees.
{
  const st = fs.readFileSync(path.join(root, 'modules/Status.qml'), 'utf8');
  const nm = fs.readFileSync(path.join(root, 'NativeMaterial.qml'), 'utf8');
  const en = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  assert(st.includes('interval: pass < 4 ? 1200 : 5000'), 'quick passes, then every 5 s');
  assert(st.includes('onTriggered: { nativeMaterial.forget(); nativeMaterial.dressBar(root); pass++ }'));
  assert(!/if \(\+\+pass >= 4\) stop\(\)/.test(st), 'the watch never stops');
  assert(nm.includes('function report(from)') && st.includes('function nativeReport() { return nativeMaterial.report(root) }'));
  assert(en.includes('natives: (function() { var s = Bridge.ModuleBus.pick("status")'));
  console.log('PASS: native popups dressed late too (slow watch, state report)');
}

// A switch for Omarchy's bar transparency in our menus (the drop-down's Tusche group),
// checked from shell.json bar.transparent.
{
  const en = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  assert(en.includes('readonly property bool barTransparent: !!(config && config.bar && config.bar.transparent === true)'));
  assert(en.includes('{ label: "Transparent bar", checked: root.barTransparent, action: function() { root.run("omarchy-bar transparent toggle") } }'));
  assert(en.includes('pick("Omarchy", ["Terminal", "Do not disturb", "Stay awake", "Transparent bar"])'), 'in the drop-down\'s Tusche group');
  console.log('PASS: transparent bar switch in the menus');
}


// Portable menus and status groups: entries of absent plugins stay hidden,
// empty groups go, the phone group needs Flux or Buds; deviations end in "more".
{
  const en = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  const st = fs.readFileSync(path.join(root, 'modules/Status.qml'), 'utf8');
  const has = (id, installed) => String(id).indexOf('omarchy.') === 0 || installed.indexOf(String(id)) !== -1;
  assert(en.includes('function hasPlugin(id) { return String(id).indexOf("omarchy.") === 0 || installedPlugins.indexOf(String(id)) !== -1 }'));
  for (const id of ['bitr0t.system-monitor', 'nerdibeard.monitor', 'nerdibeard.googledrive', 'com.omastorm.radar', 'community.plugin-manager',
                    'io.github.iamfitsum.omarchy-proton-vpn', 'flux', 'io.github.nerdislb.buds-control', 'io.github.moizibnyousaf.omawhatsapp', 'omamail',
                    'nerdibeard.tusche-island'])
    assert(en.includes(`requires: "${id}"`), id);
  assert(has('omarchy.network', []) && !has('flux', []) && has('flux', ['flux']));
  assert(en.includes('}).filter(function(g) { return g.items.length > 0 })'), 'empty groups go');
  assert(st.includes('model: root.variant === "groups" ? root.shownGroups : []'));
  assert(st.includes('model: root.variant === "deviations" ? root.deviations : []'));
  assert(st.includes('return g.id !== "phone" || !!root.phone || root.embedIds.indexOf("io.github.nerdislb.buds-control") !== -1'));
  // "more": every embedded widget, in deviations mode only
  const more = st.slice(st.indexOf('id: moreCell'), st.indexOf('component Cell'));
  assert(more.includes('visible: root.variant === "deviations"') && more.includes('onClicked: root.openGroup("all", moreCell)'));
  assert(st.includes('if (popupGroup === "all") return embedIds'));
  console.log('PASS: portable menus and status groups (absent plugins hidden, "more" in deviations)');
}

// Moving an Amiga Bar / Island setup over (setup/migrate-from-amiga.py), in a
// fake HOME: ids, sources and options rewritten, state carried over, a second
// run changes nothing.
{
  const os = require('node:os');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tusche-migrate-'));
  try {
    const put = (rel, data) => {
      const file = path.join(home, rel);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
      return file;
    };
    const read = rel => JSON.parse(fs.readFileSync(path.join(home, rel), 'utf8'));
    const oldDir = '/home/u/.config/omarchy/plugins/nerdibeard.amiga-bar/modules';
    const newDir = '/home/u/.config/omarchy/plugins/nerdibeard.tusche-bar/modules';
    const oldIsland = {id: 'nerdibeard.amiga-island', notifications: true, noteStyle: 'workbench', noteTopaz: true};
    const shellFile = put('.config/omarchy/shell.json', {
      plugins: [{id: 'nerdibeard.amiga-bar', options: {workspaces: 'cli', ai: 'gauge', right: 'compact', edge: 'workbench', logo: 'amiga', centre: 'calm',
                                                      effects: 'on', font: 'topaz', fog: 'on', menu: 'strip', form: 'a500'}},
                {id: 'nerdibeard.amiga-island'}, 'nerdibeard.card-picker'],
      bar: {transparent: true, centerAnchor: 'nerdibeard.amiga-island', layout: {
        left: [{id: 'amiga.workspaces', source: oldDir + '/Workspaces.qml', variant: 'cli', menu: true, logo: 'amiga'},
               {id: 'amiga.quota', source: oldDir + '/Quota.qml', variant: 'gauge'}],
        center: [oldIsland, 'omarchy.weather'],
        right: ['omamail', {id: 'amiga.status', source: oldDir + '/Status.qml', variant: 'compact', embeds: {'omarchy.network': {keep: 1}}}, 'omarchy.audio']}}
    });
    fs.chmodSync(shellFile, 0o600);
    put('.local/state/amiga-bar/base.json', {version: 1, layout: {left: ['omarchy.menu', 'omarchy.workspaces'], center: [oldIsland], right: ['omarchy.network', 'omarchy.audio']}});
    put('.local/state/amiga-bar/presets.json', [{name: 'Mine', options: {workspaces: 'boing', right: 'drawer', edge: 'theme', font: 'topaz', fog: 'on'}}, {options: {}}]);
    put('.local/state/omarchy/amiga-island/notifications-takeover', '');
    put('.local/state/omarchy/amiga-island/bar-span.json', '{}');
    put('.config/hypr/bindings.lua', 'o.bind("SUPER + A", "x", "y")\n-- BEGIN Amiga Bar (managed)\no.bind("SUPER + M", "Status", "omarchy-shell amiga-bar status")\n-- END Amiga Bar (managed)\n-- after\n');
    const run = () => cp.execFileSync('python3', [path.join(root, 'setup/migrate-from-amiga.py')],
      {encoding: 'utf8', env: Object.assign({}, process.env, {HOME: home})});
    assert.match(run(), /^shell\.json: ids, bar options and layout entries moved/m);
    const shell = read('.config/omarchy/shell.json');
    assert.deepEqual(shell.plugins, [{id: 'nerdibeard.tusche-bar', options: {workspaces: 'pips', ai: 'gauge', right: 'groups', edge: 'none', logo: 'omarchy', centre: 'calm'}},
      {id: 'nerdibeard.tusche-island'}, 'nerdibeard.card-picker']);
    const newIsland = {id: 'nerdibeard.tusche-island', notifications: true, noteStyle: 'window'};
    assert.deepEqual(shell.bar, {transparent: true, centerAnchor: 'nerdibeard.tusche-island', layout: {
      left: [{id: 'tusche.workspaces', source: newDir + '/Workspaces.qml', variant: 'pips', menu: true, logo: 'omarchy'},
             {id: 'tusche.quota', source: newDir + '/Quota.qml', variant: 'gauge'}],
      center: [newIsland, 'omarchy.weather'],
      right: ['omamail', {id: 'tusche.status', source: newDir + '/Status.qml', variant: 'groups', embeds: {'omarchy.network': {keep: 1}}}, 'omarchy.audio']}});
    assert.equal(fs.statSync(shellFile).mode & 0o777, 0o600, 'file mode kept');
    assert.deepEqual(read('.local/state/tusche-bar/base.json'), {version: 1, layout: {left: ['omarchy.menu', 'omarchy.workspaces'], center: [newIsland], right: ['omarchy.network', 'omarchy.audio']}});
    assert.deepEqual(read('.local/state/tusche-bar/presets.json'), [{name: 'Mine', options: {workspaces: 'pips', right: 'groups', edge: 'theme'}}]);
    assert(fs.existsSync(path.join(home, '.local/state/amiga-bar/base.json')), 'the old state stays');
    assert(fs.existsSync(path.join(home, '.local/state/omarchy/tusche-island/notifications-takeover')));
    assert(!fs.existsSync(path.join(home, '.local/state/omarchy/tusche-island/bar-span.json')), 'a file of the A500 form stays behind');
    const bindings = fs.readFileSync(path.join(home, '.config/hypr/bindings.lua'), 'utf8');
    assert(bindings.startsWith('o.bind("SUPER + A", "x", "y")\n-- BEGIN Tusche Bar (managed)\n') && bindings.endsWith('-- END Tusche Bar (managed)\n-- after\n'));
    assert(bindings.includes('"omarchy-shell tusche-bar menu"') && !bindings.includes('Amiga Bar'));
    // nothing left to do
    const before = fs.readFileSync(shellFile, 'utf8');
    const second = run();
    assert(second.trim().split('\n').every(l => /nothing/.test(l)), second);
    assert.equal(fs.readFileSync(shellFile, 'utf8'), before);
  } finally {
    fs.rmSync(home, {recursive: true, force: true});
  }
  console.log('PASS: migration from the Amiga Bar / Island (ids, sources, options, state, bindings; idempotent)');
}

// Drop-down menu: Omarchy's own entries on the first level, the rest under
// More; Super+Space as a launcher (search line, apps first) and Super+Alt+Space
// on the Apps list; the keys follow the "keys" look option via bin/keybinds.py.
{
  const dm = fs.readFileSync(path.join(root, 'DropMenu.qml'), 'utf8');
  const src = fs.readFileSync(path.join(root, 'OmarchyMenuSource.qml'), 'utf8');
  const ws = fs.readFileSync(path.join(root, 'modules/Workspaces.qml'), 'utf8');
  const engine = fs.readFileSync(path.join(root, 'Engine.qml'), 'utf8');
  assert(src.includes('function isBuiltin(id) { return builtinCount === 0 || builtinIds[id] === true }'), 'without Omarchy\'s file nothing moves');
  assert(dm.includes('source.children("root").filter(function(r) { return source.isBuiltin(r.id) })'), 'first level: Omarchy\'s own entries');
  assert(dm.includes('{ kind: "more", id: "more", label: "More"'), 'one More row');
  assert(dm.includes('if (lv.kind === "more") return moreRows()'));
  assert(/function moreRows\(\) \{[\s\S]*!source\.isBuiltin\(r\.id\)[\s\S]*kind: "group"/.test(dm), 'More: extension entries, then the bar groups');
  assert(dm.includes('r.kind === "more" || r.kind === "provider"'), 'More shows the submenu chevron');
  assert(dm.includes('if (searchMode) return apps.concat('), 'launcher search: apps first');
  assert(dm.includes('if (!menu.open) { menu.searchMode = false;'), 'search mode ends with the menu');
  assert(dm.includes('"⌕  ▏Search apps and menu"'));
  assert(/function openApps\(\) \{[\s\S]*root\[i\]\.provider === "apps"[\s\S]*omarchy-menu summon apps/.test(dm), 'Apps level or the native Apps menu');
  assert(ws.includes('m.searchMode = true') && ws.includes('function openApps()'));
  assert(engine.includes('function search(): void { root.toggleMenu("search") }') && engine.includes('function apps(): void { root.toggleMenu("apps") }'));
  assert(engine.includes('keysProc.action = keysOption === "bar" ? "bar" : "omarchy"'), 'the bindings follow the option');
  assert.deepEqual(plain(ctx.LOOK), ['edge', 'keys', 'frames', 'glass', 'glassMotion', 'statusHints', 'dayline', 'seal', 'urgentFrame']);
  assert.equal(ctx.normalizeOptions({}).keys, 'omarchy', 'plugin alone: Omarchy\'s keys stay');
  assert.equal(ctx.keepLook(ctx.presetById('tidy').options, {keys: 'bar'}).keys, 'bar', 'presets keep the keys');
  // look options only: the options are saved, the bar keeps its arrangement
  assert.equal(ctx.layoutDiffers({keys: 'bar', edge: 'line'}, {}), false, 'keys/edge alone do not rebuild the bar');
  assert.equal(ctx.layoutDiffers(ctx.presetById('tidy').options, {}), true, 'a preset still rebuilds');
  assert(/if \(currentLayout && !Presets\.layoutDiffers\(opts, options\)\) \{[\s\S]*?layout: currentLayout/.test(engine), 'apply keeps the arranged bar');
  assert(ws.includes('if (!m.appLibrary) { close(); bar.run("omarchy-menu toggle apps"); return }'), 'no app library: Omarchy\'s Apps menu toggles');
  // keybinds.py on a scratch file: adds one block, is idempotent, removes it
  // cleanly (copied blocks too); a stub hyprctl keeps the real compositor out
  const dir = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'tb-keys-'));
  try {
    const file = path.join(dir, 'bindings.lua');
    const bin = path.join(dir, 'bin'), calls = path.join(dir, 'hyprctl.calls');
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, 'hyprctl'), `#!/bin/sh\necho "$@" >> '${calls}'\n`, {mode: 0o755});
    fs.writeFileSync(file, 'o.bind("SUPER + A", "x", "y")\n', {mode: 0o640});
    const run = a => require('node:child_process').execFileSync('python3', [path.join(root, 'bin/keybinds.py'), a],
      {encoding: 'utf8', env: Object.assign({}, process.env, {OMARCHY_HYPR_BINDINGS: file, PATH: `${bin}:/usr/bin:/bin`})}).trim();
    const reloads = () => fs.existsSync(calls) ? fs.readFileSync(calls, 'utf8').trim().split('\n').length : 0;
    assert.equal(run('status'), 'omarchy');
    assert.equal(run('bar'), 'bar');
    const once = fs.readFileSync(file, 'utf8');
    assert(once.includes('hl.unbind("SUPER + SPACE")') && once.includes('"omarchy-shell tusche-bar search || omarchy-menu toggle root"')
      && once.includes('"omarchy-shell tusche-bar apps || omarchy-menu toggle apps"'));
    assert.equal(reloads(), 1, 'Hyprland asked to reload once');
    run('bar');
    assert.equal(fs.readFileSync(file, 'utf8'), once, 'idempotent');
    assert.equal(reloads(), 1, 'nothing changed: no reload');
    assert.equal(fs.statSync(file).mode & 0o777, 0o640, 'file mode kept');
    assert.equal(run('omarchy'), 'omarchy');
    assert.equal(fs.readFileSync(file, 'utf8'), 'o.bind("SUPER + A", "x", "y")\n', 'removed cleanly');
    // a block copied twice (e.g. by hand): one block after "bar", none after "omarchy"
    const block = once.slice(once.indexOf('-- BEGIN Tusche Bar keys'));
    fs.writeFileSync(file, block + '\no.bind("SUPER + A", "x", "y")\n\n' + block);
    run('bar');
    assert.equal(fs.readFileSync(file, 'utf8').split('-- BEGIN Tusche Bar keys').length - 1, 1, 'duplicates folded into one block');
    run('omarchy');
    assert.equal(fs.readFileSync(file, 'utf8'), 'o.bind("SUPER + A", "x", "y")\n', 'all copies removed');
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
  console.log('PASS: drop-down menu: Omarchy\'s entries first, More, launcher search, Apps level, Super+Space keys');
}

// AI quota popup: a card per agent, switchable; tracked agents without numbers
// keep an empty ring in the bar; the formatting helpers.
{
  const q = fs.readFileSync(path.join(root, 'modules/Quota.qml'), 'utf8');
  const face = fs.readFileSync(path.join(root, 'modules/QuotaFace.qml'), 'utf8');
  assert(q.includes('if (slug(l.title || l.label) !== parts[1]) continue'), 'tracked ids like the AI usage widget: title first (Antigravity limits only have a title)');
  assert(q.includes('QuotaFace {') && q.includes('ringItems: root.ringItems'), 'production quota uses the shared live-data renderer');
  assert(face.includes('model: root.ringItems') && face.includes('percent: modelData.missing ? -1 : modelData.percent'), 'rings include agents without numbers');
  assert(q.includes('readonly property var recordIds: ["claude", "codex", "antigravity", "grok", "fireworks"]'));
  assert(q.includes('WheelHandler { onWheel: function(e) { root.step(e.angleDelta.y > 0 ? -1 : 1) } }'), 'scroll switches agents');
  assert(/e\.key === Qt\.Key_Left[\s\S]*root\.step\(-1\)[\s\S]*e\.key === Qt\.Key_Right[\s\S]*root\.step\(1\)/.test(q), 'arrows switch agents');
  for (const name of ['Caption', 'Section', 'Meter', 'Ring'])
    assert(new RegExp('^  component ' + name + ': ', 'm').test(q), name + ' is a top-level inline component');
  const qc = {Qt: {locale: () => 'en_US'}, now: Date.parse('2026-10-06T17:40:00Z')};
  vm.createContext(qc);
  for (const f of ['num', 'tokens', 'modelName', 'topModels', 'favourite', 'hasData', 'limitsOf', 'peakOf', 'statusOf'])
    vm.runInContext(functionSource(q, f), qc);
  assert.equal(qc.tokens(102733415), '103M');
  assert.equal(qc.tokens(2900000000), '2.9B');
  assert.equal(qc.tokens(28811), '29k');
  assert.equal(qc.modelName('claude-opus-5-5'), 'Opus 5.5');
  assert.equal(qc.modelName('claude-haiku-4-5-20251001'), 'Haiku 4.5');
  assert.equal(qc.modelName('claude-opus-5'), 'Opus 5');
  assert.equal(qc.modelName('gpt-6.1-sol'), 'gpt-6.1-sol');
  assert.deepEqual(plain(qc.topModels({'claude-sonnet-5-5': 67, 'claude-opus-5-5': 35, x: 0}, 3).map(m => m.name)), ['Sonnet 5.5', 'Opus 5.5']);
  assert.equal(qc.favourite({modelUsage: {'claude-opus-5-5': {outputTokens: 9}, 'claude-haiku-4-5-20251001': {outputTokens: 2}}}), 'Opus 5.5');
  const ag = {name: 'Antigravity', ready: true, tierLabel: '', limits: [], usageStatusText: 'Antigravity closed', authHelpText: 'Open Antigravity to restore live usage.'};
  assert.equal(qc.hasData(ag), false, 'Omarchy would hide it; tracked keeps it');
  assert.equal(qc.peakOf(ag), -1, 'no numbers: empty ring');
  assert.equal(qc.statusOf(ag).text, 'Antigravity closed · Open Antigravity to restore live usage.');
  const cl = {name: 'Claude Code', ready: true, limits: [{label: 'Session (5-hour)', percent: 0.54, resetsAt: '2026-10-06T17:30:00Z'}, {label: 'Weekly (7-day)', percent: 0.69, resetsAt: '2026-10-09T02:00:00Z'}]};
  assert.equal(qc.peakOf(cl), 0.69);
  assert.deepEqual(plain(qc.limitsOf(cl).map(l => [l.percent, l.expired])), [[0, true], [0.69, false]], 'a passed reset counts as 0 %');
  assert.equal(qc.statusOf({name: 'Grok', ready: false, limits: [], usageStatusText: 'Waiting for auth', authHelpText: 'Run grok login.'}).urgent, true);
  console.log('PASS: AI quota popup (agent cards, switching, empty rings, formatting)');
}

// Metal family (Chrom & Platin, design round 07.10.2026): one shader and one
// MetalShape in both repos, the themes complete, every metal place wired.
{
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  const strip = t => t.replace(/^\/\/ \(Same component in the Tusche (Island|Bar): keep both copies alike\.\)$/m, '');
  const ms = read('MetalShape.qml'), frag = read('shaders/metal.frag');
  assert.ok(fs.existsSync(path.join(root, 'shaders/metal.frag.qsb')), 'compiled metal shader');
  const islandShape = path.join(islandDir, 'views/MetalShape.qml');
  if (fs.existsSync(path.join(islandDir, 'views/MaterialCard.qml')) && /metalRim/.test(fs.readFileSync(path.join(islandDir, 'views/MaterialCard.qml'), 'utf8'))) {
    assert.equal(strip(fs.readFileSync(islandShape, 'utf8')), strip(ms), 'both MetalShape copies alike');
    assert.equal(fs.readFileSync(path.join(islandDir, 'views/shaders/metal.frag'), 'utf8'), frag, 'one metal shader');
    assert.ok(fs.existsSync(path.join(islandDir, 'views/shaders/metal.frag.qsb')));
  }
  // every uniform of the shader is a property of MetalShape (ShaderEffect binds them by name)
  const block = frag.slice(frag.indexOf('uniform buf {'), frag.indexOf('};'));
  const uniforms = [...block.matchAll(/^\s*(?:float|vec2|vec4|mat4)\s+(\w+);/gm)].map(m => m[1]).filter(n => !n.startsWith('qt_'));
  assert.ok(uniforms.length >= 15);
  for (const u of uniforms) assert.match(ms, new RegExp(`property [\\w.]+ ${u}\\b`), `MetalShape provides ${u}`);
  assert.match(ms, /FrameAnimation \{\n\s*running: m\.visible && !m\.reduced && m\.flowRate > 0/, 'flow only when asked for, never with Reduced Motion');
  assert.match(ms, /function play\(\) \{\n\s*if \(reduced \|\| !visible \|\| width <= 0\) return/, 'no glint with Reduced Motion');
  // the themes
  for (const t of ['chrom', 'platin']) {
    for (const f of ['colors.toml', 'hyprland.lua', 'bar-material.json', 'neovim.lua', 'icons.theme', 'shell.bar.toml', 'shell.launcher.toml', 'shell.menu.toml', 'unlock.png'])
      assert.ok(fs.existsSync(path.join(root, 'themes', t, f)), `${t}/${f}`);
    assert.ok(fs.readdirSync(path.join(root, 'themes', t, 'backgrounds')).some(f => /^1-.*\.jpg$/.test(f)), `${t}: a first background`);
    const mat = JSON.parse(fs.readFileSync(path.join(root, 'themes', t, 'bar-material.json'), 'utf8'));
    assert.equal(mat.edge.kind, 'metal');
    assert.equal(mat.metal.flow, 0, `${t}: the metal stands still by default`);
    for (const k of ['rim', 'ring', 'tint', 'disp', 'spark', 'sharp', 'sweepMs', 'track']) assert.ok(mat.metal[k] !== undefined, `${t}: metal.${k}`);
    assert.equal(mat.card.roll, true, `${t}: cards still roll`);
    assert.equal(mat.metal.hoverRadius, 3, `${t}: the hover tube is nearly square like the cards (owner, 07.10.)`);
    assert.equal(mat.metal.ringStyle, 2, `${t}: quota rings as a solid arc with a chrome head (readable at bar size)`);
    const hypr = fs.readFileSync(path.join(root, 'themes', t, 'hyprland.lua'), 'utf8');
    // a turning linear gradient looked uneven (1° steps, racing edges): the border stands still;
    // the bar's `frames glint` runs a glint along it instead (owner, 08.10.)
    assert.match(hypr, /hl\.animation\(\{ leaf = "borderangle", enabled = false \}\)/, `${t}: the border stands still`);
    assert.match(hypr, /angle = 45 \}/, `${t}: the striped chrome border (V1)`);
    assert.doesNotMatch(hypr.replace(/^--.*$/gm, ''), /loop/, `${t}: no looping border (it would redraw all the time)`);
    const colors = fs.readFileSync(path.join(root, 'themes', t, 'colors.toml'), 'utf8');
    const reds = [...colors.matchAll(/"#([0-9a-f]{6})"/g)].map(m => m[1]).filter(h => parseInt(h.slice(0, 2), 16) - Math.max(parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)) > 60);
    assert.ok(reds.length >= 1 && new Set(reds).size <= 2, `${t}: red is the one signal colour`);
  }
  assert.match(read('setup/install.sh'), /themes=\(tusche papier tusche-lavur papier-lavur chrom platin frost smoke\)/);
  // the wiring
  const edge = read('ThemeEdge.qml');
  assert.match(edge, /readonly property var metal: !!spec && spec\.kind === "metal" \? Bridge\.ModuleBus\.metal : null/);
  assert.match(edge, /MetalShape \{\n\s*id: edgeMetal/);
  const mc = read('MaterialCard.qml');
  assert.match(mc, /readonly property bool metalOn: matOn && !!metalSpec/);
  assert.match(mc, /height: fp\.frameH \* \(fp\.rolls \? fp\.reveal : 1\) \+ 2 \* pad/, 'the rim rolls out with the card');
  assert.match(mc, /function onOpenChanged\(\) \{\s*fp\.keepSnap\(\); fp\.follow\(\); fp\.glintPending = fp\.panel\.open; fp\.glint\(\)/, 'a card glints as it opens');
  assert.match(mc, /onVisibleChanged: fp\.glint\(\)/, '… once its rim is visible (the card starts at opacity 0)');
  assert.match(frag, /g = gl > 1e-4 \? g \/ gl : vec2\(0\.0, -1\.0\);/, 'no atan(0, 0) on a bar\'s centre line');
  assert.match(frag, /col = mix\(track\.rgb, col, filled\);\n\s*alphaMul = mix\(track\.a, 1\.0, filled\);/, '0 % = the track only');
  assert.match(frag, /bool wrap = \(mode > 0\.5 && mode < 1\.5\) \|\| \(mode > 2\.5 && ringStyle < 0\.5\);\n\s*float d = wrap \? abs\(fract\(sweepPos - sweep \+ 0\.5\) - 0\.5\) : abs\(sweepPos - sweep\);/, 'the popup sweep never wraps; only rings and the orbit do');
  // window frames: the popup sweep, or an orbit by arc length, only while it runs
  assert.match(frag, /: frameMode && !frameSweep \? perimeterPos\(p\)/, 'the orbit is placed by arc length (an even pace round the corners)');
  assert.match(frag, /if \(frameMode && sweepAmt <= 0\.0\) \{ fragColor = vec4\(0\.0\); return; \}/);
  assert.match(ms, /kind === "frame" \? 3 : 0/);
  const wg = read('WindowGlint.qml');
  assert.match(wg, /visible: root\.running && reaches/, 'a surface only while the glint runs, on every monitor the frame reaches');
  assert.match(wg, /if \(query\.gen !== root\.generation \|\| !root\.eligible\(\)\) return/, 'a late query never restarts a stopped glint');
  assert.match(wg, /if \(root\.key\(w\) !== root\.geometryKey\) root\.stop\(\)/, 'a drag or resize stops it (watched while it runs)');
  assert.match(wg, /var b = Math\.round\(root\.borderSize \* sc\) \/ sc/, 'the border on whole device pixels, as Hyprland draws it');
  assert.match(wg, /function onReduceMotionChanged\(\) \{ if \(Style\.reduceMotion\) root\.stop\(\) \}/);
  assert.match(ms, /onReducedChanged: if \(reduced && kind !== "frame"\)/, 'Reduced Motion keeps the frame glint\'s binding');
  assert.match(wg, /mask: Region \{\}/, 'click-through');
  assert.match(wg, /n === "workspacev2" \|\| n === "movewindowv2" \|\| n === "fullscreen" \|\| n === "changefloatingmode" \|\| n === "closewindow"/, 'it never trails a moving window');
  assert.match(wg, /if \(!w \|\| !w\.address \|\| !w\.size \|\| w\.fullscreen > 0 \|\| w\.hidden\) return/);
  assert.match(wg, /property: "sweep"; from: 0; to: 1\.06; duration: root\.durationMs; easing\.type: Easing\.OutQuad/, 'one turn and a little past, slowing towards the end (OutCubic crept)');
  assert.match(wg, /property: "amount"; from: 0; to: 1; duration: 200/, 'the glint fades in');
  assert.match(read('Engine.qml'), /metal: root\.material && root\.material\.metal \? root\.material\.metal : null\n\s*glass: root\.material && root\.material\.glass && root\.options\.glass !== "off" \? root\.material\.glass : null\n\s*style: root\.options\.frames === "orbit" \? "orbit" : "sweep"\n\s*enabled: \(root\.options\.frames === "glint" \|\| root\.options\.frames === "orbit"\) && \(!!metal \|\| !!glass\)/, 'the frame glint follows the theme (chrome on metal, its own on glass), not the edge option');
  // glint = a card's glint (owner, 08.10.: the quietest); orbit = once round
  assert.match(wg, /property: "sweep"; from: -0\.15; to: 1\.15; duration: root\.sweepMs; easing\.type: Easing\.InOutQuad/, 'the frame sweep is exactly a card\'s glint');
  assert.match(ms, /property: "sweep"; from: -0\.15; to: 1\.15; duration: glint\.duration; easing\.type: Easing\.InOutQuad/, '… as MetalShape.play()');
  assert.match(frag, /float sd = frameSweep \? sweepPos - sweep : fract\(sweepPos - sweep \+ 0\.5\) - 0\.5;/);
  assert.match(frag, /: frameMode && !frameSweep \? perimeterPos\(p\)/, 'the sweep takes the cards\' diagonal coordinate');
  assert.deepEqual(plain(ctx.ELEMENTS.frames.variants.map(v => v.id)), ['hyprland', 'glint', 'orbit'], 'off by default');
  const islandBar = path.join(islandDir, 'BarWidget.qml');
  if (fs.existsSync(islandBar) && /chipMetal/.test(fs.readFileSync(islandBar, 'utf8')))
    assert.match(fs.readFileSync(islandBar, 'utf8'), /onSegKeyChanged: if \(segKey !== ""\) chipMetal\.play\(\)/, 'the segment glints by kind, not on every timer tick');
  const q = read('modules/Quota.qml');
  assert.match(q, /Root\.MetalShape \{\n\s*id: metalRing\n\s*visible: !!ring\.metal\n\s*spec: ring\.metal\n\s*kind: "ring"/);
  assert.match(q, /tint: ring\.percent >= 0\.9 \? Commons\.Color\.urgent/, 'a nearly spent quota takes the signal colour');
  assert.match(q, /kind: "pill"/);
  assert.match(q, /ringStyle: ring\.metal && ring\.metal\.ringStyle !== undefined \? Number\(ring\.metal\.ringStyle\) : 0/);
  assert.match(frag, /float ringStyle;/);
  assert.match(read('DropMenu.qml'), /readonly property bool inverting: !!src && !metalHover/);
  assert.match(read('DropMenu.qml'), /radius: tube \? menu\.hoverRadius\(height\) : menu\.rowRadius/, 'the hover fill takes the tube\'s shape');
  assert.match(read('DropMenu.qml'), /radius: menu\.hoverRadius\(height - 2 \* pad\)/, 'fill and tube share one radius');
  assert.match(read('modules/Workspaces.qml'), /id: logoMetal/);
  const en = read('Engine.qml');
  assert.match(en, /if \(event && event\.name === "workspacev2"\) metalPulseTimer\.restart\(\)/, 'only a workspace switch pulses the metal (focus and popups were too much)');
  assert.doesNotMatch(en, /activewindowv2|"openlayer"/);
  assert.match(en, /if \(now - root\.lastMetalPulse < gap\) return/, 'no second glint within pulseGapMs');
  assert.match(read('ThemeEdge.qml'), /function onMetalPulse\(\) \{ if \(root\.metal && root\.metal\.edgeGlint === true\) edgeMetal\.play\(\) \}/, 'the bar\'s edge stays still unless edgeGlint');
  assert.match(read('bridge/ModuleBus.qml'), /function pulse\(\) \{ if \(metal\) metalPulse\(\) \}/);
  console.log('PASS: metal family (one shader in both repos, Chrom & Platin complete, rims, rings, meters, hover, logo, pulse)');
}

// Qt 6.12 brings its own `Color` type in QtQuick that shadows the shell's
// palette singleton: every palette reference is `Commons.Color` (Omarchy
// b83d3df0), in the bar, the island and the card picker alike.
{
  const bare = /(?<![\w.])Color(?![\w])/;
  const roots = [root, islandDir, path.resolve(root, '../omarchy-card-picker')].filter(d => fs.existsSync(d));
  const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory()
    ? (['vendor', 'tests', '.git', 'node_modules'].includes(e.name) ? [] : walk(path.join(d, e.name)))
    : (e.name.endsWith('.qml') ? [path.join(d, e.name)] : []));
  for (const r of roots) for (const f of walk(r)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n').filter(l => !l.trimStart().startsWith('import ') && !l.trimStart().startsWith('//'));
    const hit = lines.find(l => bare.test(l));
    assert(!hit, `${path.relative(path.dirname(root), f)}: bare Color (Qt 6.12 shadows it): ${hit && hit.trim()}`);
    if (lines.some(l => /Commons\.Color/.test(l))) assert.match(fs.readFileSync(f, 'utf8'), /^import qs\.Commons as Commons$/m, `${f}: Commons alias`);
  }
  console.log('PASS: palette references qualified for Qt 6.12 (Commons.Color)');
}

// `omarchy theme set` replaces the theme folder: a watch on a file inside it
// dies with the first switch. Files read from the current theme reload when
// theme.name changes (rewritten in place each time).
{
  const q = fs.readFileSync(path.join(root, 'modules/Quota.qml'), 'utf8');
  assert.match(q, /id: palFile\n\s*path: Commons\.Color\.currentThemePath \+ "\/colors\.toml"/);
  assert.match(q, /current\/theme\.name"\n\s*watchChanges: true\n\s*printErrors: false\n\s*onFileChanged: reload\(\)\n\s*onLoaded: palFile\.reload\(\)/, 'the ring tones follow a theme switch');
  const isl = path.join(islandDir, 'Island.qml');
  if (fs.existsSync(isl))
    assert.match(fs.readFileSync(isl, 'utf8'), /onLoaded: \{ materialFile\.reload\(\); themeColorsFile\.reload\(\) \}/, 'the island\'s green/orange follow a theme switch');
  console.log('PASS: theme colours reload on theme switch (theme.name)');
}

// Uninstall from the drop-down: right-click or Delete on an app asks first
// (the native menu's ConfirmDialog), then the shell's appLibrary.remove runs
// omarchy-remove-launcher-entry; nothing else ever offers it.
{
  const dm = fs.readFileSync(path.join(root, 'DropMenu.qml'), 'utf8');
  assert(/function requestDelete\(r\) \{\s*if \(!r \|\| r\.kind !== "app" \|\| !appLibrary \|\| !r\.appId\) return false/.test(dm), 'only apps can be uninstalled');
  assert(dm.includes('finish(function() { lib.remove(target.appId, target.label) })'), 'the shell\'s remove does the work');
  assert(dm.includes('acceptedButtons: Qt.LeftButton | Qt.RightButton') && dm.includes('mouse.button === Qt.RightButton'), 'right-click on a row');
  assert(dm.includes('e.key === Qt.Key_Delete'), 'Delete key');
  assert(/if \(menu\.deleteConfirmOpen\) \{ deleteConfirm\.handleKey\(e\); e\.accepted = true; return \}/.test(dm), 'the question takes every key');
  assert(/ConfirmDialog \{\s*id: deleteConfirm/.test(dm) && dm.includes('confirmText: "Uninstall"') && dm.includes('import qs.Ui'));
  assert(dm.includes('menu.deleteTarget = null'), 'a new opening drops a pending question');
  assert(dm.includes('"Del · uninstall"'), 'hint on the hovered app row');
  assert(dm.includes('deleteConfirm.selectedIndex = 0'), 'Cancel is preselected');
  console.log('PASS: uninstall an app from the drop-down (right-click, Delete, question, shell remove)');
}
