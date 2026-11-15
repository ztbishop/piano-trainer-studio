const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Isolated diagnostic contracts, not browser engraving or hardware acceptance.
// The real bundled renderer supplies its index and SVG grouping methods below.
global.self = global;
const bundled = require('../assets/js/opensheetmusicdisplay.min.js');
const debugSource = fs.readFileSync('js/feedback-debug.js', 'utf8');
const engineSource = fs.readFileSync('js/feedback-engine.js', 'utf8');
let checks = 0;
function check(label, run) {
    try { run(); } catch (error) { throw new Error(label, { cause: error }); }
    checks++;
}
const plain = value => JSON.parse(JSON.stringify(value));

class Matrix {
    constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
        Object.assign(this, { a, b, c, d, e, f });
    }
    inverse() {
        const det = this.a * this.d - this.b * this.c;
        if (!det) throw new Error('singular matrix');
        return new Matrix(this.d / det, -this.b / det, -this.c / det, this.a / det,
            (this.c * this.f - this.d * this.e) / det,
            (this.b * this.e - this.a * this.f) / det);
    }
    multiply(m) {
        return new Matrix(this.a * m.a + this.c * m.b, this.b * m.a + this.d * m.b,
            this.a * m.c + this.c * m.d, this.b * m.c + this.d * m.d,
            this.a * m.e + this.c * m.f + this.e, this.b * m.e + this.d * m.f + this.f);
    }
}

function point(x = 0, y = 0) {
    return { x, y, matrixTransform(m) {
        return point(m.a * this.x + m.c * this.y + m.e, m.b * this.x + m.d * this.y + m.f);
    } };
}

function element(className, box = { x: 0, y: 0, width: 10, height: 8 }, matrix = new Matrix()) {
    const attributes = new Map();
    return {
        nodeType: 1, tagName: 'g', children: [], isConnected: true, parentElement: null,
        style: {}, classList: { contains: name => name === className },
        computed: { visibility: 'visible', display: 'inline', opacity: '1', fill: 'black' },
        getBBox: () => ({ ...box }), getCTM: () => matrix, getScreenCTM: () => matrix,
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => attributes.set(name, String(value)),
        appendChild(child) { this.children.push(child); child.parentElement = this; child.parentNode = this; return child; },
        replaceChildren() { this.children = []; },
        contains(node) { return this === node || this.children.some(child => child.contains(node)); },
        closest() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; }
    };
}

function harness() {
    const root = element('svg');
    root.tagName = 'svg';
    root.createSVGPoint = () => point();
    const layer = element('pt-debug-group');
    root.appendChild(layer);
    root.querySelector = selector => selector === '#pt-debug-group' ? layer : null;
    const state = {
        debugPersistentAnchors: false, debugEventFlow: false, debugMatchLogs: false,
        debugAnchorResolution: false, debugAnchorHistory: [], debugFrameSeq: 0,
        debugStickyFrameLimit: 10, expectedNotes: [], score: { correct: 3, wrong: 1 },
        earlyGraceReservations: new Map(), visualNotesToStart: []
    };
    const logs = [];
    const context = vm.createContext({
        AppState: state, window: { getComputedStyle: node => node.computed },
        document: { getElementById: () => null, querySelector: () => root,
            createElementNS: (_, tag) => { const node = element(''); node.tagName = tag; return node; } },
        console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
        getStoredBool: (_, fallback) => fallback, setStoredBool() { throw new Error('unexpected preference write'); },
        SETTINGS_DEBUG_STORAGE_KEY: 'debug', setInterval: () => 1, clearInterval() {},
        osmd: {}, isFinite, DOMPoint: class { constructor(x, y) { return point(x, y); } }
    });
    vm.runInContext(engineSource, context);
    vm.runInContext(debugSource, context);
    const engine = vm.runInContext('GeometryEngine', context);
    engine.getSvg = () => root;
    engine.ensureGroup = id => { assert.equal(id, 'pt-debug-group'); return layer; };
    const debug = context.window.FeedbackDebug;
    return { context, state, root, layer, engine, debug, logs };
}

