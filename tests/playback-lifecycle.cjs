const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = fs.readFileSync('js/trainer-core.js', 'utf8');
// Standalone deterministic regression: no browser, storage or MIDI devices.
function section(start, end) { const a=core.indexOf(start), b=core.indexOf(end,a); assert(a>=0&&b>a); return core.slice(a,b); }
let id=0;
const timers=new Map(), frames=new Map(), starts=[], clicks=[];
const AppState={isPlaying:true,baseBpm:120,speedPercent:1};
const context=vm.createContext({AppState, Set,
 setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(id){timers.delete(id);},
 requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);},
 osmd:{cursor:{Iterator:{CurrentMeasureIndex:0}},Sheet:{SourceMeasures:[{ActiveTimeSignature:{Numerator:2}}]}},
 playMetronomeClick(){clicks.push('click');}
});
vm.runInContext(section('// Stop invalidates callbacks','document.getElementById(\'canvas-wrapper\')'),context);
function drain(){let n=0;while(timers.size){assert(n++<30);const [id,fn]=timers.entries().next().value;timers.delete(id);fn();}}
context.doCountInAndStart(()=>starts.push('old'));
const dispatched=[...timers.values()];
context.cancelPlaybackRun(); AppState.isPlaying=false;
assert.equal(timers.size,0);
AppState.isPlaying=true;context.doCountInAndStart(()=>starts.push('new'));
dispatched.forEach(fn=>fn());drain();assert.deepEqual(starts,['new']);assert.equal(clicks.length,3);
// Loop count-in uses the same run but must be canceled at a later stop.
context.doCountInAndStart(()=>starts.push('loop'));context.cancelPlaybackRun();drain();assert.deepEqual(starts,['new']);
let advances=0;
context.schedulePlaybackTimeout(()=>advances++,10);context.schedulePlaybackFrame(()=>advances++);
const queued=[...timers.values(),...frames.values()];context.cancelPlaybackRun();queued.forEach(fn=>fn());assert.equal(advances,0);assert.equal(frames.size,0);
context.schedulePlaybackTimeout(()=>advances++,10);drain();assert.equal(advances,1);
// Prior-run note-off cannot cut a repeated pitch in a fresh run.
let ons=0,offs=0;
Object.assign(context,{sendMidiOutNoteOn(){ons++;return true;},sendMidiOutNoteOff(){offs++;},playScheduledPlaybackNote(){}});
vm.runInContext(section('function schedulePlaybackForDestinations(', '// MIDI access,'),context);
context.schedulePlaybackForDestinations(60,100,100,{toMidiOut:true});const oldOff=[...timers.values()];context.cancelPlaybackRun();context.schedulePlaybackForDestinations(60,100,100,{toMidiOut:true});oldOff.forEach(fn=>fn());assert.equal(offs,0);drain();assert.equal(ons,2);assert.equal(offs,1);
// Actual Wait/Follow advance callbacks must not advance the next run's cursor.
Object.assign(context, {
 Tone: { now: () => 0 }, FOLLOW_ME_MIN_WAIT_RATIO: 0.6,
 startVisualSustains() {}, scheduleMetronomeForPlaybackWindow() {}, handleAutoScroll() {},
 playbackLoop() { advances++; }
});
context.osmd.cursor.update = () => {};
vm.runInContext(section('function checkWaitModeAdvance()', '// UI LISTENERS & SYNC LOGIC'), context);
for (const mode of ['wait', 'follow']) {
 Object.assign(AppState, { mode, isAudioBusy: true, expectedNotes: [{hit:true}], pendingAudio: [], anchorTime: 0.5,
  followAdvanceInfo: {waitSeconds: 0.5, currentMeasureIdx: 0, currentTimestamp: 0, beatsToWait: 1} });
 context.checkWaitModeAdvance();
 const stale = [...timers.values()];
 context.cancelPlaybackRun();
 stale.forEach(fn => fn());
 assert.equal(advances, 1);
 AppState.isAudioBusy = true;
 context.checkWaitModeAdvance(); drain();
 assert.equal(advances, 2);
 advances = 1;
}
// Async startup: one pending start, stop/reset invalidation, and rejection recovery.
let resolveAudio; let audioCalls=0;
Object.assign(context,{ensureLiveAudioReady(){audioCalls++;return new Promise(r=>resolveAudio=r);}});
vm.runInContext(section('async function startPlaybackFromToolbar()', 'function silencePlaybackOutputsImmediately()'),context);
(async()=>{
 AppState.isPlaying=false;
 const first=context.startPlaybackFromToolbar();await context.startPlaybackFromToolbar();assert.equal(audioCalls,1);
 context.cancelPlaybackRun();resolveAudio();await first;assert.equal(AppState.isPlaying,false);
 context.ensureLiveAudioReady=async()=>{throw Error('audio test');};await assert.rejects(context.startPlaybackFromToolbar(),/audio test/);
 assert.equal(vm.runInContext('playbackStartPending',context),false);
 // A deferred score sampler load must not attack after stop/restart.
 let resolveSampler, attacks = 0, releases = 0;
 Object.assign(context, {
  pianoSamplerReady: false, getSamplerNoteName: () => 'C4',
  ensurePianoSamplerLoaded: () => new Promise(resolve => {resolveSampler = resolve;}),
  normalizeLiveVelocity: () => ({gain: 1}), getLiveAudioTime: () => 0,
  pianoSampler: {triggerRelease() {releases++;}, triggerAttack() {attacks++;}}
 });
 AppState.isPlaying = true; AppState.audioEnabled = {virtual:true};
 vm.runInContext(section('function playLocalPianoNote(', 'function getRoutingEnabledForRole('), context);
 vm.runInContext('playLocalPianoNote(60, 100, 100, {playbackRunId})', context);
 context.cancelPlaybackRun(); context.pianoSamplerReady = true;
 resolveSampler(); await Promise.resolve();
 assert.equal(attacks, 0);
 vm.runInContext('playLocalPianoNote(60, 100, 100, {playbackRunId})', context);
 assert.equal(attacks, 1); drain(); assert.equal(releases, 2);
 assert.match(section('function stopPlaybackState(', 'function pausePlaybackFromToolbar'),/cancelPlaybackRun\(\)/);
 assert.match(section("document.getElementById('btn-reset').onclick", 'let resizeTimer'),/cancelPlaybackRun\(\)/);
 assert.match(core,/AppState.countInActive \|\| playbackStartPending/);
 console.log('Playback lifecycle regressions passed: count-in, stale timers/frames, loop count-in cancellation, Wait/Follow advances, MIDI note-offs, deferred sampler and async startup cancellation/rejection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
