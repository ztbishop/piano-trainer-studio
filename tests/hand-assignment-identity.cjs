const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let source=fs.readFileSync('js/hand-assignment.js','utf8');
// Expose pure identity helpers only in this isolated test context.
source=source.replace('return { deactivate:', 'return { fingerprint, assignmentStorageKey, deactivate:');
const stored=new Map(),reads=[];let writes=0;
const context=vm.createContext({window:{},ArrayBuffer,Uint8Array,Blob,console,
 DOMParser:class{parseFromString(xml){return {documentElement:{localName:xml.includes('<score-partwise')?'score-partwise':'parsererror'},querySelector:s=>s==='parsererror'&&!xml.includes('<score-partwise')?{}:null,querySelectorAll:()=>[]};}},
 document:{getElementById:()=>null,addEventListener(){}},AppState:{hands:{},pendingAudio:[]},osmd:{Sheet:{Instruments:[{Staves:[{},{}]}]},cursor:{reset(){},Iterator:{EndReached:true}}},
 appLocalStorage:{getItem:k=>{reads.push(k);return stored.get(k)??null;},setItem:(k,v)=>{writes++;stored.set(k,v);}},
 clearVisuals(){},getResolvedStaffAssignmentIdFromNote:()=>1,refreshCurrentExpectedNotes(){},renderVirtualKeyboard(){},updateUpcomingNotes(){}});
vm.runInContext(source,context);const api=context.window.HandAssignment;
(async()=>{
const xml='<score-partwise/>',a=new Uint8Array([1,2,3]),b=new Uint8Array([1,2,4]);
assert.equal(await api.assignmentStorageKey(xml,a),'pt_handAssignment_v1_e5d51dff4e87e7c13bce4aed909cb0d3'); // Recorded before this change.
const empty='pt_handAssignment_v1_'+api.fingerprint('');stored.set(empty,JSON.stringify({staff:{1:'ignore',2:'ignore'}}));
await api.initialize(null,a);assert.equal(api.roleForStaff(1),'right');assert(!reads.includes(empty));
const keyA=await api.assignmentStorageKey(null,a),keyB=await api.assignmentStorageKey(null,b);assert.notEqual(keyA,keyB);
stored.set(keyA,JSON.stringify({staff:{1:'left',2:'right'},mode:'staff'}));
await api.initialize(null,a);assert.equal(api.roleForStaff(1),'left');
await api.initialize(null,b);assert.equal(api.roleForStaff(1),'right');
assert.equal(await api.assignmentStorageKey(null,new Blob([a])),keyA);
assert.equal(await api.assignmentStorageKey(null,a.buffer.slice(0)),keyA);
assert.equal(await api.assignmentStorageKey(null,new Uint8Array([9,1,2,3,9]).subarray(1,4)),keyA);
assert.notEqual(await api.assignmentStorageKey(null,'abc'),await api.assignmentStorageKey(null,new Uint8Array([97,98,99])));
assert.equal(await api.assignmentStorageKey(null,'   '),null);
const before=reads.length;await api.initialize(null,null);assert.equal(reads.length,before);assert.equal(api.roleForStaff(1),'right');
await api.initialize('',new Uint8Array());assert.equal(reads.length,before);
const unreadable=new Blob([a]);unreadable.arrayBuffer=async()=>{throw Error('Unreadable source');};
await api.initialize(null,unreadable);assert.equal(reads.length,before);assert.equal(api.roleForStaff(1),'right');
await api.initialize('not xml',a);assert.equal(api.roleForStaff(1),'left');
stored.set(await api.assignmentStorageKey(xml,a),JSON.stringify({staff:{1:'ignore'}}));await api.initialize(xml,b);assert.equal(api.roleForStaff(1),'ignore');
assert(stored.has(empty));assert.equal(writes,0);
assert(fs.readFileSync('js/trainer-core.js','utf8').includes('HandAssignment.initialize(canonicalOriginalMusicXml, transposeSourceRawData)'));
console.log('Assignment identity passed: unchanged XML keys, ignored shared empty key, distinct sources, reopen, Blob/buffer/view equivalence, typed domains, missing/malformed XML and no initialization writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