function fixture(h, boxes = [{ x: 10, y: 20, width: 12, height: 8 }], index = 0) {
    const source = { halfTone: 48, Length: { RealValue: .25 }, ParentStaff: { id: 1 },
        ParentVoiceEntry: { Timestamp: { RealValue: .5 } }, PrintObject: true, isRest: () => false };
    const noteGroup = element('vf-note');
    const heads = boxes.map(box => element('vf-notehead', box));
    for (const head of heads) noteGroup.appendChild(head);
    // A modifier and stem are deliberately present but outside the notehead list.
    noteGroup.appendChild(element('vf-stem', { x: 22, y: -100, width: 1, height: 124 }));
    const group = element('vf-stavenote');
    group.appendChild(noteGroup);
    group.appendChild(element('vf-modifiers', { x: 30, y: 18, width: 4, height: 4 }));
    h.root.appendChild(group);
    const setOwner = node => { node.ownerSVGElement = h.root; for (const child of node.children) setOwner(child); };
    setOwner(group);
    const graphical = Object.create(bundled.VexFlowGraphicalNote.prototype);
    graphical.sourceNote = source;
    graphical.parentVoiceEntry = { parentStaffEntry: { parentMeasure: { isMultiRestMeasure: () => false } } };
    const vf = { note_heads: boxes.map((_, i) => ({ index: i })), getAttribute: name => name === 'el' ? group : 'test-note' };
    graphical.setIndex(vf, index);
    return { source, graphical, heads, group, noteGroup, vf };
}

check('bundled renderer preserves the exact chord index and excludes stem/modifier groups', () => {
    const h = harness();
    const f = fixture(h, [{ x: 10, y: 20, width: 12, height: 8 }, { x: 21, y: 25, width: 12, height: 8 }], 1);
    assert.equal(f.graphical.vfnoteIndex, 1);
    assert.equal(f.graphical.notehead(), f.vf.note_heads[1]);
    assert.deepEqual([...f.graphical.getNoteheadSVGs()], f.heads);
    assert.equal(f.graphical.getNoteheadSVGs()[1], f.heads[1]);
});

function enable(h) {
    h.state.debugAnchorResolution = true;
}
function compare(h, f, anchor = { x: 16, y: 24 }) {
    return h.debug.compareNotehead(f.source, f.graphical, 2, 0, anchor);
}

check('disabled comparison performs no renderer or SVG reads', () => {
    const h = harness();
    const unreadable = new Proxy({}, { get() { throw new Error('disabled diagnostic read'); } });
    h.debug.compareNotehead(unreadable, unreadable, 2, 0, unreadable);
    assert.equal(h.debug.noteheadComparisons.length, 0);
});

check('missing or primitive source inputs cannot create records or throw', () => {
    const h = harness(); enable(h);
    for (const source of [null, undefined, false, 1, 'invalid']) {
        assert.equal(h.debug.compareNotehead(source, null, 2, 0, null), null);
    }
    assert.equal(h.debug.noteheadComparisons.length, 0);
});

check('the exact shifted chord head is compared without mutating current anchors or practice state', () => {
    const h = harness(); enable(h);
    const f = fixture(h, [{ x: 10, y: 20, width: 12, height: 8 }, { x: 21, y: 25, width: 12, height: 8 }], 1);
    const anchor = Object.freeze({ x: 16, y: 24, measureIndex: 2, staffIndex: 0 });
    const before = JSON.stringify(h.state);
    const row = compare(h, f, anchor);
    assert.deepEqual(plain(row.directAnchor), { x: 27, y: 29 });
    assert.equal(row.headIndex, 1);
    assert.equal(row.headCount, 2);
    assert.equal(row.currentAnchor.x, 16);
    assert.equal(row.currentAnchor.y, 24);
    assert.notEqual(row.currentAnchor, anchor);
    assert.equal(JSON.stringify(h.state), before);
    assert.equal(h.engine.noteAnchorCache.has(f.source), false);
});

check('head bounds are transformed into the existing root SVG coordinates', () => {
    const h = harness(); enable(h);
    const f = fixture(h);
    const rootMatrix = new Matrix(2, 0, 0, 2, 100, 200);
    const headMatrix = rootMatrix.multiply(new Matrix(1, 0, 0, 1, 7, -3));
    h.root.getCTM = h.root.getScreenCTM = () => rootMatrix;
    f.heads[0].getCTM = f.heads[0].getScreenCTM = () => headMatrix;
    const row = compare(h, f, { x: 23, y: 21 });
    assert.deepEqual(plain(row.directAnchor), { x: 23, y: 21 });
});

