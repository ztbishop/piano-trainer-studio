const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Use the bundled staff/note/fraction classes; expression adapters are checked against parsed XML in the browser harness.
global.self = global;
const OSMD = require('../assets/js/opensheetmusicdisplay.min.js');
const context = vm.createContext({ window: { opensheetmusicdisplay: OSMD } });
vm.runInContext(fs.readFileSync('js/score-expression.js', 'utf8'), context);
const resolve = context.window.ScoreExpression.resolve;
const fraction = value => new OSMD.Fraction(Math.round(value * 10000), 10000);
let assertions = 0;
function expect(note, sheet, velocity, gate = 0.9, staccato = false) {
    const result = resolve(note, sheet);
    assert.equal(result.velocity, velocity);
    assert.equal(result.gate, gate);
    assert.equal(result.staccato, staccato);
    assertions += 3;
}
function fixture(staffCount = 2) {
    const instrument = { Visible: true };
    const sheet = { Staves: Array.from({ length: staffCount }, (_, i) => new OSMD.Staff(instrument, i + 1)), SourceMeasures: [] };
    for (let index = 0; index < 4; index++) {
        const measure = new OSMD.SourceMeasure(staffCount, {});
        measure.AbsoluteTimestamp = fraction(index);
        sheet.SourceMeasures.push(measure);
    }
    return sheet;
}
function dynamic(sheet, measureIndex, staffIndex, offset, enumValue) {
    const measure = sheet.SourceMeasures[measureIndex];
    const expression = { AbsoluteTimestamp: fraction(measureIndex + offset), InstantaneousDynamic: { DynEnum: enumValue } };
    (measure.StaffLinkedExpressions[staffIndex] ||= []).push(expression);
    return expression;
}
function note(sheet, measureIndex, offset, staffIndex = 0, articulations = []) {
    const measure = sheet.SourceMeasures[measureIndex];
    const container = new OSMD.VerticalSourceStaffEntryContainer(measure, fraction(offset), sheet.Staves.length);
    const staffEntry = new OSMD.SourceStaffEntry(container, sheet.Staves[staffIndex]);
    const voice = new OSMD.Voice(sheet.Staves[staffIndex].ParentInstrument, 1);
    const voiceEntry = new OSMD.VoiceEntry(fraction(offset), voice, staffEntry);
    voiceEntry.Articulations = articulations.map(name => ({ articulationEnum: OSMD.ArticulationEnum[name] }));
    return new OSMD.Note(voiceEntry, staffEntry, fraction(0.25), undefined, measure, false);
}

// Fixed levels work independently of playback history, including exact boundaries and staff inheritance.
const sheet = fixture();
dynamic(sheet, 0, 0, 0.25, 5); // p
dynamic(sheet, 0, 0, 0.75, 8); // f
dynamic(sheet, 2, 0, 0, 9); // ff
dynamic(sheet, 0, 1, 0, 4); // pp on the other staff
dynamic(sheet, 1, 1, 0.5, 7); // mf
for (const [measure, offset, velocity] of [[2, 0, 116], [0, 0, 40], [0, 0.5, 56], [0, 0.75, 104], [1, 0.75, 104], [0, 0.2499, 40], [0, 0.25, 56], [3, 0.5, 116], [0, 0, 40]]) {
    expect(note(sheet, measure, offset), sheet, velocity);
}
expect(note(sheet, 0, 0, 1), sheet, 40);
expect(note(sheet, 1, 0.25, 1), sheet, 40);
expect(note(sheet, 1, 0.5, 1), sheet, 88);
expect(note(sheet, 3, 0, 1), sheet, 88);

// Every supported fixed symbol, with accented clipping at the top of the MIDI range.
for (const [enumValue, velocity] of [[3, 28], [4, 40], [5, 56], [6, 72], [7, 88], [8, 104], [9, 116], [10, 124]]) {
    const score = fixture(1);
    dynamic(score, 0, 0, 0, enumValue);
    expect(note(score, 0, 0), score, velocity);
    expect(note(score, 0, 0, 0, ['accent']), score, Math.min(127, velocity + 15));
}
expect(note(sheet, 0, 0.5, 0, ['accent', 'accent']), sheet, 71); // A duplicated marking is one accent.
expect(note(sheet, 0, 0.5, 0, ['staccato']), sheet, 56, 0.5, true);
expect(note(sheet, 0, 0.5, 0, ['staccato', 'accent']), sheet, 71, 0.5, true);
expect(note(sheet, 0, 0.5, 0, ['fermata', 'tenuto', 'staccatissimo']), sheet, 56);
const tiedStart = note(sheet, 0, 0.5, 0, ['staccato', 'accent']);
tiedStart.NoteTie = { StartNote: tiedStart };
expect(tiedStart, sheet, 71);
const tiedContinuation = note(sheet, 1, 0, 0, ['staccato']);
tiedContinuation.NoteTie = tiedStart.NoteTie;
expect(tiedContinuation, sheet, 104); // The existing playback loop excludes this attack; the resolver never shortens it.

