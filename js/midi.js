// midi.js
// Owns WebMIDI access, device population, connection status wiring,
// and MIDI input/output selection listeners.
// Does not own trainer scoring, rendering, or playback scheduling.

// ⚠️ WARNING:
// MIDI input events must continue to flow through triggerVirtualKey() so the
// existing realtime/wait logic, scoring, feedback notes, and audio behavior stay aligned.

let midiAccess = null;
let activeMidiInput = null;

function populateMidiChannelSelect(selectId, selectedValue = 1, { includeAny = false } = {}) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const safeValue = includeAny
        ? normalizeMidiInputChannel(selectedValue, 0)
        : normalizeMidiChannel(selectedValue, 1);
    select.innerHTML = '';
    if (includeAny) {
        const anyOption = document.createElement('option');
        anyOption.value = '0';
        anyOption.textContent = 'Any';
        if (safeValue === 0) anyOption.selected = true;
        select.appendChild(anyOption);
    }
    for (let channel = 1; channel <= 16; channel++) {
        const option = document.createElement('option');
        option.value = String(channel);
        option.textContent = String(channel);
        if (channel === safeValue) option.selected = true;
        select.appendChild(option);
    }
}

function syncMidiInputConfigVisibility() {
    const midiInSelect = document.getElementById('midi-in');
    const midiInConfig = document.getElementById('midi-in-config');
    const midiInChannelRow = document.getElementById('midi-in-channel-row');
    const midiInKeysRow = document.getElementById('midi-in-keys-row');
    const playerRangeLabel = document.getElementById('player-piano-range-label');
    if (!midiInSelect || !midiInConfig) return;
    const hasMidiIn = midiInSelect.value && midiInSelect.value !== 'none';
    midiInConfig.classList.toggle('hidden', !hasMidiIn);
    if (midiInChannelRow) midiInChannelRow.classList.toggle('hidden', !hasMidiIn);
    if (midiInKeysRow) midiInKeysRow.classList.toggle('hidden', !hasMidiIn);
    if (playerRangeLabel) playerRangeLabel.classList.add('hidden');
}

function syncMidiOutChannelVisibility() {
    const midiOutSelect = document.getElementById('midi-out');
    const channelRow = document.getElementById('midi-out-channel-row');
    if (!channelRow || !midiOutSelect) return;
    const hasMidiOut = midiOutSelect.value && midiOutSelect.value !== 'none';
    channelRow.classList.toggle('hidden', !hasMidiOut);
}

function getSelectedMidiOutChannel() {
    return normalizeMidiChannel(document.getElementById('midi-out-channel')?.value, AppState.midiOutChannel || 1);
}

function getSelectedMidiLightsChannel() {
    return normalizeMidiChannel(document.getElementById('midi-lights-channel')?.value, AppState.midiLightsChannel || 1);
}

function getSelectedMidiInChannel() {
    return normalizeMidiInputChannel(document.getElementById('midi-in-channel')?.value, AppState.midiInChannel || 0);
}

function getSelectedMidiOutOutput() {
    if (!midiAccess) return null;
    const outId = document.getElementById('midi-out')?.value || 'none';
    if (outId === 'none') return null;
    const output = midiAccess.outputs.get(outId);
    return output && output.state !== 'disconnected' ? output : null;
}

function sendMidiOutNoteOn(note, velocity = 100) {
    const output = getSelectedMidiOutOutput();
    if (!output) return false;
    const status = getMidiStatus(0x90, getSelectedMidiOutChannel());
    const clampedVelocity = Math.max(1, Math.min(127, Math.round(Number(velocity) || 100)));
    rememberOutgoingMidiMessage(status, note, clampedVelocity);
    output.send([status, note, clampedVelocity]);
    return true;
}

function sendMidiOutNoteOff(note) {
    const output = getSelectedMidiOutOutput();
    if (!output) return false;
    const status = getMidiStatus(0x80, getSelectedMidiOutChannel());
    rememberOutgoingMidiMessage(status, note, 0);
    output.send([status, note, 0]);
    return true;
}

