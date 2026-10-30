const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/feedback-engine.js','utf8');const ctx=vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function getCombinedTieLength('),source.indexOf('function buildExpectedNotesFromEntries(')),ctx);
const note=(length,pitch=48)=>({halfTone:pitch,Length:{RealValue:length}});
function shared(lengths){const notes=lengths.map(l=>note(l));const tie={StartNote:notes[0],Notes:notes};notes.forEach(n=>n.NoteTie=tie);return notes;}
for(const lengths of [[1,1,1],[.1875,.25,.5],[.0625,.25,.0625],[.125,.25,.5,1],[.25,.25]]){
 const chain=shared(lengths);assert.equal(ctx.getCombinedTieLength(chain[0]),lengths.reduce((a,b)=>a+b,0));
 assert.equal(ctx.getCombinedTieLength(chain.at(-1)),lengths.at(-1));
}
assert.equal(ctx.getCombinedTieLength(null),0);assert.equal(ctx.getCombinedTieLength(note(.25)),.25);
const mismatch=shared([.25,.5]);mismatch[1].halfTone=49;assert.equal(ctx.getCombinedTieLength(mismatch[0]),.25);
const a=note(.25),b=note(.5),c=note(.125);a.NoteTie={NextNote:b};b.NoteTie={nextNote:c};c.NoteTie={NextNote:a};assert.equal(ctx.getCombinedTieLength(a),.875);
const isolated=note(.25);isolated.NoteTie={Notes:[note(.5)]};assert.equal(ctx.getCombinedTieLength(isolated),.25);
console.log('Tie lengths passed: observed three-segment shapes, four segments, two/untied notes, suffix, same-pitch guard, explicit links and cycle protection.');
