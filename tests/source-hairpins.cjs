const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// These adapters expose DOM element structure without installing a second XML parser.
// Browser diagnostics separately exercise real DOMParser, original MusicXML and MXL loading.
function element(name, children = [], attributes = {}, text = '') {
    return {
        nodeType: 1, localName: name, nodeName: name, children,
        get childNodes() { return children; },
        get textContent() { return text + children.map(child => child.textContent).join(''); },
        getAttribute(key) { return Object.hasOwn(attributes, key) ? String(attributes[key]) : null; }
    };
}
const text = (name, value) => element(name, [], {}, String(value));
const attributes = divisions => element('attributes', [text('divisions', divisions)]);
const note = (duration, flags = []) => element('note', [...flags.map(flag => element(flag)), text('duration', duration)]);
const move = (kind, duration) => element(kind, [text('duration', duration)]);
function wedge(type, options = {}) {
    const attrs = { type };
    if (options.number !== undefined) attrs.number = options.number;
    const children = [element('direction-type', [element('wedge', [], attrs)])];
    if (options.offset !== undefined) children.push(element('offset', [], options.sound === undefined ? {} : { sound: options.sound }, String(options.offset)));
    if (options.staff !== undefined) children.push(text('staff', options.staff));
    return element('direction', children, options.defaultX === undefined ? {} : { 'default-x': options.defaultX });
}
const measure = (children, number = '1') => element('measure', children, { number });
const part = (id, measures) => element('part', measures, { id });
const document = parts => ({ documentElement: element('score-partwise', [
    element('part-list', parts.map(p => element('score-part', [], { id: p.getAttribute('id') }))), ...parts
]) });
const registered = new Map();
let nextDocument = 1;
function xml(doc) { const key = '<test-document-' + nextDocument++ + '/>'; registered.set(key, doc); return key; }
class DOMParser {
    parseFromString(source, type) {
        assert.equal(type, 'application/xml');
        return registered.get(source) || { documentElement: element('parsererror') };
    }
}
global.self = global;
const OSMD = require('../assets/js/opensheetmusicdisplay.min.js');
const context = vm.createContext({ DOMParser, opensheetmusicdisplay: OSMD });
context.window = context;
vm.runInContext(fs.readFileSync('js/score-expression-source.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/score-expression.js', 'utf8'), context);
const read = context.ScoreExpressionSource.read;
let assertions = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); assertions++; }
const fraction = value => ({ RealValue: value });
function sheet(parts = [['P1', 1]], starts = [0], lengths = starts.map(() => 1)) {
    const value = { Staves: [], Instruments: [], SourceMeasures: starts.map((start, index) => ({
        AbsoluteTimestamp: fraction(start), Duration: fraction(lengths[index]), StaffLinkedExpressions: []
    })) };
    for (const [id, count] of parts) {
        const instrument = { IdString: id, Staves: [] };
        for (let index = 0; index < count; index++) {
            const staff = { ParentInstrument: instrument, Id: index + 1 };
            instrument.Staves.push(staff); value.Staves.push(staff);
        }
        value.Instruments.push(instrument);
    }
    return value;
}
const span = (timestamp, endTimestamp, direction = 1) => ({ timestamp, endTimestamp, direction });
function rows(result) { return result === null ? null : JSON.parse(JSON.stringify([...result])); }
function expectRead(score, doc, expected, message) { equal(rows(read(score, xml(doc))), expected, message); }
function one(children, number = '1') { return document([part('P1', [measure(children, number)])]); }
const basic = [attributes(4), wedge('crescendo'), note(4), wedge('stop')];

