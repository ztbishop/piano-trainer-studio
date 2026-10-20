// Actual core functions with deterministic clocks/iterator; no browser storage/devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
// Optional historical reproduction: --baseline=ee9bd60 (the pre-fix revision).
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.slice('--baseline='.length);
const core = baseline
    ? execFileSync('git', ['show', `${baseline}:js/trainer-core.js`], { encoding: 'utf8' })
    : fs.readFileSync('js/trainer-core.js', 'utf8');
function section(start, end) {
    const a = core.indexOf(start), b = core.indexOf(end, a);
    assert(a >= 0 && b > a, start);
    return core.slice(a, b);
}

function fixture(mode, { hits = [false, false], endReached = false, countIn = false, loop = true } = {}) {
    let now = 0, timerId = 0, resets = 0, misses = 0, builds = 0, sustains = 0, outputs = 0;
    const timers = new Map(), delays = [], clicks = [], metronome = [];
    const expected = hits.map(hit => ({ hit }));
    const note = { Length: { RealValue: 0.25 }, halfTone: 48, isRest: () => false };
    const iterator = {
        EndReached: false, CurrentMeasureIndex: 0, currentTimeStamp: { RealValue: 0.75 },
        CurrentVoiceEntries: [{ Notes: [note] }],
        moveToNext() {
            this.EndReached = endReached;
            this.CurrentMeasureIndex++;
            this.currentTimeStamp.RealValue += 0.25;
        }
    };
    const state = {
        isPlaying: true, mode, baseBpm: 120, speedPercent: 1, anchorTime: 0,
        practice: { right: true, left: false }, playback: { right: false, left: false },
        audioEnabled: { hands: false, other: false }, midiOutEnabled: { hands: false, other: false },
        pendingAudio: [], score: { correct: 7, wrong: 2 }, loopCountInEnabled: countIn
    };
    const context = vm.createContext({
        AppState: state, FOLLOW_ME_MIN_WAIT_RATIO: 0.6,
        setTimeout(callback, delay) {
            delays.push(delay);
            timers.set(++timerId, { callback, at: now + delay });
            return timerId;
        },
        clearTimeout: id => timers.delete(id), cancelAnimationFrame() {},
        Tone: { now: () => now / 1000, Transport: { start() {}, stop() {} } },
        osmd: {
            Sheet: { SourceMeasures: [{ TempoInBPM: 120, ActiveTimeSignature: { Numerator: 2 } }] },
            cursor: { Iterator: iterator, update() {}, reset() {
                resets++; iterator.EndReached = false; iterator.CurrentMeasureIndex = 0;
            } }
        },
        document: { getElementById: id => ({ checked: id === 'check-looper' && loop, value: '1' }) },
        window: { PTTiming: { getTraversalBeatsToWait: () => 1 } },
        HandAssignment: { roleForNote: () => 'right', playAccompaniment: () => false },
        buildExpectedNotesFromEntries() { builds++; state.expectedNotes = expected; },
        makeLedPreviewEntrySignature: () => 'fixture', getMeasureTimingInfo() {},
        renderFeedbackOverlay() {}, renderVirtualKeyboard() {}, handleAutoScroll() {}, clearVisuals() {},
        clearScheduledMetronomeEvents() {}, clearTempoVisualPulse() {}, updateScoreDisplay() {},
        GeometryEngine: { clearSvgFeedback() {} },
        processMissedNotes() { misses += state.expectedNotes.filter(note => !note.hit).length; },
        startVisualSustains() { sustains++; },
        schedulePlaybackForDestinations() { outputs++; },
        scheduleMetronomeForPlaybackWindow(...args) { metronome.push(args); },
        playMetronomeClick() { clicks.push(now); }
    });
    vm.runInContext(section('// Stop invalidates callbacks', "document.getElementById('canvas-wrapper')"), context);
    vm.runInContext(section('function checkWaitModeAdvance()', '// UI LISTENERS & SYNC LOGIC'), context);
    vm.runInContext(section('function playbackLoop()', 'const backupSettingsButton'), context);
    function next() {
        assert(timers.size > 0, 'Expected a pending callback');
        const [id, timer] = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        timers.delete(id); now = Math.max(now, timer.at); timer.callback();
    }
    return { state, context, expected, timers, delays, clicks, metronome, next,
        setNow(value) { now = value; },
        get resets() { return resets; }, get misses() { return misses; },
        get builds() { return builds; }, get sustains() { return sustains; }, get outputs() { return outputs; }
    };
}

