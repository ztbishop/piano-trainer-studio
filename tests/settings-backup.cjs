const fs=require('node:fs'),vm=require('node:vm');
const runChecks=require('../docs/diagnostics/settings-backup-cases.js');
const local={},session={};let writes=0,failKey;
function store(data){return new Proxy(data,{get(target,key){
 if(key==='getItem')return k=>target[k]??null;
 if(key==='setItem')return(k,v)=>{writes++;if(k===failKey){failKey=null;throw Error('Simulated quota');}target[k]=String(v);};
 if(key==='removeItem')return k=>{writes++;delete target[k];};return target[key];
}});}
const document={body:{appendChild(){}},getElementById:()=>null,createElement:()=>({style:{},setAttribute(){},appendChild(){}})};
const window={localStorage:store(local),sessionStorage:store(session)};
Object.defineProperty(window,'indexedDB',{get(){throw Error('Settings must never access score storage');}});
const context=vm.createContext({window,document,console});
for(const file of ['storage','trainer-state'])vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),context);
const api=vm.runInContext('({validate:validateSettingsBackupPayload,import:importSettingsBackupPayload,export:buildSettingsBackupPayload,keys:RESETTABLE_PREFERENCE_KEYS})',context);
Object.assign(api,{get:k=>local[k]??null,set:(k,v)=>{local[k]=v;},snapshot:()=>JSON.stringify({local,session,writes}),localSnapshot:()=>JSON.stringify(local),failOnce:k=>{failKey=k;}});
console.log('Settings backup validation: '+runChecks(api)+' checks passed (in-memory stores only).');