expectRead(sheet(), one(basic), [[0, [span(0, .25)]]], 'Default wedge number and source duration give a positive span');
expectRead(sheet(), one([
    attributes(4), wedge('crescendo'), note(4), note(999, ['chord']), note(999, ['grace']), note(4),
    move('backup', 8), move('forward', 4), wedge('stop', { offset: 4, sound: 'yes' })
]), [[0, [span(0, .5)]]], 'Chord/grace do not advance source clock; backup/forward and playback offset do');
expectRead(sheet(), one([
    attributes(4), wedge('crescendo'), note(4), attributes(8), note(8), wedge('stop')
]), [[0, [span(0, .5)]]], 'Divisions changes apply to subsequent durations');
expectRead(sheet(), one([
    attributes(4), wedge('crescendo', { offset: 4, sound: 'yes' }), note(12),
    wedge('stop', { offset: -4, sound: 'yes' })
]), [[0, [span(.25, .5)]]], 'Positive and negative sound=yes offsets affect boundaries exactly once');
for (const sound of [undefined, 'no']) {
    expectRead(sheet(), one([
        attributes(4), wedge('crescendo', { offset: 4, sound, defaultX: 500 }), note(4),
        wedge('stop', { offset: 4, sound })
    ]), [[0, [span(0, .25)]]], 'Visual-only offsets and default-x do not change playback time');
}
expectRead(sheet([['P1', 1]], [0, .125], [.125, 1]), document([part('P1', [
    measure([attributes(4), wedge('crescendo'), note(2)], '0'),
    measure([note(4), wedge('stop')], '42')
])]), [[0, [span(0, .375)]]], 'Pickup and arbitrary printed numbers use OSMD measure starts and carried divisions');
expectRead(sheet([['P1', 1]], [10, 12], [1, 1]), document([part('P1', [
    measure([attributes(4), wedge('diminuendo'), note(4)]), measure([note(4), wedge('stop')])
])]), [[0, [span(10, 12.25, -1)]]], 'Cross-measure endpoints use OSMD absolute starts, not accumulated XML lengths');

const twoParts = sheet([['P1', 2], ['P2', 1]]);
expectRead(twoParts, document([
    part('P2', [measure([attributes(4), wedge('diminuendo'), note(4), wedge('stop')])]),
    part('P1', [measure([attributes(4), wedge('crescendo', { staff: 2 }), note(8), wedge('stop', { staff: 1 })])])
]), [[2, [span(0, .25, -1)]], [0, []], [1, [span(0, .5)]]], 'Part IDs survive reordered XML; cross-staff stop retains starting staff');
expectRead(sheet(), one([
    attributes(4), wedge('crescendo', { number: 1 }), note(4), wedge('continue', { number: 1 }),
    wedge('diminuendo', { number: 2 }), note(4), wedge('stop', { number: 1 }), note(4), wedge('stop', { number: 2 })
]), [[0, [span(0, .5), span(.25, .75, -1)]]], 'Numbered overlapping wedges pair independently; continue does not restart');
expectRead(sheet(), one([
    attributes(4), wedge('crescendo'), note(4), wedge('stop'), wedge('diminuendo'), note(4), wedge('stop')
]), [[0, [span(0, .25), span(.25, .5, -1)]]], 'Adjacent wedges can reuse the default number at the same boundary');
expectRead(sheet(), one([
    attributes(4), note(8), wedge('stop'), move('backup', 8), wedge('crescendo')
]), [[0, [span(0, .5)]]], 'Voice backups can place paired instructions out of source-time order');
expectRead(sheet([['P1', 2]]), one([attributes(4), note(4)]), [[0, []], [1, []]], 'Valid source with no wedges explicitly covers each mapped staff');

