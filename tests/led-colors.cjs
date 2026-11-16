// Actual LED palette/frame and preference functions, with no hardware or native storage.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const local = {}, session = {};
const store = data => new Proxy(data, { get(target, key) {
    if (key === 'getItem') return k => target[k] ?? null;
    if (key === 'setItem') return (k, v) => { target[k] = String(v); };
    if (key === 'removeItem') return k => { delete target[k]; };
    return target[key];
} });
const checkbox = { checked: false };
const document = { getElementById: id => id === 'check-led-black-key-colors' ? checkbox : null,
    createElement: () => ({style:{},setAttribute(){},appendChild(){}}), body:{appendChild(){}} };
const window = { localStorage: store(local), sessionStorage: store(session) };
let renders = 0, invalidations = 0;
const ctx = vm.createContext({ window, document, console, performance,
    renderVirtualKeyboard() { renders++; } });
for (const file of ['storage', 'trainer-state', 'led']) vm.runInContext(fs.readFileSync('js/' + file + '.js', 'utf8'), ctx);
const api = vm.runInContext(`({ state:AppState, led:LedEngine, set:setLedBlackKeyColors,
    load:()=>setLedBlackKeyColors(getStoredBool(LED_BLACK_KEY_COLORS_STORAGE_KEY,false),{save:false,rerender:false}),
    backup:buildSettingsBackupPayload, import:importSettingsBackupPayload, reset:clearSavedPreferences,
    invalidate:fn=>{WLEDController.clearLastSignature=fn;} })`, ctx);
api.invalidate(() => { invalidations++; });
let count = 0;
function equal(actual, expected, label) { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, label); count++; }
api.load();
equal(api.state.ledBlackKeyColors, false, 'absent preference defaults off');
const states = { 'expected-l':[0,0,255], 'expected-r':[0,255,0], 'future1-l':[0,0,255], 'future1-r':[0,255,0],
    'future2-l':[0,0,255], 'future2-r':[0,255,0], 'wrong':[255,0,0], 'pressed-l':[185,130,25],
    'pressed-r':[185,130,25], 'active':[185,130,25], 'calibration':[255,255,255], 'off':[0,0,0] };
for (const mode of ['none','midi','wled']) for (const enabled of [false,true]) {
    api.state.ledOutputMode = mode;
    api.set(enabled, {save:false,rerender:false});
    for (let midi = 21; midi <= 108; midi++) for (const [state, base] of Object.entries(states)) {
        const tint = mode === 'wled' && enabled && [1,3,6,8,10].includes(midi % 12) && /^(expected|future[12])-[lr]$/.test(state);
        equal(api.led.getColorForState(state, midi), tint ? (state.endsWith('-l') ? [96,0,255] : [0,255,128]) : base,
            `${mode} enabled=${enabled} MIDI ${midi} ${state}`);
    }
}
api.state.ledOutputMode = 'wled';
api.set(true);
equal([local.pt_ledBlackKeyColors, checkbox.checked, renders], ['true',true,1], 'toggle saves, synchronizes and redraws immediately');
assert(invalidations > 0); count++;
api.state.ledBlackKeyColors = false; api.load();
equal(api.state.ledBlackKeyColors, true, 'saved preference restores');
const backup = api.backup();
equal(backup.settings.pt_ledBlackKeyColors, 'true', 'settings export includes preference');
api.import({version:1,settings:{pt_ledBlackKeyColors:false}}); api.load();
equal(api.state.ledBlackKeyColors, false, 'typed backup restores false');
api.import(backup); api.load();
equal(api.state.ledBlackKeyColors, true, 'settings round trip restores true');
api.import({settings:{pt_ledCount:88}}); api.load();
equal(api.state.ledBlackKeyColors, false, 'older backup defaults off');
api.set(true); api.reset(); api.load();
equal([api.state.ledBlackKeyColors,checkbox.checked,local.pt_ledBlackKeyColors??null], [false,false,null], 'reset removes preference and restores off');
api.set(true, {save:false,rerender:false});
api.led.config.ledCount = 4; api.led.init();
api.led.keyToLed = new Map([[60,0],[61,1],[63,2],[64,3]]);
const desired = new Map([[60,'expected-l'],[61,'expected-l'],[63,'future1-r'],[64,'wrong']]);
for (const master of [0.01,0.25,1]) for (const future of [0,1,10,100]) {
    api.led.config.masterBrightness = master; api.led.config.future1BrightnessPct = future;
    api.led.renderFromStates(desired);
    const scale = (rgb, multiplier) => rgb.map(c => Math.round(c * multiplier));
    equal(api.led.frame, [scale([0,0,255],master),scale([96,0,255],master),scale([0,255,128],master*future/100),scale([255,0,0],master)], 'shared frame retains brightness and wrong-note color');
    equal([...desired], [[60,'expected-l'],[61,'expected-l'],[63,'future1-r'],[64,'wrong']], 'render leaves desired states intact');
}
console.log('LED black-key colors: ' + count + ' checks passed (isolated palette/frame/preferences; no hardware).');
