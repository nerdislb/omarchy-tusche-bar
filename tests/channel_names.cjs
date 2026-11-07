const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const channels = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../ChannelNames.js'), 'utf8').replace(/^\.pragma.*$/mg, ''), channels);
const names = channels.parse('Main, Build,, chat ');
assert.deepEqual(Array.from(names), ['MAIN','BUILD','','CHAT']);
for (const [id, position] of [[1,1],[2,2],[10,10],[12,2],[20,10],[1011,11],[1112,12],[1164,64]]) {
  assert.equal(channels.position(id,[],true),position);
}
assert.equal(channels.label(2,names),'02 BUILD');
assert.equal(channels.label(3,names),'CH 03');
assert.equal(channels.label(10,names),'CH 10');
assert.equal(channels.label(64,names),'CH 64');
assert.equal(channels.label(0,names),'');
assert.equal(channels.label(2,channels.parse('')),'CH 02');
const spaces = [{id:120,name:'120',monitorID:1},{id:27,name:'27',monitorID:1},
  {id:3,name:'3',monitorID:2},{id:-99,name:'special:stash',monitorID:1}];
assert.equal(channels.position(120,spaces,false),2);
assert.equal(channels.position(3,spaces,false),1);
assert.equal(channels.position(0,spaces,false),0);
assert.equal(channels.label(1,channels.parse('<b>main</b>')),'01 <B>MAIN</B>');
console.log('PASS channel names: sparse monitor blocks, indices above ten, native monitor separation, empty slots, uppercase literal labels');
