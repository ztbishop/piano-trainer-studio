(function() {
    try {
        window.__PT_DEBUG_BOOT__ = (window.__PT_DEBUG_BOOT__ || 0) + 1;
    } catch (e) {}
})();


// trainer-core.js
// Central trainer orchestration, score render lifecycle coordination, and playback scheduling.
// This file remains the integration layer while repeat/jump timing and metronome behavior are being stabilized.

// State and persisted preference helpers now load from js/trainer-state.js.
// Keep trainer-core.js focused on orchestration and cross-module coordination.

// ===== Boot + persisted preferences =====

function getDefaultStaffAssignment() {
    const stavesCount = osmd?.GraphicSheet?.MeasureList?.[0]?.length || 2;
    return {
        left: stavesCount > 1 ? 2 : null,
        right: 1
    };
}

function parseStaffAssignmentValue(value) {
    if (value === '' || value === '-' || value == null) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatStaffAssignmentValue(value) {
    const parsed = parseStaffAssignmentValue(value);
    return parsed == null ? '' : String(parsed);
}

function getAssignedHandRoleForStaff(staffId) {
    const sid = Number(staffId);
    if (!Number.isFinite(sid)) return null;
    if (sid === Number(AppState.hands.right)) return 'right';
    if (sid === Number(AppState.hands.left)) return 'left';
    return null;
}

function applyPersistedTrainerAndSettingsPreferences() {
    AppState.mode = localStorage.getItem(TRAINER_MODE_STORAGE_KEY) || 'realtime';
    AppState.feedbackEnabled = getStoredBool(TRAINER_FEEDBACK_STORAGE_KEY, true);
    AppState.futurePreviewEnabled = getStoredBool(TRAINER_FUTURE_PREVIEW_STORAGE_KEY, true);
    AppState.futurePreviewDepth = 1;
    AppState.correctHighlightEnabled = getStoredBool(TRAINER_CORRECT_HIGHLIGHT_STORAGE_KEY, false);
    AppState.practice.left = getStoredBool(TRAINER_PRACTICE_LH_STORAGE_KEY, true);
    AppState.practice.right = getStoredBool(TRAINER_PRACTICE_RH_STORAGE_KEY, true);
    AppState.audioEnabled.left = getStoredBool(TRAINER_AUDIO_LH_STORAGE_KEY, true);
    AppState.audioEnabled.right = getStoredBool(TRAINER_AUDIO_RH_STORAGE_KEY, true);
    AppState.audioEnabled.other = getStoredBool(TRAINER_AUDIO_OTHER_STORAGE_KEY, false);
    AppState.audioEnabled.instrument = getStoredBool(TRAINER_AUDIO_INSTRUMENT_STORAGE_KEY, false);
    AppState.audioEnabled.virtual = getStoredBool(TRAINER_AUDIO_VIRTUAL_STORAGE_KEY, true);
    AppState.midiOutEnabled.left = getStoredBool(TRAINER_MIDIOUT_LH_STORAGE_KEY, false);
    AppState.midiOutEnabled.right = getStoredBool(TRAINER_MIDIOUT_RH_STORAGE_KEY, false);
    AppState.midiOutEnabled.other = getStoredBool(TRAINER_MIDIOUT_OTHER_STORAGE_KEY, false);
    AppState.midiOutEnabled.instrument = getStoredBool(TRAINER_MIDIOUT_INSTRUMENT_STORAGE_KEY, false);
    AppState.midiOutEnabled.virtual = getStoredBool(TRAINER_MIDIOUT_VIRTUAL_STORAGE_KEY, false);
    AppState.inputVelocityEnabled = getStoredBool(TRAINER_INPUT_VELOCITY_STORAGE_KEY, true);
    AppState.liveLowLatencyMonitoringEnabled = getStoredBool(TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY, false);
    AppState.ledSimulatorVisible = getStoredBool(SETTINGS_LED_SIM_STORAGE_KEY, false);
    AppState.visualPulseEnabled = getStoredBool(VISUAL_PULSE_STORAGE_KEY, true);
    AppState.accentedDownbeatEnabled = getStoredBool(ACCENTED_DOWNBEAT_STORAGE_KEY, true);
    AppState.loopCountInEnabled = getStoredBool(LOOP_COUNT_IN_STORAGE_KEY, true);

    const modeSelect = document.getElementById('select-mode');
    if (modeSelect) modeSelect.value = AppState.mode;

    const feedbackCheckbox = document.getElementById('check-feedback');
    if (feedbackCheckbox) feedbackCheckbox.checked = AppState.feedbackEnabled;

    const futurePreviewCheckbox = document.getElementById('check-future-preview');
    if (futurePreviewCheckbox) futurePreviewCheckbox.checked = AppState.futurePreviewEnabled;

    const correctHighlightCheckbox = document.getElementById('check-correct-highlight');
    if (correctHighlightCheckbox) correctHighlightCheckbox.checked = AppState.correctHighlightEnabled;

    const practiceLeftCheckbox = document.getElementById('practice-lh');
    if (practiceLeftCheckbox) practiceLeftCheckbox.checked = AppState.practice.left;

    const practiceRightCheckbox = document.getElementById('practice-rh');
    if (practiceRightCheckbox) practiceRightCheckbox.checked = AppState.practice.right;

    const audioLeftCheckbox = document.getElementById('enable-staff-lh');
    if (audioLeftCheckbox) audioLeftCheckbox.checked = AppState.audioEnabled.left;

    const audioRightCheckbox = document.getElementById('enable-staff-rh');
    if (audioRightCheckbox) audioRightCheckbox.checked = AppState.audioEnabled.right;

    const audioOtherCheckbox = document.getElementById('enable-other');
    if (audioOtherCheckbox) audioOtherCheckbox.checked = AppState.audioEnabled.other;

    const audioInstrumentCheckbox = document.getElementById('enable-instrument');
    if (audioInstrumentCheckbox) audioInstrumentCheckbox.checked = AppState.audioEnabled.instrument;

    const audioVirtualCheckbox = document.getElementById('enable-virtual-keyboard');
    if (audioVirtualCheckbox) audioVirtualCheckbox.checked = AppState.audioEnabled.virtual;

    const midiOutLeftCheckbox = document.getElementById('enable-midiout-lh');
    if (midiOutLeftCheckbox) midiOutLeftCheckbox.checked = AppState.midiOutEnabled.left;

    const midiOutRightCheckbox = document.getElementById('enable-midiout-rh');
    if (midiOutRightCheckbox) midiOutRightCheckbox.checked = AppState.midiOutEnabled.right;

    const midiOutOtherCheckbox = document.getElementById('enable-midiout-other');
    if (midiOutOtherCheckbox) midiOutOtherCheckbox.checked = AppState.midiOutEnabled.other;

    const midiOutInstrumentCheckbox = document.getElementById('enable-midiout-instrument');
    if (midiOutInstrumentCheckbox) midiOutInstrumentCheckbox.checked = AppState.midiOutEnabled.instrument;

    const midiOutVirtualCheckbox = document.getElementById('enable-midiout-virtual-keyboard');
    if (midiOutVirtualCheckbox) midiOutVirtualCheckbox.checked = AppState.midiOutEnabled.virtual;

    const inputVelocityCheckbox = document.getElementById('check-input-velocity');
    if (inputVelocityCheckbox) inputVelocityCheckbox.checked = AppState.inputVelocityEnabled;

    const liveLowLatencyCheckbox = document.getElementById('check-live-low-latency');
    if (liveLowLatencyCheckbox) liveLowLatencyCheckbox.checked = AppState.liveLowLatencyMonitoringEnabled;

    const pianoVolume = getClampedNumber(TRAINER_PIANO_VOL_STORAGE_KEY, 0, 100, 80);
    updatePianoVolume(pianoVolume);

    const zoomPercent = getClampedNumber(TRAINER_ZOOM_STORAGE_KEY, 50, 200, 100);
    applyZoom(zoomPercent);

    const autoScrollCheckbox = document.getElementById('check-autoscroll');
    if (autoScrollCheckbox) autoScrollCheckbox.checked = getStoredBool(TRAINER_AUTOSCROLL_STORAGE_KEY, true);

    const keyboardCheckbox = document.getElementById('check-keyboard');
    const keyboardVisible = getStoredBool(TRAINER_KEYBOARD_STORAGE_KEY, true);
    if (keyboardCheckbox) keyboardCheckbox.checked = keyboardVisible;
    const keyboardContainer = document.getElementById('virtual-keyboard-container');
    if (keyboardContainer) keyboardContainer.classList.toggle('hidden', !keyboardVisible);

    const debugEnabled = getStoredBool(SETTINGS_DEBUG_STORAGE_KEY, false);
    setDebugEnabled(debugEnabled, { clearHistory: !debugEnabled, logChange: false, reason: 'startup-persisted' });

    const visualPulseCheckbox = document.getElementById('check-visual-pulse');
    if (visualPulseCheckbox) visualPulseCheckbox.checked = AppState.visualPulseEnabled;

    const accentedDownbeatCheckbox = document.getElementById('check-accented-downbeat');
    if (accentedDownbeatCheckbox) accentedDownbeatCheckbox.checked = AppState.accentedDownbeatEnabled;

    const loopCountInCheckbox = document.getElementById('check-loop-countin');
    if (loopCountInCheckbox) loopCountInCheckbox.checked = AppState.loopCountInEnabled;

    const metronomeVolume = getClampedNumber(METRONOME_VOL_STORAGE_KEY, 0, 100, 25);
    updateMetroVolume(metronomeVolume, { save: false });
}

function restoreDefaultPreferences({ reloadDevices = true } = {}) {
    clearSavedPreferences();

    AppState.mode = 'realtime';
    const modeSelect = document.getElementById('select-mode');
    if (modeSelect) modeSelect.value = 'realtime';

    AppState.feedbackEnabled = true;
    const feedbackCheckbox = document.getElementById('check-feedback');
    if (feedbackCheckbox) feedbackCheckbox.checked = true;

    AppState.futurePreviewEnabled = true;
    const futurePreviewCheckbox = document.getElementById('check-future-preview');
    if (futurePreviewCheckbox) futurePreviewCheckbox.checked = true;

    AppState.correctHighlightEnabled = false;
    const correctHighlightCheckbox = document.getElementById('check-correct-highlight');
    if (correctHighlightCheckbox) correctHighlightCheckbox.checked = false;

    AppState.futurePreviewDepth = 1;

    AppState.practice.left = true;
    AppState.practice.right = true;
    const practiceLeftCheckbox = document.getElementById('practice-lh');
    if (practiceLeftCheckbox) practiceLeftCheckbox.checked = true;
    const practiceRightCheckbox = document.getElementById('practice-rh');
    if (practiceRightCheckbox) practiceRightCheckbox.checked = true;

    AppState.audioEnabled.left = true;
    AppState.audioEnabled.right = true;
    AppState.audioEnabled.other = false;
    AppState.audioEnabled.instrument = false;
    AppState.audioEnabled.virtual = true;
    const audioLeftCheckbox = document.getElementById('enable-staff-lh');
    if (audioLeftCheckbox) audioLeftCheckbox.checked = true;
    const audioRightCheckbox = document.getElementById('enable-staff-rh');
    if (audioRightCheckbox) audioRightCheckbox.checked = true;
    const audioOtherCheckbox = document.getElementById('enable-other');
    if (audioOtherCheckbox) audioOtherCheckbox.checked = false;
    const audioInstrumentCheckbox = document.getElementById('enable-instrument');
    if (audioInstrumentCheckbox) audioInstrumentCheckbox.checked = false;
    const audioVirtualCheckbox = document.getElementById('enable-virtual-keyboard');
    if (audioVirtualCheckbox) audioVirtualCheckbox.checked = true;

    AppState.midiOutEnabled.left = false;
    AppState.midiOutEnabled.right = false;
    AppState.midiOutEnabled.other = false;
    AppState.midiOutEnabled.instrument = false;
    AppState.midiOutEnabled.virtual = false;
    const midiOutLhCheckbox = document.getElementById('enable-midiout-lh');
    if (midiOutLhCheckbox) midiOutLhCheckbox.checked = false;
    const midiOutRhCheckbox = document.getElementById('enable-midiout-rh');
    if (midiOutRhCheckbox) midiOutRhCheckbox.checked = false;
    const midiOutOtherCheckbox = document.getElementById('enable-midiout-other');
    if (midiOutOtherCheckbox) midiOutOtherCheckbox.checked = false;
    const midiOutInstrumentCheckbox = document.getElementById('enable-midiout-instrument');
    if (midiOutInstrumentCheckbox) midiOutInstrumentCheckbox.checked = false;
    const midiOutVirtualCheckbox = document.getElementById('enable-midiout-virtual-keyboard');
    if (midiOutVirtualCheckbox) midiOutVirtualCheckbox.checked = false;

    updatePianoVolume(80);
    applyZoom(100);

    const autoScrollCheckbox = document.getElementById('check-autoscroll');
    if (autoScrollCheckbox) autoScrollCheckbox.checked = true;

    const keyboardCheckbox = document.getElementById('check-keyboard');
    if (keyboardCheckbox) keyboardCheckbox.checked = true;
    const keyboardContainer = document.getElementById('virtual-keyboard-container');
    if (keyboardContainer) keyboardContainer.classList.remove('hidden');

    AppState.ledSimulatorVisible = false;
    const ledSimulatorCheckbox = document.getElementById('check-led-simulator');
    if (ledSimulatorCheckbox) ledSimulatorCheckbox.checked = false;

    AppState.visualPulseEnabled = true;
    const visualPulseCheckbox = document.getElementById('check-visual-pulse');
    if (visualPulseCheckbox) visualPulseCheckbox.checked = true;

    AppState.accentedDownbeatEnabled = true;
    const accentedDownbeatCheckbox = document.getElementById('check-accented-downbeat');
    if (accentedDownbeatCheckbox) accentedDownbeatCheckbox.checked = true;

    AppState.loopCountInEnabled = true;
    const loopCountInCheckbox = document.getElementById('check-loop-countin');
    if (loopCountInCheckbox) loopCountInCheckbox.checked = true;

    updateMetroVolume(25, { save: true });

    setDebugEnabled(false, { clearHistory: true, logChange: false, reason: 'reset-defaults' });

    setPlayerPianoType(88);
    setLedCount(88);
    setLedMasterBrightness(40);
    setLedFuture1BrightnessPct(10);
    setLedFuture2BrightnessPct(10);
    resetAllLedCalibration();

    setWledIp('');
    setLedOutputMode('none');

    const midiInSelect = document.getElementById('midi-in');
    if (midiInSelect) {
        midiInSelect.value = 'none';
        midiInSelect.dispatchEvent(new Event('change'));
    }

    const midiOutSelect = document.getElementById('midi-out');
    if (midiOutSelect) {
        midiOutSelect.value = 'none';
        midiOutSelect.dispatchEvent(new Event('change'));
    }
    const midiOutChannelSelect = document.getElementById('midi-out-channel');
    if (midiOutChannelSelect) {
        midiOutChannelSelect.value = '1';
        midiOutChannelSelect.dispatchEvent(new Event('change'));
    }

    const midiLightsSelect = document.getElementById('midi-lights');
    if (midiLightsSelect) {
        midiLightsSelect.value = 'none';
        midiLightsSelect.dispatchEvent(new Event('change'));
    }
    const midiLightsChannelSelect = document.getElementById('midi-lights-channel');
    if (midiLightsChannelSelect) {
        midiLightsChannelSelect.value = '1';
        midiLightsChannelSelect.dispatchEvent(new Event('change'));
    }

    const defaults = getDefaultStaffAssignment();
    const assignLeft = document.getElementById('assign-lh');
    if (assignLeft) assignLeft.value = formatStaffAssignmentValue(defaults.left);
    const assignRight = document.getElementById('assign-rh');
    if (assignRight) assignRight.value = formatStaffAssignmentValue(defaults.right);
    syncHandAssignmentFromControls();

    applyModeSettings();
    syncLedBrightnessControls();
    syncLedOutputModeControls();
    LedEngine.renderSimulator();
    renderLooper();
    renderVirtualKeyboard();
    positionLedCalibrationPanel();

    if (reloadDevices) {
        populateMIDIDevices();
    }
}

// LED helpers, simulator, hardware protocol, and WLED transport now live in js/led.js.

// ==========================================
// INITIALIZE AUDIO ENGINES
// ==========================================

// ===== Score renderer + transport primitives =====

let osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay("osmd-container", {
    autoResize: false, 
    drawTitle: true
});

const masterPianoVolume = new Tone.Volume(0).toDestination();

const pianoSampler = new Tone.Sampler({
    urls: {
        "A0": "A0.mp3", "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
        "A1": "A1.mp3", "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
        "A2": "A2.mp3", "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
        "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
        "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
        "A5": "A5.mp3", "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
        "A6": "A6.mp3", "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
        "A7": "A7.mp3", "C8": "C8.mp3"
    },
    release: 1,
    baseUrl: "assets/audio/salamander/"
}).connect(masterPianoVolume);

let pianoSamplerReady = false;
let pianoSamplerReadyPromise = null;

function ensurePianoSamplerLoaded() {
    if (pianoSamplerReady) return Promise.resolve(true);
    if (!pianoSamplerReadyPromise) {
        pianoSamplerReadyPromise = Promise.resolve(typeof Tone.loaded === 'function' ? Tone.loaded() : null)
            .then(() => {
                pianoSamplerReady = true;
                return true;
            })
            .catch((err) => {
                console.warn('Piano sampler assets did not finish loading.', err);
                throw err;
            });
    }
    return pianoSamplerReadyPromise;
}

function getSamplerNoteName(midi) {
    const value = Number(midi);
    if (!Number.isFinite(value)) return null;
    try {
        return Tone.Frequency(value, 'midi').toNote();
    } catch (_) {
        return null;
    }
}

const metronomeSynth = new Tone.MembraneSynth({
    pitchDecay: 0.008,
    octaves: 1.5,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.01 }
}).toDestination();

