// Actual playback, timing, matching and key-up functions with deterministic clocks.
// Synthetic note/iterator and output/geometry adapters; no browser, stores or devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = fs.readFileSync('js/trainer-core.js', 'utf8');
const feedback = fs.readFileSync('js/feedback-engine.js', 'utf8');
let checks = 0;
function check(condition, label) { assert(condition, label); checks++; }
function section(source, start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert(a >= 0 && b > a, start);
    return source.slice(a, b);
}

function fixture(mode, enabled, staccato = true) {
    let now = 0, nextId = 0, completions = 0;
    const timers = new Map(), outputs = [], feedbackPaint = [];
    const note = { halfTone: 48, Length: { RealValue: 0.25 }, isRest: () => false,
        ParentVoiceEntry: { Articulations: staccato ? [{ articulationEnum: 1 }] : [] } };
    const iterator = {
        EndReached: false, CurrentMeasureIndex: 0, currentTimeStamp: { RealValue: 0 },
        CurrentVoiceEntries: [{ Notes: [note] }],
        moveToNext() { this.currentTimeStamp.RealValue += 0.25; this.EndReached = true; }
    };
    const state = {
        isPlaying: true, mode, expressivePlaybackEnabled: enabled,
        baseBpm: 120, speedPercent: 1, anchorTime: 0,
        practice: { right: true, left: false }, playback: { right: true, left: false },
        audioEnabled: { hands: true }, midiOutEnabled: { hands: true }, inputVelocityEnabled: true,
        expectedNotes: [], pendingAudio: [], visualNotesToStart: [], sustainedVisuals: [],
        earlyGraceReservations: new Map(), pressedKeys: new Set(), heldCorrectNotes: new Map(),
        preExpectedHeldNotes: new Set(), score: { correct: 0, wrong: 0 }
    };
    const context = vm.createContext({
        AppState: state, FOLLOW_ME_MIN_WAIT_RATIO: 0.6,
        window: { opensheetmusicdisplay: { ArticulationEnum: { staccato: 1, accent: 2 } } },
        Tone: { now: () => now / 1000 },
        osmd: { Sheet: { SourceMeasures: [{ TempoInBPM: 120 }] }, cursor: {
            Iterator: iterator, update() {}
        } },
        document: { getElementById: () => ({ checked: false, value: '1' }) },
        setTimeout(callback, delay) { timers.set(++nextId, { callback, at: now + delay }); return nextId; },
        clearTimeout: id => timers.delete(id), cancelAnimationFrame() {},
        HandAssignment: { roleForNote: () => 'right', playAccompaniment: () => false },
        GeometryEngine: { getNoteAnchor: () => ({ x: 100, y: 50 }) },
        getResolvedStaffAssignmentIdFromNote: () => 1, isMidiInPlayerRange: () => true,
        getCursorSvgX: () => 100, makeLedPreviewEntrySignature: () => 'expression-grading',
        getMeasureTimingInfo: () => ({ startTimestamp: 0, actualLengthWhole: 1 }),
        schedulePlaybackForDestinations(midi, durationMs, velocity, options) {
            outputs.push({ midi, durationMs, velocity, ...options });
        },
        drawFeedbackNote(...args) { feedbackPaint.push(args); },
        getLiveMonitoringVelocity: (_source, velocity) => velocity,
        shouldRouteLiveSourceToLocalAudio: () => false, shouldRouteLiveSourceToMidiOut: () => false,
        tryReserveSingleHandEarlyGrace: () => null, tryReserveRealtimeUpcomingHeldNote: () => null,
        registerHeldIncorrectFeedback() {}, releaseHeldIncorrectFeedback() {},
        describeLogicalNoteForDebug() {}, debugLogAnchorResolution() {}, debugLogEvent() {},
        updateScoreDisplay() {}, renderFeedbackOverlay() {}, renderVirtualKeyboard() {},
        handleAutoScroll() {}, startVisualSustains() {}, scheduleMetronomeForPlaybackWindow() {},
        clearScheduledMetronomeEvents() {}, clearTempoVisualPulse() {},
        pausePlaybackFromToolbar() { state.isPlaying = false; completions++; }
    });
    vm.runInContext(fs.readFileSync('js/trainer-timing.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('js/score-expression.js', 'utf8'), context);
    context.ScoreExpression = context.window.ScoreExpression;
    vm.runInContext(section(feedback, 'function drawExpectedNoteFeedback(', 'function getCursorSvgX(')
        + feedback.slice(feedback.indexOf('function findExpectedMatchForMidi(')), context);
    for (const [start, end] of [
        ['// Stop invalidates callbacks', "document.getElementById('canvas-wrapper')"],
        ['function findSatisfiedOrSustainedMatchForMidi(', 'function renderVirtualKeyboard('],
        ['function triggerVirtualKey(', '// UI LISTENERS & SYNC LOGIC'],
        ['function playbackLoop()', 'const backupSettingsButton']
    ]) vm.runInContext(section(core, start, end), context);
    function advanceTo(time) {
        while (true) {
            const next = [...timers].filter(([, timer]) => timer.at <= time)
                .sort((a, b) => a[1].at - b[1].at)[0];
            if (!next) break;
            timers.delete(next[0]); now = next[1].at; next[1].callback();
        }
        now = time;
    }
    context.playbackLoop();
    return { state, context, note, outputs, feedbackPaint, timers, advanceTo,
        get completions() { return completions; } };
}

for (const mode of ['realtime', 'wait', 'follow']) {
    for (const enabled of [false, true]) {
        // Enable score output in this isolated core fixture even in Wait, whose UI
        // disables score-hand playback; the same grading functions run in all modes.
        const f = fixture(mode, enabled);
        check(f.outputs[0].durationMs === (enabled ? 250 : 450), `${mode}: expression changes output gate`);
        check(f.state.visualNotesToStart[0].durationMs === 425, `${mode}: visual sustain keeps ordinary length`);
        check(f.state.anchorTime === 0.5, `${mode}: musical interval remains 500 ms`);
        f.advanceTo(400); // After the 250 ms staccato output gate, before event advancement.
        check(f.state.score.wrong === 0 && !f.state.expectedNotes[0].hit, `${mode}: no miss at staccato cutoff`);
        f.context.triggerVirtualKey(60, true, 'midi', 1);
        check(f.state.score.correct === 1 && f.state.score.wrong === 0 && f.state.expectedNotes[0].hit,
            `${mode}: soft attack after staccato cutoff is correct`);
        f.advanceTo(401); f.context.triggerVirtualKey(60, false, 'midi');
        check(f.state.score.correct === 1 && f.state.score.wrong === 0,
            `${mode}: one-millisecond key hold retains credit`);
        check(f.feedbackPaint.length === 1 && f.feedbackPaint[0][1] === true,
            `${mode}: attack paints one correct result`);
        f.advanceTo(1500);
        check(f.state.score.correct === 1 && f.state.score.wrong === 0 && f.completions === 1,
            `${mode}: normal advancement adds no release/duration penalty`);

        const missed = fixture(mode, enabled);
        missed.advanceTo(499);
        check(missed.state.score.wrong === 0, `${mode}: no premature miss before normal event end`);
        missed.advanceTo(500);
        if (mode === 'realtime') {
            check(missed.state.score.wrong === 1 && missed.completions === 1,
                'Realtime: unanswered note misses at musical deadline');
        } else {
            missed.advanceTo(5000);
            check(missed.state.score.wrong === 0 && missed.completions === 0,
                `${mode}: unanswered note keeps waiting beyond output duration`);
            missed.context.triggerVirtualKey(60, true, 'midi', 127);
            check(missed.state.score.correct === 1 && missed.state.score.wrong === 0,
                `${mode}: very late loud attack still satisfies waiting target`);
        }
        for (const staccato of [false, true]) for (const releaseAt of [1, 2000]) {
            const held = fixture(mode, enabled, staccato);
            held.context.triggerVirtualKey(60, true, 'midi', 127);
            held.advanceTo(releaseAt); held.context.triggerVirtualKey(60, false, 'midi');
            held.advanceTo(2001);
            check(held.state.score.correct === 1 && held.state.score.wrong === 0,
                `${mode}: ${releaseAt} ms hold of ${staccato ? 'staccato' : 'ordinary'} note has no duration penalty`);
        }
    }
}
console.log(`Expression grading: ${checks} checks passed (actual playback/timing, target building, pitch matching, key-up and missed-note functions; synthetic score/output/geometry adapters).`);
