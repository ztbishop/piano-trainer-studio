const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the real resolver with bundled OSMD source classes, independent of playback history.
global.self = global;
const OSMD = require('../assets/js/opensheetmusicdisplay.min.js');
const context = vm.createContext({ window: { opensheetmusicdisplay: OSMD } });
vm.runInContext(fs.readFileSync('js/score-expression.js', 'utf8'), context);
const resolve = context.window.ScoreExpression.resolve;
const fraction = value => new OSMD.Fraction(Math.round(value * 10000), 10000);
let assertions = 0;
function equal(actual, expected, message) {
    assert.equal(actual, expected, message);
    assertions++;
}
function fixture(staffCount = 1) {
    const instrument = { Visible: true };
    const sheet = { Staves: Array.from({ length: staffCount }, (_, index) => new OSMD.Staff(instrument, index + 1)), SourceMeasures: [] };
    for (let index = 0; index < 6; index++) {
        const measure = new OSMD.SourceMeasure(staffCount, {});
        measure.AbsoluteTimestamp = fraction(index);
        sheet.SourceMeasures.push(measure);
    }
    return sheet;
}
function add(sheet, at, staffIndex, expression) {
    (sheet.SourceMeasures[Math.max(0, Math.min(5, Math.floor(at)))].StaffLinkedExpressions[staffIndex] ||= []).push(expression);
    return expression;
}
function dynamic(sheet, at, enumValue, staffIndex = 0) {
    return add(sheet, at, staffIndex, { AbsoluteTimestamp: fraction(at), InstantaneousDynamic: { DynEnum: enumValue } });
}
function hairpin(sheet, start, end, type = 0, staffIndex = 0, offset) {
    const first = { AbsoluteTimestamp: fraction(start) };
    const last = { AbsoluteTimestamp: fraction(end) };
    if (offset !== undefined) last.EndOffsetFraction = { RealValue: offset };
    first.StartingContinuousDynamic = { DynamicType: type, StartMultiExpression: first, EndMultiExpression: last };
    add(sheet, start, staffIndex, first);
    return first;
}
function note(sheet, at, staffIndex = 0, articulations = []) {
    const measureIndex = Math.floor(at);
    const measure = sheet.SourceMeasures[measureIndex];
    const container = new OSMD.VerticalSourceStaffEntryContainer(measure, fraction(at - measureIndex), sheet.Staves.length);
    const staffEntry = new OSMD.SourceStaffEntry(container, sheet.Staves[staffIndex]);
    const voice = new OSMD.Voice(sheet.Staves[staffIndex].ParentInstrument, 1);
    const voiceEntry = new OSMD.VoiceEntry(fraction(at - measureIndex), voice, staffEntry);
    voiceEntry.Articulations = articulations.map(name => ({ articulationEnum: OSMD.ArticulationEnum[name] }));
    return new OSMD.Note(voiceEntry, staffEntry, fraction(0.25), undefined, measure, false);
}
function expect(sheet, at, velocity, staffIndex = 0, articulations = [], tied = false) {
    const source = note(sheet, at, staffIndex, articulations);
    if (tied) source.NoteTie = { StartNote: source };
    const result = resolve(source, sheet);
    equal(result.velocity, velocity, `velocity at ${at}, staff ${staffIndex}`);
    const staccato = articulations.includes('staccato') && !tied;
    equal(result.gate, staccato ? 0.5 : 0.9, 'expression does not alter ordinary/tied gate');
    equal(result.staccato, staccato, 'only supported untied staccato shortens output');
    equal(source.Length.RealValue, 0.25, 'source musical duration remains unchanged');
}

// Explicit ending dynamics set the target, including a fixed mark before the wedge's drawn end.
const explicit = fixture();
dynamic(explicit, 0, 5); // p=56
hairpin(explicit, 0, 2);
dynamic(explicit, 1, 7); // mf=88 truncates the ramp at 1
for (const [at, velocity] of [[0, 56], [0.25, 64], [0.5, 72], [0.75, 80], [1, 88], [1.5, 88], [4, 88], [0.5, 72]]) expect(explicit, at, velocity);
const descending = fixture();
dynamic(descending, 0, 8); // f=104
hairpin(descending, 0.5, 2.5, 1);
dynamic(descending, 2.5, 4); // pp=40
for (const [at, velocity] of [[0.25, 104], [0.5, 104], [1, 88], [1.5, 72], [2, 56], [2.5, 40], [3, 40]]) expect(descending, at, velocity);

// No endpoint level uses a modest +/-16, holds afterward, and does not borrow a distant marking.
const fallback = fixture();
dynamic(fallback, 0, 5);
hairpin(fallback, 0.5, 1.5);
dynamic(fallback, 3, 8);
for (const [at, velocity] of [[0, 56], [0.5, 56], [0.75, 60], [1, 64], [1.5, 72], [2, 72], [3, 104], [0.75, 60]]) expect(fallback, at, velocity);
const noStartingMark = fixture();
hairpin(noStartingMark, 0, 1, 1);
for (const [at, velocity] of [[0, 100], [0.5, 92], [1, 84], [3, 84]]) expect(noStartingMark, at, velocity);