let lastTempoPulseAtMs = -Infinity;
let tempoPulseTimeoutId = null;
let tempoPulseScheduleId = null;
let scheduledMetronomeEventIds = [];
let measureTimingCache = [];
let waitMetronomeTimeoutId = null;
let waitMetronomeBeatCounter = 0;
let waitMetronomeNumerator = 4;
let waitMetronomeNextClickAtSec = null;
let waitMetronomeActiveMeasureIndex = -1;

function getMetronomeClickSpec(isDownbeat) {
    if (isDownbeat && AppState.accentedDownbeatEnabled !== false) {
        return { note: 'G6', velocity: 0.95 };
    }
    return { note: 'C6', velocity: 0.7 };
}


function clearTempoVisualPulse() {
    const tempoButton = document.getElementById('btn-tempo');
    if (tempoButton) tempoButton.classList.remove('metronome-pulse');
    if (tempoPulseTimeoutId) {
        clearTimeout(tempoPulseTimeoutId);
        tempoPulseTimeoutId = null;
    }
    if (tempoPulseScheduleId) {
        clearTimeout(tempoPulseScheduleId);
        tempoPulseScheduleId = null;
    }
}

function triggerTempoVisualPulse(time = null) {
    if (!AppState.visualPulseEnabled) return;
    const tempoButton = document.getElementById('btn-tempo');
    if (!tempoButton) return;

    const firePulse = () => {
        tempoPulseScheduleId = null;
        const now = performance.now();
        if ((now - lastTempoPulseAtMs) < 120) return;
        lastTempoPulseAtMs = now;

        tempoButton.classList.remove('metronome-pulse');
        void tempoButton.offsetWidth;
        tempoButton.classList.add('metronome-pulse');

        if (tempoPulseTimeoutId) clearTimeout(tempoPulseTimeoutId);
        tempoPulseTimeoutId = window.setTimeout(() => {
            tempoButton.classList.remove('metronome-pulse');
            tempoPulseTimeoutId = null;
        }, 170);
    };

    if (typeof time === 'number') {
        const delayMs = Math.max(0, ((time - Tone.now()) * 1000) - 8);
        if (tempoPulseScheduleId) clearTimeout(tempoPulseScheduleId);
        tempoPulseScheduleId = window.setTimeout(firePulse, delayMs);
    } else {
        firePulse();
    }
}

function clearScheduledMetronomeEvents() {
    if (!scheduledMetronomeEventIds.length) return;
    scheduledMetronomeEventIds.forEach((id) => clearTimeout(id));
    scheduledMetronomeEventIds = [];
}

function stopWaitModeMetronome() {
    if (waitMetronomeTimeoutId) {
        clearTimeout(waitMetronomeTimeoutId);
        waitMetronomeTimeoutId = null;
    }
    waitMetronomeBeatCounter = 0;
    waitMetronomeNumerator = 4;
    waitMetronomeNextClickAtSec = null;
    waitMetronomeActiveMeasureIndex = -1;
}

function getMetronomeTimeSignatureNumerator(measureIndex) {
    const timing = getMeasureTimingInfo(Math.max(0, Number(measureIndex) || 0));
    return Math.max(1, Number(timing?.numerator) || 4);
}

function scheduleNextWaitModeMetronomeTick(referenceTimeSec = null) {
    if (waitMetronomeTimeoutId) {
        clearTimeout(waitMetronomeTimeoutId);
        waitMetronomeTimeoutId = null;
    }

    if (!AppState.isPlaying || AppState.countInActive || AppState.mode !== 'wait') return;
    if (!document.getElementById('check-metronome')?.checked) return;

    const currentRunningBpm = Math.max(1, AppState.baseBpm * AppState.speedPercent);
    const beatDurationSec = 60 / currentRunningBpm;
    const nowSec = Tone.now();
    const targetTimeSec = Number.isFinite(referenceTimeSec)
        ? Math.max(nowSec, referenceTimeSec)
        : Math.max(nowSec, waitMetronomeNextClickAtSec ?? nowSec);

    waitMetronomeNextClickAtSec = targetTimeSec;

    const delayMs = Math.max(0, ((targetTimeSec - nowSec) * 1000) - 8);
    waitMetronomeTimeoutId = window.setTimeout(() => {
        waitMetronomeTimeoutId = null;

        if (!AppState.isPlaying || AppState.countInActive || AppState.mode !== 'wait') return;
        if (!document.getElementById('check-metronome')?.checked) return;

        const isDownbeat = waitMetronomeBeatCounter === 0;
        const clickSpec = getMetronomeClickSpec(isDownbeat);
        metronomeSynth.triggerAttackRelease(clickSpec.note, '64n', Tone.now(), clickSpec.velocity);
        triggerTempoVisualPulse();

        waitMetronomeBeatCounter = (waitMetronomeBeatCounter + 1) % Math.max(1, waitMetronomeNumerator || 4);
        waitMetronomeNextClickAtSec = targetTimeSec + beatDurationSec;
        scheduleNextWaitModeMetronomeTick(waitMetronomeNextClickAtSec);
    }, delayMs);
}

function startWaitModeMetronome(measureIndex) {
    if (!AppState.isPlaying || AppState.countInActive || AppState.mode !== 'wait') return;
    if (!document.getElementById('check-metronome')?.checked) {
        stopWaitModeMetronome();
        return;
    }

    waitMetronomeActiveMeasureIndex = Math.max(0, Number(measureIndex) || 0);
    waitMetronomeNumerator = getMetronomeTimeSignatureNumerator(waitMetronomeActiveMeasureIndex);
    waitMetronomeBeatCounter = 0;
    waitMetronomeNextClickAtSec = Tone.now();
    scheduleNextWaitModeMetronomeTick(waitMetronomeNextClickAtSec);
}

function rebuildWaitModeMetronome(measureIndex = waitMetronomeActiveMeasureIndex) {
    stopWaitModeMetronome();
    if (!AppState.isPlaying || AppState.countInActive || AppState.mode !== 'wait') return;
    startWaitModeMetronome(measureIndex);
}

function getMeasureTimingInfo(measureIndex) {
    const measure = osmd?.Sheet?.SourceMeasures?.[measureIndex] || null;
    const cached = measureTimingCache[measureIndex] || null;
    const activeTimeSignature = measure?.ActiveTimeSignature || osmd?.Sheet?.SourceMeasures?.[0]?.ActiveTimeSignature || null;
    const numerator = Math.max(1, Number(activeTimeSignature?.Numerator) || 4);
    const denominator = Math.max(1, Number(activeTimeSignature?.Denominator) || 4);
    const beatLengthWhole = 1 / denominator;
    const nominalMeasureLengthWhole = numerator * beatLengthWhole;
    const startTimestamp = Number.isFinite(cached?.startTimestamp) ? cached.startTimestamp : 0;

    return {
        numerator,
        denominator,
        beatLengthWhole,
        nominalMeasureLengthWhole,
        actualLengthWhole: Number.isFinite(cached?.actualLengthWhole) ? cached.actualLengthWhole : nominalMeasureLengthWhole,
        startTimestamp
    };
}

function rebuildMeasureTimingCache() {
    const cursor = osmd?.cursor;
    if (!cursor?.Iterator) {
        measureTimingCache = [];
        return measureTimingCache;
    }

    const savedMeasureIndex = cursor.Iterator.CurrentMeasureIndex;
    const savedTimestamp = cursor.Iterator.currentTimeStamp?.RealValue ?? null;
    const totalMeasures = osmd?.Sheet?.SourceMeasures?.length || 0;
    const nextStarts = new Array(totalMeasures).fill(null);
    const firstEvents = new Array(totalMeasures).fill(null);

    cursor.reset();
    const safetyMax = 100000;
    let safety = 0;
    let previousMeasureIndex = null;

    while (!cursor.Iterator.EndReached && safety < safetyMax) {
        const measureIndex = cursor.Iterator.CurrentMeasureIndex;
        const timestamp = cursor.Iterator.currentTimeStamp?.RealValue ?? null;

        if (firstEvents[measureIndex] == null && Number.isFinite(timestamp)) {
            firstEvents[measureIndex] = timestamp;
        }

        if (previousMeasureIndex != null && measureIndex !== previousMeasureIndex && nextStarts[previousMeasureIndex] == null && Number.isFinite(timestamp)) {
            nextStarts[previousMeasureIndex] = timestamp;
        }

        previousMeasureIndex = measureIndex;
        cursor.Iterator.moveToNext();
        safety += 1;
    }

    measureTimingCache = [];
    let runningStart = 0;
    for (let i = 0; i < totalMeasures; i++) {
        const measure = osmd?.Sheet?.SourceMeasures?.[i] || null;
        const activeTimeSignature = measure?.ActiveTimeSignature || osmd?.Sheet?.SourceMeasures?.[0]?.ActiveTimeSignature || null;
        const numerator = Math.max(1, Number(activeTimeSignature?.Numerator) || 4);
        const denominator = Math.max(1, Number(activeTimeSignature?.Denominator) || 4);
        const nominalMeasureLengthWhole = numerator / denominator;
        const firstTimestamp = Number.isFinite(firstEvents[i]) ? firstEvents[i] : null;
        const explicitStart = firstTimestamp != null ? firstTimestamp : runningStart;
        const nextStart = Number.isFinite(nextStarts[i]) ? nextStarts[i] : null;
        const actualLengthWhole = (nextStart != null && Number.isFinite(explicitStart))
            ? Math.max(0, nextStart - explicitStart)
            : nominalMeasureLengthWhole;

        measureTimingCache[i] = {
            startTimestamp: explicitStart,
            actualLengthWhole,
            nominalMeasureLengthWhole,
            numerator,
            denominator
        };

        runningStart = explicitStart + actualLengthWhole;
    }

    restoreCursorToMeasureAndTimestamp(savedMeasureIndex, savedTimestamp);
    return measureTimingCache;
}