// Invalid parts fall back to OSMD rather than publishing a partial or shifted source timeline.
const invalidParts = [
    [wedge('crescendo'), note(4), wedge('stop')],
    [attributes(0), wedge('crescendo'), note(4), wedge('stop')],
    [attributes(4), wedge('crescendo'), note(-1), wedge('stop')],
    [attributes(4), wedge('crescendo'), note('bad'), wedge('stop')],
    [attributes(4), move('backup', 4), wedge('crescendo'), note(4), wedge('stop')],
    [attributes(4), wedge('crescendo'), move('forward', 20), wedge('stop')],
    [attributes(4), wedge('crescendo'), note(20), wedge('stop')],
    [attributes(4), wedge('crescendo', { staff: 2 }), note(4), wedge('stop')],
    [attributes(4), wedge('crescendo', { number: 0 }), note(4), wedge('stop')],
    [attributes(4), wedge('crescendo'), note(4), wedge('crescendo'), note(4), wedge('stop')],
    [attributes(4), note(4), wedge('stop')],
    [attributes(4), wedge('crescendo'), note(4)],
    [attributes(4), wedge('crescendo'), wedge('stop')],
    [attributes(4), wedge('crescendo', { offset: 'bad', sound: 'yes' }), note(4), wedge('stop')],
    [attributes(4), wedge('crescendo', { offset: -4, sound: 'yes' }), note(4), wedge('stop')],
    [attributes(4), wedge('crescendo'), note(4), wedge('stop', { offset: 20, sound: 'yes' })]
];
for (const [index, children] of invalidParts.entries()) expectRead(sheet(), one(children), null, 'Invalid source part ' + index + ' is omitted');
expectRead(sheet(), document([part('P1', [measure(basic), measure([])])]), null, 'Measure count mismatch cannot shift later expression boundaries');
expectRead(sheet(), document([part('Unknown', [measure(basic)])]), null, 'Unmapped part does not borrow another instrument staff');
expectRead(sheet(), document([part('P1', [measure(basic)]), part('P1', [measure(basic)])]), null, 'Duplicate XML part IDs are ambiguous and fall back');
expectRead(sheet([['P1', 1], ['P1', 1]]), one(basic), null, 'Duplicate instrument IDs are ambiguous and fall back');
expectRead(sheet([['P1', 1], ['P2', 1]]), document([
    part('P1', [measure([attributes(4), wedge('crescendo')])]), part('P2', [measure(basic)])
]), [[1, [span(0, .25)]]], 'One invalid part does not remove an independent valid part');
const missingDuration = sheet(); delete missingDuration.SourceMeasures[0].Duration;
expectRead(missingDuration, one(basic), null, 'Unknown OSMD measure duration rejects an unsafe mapping');
const missingStaff = sheet(); missingStaff.Instruments[0].Staves = [{}];
expectRead(missingStaff, one(basic), null, 'Staff identity mismatch rejects an unsafe mapping');
equal(read(sheet(), ''), null, 'Empty XML falls back');
equal(read(sheet(), '<broken'), null, 'Malformed XML falls back');
expectRead(sheet(), { documentElement: element('score-timewise') }, null, 'Unsupported root falls back');
expectRead(sheet(), { documentElement: element('score-partwise', [element('parsererror')]) }, null, 'Nested XML parser error falls back');

function freeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value); for (const child of Object.values(value)) freeze(child, seen); Object.freeze(value);
}
const frozenScore = sheet(), frozenDoc = one(basic);
freeze(frozenScore); freeze(frozenDoc);
expectRead(frozenScore, frozenDoc, [[0, [span(0, .25)]]], 'Frozen sheet and source metadata remain untouched');

