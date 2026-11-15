// Actual output/preferences integration with isolated adapters; no native stores/devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = fs.readFileSync('js/trainer-core.js', 'utf8');
const stateSource = fs.readFileSync('js/trainer-state.js', 'utf8');
const key = 'pt_expressivePlaybackEnabled';
let checks = 0;
function check(condition, label) { assert(condition, label); checks++; }
function section(start, end) {
    const a = core.indexOf(start), b = core.indexOf(end, a);
    assert(a >= 0 && b > a, start);
    return core.slice(a, b);
}
function preferences(values = {}) {
    const data = { ...values }, session = {};
    const memoryStore = contents => new Proxy(contents, { get(target, property) {
        if (property === 'getItem') return k => target[k] ?? null;
        if (property === 'setItem') return (k, value) => { target[k] = String(value); };
        if (property === 'removeItem') return k => { delete target[k]; };
        return target[property];
    } });
    const window = { localStorage: memoryStore(data), sessionStorage: memoryStore(session) };
    Object.defineProperty(window, 'indexedDB', { get() { throw Error('Native score storage forbidden'); } });
    const document = { body: { appendChild() {} }, getElementById: () => null,
        createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) };
    const context = vm.createContext({ window, document, console });
    vm.runInContext(fs.readFileSync('js/storage.js', 'utf8'), context);
    vm.runInContext(stateSource, context);
    const api = vm.runInContext('({state:AppState, validate:validateSettingsBackupPayload, import:importSettingsBackupPayload, export:buildSettingsBackupPayload, clear:clearSavedPreferences, keys:RESETTABLE_PREFERENCE_KEYS})', context);
    return { data, api, context };
}

const defaults = preferences();
check(defaults.api.state.expressivePlaybackEnabled === false, 'First-run default is disabled');
check(preferences({ [key]: 'true' }).api.state.expressivePlaybackEnabled === true, 'Saved enabled setting restores');
check(preferences({ [key]: 'false' }).api.state.expressivePlaybackEnabled === false, 'Saved disabled setting restores');
check(preferences({ [key]: 'invalid' }).api.state.expressivePlaybackEnabled === false, 'Malformed stored setting falls back to disabled');
check(defaults.api.keys.includes(key), 'Setting participates in backup/reset allowlist');
const saved = preferences({ [key]: 'true', unrelated: 'preserve' });
const backup = saved.api.export();
check(backup.version === 1 && backup.settings[key] === 'true', 'Existing backup version includes new setting');
saved.api.import(backup);
check(saved.data[key] === 'true', 'Enabled setting round-trips');
check(saved.api.validate({ settings: { [key]: false } })[key] === 'false', 'Boolean import values normalize');
const beforeInvalid = JSON.stringify(saved.data);
assert.throws(() => saved.api.import({ settings: { [key]: 'yes' } }), /expected true or false/);
check(JSON.stringify(saved.data) === beforeInvalid, 'Invalid import makes no writes');
saved.api.import({ settings: { pt_trainerMode: 'follow' } });
check(!(key in saved.data) && preferences(saved.data).api.state.expressivePlaybackEnabled === false, 'Older backup omission restores disabled default');
saved.api.import({ settings: { [key]: true } });
saved.api.clear();
check(!(key in saved.data) && saved.data.unrelated === 'preserve', 'Reset clears expression preference and preserves unrelated data');