function scheduleMetronomeForPlaybackWindow(startTimeSec, currentMeasureIdx, currentTimestamp, windowLengthSec, beatsToWait) {
    clearScheduledMetronomeEvents();

    if (!AppState.isPlaying || AppState.countInActive) {
        stopWaitModeMetronome();
        return;
    }
    if (!document.getElementById('check-metronome')?.checked) {
        stopWaitModeMetronome();
        return;
    }
    if (AppState.mode === 'wait') {
        if (waitMetronomeTimeoutId == null && waitMetronomeNextClickAtSec == null) {
            startWaitModeMetronome(currentMeasureIdx);
        }
        return;
    }
    stopWaitModeMetronome();
    if (!Number.isFinite(startTimeSec) || !Number.isFinite(currentTimestamp) || !Number.isFinite(windowLengthSec) || windowLengthSec < 0) return;

    const endTimestamp = currentTimestamp + ((Number.isFinite(beatsToWait) ? beatsToWait : 0) / 4);
    const epsilonWhole = 1e-7;

    let measureIndex = currentMeasureIdx;
    while (measureIndex < measureTimingCache.length) {
        const timing = getMeasureTimingInfo(measureIndex);
        const measureStart = timing.startTimestamp;
        const measureEnd = measureStart + Math.max(timing.actualLengthWhole || 0, timing.nominalMeasureLengthWhole || 0);

        if (measureEnd <= currentTimestamp + epsilonWhole) {
            measureIndex += 1;
            continue;
        }
        if (measureStart >= endTimestamp - epsilonWhole) {
            break;
        }

        const localStart = Math.max(currentTimestamp, measureStart);
        const localEnd = Math.min(endTimestamp, measureEnd);
        const firstBeatIndex = Math.max(0, Math.ceil(((localStart - measureStart) / timing.beatLengthWhole) - epsilonWhole));
        const maxBeatIndex = timing.numerator - 1;

        for (let beatIndex = firstBeatIndex; beatIndex <= maxBeatIndex; beatIndex++) {
            const beatTimestamp = measureStart + (beatIndex * timing.beatLengthWhole);
            if (beatTimestamp < localStart - epsilonWhole) continue;
            if (beatTimestamp >= localEnd - epsilonWhole) continue;

            const beatOffsetWhole = beatTimestamp - currentTimestamp;
            const beatOffsetSec = (beatOffsetWhole * 4) * (windowLengthSec / Math.max(epsilonWhole, endTimestamp - currentTimestamp));
            const clickTimeSec = startTimeSec + Math.max(0, beatOffsetSec);
            const delayMs = Math.max(0, ((clickTimeSec - Tone.now()) * 1000) - 8);
            const isDownbeat = beatIndex === 0;
            const clickSpec = getMetronomeClickSpec(isDownbeat);
            const timeoutId = window.setTimeout(() => {
                if (!AppState.isPlaying || AppState.countInActive) return;
                if (!document.getElementById('check-metronome')?.checked) return;
                metronomeSynth.triggerAttackRelease(clickSpec.note, '64n', Tone.now(), clickSpec.velocity);
                triggerTempoVisualPulse();
            }, delayMs);
            scheduledMetronomeEventIds.push(timeoutId);
        }

        measureIndex += 1;
    }
}


// ==========================================
// SCORING DISPLAY LOGIC
// ==========================================

// ===== Score loading + file entry points =====

function updateScoreDisplay() {
    const total = AppState.score.correct + AppState.score.wrong;
    let percentage = 100;
    
    if (total > 0) {
        percentage = Math.round((AppState.score.correct / total) * 100);
    }
    
    document.getElementById('live-score').innerText = `${percentage}%`;
}


// ==========================================
// FILE LOADER & UI INIT
// ==========================================
function openScoreFilePicker() {
    if (Tone.context.state !== 'running') Tone.context.resume();
    document.getElementById('file-input').click();
}
window.openScoreFilePicker = openScoreFilePicker;

function getScoreFileTypeFromName(fileName = '') {
    const lowered = String(fileName || '').toLowerCase();
    if (lowered.endsWith('.mxl')) return 'mxl';
    if (lowered.endsWith('.musicxml')) return 'musicxml';
    return 'xml';
}

function getScoreDisplayTitle(fileName = '', fallback = 'Untitled Score') {
    const base = String(fileName || '').trim();
    if (!base) return fallback;
    return base.replace(/\.(musicxml|xml|mxl)$/i, '').trim() || fallback;
}

function readScoreFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('Could not read score file.'));
        reader.onload = () => {
            resolve({
                rawData: reader.result,
                fileName: file.name || 'Untitled Score',
                fileType: getScoreFileTypeFromName(file.name || ''),
                title: getScoreDisplayTitle(file.name || '')
            });
        };

        if ((file.name || '').match(/\.(mxl)$/i)) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    });
}

function getOsmdLoadPayload(rawData, fileType = 'xml', fileName = 'Untitled Score') {
    const resolvedType = String(fileType || getScoreFileTypeFromName(fileName || '') || 'xml').toLowerCase();
    if (resolvedType !== 'mxl') return rawData;

    if (rawData instanceof Blob) return rawData;
    if (rawData instanceof ArrayBuffer) {
        return new Blob([rawData], { type: 'application/vnd.recordare.musicxml+xml' });
    }
    if (ArrayBuffer.isView(rawData)) {
        return new Blob([rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength)], {
            type: 'application/vnd.recordare.musicxml+xml'
        });
    }

    return rawData;
}

async function loadScoreIntoApp(rawData, { fileName = 'Untitled Score', fileType = 'xml', libraryScoreId = null, title = null } = {}) {
    try {
        const osmdLoadPayload = getOsmdLoadPayload(rawData, fileType, fileName);
        await osmd.load(osmdLoadPayload);
        renderScoreAndRefreshGeometry();
        initSongUI();

        if (osmd.cursor) {
            osmd.cursor.reset();
            osmd.cursor.show();
            osmd.cursor.update();
            handleAutoScroll();
        }

        AppState.ledPreviewTimeline = [];
        AppState.ledPreviewTimelineDirty = true;
        AppState.ledPreviewTraversalIndex = -1;
        AppState.lastLedPreviewEvents = [];

        AppState.currentScoreData = rawData;
        AppState.currentScoreFileName = fileName || 'Untitled Score';
        AppState.currentScoreFileType = fileType || getScoreFileTypeFromName(fileName);
        AppState.currentScoreLibraryId = libraryScoreId ?? null;
        AppState.currentScoreTitle = title || getScoreDisplayTitle(fileName || '');

        if (libraryScoreId && window.ScoreLibrary) {
            await ScoreLibrary.markScoreOpened(libraryScoreId);
            await refreshScoresDrawer();
        }

        console.error('File loaded successfully.');
        if (AppState.debugEventFlow || AppState.debugMatchLogs || AppState.debugAnchorResolution || AppState.debugPersistentAnchors) {
            console.error('[PianoTrainer debug LOAD] console logging active', {
                debugAnchors: AppState.debugPersistentAnchors,
                debugEventFlow: AppState.debugEventFlow,
                debugMatchLogs: AppState.debugMatchLogs,
                debugStickyFrames: AppState.debugStickyFrameLimit,
                expectedNotes: AppState.expectedNotes ? AppState.expectedNotes.length : null,
                ts: new Date().toISOString()
            });
        }
    } catch (err) {
        console.error('OSMD Load Error:', err);
        alert('Error loading XML file.');
        throw err;
    }
}

async function handleDirectScoreFileSelection(file) {
    if (!file) return;

    if ((file.name || '').match(/\.(mid|midi)$/i)) {
        alert('Piano Trainer strictly requires MusicXML (.xml or .mxl) files to render sheet music.');
        return;
    }

    const scoreFile = await readScoreFile(file);
    await loadScoreIntoApp(scoreFile.rawData, scoreFile);
}

document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    try {
        await handleDirectScoreFileSelection(file);
    } finally {
        e.target.value = '';
    }
});


let globalStaffIdentityMap = new Map();

function rebuildGlobalStaffIdentityMap() {
    globalStaffIdentityMap = new Map();

    const instruments = osmd?.Sheet?.Instruments || osmd?.Sheet?.instruments || [];
    let nextGlobalStaffId = 1;

    instruments.forEach(instrument => {
        const staves = instrument?.Staves || instrument?.staves || instrument?.Staffs || instrument?.staffs || [];
        staves.forEach(staff => {
            if (staff && !globalStaffIdentityMap.has(staff)) {
                globalStaffIdentityMap.set(staff, nextGlobalStaffId++);
            }
        });
    });
}

function getResolvedStaffAssignmentIdFromNote(note) {
    const staffCandidates = [
        note?.ParentStaff,
        note?.parentStaff,
        note?.ParentVoiceEntry?.ParentSourceStaffEntry?.ParentStaff,
        note?.parentVoiceEntry?.parentSourceStaffEntry?.parentStaff,
        note?.SourceStaff,
        note?.sourceStaff
    ].filter(Boolean);

    for (const staff of staffCandidates) {
        if (globalStaffIdentityMap.has(staff)) {
            return globalStaffIdentityMap.get(staff);
        }
    }

    const fallbackId = Number(staffCandidates[0]?.id ?? note?.ParentStaff?.id ?? note?.parentStaff?.id);
    return Number.isFinite(fallbackId) ? fallbackId : null;
}

function getResolvedStaffAssignmentIdFromEntry(entry) {
    const firstNote = entry?.Notes?.[0] || entry?.notes?.[0] || null;
    return getResolvedStaffAssignmentIdFromNote(firstNote);
}

window.getResolvedStaffAssignmentIdFromNote = getResolvedStaffAssignmentIdFromNote;
window.getResolvedStaffAssignmentIdFromEntry = getResolvedStaffAssignmentIdFromEntry;
window.getAssignedHandRoleForStaff = getAssignedHandRoleForStaff;

function syncHandAssignmentFromControls({ refreshCurrentFrame = false } = {}) {
    const lhAssign = document.getElementById('assign-lh');
    const rhAssign = document.getElementById('assign-rh');
    if (!lhAssign || !rhAssign) return;

    const nextLeft = parseStaffAssignmentValue(lhAssign.value);
    const nextRight = parseStaffAssignmentValue(rhAssign.value);
    if (nextRight == null) return;

    AppState.hands.left = nextLeft;
    AppState.hands.right = nextRight;
    AppState.ledPreviewTimelineDirty = true;
    AppState.lastLedPreviewEvents = [];

    if (!refreshCurrentFrame || !osmd?.cursor?.Iterator) {
        renderVirtualKeyboard();
        return;
    }

    const entries = osmd.cursor.Iterator.CurrentVoiceEntries || [];
    const currentMeasureIdx = osmd.cursor.Iterator.CurrentMeasureIndex;
    const currentTimestamp = osmd.cursor.Iterator.currentTimeStamp?.RealValue ?? null;

    if (entries.length > 0 && currentMeasureIdx != null) {
        buildExpectedNotesFromEntries(entries, currentMeasureIdx);
        renderVirtualKeyboard(entries, currentMeasureIdx, currentTimestamp);
    } else {
        AppState.expectedNotes = [];
        AppState.visualNotesToStart = [];
        AppState.outOfRangeCurrentNotes = [];
        renderVirtualKeyboard();
    }
}

function bindHandAssignmentControls() {
    const lhAssign = document.getElementById('assign-lh');
    const rhAssign = document.getElementById('assign-rh');
    if (!lhAssign || !rhAssign || lhAssign.dataset.boundHandAssign === 'true') return;

    const handleChange = () => {
        syncHandAssignmentFromControls({ refreshCurrentFrame: true });
    };

    lhAssign.dataset.boundHandAssign = 'true';
    rhAssign.dataset.boundHandAssign = 'true';
    lhAssign.addEventListener('change', handleChange);
    rhAssign.addEventListener('change', handleChange);
}

function initSongUI() {
    rebuildGlobalStaffIdentityMap();
    rebuildMeasureTimingCache();

    const totalMeasures = osmd.GraphicSheet.MeasureList.length;
    document.getElementById('slider-loop-max').max = totalMeasures;
    document.getElementById('slider-loop-min').max = totalMeasures;
    document.getElementById('val-loop-max').value = totalMeasures;
    document.getElementById('val-loop-min').value = 1;
    AppState.looper.min = 1;
    AppState.looper.max = totalMeasures;
    
    if (osmd.Sheet.SourceMeasures.length > 0 && osmd.Sheet.SourceMeasures[0].TempoInBPM) {
        AppState.baseBpm = osmd.Sheet.SourceMeasures[0].TempoInBPM;
    } else {
        AppState.baseBpm = 120; 
    }
    
    updateTempo('percent', AppState.speedPercent * 100);
    
    const stavesCount = osmd.GraphicSheet.MeasureList[0].length;
    const lhAssign = document.getElementById('assign-lh');
    const rhAssign = document.getElementById('assign-rh');
    lhAssign.innerHTML = ""; rhAssign.innerHTML = "";
    
    lhAssign.innerHTML = '<option value="">-</option>';
    rhAssign.innerHTML = '';

    for(let i = 1; i <= stavesCount; i++) {
        lhAssign.innerHTML += `<option value="${i}">${i}</option>`;
        rhAssign.innerHTML += `<option value="${i}">${i}</option>`;
    }

    const defaults = getDefaultStaffAssignment();
    lhAssign.value = formatStaffAssignmentValue(defaults.left);
    rhAssign.value = formatStaffAssignmentValue(defaults.right);
    bindHandAssignmentControls();
    syncHandAssignmentFromControls();
    
    AppState.score.correct = 0;
    AppState.score.wrong = 0;
    updateScoreDisplay();
    renderLooper(); 
}

// feedback-engine.js owns feedback-note anchor resolution, expected-note matching,
// and overlay placement. Keep that subsystem isolated from playback/render refactors.


// ===== Virtual keyboard + LED preview coordination =====

function getLedPreviewHandStatePrefix(staffId) {
    return getAssignedHandRoleForStaff(staffId) === 'left' ? 'l' : 'r';
}

function isPracticeHandEnabledForStaff(staffId) {
    const handRole = getAssignedHandRoleForStaff(staffId);
    return (handRole === 'right' && AppState.practice.right) || (handRole === 'left' && AppState.practice.left);
}

function getFuturePreviewDepth() {
    if (!AppState.futurePreviewEnabled) return 0;
    return AppState.futurePreviewEnabled ? 1 : 0;
}

function isRenderableAttackNote(note) {
    if (!note || (note.isRest && note.isRest())) return false;

    const isInvisibleCue =
        note.Notehead === 'none' ||
        note.PrintObject === false ||
        note.isCueNote === true;

    if (isInvisibleCue) return false;

    const tie = note.NoteTie;
    const isTieContinuation = !!(tie && tie.StartNote && tie.StartNote !== note);
    if (isTieContinuation) return false;

    return true;
}