function scheduleMidiOutPlaybackNote(note, durationMs, velocity = 100) {
    if (!sendMidiOutNoteOn(note, velocity)) return;
    window.setTimeout(() => {
        sendMidiOutNoteOff(note);
    }, Math.max(0, Number(durationMs) || 0));
}

function getMidiStatus(baseStatus, channelOneBased) {
    return baseStatus + (normalizeMidiChannel(channelOneBased, 1) - 1);
}

function rememberOutgoingMidiMessage(status, note, velocity) {
    const now = performance.now();
    AppState.recentMidiEchoes.push({ status, note, velocity, time: now });
    if (AppState.recentMidiEchoes.length > 256) {
        AppState.recentMidiEchoes = AppState.recentMidiEchoes.slice(-128);
    }
}

function isRecentOutgoingMidiEcho(status, note, velocity) {
    const now = performance.now();
    AppState.recentMidiEchoes = AppState.recentMidiEchoes.filter(m => (now - m.time) < 120);
    return AppState.recentMidiEchoes.some(m =>
        m.status === status &&
        m.note === note &&
        m.velocity === velocity &&
        (now - m.time) < 120
    );
}


async function setupMIDI() {
    if (navigator.requestMIDIAccess) {
        try {
            midiAccess = await navigator.requestMIDIAccess();
            if (typeof clearMidiPermissionHelp === 'function') clearMidiPermissionHelp();
            populateMidiChannelSelect('midi-in-channel', AppState.midiInChannel || 0, { includeAny: true });
            populateMidiChannelSelect('midi-out-channel', AppState.midiOutChannel || 1);
            populateMidiChannelSelect('midi-lights-channel', AppState.midiLightsChannel || 1);
            populateMIDIDevices();
            refreshConnectionStatuses();
            syncMidiInputConfigVisibility();
            syncMidiOutChannelVisibility();
            midiAccess.onstatechange = () => {
                populateMIDIDevices();
                refreshConnectionStatuses();
                syncMidiInputConfigVisibility();
                syncMidiOutChannelVisibility();
                if (typeof syncTrainerRoutingUiState === 'function') syncTrainerRoutingUiState();
            };
        } catch (err) {
            console.warn("MIDI Access Denied", err);
            if (typeof showMidiPermissionHelp === 'function') showMidiPermissionHelp(getMidiPermissionHelpText());
        }
    }
}

function populateMIDIDevices() {
    const midiInSelect = document.getElementById('midi-in');
    const midiOutSelect = document.getElementById('midi-out');
    const midiLightsSelect = document.getElementById('midi-lights');

    const savedIn = localStorage.getItem(MIDI_IN_ID_STORAGE_KEY);
    const savedOut = localStorage.getItem(MIDI_OUT_ID_STORAGE_KEY);
    const savedLights = localStorage.getItem(MIDI_LIGHTS_ID_STORAGE_KEY);

    populateMidiChannelSelect('midi-in-channel', AppState.midiInChannel || 0, { includeAny: true });
    populateMidiChannelSelect('midi-out-channel', AppState.midiOutChannel || 1);
    populateMidiChannelSelect('midi-lights-channel', AppState.midiLightsChannel || 1);

    midiInSelect.innerHTML = '<option value="none">None</option>';
    midiOutSelect.innerHTML = '<option value="none">None</option>';
    midiLightsSelect.innerHTML = '<option value="none">None</option>';

    if (!midiAccess) {
        updateConnectionStatuses();
        syncMidiInputConfigVisibility();
        syncMidiOutChannelVisibility();
        return;
    }

    if (typeof clearMidiPermissionHelp === 'function') clearMidiPermissionHelp();

    for (let input of midiAccess.inputs.values()) {
        const option = document.createElement('option');
        option.value = input.id; option.text = input.name;
        midiInSelect.appendChild(option);
    }
    
    for (let output of midiAccess.outputs.values()) {
        const optOut = document.createElement('option');
        optOut.value = output.id; optOut.text = output.name;
        midiOutSelect.appendChild(optOut);
        
        const optLights = document.createElement('option');
        optLights.value = output.id; optLights.text = output.name;
        midiLightsSelect.appendChild(optLights);
    }

    if (savedIn && [...midiInSelect.options].some(o => o.value === savedIn)) {
        midiInSelect.value = savedIn;
        if (!activeMidiInput || activeMidiInput.id !== savedIn) {
             midiInSelect.dispatchEvent(new Event('change'));
        }
    }
    if (savedOut && [...midiOutSelect.options].some(o => o.value === savedOut)) {
        midiOutSelect.value = savedOut;
    }
    if (savedLights && [...midiLightsSelect.options].some(o => o.value === savedLights)) {
        midiLightsSelect.value = savedLights;
    }

    updateConnectionStatuses();
    syncMidiInputConfigVisibility();
    syncMidiOutChannelVisibility();
    if (typeof syncTrainerRoutingUiState === 'function') syncTrainerRoutingUiState();
    if (window.MidiLedTestController && typeof window.MidiLedTestController.syncControls === 'function') {
        window.MidiLedTestController.syncControls();
    }
}

