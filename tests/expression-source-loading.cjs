// Exercise the actual loader seam with isolated OSMD/extraction adapters; no browser storage or devices.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = fs.readFileSync('js/trainer-core.js', 'utf8');
let checks = 0;
function check(condition, message) { assert(condition, message); checks++; }
function section(start, end) {
    const first = core.indexOf(start), last = core.indexOf(end, first);
    assert(first >= 0 && last > first, start);
    return core.slice(first, last);
}
function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}
class TestFile extends Blob {
    constructor(parts, name, options) { super(parts, options); this.name = name; }
}
function fixture(options = {}) {
    const events = [], bindings = [], payloads = [], canonicalCalls = [], assignments = [], alerts = [];
    const extractionEntered = deferred();
    let extracts = 0;
    const osmd = {
        Sheet: { id: 0 },
        async load(payload) {
            events.push('load-start'); payloads.push(payload);
            await Promise.resolve();
            this.Sheet = { id: payloads.length }; events.push('load-end');
        },
        cursor: { reset() { events.push('cursor-reset'); }, show() {}, update() {} }
    };
    const state = {};
    const window = options.withoutExpression ? {} : {
        ScoreExpression: { bindSource(sheet, xml) { bindings.push({ sheet, xml }); events.push('bind'); } }
    };
    const context = vm.createContext({
        window, osmd, AppState: state, ArrayBuffer, Uint8Array, Blob, File: TestFile,
        console: { error() {} }, alert(message) { alerts.push(message); },
        resetPlaybackForLoadedScore() { events.push('reset'); },
        updateTempo() { events.push('tempo-reset'); },
        async getCanonicalMusicXmlForTranspose(raw, metadata) {
            events.push('canonical'); canonicalCalls.push({ raw, metadata });
            return options.canonical === undefined ? '<score-partwise canonical="original"/>' : options.canonical;
        },
        async extractMusicXmlFromMxl(raw) {
            extracts++; events.push('extract-start'); extractionEntered.resolve(raw);
            if (options.extractionGate) await options.extractionGate.promise;
            if (options.extractionFailure) throw Error('Direct ZIP extraction failed');
            events.push('extract-end');
            return options.extracted || '<score-partwise source="direct-mxl"/>';
        },
        renderScoreAndRefreshGeometry() { events.push('render'); },
        HandAssignment: {
            deactivate() { events.push('assignment-deactivate'); },
            async initialize(xml, raw) { assignments.push({ xml, raw }); events.push('assignment-init'); }
        },
        initSongUI() { events.push('init-ui'); }, handleAutoScroll() {},
        updatePracticeSummary() { events.push('practice-summary'); }
    });
    vm.runInContext(section('function getScoreFileTypeFromName(', 'function readScoreFile(')
        + section('function cloneScoreRawData(', 'function readUint16LE(')
        + section('function getOsmdLoadPayload(', 'async function loadScoreIntoApp(')
        + section('async function loadScoreIntoApp(', 'async function handleDirectScoreFileSelection('), context);
    return { load: context.loadScoreIntoApp, state, osmd, events, bindings, payloads, canonicalCalls, assignments, alerts,
        extractionEntered, get extracts() { return extracts; } };
}
function checkOrder(test) {
    const order = ['reset', 'canonical', 'load-start', 'load-end', 'bind', 'render', 'assignment-deactivate', 'init-ui', 'assignment-init', 'cursor-reset', 'practice-summary'];
    for (let index = 1; index < order.length; index++) {
        check(test.events.indexOf(order[index - 1]) < test.events.indexOf(order[index]), order[index - 1] + ' precedes ' + order[index]);
    }
    check(test.alerts.length === 0, 'Successful metadata binding leaves loader errors untouched');
}