function outputFixture() {
    let nextId = 0, throwAttack = false, simple = false, outputEnabled = true;
    const timers = new Map(), frames = new Map(), attacks = [], releases = [], synth = [], midi = [], writes = [];
    const state = { isPlaying: true, mode: 'realtime', expressivePlaybackEnabled: true,
        audioEnabled: { hands: true, instrument: true, virtual: true }, pendingAudio: [] };
    const sampler = {
        release: 1,
        triggerRelease(...args) { releases.push(args); },
        triggerAttack(...args) { attacks.push({ args, release: this.release }); if (throwAttack) throw Error('Attack failure'); }
    };
    const checkbox = { checked: false, addEventListener(type, callback) { assert.equal(type, 'change'); this.change = callback; } };
    const context = vm.createContext({ AppState: state, Set, pianoSampler: sampler, pianoSamplerReady: true,
        getSamplerNoteName: midi => Number.isFinite(midi) ? 'C4' : null, getLiveAudioTime: () => 7,
        shouldUseLowLatencyPlaybackPath: () => simple,
        lowLatencyPlaybackSynth: { triggerAttackRelease(...args) { synth.push(args); }, triggerRelease() {}, triggerAttack() {} },
        setTimeout(callback, delay) { timers.set(++nextId, { callback, delay }); return nextId; },
        clearTimeout: id => timers.delete(id),
        requestAnimationFrame(callback) { frames.set(++nextId, callback); return nextId; },
        cancelAnimationFrame: id => frames.delete(id),
        getSelectedMidiOutOutput: () => outputEnabled ? { send: message => midi.push(message) } : null,
        getMidiOutStatus: base => base | 2, rememberOutgoingMidiMessage() {},
        Tone: { now: () => 0 }, FOLLOW_ME_MIN_WAIT_RATIO: 0.6,
        startVisualSustains() {}, scheduleMetronomeForPlaybackWindow() {}, handleAutoScroll() {},
        playbackLoop() {}, osmd: { cursor: { update() {} } },
        document: { getElementById: id => id === 'check-expressive-playback' ? checkbox : null },
        TRAINER_EXPRESSIVE_PLAYBACK_STORAGE_KEY: key,
        setStoredBool(k, value) { writes.push([k, value]); },
        // Unexpected engraving work fails this narrow preference/output test.
        renderScoreAndRefreshGeometry() { throw Error('Expression must not render score'); }
    });
    for (const [start, end] of [
        ['// Stop invalidates callbacks', "document.getElementById('canvas-wrapper')"],
        ['function normalizeLiveVelocity(', 'function getRoutingEnabledForRole('],
        ['function playLowLatencyPlaybackNote(', 'const metronomeSynth'],
        ['function sendMidiOutNoteOn(', '// MIDI access,'],
        ['function checkWaitModeAdvance()', '// UI LISTENERS & SYNC LOGIC']
    ]) vm.runInContext(section(start, end), context);
    return { state, context, sampler, checkbox, timers, attacks, releases, synth, midi, writes,
        setThrow(value) { throwAttack = value; }, setSimple(value) { simple = value; }, setOutput(value) { outputEnabled = value; } };
}

const output = outputFixture();
output.context.schedulePlaybackForDestinations(60, 250, 40, { toLocalAudio: true, toMidiOut: true, staccato: true });
check(output.attacks[0].args[2] === 40 / 127 && output.attacks[0].release === 0.08, 'Sampled staccato attack captures velocity and short release');
check(output.sampler.release === 1, 'Shared release restores immediately after attack');
check(JSON.stringify(output.midi[0]) === '[146,60,40]', 'MIDI receives expressive velocity on selected channel');
check(output.timers.size === 2 && [...output.timers.values()].every(t => t.delay === 250), 'Local/MIDI releases use same expressive duration');
const staleReleases = [...output.timers.values()].map(t => t.callback);
output.context.cancelPlaybackRun();
const releasesBefore = output.releases.length;
staleReleases.forEach(callback => callback());
check(output.releases.length === releasesBefore && output.midi.length === 1, 'Cancelled expressive note releases cannot affect later runs');
output.context.schedulePlaybackForDestinations(60, 450, 100, { toLocalAudio: true, toMidiOut: true });
check(output.attacks.at(-1).release === 1 && output.attacks.at(-1).args[2] === 100 / 127, 'Ordinary notes retain original release and velocity');
for (const { callback } of output.timers.values()) callback();
check(JSON.stringify(output.midi.at(-1)) === '[130,60,0]', 'Scheduled MIDI release remains note-off');
output.timers.clear();
output.context.playLocalPianoNote(60, 72, null, { lowLatencyLive: true });
check(output.attacks.at(-1).release === 1 && output.attacks.at(-1).args[2] === 72 / 127 && output.timers.size === 0, 'Live monitoring keeps velocity/envelope and waits for real key-up');
output.setThrow(true);
assert.throws(() => output.context.playLocalPianoNote(60, 40, 250, { staccato: true }), /Attack failure/);
check(output.sampler.release === 1, 'Shared envelope restores even if attack throws');
output.setThrow(false);
output.sampler.release = 0.03;
output.context.playLocalPianoNote(60, 40, null, { staccato: true });
check(output.attacks.at(-1).release === 0.03 && output.sampler.release === 0.03, 'Staccato never lengthens a shorter configured release');
output.setSimple(true);
const samplerAttackCount = output.attacks.length;
output.context.schedulePlaybackForDestinations(60, 250, 56, { toLocalAudio: true, staccato: true });
check(output.synth.length === 1 && output.synth[0][1] === 0.25 && output.synth[0][3] === 56 / 127 && output.attacks.length === samplerAttackCount, 'Simple synth receives expressive gate/velocity through existing path');
output.setOutput(false);
const midiCount = output.midi.length;
output.context.schedulePlaybackForDestinations(60, 250, 56, { toMidiOut: true });
check(output.midi.length === midiCount, 'Absent MIDI output remains harmless');