function describeEntryCollectionForLedDebug(entries, measureIndex = null, timestamp = null) {
    if (!entries || entries.length === 0) {
        return { measureIndex, timestamp, notes: [] };
    }

    const notes = [];
    entries.forEach(entry => {
        (entry.Notes || []).forEach(note => {
            notes.push({
                staffId: getResolvedStaffAssignmentIdFromNote(note),
                midi: note?.halfTone != null ? note.halfTone + 12 : null,
                isRest: !!(note?.isRest && note.isRest()),
                isTieContinuation: !!(note?.NoteTie && note.NoteTie.StartNote && note.NoteTie.StartNote !== note)
            });
        });
    });

    return { measureIndex, timestamp, notes };
}

function collectRenderablePreviewNotesFromEntries(entries, previewDepthIndex) {
    const mergedNotes = new Map();

    (entries || []).forEach(entry => {
        (entry?.Notes || []).forEach(note => {
            const staffId = getResolvedStaffAssignmentIdFromNote(note);
            if (!isPracticeHandEnabledForStaff(staffId)) return;
            if (!isRenderableAttackNote(note)) return;

            const midi = note.halfTone + 12;
            if (!isMidiInPlayerRange(midi)) return;
            const key = `${staffId}|${midi}`;
            if (!mergedNotes.has(key)) {
                mergedNotes.set(key, {
                    midi,
                    staffId,
                    state: `future${previewDepthIndex}-${getLedPreviewHandStatePrefix(staffId)}`
                });
            }
        });
    });

    return Array.from(mergedNotes.values());
}

function makeLedPreviewEntrySignature(entries) {
    const parts = [];

    (entries || []).forEach(entry => {
        (entry?.Notes || []).forEach(note => {
            const staffId = Number(note?.ParentStaff?.id) || 0;
            const midi = note?.halfTone != null ? note.halfTone + 12 : 'rest';
            const length = note?.Length?.RealValue ?? 'na';
            const tieState = (note?.NoteTie && note.NoteTie.StartNote && note.NoteTie.StartNote !== note) ? 'tiecont' : 'attack';
            const restFlag = (note?.isRest && note.isRest()) ? 'rest' : 'note';
            parts.push(`${staffId}:${midi}:${length}:${tieState}:${restFlag}`);
        });
    });

    parts.sort();
    return parts.join('|');
}

function buildLedPreviewTimelineEvent(entries, measureIndex, timestamp) {
    return {
        measureIndex,
        timestamp,
        signature: makeLedPreviewEntrySignature(entries),
        notes: collectRenderablePreviewNotesFromEntries(entries, 1)
    };
}


// WARNING:
// Cursor restoration is shared by LED preview traversal and score-navigation work.
// Preserve current iterator stepping assumptions until repeat/jump handling is stabilized.
function restoreCursorToMeasureAndTimestamp(targetMeasureIndex, targetTimestamp) {
    if (!osmd?.cursor) return;

    osmd.cursor.reset();

    const safetyMax = 100000;
    let safety = 0;
    while (!osmd.cursor.Iterator.EndReached && safety < safetyMax) {
        const measureIndex = osmd.cursor.Iterator.CurrentMeasureIndex;
        const timestamp = osmd.cursor.Iterator.currentTimeStamp?.RealValue ?? null;
        if (measureIndex === targetMeasureIndex && timestamp === targetTimestamp) {
            break;
        }
        osmd.cursor.Iterator.moveToNext();
        safety += 1;
    }

    osmd.cursor.update();
}

function ensureLedPreviewTimelineBuilt() {
    if (!AppState.ledPreviewTimelineDirty && Array.isArray(AppState.ledPreviewTimeline) && AppState.ledPreviewTimeline.length > 0) {
        return AppState.ledPreviewTimeline;
    }

    const cursor = osmd?.cursor;
    if (!cursor?.Iterator) {
        AppState.ledPreviewTimeline = [];
        return AppState.ledPreviewTimeline;
    }

    const savedMeasureIndex = cursor.Iterator.CurrentMeasureIndex;
    const savedTimestamp = cursor.Iterator.currentTimeStamp?.RealValue ?? null;

    const timeline = [];
    const safetyMax = 100000;
    let safety = 0;

    cursor.reset();

    while (!cursor.Iterator.EndReached && safety < safetyMax) {
        const entries = cursor.Iterator.CurrentVoiceEntries;
        if (entries && entries.length > 0) {
            timeline.push(buildLedPreviewTimelineEvent(
                entries,
                cursor.Iterator.CurrentMeasureIndex,
                cursor.Iterator.currentTimeStamp?.RealValue ?? null
            ));
        }

        cursor.Iterator.moveToNext();
        safety += 1;
    }

    restoreCursorToMeasureAndTimestamp(savedMeasureIndex, savedTimestamp);

    AppState.ledPreviewTimeline = timeline;
    AppState.ledPreviewTimelineDirty = false;
    AppState.ledPreviewTraversalIndex = -1;

    return timeline;
}

function findMatchingLedPreviewTimelineIndex(timeline, measureIndex, timestamp, signature, startIndex = 0) {
    if (!Array.isArray(timeline) || timeline.length === 0) return -1;

    for (let i = Math.max(0, startIndex); i < timeline.length; i++) {
        const event = timeline[i];
        if (event.measureIndex === measureIndex && event.timestamp === timestamp && event.signature === signature) {
            return i;
        }
    }

    return -1;
}


function resolveLedPreviewTraversalIndex(currentEntries, currentMeasureIdx, currentTimestamp) {
    const timeline = ensureLedPreviewTimelineBuilt();
    if (!timeline.length) return -1;

    const signature = makeLedPreviewEntrySignature(currentEntries);
    const currentIndex = AppState.ledPreviewTraversalIndex;

    if (currentIndex >= 0 && currentIndex < timeline.length) {
        const currentEvent = timeline[currentIndex];
        if (currentEvent.measureIndex === currentMeasureIdx && currentEvent.timestamp === currentTimestamp && currentEvent.signature === signature) {
            return currentIndex;
        }
    }

    const forwardIndex = findMatchingLedPreviewTimelineIndex(
        timeline,
        currentMeasureIdx,
        currentTimestamp,
        signature,
        currentIndex >= 0 ? currentIndex + 1 : 0
    );
    if (forwardIndex !== -1) {
        AppState.ledPreviewTraversalIndex = forwardIndex;
        return forwardIndex;
    }

    const restartIndex = findMatchingLedPreviewTimelineIndex(timeline, currentMeasureIdx, currentTimestamp, signature, 0);
    AppState.ledPreviewTraversalIndex = restartIndex;
    return restartIndex;
}

function collectFutureLedPreviewEvents(currentEntries, currentMeasureIdx, currentTimestamp, depth) {
    const requestedDepth = Math.max(0, Math.min(2, Number(depth) || 0));
    if (requestedDepth <= 0) return [];
    if (!AppState.isPlaying || AppState.countInActive) return [];

    debugLogEvent('LED_PREVIEW_CURSOR_EVENT', describeEntryCollectionForLedDebug(currentEntries, currentMeasureIdx, currentTimestamp));

    const timeline = ensureLedPreviewTimelineBuilt();
    const currentIndex = resolveLedPreviewTraversalIndex(currentEntries, currentMeasureIdx, currentTimestamp);

    if (!timeline.length || currentIndex < 0) {
        for (let i = 0; i < requestedDepth; i++) {
            debugLogEvent(`LED_FUTURE_${i + 1}_SELECTED`, { skipped: true, reason: 'timeline-index-unresolved' });
        }
        return [];
    }

    const currentEvent = timeline[currentIndex];
    if (!currentEvent?.notes?.length) {
        for (let i = 0; i < requestedDepth; i++) {
            debugLogEvent(`LED_FUTURE_${i + 1}_SELECTED`, { skipped: true, reason: 'current-event-has-no-renderable-attacks' });
        }
        return [];
    }

    const results = [];
    for (let i = currentIndex + 1; i < timeline.length && results.length < requestedDepth; i++) {
        const event = timeline[i];
        if (!event?.notes?.length) continue;

        const depthIndex = results.length + 1;
        const previewEvent = {
            measureIndex: event.measureIndex,
            timestamp: event.timestamp,
            notes: event.notes.map(note => ({
                ...note,
                state: `future${depthIndex}-${getLedPreviewHandStatePrefix(note.staffId)}`
            }))
        };

        results.push(previewEvent);

        debugLogEvent(`LED_FUTURE_${depthIndex}_SELECTED`, {
            measureIndex: previewEvent.measureIndex,
            timestamp: previewEvent.timestamp,
            notes: previewEvent.notes.map(note => ({ midi: note.midi, staffId: note.staffId, state: note.state }))
        });
    }

    for (let i = results.length; i < requestedDepth; i++) {
        debugLogEvent(`LED_FUTURE_${i + 1}_SELECTED`, { skipped: true, reason: 'end-reached-or-no-playable-event' });
    }

    return results;
}

function getLedStatePriority(stateClass) {
    if (!stateClass) return 0;
    if (stateClass === 'expected-l' || stateClass === 'expected-r') return 5;
    if (stateClass === 'future1-l' || stateClass === 'future1-r' || stateClass === 'future2-l' || stateClass === 'future2-r') return 4;
    if (stateClass === 'pressed-l' || stateClass === 'pressed-r') return 2;
    if (stateClass === 'wrong' || stateClass === 'active') return 1;
    return 0;
}

function chooseHigherPriorityLedState(currentState, candidateState) {
    return getLedStatePriority(candidateState) > getLedStatePriority(currentState)
        ? candidateState
        : currentState;
}

function applyLedFuturePreviewStates(baseStates, previewEvents) {
    const ledStates = new Map(baseStates);

    (previewEvents || []).forEach(event => {
        event.notes.forEach(note => {
            const currentState = ledStates.get(note.midi) || null;
            const nextState = chooseHigherPriorityLedState(currentState, note.state);
            if (nextState && nextState !== currentState) {
                ledStates.set(note.midi, nextState);
            }
        });
    });

    return ledStates;
}

// ==========================================
// HARDWARE LED PROTOCOL & RENDERING ENGINE
// ==========================================

const LED_PROTOCOL = {
    'expected-l': 0, // Channel 1 (Blue)
    'expected-r': 1, // Channel 2 (Green)
    'pressed-l': 2,  // Channel 3 (Dark Blue)
    'pressed-r': 3,  // Channel 4 (Dark Green)
    'wrong': 4,      // Channel 5 (Red)
    'active': 5      // Channel 6 (Gold/Yellow)
};

const KEY_STATE_CLASSES = ['expected-l', 'expected-r', 'pressed-l', 'pressed-r', 'wrong', 'active', 'future1-l', 'future1-r'];

function updateLEDHardware(midi, newClass, oldClass) {
    if (AppState.ledOutputMode !== 'midi') return;
    if (!midiAccess) return;
    const lightsOutId = document.getElementById('midi-lights').value;
    if (lightsOutId === 'none') return;
    const output = midiAccess.outputs.get(lightsOutId);
    if (!output || output.state === 'disconnected') return;

    const noteWasLit = isMidiLedRenderableState(oldClass);
    const noteShouldBeLit = isMidiLedRenderableState(newClass);
    const noteOnStatus = getMidiLightsStatus(0x90);
    const noteOffStatus = getMidiLightsStatus(0x80);

    if (noteWasLit && !noteShouldBeLit) {
        rememberOutgoingMidiMessage(noteOffStatus, midi, 0);
        output.send([noteOffStatus, midi, 0]);
        return;
    }

    if (noteShouldBeLit) {
        const velocity = LedEngine.getMidiVelocityForState(newClass || 'expected-r');
        rememberOutgoingMidiMessage(noteOnStatus, midi, velocity);
        output.send([noteOnStatus, midi, velocity]);
    }
}

function wipeHardwareLEDs() {
    if (AppState.ledOutputMode !== 'midi') return;
    if (!midiAccess) return;
    const lightsOutId = document.getElementById('midi-lights').value;
    if (lightsOutId === 'none') return;
    const output = midiAccess.outputs.get(lightsOutId);
    if (!output || output.state === 'disconnected') return;

    const noteOffStatus = getMidiLightsStatus(0x80);
    AppState.hardwareLEDState.forEach((colorClass, midi) => {
        if (isMidiLedRenderableState(colorClass)) {
            rememberOutgoingMidiMessage(noteOffStatus, midi, 0);
            output.send([noteOffStatus, midi, 0]);
        }
    });
    AppState.hardwareLEDState.clear();
}


function getKeyInlineVisual(state) {
    return {
        filter: '',
        boxShadow: '',
        transform: ''
    };
}

function applyInlineKeyVisual(el, state) {
    if (!el) return;
    el.style.filter = '';
    el.style.boxShadow = '';
    el.style.transform = '';
}

