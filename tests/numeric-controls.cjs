// Run with node tests/numeric-controls.cjs. No browser or dependencies required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const controls = new Map();
const observers = new Map();
class Element {
    constructor(id = '', value = '', min = '', max = '') {
        Object.assign(this, { id, value, min, max, disabled: false, listeners: {}, children: [] });
        this.parentNode = { insertBefore() {} };
        this.classList = { add() {} };
    }
    setAttribute() {}
    closest() { return this; }
    append(...children) {
        this.children.push(...children);
        for (const child of children) if (child.id) controls.set(child.id, child);
    }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    dispatchEvent(event) { this.listeners[event.type]?.(event); }
}
for (const [id, value, min, max] of [
    ['val-speed', '73', '10', '200'], ['slider-speed', '73', '10', '200'],
    ['val-zoom', '103', '50', '150'], ['slider-zoom', '103', '50', '150'],
    ['val-led-master', '1', '1', '100'], ['slider-led-master', '1', '1', '100'],
    ['val-led-future1', '1', '0', '100'], ['slider-led-future1', '1', '0', '100'],
    ['val-bpm', '1', '', '']
]) controls.set(id, new Element(id, value, min, max));
const commits = [];
for (const id of ['val-speed', 'val-zoom', 'val-led-master', 'val-led-future1', 'val-bpm']) {
    controls.get(id).addEventListener('change', event => commits.push([id, controls.get(id).value, event.bubbles]));
}
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/numeric-controls.js'), 'utf8'), {
    document: { getElementById: id => controls.get(id), createElement: () => new Element() },
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe(input) { observers.set(input.id, this.callback); } },
    Event: class { constructor(type, options) { this.type = type; Object.assign(this, options); } }
});
function click(id, direction) { controls.get(`${id}-${direction}`).dispatchEvent({ type: 'click' }); }
click('val-speed', 'increase');
assert.equal(controls.get('val-speed').value, '75');
controls.get('val-speed').value = '73';
click('val-speed', 'decrease');
assert.equal(controls.get('val-speed').value, '70');
controls.get('val-speed').value = '199';
click('val-speed', 'increase');
assert.equal(controls.get('val-speed').value, '200');
const atMax = commits.length;
click('val-speed', 'increase');
assert.equal(commits.length, atMax);
click('val-led-master', 'decrease');
assert.equal(controls.get('val-led-master').value, '1');
click('val-led-master', 'increase');
assert.equal(controls.get('val-led-master').value, '5');
click('val-bpm', 'decrease');
assert.equal(controls.get('val-bpm').value, '1');
click('val-led-future1', 'increase');
assert.equal(controls.get('val-led-future1').value, '2');
click('val-led-future1', 'decrease');
assert.equal(controls.get('val-led-future1').value, '1');
click('val-led-future1', 'decrease');
assert.equal(controls.get('val-led-future1').value, '0');
const atFutureMin = commits.length;
click('val-led-future1', 'decrease');
assert.equal(commits.length, atFutureMin);
controls.get('val-led-future1').value = '99';
click('val-led-future1', 'increase');
assert.equal(controls.get('val-led-future1').value, '100');
const atFutureMax = commits.length;
click('val-led-future1', 'increase');
assert.equal(commits.length, atFutureMax);
const beforeZoom = commits.length;
click('val-zoom', 'increase');
assert.equal(controls.get('val-zoom').value, '105');
assert.equal(commits.length, beforeZoom + 1);
assert.equal(controls.get('slider-zoom').value, '103'); // Existing change handler, not adapter, owns applying zoom.
assert.equal(Object.keys(controls.get('slider-zoom').listeners).length, 0);
assert.ok(commits.every(commit => commit[2] === true));
controls.get('val-zoom').disabled = true;
observers.get('val-zoom')();
assert.equal(controls.get('val-zoom-increase').disabled, true);
click('val-zoom', 'increase');
assert.equal(commits.length, beforeZoom + 1);
controls.get('val-speed').value = '';
const beforeBlank = commits.length;
click('val-speed', 'increase');
assert.equal(commits.length, beforeBlank);
console.log('Numeric control regressions passed: off-grid steps, bounds, disabled state, blank input, single commit, untouched range handlers.');

// Exercise the actual protected zoom bindings, rather than a rewritten model.
const core = fs.readFileSync(path.join(__dirname, '../js/trainer-core.js'), 'utf8');
const zoomSource = core.slice(core.indexOf("const zoomSlider = document.getElementById('slider-zoom');"), core.indexOf("const speedSlider = document.getElementById('slider-speed');"));
assert.ok(zoomSource.length > 0);
const zoomRange = new Element('slider-zoom', '100');
const zoomNumber = new Element('val-zoom', '100');
let renderCount = 0;
const saved = [];
vm.runInNewContext(zoomSource, {
    document: { getElementById: id => id === 'slider-zoom' ? zoomRange : zoomNumber },
    osmd: { IsReadyToRender: () => true, zoom: 1 }, AppState: {},
    localStorage: { setItem: (...args) => saved.push(args) }, TRAINER_ZOOM_STORAGE_KEY: 'test-zoom',
    clearFeedbackVisualStatePreserveScoring() {}, renderScoreAndRefreshGeometry() { renderCount++; }
});
zoomRange.dispatchEvent({ type: 'input', target: { value: '103' } });
assert.equal(String(zoomNumber.value), '103');
assert.equal(renderCount, 0);
assert.equal(saved.length, 0);
zoomRange.dispatchEvent({ type: 'change', target: { value: '103' } });
assert.equal(renderCount, 1);
zoomNumber.dispatchEvent({ type: 'change', target: { value: '105' } });
assert.equal(renderCount, 2);
assert.equal(String(zoomRange.value), '105');
console.log('Zoom source regression passed: preview input neither renders nor saves; each committed change renders once.');
