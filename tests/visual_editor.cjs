const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const presets = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'Presets.js'), 'utf8'), presets);
const visual = vm.createContext({Presets: presets});
vm.runInContext(fs.readFileSync(path.join(root, 'VisualEditor.js'), 'utf8').replace(/^\.import .*\n/m, ''), visual);
const plain = x => JSON.parse(JSON.stringify(x));
let count = 0;
function check(label, fn) { fn(); count++; console.log('PASS ' + label); }

check('hover is an isolated normalized copy and does not mutate staged options', () => {
  const staged = {workspaces:'minimap', ai:'rings', right:'groups', logo:'nerdibeard', edge:'theme'};
  const before = JSON.stringify(staged);
  const preview = plain(visual.previewOptions(staged, 'ai', 'gauge'));
  assert.equal(preview.ai, 'gauge');
  assert.equal(preview.workspaces, 'minimap');
  assert.equal(JSON.stringify(staged), before);
  assert.equal(visual.previewOptions(staged, '', '').ai, 'rings');
});
check('unknown, nonvisual and invalid variant hovers cannot alter options', () => {
  const o = plain(presets.normalizeOptions({ai:'rings', frames:'glint'}));
  for (const [key, value] of [['__proto__','rings'], ['frames','orbit'], ['ai','<img>'], ['missing','on']])
    assert.deepEqual(plain(visual.previewOptions(o,key,value)),o);
  assert.equal(visual.valid('__proto__','rings'),false);
});
check('preset differences keep every look option and report only actual changes', () => {
  const current = plain(presets.normalizeOptions({workspaces:'minimap',ai:'rings',right:'groups',logo:'nerdibeard',edge:'theme',frames:'glint',glass:'off'}));
  const preset = presets.presetById('tidy');
  const next = plain(presets.keepLook(preset.options,current));
  const differences = plain(visual.differences(current,next));
  for (const key of presets.LOOK) assert.equal(next[key], current[key]);
  assert(differences.some(x=>x.key==='workspaces'&&x.before==='Minimap'&&x.after==='Pips'));
  assert(!differences.some(x=>presets.LOOK.includes(x.key)));
  assert.equal(visual.differenceText(current,current),'No changes');
});
check('quiet preview never changes live material or theme timing', () => {
  const m={card:{roll:true},metal:{flow:.3,sweepMs:900,ringStyle:2},glass:{frame:{ms:650,amount:.9}}};
  const before=JSON.stringify(m), q=plain(visual.quietMaterial(m));
  assert.equal(q.metal.flow,0);
  assert.equal(q.metal.sweepMs,900);
  assert.deepEqual(q.glass,m.glass);
  assert.equal(JSON.stringify(m),before);
  assert.equal(visual.quietMaterial(null),null);
});
check('all visual parts and their legal values are accepted without inventing options', () => {
  for (const key of visual.PARTS)
    for (const v of presets.ELEMENTS[key].variants) {
      assert.equal(visual.valid(key,v.id),true);
      assert.equal(visual.previewOptions({},key,v.id)[key],v.id);
      assert.equal(visual.valueLabel(key,v.id),v.label);
    }
});
console.log(count+' visual editor model checks passed');