// Each score gets its own staff identity and cache; foreign/missing staff data cannot leak dynamics.
const unmarked = fixture();
expect(note(unmarked, 0, 0), unmarked, 100);
expect(note(unmarked, 0, 0), sheet, 100);
expect(note(unmarked, 0, 0, 0, ['accent']), unmarked, 115);
expect(null, null, 100);
expect({}, sheet, 100);
expect({ ParentStaffEntry: { ParentStaff: sheet.Staves[0], AbsoluteTimestamp: { RealValue: NaN } } }, sheet, 100);

// Reused local staff IDs in separate parts must not merge expression state.
const parts = fixture(2);
parts.Staves[1] = new OSMD.Staff({ Visible: true }, 1);
dynamic(parts, 0, 0, 0, 5);
dynamic(parts, 0, 1, 0, 9);
expect(note(parts, 0, 0, 0), parts, 56);
expect(note(parts, 0, 0, 1), parts, 116);
const crossing = note(parts, 0, 0.5, 1);
crossing.ParentVoiceEntry.parentSourceStaffEntry = note(parts, 0, 0.5, 0).ParentStaffEntry;
expect(crossing, parts, 116); // Use the note's source staff, not its performance voice/hand.

// A common grand-staff dynamic is inherited only until the other staff has an explicit mark.
const piano = fixture();
dynamic(piano, 0, 0, 0.25, 5);
dynamic(piano, 1, 0, 0, 9);
dynamic(piano, 1, 1, 0.5, 6);
dynamic(piano, 2, 0, 0, 10);
expect(note(piano, 0, 0, 1), piano, 100);
expect(note(piano, 0, 0.25, 1), piano, 56);
expect(note(piano, 1, 0.25, 1), piano, 116);
expect(note(piano, 1, 0.5, 1), piano, 72);
expect(note(piano, 3, 0, 1), piano, 72);
expect(note(piano, 0, 0.25, 1), piano, 56); // Seek back before the own-staff mark.
const lowerOnly = fixture();
dynamic(lowerOnly, 0, 1, 0, 6);
expect(note(lowerOnly, 0, 0, 0), lowerOnly, 72);

// A third unmarked staff must not choose arbitrarily between simultaneous conflicting siblings.
const threeStaves = fixture(3);
dynamic(threeStaves, 0, 0, 0, 5);
dynamic(threeStaves, 0, 1, 0, 9);
dynamic(threeStaves, 1, 0, 0, 7);
dynamic(threeStaves, 2, 0, 0, 6);
dynamic(threeStaves, 2, 1, 0, 6);
expect(note(threeStaves, 0, 0.5, 2), threeStaves, 100);
expect(note(threeStaves, 1, 0, 2), threeStaves, 88);
expect(note(threeStaves, 2, 0, 2), threeStaves, 72);
expect(note(threeStaves, 0, 0.5, 2), threeStaves, 100);
const separateParts = fixture(2);
separateParts.Staves[1] = new OSMD.Staff({ Visible: true }, 1);
dynamic(separateParts, 0, 0, 0, 5);
expect(note(separateParts, 0, 0, 1), separateParts, 100);

// Incomplete hairpins and compound attacks (sfz/fp/etc.) cannot become accidental persistent fixed dynamics.
const unsupported = fixture(1);
dynamic(unsupported, 0, 0, 0, 5);
dynamic(unsupported, 1, 0, 0, 21); // sfz
dynamic(unsupported, 2, 0, 0, 18); // fp
unsupported.SourceMeasures[0].StaffLinkedExpressions[0].push({ AbsoluteTimestamp: fraction(0.25), StartingContinuousDynamic: { DynamicType: 0 } });
unsupported.SourceMeasures[2].StaffLinkedExpressions[0].push({ AbsoluteTimestamp: fraction(2.5), InstantaneousDynamic: { DynEnum: 999 } });
expect(note(unsupported, 0, 0.5), unsupported, 56);
expect(note(unsupported, 3, 0), unsupported, 56);

