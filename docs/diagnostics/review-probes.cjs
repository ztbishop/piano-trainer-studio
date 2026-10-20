/* Read-only source probes for the 2026-10-20 documentation review.
 * Run: node docs/diagnostics/review-probes.cjs
 * No browser storage, sockets, external devices, or project files are mutated.
 * These focused probes are not a browser/OSMD integration test suite.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const reports = [];
function section(source, start, end) {
    const a = source.indexOf(start);
    const b = source.indexOf(end, a + start.length);
    assert(a >= 0 && b > a, `Source boundary changed: ${start}`);
    return source.slice(a, b);
}
function report(id, observed, expected, issueObserved) {
    reports.push({ id, issueObserved, observed, expected });
}

// Run the actual server resolver/handler, but replace HTTP listen with a no-op.
let requestHandler;
const serverContext = vm.createContext({
    __dirname: root, process: { env: {} }, console: { log() {} },
    require(name) {
        if (name === 'http') return { createServer(handler) {
            requestHandler = handler;
            return { listen() {} };
        } };
        if (['fs', 'path', 'url', 'os'].includes(name)) return require(name);
        throw new Error(`Unexpected module: ${name}`);
    }
});
vm.runInContext(read('local-web-server.js'), serverContext);
let malformedError = null;
try { requestHandler({ url: '/%', method: 'GET' }, {}); }
catch (error) { malformedError = error.name; }
report('SERVER-URI', malformedError, 'No uncaught error; controlled 4xx response', !!malformedError);
const siblingName = path.basename(root) + '-audit-probe';
const traversal = `/assets/../../${siblingName}/probe.txt`;
const resolved = vm.runInContext(`safeResolve(${JSON.stringify(traversal)})`, serverContext);
const escapedRoot = !!resolved?.fullPath && path.relative(root, resolved.fullPath).startsWith('..');
report('SERVER-PATH', resolved?.fullPath || null, 'Reject paths outside the site root', escapedRoot);

// Exercise count-in callbacks with a deterministic fake timer queue.
const core = read('js/trainer-core.js');
const timerQueue = [];
const starts = [];
const appState = { isPlaying: true, baseBpm: 120, speedPercent: 1 };
const countContext = vm.createContext({
    AppState: appState,
    clearTimeout() {},
    osmd: { cursor: { Iterator: { CurrentMeasureIndex: 0 } },
        Sheet: { SourceMeasures: [{ ActiveTimeSignature: { Numerator: 2 } }] } },
    playMetronomeClick() {},
    setTimeout(callback) { timerQueue.push(callback); return timerQueue.length; }
});
vm.runInContext(section(core, '// Stop invalidates callbacks',
    "document.getElementById('canvas-wrapper')"), countContext);
countContext.doCountInAndStart(() => starts.push('old attempt'));
countContext.cancelPlaybackRun(); // same invalidation used by pause/reset
appState.isPlaying = false; // pause before the first pending callback
appState.isPlaying = true;  // restart before that callback fires
countContext.doCountInAndStart(() => starts.push('new attempt'));
let ticks = 0;
while (timerQueue.length && ticks++ < 20) timerQueue.shift()();
assert(ticks < 20, 'Count-in timer queue did not settle');
report('PLAYBACK-EPOCH', starts, ['new attempt'], starts.includes('old attempt'));

// At the final loop event, Wait mode must still require the current chord.
const loopTimers = [];
let loopResets = 0;
let missedAtLoop = 0;
const iterator = { EndReached: false, CurrentMeasureIndex: 0,
    currentTimeStamp: { RealValue: 0 }, CurrentVoiceEntries: [{ Notes: [{ Length: { RealValue: 0.25 } }] }],
    moveToNext() { this.EndReached = true; } };
const loopState = { isPlaying: true, mode: 'wait', baseBpm: 120, speedPercent: 1,
    practice: { left: false, right: true }, playback: { left: false, right: false },
    audioEnabled: { hands: false, other: false }, midiOutEnabled: { hands: false, other: false },
    pendingAudio: [], score: { correct: 0, wrong: 0 }, loopCountInEnabled: false };
const loopContext = vm.createContext({
    AppState: loopState,
    osmd: { Sheet: { SourceMeasures: [{ TempoInBPM: 120 }] },
        cursor: { Iterator: iterator, update() {}, reset() {
            loopResets++; iterator.EndReached = false;
        } } },
    document: { getElementById(id) { return { checked: id === 'check-looper', value: '1' }; } },
    window: { PTTiming: { getTraversalBeatsToWait() { return 1; } } },
    Tone: { now() { return 0; }, Transport: { stop() {}, start() {} } },
    HandAssignment: { roleForNote() { return 'right'; }, playAccompaniment() { return false; } },
    buildExpectedNotesFromEntries() { loopState.expectedNotes = [{ midi: 60, hit: false }]; },
    makeLedPreviewEntrySignature() { return 'probe'; },
    renderFeedbackOverlay() {}, renderVirtualKeyboard() {}, getMeasureTimingInfo() {},
    scheduleMetronomeForPlaybackWindow() {}, handleAutoScroll() {}, clearVisuals() {},
    updateScoreDisplay() {}, GeometryEngine: { clearSvgFeedback() {} },
    processMissedNotes() { missedAtLoop += loopState.expectedNotes.filter(note => !note.hit).length; },
    schedulePlaybackTimeout(callback) { loopTimers.push(callback); return loopTimers.length; }
});
vm.runInContext(section(core, 'function playbackLoop()', 'const backupSettingsButton'), loopContext);
loopContext.playbackLoop();
// A fixed gate has no boundary timer until the practiced group is satisfied.
if (loopTimers.length) loopTimers.shift()();
report('WAIT-LOOP-GATE', { loopResets, missedAtLoop },
    'No loop restart until the final practiced note is satisfied', loopResets > 0 && missedAtLoop > 0);

// Instrument only an in-memory copy to expose the existing pitch rewrite helper.
const transposeContext = vm.createContext({ window: {} });
const transpose = read('js/transpose/transpose-engine.js');
assert(transpose.includes('window.TransposeEngine = {'), 'Transpose export boundary changed');
vm.runInContext(transpose.replace('window.TransposeEngine = {',
    'window.__review = { rewritePitchNode }; window.TransposeEngine = {'), transposeContext);
function pitch(step, alter, octave) {
    const doc = { createElement: tagName => ({ tagName, textContent: '' }) };
    const parent = { ownerDocument: doc, children: [],
        querySelector(name) { return this.children.find(child => child.tagName === name) || null; },
        appendChild(child) {
            child.remove = () => { this.children = this.children.filter(item => item !== child); };
            this.children.push(child);
        }
    };
    for (const [tagName, text] of [['step', step], ['alter', alter], ['octave', octave]]) {
        parent.appendChild({ tagName, textContent: String(text) });
    }
    return parent;
}
const transposedPitch = pitch('B', 1, 4);
transposeContext.window.__review.rewritePitchNode(transposedPitch, 1, 'sharp');
const rewrittenPitch = transposedPitch.children.map(child => `${child.tagName}=${child.textContent}`).join(', ');
report('TRANSPOSE-OCTAVE', rewrittenPitch, 'C-sharp 5 (B-sharp 4 plus one semitone)',
    transposedPitch.querySelector('octave').textContent !== '5');

// The collection shape is synthetic; real OSMD tie topology still needs a fixture.
const tieContext = vm.createContext({});
vm.runInContext(section(read('js/feedback-engine.js'), 'function getCombinedTieLength(',
    'function buildExpectedNotesFromEntries('), tieContext);
const notes = Array.from({ length: 3 }, () => ({ halfTone: 48, Length: { RealValue: 0.25 } }));
const sharedTie = { StartNote: notes[0], Notes: notes };
notes.forEach(note => { note.NoteTie = sharedTie; });
const tieLength = tieContext.getCombinedTieLength(notes[0]);
report('TIE-TOPOLOGY', tieLength, '0.75 if a shared Notes array contains all three segments', tieLength !== 0.75);

// Read bootstrap/storage behavior in disposable, in-memory storage only.
function memoryStorage() {
    const data = new Map();
    return { getItem: key => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key) };
}
const stateContext = vm.createContext({ window: {}, localStorage: memoryStorage(), sessionStorage: memoryStorage() });
vm.runInContext(read('js/trainer-state.js'), stateContext);
const updatePath = vm.runInContext('UPDATE_MANIFEST_URL', stateContext);
const updateUrl = new URL(updatePath, 'https://example.invalid/piano-trainer-studio/index.html').pathname;
report('UPDATE-SUBPATH', updateUrl, '/piano-trainer-studio/version.json',
    updateUrl !== '/piano-trainer-studio/version.json');

console.log(JSON.stringify({
    note: 'issueObserved records a diagnostic observation, not a completed browser/hardware test. TIE-TOPOLOGY is conditional on the synthetic object shape.',
    reports
}, null, 2));