// Paired wedges meet without a jump; later overlaps begin at the prior ramp's current value.
const paired = fixture();
dynamic(paired, 0, 5);
hairpin(paired, 0, 1);
hairpin(paired, 1, 2, 1);
for (const [at, velocity] of [[0, 56], [0.5, 64], [1, 72], [1.5, 64], [2, 56], [3, 56]]) expect(paired, at, velocity);
const overlapping = fixture();
dynamic(overlapping, 0, 5);
hairpin(overlapping, 0, 2);
hairpin(overlapping, 1, 2, 1);
for (const [at, velocity] of [[0.5, 60], [1, 64], [1.5, 56], [2, 48], [3, 48]]) expect(overlapping, at, velocity);

// A conflicting fixed target does not reverse the wedge; the explicit mark wins at its own onset.
const contradictory = fixture();
dynamic(contradictory, 0, 5);
hairpin(contradictory, 0, 2);
dynamic(contradictory, 1, 4);
for (const [at, velocity] of [[0, 56], [0.5, 60], [0.75, 62], [1, 40], [1.5, 40], [2, 40]]) expect(contradictory, at, velocity);
const equalTarget = fixture();
dynamic(equalTarget, 0, 5);
hairpin(equalTarget, 0, 2);
dynamic(equalTarget, 1, 5);
expect(equalTarget, 0.5, 56);
expect(equalTarget, 1.5, 56);

// Source timestamps span barlines and ignore query order (seek/repeat behavior).
const crossbar = fixture();
dynamic(crossbar, 0, 5);
hairpin(crossbar, 1.5, 3.5);
for (const [at, velocity] of [[3.5, 72], [1, 56], [2.5, 64], [2, 60], [3, 68], [1.5, 56], [2.5, 64]]) expect(crossbar, at, velocity);

// Bounds apply to fallback dynamics, while accented attacks may still reach MIDI 127.
for (const [enumValue, type, mid, end] of [[3, 1, 28, 28], [10, 0, 124, 124], [9, 0, 120, 124], [4, 1, 34, 28]]) {
    const score = fixture();
    dynamic(score, 0, enumValue);
    hairpin(score, 0, 2, type);
    expect(score, 1, mid);
    expect(score, 2, end);
    expect(score, 3, Math.min(127, end + 15), 0, ['accent']);
}
expect(fallback, 1, 79, 0, ['accent']);
expect(fallback, 1, 64, 0, ['staccato']);
expect(fallback, 1, 79, 0, ['accent', 'staccato']);
expect(fallback, 1, 79, 0, ['accent', 'staccato'], true);
expect(fallback, 1, 64, 0, ['tenuto', 'staccatissimo']);

// Fixed marks are processed before same-onset hairpins, independent of source collection order.
const sameOnset = fixture();
hairpin(sameOnset, 1, 2);
dynamic(sameOnset, 1, 4);
dynamic(sameOnset, 0, 8);
expect(sameOnset, 1, 40);
expect(sameOnset, 1.5, 48);
expect(sameOnset, 2, 56);

// Staff inheritance follows the live ramp only before that staff's first own expression.
const piano = fixture(2);
dynamic(piano, 0, 5);
hairpin(piano, 0, 2);
hairpin(piano, 1, 2, 1, 1); // inherits 64, then establishes this staff's own direction
dynamic(piano, 3, 8);
for (const [at, upper, lower] of [[0, 56, 56], [0.5, 60, 60], [1, 64, 64], [1.5, 68, 56], [2, 72, 48], [3, 104, 48], [0.5, 60, 60]]) {
    expect(piano, at, upper, 0);
    expect(piano, at, lower, 1);
}
const independent = fixture(2);
dynamic(independent, 0, 5, 0);
dynamic(independent, 0, 4, 1);
hairpin(independent, 0, 2, 0, 0);
expect(independent, 1, 64, 0);
expect(independent, 1, 40, 1);
const conflicts = fixture(3);
dynamic(conflicts, 0, 5, 0);
dynamic(conflicts, 0, 5, 1);
hairpin(conflicts, 0, 2, 0, 0);
hairpin(conflicts, 0, 2, 1, 1);
expect(conflicts, 0, 56, 2);
expect(conflicts, 1, 100, 2);
expect(conflicts, 2, 100, 2);
const separateParts = fixture(2);
separateParts.Staves[1] = new OSMD.Staff({ Visible: true }, 1);
dynamic(separateParts, 0, 5);
hairpin(separateParts, 0, 1);
expect(separateParts, 0.5, 64, 0);
expect(separateParts, 0.5, 100, 1);

