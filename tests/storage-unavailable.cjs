const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source=fs.readFileSync('js/storage.js','utf8');
function setup(storage){
 const notices=[];const document={body:{appendChild:n=>notices.push(n)},getElementById:()=>notices[0],createElement:()=>({style:{},setAttribute(){},appendChild(){}})};
 const context=vm.createContext({window:{get localStorage(){return storage();},get sessionStorage(){return storage();}},document});
 vm.runInContext(source,context);return {run:s=>vm.runInContext(s,context),notices};
}
let writes=0; const denied=setup(()=>{throw Error('denied');});
assert.equal(denied.run("appLocalStorage.getItem('old')"),null);
denied.run("appLocalStorage.setItem('new','value')");assert.equal(denied.run("appLocalStorage.getItem('new')"),'value');assert.throws(()=>denied.run('appLocalStorage.requireStorage()'));
assert.equal(denied.notices.length,1);
const values=new Map([['old','preserved'],['routing','saved']]);let fail=false;
const native={getItem:k=>values.get(k)??null,setItem(k,v){writes++;if(fail)throw Error('quota');values.set(k,v);},removeItem:k=>values.delete(k)};
const quota=setup(()=>native);fail=true;quota.run("appLocalStorage.setItem('new','session')");fail=false;
quota.run("appLocalStorage.setItem('old','session only')");assert.equal(values.get('old'),'preserved');assert.equal(quota.run("appLocalStorage.getItem('routing')"),'saved');assert.equal(writes,1);
let once=true;native.setItem=(k,v)=>{if(k==='bad'&&once){once=false;throw Error('quota');}values.set(k,v);};
const batch=setup(()=>native);assert.throws(()=>batch.run("appLocalStorage.replace({old:'changed',bad:'x'},['routing'])"));assert.equal(values.get('old'),'preserved');assert.equal(values.get('routing'),'saved');assert(!values.has('bad'));
const healthy=setup(()=>native);healthy.run("appLocalStorage.replace({old:'updated'},['routing'])");assert.equal(values.get('old'),'updated');assert(!values.has('routing'));
for(const file of fs.readdirSync('js').filter(x=>x.endsWith('.js')&&x!=='storage.js')) assert(!/(?<!app)\b(localStorage|sessionStorage)\s*\./.test(fs.readFileSync('js/'+file,'utf8')),file+' bypasses adapter');
console.log('Preference failures passed: denied getters, session fallback, no write-through after failure, readable saved values, rollback, healthy replacement and storage access coverage.');
const stateSource=fs.readFileSync('js/trainer-state.js','utf8');
denied.run(stateSource);
assert.throws(()=>denied.run('buildSettingsBackupPayload()'));
assert.throws(()=>denied.run("importSettingsBackupPayload({settings:{pt_appearance:'dark'}})"));
assert.throws(()=>denied.run('clearSavedPreferences()'));
const prefs={pt_playerPianoType:'61'};
const store={getItem:k=>prefs[k]??null,setItem:(k,v)=>{prefs[k]=String(v);},removeItem:k=>{delete prefs[k];}};
const state=setup(()=>store);state.run(stateSource);
// Seeding must preserve existing keys even if the first-run marker is absent.
state.run("appLocalStorage.setItem(PLAYER_PIANO_STORAGE_KEY,'61');appLocalStorage.removeItem(FIRST_RUN_INIT_STORAGE_KEY);seedFirstRunDefaults()");
assert.equal(state.run('appLocalStorage.getItem(PLAYER_PIANO_STORAGE_KEY)'),'61');
state.run("importSettingsBackupPayload({settings:{pt_appearance:'dark'}})");assert.equal(state.run("appLocalStorage.getItem('pt_appearance')"),'dark');
console.log('Full preference initialization, blocked backup/import/reset, non-overwriting defaults and healthy settings import passed.');