// The lookup sorts only its own events and reads frozen OSMD objects without tagging or editing them.
const unordered = fixture(1);
const late = dynamic(unordered, 0, 0, 0.75, 8);
const early = dynamic(unordered, 0, 0, 0.25, 5);
const target = note(unordered, 0, 0.5, 0, ['staccato']);
function freeze(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    Object.values(value).forEach(child => freeze(child, seen));
    Object.freeze(value);
}
freeze(unordered);
freeze(target);
expect(target, unordered, 56, 0.5, true);
assert.equal(unordered.SourceMeasures[0].StaffLinkedExpressions[0][0], late);
assert.equal(unordered.SourceMeasures[0].StaffLinkedExpressions[0][1], early);
assert.equal(target.Length.RealValue, 0.25);
assert.equal(target.ParentVoiceEntry.Articulations.length, 1);
assertions += 4;

// Output arbitration never merges source notes or changes feedback identity. Tone/MIDI release a pitch,
// so simultaneous same-pitch score voices share the longest gate on each actual destination.
const mergeOutputs = context.window.ScoreExpression.mergeOutputs;
const request = (overrides = {}) => ({ midi: 60, durationMs: 250, velocity: 56, staccato: true,
    toLocalAudio: true, toMidiOut: true, deferred: false, ...overrides });
const result = requests => JSON.parse(JSON.stringify(mergeOutputs(requests)));
function expectOutputs(requests, expected) {
    assert.deepEqual(result(requests), expected);
    assertions++;
}
expectOutputs([], []);
const mixed = [request(), request({ durationMs: 450, velocity: 100, staccato: false })];
expectOutputs(mixed, [request({ durationMs: 450, velocity: 100, staccato: false })]);
expectOutputs([...mixed].reverse(), [request({ durationMs: 450, velocity: 100, staccato: false })]);
expectOutputs([request({ durationMs: 125 }), request({ velocity: 71 })], [request({ velocity: 71 })]);
expectOutputs([request({ toMidiOut: false }), request({ toLocalAudio: false, durationMs: 450, velocity: 100, staccato: false })], [
    request({ toMidiOut: false }), request({ toLocalAudio: false, durationMs: 450, velocity: 100, staccato: false })
]);
expectOutputs([
    request({ toMidiOut: false, durationMs: 450, velocity: 80, staccato: false }),
    request({ toLocalAudio: false }), request({ velocity: 71 })
], [
    request({ toMidiOut: false, durationMs: 450, velocity: 80, staccato: false }),
    request({ toLocalAudio: false, velocity: 71 })
]);
expectOutputs([request({ toMidiOut: false }), request({ toLocalAudio: false })], [request()]);
expectOutputs([request(), request({ deferred: true, durationMs: 450, staccato: false })], [
    request(), request({ deferred: true, durationMs: 450, staccato: false })
]);
expectOutputs([request(), request({ durationMs: 1800, velocity: 40, staccato: false })], [
    request({ durationMs: 1800, staccato: false })
]);
expectOutputs([request({ midi: 64 }), request(), request({ midi: 64, velocity: 100 })], [
    request({ midi: 64, velocity: 100 }), request()
]);
expectOutputs([request({ toLocalAudio: false, toMidiOut: false })], []);
expectOutputs([request()], [request()]);
expectOutputs([request({ durationMs: 450, staccato: false })], [request({ durationMs: 450, staccato: false })]);
const frozenRequests = [request(), request({ durationMs: 450, staccato: false })];
const requestsBefore = JSON.stringify(frozenRequests);
freeze(frozenRequests);
const merged = mergeOutputs(frozenRequests);
assert.equal(JSON.stringify(frozenRequests), requestsBefore);
assert.notEqual(merged[0], frozenRequests[0]);
assert.notEqual(merged[0], frozenRequests[1]);
assertions += 3;

console.log(`Score expression: ${assertions} assertions passed (bundled note/staff classes; synthetic expression metadata). Browser, audio and hardware acceptance are separate.`);