(async () => {
    const xml = '<score-partwise source="current-xml"/>';
    const normal = fixture();
    await normal.load(xml, { fileName: 'ordinary.musicxml', fileType: 'musicxml' });
    check(normal.bindings[0].xml === xml, 'Current XML binds directly, not canonical/normalized metadata');
    check(normal.payloads[0] === xml, 'Ordinary XML render source remains unchanged');
    check(normal.extracts === 0, 'XML does not invoke binary extraction');
    check(normal.bindings[0].sheet === normal.osmd.Sheet, 'Binding receives the newly loaded sheet');
    check(normal.assignments[0].xml === '<score-partwise canonical="original"/>', 'Hand assignment still receives canonical original XML');
    check(normal.assignments[0].raw === xml, 'Hand assignment retains original raw source');
    check(normal.state.currentScoreData === xml, 'Current source persistence retains input identity');
    checkOrder(normal);

    const transformed = '<score-partwise source="transposed"/>', original = '<score-partwise source="original"/>';
    const transpose = fixture({ canonical: original });
    await transpose.load(transformed, { fileName: 'transposed.musicxml', fileType: 'musicxml', originalRawData: original,
        originalFileName: 'original.mxl', originalFileType: 'mxl', skipTransposeReset: true });
    check(transpose.bindings[0].xml === transformed, 'Transposition binds current transformed XML');
    check(transpose.payloads[0] === transformed, 'Transposition renders requested transformed XML');
    check(transpose.canonicalCalls[0].raw === original, 'Canonical original remains the transpose/assignment source');
    check(transpose.assignments[0].xml === original && transpose.assignments[0].raw === original, 'Transposition preserves original assignment arguments');
    check(transpose.state.currentScoreOriginalData === original, 'Original transpose reset source stays intact');
    check(!transpose.events.includes('tempo-reset'), 'Transpose reload retains existing tempo-reset policy');
    checkOrder(transpose);

    const reset = fixture({ canonical: original });
    await reset.load(original, { fileName: 'original.mxl', fileType: 'mxl', originalRawData: original, skipTransposeReset: true });
    check(reset.bindings[0].xml === original, 'XML string labelled MXL binds as XML during transpose reset');
    check(reset.payloads[0] === original && reset.extracts === 0, 'XML-labelled MXL reset does not invoke ZIP extraction or replace render input');

    const bytes = Uint8Array.from([80, 75, 3, 4, 7, 11, 13]).buffer;
    const gate = deferred();
    const mxl = fixture({ canonical: '<score-partwise converter="normalized"/>', extracted: original, extractionGate: gate });
    const loading = mxl.load(bytes, { fileName: 'original.mxl', fileType: 'MXL' });
    const extractedSource = await mxl.extractionEntered.promise;
    check(!mxl.events.includes('load-start'), 'Asynchronous source extraction completes before OSMD loading begins');
    check(extractedSource !== bytes, 'Expression extraction reads a clone of the binary input');
    check(Buffer.from(extractedSource).equals(Buffer.from(bytes)), 'Expression extraction clone retains exact MXL bytes');
    gate.resolve(); await loading;
    check(mxl.events.indexOf('extract-end') < mxl.events.indexOf('load-start'), 'Direct extraction resolves before load/render sequence');
    check(mxl.bindings[0].xml === original, 'MXL binding uses direct extracted XML, not converter-normalized canonical data');
    check(mxl.payloads[0] instanceof TestFile && mxl.payloads[0].name === 'original.mxl', 'MXL still renders through the original binary File payload path');
    check(Buffer.from(await mxl.payloads[0].arrayBuffer()).equals(Buffer.from(bytes)), 'Rendered MXL payload has byte-for-byte original content');
    check(mxl.state.currentScoreData === bytes, 'MXL current source retains original caller identity');
    check(mxl.assignments[0].xml === '<score-partwise converter="normalized"/>', 'Canonical fallback stays confined to original assignment/transpose support');
    check(Buffer.from(mxl.assignments[0].raw).equals(Buffer.from(bytes)), 'Hand assignment retains original MXL bytes');
    checkOrder(mxl);

    const failed = fixture({ extractionFailure: true, canonical: '<score-partwise converter="normalized"/>' });
    await failed.load(bytes, { fileName: 'fallback.mxl', fileType: 'mxl' });
    check(failed.bindings[0].xml === null, 'Direct extraction failure binds null for parsed-OSMD fallback');
    check(failed.payloads[0] instanceof TestFile, 'Metadata failure still loads original MXL');
    check(Buffer.from(await failed.payloads[0].arrayBuffer()).equals(Buffer.from(bytes)), 'Metadata failure cannot substitute converter-normalized XML into renderer');
    check(failed.state.currentScoreData === bytes && failed.alerts.length === 0, 'Metadata failure does not abort score loading');
    checkOrder(failed);

    const reload = fixture();
    await reload.load(xml); const firstSheet = reload.osmd.Sheet;
    await reload.load(transformed); const secondSheet = reload.osmd.Sheet;
    check(firstSheet !== secondSheet && reload.bindings.length === 2, 'Each reload binds exactly one fresh sheet');
    check(reload.bindings[0].sheet === firstSheet && reload.bindings[1].sheet === secondSheet, 'Reload bindings remain sheet-local');
    check(reload.bindings[0].xml === xml && reload.bindings[1].xml === transformed, 'Reload source metadata never leaks from previous sheet');

    const absent = fixture({ withoutExpression: true });
    await absent.load(xml);
    check(absent.payloads[0] === xml && absent.alerts.length === 0, 'Missing optional expression module cannot prevent loading');
    console.log(`Expression source loading: ${checks} checks passed (actual loader/clone/payload functions with isolated adapters; no browser or hardware claim).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