check('rotation and nonuniform scale do not use a page-pixel bounding rectangle', () => {
    const h = harness(); enable(h);
    const f = fixture(h);
    const rootMatrix = new Matrix(1.5, 0, 0, .75, 50, -80);
    const headMatrix = rootMatrix.multiply(new Matrix(0, 1, -1, 0, 60, 10));
    h.root.getCTM = h.root.getScreenCTM = () => rootMatrix;
    f.heads[0].getCTM = f.heads[0].getScreenCTM = () => headMatrix;
    const row = compare(h, f, { x: 36, y: 26 });
    assert.ok(Math.abs(row.directAnchor.x - 36) < 1e-9);
    assert.ok(Math.abs(row.directAnchor.y - 26) < 1e-9);
});

for (const [label, mutate, reason] of [
    ['missing graphical note', f => { f.graphical = null; }, 'source-identity-mismatch'],
    ['different source identity', f => { f.graphical.sourceNote = {}; }, 'source-identity-mismatch'],
    ['missing renderer API', f => { f.graphical.getNoteheadSVGs = undefined; }, 'notehead-api-missing'],
    ['throwing renderer API', f => { f.graphical.getNoteheadSVGs = () => { throw Error('renderer unavailable'); }; }, 'renderer unavailable'],
    ['fractional index', f => { f.graphical.vfnoteIndex = .5; }, 'invalid-head-index'],
    ['inconsistent index', f => { f.graphical.vfnote[1] = 1; }, 'invalid-head-index'],
    ['negative index', f => { f.graphical.vfnoteIndex = -1; }, 'invalid-head-index'],
    ['missing head list', f => { f.graphical.getNoteheadSVGs = () => []; }, 'head-count-mismatch'],
    ['cardinality mismatch', f => { f.vf.note_heads.push({}); }, 'head-count-mismatch'],
    ['disconnected head', f => { f.heads[0].isConnected = false; }, 'rendered-head-missing'],
    ['head in another SVG', f => { f.heads[0].ownerSVGElement = {}; }, 'rendered-head-missing'],
    ['non-head SVG element', f => { f.heads[0].classList.contains = () => false; f.graphical.getNoteheadSVGs = () => f.heads; }, 'rendered-head-missing'],
    ['hidden source', f => { f.source.PrintObject = false; }, 'non-playable-note'],
    ['cue source', f => { f.source.isCueNote = true; }, 'non-playable-note'],
    ['none notehead', f => { f.source.Notehead = 'none'; }, 'non-playable-note'],
    ['rest', f => { f.source.isRest = () => true; }, 'non-playable-note'],
    ['hidden head', f => { f.heads[0].computed.visibility = 'hidden'; }, 'rendered-head-hidden'],
    ['hidden ancestor', f => { f.group.computed.display = 'none'; }, 'rendered-head-hidden'],
    ['transparent ancestor', f => { f.noteGroup.computed.opacity = '0'; }, 'rendered-head-hidden'],
    ['empty bounds', f => { f.heads[0].getBBox = () => ({ x: 1, y: 2, width: 0, height: 8 }); }, 'empty-head-bounds'],
    ['nonfinite bounds', f => { f.heads[0].getBBox = () => ({ x: NaN, y: 2, width: 12, height: 8 }); }, 'empty-head-bounds'],
    ['missing CTM', f => { f.heads[0].getScreenCTM = () => null; }, 'head-transform-missing'],
    ['nonfinite CTM', f => { f.heads[0].getScreenCTM = () => new Matrix(NaN); }, 'invalid-head-transform']
]) {
    check(`${label} records unavailable without changing the production point`, () => {
        const h = harness(); enable(h);
        const f = fixture(h); mutate(f);
        const anchor = Object.freeze({ x: 16, y: 24 });
        const row = compare(h, f, anchor);
        assert.equal(row.status, 'unavailable');
        assert.equal(row.reason, reason);
        assert.equal(row.directAnchor, null);
        assert.equal(row.delta, null);
        assert.deepEqual(plain(row.currentAnchor), anchor);
        assert.equal(h.engine.noteAnchorCache.has(f.source), false);
    });
}

check('singular root transforms are contained', () => {
    const h = harness(); enable(h);
    const f = fixture(h);
    h.root.getScreenCTM = () => new Matrix(0, 0, 0, 0);
    const row = compare(h, f);
    assert.equal(row.status, 'unavailable');
    assert.equal(row.reason, 'singular matrix');
});