document.getElementById('midi-in').addEventListener('change', (e) => {
    localStorage.setItem(MIDI_IN_ID_STORAGE_KEY, e.target.value);
    if (e.target.value !== 'none') {
        const selectedName = e.target.selectedOptions?.[0]?.textContent?.replace(/\s*\(Disconnected\)\s*$/, '') || 'MIDI In';
        localStorage.setItem(MIDI_IN_NAME_STORAGE_KEY, selectedName);
    } else {
        localStorage.removeItem(MIDI_IN_NAME_STORAGE_KEY);
    }
    if (activeMidiInput) activeMidiInput.onmidimessage = null;
    
    if (e.target.value !== 'none') {
        activeMidiInput = midiAccess.inputs.get(e.target.value);
        activeMidiInput.onmidimessage = (msg) => {
            const status = msg.data[0];
            const note = msg.data[1];
            const vel = msg.data.length > 2 ? msg.data[2] : 0;

            if (isRecentOutgoingMidiEcho(status, note, vel)) {
                return;
            }

            const selectedChannel = getSelectedMidiInChannel();
            const messageChannel = (status & 0x0F) + 1;
            if (selectedChannel > 0 && messageChannel !== selectedChannel) {
                return;
            }

            const cmd = status & 0xF0;
            if (cmd === 0x90 && vel > 0) triggerVirtualKey(note, true, 'midi', vel);
            else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) triggerVirtualKey(note, false, 'midi', vel);
        };
    } else {
        activeMidiInput = null;
    }
    syncMidiInputConfigVisibility();
    updateConnectionStatuses();
});

document.getElementById('midi-in-channel').addEventListener('change', (e) => {
    const nextChannel = normalizeMidiInputChannel(e.target.value, 0);
    e.target.value = String(nextChannel);
    AppState.midiInChannel = nextChannel;
    localStorage.setItem(MIDI_IN_CHANNEL_STORAGE_KEY, String(nextChannel));
});

document.getElementById('midi-out').addEventListener('change', (e) => {
    localStorage.setItem(MIDI_OUT_ID_STORAGE_KEY, e.target.value);
    if (e.target.value !== 'none') {
        const selectedName = e.target.selectedOptions?.[0]?.textContent?.replace(/\s*\(Disconnected\)\s*$/, '') || 'MIDI Out';
        localStorage.setItem(MIDI_OUT_NAME_STORAGE_KEY, selectedName);
    } else {
        localStorage.removeItem(MIDI_OUT_NAME_STORAGE_KEY);
    }
    updateConnectionStatuses();
    syncMidiOutChannelVisibility();
    if (typeof syncTrainerRoutingUiState === 'function') syncTrainerRoutingUiState();
});


document.getElementById('midi-out-channel').addEventListener('change', (e) => {
    const nextChannel = normalizeMidiChannel(e.target.value, 1);
    e.target.value = String(nextChannel);
    AppState.midiOutChannel = nextChannel;
    localStorage.setItem(MIDI_OUT_CHANNEL_STORAGE_KEY, String(nextChannel));
    if (typeof syncTrainerRoutingUiState === 'function') syncTrainerRoutingUiState();
});