function renderVirtualKeyboard(currentEntries = null, currentMeasureIdx = null, currentTimestamp = null) {
    const desiredStates = new Map();
    const previewStateMap = new Map();

    if (AppState.ledCalibrationMode) {
        if (AppState.ledCalibrationSelectedMidi != null && isMidiInPlayerRange(AppState.ledCalibrationSelectedMidi)) {
            desiredStates.set(AppState.ledCalibrationSelectedMidi, 'calibration');
        }

        LedEngine.renderFromStates(desiredStates);
        LedEngine.renderOutputs();

        for (let i = 21; i <= 108; i++) {
            const desiredClass = AppState.ledCalibrationSelectedMidi === i ? 'active' : null;
            const el = document.querySelector(`.key[data-midi="${i}"]`);
            if (el) {
                el.classList.toggle('out-of-range', !isMidiInPlayerRange(i));
                KEY_STATE_CLASSES.forEach(cls => el.classList.remove(cls));
            if (desiredClass) el.classList.add(desiredClass);
                applyInlineKeyVisual(el, desiredClass);
            }
        }

        return;
    }

    AppState.sustainedVisuals.forEach(n => {
        if (!isMidiInPlayerRange(n.midi)) return;
        const handRole = getAssignedHandRoleForStaff(n.staffId);
        desiredStates.set(n.midi, handRole === 'left' ? 'expected-l' : 'expected-r');
    });
    AppState.visualNotesToStart.forEach(n => {
        if (!isMidiInPlayerRange(n.midi)) return;
        const handRole = getAssignedHandRoleForStaff(n.staffId);
        desiredStates.set(n.midi, handRole === 'left' ? 'expected-l' : 'expected-r');
    });

    const previewDepth = getFuturePreviewDepth();
    let previewEvents = previewDepth > 0 ? (AppState.lastLedPreviewEvents || []) : [];

    if (currentEntries && currentMeasureIdx !== null && currentTimestamp !== null) {
        previewEvents = collectFutureLedPreviewEvents(
            currentEntries,
            currentMeasureIdx,
            currentTimestamp,
            previewDepth
        );
        AppState.lastLedPreviewEvents = previewEvents;
    }

    (previewEvents || []).forEach(event => {
        event.notes.forEach(note => {
            const currentState = previewStateMap.get(note.midi) || null;
            const nextState = chooseHigherPriorityLedState(currentState, note.state);
            if (nextState && nextState !== currentState) {
                previewStateMap.set(note.midi, nextState);
            }
        });
    });

    AppState.pressedKeys.forEach(midi => {
        const previewState = previewStateMap.get(midi) || null;
        if (
            AppState.heldCorrectNotes.has(midi) &&
            (previewState === 'future1-l' || previewState === 'future1-r')
        ) {
            AppState.preExpectedHeldNotes.add(midi);
        }

        const currentState = desiredStates.get(midi) || null;
        const isCarryHeldIntoExpected =
            AppState.preExpectedHeldNotes.has(midi) &&
            (currentState === 'expected-l' || currentState === 'expected-r');

        if (isCarryHeldIntoExpected) {
            desiredStates.set(midi, currentState);
        } else if (currentState === 'expected-l' || currentState === 'expected-r') {
            if (AppState.correctHighlightEnabled) {
                desiredStates.set(midi, currentState === 'expected-l' ? 'pressed-l' : 'pressed-r');
            } else {
                desiredStates.set(midi, currentState);
            }
        } else if (previewState === 'future1-l' || previewState === 'future1-r') {
            desiredStates.set(midi, previewState);
        } else if (AppState.heldCorrectNotes.has(midi)) {
            if (AppState.correctHighlightEnabled) {
                const staffId = AppState.heldCorrectNotes.get(midi);
                desiredStates.set(midi, getAssignedHandRoleForStaff(staffId) === 'left' ? 'pressed-l' : 'pressed-r');
            } else {
                desiredStates.delete(midi);
            }
        } else {
            desiredStates.set(midi, AppState.isPlaying ? 'wrong' : 'active');
        }
    });

    const displayStates = previewDepth > 0
        ? applyLedFuturePreviewStates(desiredStates, previewEvents)
        : desiredStates;

    LedEngine.config.futurePreview = previewDepth;
    LedEngine.renderFromStates(displayStates);
    LedEngine.renderOutputs();

    for (let i = 21; i <= 108; i++) {
        const desiredClass = displayStates.get(i) || null;
        
        const el = document.querySelector(`.key[data-midi="${i}"]`);
        if (el) {
            el.classList.toggle('out-of-range', !isMidiInPlayerRange(i));
            const currentUIClass = [...el.classList].find(c => ['expected-l', 'expected-r', 'pressed-l', 'pressed-r', 'wrong', 'active', 'future1-l', 'future1-r'].includes(c));
            if (currentUIClass !== desiredClass) {
                if (currentUIClass) el.classList.remove(currentUIClass);
                if (desiredClass) el.classList.add(desiredClass);
            }
            applyInlineKeyVisual(el, desiredClass);
        }

        const hardwareDesiredClass = desiredStates.get(i) || null;
        const currentHardwareClass = AppState.hardwareLEDState.get(i) || null;
        if (currentHardwareClass !== hardwareDesiredClass) {
            updateLEDHardware(i, hardwareDesiredClass, currentHardwareClass);
            
            if (hardwareDesiredClass) {
                AppState.hardwareLEDState.set(i, hardwareDesiredClass);
            } else {
                AppState.hardwareLEDState.delete(i);
            }
        }
    }
}

function startVisualSustains() {
    const RETRIGGER_GAP_MS = 35;

    const pendingVisuals = AppState.visualNotesToStart.slice();
    AppState.visualNotesToStart = [];

    const startOneVisual = (n) => {
        const vis = { midi: n.midi, staffId: n.staffId, mIdx: n.mIdx };
        AppState.sustainedVisuals.push(vis);
        renderVirtualKeyboard();

        const tId = setTimeout(() => {
            const idx = AppState.sustainedVisuals.indexOf(vis);
            if (idx > -1) {
                AppState.sustainedVisuals.splice(idx, 1);
                renderVirtualKeyboard();
            }
        }, n.durationMs);

        AppState.activeTimeouts.push(tId);
    };

    pendingVisuals.forEach(n => {
        const sameMeasureAlreadyActive = AppState.sustainedVisuals.some(v =>
            v.midi === n.midi &&
            v.staffId === n.staffId &&
            v.mIdx === n.mIdx
        );

        if (sameMeasureAlreadyActive) {
            return;
        }

        const olderSamePitchActive = AppState.sustainedVisuals.some(v =>
            v.midi === n.midi &&
            v.staffId === n.staffId &&
            v.mIdx !== n.mIdx
        );

        if (olderSamePitchActive) {
            AppState.sustainedVisuals = AppState.sustainedVisuals.filter(v =>
                !(v.midi === n.midi && v.staffId === n.staffId)
            );
            renderVirtualKeyboard();

            const gapId = setTimeout(() => {
                startOneVisual(n);
            }, RETRIGGER_GAP_MS);

            AppState.activeTimeouts.push(gapId);
        } else {
            startOneVisual(n);
        }
    });
}

function clearVisuals() {
    GeometryEngine.clearSvgFeedback();
    AppState.activeTimeouts.forEach(id => clearTimeout(id));
    AppState.activeTimeouts = [];
    AppState.sustainedVisuals = [];
    AppState.visualNotesToStart = [];
    AppState.expectedNotes = [];
    AppState.outOfRangeCurrentNotes = [];
    AppState.heldCorrectNotes.clear(); 
    AppState.preExpectedHeldNotes.clear();
    AppState.lastLedPreviewEvents = [];
    AppState.ledPreviewTraversalIndex = -1;
    wipeHardwareLEDs(); 
    renderVirtualKeyboard();
}


// ==========================================
// VIRTUAL KEYBOARD & DYNAMIC MIDI
// ==========================================
let activeVirtualPointerId = null;
let activeVirtualPointerMidi = null;

async function ensureLiveAudioReady() {
    try {
        await ensurePianoSamplerLoaded().catch(() => false);
        if (Tone.context.state !== 'running') {
            await Tone.start();
            await Tone.context.resume();
        }
    } catch (err) {
        console.warn('Could not resume Tone.js audio context from user gesture.', err);
    }
}

function releaseActiveVirtualPointer(pointerId = null) {
    if (activeVirtualPointerMidi == null) return;
    if (pointerId != null && activeVirtualPointerId != null && pointerId !== activeVirtualPointerId) return;
    triggerVirtualKey(activeVirtualPointerMidi, false, 'ui');
    activeVirtualPointerId = null;
    activeVirtualPointerMidi = null;
}

function createKeyboard() {
    const kb = document.getElementById('virtual-keyboard');
    const blackIndices = [1, 3, 6, 8, 10];

    if (!kb) return;
    kb.innerHTML = '';

    const bindStart = async (key, midi, token = null) => {
        if (key.dataset.virtualDown === '1') return;
        key.dataset.virtualDown = '1';
        await ensureLiveAudioReady();
        if (activeVirtualPointerMidi != null && activeVirtualPointerMidi !== midi) {
            releaseActiveVirtualPointer();
        }
        activeVirtualPointerId = token;
        activeVirtualPointerMidi = midi;
        triggerVirtualKey(midi, true, 'ui');
    };

    const bindEnd = (key, midi, token = null) => {
        if (token != null && activeVirtualPointerId != null && token !== activeVirtualPointerId) return;
        key.dataset.virtualDown = '0';
        if (AppState.pressedKeys.has(midi)) triggerVirtualKey(midi, false, 'ui');
        if (activeVirtualPointerMidi === midi) {
            activeVirtualPointerId = null;
            activeVirtualPointerMidi = null;
        }
    };

    for (let i = 0; i < 88; i++) {
        const key = document.createElement('div');
        const midi = i + 21;
        const isBlack = blackIndices.includes((i + 9) % 12);

        key.className = `key ${isBlack ? 'black' : 'white'}`;
        key.classList.toggle('out-of-range', !isMidiInPlayerRange(midi));
        key.dataset.midi = midi;
        key.dataset.virtualDown = '0';

        key.addEventListener('pointerdown', async (event) => {
            event.preventDefault();
            if (typeof key.setPointerCapture === 'function') {
                try { key.setPointerCapture(event.pointerId); } catch (_) {}
            }
            await bindStart(key, midi, `pointer:${event.pointerId}`);
        });
        key.addEventListener('pointerup', (event) => {
            event.preventDefault();
            bindEnd(key, midi, `pointer:${event.pointerId}`);
        });
        key.addEventListener('pointercancel', (event) => {
            event.preventDefault();
            bindEnd(key, midi, `pointer:${event.pointerId}`);
        });
        key.addEventListener('pointerleave', (event) => {
            if (event.pointerType === 'mouse') bindEnd(key, midi, `pointer:${event.pointerId}`);
        });
        key.addEventListener('mousedown', async (event) => {
            event.preventDefault();
            await bindStart(key, midi, 'mouse');
        });
        key.addEventListener('mouseup', (event) => {
            event.preventDefault();
            bindEnd(key, midi, 'mouse');
        });
        key.addEventListener('mouseleave', () => bindEnd(key, midi, 'mouse'));
        key.addEventListener('touchstart', async (event) => {
            event.preventDefault();
            const touch = event.changedTouches?.[0];
            await bindStart(key, midi, touch ? `touch:${touch.identifier}` : 'touch');
        }, { passive: false });
        key.addEventListener('touchend', (event) => {
            event.preventDefault();
            const touch = event.changedTouches?.[0];
            bindEnd(key, midi, touch ? `touch:${touch.identifier}` : 'touch');
        }, { passive: false });
        key.addEventListener('touchcancel', (event) => {
            event.preventDefault();
            const touch = event.changedTouches?.[0];
            bindEnd(key, midi, touch ? `touch:${touch.identifier}` : 'touch');
        }, { passive: false });

        kb.appendChild(key);
    }
}


function isMidiLedRenderableState(stateClass) {
    return stateClass === 'expected-l' || stateClass === 'expected-r';
}

function getMidiOutStatus(baseStatus) {
    return typeof getMidiStatus === 'function'
        ? getMidiStatus(baseStatus, AppState.midiOutChannel || 1)
        : (baseStatus + (Math.max(1, Math.min(16, Number(AppState.midiOutChannel) || 1)) - 1));
}

function getMidiLightsStatus(baseStatus) {
    return typeof getMidiStatus === 'function'
        ? getMidiStatus(baseStatus, AppState.midiLightsChannel || 1)
        : (baseStatus + (Math.max(1, Math.min(16, Number(AppState.midiLightsChannel) || 1)) - 1));
}

function getSelectedMidiOutOutput() {
    if (!midiAccess) return null;
    const outId = document.getElementById('midi-out')?.value || 'none';
    if (outId === 'none') return null;
    const output = midiAccess.outputs.get(outId);
    return (output && output.state !== 'disconnected') ? output : null;
}


function getLiveAudioTime() {
    if (typeof Tone?.immediate === 'function') return Tone.immediate();
    return Tone.now();
}

function normalizeLiveVelocity(velocity) {
    const numericVelocity = Number(velocity);
    const clampedMidi = Math.max(1, Math.min(127, Number.isFinite(numericVelocity) ? numericVelocity : 100));
    return {
        midi: clampedMidi,
        gain: Math.max(0.05, Math.min(1, clampedMidi / 127))
    };
}

function playLocalPianoNote(midi, velocity = 100, durationMs = null, options = {}) {
    if (!Number.isFinite(midi) || midi < 0) return;
    const noteName = getSamplerNoteName(midi);
    if (!noteName) return;

    if (!pianoSamplerReady) {
        ensurePianoSamplerLoaded()
            .then(() => {
                if (!AppState.audioEnabled?.virtual && !AppState.audioEnabled?.instrument && !AppState.audioEnabled?.left && !AppState.audioEnabled?.right && !AppState.audioEnabled?.other) return;
                playLocalPianoNote(midi, velocity, durationMs, options);
            })
            .catch(() => {});
        return;
    }

    const normalized = normalizeLiveVelocity(velocity);
    const liveTime = getLiveAudioTime();
    if (options.lowLatencyLive || options.retrigger !== false) {
        pianoSampler.triggerRelease(noteName, liveTime);
    }
    pianoSampler.triggerAttack(noteName, liveTime, normalized.gain);
    if (Number.isFinite(durationMs) && durationMs > 0) {
        setTimeout(() => pianoSampler.triggerRelease(noteName, getLiveAudioTime()), durationMs);
    }
}

function getRoutingEnabledForRole(bucket, roleKey) {
    return !!(bucket && bucket[roleKey]);
}

function getSourceRoleKey(source) {
    if (source === 'midi') return 'instrument';
    if (source === 'ui') return 'virtual';
    return null;
}

function syncTrainerRoutingUiState() {
    const hasMidiOut = !!getSelectedMidiOutOutput();
    const summary = document.getElementById('trainer-midi-out-summary');
    const midiOutCard = document.getElementById('trainer-midiout-card');
    if (summary) {
        if (hasMidiOut) {
            const outName = document.getElementById('midi-out')?.selectedOptions?.[0]?.textContent?.replace(/\s*\(Disconnected\)\s*$/, '') || 'MIDI Out';
            summary.textContent = `Device: ${outName} | Channel: ${AppState.midiOutChannel || 1}`;
            summary.classList.remove('is-disabled');
        } else {
            summary.textContent = 'No MIDI device selected.';
            summary.classList.add('is-disabled');
        }
    }
    midiOutCard?.classList.toggle('is-disabled', !hasMidiOut);
    ['enable-midiout-lh', 'enable-midiout-rh', 'enable-midiout-other', 'enable-midiout-instrument', 'enable-midiout-virtual-keyboard'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;
        const shouldDisable = !hasMidiOut || (AppState.mode === 'wait' && (id === 'enable-midiout-lh' || id === 'enable-midiout-rh'));
        input.disabled = shouldDisable;
        input.closest('label')?.classList.toggle('is-disabled', shouldDisable);
    });
}

