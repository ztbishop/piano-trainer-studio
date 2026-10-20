// Actual pitch/harmony helpers, exposed only in an in-memory copy. No production exports.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('js/transpose/transpose-engine.js', 'utf8');
const context = vm.createContext({ window: {} });
assert(source.includes('window.TransposeEngine = {'));
vm.runInContext(source.replace('window.TransposeEngine = {',
    'window.__test = { rewritePitchNode, rewriteHarmonyNode }; window.TransposeEngine = {'), context);
function element(tagName, textContent = '') {
    return {
        tagName, textContent: String(textContent), children: [], ownerDocument: { createElement: element },
        appendChild(child) { this.children.push(child); child.remove = () => { this.children.splice(this.children.indexOf(child), 1); }; },
        querySelector(selector) { return this.children.find(child => selector.split(',').map(s => s.trim()).includes(child.tagName)) || null; }
    };
}
function pitch(step, alter, octave) {
    const node = element('pitch');
    node.appendChild(element('step', step));
    if (alter !== null) node.appendChild(element('alter', alter));
    node.appendChild(element('octave', octave));
    return node;
}
const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function absolute(node) {
    return (Number(node.querySelector('octave').textContent) * 12)
        + semitones[node.querySelector('step').textContent] + Number(node.querySelector('alter')?.textContent || 0);
}
let cases = 0;
for (const bias of ['sharp', 'flat']) {
    for (const step of Object.keys(semitones)) {
        for (const alter of [null, -2, -1, 0, 1, 2]) {
            for (const octave of [0, 3, 4, 8]) {
                for (const delta of [-12, -6, -1, 0, 1, 6, 12]) {
                    const node = pitch(step, alter, octave);
                    const expected = absolute(node) + delta;
                    context.window.__test.rewritePitchNode(node, delta, bias);
                    assert.equal(absolute(node), expected, `${step} alter ${alter}, octave ${octave}, shift ${delta}, ${bias}`);
                    assert.equal(node.children.filter(n => n.tagName === 'alter').length,
                        Number(node.querySelector('alter') !== null));
                    cases++;
                }
            }
        }
    }
}
for (const [step, alter, octave, delta, result] of [
    ['B', 1, 4, 1, ['C', 1, 5]], ['C', -1, 4, -1, ['A', 1, 3]],
    ['B', 2, 4, -1, ['C', 0, 5]], ['C', -2, 4, 1, ['B', 0, 3]]
]) {
    const node = pitch(step, alter, octave);
    context.window.__test.rewritePitchNode(node, delta, 'sharp');
    assert.deepEqual([node.querySelector('step').textContent, Number(node.querySelector('alter')?.textContent || 0),
        Number(node.querySelector('octave').textContent)], result);
}
// Harmony is pitch-class-only; it must keep wrapping without acquiring an octave.
const malformedAlter = pitch('C', 'invalid', 4);
context.window.__test.rewritePitchNode(malformedAlter, 1, 'sharp');
assert.equal(absolute(malformedAlter), 49, 'Preserve existing malformed-alter fallback to zero');
for (const delta of [-1, 1, 12]) {
    const harmony = element('harmony');
    for (const [tag, step, alter] of [['root', 'B', 1], ['bass', 'C', -1]]) {
        const node = element(tag);
        node.appendChild(element(`${tag}-step`, step)); node.appendChild(element(`${tag}-alter`, alter));
        harmony.appendChild(node);
    }
    context.window.__test.rewriteHarmonyNode(harmony, delta, 'sharp');
    for (const [tag, initial] of [['root', 12], ['bass', -1]]) {
        const node = harmony.querySelector(tag);
        const actual = semitones[node.querySelector(`${tag}-step`).textContent] + Number(node.querySelector(`${tag}-alter`)?.textContent || 0);
        assert.equal(((actual % 12) + 12) % 12, (((initial + delta) % 12) + 12) % 12);
        assert.equal(node.querySelector('octave'), null);
    }
}
// Public zero-shift behavior returns the exact original text before rewriting pitches.
const xml = '<score-partwise/>';
context.DOMParser = class { parseFromString() { return { querySelector: () => null }; } };
assert.equal(context.window.TransposeEngine.transposeXml(xml, { semitones: 0 }).xmlString, xml);
console.log(`Transpose octave regressions passed: ${cases} absolute-pitch cases, explicit boundary spellings, harmony and zero-shift preservation.`);