document.getElementById('midi-lights-channel').addEventListener('change', (e) => {
    const nextChannel = normalizeMidiChannel(e.target.value, 1);
    e.target.value = String(nextChannel);
    AppState.midiLightsChannel = nextChannel;
    localStorage.setItem(MIDI_LIGHTS_CHANNEL_STORAGE_KEY, String(nextChannel));
    wipeHardwareLEDs();
    MidiLedTestController.stop({ statusText: document.getElementById('midi-lights')?.value === 'none' ? 'Select an LED MIDI device first.' : 'MIDI LED idle.' });
    if (typeof renderVirtualKeyboard === 'function') renderVirtualKeyboard();
});

document.getElementById('midi-lights').addEventListener('change', (e) => {
    localStorage.setItem(MIDI_LIGHTS_ID_STORAGE_KEY, e.target.value);
    if (e.target.value !== 'none') {
        const selectedName = e.target.selectedOptions?.[0]?.textContent?.replace(/\s*\(Disconnected\)\s*$/, '') || 'LED MIDI';
        localStorage.setItem(MIDI_LIGHTS_NAME_STORAGE_KEY, selectedName);
    } else {
        localStorage.removeItem(MIDI_LIGHTS_NAME_STORAGE_KEY);
    }
    wipeHardwareLEDs(); 
    MidiLedTestController.stop({ statusText: e.target.value === 'none' ? 'Select an LED MIDI device first.' : 'MIDI LED idle.' });
    updateConnectionStatuses();
    renderVirtualKeyboard(); 
    MidiLedTestController.syncControls();
});

const midiLedLowVelocityCheckbox = document.getElementById('check-midi-led-low-velocity');
if (midiLedLowVelocityCheckbox && !midiLedLowVelocityCheckbox.dataset.boundMidiLedVelocity) {
    midiLedLowVelocityCheckbox.dataset.boundMidiLedVelocity = 'true';
    midiLedLowVelocityCheckbox.checked = !!AppState.midiLedLowVelocity;
    midiLedLowVelocityCheckbox.addEventListener('change', (e) => {
        AppState.midiLedLowVelocity = !!e.target.checked;
        setStoredBool(MIDI_LED_LOW_VELOCITY_STORAGE_KEY, AppState.midiLedLowVelocity);
        if (AppState.ledOutputMode === 'midi') {
            wipeHardwareLEDs();
            if (typeof renderVirtualKeyboard === 'function') renderVirtualKeyboard();
        }
    });
}