function shouldRouteLiveSourceToLocalAudio(source) {
    const roleKey = getSourceRoleKey(source);
    return roleKey ? getRoutingEnabledForRole(AppState.audioEnabled, roleKey) : false;
}

function shouldRouteLiveSourceToMidiOut(source) {
    const roleKey = getSourceRoleKey(source);
    return roleKey ? getRoutingEnabledForRole(AppState.midiOutEnabled, roleKey) : false;
}

function sendMidiOutNoteOn(midi, velocity = 100) {
    const output = getSelectedMidiOutOutput();
    if (!output) return false;
    const status = getMidiOutStatus(0x90);
    rememberOutgoingMidiMessage(status, midi, velocity);
    output.send([status, midi, velocity]);
    return true;
}

function sendMidiOutNoteOff(midi) {
    const output = getSelectedMidiOutOutput();
    if (!output) return false;
    const status = getMidiOutStatus(0x80);
    rememberOutgoingMidiMessage(status, midi, 0);
    output.send([status, midi, 0]);
    return true;
}

function schedulePlaybackForDestinations(midi, durationMs, velocity = 100, options = {}) {
    if (!Number.isFinite(midi) || midi < 0) return;
    if (durationMs <= 0) return;

    if (options.toLocalAudio) {
        playLocalPianoNote(midi, velocity, durationMs);
    }

    if (options.toMidiOut && sendMidiOutNoteOn(midi, velocity)) {
        setTimeout(() => {
            sendMidiOutNoteOff(midi);
        }, durationMs);
    }
}

// MIDI access, device population, and connection listeners now live in js/midi.js.

function triggerVirtualKey(midi, isPressed, source = 'midi', velocity = 100) {
    if (isPressed) {
        AppState.pressedKeys.add(midi);
        
        const liveVelocity = (source === 'midi' && AppState.inputVelocityEnabled) ? velocity : 100;

        if (shouldRouteLiveSourceToLocalAudio(source)) {
            playLocalPianoNote(midi, liveVelocity, null, {
                lowLatencyLive: source === 'ui' ? true : !!AppState.liveLowLatencyMonitoringEnabled,
                retrigger: true
            });
        }

        if (shouldRouteLiveSourceToMidiOut(source)) {
            sendMidiOutNoteOn(midi, normalizeLiveVelocity(liveVelocity).midi);
        }

        if (AppState.ledCalibrationMode) {
            selectLedCalibrationMidi(midi);
            renderVirtualKeyboard();
            return;
        }
        
        if (AppState.isPlaying) {
            const expectedMatch = findExpectedMatchForMidi(midi);
            const isCorrect = !!expectedMatch;
            const targetStaffId = expectedMatch ? expectedMatch.staffId : null;
            
            if (AppState.practice.left || AppState.practice.right) {
                const forceMIdx = expectedMatch ? expectedMatch.mIdx : null;
                const anchor = expectedMatch ? expectedMatch.anchor : null;

                debugLogEvent('KEY_PRESS_MATCH_RESULT', {
                    midi,
                    isCorrect,
                    targetStaffId,
                    forceMIdx,
                    anchor: anchor ? { x: anchor.x, y: anchor.y } : null,
                    expectedMatch: expectedMatch ? {
                        midi: expectedMatch.midi,
                        staffId: expectedMatch.staffId,
                        mIdx: expectedMatch.mIdx,
                        hit: expectedMatch.hit
                    } : null
                });

                drawFeedbackNote(midi, isCorrect, targetStaffId, forceMIdx, anchor);

                if (isCorrect) {
                    AppState.score.correct++;
                    AppState.heldCorrectNotes.set(midi, targetStaffId);
                } else {
                    AppState.score.wrong++;
                }
                updateScoreDisplay();
            }

            if (isCorrect) {
                expectedMatch.hit = true;
                if (AppState.mode === 'wait') {
                    checkWaitModeAdvance();
                }
            }
        }
    } else {
        AppState.pressedKeys.delete(midi);
        AppState.heldCorrectNotes.delete(midi); 
        AppState.preExpectedHeldNotes.delete(midi);
        
        if (shouldRouteLiveSourceToLocalAudio(source)) {
            const noteName = getSamplerNoteName(midi);
            if (noteName) pianoSampler.triggerRelease(noteName, getLiveAudioTime());
        }

        if (shouldRouteLiveSourceToMidiOut(source)) {
            sendMidiOutNoteOff(midi);
        }
    }
    
    renderVirtualKeyboard();
}


// ==========================================
// WAIT MODE ENGINE
// ==========================================

// ===== Trainer mode flow =====

function checkWaitModeAdvance() {
    if (!AppState.isPlaying || AppState.mode !== 'wait' || !AppState.isAudioBusy) return;

    if (AppState.expectedNotes.length === 0) return; 

    const allHit = AppState.expectedNotes.every(n => n.hit);
    
    if (allHit) {
        AppState.isAudioBusy = false;
        
        AppState.pendingAudio.forEach(audio => {
            schedulePlaybackForDestinations(audio.midi, audio.durationMs, audio.velocity ?? 100, { toLocalAudio: !!audio.toLocalAudio, toMidiOut: !!audio.toMidiOut });
        });
        AppState.pendingAudio = []; 

        AppState.visualNotesToStart = AppState.visualNotesToStart.filter(n => {
            const handRole = getAssignedHandRoleForStaff(n.staffId);
            const isPracticingThisHand = (handRole === 'right' && AppState.practice.right) || 
                                         (handRole === 'left' && AppState.practice.left);
            return !isPracticingThisHand;
        });

        startVisualSustains();

        setTimeout(() => {
            if (AppState.isPlaying && AppState.mode === 'wait') {
                osmd.cursor.update(); 
                handleAutoScroll();
                playbackLoop();       
            }
        }, 10); 
    }
}


// ==========================================
// UI LISTENERS & SYNC LOGIC
// ==========================================
function applyModeSettings() {
    const isWait = AppState.mode === 'wait';

    const lhAudioToggle = document.getElementById('enable-staff-lh');
    const rhAudioToggle = document.getElementById('enable-staff-rh');
    const otherAudioToggle = document.getElementById('enable-other');
    const midiOutLhToggle = document.getElementById('enable-midiout-lh');
    const midiOutRhToggle = document.getElementById('enable-midiout-rh');
    const midiOutOtherToggle = document.getElementById('enable-midiout-other');

    if (isWait) {
        lhAudioToggle.checked = false;
        rhAudioToggle.checked = false;
        AppState.audioEnabled.left = false;
        AppState.audioEnabled.right = false;
        if (midiOutLhToggle) midiOutLhToggle.checked = false;
        if (midiOutRhToggle) midiOutRhToggle.checked = false;
        AppState.midiOutEnabled.left = false;
        AppState.midiOutEnabled.right = false;
    } else {
        lhAudioToggle.checked = true;
        rhAudioToggle.checked = true;
        AppState.audioEnabled.left = true;
        AppState.audioEnabled.right = true;
        if (midiOutLhToggle) midiOutLhToggle.checked = getStoredBool(TRAINER_MIDIOUT_LH_STORAGE_KEY, false);
        if (midiOutRhToggle) midiOutRhToggle.checked = getStoredBool(TRAINER_MIDIOUT_RH_STORAGE_KEY, false);
        AppState.midiOutEnabled.left = getStoredBool(TRAINER_MIDIOUT_LH_STORAGE_KEY, false);
        AppState.midiOutEnabled.right = getStoredBool(TRAINER_MIDIOUT_RH_STORAGE_KEY, false);
    }

    lhAudioToggle.disabled = isWait;
    rhAudioToggle.disabled = isWait;
    otherAudioToggle.disabled = isWait;
    if (midiOutLhToggle) midiOutLhToggle.disabled = isWait || !getSelectedMidiOutOutput();
    if (midiOutRhToggle) midiOutRhToggle.disabled = isWait || !getSelectedMidiOutOutput();
    if (midiOutOtherToggle) midiOutOtherToggle.disabled = isWait || !getSelectedMidiOutOutput();
    syncTrainerRoutingUiState();
}

function initLedSimulatorToggleControl() {
    const checkbox = document.getElementById('check-led-simulator');
    if (!checkbox || checkbox.dataset.boundLedSimulator) return;

    checkbox.dataset.boundLedSimulator = 'true';
    checkbox.checked = AppState.ledSimulatorVisible;
    checkbox.addEventListener('change', (e) => {
        AppState.ledSimulatorVisible = e.target.checked;
        LedEngine.renderSimulator();
        positionLedCalibrationPanel();
        window.dispatchEvent(new Event('resize'));
    });
}

(function ensureFuturePreviewControls() {
    const existingCheckbox = document.getElementById('check-future-preview');
    if (!existingCheckbox) return;

    const existingSelect = document.getElementById('select-future-depth');
    if (existingSelect && existingSelect.parentNode) {
        existingSelect.parentNode.removeChild(existingSelect);
    }

    AppState.futurePreviewDepth = 1;
    existingCheckbox.checked = AppState.futurePreviewEnabled;
    existingCheckbox.addEventListener('change', (e) => {
        AppState.futurePreviewEnabled = e.target.checked;
        AppState.futurePreviewDepth = 1;
        setStoredBool(TRAINER_FUTURE_PREVIEW_STORAGE_KEY, AppState.futurePreviewEnabled);
        AppState.lastLedPreviewEvents = [];
        renderVirtualKeyboard();
    });

    const correctHighlightCheckbox = document.getElementById('check-correct-highlight');
    if (correctHighlightCheckbox) {
        correctHighlightCheckbox.checked = AppState.correctHighlightEnabled;
        if (!correctHighlightCheckbox.dataset.boundCorrectHighlight) {
            correctHighlightCheckbox.dataset.boundCorrectHighlight = 'true';
            correctHighlightCheckbox.addEventListener('change', (e) => {
                AppState.correctHighlightEnabled = e.target.checked;
                setStoredBool(TRAINER_CORRECT_HIGHLIGHT_STORAGE_KEY, AppState.correctHighlightEnabled);
                renderVirtualKeyboard();
            });
        }
    }
})();


// ===== Toolbar shell + floating panel coordination =====
// Extracted to js/toolbar-ui.js

// ===== Score library + drawer workflow =====
// Extracted to js/score-library.js and js/scores-ui.js

document.getElementById('check-keyboard').addEventListener('change', (e) => {
    const kbContainer = document.getElementById('virtual-keyboard-container');
    setStoredBool(TRAINER_KEYBOARD_STORAGE_KEY, e.target.checked);
    if (e.target.checked) {
        kbContainer.classList.remove('hidden');
        renderVirtualKeyboard(); 
    } else {
        kbContainer.classList.add('hidden');
    }
    LedEngine.renderSimulator();
    positionLedCalibrationPanel();
    window.dispatchEvent(new Event('resize')); 
});

document.getElementById('check-feedback').addEventListener('change', (e) => {
    AppState.feedbackEnabled = e.target.checked;
    setStoredBool(TRAINER_FEEDBACK_STORAGE_KEY, AppState.feedbackEnabled);
    if (!e.target.checked) {
        document.getElementById('feedback-layer').innerHTML = '';
    }
});

document.getElementById('select-mode').addEventListener('change', (e) => {
    AppState.mode = e.target.value;
    localStorage.setItem(TRAINER_MODE_STORAGE_KEY, AppState.mode);
    clearScheduledMetronomeEvents();
    stopWaitModeMetronome();
    applyModeSettings();
updatePianoVolume(pianoVolSlider ? pianoVolSlider.value : 80);
updateMetroVolume(metroVolSlider ? metroVolSlider.value : 50); 
});


// ===== Playback navigation + metronome scheduling =====


// WARNING:
// Count-in and metronome startup are timing-sensitive.
// Keep transport startup, visual pulse timing, and playback handoff aligned when adjusting this flow.
function doCountInAndStart(callback) {
    const mIdx = osmd.cursor.Iterator.CurrentMeasureIndex;
    let beats = 4; 
    
    if (osmd.Sheet.SourceMeasures[mIdx] && osmd.Sheet.SourceMeasures[mIdx].ActiveTimeSignature) {
        beats = osmd.Sheet.SourceMeasures[mIdx].ActiveTimeSignature.Numerator;
    } else if (osmd.Sheet.SourceMeasures[0] && osmd.Sheet.SourceMeasures[0].ActiveTimeSignature) {
        beats = osmd.Sheet.SourceMeasures[0].ActiveTimeSignature.Numerator;
    }

    const currentRunningBpm = AppState.baseBpm * AppState.speedPercent;
    const beatDurationSeconds = 60 / currentRunningBpm;
    let beatCount = 0;
    
    AppState.countInActive = true;

    function tick() {
        if (!AppState.isPlaying) {
            AppState.countInActive = false;
            return; 
        }
        
        const isDownbeat = beatCount === 0;
        const clickSpec = getMetronomeClickSpec(isDownbeat);
        metronomeSynth.triggerAttackRelease(clickSpec.note, "64n", Tone.now(), clickSpec.velocity);
        triggerTempoVisualPulse();
        beatCount++;
        
        if (beatCount < beats) {
            setTimeout(tick, beatDurationSeconds * 1000);
        } else {
            setTimeout(() => {
                if (!AppState.isPlaying) {
                    AppState.countInActive = false;
                    AppState.lastLedPreviewEvents = [];
                    AppState.ledPreviewTraversalIndex = -1;
                    return;
                }
                AppState.countInActive = false;
                callback();
            }, beatDurationSeconds * 1000);
        }
    }
    
    tick(); 
}