for (const mode of ['wait', 'follow']) {
    const deferred = outputFixture();
    Object.assign(deferred.state, { mode, isAudioBusy: true, expectedNotes: [{ hit: false }], anchorTime: 0.5,
        followAdvanceInfo: { waitSeconds: 0.5, currentMeasureIdx: 0, currentTimestamp: 0, beatsToWait: 1 },
        pendingAudio: [{ midi: 60, durationMs: 250, velocity: 71, staccato: true, toLocalAudio: true, toMidiOut: true }] });
    deferred.context.checkWaitModeAdvance();
    check(deferred.attacks.length === 0 && deferred.state.pendingAudio.length === 1, mode + ': unsatisfied group keeps expression deferred');
    deferred.state.expectedNotes[0].hit = true;
    deferred.context.checkWaitModeAdvance();
    check(deferred.attacks[0].release === 0.08 && deferred.attacks[0].args[2] === 71 / 127 && deferred.midi[0][2] === 71, mode + ': satisfaction preserves deferred articulation and velocity');
    check(deferred.state.pendingAudio.length === 0 && !deferred.state.isAudioBusy, mode + ': pending output drains once');
    check([...deferred.timers.values()].at(-1).delay === (mode === 'follow' ? 500 : 10), mode + ': progression retains original wait instead of staccato duration');
}

for (const active of ['paused', 'playing', 'count-in', 'starting']) {
    const toggle = outputFixture();
    let pauses = 0;
    Object.assign(toggle.state, { isPlaying: active === 'playing', countInActive: active === 'count-in', mode: 'follow',
        playback: { left: true, right: false }, midiOutEnabled: { hands: true, instrument: false } });
    vm.runInContext('playbackStartPending=' + (active === 'starting'), toggle.context);
    const routes = JSON.stringify([toggle.state.mode, toggle.state.playback, toggle.state.audioEnabled, toggle.state.midiOutEnabled]);
    toggle.context.pausePlaybackFromToolbar = () => { pauses++; toggle.context.cancelPlaybackRun(); toggle.state.isPlaying = false; };
    vm.runInContext(section("const expressivePlaybackCheckbox = document.getElementById('check-expressive-playback');", "document.getElementById('practice-lh').addEventListener"), toggle.context);
    check(toggle.checkbox.checked === true, active + ': checkbox reflects saved state');
    toggle.checkbox.checked = false;
    toggle.checkbox.change({ target: toggle.checkbox });
    check(pauses === (active === 'paused' ? 0 : 1), active + ': checkbox pauses only active/pending playback');
    check(toggle.state.expressivePlaybackEnabled === false && JSON.stringify(toggle.writes) === JSON.stringify([[key, false]]), active + ': checkbox persists disabled preference');
    check(routes === JSON.stringify([toggle.state.mode, toggle.state.playback, toggle.state.audioEnabled, toggle.state.midiOutEnabled]), active + ': checkbox leaves modes and routing unchanged');
}

// Execute the actual score-output branch without substituting its duration/velocity logic.
const expressionContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('js/score-expression.js', 'utf8'), expressionContext);
const mergeOutputs = expressionContext.window.ScoreExpression.mergeOutputs;
const scoreBranch = '(function () {\n' + section('    const expressionOutputs = [];', '    osmd.cursor.Iterator.moveToNext();') + '\n})()';
for (const enabled of [false, true]) for (const mode of ['realtime', 'wait', 'follow']) {
    const note = { halfTone: 48, Length: { RealValue: 0.25 }, isRest: () => false };
    const state = { expressivePlaybackEnabled: enabled, mode, baseBpm: 120, speedPercent: 0.5,
        practice: { left: false, right: true }, playback: { left: true, right: false },
        audioEnabled: { hands: true }, midiOutEnabled: { hands: true }, pendingAudio: [], expectedNotes: [{}] };
    const emitted = [], sheet = {};
    let resolutions = 0;
    const context = vm.createContext({ AppState: state, entries: [{ Notes: [note] }], osmd: { Sheet: sheet },
        HandAssignment: { roleForNote: () => 'left', playAccompaniment: () => false },
        ScoreExpression: { mergeOutputs, resolve(actualNote, actualSheet) { assert.equal(actualNote, note); assert.equal(actualSheet, sheet); resolutions++; return { velocity: 71, gate: 0.5, staccato: true }; } },
        schedulePlaybackForDestinations(...args) { emitted.push(args); }
    });
    vm.runInContext(scoreBranch, context);
    const event = mode === 'realtime' ? { durationMs: emitted[0][1], velocity: emitted[0][2], staccato: emitted[0][3].staccato } : state.pendingAudio[0];
    check(event.durationMs === (enabled ? 500 : 900) && event.velocity === (enabled ? 71 : 100) && event.staccato === enabled, mode + ': score output uses expression only when enabled at scaled tempo');
    check(resolutions === (enabled ? 1 : 0), mode + ': disabled path never reads expression metadata');
    if (mode !== 'realtime') check(emitted.length === 0, mode + ': opposite hand remains deferred');
    note.NoteTie = { StartNote: {} };
    state.pendingAudio = []; emitted.length = 0;
    vm.runInContext(scoreBranch, context);
    check(emitted.length === 0 && state.pendingAudio.length === 0, mode + ': tie continuation still produces no attack');
}