const MidiLedTestController = {
    isRunning: false,
    cancelRequested: false,
    activeNotes: new Set(),
    waitToken: 0,
    currentOutput: null,

    getSelectedOutput() {
        if (!midiAccess) return null;
        const lightsOutId = document.getElementById('midi-lights')?.value || 'none';
        if (AppState.ledOutputMode !== 'midi' || lightsOutId === 'none') return null;
        const output = midiAccess.outputs.get(lightsOutId);
        return output && output.state !== 'disconnected' ? output : null;
    },

    setStatus(text) {
        const status = document.getElementById('midi-led-test-status');
        if (status) status.textContent = text;
    },

    updateButton() {
        const btn = document.getElementById('btn-test-midi-led');
        if (btn) btn.textContent = this.isRunning ? 'Stop Test' : 'Test LED Strip';
    },

    syncControls() {
        const btn = document.getElementById('btn-test-midi-led');
        const modeIsMidi = AppState.ledOutputMode === 'midi';
        const hasOutput = !!this.getSelectedOutput();
        if (btn) btn.disabled = !modeIsMidi || (!hasOutput && !this.isRunning);
        if (!this.isRunning) {
            this.setStatus(modeIsMidi
                ? (hasOutput ? 'Run a chromatic sweep across the player key range.' : 'Select an LED MIDI device first.')
                : 'MIDI LED idle.');
        }
        this.updateButton();
    },

    sendNoteOn(output, note) {
        const velocity = typeof LedEngine?.getMidiVelocityForState === 'function'
            ? LedEngine.getMidiVelocityForState('active')
            : 127;
        const status = getMidiStatus(0x90, getSelectedMidiLightsChannel());
        rememberOutgoingMidiMessage(status, note, velocity);
        output.send([status, note, velocity]);
        this.activeNotes.add(note);
    },

    sendNoteOff(output, note) {
        const status = getMidiStatus(0x80, getSelectedMidiLightsChannel());
        rememberOutgoingMidiMessage(status, note, 0);
        output.send([status, note, 0]);
        this.activeNotes.delete(note);
    },

    async wait(ms) {
        const token = ++this.waitToken;
        return new Promise(resolve => {
            setTimeout(() => resolve(token === this.waitToken), ms);
        });
    },

    async stop({ statusText = 'MIDI LED test stopped.' } = {}) {
        this.cancelRequested = true;
        this.waitToken += 1;
        const output = this.currentOutput || this.getSelectedOutput();
        if (output) {
            for (const note of [...this.activeNotes]) {
                try {
                    this.sendNoteOff(output, note);
                } catch (err) {
                    console.warn('MIDI LED test note-off error', err);
                }
            }
            try {
                output.send([getMidiStatus(0xB0, getSelectedMidiLightsChannel()), 123, 0]);
            } catch (err) {
                console.warn('MIDI LED test all-notes-off error', err);
            }
        }
        this.activeNotes.clear();
        this.currentOutput = null;
        this.isRunning = false;
        this.updateButton();
        AppState.hardwareLEDState.clear();
        if (typeof renderVirtualKeyboard === 'function') renderVirtualKeyboard();
        this.setStatus(statusText);
    },

    async run() {
        if (this.isRunning) {
            await this.stop({ statusText: 'MIDI LED test stopped.' });
            return;
        }

        const output = this.getSelectedOutput();
        if (!output) {
            this.setStatus('Select an LED MIDI device first.');
            this.syncControls();
            return;
        }

        const notes = typeof buildChromaticTestNotes === 'function'
            ? buildChromaticTestNotes()
            : (() => {
                const fallback = [];
                const range = typeof getPlayerPlayableRange === 'function'
                    ? getPlayerPlayableRange()
                    : { minMidi: 21, maxMidi: 108 };
                for (let note = range.minMidi; note <= range.maxMidi; note++) fallback.push(note);
                for (let note = range.maxMidi - 1; note > range.minMidi; note--) fallback.push(note);
                return fallback;
            })();

        if (!notes.length) {
            this.setStatus('No playable keys available for MIDI LED test.');
            return;
        }

        this.cancelRequested = false;
        this.currentOutput = output;
        this.isRunning = true;
        this.updateButton();
        this.setStatus('Running MIDI LED strip test…');
        wipeHardwareLEDs();

        const stepMs = 75;
        const holdMs = 55;

        try {
            for (let i = 0; i < notes.length; i++) {
                if (this.cancelRequested) break;
                const note = notes[i];
                this.sendNoteOn(output, note);
                this.setStatus(`Testing MIDI LED note ${note} (${i + 1}/${notes.length}).`);
                const keepGoing = await this.wait(holdMs);
                if (!keepGoing || this.cancelRequested) break;
                this.sendNoteOff(output, note);
                if (stepMs > holdMs) {
                    const continueAfterGap = await this.wait(stepMs - holdMs);
                    if (!continueAfterGap || this.cancelRequested) break;
                }
            }

            await this.stop({ statusText: this.cancelRequested ? 'MIDI LED test stopped.' : 'MIDI LED test complete.' });
        } catch (err) {
            console.warn('MIDI LED test error', err);
            await this.stop({ statusText: 'MIDI LED test failed.' });
        }
    }
};

window.MidiLedTestController = MidiLedTestController;

const midiLedTestBtn = document.getElementById('btn-test-midi-led');
if (midiLedTestBtn && !midiLedTestBtn.dataset.boundMidiLedTest) {
    midiLedTestBtn.dataset.boundMidiLedTest = 'true';
    midiLedTestBtn.addEventListener('click', async () => {
        await MidiLedTestController.run();
    });
}

MidiLedTestController.syncControls();