document.getElementById('canvas-wrapper').addEventListener('click', (e) => {
    if (!osmd.GraphicSheet || AppState.isPlaying) return;
    if (isAnyToolbarPanelOpen()) return;

    const svgPoint = GeometryEngine.clientPointToSvg(e.clientX, e.clientY);
    if (!svgPoint) return;

    let targetMeasureIdx = -1;

    for (let i = 0; i < osmd.GraphicSheet.MeasureList.length; i++) {
        const box = GeometryEngine.getMeasureBox(i, 0);
        if (!box) continue;

        if (svgPoint.x >= box.x && svgPoint.x <= box.x + box.width && svgPoint.y >= box.y && svgPoint.y <= box.y + box.height) {
            targetMeasureIdx = i;
            break;
        }
    }

    if (targetMeasureIdx !== -1) {
        const isLoopEnabled = document.getElementById('check-looper').checked;
        if (isLoopEnabled && (targetMeasureIdx < AppState.looper.min - 1 || targetMeasureIdx > AppState.looper.max - 1)) {
            return;
        }

        Tone.Transport.stop();

        osmd.cursor.reset();
        while (!osmd.cursor.Iterator.EndReached && osmd.cursor.Iterator.CurrentMeasureIndex < targetMeasureIdx) {
            osmd.cursor.Iterator.moveToNext();
        }
        osmd.cursor.update();
        handleAutoScroll();
        clearVisuals();
    }
});


const playPauseButton = document.getElementById('btn-play');

function updatePlayPauseButton() {
    if (playPauseButton) {
        playPauseButton.textContent = AppState.isPlaying ? '⏸ Pause' : '▶ Play';
    }
}

function startPlaybackFromToolbar() {
    if (!osmd.cursor || AppState.isPlaying) return;
    if (Tone.context.state !== 'running') Tone.context.resume();

    AppState.isPlaying = true;
    updatePlayPauseButton();

    hideToolbarPanels();
    Tone.Transport.stop();
    clearScheduledMetronomeEvents();
    stopWaitModeMetronome();

    AppState.lastLedPreviewEvents = [];
    AppState.ledPreviewTraversalIndex = -1;
    ensureLedPreviewTimelineBuilt();

    doCountInAndStart(() => {
        AppState.anchorTime = Tone.now();
        osmd.cursor.show();
        Tone.Transport.bpm.value = AppState.baseBpm * AppState.speedPercent;
        Tone.Transport.start();
        if (AppState.mode === 'wait' && document.getElementById('check-metronome')?.checked) {
            startWaitModeMetronome(osmd?.cursor?.Iterator?.CurrentMeasureIndex ?? 0);
        }
        playbackLoop();
    });
}

function silencePlaybackOutputsImmediately() {
    try {
        pianoSampler.releaseAll?.();
    } catch (err) {
        console.warn('Could not release Tone.js playback voices immediately.', err);
    }

    if (midiAccess) {
        const outId = document.getElementById('midi-out')?.value;
        if (outId && outId !== 'none') {
            const output = midiAccess.outputs.get(outId);
            if (output && output.state !== 'disconnected') {
                const controlStatus = getMidiOutStatus(0xB0);
                output.send([controlStatus, 64, 0]);
                output.send([controlStatus, 123, 0]);
                output.send([controlStatus, 120, 0]);
            }
        }
    }
}

function pausePlaybackFromToolbar() {
    AppState.isPlaying = false;
    AppState.countInActive = false;
    AppState.lastLedPreviewEvents = [];
    AppState.ledPreviewTraversalIndex = -1;
    Tone.Transport.pause();
    clearScheduledMetronomeEvents();
    stopWaitModeMetronome();
    silencePlaybackOutputsImmediately();
    clearTempoVisualPulse();
    updatePlayPauseButton();
    if (AppState.ledOutputMode === 'midi') {
        wipeHardwareLEDs();
    }
    if (AppState.ledOutputMode === 'wled') {
        WLEDController.forceClear().catch(() => {});
    }
}

if (playPauseButton) {
    playPauseButton.onclick = () => {
        if (AppState.isPlaying) pausePlaybackFromToolbar();
        else startPlaybackFromToolbar();
    };
}

document.getElementById('btn-reset').onclick = () => { 
    AppState.isPlaying = false; 
    AppState.countInActive = false;

    Tone.Transport.stop();
    clearScheduledMetronomeEvents();
    stopWaitModeMetronome();
    silencePlaybackOutputsImmediately();
    clearTempoVisualPulse();
    
    GeometryEngine.clearSvgFeedback(); 
    AppState.pendingAudio = []; 
    AppState.score.correct = 0;
    AppState.score.wrong = 0;
    updateScoreDisplay();

    osmd.cursor.reset(); 
    const isLoopEnabled = document.getElementById('check-looper').checked;
    if (isLoopEnabled) {
        const minLoop = parseInt(document.getElementById('val-loop-min').value);
        while (!osmd.cursor.Iterator.EndReached && osmd.cursor.Iterator.CurrentMeasureIndex < minLoop - 1) {
            osmd.cursor.Iterator.moveToNext();
        }
    }
    osmd.cursor.update();
    handleAutoScroll();
    AppState.ledPreviewTraversalIndex = -1;
    AppState.lastLedPreviewEvents = [];
    clearVisuals();
    if (AppState.ledOutputMode === 'wled') {
        WLEDController.forceClear().catch(() => {});
    }
    hideToolbarPanels();
    updatePlayPauseButton();
};

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (osmd.IsReadyToRender()) {
            renderScoreAndRefreshGeometry();
        }
        LedEngine.renderSimulator();
        positionLedCalibrationPanel();
    }, 300);
});

const zoomSlider = document.getElementById('slider-zoom');
const zoomInput = document.getElementById('val-zoom');
function normalizeZoomValue(val) {
    let normalized = parseInt(val, 10);
    if (isNaN(normalized)) return null;
    if (normalized < 50) normalized = 50;
    if (normalized > 200) normalized = 200;
    return normalized;
}
function syncZoomControls(val) {
    const normalized = normalizeZoomValue(val);
    if (normalized == null) return;
    zoomSlider.value = normalized;
    zoomInput.value = normalized;
}
function applyZoom(val, { save = true } = {}) {
    const normalized = normalizeZoomValue(val);
    if (normalized == null) return;
    zoomSlider.value = normalized;
    zoomInput.value = normalized;
    AppState.zoom = normalized / 100;
    if (save) {
        localStorage.setItem(TRAINER_ZOOM_STORAGE_KEY, String(normalized));
    }
    if (osmd.IsReadyToRender()) {
        osmd.zoom = AppState.zoom;
        renderScoreAndRefreshGeometry();
    }
}
zoomSlider.addEventListener('input', (e) => syncZoomControls(e.target.value));
zoomSlider.addEventListener('change', (e) => applyZoom(e.target.value));
zoomInput.addEventListener('change', (e) => applyZoom(e.target.value));

const speedSlider = document.getElementById('slider-speed');
const speedInput = document.getElementById('val-speed');
const bpmInput = document.getElementById('val-bpm');

function syncTempoPreviewFromPercent(value) {
    const baseBpm = AppState.baseBpm || 120;
    const previewPercent = Math.max(10, Math.min(200, parseInt(value, 10) || 100));
    const previewBpm = Math.round(baseBpm * (previewPercent / 100));
    speedSlider.value = previewPercent;
    speedInput.value = previewPercent;
    bpmInput.value = previewBpm;
}

function updateTempo(source, value) {
    let newPercent, newBpm;
    const baseBpm = AppState.baseBpm || 120;

    if (source === 'percent') {
        newPercent = Math.max(10, Math.min(200, parseInt(value) || 100));
        newBpm = Math.round(baseBpm * (newPercent / 100));
    } else if (source === 'bpm') {
        newBpm = Math.max(1, parseInt(value) || baseBpm);
        newPercent = Math.round((newBpm / baseBpm) * 100);
    }

    speedSlider.value = newPercent;
    speedInput.value = newPercent;
    bpmInput.value = newBpm;
    AppState.speedPercent = newPercent / 100;
    Tone.Transport.bpm.value = newBpm;

    if (AppState.isPlaying && !AppState.countInActive && AppState.mode === 'wait') {
        rebuildWaitModeMetronome(osmd?.cursor?.Iterator?.CurrentMeasureIndex ?? waitMetronomeActiveMeasureIndex);
    }
}
speedSlider.addEventListener('input', (e) => syncTempoPreviewFromPercent(e.target.value));
speedSlider.addEventListener('change', (e) => updateTempo('percent', e.target.value));
speedInput.addEventListener('change', (e) => updateTempo('percent', e.target.value));
bpmInput.addEventListener('change', (e) => updateTempo('bpm', e.target.value));

const pianoVolSlider = document.getElementById('slider-piano-vol');
const pianoVolInput = document.getElementById('val-piano-vol');
const metroVolSlider = document.getElementById('slider-metro-vol');
const metroVolInput = document.getElementById('val-metro-vol');

function updatePianoVolume(value, { save = true } = {}) {
    const val = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
    if (pianoVolSlider) pianoVolSlider.value = val;
    if (pianoVolInput) pianoVolInput.value = val;
    if (save) {
        localStorage.setItem(TRAINER_PIANO_VOL_STORAGE_KEY, String(val));
    }
    if (val === 0) masterPianoVolume.volume.value = -Infinity;
    else masterPianoVolume.volume.value = 20 * Math.log10(val / 100);
}

function updateMetroVolume(value, { save = true } = {}) {
    const val = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
    if (metroVolSlider) metroVolSlider.value = val;
    if (metroVolInput) metroVolInput.value = val;
    if (save) {
        localStorage.setItem(METRONOME_VOL_STORAGE_KEY, String(val));
    }
    if (val === 0) metronomeSynth.volume.value = -Infinity;
    else metronomeSynth.volume.value = 20 * Math.log10(val / 100);
}

if (pianoVolSlider) pianoVolSlider.addEventListener('input', (e) => updatePianoVolume(e.target.value));
if (pianoVolInput) pianoVolInput.addEventListener('change', (e) => updatePianoVolume(e.target.value));
if (metroVolSlider) metroVolSlider.addEventListener('input', (e) => updateMetroVolume(e.target.value));
if (metroVolInput) metroVolInput.addEventListener('change', (e) => updateMetroVolume(e.target.value));

const autoScrollCheckbox = document.getElementById('check-autoscroll');
if (autoScrollCheckbox) {
    autoScrollCheckbox.addEventListener('change', (e) => {
        setStoredBool(TRAINER_AUTOSCROLL_STORAGE_KEY, e.target.checked);
    });
}

document.getElementById('practice-lh').addEventListener('change', (e) => {
    AppState.practice.left = e.target.checked;
    setStoredBool(TRAINER_PRACTICE_LH_STORAGE_KEY, AppState.practice.left);
});
document.getElementById('practice-rh').addEventListener('change', (e) => {
    AppState.practice.right = e.target.checked;
    setStoredBool(TRAINER_PRACTICE_RH_STORAGE_KEY, AppState.practice.right);
});

document.getElementById('enable-staff-lh').addEventListener('change', (e) => {
    AppState.audioEnabled.left = e.target.checked;
    setStoredBool(TRAINER_AUDIO_LH_STORAGE_KEY, AppState.audioEnabled.left);
});
document.getElementById('enable-staff-rh').addEventListener('change', (e) => {
    AppState.audioEnabled.right = e.target.checked;
    setStoredBool(TRAINER_AUDIO_RH_STORAGE_KEY, AppState.audioEnabled.right);
});
document.getElementById('enable-other').addEventListener('change', (e) => {
    AppState.audioEnabled.other = e.target.checked;
    setStoredBool(TRAINER_AUDIO_OTHER_STORAGE_KEY, AppState.audioEnabled.other);
});
document.getElementById('enable-instrument').addEventListener('change', (e) => {
    AppState.audioEnabled.instrument = e.target.checked;
    setStoredBool(TRAINER_AUDIO_INSTRUMENT_STORAGE_KEY, AppState.audioEnabled.instrument);
});
document.getElementById('enable-virtual-keyboard').addEventListener('change', (e) => {
    AppState.audioEnabled.virtual = e.target.checked;
    setStoredBool(TRAINER_AUDIO_VIRTUAL_STORAGE_KEY, AppState.audioEnabled.virtual);
});
document.getElementById('enable-midiout-lh').addEventListener('change', (e) => {
    AppState.midiOutEnabled.left = e.target.checked;
    setStoredBool(TRAINER_MIDIOUT_LH_STORAGE_KEY, AppState.midiOutEnabled.left);
});
document.getElementById('enable-midiout-rh').addEventListener('change', (e) => {
    AppState.midiOutEnabled.right = e.target.checked;
    setStoredBool(TRAINER_MIDIOUT_RH_STORAGE_KEY, AppState.midiOutEnabled.right);
});
document.getElementById('enable-midiout-other').addEventListener('change', (e) => {
    AppState.midiOutEnabled.other = e.target.checked;
    setStoredBool(TRAINER_MIDIOUT_OTHER_STORAGE_KEY, AppState.midiOutEnabled.other);
});
document.getElementById('enable-midiout-instrument').addEventListener('change', (e) => {
    AppState.midiOutEnabled.instrument = e.target.checked;
    setStoredBool(TRAINER_MIDIOUT_INSTRUMENT_STORAGE_KEY, AppState.midiOutEnabled.instrument);
});
document.getElementById('enable-midiout-virtual-keyboard').addEventListener('change', (e) => {
    AppState.midiOutEnabled.virtual = e.target.checked;
    setStoredBool(TRAINER_MIDIOUT_VIRTUAL_STORAGE_KEY, AppState.midiOutEnabled.virtual);
});
document.getElementById('check-input-velocity').addEventListener('change', (e) => {
    AppState.inputVelocityEnabled = e.target.checked;
    setStoredBool(TRAINER_INPUT_VELOCITY_STORAGE_KEY, AppState.inputVelocityEnabled);
});
document.getElementById('check-live-low-latency').addEventListener('change', (e) => {
    AppState.liveLowLatencyMonitoringEnabled = e.target.checked;
    setStoredBool(TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY, AppState.liveLowLatencyMonitoringEnabled);
});

const loopMinSlider = document.getElementById('slider-loop-min');
const loopMaxSlider = document.getElementById('slider-loop-max');
const loopMinInput = document.getElementById('val-loop-min');
const loopMaxInput = document.getElementById('val-loop-max');

document.getElementById('check-looper').addEventListener('change', () => {
    renderLooper();
    enforceLooperBounds();
});

