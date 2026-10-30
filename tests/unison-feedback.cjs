const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/feedback-engine.js','utf8');
const painted=[];const state={practice:{left:true,right:true},baseBpm:120,speedPercent:1,mode:'wait',earlyGraceReservations:new Map(),pressedKeys:new Set(),heldCorrectNotes:new Map(),preExpectedHeldNotes:new Set(),score:{correct:0,wrong:0}};
const ctx=vm.createContext({AppState:state,window:{},osmd:null,GeometryEngine:{getNoteAnchor:n=>n.anchor},HandAssignment:{roleForNote:n=>n.role||'right'},getResolvedStaffAssignmentIdFromNote:n=>n.staff||1,isMidiInPlayerRange:()=>true,describeLogicalNoteForDebug(){},debugLogAnchorResolution(){},debugLogEvent(){},updateScoreDisplay(){},drawFeedbackNote:(...args)=>painted.push(args)});
vm.runInContext(source.slice(source.indexOf('function drawExpectedNoteFeedback('),source.indexOf('function getCursorSvgX('))+source.slice(source.indexOf('function getCombinedTieLength(')),ctx);
const a={x:10,y:20},b={x:22,y:20};const note=(anchor,extra={})=>({anchor,halfTone:48,Length:{RealValue:.25},isRest:()=>false,...extra});
const build=notes=>ctx.buildExpectedNotesFromEntries([{Notes:notes}],0,0);
build([note(a),note(b),note(a)]);assert.equal(state.expectedNotes.length,1);assert.equal(state.expectedNotes[0].anchor,a);assert.deepEqual([...state.expectedNotes[0].anchors],[a,b]);assert.equal(state.visualNotesToStart.length,1);
ctx.drawExpectedNoteFeedback(state.expectedNotes[0],true);assert.equal(painted.length,2);assert.equal(painted[0][4],a);assert.equal(painted[1][4],b);
painted.length=0;ctx.processMissedNotes();assert.equal(state.score.wrong,1);assert.equal(painted.length,2);
painted.length=0;state.earlyGraceReservations.set(60,{measureIndex:0,timestamp:0,allowTapCarry:true});build([note(a),note(b)]);assert.equal(state.score.correct,1);assert.equal(state.expectedNotes[0].hit,true);assert.equal(painted.length,2);
painted.length=0;build([note(a),note({...a})]);assert.equal(state.expectedNotes[0].anchors.length,2);ctx.drawExpectedNoteFeedback(state.expectedNotes[0],true);assert.equal(painted.length,1);
for(const anchors of [[null,null],[null,b],[a,null]]){painted.length=0;build(anchors.map(x=>note(x)));ctx.drawExpectedNoteFeedback(state.expectedNotes[0],true);assert.equal(painted.length,1);assert.equal(painted[0][4],anchors.find(Boolean)||null);}
build([note(a),note(b,{staff:2}),note(b,{role:'left'})]);assert.equal(state.expectedNotes.length,3);
build([note(a,{PrintObject:false}),note(a,{isCueNote:true}),note(a,{Notehead:'none'}),note(a,{NoteTie:{StartNote:{}}}),note(a,{isRest:()=>true})]);assert.equal(state.expectedNotes.length,0);
painted.length=0;build([note(a),note(b)]);state.mode='realtime';state.realtimeWrongPressInCurrentContext=true;ctx.processMissedNotes();assert.equal(painted.length,0);assert.equal(state.score.wrong,2);
console.log('Unison feedback passed: distinct/shared/missing anchors, single credit/penalty, early carry, role/staff separation, hidden/rest/tie exclusions and wrong-note suppression.');