// Bad/missing metadata and synthetic zero-duration soft accents cannot change output.
for (const mutate of [
    span => { delete span.StartMultiExpression; },
    span => { delete span.EndMultiExpression; },
    span => { span.StartMultiExpression.AbsoluteTimestamp = { RealValue: NaN }; },
    span => { span.EndMultiExpression.AbsoluteTimestamp = { RealValue: Infinity }; },
    span => { span.EndMultiExpression.AbsoluteTimestamp = fraction(0.5); },
    span => { span.EndMultiExpression.AbsoluteTimestamp = fraction(0); },
    span => { span.DynamicType = 2; },
    span => { span.DynamicType = '0'; },
    span => { span.EndMultiExpression.EndOffsetFraction = { RealValue: Infinity }; },
    span => { span.EndMultiExpression.EndOffsetFraction = { RealValue: -2 }; }
]) {
    const score = fixture();
    dynamic(score, 0, 5);
    mutate(hairpin(score, 0.5, 1).StartingContinuousDynamic);
    expect(score, 0.75, 56);
    expect(score, 2, 56);
}

// Duplicate references and text labels do not create an extra step; frozen OSMD input stays untouched.
const frozen = fixture();
dynamic(frozen, 0, 5);
const shared = hairpin(frozen, 0, 2);
shared.StartingContinuousDynamic.Label = 'cresc.';
add(frozen, 1, 0, shared);
frozen.SourceMeasures[0].StaffLinkedExpressions[0].reverse();
const target = note(frozen, 1, 0, ['accent']);
function freeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    Object.values(value).forEach(child => freeze(child, seen));
    Object.freeze(value);
}
freeze(frozen);
freeze(target);
equal(resolve(target, frozen).velocity, 79, 'frozen metadata resolves the ramp and accent');
equal(frozen.SourceMeasures[0].StaffLinkedExpressions[0][0], shared, 'source collection order is preserved');
equal(shared.StartingContinuousDynamic.EndMultiExpression.AbsoluteTimestamp.RealValue, 2, 'span endpoint is not rewritten');
expect(frozen, 3, 72);

// Parse stop offsets through the actual bundled reader: OSMD stores them separately from AbsoluteTimestamp.
function xmlNode(name, value = '', attrs = {}, children = []) {
    return { name, value, hasAttributes: Object.keys(attrs).length > 0,
        attributes: () => Object.keys(attrs).map(key => ({ name: key, value: attrs[key] })),
        attribute: key => key in attrs ? { name: key, value: attrs[key] } : undefined,
        element: key => children.find(child => child.name === key),
        elements: key => children.filter(child => child.name === key) };
}
for (const offset of [0, 4, -4]) {
    const score = fixture();
    const instrument = score.Staves[0].ParentInstrument;
    instrument.Staves = score.Staves;
    score.getGlobalStaffIndexOfFirstStaff = () => 0;
    score.SheetErrors = { pushMeasureError: message => assert.fail(message) };
    const reader = new OSMD.ExpressionReader(score, instrument, 1);
    const measure = score.SourceMeasures[2];
    dynamic(score, 2, 5);
    const start = xmlNode('direction', '', {}, [xmlNode('direction-type', '', {}, [xmlNode('wedge', '', { type: 'crescendo', number: '1' })])]);
    reader.readExpressionParameters(start, instrument, 4, fraction(0), fraction(0), undefined, false);
    reader.read(start, measure, fraction(0), fraction(0));
    const stop = xmlNode('direction', '', {}, [xmlNode('direction-type', '', {}, [xmlNode('wedge', '', { type: 'stop', number: '1' })]), xmlNode('offset', String(offset))]);
    reader.readExpressionParameters(stop, instrument, 4, fraction(0.5), fraction(0.25), undefined, false);
    reader.read(stop, measure, fraction(0.5), fraction(0.5));
    const span = measure.StaffLinkedExpressions[0].find(expression => expression.StartingContinuousDynamic).StartingContinuousDynamic;
    const end = 2.5 + offset / 16;
    equal(span.StartMultiExpression.AbsoluteTimestamp.RealValue, 2, 'reader preserves start source position');
    equal(span.EndMultiExpression.AbsoluteTimestamp.RealValue, 2.5, 'reader endpoint omits stop offset');
    equal(span.EndMultiExpression.EndOffsetFraction.RealValue, offset / 16, 'reader stores stop offset separately');
    expect(score, 2, 56);
    expect(score, (2 + end) / 2, 64);
    expect(score, end, 72);
    expect(score, 4, 72);
}

console.log(`Hairpin expression: ${assertions} assertions passed (bundled note/staff/reader classes; synthetic expression metadata and XML adapters). Browser, listening and hardware acceptance are separate.`);