if (baseline) {
    for (const mode of ['wait', 'follow']) {
        const f = fixture(mode);
        f.context.playbackLoop(); f.next();
        assert.equal(f.resets, 1); assert.equal(f.misses, 2);
        console.log(`Baseline ${mode}: restarted with two unsatisfied notes; isolated defect reproduced.`);
    }
} else {
    for (const mode of ['wait', 'follow']) {
        for (const endReached of [false, true]) {
            const f = fixture(mode, { endReached });
            f.context.playbackLoop();
            assert.equal(f.timers.size, 0, `${mode}: no timer may release the unsatisfied gate`);
            f.setNow(5000); f.context.checkWaitModeAdvance();
            assert.equal(f.resets, 0); assert.equal(f.misses, 0);
            f.expected[0].hit = true; f.context.checkWaitModeAdvance();
            assert.equal(f.timers.size, 0, 'A partial chord must still wait');
            // Accompaniment is released only when the entire group is hit.
            f.state.pendingAudio.push({ midi: 48, durationMs: 450, toLocalAudio: true });
            f.expected[1].hit = true; f.context.checkWaitModeAdvance();
            assert.equal(f.outputs, 1); assert.equal(f.sustains, 1);
            assert.equal(f.delays.at(-1), 500, 'Late hit retains the full final duration');
            f.context.checkWaitModeAdvance(); assert.equal(f.timers.size, 1, 'No duplicate completion');
            assert.equal(f.resets, 0); f.next();
            assert.equal(f.resets, 1); assert.equal(f.misses, 0);
            assert.equal(f.state.score.correct, 0); assert.equal(f.state.score.wrong, 0);
        }
        const early = fixture(mode, { hits: [true, true] });
        early.context.playbackLoop(); early.next();
        assert.equal(early.resets, 0); early.next(); assert.equal(early.resets, 1);
        const stopped = fixture(mode);
        stopped.context.playbackLoop(); stopped.expected.forEach(n => n.hit = true);
        stopped.context.checkWaitModeAdvance(); stopped.context.cancelPlaybackRun();
        assert.equal(stopped.timers.size, 0); assert.equal(stopped.resets, 0);
        const counting = fixture(mode, { countIn: true });
        counting.context.playbackLoop(); counting.expected.forEach(n => n.hit = true);
        counting.context.checkWaitModeAdvance(); counting.next();
        assert.equal(counting.resets, 1); assert.equal(counting.builds, 1);
        assert.equal(counting.state.countInActive, true);
        counting.next(); counting.next();
        assert.equal(counting.builds, 2); assert.equal(counting.clicks.length, 2);
        assert.equal(counting.state.countInActive, false);
    }
    for (const mode of ['wait', 'follow', 'realtime']) {
        const rest = fixture(mode, { hits: [] });
        rest.context.playbackLoop(); assert.equal(rest.delays.at(-1), 500);
        rest.next(); assert.equal(rest.resets, 1, 'Rests/inactive hands retain timed boundary');
    }
    const realtime = fixture('realtime'); realtime.context.playbackLoop(); realtime.next();
    assert.equal(realtime.resets, 1); assert.equal(realtime.misses, 2);
    for (const [hitAt, expectedDelay] of [[0, 500], [100, 400], [450, 500], [700, 500]]) {
        const follow = fixture('follow'); follow.context.playbackLoop(); follow.setNow(hitAt);
        follow.expected.forEach(n => n.hit = true); follow.context.checkWaitModeAdvance();
        assert.equal(follow.delays.at(-1), expectedDelay, 'Follow adaptive delay remains unchanged');
    }
    // Interior Wait events retain the short delay instead of the final-loop duration.
    const interior = fixture('wait', { loop: false }); interior.context.playbackLoop();
    interior.expected.forEach(n => n.hit = true); interior.context.checkWaitModeAdvance();
    assert.equal(interior.delays.at(-1), 10);
    console.log('Loop gate regressions passed: Wait/Follow chords, late/early hits, count-in, cancellation, rests, Realtime and interior Wait timing.');
}