check('missing current anchor reports evidence without filling the production cache', () => {
    const h = harness(); enable(h);
    const f = fixture(h);
    const row = compare(h, f, null);
    assert.equal(row.status, 'current-unavailable');
    assert.equal(row.currentAnchor, null);
    assert.equal(row.delta, null);
    assert.deepEqual(plain(row.directAnchor), { x: 16, y: 24 });
    assert.equal(h.engine.noteAnchorCache.has(f.source), false);
});

check('diagnostic difference threshold reports distance without adjusting anchors', () => {
    for (const [x, status] of [[16, 'aligned'], [15, 'aligned'], [14.9, 'different']]) {
        const h = harness(); enable(h);
        const row = compare(h, fixture(h), { x, y: 24 });
        assert.equal(row.status, status);
        assert.ok(Math.abs(row.delta.distance - Math.abs(16 - x)) < 1e-9);
        assert.equal(row.currentAnchor.x, x);
    }
});

check('deduplication is source identity based and retains distinct same-time notes', () => {
    const h = harness(); enable(h);
    const first = fixture(h), second = fixture(h);
    const original = compare(h, first);
    assert.equal(compare(h, first), original);
    assert.equal(h.debug.noteheadComparisons.length, 1);
    compare(h, second);
    assert.equal(h.debug.noteheadComparisons.length, 2);
    assert.deepEqual(plain(h.debug.noteheadComparisons[0].note), plain(h.debug.noteheadComparisons[1].note));
    first.graphical.getNoteheadSVGs = () => { throw Error('repeat observation must not reread geometry'); };
    assert.equal(compare(h, first), original);
});

check('records are bounded, evicted notes can be observed again, and snapshots contain no DOM/source objects', () => {
    const h = harness(); enable(h);
    const first = fixture(h);
    const original = compare(h, first);
    for (let i = 0; i < h.debug.comparisonLimit + 2; i++) compare(h, fixture(h));
    assert.equal(h.debug.noteheadComparisons.length, h.debug.comparisonLimit);
    assert.equal(h.debug.noteheadComparisons.includes(original), false);
    assert.notEqual(compare(h, first), original);
    assert.equal(h.debug.noteheadComparisons.length, h.debug.comparisonLimit);
    const visit = value => {
        assert.notEqual(value, first.source);
        assert.notEqual(value, first.graphical);
        assert.notEqual(value, first.heads[0]);
        if (value && typeof value === 'object') for (const child of Object.values(value)) visit(child);
    };
    visit(h.debug.noteheadComparisons.at(-1));
    assert.doesNotThrow(() => JSON.stringify(h.debug.noteheadComparisons));
});

check('render invalidation clears comparison state and allows fresh coordinates', () => {
    const h = harness(); enable(h);
    const f = fixture(h);
    const old = compare(h, f);
    h.engine.invalidate();
    assert.equal(h.debug.noteheadComparisons.length, 0);
    f.heads[0].getBBox = () => ({ x: 110, y: 120, width: 12, height: 8 });
    const fresh = compare(h, f);
    assert.notEqual(fresh, old);
    assert.deepEqual(plain(fresh.directAnchor), { x: 116, y: 124 });
});

check('enabling Debug reads existing source-note caches without resolving anchors or changing targets', () => {
    const h = harness();
    const first = fixture(h), second = fixture(h);
    const cached = Object.freeze({ x: 16, y: 24 });
    h.engine.noteAnchorCache.set(first.source, cached);
    const target = { sourceNotes: [first.source, first.source, second.source], staffId: 1, mIdx: 2, hit: true, anchor: cached };
    h.state.expectedNotes.push(target);
    const beforeScore = plain(h.state.score);
    h.context.getGraphicalNote = source => source === first.source ? first.graphical : second.graphical;
    h.engine.getNoteAnchor = () => { throw Error('Debug must not resolve production anchors'); };
    h.debug.setDebugEnabled(true, { logChange: false });
    assert.equal(h.debug.noteheadComparisons.length, 2);
    assert.equal(h.debug.noteheadComparisons[0].status, 'aligned');
    assert.equal(h.debug.noteheadComparisons[1].status, 'current-unavailable');
    assert.equal(h.engine.noteAnchorCache.get(first.source), cached);
    assert.equal(h.engine.noteAnchorCache.has(second.source), false);
    assert.equal(h.state.expectedNotes[0], target);
    assert.equal(target.hit, true);
    assert.deepEqual(h.state.score, beforeScore);
    assert.ok(h.layer.children.length > 0);
    h.debug.setDebugEnabled(false, { logChange: false });
    assert.equal(h.debug.noteheadComparisons.length, 0);
    assert.equal(h.layer.children.length, 0);
});