const loopCountInCheckbox = document.getElementById('check-loop-countin');
if (loopCountInCheckbox) {
    loopCountInCheckbox.addEventListener('change', (e) => {
        AppState.loopCountInEnabled = e.target.checked;
        setStoredBool(LOOP_COUNT_IN_STORAGE_KEY, AppState.loopCountInEnabled);
    });
}

const accentedDownbeatCheckbox = document.getElementById('check-accented-downbeat');
if (accentedDownbeatCheckbox) {
    accentedDownbeatCheckbox.addEventListener('change', (e) => {
        AppState.accentedDownbeatEnabled = e.target.checked;
        setStoredBool(ACCENTED_DOWNBEAT_STORAGE_KEY, AppState.accentedDownbeatEnabled);
    });
}

const visualPulseCheckbox = document.getElementById('check-visual-pulse');
if (visualPulseCheckbox) {
    visualPulseCheckbox.addEventListener('change', (e) => {
        AppState.visualPulseEnabled = e.target.checked;
        setStoredBool(VISUAL_PULSE_STORAGE_KEY, AppState.visualPulseEnabled);
        if (!AppState.visualPulseEnabled) clearTempoVisualPulse();
    });
}

const metronomeCheckbox = document.getElementById('check-metronome');
if (metronomeCheckbox) {
    metronomeCheckbox.addEventListener('change', (e) => {
        if (!e.target.checked) {
            clearScheduledMetronomeEvents();
            stopWaitModeMetronome();
            clearTempoVisualPulse();
            return;
        }
        if (AppState.isPlaying && !AppState.countInActive) {
            if (AppState.mode === 'wait') {
                rebuildWaitModeMetronome(osmd?.cursor?.Iterator?.CurrentMeasureIndex ?? waitMetronomeActiveMeasureIndex);
            }
        }
    });
}

function syncLooper(source, changedId) {
    let minVal = parseInt(source === 'slider' ? loopMinSlider.value : loopMinInput.value);
    let maxVal = parseInt(source === 'slider' ? loopMaxSlider.value : loopMaxInput.value);
    const maxAllowed = parseInt(loopMaxSlider.max) || 100;

    if (isNaN(minVal) || minVal < 1) minVal = 1;
    if (isNaN(maxVal) || maxVal > maxAllowed) maxVal = maxAllowed;

    if (minVal > maxVal) {
        if (changedId === 'slider-loop-min' || changedId === 'val-loop-min') maxVal = minVal;
        else if (changedId === 'slider-loop-max' || changedId === 'val-loop-max') minVal = maxVal;
    }

    loopMinSlider.value = minVal; loopMaxSlider.value = maxVal;
    loopMinInput.value = minVal; loopMaxInput.value = maxVal;
    AppState.looper.min = minVal; AppState.looper.max = maxVal;
    
    renderLooper();
    enforceLooperBounds();
}
loopMinSlider.addEventListener('input', (e) => syncLooper('slider', e.target.id));
loopMaxSlider.addEventListener('input', (e) => syncLooper('slider', e.target.id));
loopMinInput.addEventListener('change', (e) => syncLooper('input', e.target.id));
loopMinInput.addEventListener('change', (e) => syncLooper('input', e.target.id));


// ==========================================
// PLAYBACK ENGINE
// ==========================================

// ===== Realtime playback loop =====


// WARNING:
// This loop coordinates cursor movement, repeat/jump behavior, trainer expectations, and timer-based playback.
// Change with regression testing for repeats, metronome drift, and complex score navigation.
function playbackLoop() {
    if (!AppState.isPlaying) return;
    
    if (osmd.cursor.Iterator.EndReached) {
        AppState.isPlaying = false;
        AppState.countInActive = false;
        AppState.lastLedPreviewEvents = [];
        AppState.ledPreviewTraversalIndex = -1;
        Tone.Transport.stop();
        clearScheduledMetronomeEvents();
        stopWaitModeMetronome();
        clearTempoVisualPulse();
        return;
    }
    
    const entries = osmd.cursor.Iterator.CurrentVoiceEntries;
    if (!entries || entries.length === 0) {
        osmd.cursor.Iterator.moveToNext();
        osmd.cursor.update();
        requestAnimationFrame(playbackLoop);
        return;
    }

    const currentTimestamp = osmd.cursor.Iterator.currentTimeStamp.RealValue;
    const currentMeasureIdx = osmd.cursor.Iterator.CurrentMeasureIndex;
    
    const currentMeasure = osmd.Sheet.SourceMeasures[currentMeasureIdx];
    if (currentMeasure && currentMeasure.TempoInBPM && currentMeasure.TempoInBPM !== AppState.baseBpm) {
        AppState.baseBpm = currentMeasure.TempoInBPM;
        updateTempo('percent', AppState.speedPercent * 100); 
    }

    buildExpectedNotesFromEntries(entries, currentMeasureIdx);

    renderVirtualKeyboard(entries, currentMeasureIdx, currentTimestamp);

    entries.forEach(e => {
        const sid = getResolvedStaffAssignmentIdFromEntry(e);
        const handRole = getAssignedHandRoleForStaff(sid);
        const isRH = handRole === 'right';
        const isLH = handRole === 'left';
        const isOther = (!isRH && !isLH);
        const isPracticingThisHand = (isRH && AppState.practice.right) || (isLH && AppState.practice.left);
        
        const routeToLocalAudio = (isRH && AppState.audioEnabled.right) || 
                                  (isLH && AppState.audioEnabled.left) || 
                                  (isOther && AppState.audioEnabled.other);
        const routeToMidiOut = (isRH && AppState.midiOutEnabled.right) || 
                               (isLH && AppState.midiOutEnabled.left) || 
                               (isOther && AppState.midiOutEnabled.other);

        if (routeToLocalAudio || routeToMidiOut) {
            e.Notes.forEach(n => {
                if (!n.isRest()) {
                    const isTieContinuation = n.NoteTie && n.NoteTie.StartNote !== n;
                    if (!isTieContinuation) {
                        const m = n.halfTone + 12;

                        const combinedLength = (n.NoteTie && n.NoteTie.StartNote === n)
                            ? getCombinedTieLength(n)
                            : n.Length.RealValue;

                        const noteDurationSeconds = (combinedLength * 4) * (60 / (AppState.baseBpm * AppState.speedPercent));
                        const durationMs = (noteDurationSeconds * 1000) * 0.9;
                        
                        if (AppState.mode === 'wait' && AppState.expectedNotes.length > 0 && !isPracticingThisHand) {
                            AppState.pendingAudio.push({ midi: m, durationMs: durationMs, velocity: 100, toLocalAudio: routeToLocalAudio, toMidiOut: routeToMidiOut });
                        } else {
                            schedulePlaybackForDestinations(m, durationMs, 100, { toLocalAudio: routeToLocalAudio, toMidiOut: routeToMidiOut });
                        }
                    }
                }
            });
        }
    });

    osmd.cursor.Iterator.moveToNext(); 
    
    let nextTimestamp = osmd.cursor.Iterator.currentTimeStamp.RealValue;
    const isEndReached = osmd.cursor.Iterator.EndReached;
    
    let fallbackLength = 1;
    if (entries && entries[0] && entries[0].Notes && entries[0].Notes.length > 0) {
        fallbackLength = entries[0].Notes[0].Length.RealValue;
    }

    if (isEndReached) {
        nextTimestamp = currentTimestamp + fallbackLength;
    }

    let beatsToWait;
    if (nextTimestamp < currentTimestamp) {
        // Repeat / ending jump: iterator moved backward in musical time.
        // Use the current event length instead of a negative timestamp delta.
        beatsToWait = fallbackLength * 4;
    } else {
        beatsToWait = (nextTimestamp - currentTimestamp) * 4;
    }

    const currentRunningBpm = AppState.baseBpm * AppState.speedPercent;
    const waitSeconds = beatsToWait * (60 / currentRunningBpm);
    const playbackWindowStartSec = AppState.mode === 'wait' ? Tone.now() : AppState.anchorTime;

    scheduleMetronomeForPlaybackWindow(
        playbackWindowStartSec,
        currentMeasureIdx,
        currentTimestamp,
        waitSeconds,
        beatsToWait
    );

    let timeToWaitMs = waitSeconds * 1000;
    
    const isLoopEnabled = document.getElementById('check-looper').checked;
    const maxLoop = parseInt(document.getElementById('val-loop-max').value);
    const minLoop = parseInt(document.getElementById('val-loop-min').value);
    
    if (isLoopEnabled && (isEndReached || (osmd.cursor.Iterator.CurrentMeasureIndex + 1 > maxLoop))) {
        
        setTimeout(() => {
            if (!AppState.isPlaying) return;
            
            processMissedNotes(); 
            Tone.Transport.stop(); 

            osmd.cursor.reset();
            while (!osmd.cursor.Iterator.EndReached && osmd.cursor.Iterator.CurrentMeasureIndex < minLoop - 1) {
                osmd.cursor.Iterator.moveToNext();
            }
            osmd.cursor.update();
            handleAutoScroll();
            clearVisuals();

            const restartLoopPlayback = () => {
                GeometryEngine.clearSvgFeedback(); 
                AppState.pendingAudio = []; 
                AppState.score.correct = 0;
                AppState.score.wrong = 0;
                updateScoreDisplay();
                
                AppState.anchorTime = Tone.now(); 
                Tone.Transport.start(); 
                playbackLoop(); 
            };

            if (AppState.loopCountInEnabled) {
                doCountInAndStart(restartLoopPlayback);
            } else {
                restartLoopPlayback();
            }
            
        }, timeToWaitMs);
        
        return; 
    }

    if (AppState.mode === 'wait') {
        AppState.anchorTime = Tone.now() + waitSeconds;
    } else {
        AppState.anchorTime += waitSeconds;
    }
    
    timeToWaitMs = (AppState.anchorTime - Tone.now()) * 1000;
    
    if (timeToWaitMs < 0) {
        timeToWaitMs = 0; 
        if (AppState.mode === 'wait') {
            AppState.anchorTime = Tone.now(); 
        }
    }

    if (AppState.mode === 'wait') {
        AppState.isAudioBusy = true;
        
        if (AppState.expectedNotes.length > 0) {
            // Engine waits for user input
        } else {
            startVisualSustains();
            setTimeout(() => {
                if (AppState.isPlaying) {
                    processMissedNotes();
                    osmd.cursor.update(); 
                    handleAutoScroll();
                    playbackLoop();
                }
            }, 10); 
        }
    } else {
        startVisualSustains(); 
        setTimeout(() => {
            if (AppState.isPlaying) {
                processMissedNotes();
                osmd.cursor.update(); 
                handleAutoScroll();
                playbackLoop();
            }
        }, timeToWaitMs);
    }
}

const backupSettingsButton = document.getElementById('btn-backup-settings');
if (backupSettingsButton) {
    backupSettingsButton.addEventListener('click', () => {
        downloadSettingsBackup();
    });
}

const importSettingsButton = document.getElementById('btn-import-settings');
const importSettingsInput = document.getElementById('input-settings-import');
if (importSettingsButton && importSettingsInput) {
    importSettingsButton.addEventListener('click', () => {
        importSettingsInput.value = '';
        importSettingsInput.click();
    });
    importSettingsInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        handleSettingsBackupImportFile(file);
        importSettingsInput.value = '';
    });
}

const resetPreferencesButton = document.getElementById('btn-reset-preferences');
if (resetPreferencesButton) {
    resetPreferencesButton.addEventListener('click', () => {
        const confirmed = window.confirm('Reset ALL saved Settings and Trainer preferences? This will erase all saved settings and restore defaults.');
        if (!confirmed) return;
        restoreDefaultPreferences();
    });
}

// INIT Call
initPlayerPianoTypeControl();
initLedCountControl();
initLedBrightnessControls();
initLedCalibrationControls();
initLedSimulatorToggleControl();
window.addEventListener('pointerup', (event) => releaseActiveVirtualPointer(`pointer:${event.pointerId}`));
window.addEventListener('pointercancel', (event) => releaseActiveVirtualPointer(`pointer:${event.pointerId}`));
window.addEventListener('mouseup', () => releaseActiveVirtualPointer('mouse'));
window.addEventListener('touchend', (event) => {
    const touch = event.changedTouches?.[0];
    releaseActiveVirtualPointer(touch ? `touch:${touch.identifier}` : 'touch');
}, { passive: true });
window.addEventListener('touchcancel', (event) => {
    const touch = event.changedTouches?.[0];
    releaseActiveVirtualPointer(touch ? `touch:${touch.identifier}` : 'touch');
}, { passive: true });
window.addEventListener('blur', () => releaseActiveVirtualPointer());
document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseActiveVirtualPointer();
});
document.addEventListener('touchstart', () => {
    ensureLiveAudioReady();
}, { passive: true });
document.addEventListener('pointerdown', () => {
    ensureLiveAudioReady();
}, { passive: true });
document.addEventListener('mousedown', () => {
    ensureLiveAudioReady();
}, { passive: true });

ensurePianoSamplerLoaded().catch(() => {});
createKeyboard();
LedEngine.init();
WLEDController.clearLastSignature();
initLedOutputControls();
applyPersistedTrainerAndSettingsPreferences();
if (typeof consumePendingFirstRunNotice === 'function' && consumePendingFirstRunNotice()) {
    window.setTimeout(() => {
        if (window.IntroUI?.maybeShowFirstRunIntro) {
            window.IntroUI.maybeShowFirstRunIntro();
        }
    }, 0);
}
setupMIDI();
updateLedKeyMapping();
LedEngine.ensureSimulator();
LedEngine.renderOutputs();
positionLedCalibrationPanel();
updateConnectionStatuses();

applyModeSettings();

function pulseAnimationNeeded() {
    return false;
}

function startLedPulseLoop() {
    let rafId = null;

    function tick() {
        if (AppState.ledCalibrationMode) {
            renderVirtualKeyboard();
        } else {
            LedEngine.renderOutputs();
        }
        rafId = window.requestAnimationFrame(tick);
    }

    if (rafId === null) {
        rafId = window.requestAnimationFrame(tick);
    }
}

startLedPulseLoop();



window.syncTrainerRoutingUiState = syncTrainerRoutingUiState;
