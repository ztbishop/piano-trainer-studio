// Actual MIDI setup/restoration and CC11 helpers with isolated devices/storage.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const midi = fs.readFileSync('js/midi.js', 'utf8');
const core = fs.readFileSync('js/trainer-core.js', 'utf8');
function section(source, start, end) {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert(a >= 0 && b > a, start); return source.slice(a, b);
}
function fixture(volume = 65, channel = 1, savedOut = 'piano') {
    const sent = [], changes = new Map();
    const stored = new Map([['out', savedOut], ['lights', 'lights']]);
    function element() {
        return {
            value: 'none', options: [],
            set innerHTML(value) { this.options = [{value:'none'}]; this.value = 'none'; },
            appendChild(option) { this.options.push(option); },
            addEventListener(type, fn) { changes.set(this.id, fn); },
            get selectedOptions() { return this.options.filter(o => o.value === this.value); }
        };
    }
    const elements = {};
    for (const id of ['midi-in','midi-out','midi-lights','midi-out-channel']) {
        elements[id] = element(); elements[id].id = id;
    }
    const output = id => ({id, name:id, state:'connected', send(bytes) {sent.push({id, bytes:Array.from(bytes)});} });
    const access = {inputs:new Map(), outputs:new Map(['piano','other','lights'].map(id => [id, output(id)]))};
    const state = {mode:'realtime', midiOutVolume:volume, midiOutChannel:channel, midiInChannel:0, midiLightsChannel:1,
        audioEnabled:{virtual:true}, midiOutEnabled:{hands:false}};
    const context = vm.createContext({
        AppState:state, midiAccess:null, activeMidiInput:null, window:{},
        navigator:{requestMIDIAccess:async()=>access}, console,
        MIDI_IN_ID_STORAGE_KEY:'in', MIDI_OUT_ID_STORAGE_KEY:'out', MIDI_LIGHTS_ID_STORAGE_KEY:'lights',
        MIDI_OUT_NAME_STORAGE_KEY:'out-name', MIDI_OUT_CHANNEL_STORAGE_KEY:'channel',
        document:{getElementById:id=>elements[id], createElement:()=>({})},
        localStorage:{getItem:key=>stored.get(key)??null, setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)},
        populateMidiChannelSelect() {}, normalizeMidiChannel:value=>Math.max(1,Math.min(16,Number(value)||1)),
        updateConnectionStatuses() {}, refreshConnectionStatuses() {}, syncMidiInputConfigVisibility() {},
        syncMidiOutChannelVisibility() {}, syncTrainerRoutingUiState() {}
    });
    vm.runInContext(section(core,'function getMidiOutStatus(', 'function getMidiLightsStatus('),context);
    vm.runInContext(section(core,'function getSelectedMidiOutOutput()', 'function getLiveAudioTime()'),context);
    vm.runInContext(section(core,'function getMidiOutExpressionValue(', 'function sendMidiOutNoteOn('),context);
    vm.runInContext(section(midi,'async function setupMIDI()', "document.getElementById('midi-in').addEventListener"),context);
    vm.runInContext(section(midi,"document.getElementById('midi-out').addEventListener", "document.getElementById('midi-lights-channel').addEventListener"),context);
    return {context,state,access,sent,stored,elements,change:id=>changes.get(id)({target:elements[id]})};
}

(async()=>{
    for (const mode of ['realtime','wait','follow']) {
        for (const [volume,channel] of [[0,1],[65,1],[100,16]]) {
            const f=fixture(volume,channel); f.state.mode=mode;
            assert.equal(f.context.sendMidiOutExpressionLevel(),false,'Before MIDI access, no destination exists');
            await f.context.setupMIDI();
            assert.deepEqual(f.sent,[{id:'piano',bytes:[0xB0+channel-1,11,Math.round(volume/100*127)]}],`${mode} startup volume ${volume}`);
            assert.equal(f.elements['midi-out'].value,'piano'); assert.equal(f.elements['midi-lights'].value,'lights');
            assert.equal(f.stored.get('out'),'piano'); assert.equal(f.state.midiOutVolume,volume);
            assert.deepEqual(f.state.audioEnabled,{virtual:true}); assert.deepEqual(f.state.midiOutEnabled,{hands:false});
        }
    }
    const reconnect=fixture(); await reconnect.context.setupMIDI(); reconnect.sent.length=0;
    reconnect.access.outputs.get('piano').state='disconnected'; reconnect.access.onstatechange();
    assert.equal(reconnect.sent.length,0,'Disconnected output must not receive messages');
    reconnect.access.outputs.get('piano').state='connected'; reconnect.access.onstatechange();
    assert.deepEqual(reconnect.sent,[{id:'piano',bytes:[176,11,83]}]);
    reconnect.sent.length=0;
    const piano=reconnect.access.outputs.get('piano'); reconnect.access.outputs.delete('piano'); reconnect.access.onstatechange();
    assert.equal(reconnect.sent.length,0); assert.equal(reconnect.stored.get('out'),'piano');
    reconnect.access.outputs.set('piano',piano); reconnect.access.onstatechange();
    assert.deepEqual(reconnect.sent,[{id:'piano',bytes:[176,11,83]}]);
    reconnect.sent.length=0; reconnect.elements['midi-out'].value='other'; reconnect.change('midi-out');
    assert.deepEqual(reconnect.sent,[{id:'other',bytes:[176,11,83]}]);
    reconnect.sent.length=0; reconnect.elements['midi-out-channel'].value='3'; reconnect.change('midi-out-channel');
    assert.deepEqual(reconnect.sent,[{id:'other',bytes:[178,11,83]}]);
    reconnect.sent.length=0; reconnect.elements['midi-out'].value='none'; reconnect.change('midi-out');
    assert.equal(reconnect.sent.length,0);
    for(const saved of [null,'none','missing']) {
        const f=fixture(65,1,saved); await f.context.setupMIDI(); assert.equal(f.sent.length,0);
        assert.equal(f.elements['midi-out'].value,'none','No automatic selection of another output');
    }
    console.log('MIDI output initialization passed: all modes, 0/65/100%, channels, reconnect, missing/disconnected/None, manual output/channel changes and unchanged routing.');
})().catch(error=>{console.error(error);process.exitCode=1;});
