const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const led = fs.readFileSync('js/led.js', 'utf8');
const feedback = fs.readFileSync('js/feedback-engine.js', 'utf8');
const state = {playerPianoType:88, expectedNotes:[], visualNotesToStart:[], sustainedVisuals:[], outOfRangeCurrentNotes:[], heldCorrectNotes:new Map(), earlyGraceReservations:new Map(), pressedKeys:new Set(), preExpectedHeldNotes:new Set(), practice:{right:true,left:true}, baseBpm:120, speedPercent:1, mode:'wait', score:{correct:7,wrong:2}};
let pauses=0, clears=0; const saved = new Map();
const it = {CurrentVoiceEntries:[{Notes:[21,60,108].map(midi=>({halfTone:midi-12,Length:{RealValue:.25},isRest:()=>false}))}],CurrentMeasureIndex:0,currentTimeStamp:{RealValue:0}};
const ctx = vm.createContext({AppState:state, FULL_PIANO_MIDI_MIN:21,FULL_PIANO_MIDI_MAX:108,FULL_PIANO_KEY_COUNT:88,PLAYER_PIANO_SIZES:[88,76,73,61,49,37,32,25],PLAYER_PIANO_STORAGE_KEY:'pt_playerPianoType',
 document:{getElementById:()=>null},window:{},osmd:{cursor:{Iterator:it}},
 appLocalStorage:{setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)},
 LedEngine:{config:{ledCount:144},keyToLed:new Map(),renderOutputs(){}},WLEDController:{clearLastSignature(){}},getLedCalibrationOffsetForMidi:()=>0,renderVirtualKeyboard(){},
 pausePlaybackFromToolbar(){pauses++;state.isPlaying=false;},clearVisuals(){clears++;state.expectedNotes=[];state.earlyGraceReservations.clear();},
 GeometryEngine:{getNoteAnchor:()=>null},HandAssignment:{roleForNote:()=> 'right'},getResolvedStaffAssignmentIdFromNote:()=>1,debugLogEvent(){},updateScoreDisplay(){}
});
vm.runInContext(led.slice(led.indexOf('function normalizePlayerPianoType('),led.indexOf('const LedEngine =')),ctx);
vm.runInContext(feedback.slice(feedback.indexOf('function getCombinedTieLength(')),ctx);
for(const [size,lo,hi] of [[88,21,108],[76,27,102],[73,28,100],[61,34,94],[49,40,88],[37,46,82],[32,49,80],[25,52,76]]){
 ctx.setPlayerPianoType(size,{rerender:false});
 assert.equal(state.playerRange.minMidi,lo);assert.equal(state.playerRange.maxMidi,hi);
 assert.equal(hi-lo+1,size);assert(ctx.isMidiInPlayerRange(lo));assert(ctx.isMidiInPlayerRange(hi));assert(!ctx.isMidiInPlayerRange(lo-1));assert(!ctx.isMidiInPlayerRange(hi+1));
 for(const reverse of [false,true]){state.ledReverse=reverse;ctx.updateLedKeyMapping();assert.equal(ctx.LedEngine.keyToLed.size,size);assert.equal(ctx.LedEngine.keyToLed.get(lo),reverse?143:0);assert.equal(ctx.LedEngine.keyToLed.get(hi),reverse?0:143);assert(!ctx.LedEngine.keyToLed.has(lo-1));assert(!ctx.LedEngine.keyToLed.has(hi+1));}
 ctx.getLedCalibrationOffsetForMidi=midi=>midi===lo?-999:999;state.ledReverse=false;ctx.updateLedKeyMapping();assert.equal(ctx.LedEngine.keyToLed.get(lo),0);assert.equal(ctx.LedEngine.keyToLed.get(hi),143);ctx.getLedCalibrationOffsetForMidi=()=>0;
}
for(const bad of [null,0,89,'bad',60.5])assert.equal(ctx.normalizePlayerPianoType(bad),88);
assert.equal(pauses,0);assert.equal(clears,0);
ctx.buildExpectedNotesFromEntries(it.CurrentVoiceEntries,0,0);
assert.deepEqual(Array.from(state.expectedNotes,n=>n.midi),[60]);
state.isPlaying=true;state.earlyGraceReservations.set(21,{measureIndex:0,timestamp:0,allowTapCarry:true});
ctx.setPlayerPianoType(88);
assert.deepEqual(Array.from(state.expectedNotes,n=>n.midi),[21,60,108],'expansion restores newly playable current targets');
assert.equal(pauses,1);assert.equal(state.earlyGraceReservations.size,0);assert.equal(state.isPlaying,false);assert.deepEqual(state.score,{correct:7,wrong:2});
ctx.setPlayerPianoType(25);assert.deepEqual(Array.from(state.expectedNotes,n=>n.midi),[60]);assert.deepEqual(Array.from(state.outOfRangeCurrentNotes,n=>n.midi),[21,108]);
assert.equal(saved.get('pt_playerPianoType'),'25');assert.equal(state.ledPreviewTimelineDirty,true);assert.equal(state.ledPreviewTraversalIndex,-1);
const before=clears;ctx.setPlayerPianoType(25);assert.equal(clears,before,'same size preserves current attempt');
ctx.initPlayerPianoTypeControl();assert.equal(state.playerPianoType,25);assert.equal(clears,before,'initialization does not reset targets');
state.countInActive=true;state.isPlaying=false;ctx.setPlayerPianoType(88);assert.equal(pauses,2,'range changes cancel a pending count-in through the stop path');
console.log('Keyboard ranges passed: all eight legacy ranges, inclusive boundaries, forward/reverse/calibrated LEDs, expansion/shrink, pause, scoring, persistence and initialization.');