function mixedOnset({ enabled = true, mode = 'realtime', localOther = false, midiHands = true } = {}) {
    const notes = [
        { role: 'left', halfTone: 48, Length: { RealValue: 0.25 }, isRest: () => false, expression: { velocity: 71, gate: 0.5, staccato: true } },
        { role: 'right', halfTone: 48, Length: { RealValue: 0.5 }, isRest: () => false, expression: { velocity: 56, gate: 0.9, staccato: false } },
        { role: 'accompaniment', halfTone: 48, Length: { RealValue: 0.25 }, isRest: () => false, expression: { velocity: 116, gate: 0.5, staccato: true } }
    ];
    const state = { expressivePlaybackEnabled: enabled, mode, baseBpm: 120, speedPercent: 1,
        practice: { left: false, right: true }, playback: { left: true, right: true },
        audioEnabled: { hands: true, other: localOther }, midiOutEnabled: { hands: midiHands, other: true }, pendingAudio: [], expectedNotes: [{}] };
    const emitted = [];
    const context = vm.createContext({ AppState: state, entries: notes.map(note => ({ Notes: [note] })), osmd: { Sheet: {} },
        HandAssignment: { roleForNote: note => note.role, playAccompaniment: () => true },
        ScoreExpression: { mergeOutputs, resolve: note => note.expression },
        schedulePlaybackForDestinations(midi, durationMs, velocity, options) { emitted.push({ midi, durationMs, velocity, ...options }); }
    });
    vm.runInContext(scoreBranch, context);
    return { state, notes, emitted };
}
const mixed = mixedOnset();
check(mixed.emitted.length === 2, 'Mixed same-pitch score voices produce one request per distinct destination result');
const localMixed = mixed.emitted.find(event => event.toLocalAudio), midiMixed = mixed.emitted.find(event => event.toMidiOut);
check(localMixed.durationMs === 900 && localMixed.velocity === 71 && !localMixed.staccato && !localMixed.toMidiOut, 'Local unison preserves longest gate and ordinary release without borrowing MIDI-only accent');
check(midiMixed.durationMs === 900 && midiMixed.velocity === 116 && !midiMixed.staccato && !midiMixed.toLocalAudio, 'MIDI unison uses loudest routed attack and longest sounding note');
check(mixed.notes[0].expression.staccato && !mixed.notes[1].expression.staccato && mixed.notes[1].Length.RealValue === 0.5, 'Output arbitration leaves source notes and articulation metadata unchanged');
const separate = mixedOnset({ midiHands: false });
const separateMidi = separate.emitted.find(event => event.toMidiOut);
check(separateMidi.durationMs === 250 && separateMidi.velocity === 116 && separateMidi.staccato, 'MIDI-only staccato is not lengthened by local-only ordinary note');
const joined = mixedOnset({ localOther: true });
check(joined.emitted.length === 1 && joined.emitted[0].toLocalAudio && joined.emitted[0].toMidiOut && joined.emitted[0].durationMs === 900 && joined.emitted[0].velocity === 116, 'Identical local/MIDI merged output retains both destinations');
for (const mode of ['wait', 'follow']) {
    const phased = mixedOnset({ mode, localOther: true });
    check(phased.emitted.length === 1 && phased.emitted[0].durationMs === 900 && phased.emitted[0].velocity === 56 && !phased.emitted[0].staccato, mode + ': immediate ordinary output stays separate from deferred notes');
    check(phased.state.pendingAudio.length === 1 && phased.state.pendingAudio[0].durationMs === 250 && phased.state.pendingAudio[0].velocity === 116 && phased.state.pendingAudio[0].staccato, mode + ': deferred same-pitch staccatos merge only within their satisfaction phase');
}
const disabledMixed = mixedOnset({ enabled: false });
check(disabledMixed.emitted.length === 3 && disabledMixed.emitted.every(event => event.velocity === 100 && !event.staccato), 'Disabled mixed unisons retain separate legacy requests and fixed velocity');
check(disabledMixed.emitted[0].durationMs === 450 && disabledMixed.emitted[1].durationMs === 900 && disabledMixed.emitted[2].durationMs === 450, 'Disabled mixed unisons retain original 90-percent lengths');

console.log(`Expressive playback integration: ${checks} checks passed (isolated preferences, core output/routing, deferred modes, envelope restoration, cancellation and checkbox).`);