// Bind the XML spans into the actual expression resolver; malformed/replaced sources clear old caches.
const bind = (score, doc) => context.ScoreExpression.bindSource(score, doc ? xml(doc) : null);
function fixed(score, at, enumValue) {
    score.SourceMeasures[0].StaffLinkedExpressions[0] ||= [];
    score.SourceMeasures[0].StaffLinkedExpressions[0].push({ AbsoluteTimestamp: fraction(at), InstantaneousDynamic: { DynEnum: enumValue } });
}
function collapsed(score, at, direction) {
    const boundary = { AbsoluteTimestamp: fraction(at) };
    const value = { DynamicType: direction === 1 ? 0 : 1, StartMultiExpression: boundary, EndMultiExpression: boundary, isWedge: () => true };
    score.SourceMeasures[0].StaffLinkedExpressions[0] ||= [];
    score.SourceMeasures[0].StaffLinkedExpressions[0].push({ AbsoluteTimestamp: fraction(at), StartingContinuousDynamic: value });
}
function expression(score, at, articulations = [], tied = false) {
    const source = { ParentStaffEntry: { ParentStaff: score.Staves[0], AbsoluteTimestamp: fraction(at) },
        ParentVoiceEntry: { Articulations: articulations.map(name => ({ articulationEnum: OSMD.ArticulationEnum[name] })) } };
    if (tied) source.NoteTie = { StartNote: source };
    return JSON.parse(JSON.stringify(context.ScoreExpression.resolve(source, score)));
}
const recovered = [
    { base: 7.625, start: .75, end: 1.125, type: 'diminuendo', level: 8, expected: [104, 96, 88] },
    { base: 25.625, start: 1.125, end: 1.5, type: 'crescendo', level: 5, target: 8, expected: [56, 80, 104] },
    { base: 30.125, start: .75, end: 1, type: 'diminuendo', level: 8, expected: [104, 96, 88] },
    { base: 43.625, start: 1, end: 1.25, type: 'diminuendo', level: 8, expected: [104, 96, 88] }
];
for (const item of recovered) {
    const score = sheet([['P1', 1]], [item.base], [1.5]);
    fixed(score, item.base, item.level); if (item.target) fixed(score, item.base + item.end, item.target);
    collapsed(score, item.base + item.start, item.type === 'crescendo' ? 1 : -1);
    equal(expression(score, item.base + (item.start + item.end) / 2).velocity, item.expected[0], 'Collapsed OSMD span reproduces absent ramp');
    const source = one([attributes(8), note(item.start * 32), wedge(item.type), note((item.end - item.start) * 32), wedge('stop')]);
    bind(score, source);
    for (const [at, velocity] of [[item.start, item.expected[0]], [(item.start + item.end) / 2, item.expected[1]], [item.end, item.expected[2]], [(item.start + item.end) / 2, item.expected[1]]]) {
        equal(expression(score, item.base + at).velocity, velocity, 'Recovered span and backward query at ' + (item.base + at));
    }
    equal(expression(score, item.base + (item.start + item.end) / 2, ['staccato'], true).gate, .9, 'Recovered expression leaves tied sustain intact');
    equal(expression(score, item.base + (item.start + item.end) / 2, ['staccato']).gate, .5, 'Recovered expression leaves staccato rule intact');
    bind(score, null);
    equal(expression(score, item.base + (item.start + item.end) / 2).velocity, item.expected[0], 'Clearing binding invalidates source and resolver caches');
}
const rebound = sheet(); fixed(rebound, 0, 5); collapsed(rebound, 0, 1);
bind(rebound, one(basic));
equal(expression(rebound, .125).velocity, 64, 'Initial source binding supplies ramp');
bind(rebound, one([attributes(4), wedge('diminuendo'), note(8), wedge('stop')]));
equal(expression(rebound, .125).velocity, 52, 'Replacing source recomputes ramp without old cached values');
bind(rebound, { documentElement: element('parsererror') });
equal(expression(rebound, .125).velocity, 56, 'Malformed replacement clears former source ramp');
const otherSheet = sheet(); fixed(otherSheet, 0, 5);
equal(expression(otherSheet, .125).velocity, 56, 'Another sheet never inherits source metadata');
equal(expression(otherSheet, .125, ['accent']).velocity, 80, 'Requested accent strength is +24 independently of source recovery');
for (const label of ['', 'cresc.']) {
    const parsed = sheet(); fixed(parsed, 0, 5);
    const begin = { AbsoluteTimestamp: fraction(0) }, end = { AbsoluteTimestamp: fraction(.5) };
    begin.StartingContinuousDynamic = { DynamicType: 0, StartMultiExpression: begin, EndMultiExpression: end, Label: label };
    parsed.SourceMeasures[0].StaffLinkedExpressions[0].push(begin);
    bind(parsed, one([attributes(4), note(16)]));
    equal(expression(parsed, .25).velocity, label ? 64 : 56, 'Covered source staff replaces parsed wedges but retains separate text dynamics');
    bind(parsed, null);
    equal(expression(parsed, .25).velocity, 64, 'Cleared binding restores existing parsed-span fallback');
}

console.log(`Source hairpins: ${assertions} assertions passed (actual parser/resolver, DOM structure adapters and frozen score metadata). Real XML parsing, browser timing, listening and hardware checks are separate.`);