check('clearing sticky diagnostics removes comparison snapshots as well', () => {
    const h = harness(); enable(h);
    compare(h, fixture(h));
    h.context.window.clearStickyDebug();
    assert.equal(h.debug.noteheadComparisons.length, 0);
});

check('comparison drawing stays in the debug layer without changing the rendered head', () => {
    const h = harness(); enable(h);
    const f = fixture(h);
    const originalChildren = [...f.group.children];
    const originalHeadChildren = [...f.heads[0].children];
    compare(h, f, { x: 30, y: 40 });
    h.debug.renderNoteheadComparisons(h.layer);
    const record = h.layer.children[0];
    assert.equal(record.getAttribute('data-debug-kind'), 'notehead-comparison');
    assert.ok(record.children.some(node => node.getAttribute('data-feedback-comparison') === 'current'));
    assert.ok(record.children.some(node => node.getAttribute('data-feedback-comparison') === 'direct'));
    assert.deepEqual(f.group.children, originalChildren);
    assert.deepEqual(f.heads[0].children, originalHeadChildren);
});

check('a throwing observer cannot change freshly resolved or cached production anchors', () => {
    const h = harness(); enable(h);
    const f = fixture(h);
    h.context.getGraphicalNote = () => f.graphical;
    h.engine.getNoteheadShape = () => null;
    h.engine.getSafeFallbackAnchor = () => ({ x: 1, y: 2 });
    h.engine.getSvgNoteheadAnchor = () => ({ x: 16, y: 24 });
    h.debug.compareNotehead = () => { throw Error('injected observer failure'); };
    const anchor = h.engine.getNoteAnchor(f.source, 2, 0);
    assert.deepEqual(plain(anchor), { x: 16, y: 24, measureIndex: 2, staffIndex: 0 });
    assert.equal(h.engine.noteAnchorCache.get(f.source), anchor);
    assert.equal(h.engine.getNoteAnchor(f.source, 2, 0), anchor);
    h.debug.clearNoteheadComparisons = () => { throw Error('injected cleanup failure'); };
    assert.doesNotThrow(() => h.engine.invalidate());
    assert.equal(h.engine.noteAnchorCache.has(f.source), false);
});

check('an absent optional observer does not affect cached feedback', () => {
    const h = harness();
    const f = fixture(h);
    const anchor = { x: 16, y: 24 };
    h.engine.noteAnchorCache.set(f.source, anchor);
    h.context.window.FeedbackDebug = undefined;
    // Existing legacy logging wrappers are separate from the optional observer hook.
    h.context.debugLogAnchorResolution = () => {};
    h.context.describeLogicalNoteForDebug = () => ({});
    assert.equal(h.engine.getNoteAnchor(f.source, 2, 0), anchor);
});

check('a throwing observer enable check cannot interrupt production feedback', () => {
    const h = harness();
    const f = fixture(h);
    h.context.getGraphicalNote = () => f.graphical;
    h.engine.getNoteheadShape = () => null;
    h.engine.getSafeFallbackAnchor = () => ({ x: 1, y: 2 });
    h.engine.getSvgNoteheadAnchor = () => ({ x: 16, y: 24 });
    h.debug.isDebugEnabled = () => { throw Error('injected observer guard failure'); };
    const anchor = h.engine.getNoteAnchor(f.source, 2, 0);
    assert.deepEqual(plain(anchor), { x: 16, y: 24, measureIndex: 2, staffIndex: 0 });
    assert.equal(h.engine.getNoteAnchor(f.source, 2, 0), anchor);
});

check('Debug off does not repeat graphical lookup for an existing cached anchor', () => {
    const h = harness();
    const f = fixture(h);
    const anchor = { x: 16, y: 24 };
    h.engine.noteAnchorCache.set(f.source, anchor);
    h.context.getGraphicalNote = () => { throw Error('unexpected extra graphical lookup'); };
    assert.equal(h.engine.getNoteAnchor(f.source, 2, 0), anchor);
    assert.equal(h.debug.noteheadComparisons.length, 0);
});

console.log(`Feedback comparison passed: ${checks} isolated diagnostic checks.`);
