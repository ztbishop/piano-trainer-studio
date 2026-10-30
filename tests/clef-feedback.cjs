const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/feedback-engine.js','utf8');
const clef=(type,line,octave=0)=>({ClefType:type,Line:line,OctaveOffset:octave});
const G=clef(0,2),F=clef(1,4),C=clef(2,3),entry=c=>({Instructions:c?[c]:[]});
const measure=(time,first=[],middle=[],last=[])=>({AbsoluteTimestamp:{RealValue:time},FirstInstructionsStaffEntries:first.map(entry),VerticalSourceStaffEntryContainers:middle.map(([t,cs])=>({Timestamp:{RealValue:t},StaffEntries:cs.map(entry)})),LastInstructionsStaffEntries:last.map(entry)});
const osmd={Sheet:{SourceMeasures:[measure(0,[G,F,G,C]),measure(1,[],[[.5,[F,G]]],[G,F]),measure(2)]},GraphicSheet:{MeasureList:Array.from({length:3},()=>Array.from({length:4},(_,i)=>({PositionAndShape:{AbsolutePosition:{y:10+i*10}}})))},cursor:{cursorElement:{getBoundingClientRect:()=>({left:5,top:0,width:10,height:10})},Iterator:{CurrentMeasureIndex:1,currentTimeStamp:{RealValue:1.5}}}};
const state={hands:{left:2,right:1},currentExpectedContext:null};
const ctx=vm.createContext({osmd,AppState:state,opensheetmusicdisplay:{ClefEnum:{G:0,F:1,C:2}},GeometryEngine:{clientPointToSvg:(x,y)=>({x,y})}});
vm.runInContext(source.slice(source.indexOf('function getFeedbackContextKey('),source.indexOf('function renderFeedbackOverlay(')),ctx);
assert.equal(ctx.getFeedbackClef(1,0,1.49),G);assert.equal(ctx.getFeedbackClef(1,0,1.5),F);assert.equal(ctx.getFeedbackClef(1,1,1.5),G);assert.equal(ctx.getFeedbackClef(2,0,2),G);assert.equal(ctx.getFeedbackClef(2,1,2),F);assert.equal(ctx.getFeedbackClef(0,0,0),G); // Seek backward after later queries.
assert.equal(ctx.getFeedbackClef(1,2,1.5),G);assert.equal(ctx.getFeedbackClef(1,3,1.5),C);assert.equal(ctx.getFeedbackClef(99,0,1),null);
for(const [c,top] of [[G,38],[F,26],[C,32],[clef(2,4),30],[clef(0,2,-1),31],[clef(1,4,1),33],[clef(0,1),40]])assert.equal(ctx.getFeedbackClefTopStep(c),top);
assert.equal(ctx.getFeedbackClefTopStep(clef(3,2)),null);
assert.equal(ctx.resolveFeedbackAnchor(60,1).y,90);assert.equal(ctx.resolveFeedbackAnchor(60,2).y,250);assert.equal(ctx.resolveFeedbackAnchor(60,3).y,350);assert.equal(ctx.resolveFeedbackAnchor(60,4).y,420);
assert.equal(ctx.resolveFeedbackAnchor(61,1).y,90); // Existing sharp-based chromatic step policy.
assert.equal(ctx.resolveFeedbackAnchor(60,1,null,123).y,123);
assert.deepEqual(JSON.parse(JSON.stringify(ctx.resolveFeedbackAnchor(60,1,null,{x:7,y:8}))),{x:7,y:8});
state.currentExpectedContext={measureIndex:1,timestamp:1.25};assert.equal(ctx.resolveFeedbackAnchor(60,1).y,150); // Expected event, not advanced cursor.
assert.equal(ctx.resolveFeedbackAnchor(60,1,0).y,150);assert.equal(ctx.resolveFeedbackAnchor(60,99,0).y,150);assert.equal(ctx.resolveFeedbackAnchor(60,1,99),null);
state.hands={left:4,right:3};assert.equal(ctx.resolveFeedbackAnchor(60,null).y,350);assert.equal(ctx.resolveFeedbackAnchor(48,null).y,455);
osmd.Sheet.SourceMeasures[2].FirstInstructionsStaffEntries=[entry(C)];assert.equal(ctx.getFeedbackClef(2,0,2),C);
osmd.Sheet.SourceMeasures[0].FirstInstructionsStaffEntries=[entry(clef(3,2)),entry(clef(4,5))];assert.equal(ctx.resolveFeedbackAnchor(60,1).y,150);assert.equal(ctx.resolveFeedbackAnchor(60,2).y,190);
console.log('Clef feedback passed: boundary/inherited/end clefs, backward seeking, independent staffs, C/line/octave cases, chromatic policy, anchor/exact-Y bypasses and missing geometry.');
