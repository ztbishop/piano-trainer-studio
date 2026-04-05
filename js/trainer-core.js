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

// IMPORTANT:
// For rendering, pass original .mxl files directly to OSMD.
// Do NOT substitute normalized XML as the render source for .mxl.
// Normalized XML may still be used for other features, but not render.

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

function cloneModeRoutingState(state, fallback) {
    return {
        left: state?.left ?? fallback.left,
        right: state?.right ?? fallback.right
    };
}

function normalizeFollowModeSettings() {
    const follow = AppState.modeSettings.follow;
    const left = !!follow.practice.left;
    const right = !!follow.practice.right;
    const useLeft = left && !right;
    const useRight = !useLeft;
    follow.practice.left = useLeft;
    follow.practice.right = useRight;
    follow.playback.left = !useLeft;
    follow.playback.right = useLeft;
}

function getCurrentModeSettings() {
    const modeKey = AppState.mode === 'wait' ? 'wait' : (AppState.mode === 'follow' ? 'follow' : 'realtime');
    if (!AppState.modeSettings[modeKey]) {
        AppState.modeSettings[modeKey] = {
            practice: { left: true, right: true },
            playback: { left: true, right: true }
        };
    }
    if (modeKey === 'follow') normalizeFollowModeSettings();
    return AppState.modeSettings[modeKey];
}

function syncActiveHandStateFromMode() {
    const settings = getCurrentModeSettings();
    AppState.practice.left = !!settings.practice.left;
    AppState.practice.right = !!settings.practice.right;
    AppState.playback.left = !!settings.playback.left;
    AppState.playback.right = !!settings.playback.right;
}

function setFollowPracticeHand(hand) {
    const follow = AppState.modeSettings.follow;
    const useLeft = hand === 'left';
    follow.practice.left = useLeft;
    follow.practice.right = !useLeft;
    follow.playback.left = !useLeft;
    follow.playback.right = useLeft;
    if (AppState.mode === 'follow') syncActiveHandStateFromMode();
}


function applyPersistedTrainerAndSettingsPreferences() {
    AppState.mode = localStorage.getItem(TRAINER_MODE_STORAGE_KEY) || 'realtime';
    AppState.feedbackEnabled = getStoredBool(TRAINER_FEEDBACK_STORAGE_KEY, true);
    AppState.futurePreviewEnabled = getStoredBool(TRAINER_FUTURE_PREVIEW_STORAGE_KEY, true);
    AppState.futurePreviewDepth = 1;
    AppState.correctHighlightEnabled = getStoredBool(TRAINER_CORRECT_HIGHLIGHT_STORAGE_KEY, true);
    syncActiveHandStateFromMode();
    AppState.audioEnabled.hands = getStoredBool(TRAINER_AUDIO_HANDS_STORAGE_KEY, true);
    AppState.audioEnabled.other = getStoredBool(TRAINER_AUDIO_OTHER_STORAGE_KEY, false);
    AppState.audioEnabled.instrument = getStoredBool(TRAINER_AUDIO_INSTRUMENT_STORAGE_KEY, false);
    AppState.audioEnabled.virtual = getStoredBool(TRAINER_AUDIO_VIRTUAL_STORAGE_KEY, true);
    AppState.midiOutEnabled.hands = getStoredBool(TRAINER_MIDIOUT_HANDS_STORAGE_KEY, false);
    AppState.midiOutEnabled.other = getStoredBool(TRAINER_MIDIOUT_OTHER_STORAGE_KEY, false);
    AppState.midiOutEnabled.instrument = getStoredBool(TRAINER_MIDIOUT_INSTRUMENT_STORAGE_KEY, false);
    AppState.midiOutEnabled.virtual = getStoredBool(TRAINER_MIDIOUT_VIRTUAL_STORAGE_KEY, false);
    AppState.midiOutVolume = getClampedNumber(TRAINER_MIDIOUT_VOL_STORAGE_KEY, 0, 100, 65);
    AppState.midiInBoost = getClampedNumber(TRAINER_MIDIIN_BOOST_STORAGE_KEY, 50, 200, 100);
    AppState.inputVelocityEnabled = true;
    AppState.liveLowLatencyMonitoringEnabled = true;
    setStoredBool(TRAINER_INPUT_VELOCITY_STORAGE_KEY, true);
    setStoredBool(TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY, true);
    AppState.visualPulseEnabled = getStoredBool(VISUAL_PULSE_STORAGE_KEY, true);
    AppState.accentedDownbeatEnabled = getStoredBool(ACCENTED_DOWNBEAT_STORAGE_KEY, true);
    AppState.loopCountInEnabled = getStoredBool(LOOP_COUNT_IN_STORAGE_KEY, true);
    AppState.metronomeMidiOutEnabled = getStoredBool(METRONOME_MIDIOUT_STORAGE_KEY, false);

    const realtimeRadio = document.getElementById('mode-realtime');
    const waitRadio = document.getElementById('mode-wait');
    const followRadio = document.getElementById('mode-follow');
    if (AppState.mode === 'wait') {
        if (waitRadio) waitRadio.checked = true;
    } else if (AppState.mode === 'follow') {
        if (followRadio) followRadio.checked = true;
    } else {
        if (realtimeRadio) realtimeRadio.checked = true;
    }

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

    const playbackLeftCheckbox = document.getElementById('enable-staff-lh');
    if (playbackLeftCheckbox) playbackLeftCheckbox.checked = AppState.playback.left;

    const playbackRightCheckbox = document.getElementById('enable-staff-rh');
    if (playbackRightCheckbox) playbackRightCheckbox.checked = AppState.playback.right;

    const audioHandsCheckbox = document.getElementById('enable-hand-staves');
    if (audioHandsCheckbox) audioHandsCheckbox.checked = AppState.audioEnabled.hands;

    const audioOtherCheckbox = document.getElementById('enable-other');
    if (audioOtherCheckbox) audioOtherCheckbox.checked = AppState.audioEnabled.other;

    const audioInstrumentCheckbox = document.getElementById('enable-instrument');
    if (audioInstrumentCheckbox) audioInstrumentCheckbox.checked = AppState.audioEnabled.instrument;
    syncMidiInBoostUi();

    const audioVirtualCheckbox = document.getElementById('enable-virtual-keyboard');
    if (audioVirtualCheckbox) audioVirtualCheckbox.checked = AppState.audioEnabled.virtual;

    const midiOutHandsCheckbox = document.getElementById('enable-midiout-hand-staves');
    if (midiOutHandsCheckbox) midiOutHandsCheckbox.checked = AppState.midiOutEnabled.hands;

    const midiOutOtherCheckbox = document.getElementById('enable-midiout-other');
    if (midiOutOtherCheckbox) midiOutOtherCheckbox.checked = AppState.midiOutEnabled.other;

    const midiOutInstrumentCheckbox = document.getElementById('enable-midiout-instrument');
    if (midiOutInstrumentCheckbox) midiOutInstrumentCheckbox.checked = AppState.midiOutEnabled.instrument;

    const midiOutVirtualCheckbox = document.getElementById('enable-midiout-virtual-keyboard');
    if (midiOutVirtualCheckbox) midiOutVirtualCheckbox.checked = AppState.midiOutEnabled.virtual;


    const pianoVolume = getClampedNumber(TRAINER_PIANO_VOL_STORAGE_KEY, 0, 100, 80);
    updatePianoVolume(pianoVolume);

    const midiOutVolume = getClampedNumber(TRAINER_MIDIOUT_VOL_STORAGE_KEY, 0, 100, 65);
    updateMidiOutVolume(midiOutVolume, { save: false });

    const midiInBoost = getClampedNumber(TRAINER_MIDIIN_BOOST_STORAGE_KEY, 50, 200, 100);
    updateMidiInBoost(midiInBoost, { save: false });

    const zoomPercent = getClampedNumber(TRAINER_ZOOM_STORAGE_KEY, 50, 150, 100);
    if (localStorage.getItem(TRAINER_ZOOM_STORAGE_KEY) === null || localStorage.getItem(TRAINER_ZOOM_STORAGE_KEY) === '') {
        localStorage.setItem(TRAINER_ZOOM_STORAGE_KEY, String(zoomPercent));
    }
    syncZoomControls(zoomPercent);
    applyZoom(zoomPercent, { save: false });

    const autoScrollCheckbox = document.getElementById('check-autoscroll');
    if (autoScrollCheckbox) autoScrollCheckbox.checked = getStoredBool(TRAINER_AUTOSCROLL_STORAGE_KEY, true);

    const keyboardCheckbox = document.getElementById('check-keyboard');
    const keyboardVisible = getStoredBool(TRAINER_KEYBOARD_STORAGE_KEY, true);
    if (keyboardCheckbox) keyboardCheckbox.checked = keyboardVisible;
    const keyboardContainer = document.getElementById('virtual-keyboard-container');
    if (keyboardContainer) keyboardContainer.classList.toggle('hidden', !keyboardVisible);

    AppState.fullscreenOnPlay = getStoredBool(TRAINER_FULLSCREEN_ON_PLAY_STORAGE_KEY, false);
    const fullscreenOnPlayCheckbox = document.getElementById('check-fullscreen-on-play');
    if (fullscreenOnPlayCheckbox) fullscreenOnPlayCheckbox.checked = AppState.fullscreenOnPlay;
    syncFullscreenUi();

    const debugEnabled = getStoredBool(SETTINGS_DEBUG_STORAGE_KEY, false);
    setDebugEnabled(debugEnabled, { clearHistory: !debugEnabled, logChange: false, reason: 'startup-persisted' });

    const visualPulseCheckbox = document.getElementById('check-visual-pulse');
    if (visualPulseCheckbox) visualPulseCheckbox.checked = AppState.visualPulseEnabled;

    const accentedDownbeatCheckbox = document.getElementById('check-accented-downbeat');
    if (accentedDownbeatCheckbox) accentedDownbeatCheckbox.checked = AppState.accentedDownbeatEnabled;

    const loopCountInCheckbox = document.getElementById('check-loop-countin');
    if (loopCountInCheckbox) loopCountInCheckbox.checked = AppState.loopCountInEnabled;

    const metronomeMidiOutCheckbox = document.getElementById('check-metronome-midiout');
    if (metronomeMidiOutCheckbox) metronomeMidiOutCheckbox.checked = AppState.metronomeMidiOutEnabled;

    const metronomeVolume = getClampedNumber(METRONOME_VOL_STORAGE_KEY, 0, 100, 25);
    updateMetroVolume(metronomeVolume, { save: false });
}

function restoreDefaultPreferences({ reloadDevices = true } = {}) {
    clearSavedPreferences();

    AppState.mode = 'realtime';
    const realtimeRadio = document.getElementById('mode-realtime');
    const waitRadio = document.getElementById('mode-wait');
    if (realtimeRadio) realtimeRadio.checked = true;
    if (waitRadio) waitRadio.checked = false;

    AppState.feedbackEnabled = true;
    const feedbackCheckbox = document.getElementById('check-feedback');
    if (feedbackCheckbox) feedbackCheckbox.checked = true;

    AppState.futurePreviewEnabled = true;
    const futurePreviewCheckbox = document.getElementById('check-future-preview');
    if (futurePreviewCheckbox) futurePreviewCheckbox.checked = true;

    AppState.correctHighlightEnabled = true;
    const correctHighlightCheckbox = document.getElementById('check-correct-highlight');
    if (correctHighlightCheckbox) correctHighlightCheckbox.checked = true;

    AppState.futurePreviewDepth = 1;

    AppState.modeSettings.realtime = { practice: { left: true, right: true }, playback: { left: true, right: true } };
    AppState.modeSettings.wait = { practice: { left: true, right: true }, playback: { left: false, right: false } };
    AppState.modeSettings.follow = { practice: { left: false, right: true }, playback: { left: true, right: false } };
    syncActiveHandStateFromMode();
    const practiceLeftCheckbox = document.getElementById('practice-lh');
    if (practiceLeftCheckbox) practiceLeftCheckbox.checked = true;
    const practiceRightCheckbox = document.getElementById('practice-rh');
    if (practiceRightCheckbox) practiceRightCheckbox.checked = true;

    AppState.audioEnabled.hands = true;
    AppState.audioEnabled.other = false;
    AppState.audioEnabled.instrument = false;
    AppState.audioEnabled.virtual = true;
    const playbackLeftCheckbox = document.getElementById('enable-staff-lh');
    if (playbackLeftCheckbox) playbackLeftCheckbox.checked = AppState.playback.left;
    const playbackRightCheckbox = document.getElementById('enable-staff-rh');
    if (playbackRightCheckbox) playbackRightCheckbox.checked = AppState.playback.right;
    const audioHandsCheckbox = document.getElementById('enable-hand-staves');
    if (audioHandsCheckbox) audioHandsCheckbox.checked = true;
    const audioOtherCheckbox = document.getElementById('enable-other');
    if (audioOtherCheckbox) audioOtherCheckbox.checked = false;
    const audioInstrumentCheckbox = document.getElementById('enable-instrument');
    if (audioInstrumentCheckbox) audioInstrumentCheckbox.checked = false;
    const audioVirtualCheckbox = document.getElementById('enable-virtual-keyboard');
    if (audioVirtualCheckbox) audioVirtualCheckbox.checked = true;
    updateMidiInBoost(getClampedNumber(TRAINER_MIDIIN_BOOST_STORAGE_KEY, 50, 200, 100));
    syncMidiInBoostUi();

    AppState.midiOutEnabled.hands = false;
    AppState.midiOutEnabled.other = false;
    AppState.midiOutEnabled.instrument = false;
    AppState.midiOutEnabled.virtual = false;
    const midiOutHandsCheckbox = document.getElementById('enable-midiout-hand-staves');
    if (midiOutHandsCheckbox) midiOutHandsCheckbox.checked = false;
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

    AppState.visualPulseEnabled = true;
    const visualPulseCheckbox = document.getElementById('check-visual-pulse');
    if (visualPulseCheckbox) visualPulseCheckbox.checked = true;

    AppState.accentedDownbeatEnabled = true;
    const accentedDownbeatCheckbox = document.getElementById('check-accented-downbeat');
    if (accentedDownbeatCheckbox) accentedDownbeatCheckbox.checked = true;

    AppState.loopCountInEnabled = true;
    const loopCountInCheckbox = document.getElementById('check-loop-countin');
    if (loopCountInCheckbox) loopCountInCheckbox.checked = true;

    AppState.metronomeMidiOutEnabled = false;
    const metronomeMidiOutCheckbox = document.getElementById('check-metronome-midiout');
    if (metronomeMidiOutCheckbox) metronomeMidiOutCheckbox.checked = false;

    updateMetroVolume(25, { save: true });
    syncTempoMetronomeDependentUi();

    setDebugEnabled(false, { clearHistory: true, logChange: false, reason: 'reset-defaults' });

    setPlayerPianoType(88);
    setLedCount(88);
    setLedMasterBrightness(25);
    setLedFuture1BrightnessPct(1);
    setLedFuture2BrightnessPct(1);
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

const TONE_AUDIO_PERFORMANCE_SETTINGS = Object.freeze({
    latencyHint: 0.001,
    lookAhead: 0.005,
    updateInterval: 0.005
});

const FOLLOW_ME_MIN_WAIT_RATIO = 0.6;

function configureLowLatencyToneContext() {
    try {
        if (typeof Tone?.Context === 'function' && typeof Tone?.setContext === 'function') {
            Tone.setContext(new Tone.Context(TONE_AUDIO_PERFORMANCE_SETTINGS));
        }
    } catch (err) {
        console.warn('Could not replace Tone.js context with low-latency settings.', err);
    }

    try {
        const ctx = typeof Tone?.getContext === 'function' ? Tone.getContext() : Tone?.context;
        if (!ctx) return;
        if ('latencyHint' in ctx) ctx.latencyHint = TONE_AUDIO_PERFORMANCE_SETTINGS.latencyHint;
        if ('lookAhead' in ctx) ctx.lookAhead = TONE_AUDIO_PERFORMANCE_SETTINGS.lookAhead;
        if ('updateInterval' in ctx) ctx.updateInterval = TONE_AUDIO_PERFORMANCE_SETTINGS.updateInterval;
    } catch (err) {
        console.warn('Could not apply low-latency tuning to Tone.js context.', err);
    }
}

function getPreferredPianoSampleExtension() {
    try {
        const probe = document.createElement('audio');
        const oggSupport = typeof probe.canPlayType === 'function'
            ? probe.canPlayType('audio/ogg; codecs="vorbis"')
            : '';
        return oggSupport && oggSupport !== 'no' ? 'ogg' : 'mp3';
    } catch (_) {
        return 'mp3';
    }
}

configureLowLatencyToneContext();

const PIANO_SAMPLE_EXTENSION = getPreferredPianoSampleExtension();
const masterPianoVolume = new Tone.Volume(0).toDestination();

const lowLatencyPlaybackSynth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 24,
    volume: -6,
    options: {
        oscillator: { type: 'triangle' },
        envelope: {
            attack: 0.001,
            decay: 0.08,
            sustain: 0.18,
            release: 0.12
        }
    }
}).connect(masterPianoVolume);

const pianoSampler = new Tone.Sampler({
    urls: {
        "A0": `A0.${PIANO_SAMPLE_EXTENSION}`, "C1": `C1.${PIANO_SAMPLE_EXTENSION}`, "D#1": `Ds1.${PIANO_SAMPLE_EXTENSION}`, "F#1": `Fs1.${PIANO_SAMPLE_EXTENSION}`,
        "A1": `A1.${PIANO_SAMPLE_EXTENSION}`, "C2": `C2.${PIANO_SAMPLE_EXTENSION}`, "D#2": `Ds2.${PIANO_SAMPLE_EXTENSION}`, "F#2": `Fs2.${PIANO_SAMPLE_EXTENSION}`,
        "A2": `A2.${PIANO_SAMPLE_EXTENSION}`, "C3": `C3.${PIANO_SAMPLE_EXTENSION}`, "D#3": `Ds3.${PIANO_SAMPLE_EXTENSION}`, "F#3": `Fs3.${PIANO_SAMPLE_EXTENSION}`,
        "A3": `A3.${PIANO_SAMPLE_EXTENSION}`, "C4": `C4.${PIANO_SAMPLE_EXTENSION}`, "D#4": `Ds4.${PIANO_SAMPLE_EXTENSION}`, "F#4": `Fs4.${PIANO_SAMPLE_EXTENSION}`,
        "A4": `A4.${PIANO_SAMPLE_EXTENSION}`, "C5": `C5.${PIANO_SAMPLE_EXTENSION}`, "D#5": `Ds5.${PIANO_SAMPLE_EXTENSION}`, "F#5": `Fs5.${PIANO_SAMPLE_EXTENSION}`,
        "A5": `A5.${PIANO_SAMPLE_EXTENSION}`, "C6": `C6.${PIANO_SAMPLE_EXTENSION}`, "D#6": `Ds6.${PIANO_SAMPLE_EXTENSION}`, "F#6": `Fs6.${PIANO_SAMPLE_EXTENSION}`,
        "A6": `A6.${PIANO_SAMPLE_EXTENSION}`, "C7": `C7.${PIANO_SAMPLE_EXTENSION}`, "D#7": `Ds7.${PIANO_SAMPLE_EXTENSION}`, "F#7": `Fs7.${PIANO_SAMPLE_EXTENSION}`,
        "A7": `A7.${PIANO_SAMPLE_EXTENSION}`, "C8": `C8.${PIANO_SAMPLE_EXTENSION}`
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

function shouldUseLowLatencyPlaybackPath() {
    if (!AppState.lowLatencyPlaybackEnabled) return false;
    return AppState.mode === 'follow' || AppState.mode === 'realtime';
}

function playLowLatencyPlaybackNote(midi, velocity = 100, durationMs = null) {
    const noteName = getSamplerNoteName(midi);
    if (!noteName) return;

    const normalized = normalizeLiveVelocity(velocity);
    const liveTime = getLiveAudioTime();

    if (Number.isFinite(durationMs) && durationMs > 0) {
        lowLatencyPlaybackSynth.triggerAttackRelease(noteName, Math.max(0.01, durationMs / 1000), liveTime, normalized.gain);
        return;
    }

    lowLatencyPlaybackSynth.triggerRelease(noteName, liveTime);
    lowLatencyPlaybackSynth.triggerAttack(noteName, liveTime, normalized.gain);
}

function playScheduledPlaybackNote(midi, velocity = 100, durationMs = null) {
    if (shouldUseLowLatencyPlaybackPath()) {
        playLowLatencyPlaybackNote(midi, velocity, durationMs);
        return;
    }
    playLocalPianoNote(midi, velocity, durationMs);
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

function getMetronomeMidiClickSpec(isDownbeat) {
    if (isDownbeat && AppState.accentedDownbeatEnabled !== false) {
        return { note: 75, velocity: 118 };
    }
    return { note: 76, velocity: 92 };
}

function getMetronomeMidiVelocity(volumePercent, clickVelocity = 100) {
    const volumeScale = Math.max(0, Math.min(100, Number(volumePercent) || 0)) / 100;
    const baseVelocity = Math.max(1, Math.min(127, Math.round(Number(clickVelocity) || 100)));
    return Math.max(1, Math.min(127, Math.round(baseVelocity * volumeScale)));
}

function shouldUseMidiOutMetronome() {
    return !!AppState.metronomeMidiOutEnabled && !!getSelectedMidiOutOutput();
}

function sendMidiOutMetronomeClick(note, velocity = 100, durationMs = 80) {
    const output = getSelectedMidiOutOutput();
    if (!output) return false;
    const channel = 10;
    const noteNumber = Math.max(0, Math.min(127, Math.round(Number(note) || 0)));
    const finalVelocity = getMetronomeMidiVelocity(metroVolSlider?.value, velocity);
    const onStatus = getMidiStatus(0x90, channel);
    const offStatus = getMidiStatus(0x80, channel);
    rememberOutgoingMidiMessage(onStatus, noteNumber, finalVelocity);
    output.send([onStatus, noteNumber, finalVelocity]);
    window.setTimeout(() => {
        rememberOutgoingMidiMessage(offStatus, noteNumber, 0);
        output.send([offStatus, noteNumber, 0]);
    }, Math.max(20, Number(durationMs) || 80));
    return true;
}

function playMetronomeClick(isDownbeat, timeSec = null) {
    const pulseTime = Number.isFinite(timeSec) ? timeSec : null;
    if (shouldUseMidiOutMetronome()) {
        const clickSpec = getMetronomeMidiClickSpec(isDownbeat);
        const delayMs = pulseTime == null ? 0 : Math.max(0, ((pulseTime - Tone.now()) * 1000) - 2);
        window.setTimeout(() => {
            if (!document.getElementById('check-metronome')?.checked) return;
            sendMidiOutMetronomeClick(clickSpec.note, clickSpec.velocity);
        }, delayMs);
        triggerTempoVisualPulse(pulseTime);
        return;
    }

    const clickSpec = getMetronomeClickSpec(isDownbeat);
    metronomeSynth.triggerAttackRelease(clickSpec.note, '64n', pulseTime ?? Tone.now(), clickSpec.velocity);
    triggerTempoVisualPulse(pulseTime);
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
        playMetronomeClick(isDownbeat);

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
            const timeoutId = window.setTimeout(() => {
                if (!AppState.isPlaying || AppState.countInActive) return;
                if (!document.getElementById('check-metronome')?.checked) return;
                playMetronomeClick(isDownbeat, shouldUseMidiOutMetronome() ? null : getLiveAudioTime());
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



function cloneScoreRawData(rawData) {
    if (typeof rawData === 'string') return rawData;
    if (rawData instanceof ArrayBuffer) return rawData.slice(0);
    if (ArrayBuffer.isView(rawData)) {
        return rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
    }
    if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
        return rawData.slice(0, rawData.size, rawData.type || '');
    }
    return rawData;
}

function readUint16LE(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes, offset) {
    return (
        bytes[offset] |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
    ) >>> 0;
}

function normalizeZipEntryPath(path) {
    return String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
}

function getZipEntryDepth(path) {
    const normalized = normalizeZipEntryPath(path);
    if (!normalized) return Number.MAX_SAFE_INTEGER;
    return normalized.split('/').length - 1;
}

async function rawDataToArrayBuffer(rawData) {
    if (rawData instanceof ArrayBuffer) return rawData;
    if (ArrayBuffer.isView(rawData)) {
        return rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
    }
    if (typeof Blob !== 'undefined' && rawData instanceof Blob) {
        return await rawData.arrayBuffer();
    }
    return null;
}

function listZipEntries(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    const eocdSignature = 0x06054b50;
    const centralSignature = 0x02014b50;
    const minEocdSize = 22;
    const maxCommentLength = 0xffff;
    const searchStart = Math.max(0, bytes.length - (minEocdSize + maxCommentLength));

    let eocdOffset = -1;
    for (let offset = bytes.length - minEocdSize; offset >= searchStart; offset -= 1) {
        if (readUint32LE(bytes, offset) === eocdSignature) {
            eocdOffset = offset;
            break;
        }
    }

    if (eocdOffset < 0) {
        throw new Error('Could not find the ZIP directory in this MXL file.');
    }

    const entryCount = readUint16LE(bytes, eocdOffset + 10);
    const centralDirectoryOffset = readUint32LE(bytes, eocdOffset + 16);
    let offset = centralDirectoryOffset;
    const decoder = new TextDecoder('utf-8');
    const entries = [];

    for (let index = 0; index < entryCount; index += 1) {
        if (offset + 46 > bytes.length || readUint32LE(bytes, offset) !== centralSignature) {
            throw new Error('Could not read the ZIP entries from this MXL file.');
        }

        const compressionMethod = readUint16LE(bytes, offset + 10);
        const compressedSize = readUint32LE(bytes, offset + 20);
        const uncompressedSize = readUint32LE(bytes, offset + 24);
        const fileNameLength = readUint16LE(bytes, offset + 28);
        const extraFieldLength = readUint16LE(bytes, offset + 30);
        const fileCommentLength = readUint16LE(bytes, offset + 32);
        const localHeaderOffset = readUint32LE(bytes, offset + 42);
        const fileNameStart = offset + 46;
        const fileNameEnd = fileNameStart + fileNameLength;
        const fileName = decoder.decode(bytes.slice(fileNameStart, fileNameEnd));

        entries.push({
            fileName,
            compressionMethod,
            compressedSize,
            uncompressedSize,
            localHeaderOffset
        });

        offset = fileNameEnd + extraFieldLength + fileCommentLength;
    }

    return entries;
}

async function inflateZipEntryData(compressedBytes, compressionMethod) {
    if (compressionMethod === 0) {
        return compressedBytes;
    }

    if (compressionMethod !== 8) {
        throw new Error(`Unsupported MXL compression method: ${compressionMethod}.`);
    }

    if (typeof DecompressionStream !== 'function') {
        throw new Error('This browser does not support ZIP decompression for transpose.');
    }

    const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    const inflatedBuffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(inflatedBuffer);
}

async function extractZipEntryText(arrayBuffer, entry) {
    const bytes = new Uint8Array(arrayBuffer);
    const localSignature = 0x04034b50;
    const localOffset = entry.localHeaderOffset;

    if (localOffset + 30 > bytes.length || readUint32LE(bytes, localOffset) !== localSignature) {
        throw new Error(`Could not read ZIP entry "${entry.fileName}".`);
    }

    const fileNameLength = readUint16LE(bytes, localOffset + 26);
    const extraFieldLength = readUint16LE(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + entry.compressedSize;
    const compressedBytes = bytes.slice(dataStart, dataEnd);
    const inflatedBytes = await inflateZipEntryData(compressedBytes, entry.compressionMethod);
    return new TextDecoder('utf-8').decode(inflatedBytes);
}

function chooseMusicXmlEntry(entries, containerPath = '') {
    const normalizedContainerPath = normalizeZipEntryPath(containerPath).toLowerCase();
    const xmlEntries = entries.filter((entry) => {
        const normalizedPath = normalizeZipEntryPath(entry.fileName);
        if (!normalizedPath) return false;
        if (normalizedPath.toLowerCase() === 'meta-inf/container.xml') return false;
        return /\.(xml|musicxml)$/i.test(normalizedPath);
    });

    if (!xmlEntries.length) return null;

    if (normalizedContainerPath) {
        const containerMatch = xmlEntries.find((entry) => normalizeZipEntryPath(entry.fileName).toLowerCase() === normalizedContainerPath);
        if (containerMatch) return containerMatch;
    }

    const rootLevelEntry = xmlEntries
        .filter((entry) => getZipEntryDepth(entry.fileName) === 0)
        .sort((left, right) => normalizeZipEntryPath(left.fileName).localeCompare(normalizeZipEntryPath(right.fileName)))[0];
    if (rootLevelEntry) return rootLevelEntry;

    return xmlEntries.sort((left, right) => {
        const depthDelta = getZipEntryDepth(left.fileName) - getZipEntryDepth(right.fileName);
        if (depthDelta !== 0) return depthDelta;
        return normalizeZipEntryPath(left.fileName).localeCompare(normalizeZipEntryPath(right.fileName));
    })[0];
}

async function extractMusicXmlFromMxl(rawData) {
    const arrayBuffer = await rawDataToArrayBuffer(rawData);
    if (!arrayBuffer) return null;

    const entries = listZipEntries(arrayBuffer);
    const containerEntry = entries.find((entry) => normalizeZipEntryPath(entry.fileName).toLowerCase() === 'meta-inf/container.xml');
    let containerPath = '';

    if (containerEntry) {
        try {
            const containerText = await extractZipEntryText(arrayBuffer, containerEntry);
            const match = containerText.match(/full-path\s*=\s*["']([^"']+)["']/i);
            if (match && match[1]) {
                containerPath = match[1];
            }
        } catch (_) {}
    }

    const xmlEntry = chooseMusicXmlEntry(entries, containerPath);
    if (!xmlEntry) {
        throw new Error('Could not find the embedded MusicXML inside this MXL file.');
    }

    return await extractZipEntryText(arrayBuffer, xmlEntry);
}

async function getCanonicalMusicXmlForTranspose(rawData, { fileName = 'Untitled Score', fileType = 'xml' } = {}) {
    const resolvedType = String(fileType || getScoreFileTypeFromName(fileName || '') || 'xml').toLowerCase();
    if (resolvedType === 'xml' || resolvedType === 'musicxml') {
        return typeof rawData === 'string' ? rawData : null;
    }

    if (resolvedType === 'mxl') {
        try {
            return await extractMusicXmlFromMxl(rawData);
        } catch (extractErr) {
            if (window.MidiImport && typeof window.MidiImport.normalizeScoreToMusicXml === 'function') {
                try {
                    return await window.MidiImport.normalizeScoreToMusicXml(rawData, { fileName, fileType: resolvedType });
                } catch (normalizeErr) {
                    console.warn('Could not normalize MXL to MusicXML for transpose support.', normalizeErr);
                    console.warn('Direct MXL XML extraction also failed.', extractErr);
                    return null;
                }
            }
            console.warn('Could not extract MXL to MusicXML for transpose support.', extractErr);
            return null;
        }
    }

    return null;
}

function getOsmdLoadPayload(rawData, fileType = 'xml', fileName = 'Untitled Score') {
    const resolvedType = String(fileType || getScoreFileTypeFromName(fileName || '') || 'xml').toLowerCase();
    if (resolvedType !== 'mxl') return rawData;

    const resolvedName = fileName || 'Untitled Score.mxl';

    // For reconstructed library MXL files, do not force a MIME type.
    // Browser-selected .mxl files usually arrive with an empty/neutral type,
    // and OSMD reliably identifies them by filename/contents.
    // Forcing an XML-ish MIME here can make compressed MXL payloads look like
    // invalid plain documents when reopening starter-library scores.
    if (rawData instanceof File) return rawData;
    if (rawData instanceof Blob) {
        if (typeof File === 'function') {
            return new File([rawData], resolvedName);
        }
        rawData.name = resolvedName;
        return rawData;
    }
    if (rawData instanceof ArrayBuffer) {
        if (typeof File === 'function') {
            return new File([rawData], resolvedName);
        }
        const blob = new Blob([rawData]);
        blob.name = resolvedName;
        return blob;
    }
    if (ArrayBuffer.isView(rawData)) {
        const slice = rawData.buffer.slice(rawData.byteOffset, rawData.byteOffset + rawData.byteLength);
        if (typeof File === 'function') {
            return new File([slice], resolvedName);
        }
        const blob = new Blob([slice]);
        blob.name = resolvedName;
        return blob;
    }

    return rawData;
}




async function loadScoreIntoApp(rawData, { fileName = 'Untitled Score', fileType = 'xml', libraryScoreId = null, title = null, originalRawData = undefined, originalFileName = undefined, originalFileType = undefined, skipTransposeReset = false } = {}) {
    try {
        resetPlaybackForLoadedScore();

        if (!skipTransposeReset && typeof updateTempo === 'function') {
            updateTempo('percent', 100);
        }

        const resolvedOriginalRawData = originalRawData !== undefined ? originalRawData : rawData;
        const resolvedOriginalFileName = originalFileName !== undefined ? originalFileName : (fileName || 'Untitled Score');
        const resolvedOriginalFileType = originalFileType !== undefined ? originalFileType : (fileType || getScoreFileTypeFromName(fileName));

        const transposeSourceRawData = cloneScoreRawData(resolvedOriginalRawData);
        const osmdSourceRawData = cloneScoreRawData(rawData);

        const canonicalOriginalMusicXml = await getCanonicalMusicXmlForTranspose(transposeSourceRawData, {
            fileName: resolvedOriginalFileName,
            fileType: resolvedOriginalFileType
        });

        const osmdLoadPayload = getOsmdLoadPayload(osmdSourceRawData, fileType, fileName);
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
        AppState.currentScoreOriginalData = canonicalOriginalMusicXml || resolvedOriginalRawData;
        AppState.currentScoreFileName = fileName || 'Untitled Score';
        AppState.currentScoreOriginalFileName = resolvedOriginalFileName;
        AppState.currentScoreFileType = fileType || getScoreFileTypeFromName(fileName);
        AppState.currentScoreOriginalFileType = resolvedOriginalFileType;
        AppState.currentScoreLibraryId = libraryScoreId ?? null;
        AppState.currentScoreTitle = title || getScoreDisplayTitle(fileName || '');

        if (libraryScoreId && window.ScoreLibrary) {
            await ScoreLibrary.markScoreOpened(libraryScoreId);
            await refreshScoresDrawer();
        }

        if (window.TransposeUI && typeof window.TransposeUI.handleScoreLoaded === 'function') {
            if (!skipTransposeReset) {
                window.TransposeUI.handleScoreLoaded();
            } else {
                window.TransposeUI.refreshAvailabilityFromCurrentScore();
                window.TransposeUI.syncUiFromState();
            }
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
        alert(err?.message || 'Error loading score file.');
        throw err;
    }
}

async function handleDirectScoreFileSelection(file) {
    if (!file) return;

    if (window.MidiImport && typeof window.MidiImport.isConverterImportFileName === 'function' && window.MidiImport.isConverterImportFileName(file.name || '')) {
        const convertedScore = await window.MidiImport.convertFileToScore(file);
        await loadScoreIntoApp(convertedScore.rawData, convertedScore);
        if (window.ScoresUI && typeof window.ScoresUI.closeScoresDrawer === 'function') {
            window.ScoresUI.closeScoresDrawer();
        }
        return;
    }

    const scoreFile = await readScoreFile(file);
    await loadScoreIntoApp(scoreFile.rawData, scoreFile);
    if (window.ScoresUI && typeof window.ScoresUI.closeScoresDrawer === 'function') {
        window.ScoresUI.closeScoresDrawer();
    }
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
        buildExpectedNotesFromEntries(entries, currentMeasureIdx, currentTimestamp);
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
    document.getElementById('val-loop-min').min = 1;
    document.getElementById('val-loop-min').max = totalMeasures;
    document.getElementById('val-loop-max').min = 1;
    document.getElementById('val-loop-max').max = totalMeasures;
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

function getSinglePracticedHandRole() {
    const left = !!AppState.practice.left;
    const right = !!AppState.practice.right;
    if (left === right) return null;
    return left ? 'left' : 'right';
}

function getRenderableNotesForHandFromTimelineEvent(event, handRole) {
    if (!event?.notes?.length || !handRole) return [];
    return event.notes.filter(note => getAssignedHandRoleForStaff(note.staffId) === handRole);
}

function findSingleHandPracticeTimelineWindow() {
    const handRole = getSinglePracticedHandRole();
    const ctx = AppState.currentExpectedContext;
    if (!handRole || !ctx) return null;

    const timeline = ensureLedPreviewTimelineBuilt();
    if (!Array.isArray(timeline) || timeline.length === 0) return null;

    const currentIndex = findMatchingLedPreviewTimelineIndex(
        timeline,
        ctx.measureIndex,
        ctx.timestamp,
        ctx.signature,
        0
    );
    if (currentIndex < 0) return null;

    let referenceEvent = null;
    let referenceIndex = -1;
    for (let i = currentIndex; i >= 0; i--) {
        const notes = getRenderableNotesForHandFromTimelineEvent(timeline[i], handRole);
        if (notes.length > 0) {
            referenceEvent = {
                measureIndex: timeline[i].measureIndex,
                timestamp: timeline[i].timestamp,
                notes
            };
            referenceIndex = i;
            break;
        }
    }

    let nextEvent = null;
    let nextIndex = -1;
    for (let i = currentIndex + 1; i < timeline.length; i++) {
        const notes = getRenderableNotesForHandFromTimelineEvent(timeline[i], handRole);
        if (notes.length > 0) {
            nextEvent = {
                measureIndex: timeline[i].measureIndex,
                timestamp: timeline[i].timestamp,
                notes
            };
            nextIndex = i;
            break;
        }
    }

    return {
        handRole,
        timeline,
        currentIndex,
        referenceEvent,
        referenceIndex,
        nextEvent,
        nextIndex
    };
}

function findNextSingleHandPracticeTimelineEvent() {
    return findSingleHandPracticeTimelineWindow()?.nextEvent || null;
}

function getSingleHandPracticeBeatsUntilNextEvent(windowInfo) {
    const nextEvent = windowInfo?.nextEvent;
    if (!nextEvent) return Number.POSITIVE_INFINITY;

    const referenceEvent = windowInfo?.referenceEvent;
    if (!referenceEvent) {
        const ctx = AppState.currentExpectedContext;
        if (!ctx || !Number.isFinite(ctx.measureIndex) || !Number.isFinite(ctx.timestamp)) {
            return Number.POSITIVE_INFINITY;
        }
        return window.PTTiming.getTraversalBeatsToWait({
            currentMeasureIdx: ctx.measureIndex,
            currentTimestamp: ctx.timestamp,
            nextMeasureIdx: nextEvent.measureIndex,
            nextTimestamp: nextEvent.timestamp,
            fallbackLength: 0.25,
            getMeasureTimingInfo
        });
    }

    return window.PTTiming.getTraversalBeatsToWait({
        currentMeasureIdx: referenceEvent.measureIndex,
        currentTimestamp: referenceEvent.timestamp,
        nextMeasureIdx: nextEvent.measureIndex,
        nextTimestamp: nextEvent.timestamp,
        fallbackLength: 0.25,
        getMeasureTimingInfo
    });
}

function tryReserveSingleHandEarlyGrace(midi) {
    if (!AppState.isPlaying) return null;
    if (AppState.mode !== 'follow' && AppState.mode !== 'realtime') return null;
    if (!getSinglePracticedHandRole()) return null;
    if (AppState.expectedNotes.length > 0 && !AppState.expectedNotes.every(n => n.hit)) return null;

    const practiceWindow = findSingleHandPracticeTimelineWindow();
    const nextEvent = practiceWindow?.nextEvent || null;
    if (!nextEvent) return null;

    const matched = nextEvent.notes.find(note => note.midi === midi);
    if (!matched) return null;

    const beatsUntilTarget = getSingleHandPracticeBeatsUntilNextEvent(practiceWindow);
    // In Follow Me, early grace should be based on the next cursor for the practiced hand only.
    // Once we have identified that next practiced-hand event, keep the reservation even if the user
    // releases before the app reaches any intervening playback-hand cursor steps.
    const allowTapCarry = AppState.mode === 'follow'
        ? true
        : (Number.isFinite(beatsUntilTarget) && beatsUntilTarget <= 1.05);
    const reservation = {
        midi,
        staffId: matched.staffId,
        measureIndex: nextEvent.measureIndex,
        timestamp: nextEvent.timestamp,
        allowTapCarry,
        beatsUntilTarget: Number.isFinite(beatsUntilTarget) ? beatsUntilTarget : null
    };

    AppState.earlyGraceReservations.set(midi, reservation);
    AppState.heldCorrectNotes.set(midi, matched.staffId);
    AppState.preExpectedHeldNotes.add(midi);
    return reservation;
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

function findSatisfiedOrSustainedMatchForMidi(midi) {
    const alreadyHit = AppState.expectedNotes.find(n => n.midi === midi && n.hit);
    if (alreadyHit) {
        return { midi, staffId: alreadyHit.staffId, mIdx: alreadyHit.mIdx, source: 'already-hit' };
    }

    const sustained = AppState.sustainedVisuals.find(n => n.midi === midi)
        || AppState.visualNotesToStart.find(n => n.midi === midi);
    if (sustained) {
        return { midi, staffId: sustained.staffId, mIdx: sustained.mIdx ?? null, source: 'sustained-visual' };
    }

    return null;
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

    if ((AppState.mode === 'wait' || AppState.mode === 'follow') && Number.isFinite(currentTimestamp)) {
        AppState.sustainedVisuals = AppState.sustainedVisuals.filter(n => {
            return !Number.isFinite(n.endTimestamp) || currentTimestamp < n.endTimestamp;
        });
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
            const hasActiveSustainForMidi = AppState.sustainedVisuals.some(v => v.midi === midi)
                || AppState.visualNotesToStart.some(v => v.midi === midi)
                || AppState.expectedNotes.some(n => n.midi === midi);

            if (hasActiveSustainForMidi) {
                if (AppState.correctHighlightEnabled) {
                    const staffId = AppState.heldCorrectNotes.get(midi);
                    desiredStates.set(midi, getAssignedHandRoleForStaff(staffId) === 'left' ? 'pressed-l' : 'pressed-r');
                } else {
                    desiredStates.delete(midi);
                }
            } else {
                // Ignore keys that remain physically held after their musical/visual
                // lifespan has ended. They should not stay amber, but they also
                // should not fall through to wrong/red while still held.
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
        const vis = { midi: n.midi, staffId: n.staffId, mIdx: n.mIdx, endTimestamp: n.endTimestamp };
        AppState.sustainedVisuals.push(vis);
        renderVirtualKeyboard();

        if (!((AppState.mode === 'wait' || AppState.mode === 'follow') && Number.isFinite(n.endTimestamp))) {
            const tId = setTimeout(() => {
                const idx = AppState.sustainedVisuals.indexOf(vis);
                if (idx > -1) {
                    AppState.sustainedVisuals.splice(idx, 1);
                    renderVirtualKeyboard();
                }
            }, n.durationMs);

            AppState.activeTimeouts.push(tId);
        }
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

function clearFeedbackVisualStatePreserveScoring() {
    GeometryEngine.clearSvgFeedback();
    AppState.activeHeldIncorrectFeedback.clear();
    AppState.releasedIncorrectFeedback = [];
    AppState.correctFeedbackHistory = [];
    AppState.realtimeWrongPressInCurrentContext = false;
    if (typeof window.clearStickyDebug === 'function') {
        window.clearStickyDebug();
    }
}

function clearVisuals() {
    clearFeedbackVisualStatePreserveScoring();
    AppState.activeTimeouts.forEach(id => clearTimeout(id));
    AppState.activeTimeouts = [];
    AppState.sustainedVisuals = [];
    AppState.visualNotesToStart = [];
    AppState.expectedNotes = [];
    AppState.outOfRangeCurrentNotes = [];
    AppState.activeHeldIncorrectFeedback.clear();
    AppState.releasedIncorrectFeedback = [];
    AppState.correctFeedbackHistory = [];
    AppState.realtimeWrongPressInCurrentContext = false;
    AppState.heldCorrectNotes.clear(); 
    AppState.preExpectedHeldNotes.clear();
    AppState.lastLedPreviewEvents = [];
    AppState.ledPreviewTraversalIndex = -1;
    AppState.followAdvanceInfo = null;
    AppState.currentExpectedContext = null;
    AppState.earlyGraceReservations.clear();
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

function getLiveMonitoringVelocity(source, velocity = 100) {
    if (source !== 'midi') return velocity;
    const boostPercent = Math.max(50, Math.min(200, Number(AppState.midiInBoost) || 100));
    return Math.max(1, Math.min(127, Math.round((Number(velocity) || 100) * (boostPercent / 100))));
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
    const summaryHint = document.getElementById('trainer-midi-out-summary-hint');
    if (summary) {
        if (hasMidiOut) {
            const outName = document.getElementById('midi-out')?.selectedOptions?.[0]?.textContent?.replace(/\s*\(Disconnected\)\s*$/, '') || 'MIDI Out';
            summary.textContent = `Send playback and input to ${outName}.`;
            summary.classList.remove('is-disabled');
            summaryHint?.classList.add('hidden');
        } else {
            summary.textContent = 'No MIDI device selected.';
            summary.classList.add('is-disabled');
            summaryHint?.classList.remove('hidden');
        }
    }
    midiOutCard?.classList.toggle('is-disabled', !hasMidiOut);
    const midiOutVolumeSlider = document.getElementById('slider-midiout-vol');
    const midiOutVolumeInput = document.getElementById('val-midiout-vol');
    if (midiOutVolumeSlider) midiOutVolumeSlider.disabled = !hasMidiOut;
    if (midiOutVolumeInput) midiOutVolumeInput.disabled = !hasMidiOut;
    ['enable-midiout-hand-staves', 'enable-midiout-other', 'enable-midiout-instrument', 'enable-midiout-virtual-keyboard'].forEach((id) => {
        const input = document.getElementById(id);
        if (!input) return;
        const shouldDisable = !hasMidiOut || (AppState.mode === 'wait' && id === 'enable-midiout-hand-staves');
        input.disabled = shouldDisable;
        input.closest('label')?.classList.toggle('is-disabled', shouldDisable);
    });
    syncTempoMetronomeDependentUi();
}

function shouldRouteLiveSourceToLocalAudio(source) {
    const roleKey = getSourceRoleKey(source);
    return roleKey ? getRoutingEnabledForRole(AppState.audioEnabled, roleKey) : false;
}

function shouldRouteLiveSourceToMidiOut(source) {
    const roleKey = getSourceRoleKey(source);
    return roleKey ? getRoutingEnabledForRole(AppState.midiOutEnabled, roleKey) : false;
}

function getMidiOutExpressionValue(value = AppState.midiOutVolume) {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    return Math.max(0, Math.min(127, Math.round((percent / 100) * 127)));
}

function sendMidiOutExpressionLevel(value = AppState.midiOutVolume) {
    const output = getSelectedMidiOutOutput();
    if (!output) return false;
    const status = getMidiOutStatus(0xB0);
    output.send([status, 11, getMidiOutExpressionValue(value)]);
    return true;
}

function sendMidiOutNoteOn(midi, velocity = 100) {
    const output = getSelectedMidiOutOutput();
    if (!output) return false;
    const status = getMidiOutStatus(0x90);
    const finalVelocity = normalizeLiveVelocity(velocity).midi;
    rememberOutgoingMidiMessage(status, midi, finalVelocity);
    output.send([status, midi, finalVelocity]);
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
        playScheduledPlaybackNote(midi, velocity, durationMs);
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
        const localAudioVelocity = getLiveMonitoringVelocity(source, liveVelocity);

        if (shouldRouteLiveSourceToLocalAudio(source)) {
            playLocalPianoNote(midi, localAudioVelocity, null, {
                lowLatencyLive: source === 'ui' ? true : !!AppState.liveLowLatencyMonitoringEnabled,
                retrigger: true
            });
        }

        if (shouldRouteLiveSourceToMidiOut(source)) {
            sendMidiOutNoteOn(midi, normalizeLiveVelocity(liveVelocity).midi, { scaleVolume: source === 'ui' });
        }

        if (AppState.ledCalibrationMode) {
            selectLedCalibrationMidi(midi);
            renderVirtualKeyboard();
            return;
        }
        
        if (AppState.isPlaying) {
            const expectedMatch = findExpectedMatchForMidi(midi);
            const sustainMatch = !expectedMatch ? findSatisfiedOrSustainedMatchForMidi(midi) : null;
            const repeatCarryReservation = (!expectedMatch && sustainMatch?.source === 'already-hit')
                ? tryReserveSingleHandEarlyGrace(midi)
                : null;
            const earlyGraceReservation = (!expectedMatch && !sustainMatch)
                ? tryReserveSingleHandEarlyGrace(midi)
                : repeatCarryReservation;
            const isCorrect = !!expectedMatch;
            const isAcceptedRepeat = !expectedMatch && !!sustainMatch;
            const isEarlyGraceReserved = !!earlyGraceReservation;
            const targetStaffId = expectedMatch ? expectedMatch.staffId : (sustainMatch ? sustainMatch.staffId : (earlyGraceReservation ? earlyGraceReservation.staffId : null));
            
            if (AppState.practice.left || AppState.practice.right) {
                const forceMIdx = expectedMatch ? expectedMatch.mIdx : null;
                const anchor = expectedMatch ? expectedMatch.anchor : null;

                debugLogEvent('KEY_PRESS_MATCH_RESULT', {
                    midi,
                    isCorrect,
                    isAcceptedRepeat,
                    isEarlyGraceReserved,
                    targetStaffId,
                    forceMIdx,
                    sustainMatch: sustainMatch ? {
                        midi: sustainMatch.midi,
                        staffId: sustainMatch.staffId,
                        mIdx: sustainMatch.mIdx,
                        source: sustainMatch.source
                    } : null,
                    anchor: anchor ? { x: anchor.x, y: anchor.y } : null,
                    expectedMatch: expectedMatch ? {
                        midi: expectedMatch.midi,
                        staffId: expectedMatch.staffId,
                        mIdx: expectedMatch.mIdx,
                        hit: expectedMatch.hit
                    } : null
                });

                if (isCorrect) {
                    drawFeedbackNote(midi, true, targetStaffId, forceMIdx, anchor);
                    AppState.score.correct++;
                    AppState.heldCorrectNotes.set(midi, targetStaffId);
                    updateScoreDisplay();
                } else if (isAcceptedRepeat || isEarlyGraceReserved) {
                    AppState.heldCorrectNotes.set(midi, targetStaffId);
                } else {
                    if (AppState.mode === 'realtime') {
                        AppState.realtimeWrongPressInCurrentContext = true;
                    }
                    registerHeldIncorrectFeedback(midi, targetStaffId, forceMIdx, anchor);
                    AppState.score.wrong++;
                    updateScoreDisplay();
                }
            }

            if (isCorrect) {
                expectedMatch.hit = true;
                if (AppState.mode === 'wait' || AppState.mode === 'follow') {
                    checkWaitModeAdvance();
                }
            }
        }
    } else {
        AppState.pressedKeys.delete(midi);
        AppState.heldCorrectNotes.delete(midi); 
        AppState.preExpectedHeldNotes.delete(midi);
        const earlyReservation = AppState.earlyGraceReservations.get(midi);
        if (!earlyReservation || !earlyReservation.allowTapCarry) {
            AppState.earlyGraceReservations.delete(midi);
        }
        releaseHeldIncorrectFeedback(midi);
        
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
    if (!AppState.isPlaying || (AppState.mode !== 'wait' && AppState.mode !== 'follow') || !AppState.isAudioBusy) return;

    if (AppState.expectedNotes.length === 0) return; 

    const allHit = AppState.expectedNotes.every(n => n.hit);
    
    if (allHit) {
        AppState.isAudioBusy = false;
        
        AppState.pendingAudio.forEach(audio => {
            schedulePlaybackForDestinations(audio.midi, audio.durationMs, audio.velocity ?? 100, { toLocalAudio: !!audio.toLocalAudio, toMidiOut: !!audio.toMidiOut });
        });
        AppState.pendingAudio = []; 

        // Keep practicing-hand sustain visuals active in wait/follow modes so notes that
        // legitimately ring across later beats remain visible until their visual
        // duration ends. We only clear stale held-correct states when a note is no
        // longer expected or visually sustained.
        startVisualSustains();

        const followInfo = AppState.followAdvanceInfo || null;
        const shouldFollow = AppState.mode === 'follow' && followInfo && Number.isFinite(followInfo.waitSeconds);
        if (shouldFollow) {
            const fullWaitSeconds = Math.max(0, followInfo.waitSeconds);
            const rawRemainingSeconds = Number.isFinite(AppState.anchorTime)
                ? (AppState.anchorTime - Tone.now())
                : fullWaitSeconds;

            // Keep the original beat grid when the player is on time or early.
            // If the player arrives late, do not collapse the next delay into a tiny
            // catch-up burst. Let Follow Me breathe from the player's actual hit time.
            let effectiveWaitSeconds = rawRemainingSeconds > 0
                ? rawRemainingSeconds
                : fullWaitSeconds;
            const minimumComfortWaitSeconds = fullWaitSeconds * FOLLOW_ME_MIN_WAIT_RATIO;
            if (effectiveWaitSeconds < minimumComfortWaitSeconds) {
                effectiveWaitSeconds = fullWaitSeconds;
            }
            effectiveWaitSeconds = Math.max(0, effectiveWaitSeconds);

            scheduleMetronomeForPlaybackWindow(
                Tone.now(),
                followInfo.currentMeasureIdx,
                followInfo.currentTimestamp,
                effectiveWaitSeconds,
                followInfo.beatsToWait
            );
            const delayMs = Math.max(0, Math.round(effectiveWaitSeconds * 1000));
            setTimeout(() => {
                if (AppState.isPlaying && AppState.mode === 'follow') {
                    osmd.cursor.update(); 
                    handleAutoScroll();
                    playbackLoop();
                }
            }, delayMs);
            return;
        }

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
    const isFollow = AppState.mode === 'follow';

    syncActiveHandStateFromMode();

    const practiceLeftToggle = document.getElementById('practice-lh');
    const practiceRightToggle = document.getElementById('practice-rh');
    const playbackLeftToggle = document.getElementById('enable-staff-lh');
    const playbackRightToggle = document.getElementById('enable-staff-rh');
    const audioHandsToggle = document.getElementById('enable-hand-staves');
    const otherAudioToggle = document.getElementById('enable-other');
    const midiOutHandsToggle = document.getElementById('enable-midiout-hand-staves');
    const midiOutOtherToggle = document.getElementById('enable-midiout-other');
    const playbackRow = document.querySelector('.practice-playback-row');
    const waitNoteRow = document.getElementById('practice-wait-note-row');
    const waitNote = document.getElementById('practice-wait-note');
    const lowLatencyPlaybackCheckbox = document.getElementById('check-low-latency-playback');

    if (practiceLeftToggle) practiceLeftToggle.checked = AppState.practice.left;
    if (practiceRightToggle) practiceRightToggle.checked = AppState.practice.right;
    if (playbackLeftToggle) playbackLeftToggle.checked = AppState.playback.left;
    if (playbackRightToggle) playbackRightToggle.checked = AppState.playback.right;
    if (lowLatencyPlaybackCheckbox) lowLatencyPlaybackCheckbox.checked = !!AppState.lowLatencyPlaybackEnabled;

    if (isWait) {
        if (audioHandsToggle) audioHandsToggle.checked = false;
        AppState.audioEnabled.hands = false;
        if (midiOutHandsToggle) midiOutHandsToggle.checked = false;
        AppState.midiOutEnabled.hands = false;
    }

    if (practiceLeftToggle) {
        practiceLeftToggle.disabled = false;
        practiceLeftToggle.closest('label')?.classList.toggle('is-disabled', false);
    }
    if (practiceRightToggle) {
        practiceRightToggle.disabled = false;
        practiceRightToggle.closest('label')?.classList.toggle('is-disabled', false);
    }
    const playbackDisabled = isWait || isFollow;

    if (playbackLeftToggle) {
        playbackLeftToggle.disabled = playbackDisabled;
        playbackLeftToggle.closest('label')?.classList.toggle('is-disabled', playbackDisabled);
    }
    if (playbackRightToggle) {
        playbackRightToggle.disabled = playbackDisabled;
        playbackRightToggle.closest('label')?.classList.toggle('is-disabled', playbackDisabled);
    }
    playbackRow?.classList.toggle('is-disabled', playbackDisabled);
    if (audioHandsToggle) audioHandsToggle.disabled = isWait;
    if (otherAudioToggle) otherAudioToggle.disabled = isWait;
    if (midiOutHandsToggle) midiOutHandsToggle.disabled = isWait || !getSelectedMidiOutOutput();
    if (midiOutOtherToggle) midiOutOtherToggle.disabled = isWait || !getSelectedMidiOutOutput();

    let modeNote = '';
    if (isWait) modeNote = 'Audio playback is unavailable in Wait mode.';
    else if (isFollow) modeNote = 'Playback is automatically set to the opposite hand in Follow Me.';
    waitNoteRow?.classList.toggle('is-hidden', !modeNote);
    waitNoteRow?.classList.toggle('is-disabled-context', playbackDisabled && !!modeNote);
    if (waitNote) {
        waitNote.textContent = modeNote;
        waitNote.classList.toggle('is-disabled', !modeNote);
    }
    syncTrainerRoutingUiState();
}

function syncLowLatencyPlaybackPreferenceUi() {
    const lowLatencyPlaybackCheckbox = document.getElementById('check-low-latency-playback');
    if (lowLatencyPlaybackCheckbox) {
        lowLatencyPlaybackCheckbox.checked = !!AppState.lowLatencyPlaybackEnabled;
    }
}

function initLedSimulatorToggleControl() {
    return;
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
    positionLedCalibrationPanel();
    window.dispatchEvent(new Event('resize')); 
});

document.getElementById('check-feedback').addEventListener('change', (e) => {
    AppState.feedbackEnabled = e.target.checked;
    setStoredBool(TRAINER_FEEDBACK_STORAGE_KEY, AppState.feedbackEnabled);
    if (!e.target.checked) {
        GeometryEngine.clearSvgFeedback();
    } else {
        renderFeedbackOverlay();
    }
    if (typeof window.syncSettingsDebugVisibility === 'function') {
        window.syncSettingsDebugVisibility();
    }
});

document.querySelectorAll('input[name="practice-mode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
        if (!e.target.checked) return;

        const nextMode = e.target.value;
        if (AppState.isPlaying || AppState.countInActive) {
            pausePlaybackFromToolbar();
        }
        AppState.mode = nextMode;
        localStorage.setItem(TRAINER_MODE_STORAGE_KEY, AppState.mode);
        clearScheduledMetronomeEvents();
        stopWaitModeMetronome();
        applyModeSettings();
        updatePianoVolume(pianoVolSlider ? pianoVolSlider.value : 80);
        updateMetroVolume(metroVolSlider ? metroVolSlider.value : 50);
    });
});


// ===== Playback navigation + metronome scheduling =====


// WARNING:
// Count-in and metronome startup are timing-sensitive.
// Keep transport startup, visual pulse timing, and playback handoff aligned when adjusting this flow.
let ptNeedsImmediateResumeStart = false;

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && !AppState.isPlaying) {
        ptNeedsImmediateResumeStart = true;
    }
});

function consumeImmediateResumeStartFlag() {
    const shouldBypass = ptNeedsImmediateResumeStart;
    ptNeedsImmediateResumeStart = false;
    return shouldBypass;
}

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
        playMetronomeClick(isDownbeat);
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
const scoreFullscreenButton = document.getElementById('btn-score-fullscreen');

function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function getFullscreenTargetElement() {
    return document.documentElement;
}

function canUseNativeFullscreen() {
    const target = getFullscreenTargetElement();
    return !!(target?.requestFullscreen || target?.webkitRequestFullscreen || document.exitFullscreen || document.webkitExitFullscreen);
}

function isFullscreenActive() {
    return !!getFullscreenElement() || !!AppState.pseudoFullscreenActive;
}

function syncFullscreenUi() {
    const fullscreenActive = isFullscreenActive();
    document.body.classList.toggle('app-fullscreen-active', fullscreenActive);
    if (scoreFullscreenButton) {
        scoreFullscreenButton.classList.toggle('is-active', fullscreenActive);
        scoreFullscreenButton.textContent = fullscreenActive ? '🗗' : '⛶';
        scoreFullscreenButton.setAttribute('aria-label', fullscreenActive ? 'Exit full screen' : 'Enter full screen');
        scoreFullscreenButton.title = fullscreenActive ? 'Exit full screen' : 'Enter full screen';
    }
}

async function requestAppFullscreen() {
    hideToolbarPanels();
    const target = getFullscreenTargetElement();
    try {
        if (target?.requestFullscreen) {
            await target.requestFullscreen();
            AppState.pseudoFullscreenActive = false;
        } else if (target?.webkitRequestFullscreen) {
            target.webkitRequestFullscreen();
            AppState.pseudoFullscreenActive = false;
        } else {
            AppState.pseudoFullscreenActive = true;
        }
    } catch (err) {
        console.warn('Fullscreen request failed; using in-app fullscreen fallback.', err);
        AppState.pseudoFullscreenActive = true;
    }
    syncFullscreenUi();
}

async function exitAppFullscreen() {
    try {
        if (document.exitFullscreen && document.fullscreenElement) {
            await document.exitFullscreen();
        } else if (document.webkitExitFullscreen && document.webkitFullscreenElement) {
            document.webkitExitFullscreen();
        }
    } catch (err) {
        console.warn('Could not exit native fullscreen cleanly.', err);
    }
    AppState.pseudoFullscreenActive = false;
    syncFullscreenUi();
}

async function toggleAppFullscreen() {
    if (isFullscreenActive()) {
        await exitAppFullscreen();
        return;
    }
    await requestAppFullscreen();
}

document.addEventListener('fullscreenchange', syncFullscreenUi);
document.addEventListener('webkitfullscreenchange', syncFullscreenUi);
if (scoreFullscreenButton) {
    scoreFullscreenButton.addEventListener('click', () => {
        toggleAppFullscreen();
    });
}

function updatePlayPauseButton() {
    document.body.classList.toggle('app-playing', !!AppState.isPlaying);
    if (playPauseButton) {
        playPauseButton.textContent = AppState.isPlaying ? '⏸ Pause' : '▶ Play';
    }
}

function preserveMusicAreaScroll(callback) {
    const musicArea = document.getElementById('music-area');
    if (!musicArea || typeof callback !== 'function') {
        return typeof callback === 'function' ? callback() : undefined;
    }

    const savedScrollTop = musicArea.scrollTop;
    const savedScrollLeft = musicArea.scrollLeft;
    const result = callback();
    musicArea.scrollTop = savedScrollTop;
    musicArea.scrollLeft = savedScrollLeft;
    return result;
}

async function startPlaybackFromToolbar() {
    if (!osmd.cursor || AppState.isPlaying) return;

    if (AppState.fullscreenOnPlay && !isFullscreenActive()) {
        await requestAppFullscreen();
    }

    await ensureLiveAudioReady();

    AppState.isPlaying = true;
    updatePlayPauseButton();

    hideToolbarPanels();
    Tone.Transport.stop();
    clearScheduledMetronomeEvents();
    stopWaitModeMetronome();

    AppState.lastLedPreviewEvents = [];
    AppState.ledPreviewTraversalIndex = -1;

    // WARNING:
    // Building the LED preview timeline temporarily resets/traverses the OSMD cursor.
    // Preserve the user's pre-play viewport so auto-scroll does not jump to measure 1 during count-in.
    preserveMusicAreaScroll(() => {
        ensureLedPreviewTimelineBuilt();
    });

    doCountInAndStart(() => {
        AppState.anchorTime = Tone.now();
        osmd.cursor.show();
        handleAutoScroll();
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
        lowLatencyPlaybackSynth.releaseAll?.();
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

function stopPlaybackState({ pauseTransport = true } = {}) {
    AppState.isPlaying = false;
    AppState.countInActive = false;
    AppState.lastLedPreviewEvents = [];
    AppState.ledPreviewTraversalIndex = -1;

    if (pauseTransport) {
        Tone.Transport.pause();
    } else {
        Tone.Transport.stop();
    }

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

function pausePlaybackFromToolbar() {
    stopPlaybackState({ pauseTransport: true });
}

function resetPlaybackForLoadedScore() {
    stopPlaybackState({ pauseTransport: false });

    GeometryEngine.clearSvgFeedback();
    AppState.pendingAudio = [];
    AppState.score.correct = 0;
    AppState.score.wrong = 0;
    updateScoreDisplay();
    clearVisuals();
}

if (playPauseButton) {
    playPauseButton.onclick = async () => {
        if (AppState.isPlaying) pausePlaybackFromToolbar();
        else await startPlaybackFromToolbar();
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
    AppState.followAdvanceInfo = null;
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
            clearFeedbackVisualStatePreserveScoring();
            renderScoreAndRefreshGeometry();
        }
        positionLedCalibrationPanel();
    }, 300);
});

const zoomSlider = document.getElementById('slider-zoom');
const zoomInput = document.getElementById('val-zoom');
if (zoomSlider) { zoomSlider.min = '50'; zoomSlider.max = '150'; }
if (zoomInput) { zoomInput.min = '50'; zoomInput.max = '150'; }
function normalizeZoomValue(val) {
    let normalized = parseInt(val, 10);
    if (isNaN(normalized)) return null;
    if (normalized < 50) normalized = 50;
    if (normalized > 150) normalized = 150;
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
        clearFeedbackVisualStatePreserveScoring();
        renderScoreAndRefreshGeometry();
    }
}
zoomSlider.addEventListener('input', (e) => syncZoomControls(e.target.value));
zoomSlider.addEventListener('change', (e) => applyZoom(e.target.value));
zoomInput.addEventListener('input', (e) => syncZoomControls(e.target.value));
zoomInput.addEventListener('change', (e) => applyZoom(e.target.value));

const speedSlider = document.getElementById('slider-speed');
const speedInput = document.getElementById('val-speed');
const bpmInput = document.getElementById('val-bpm');

function syncTempoMetronomeDependentUi() {
    const metronomeEnabled = !!document.getElementById('check-metronome')?.checked;
    const hasMidiOut = !!getSelectedMidiOutOutput();
    const midiOutModeEnabled = !!document.getElementById('check-metronome-midiout')?.checked;
    const metroVolumeLabel = document.getElementById('tempo-metro-volume-label');
    const metroControls = [
        document.getElementById('slider-metro-vol'),
        document.getElementById('val-metro-vol'),
        document.getElementById('check-accented-downbeat'),
        document.getElementById('check-visual-pulse'),
        document.getElementById('check-metronome-midiout')
    ];
    const midiOutHint = document.getElementById('tempo-midiout-metronome-hint');

    if (metroVolumeLabel) {
        metroVolumeLabel.textContent = midiOutModeEnabled ? 'Level' : 'Volume';
        metroVolumeLabel.setAttribute('aria-disabled', metronomeEnabled ? 'false' : 'true');
    }

    for (const control of metroControls) {
        if (!control) continue;
        control.disabled = !metronomeEnabled;
        control.closest('label')?.classList.toggle('is-disabled', !metronomeEnabled);
    }

    if (midiOutHint) {
        midiOutHint.textContent = hasMidiOut
            ? 'Uses GM percussion on the selected MIDI Out device.'
            : 'Select a MIDI Out device to hear metronome clicks on Channel 10. Some keyboards require a drum (Ch 10) or multi-timbral mode to avoid piano sounds.';
        midiOutHint.classList.toggle('is-disabled', !metronomeEnabled || !hasMidiOut);
    }
}

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

const midiOutVolSlider = document.getElementById('slider-midiout-vol');
const midiOutVolInput = document.getElementById('val-midiout-vol');

function updateMidiOutVolume(value, { save = true } = {}) {
    const val = Math.max(0, Math.min(100, parseInt(value, 10) || 0));
    AppState.midiOutVolume = val;
    if (midiOutVolSlider) midiOutVolSlider.value = val;
    if (midiOutVolInput) midiOutVolInput.value = val;
    if (save) {
        localStorage.setItem(TRAINER_MIDIOUT_VOL_STORAGE_KEY, String(val));
    }
    sendMidiOutExpressionLevel(val);
}

const midiInBoostSlider = document.getElementById('slider-midiin-boost');
const midiInBoostInput = document.getElementById('val-midiin-boost');

function syncMidiInBoostUi() {
    const boostRow = document.getElementById('routing-midiin-boost-row');
    const showBoost = !!AppState.audioEnabled.instrument;
    boostRow?.classList.toggle('hidden', !showBoost);
}

function updateMidiInBoost(value, { save = true } = {}) {
    const val = Math.max(50, Math.min(200, parseInt(value, 10) || 100));
    AppState.midiInBoost = val;
    if (midiInBoostSlider) midiInBoostSlider.value = val;
    if (midiInBoostInput) midiInBoostInput.value = val;
    if (save) {
        localStorage.setItem(TRAINER_MIDIIN_BOOST_STORAGE_KEY, String(val));
    }
    syncMidiInBoostUi();
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
if (midiOutVolSlider) midiOutVolSlider.addEventListener('input', (e) => updateMidiOutVolume(e.target.value));
if (midiOutVolInput) midiOutVolInput.addEventListener('change', (e) => updateMidiOutVolume(e.target.value));
if (midiInBoostSlider) midiInBoostSlider.addEventListener('input', (e) => updateMidiInBoost(e.target.value));
if (midiInBoostInput) midiInBoostInput.addEventListener('change', (e) => updateMidiInBoost(e.target.value));
if (metroVolSlider) metroVolSlider.addEventListener('input', (e) => updateMetroVolume(e.target.value));
if (metroVolInput) metroVolInput.addEventListener('change', (e) => updateMetroVolume(e.target.value));

const autoScrollCheckbox = document.getElementById('check-autoscroll');
if (autoScrollCheckbox) {
    autoScrollCheckbox.addEventListener('change', (e) => {
        setStoredBool(TRAINER_AUTOSCROLL_STORAGE_KEY, e.target.checked);
    });
}

const fullscreenOnPlayCheckbox = document.getElementById('check-fullscreen-on-play');
if (fullscreenOnPlayCheckbox) {
    fullscreenOnPlayCheckbox.addEventListener('change', (e) => {
        AppState.fullscreenOnPlay = e.target.checked;
        setStoredBool(TRAINER_FULLSCREEN_ON_PLAY_STORAGE_KEY, AppState.fullscreenOnPlay);
    });
}

const lowLatencyPlaybackCheckbox = document.getElementById('check-low-latency-playback');
if (lowLatencyPlaybackCheckbox) {
    syncLowLatencyPlaybackPreferenceUi();
    lowLatencyPlaybackCheckbox.addEventListener('change', (e) => {
        AppState.lowLatencyPlaybackEnabled = e.target.checked;
        setStoredBool(TRAINER_LOW_LATENCY_PLAYBACK_STORAGE_KEY, AppState.lowLatencyPlaybackEnabled);
        if (!AppState.lowLatencyPlaybackEnabled) {
            try { lowLatencyPlaybackSynth.releaseAll?.(); } catch (_) {}
        }
    });
}

document.getElementById('practice-lh').addEventListener('change', (e) => {
    if (AppState.mode === 'follow') {
        if (!e.target.checked) {
            e.target.checked = true;
            return;
        }
        setFollowPracticeHand('left');
        applyModeSettings();
        return;
    }
    const settings = getCurrentModeSettings();
    settings.practice.left = e.target.checked;
    syncActiveHandStateFromMode();
});
document.getElementById('practice-rh').addEventListener('change', (e) => {
    if (AppState.mode === 'follow') {
        if (!e.target.checked) {
            e.target.checked = true;
            return;
        }
        setFollowPracticeHand('right');
        applyModeSettings();
        return;
    }
    const settings = getCurrentModeSettings();
    settings.practice.right = e.target.checked;
    syncActiveHandStateFromMode();
});

const enableStaffLh = document.getElementById('enable-staff-lh');
if (enableStaffLh) {
    enableStaffLh.addEventListener('change', (e) => {
        if (AppState.mode === 'follow' || AppState.mode === 'wait') {
            e.target.checked = AppState.playback.left;
            return;
        }
        const settings = getCurrentModeSettings();
        settings.playback.left = e.target.checked;
        syncActiveHandStateFromMode();
    });
}
const enableStaffRh = document.getElementById('enable-staff-rh');
if (enableStaffRh) {
    enableStaffRh.addEventListener('change', (e) => {
        if (AppState.mode === 'follow' || AppState.mode === 'wait') {
            e.target.checked = AppState.playback.right;
            return;
        }
        const settings = getCurrentModeSettings();
        settings.playback.right = e.target.checked;
        syncActiveHandStateFromMode();
    });
}
const enableHandStaves = document.getElementById('enable-hand-staves');
if (enableHandStaves) {
    enableHandStaves.addEventListener('change', (e) => {
        AppState.audioEnabled.hands = e.target.checked;
        setStoredBool(TRAINER_AUDIO_HANDS_STORAGE_KEY, AppState.audioEnabled.hands);
    });
}
const enableOther = document.getElementById('enable-other');
if (enableOther) {
    enableOther.addEventListener('change', (e) => {
        AppState.audioEnabled.other = e.target.checked;
        setStoredBool(TRAINER_AUDIO_OTHER_STORAGE_KEY, AppState.audioEnabled.other);
    });
}
const enableInstrument = document.getElementById('enable-instrument');
if (enableInstrument) {
    enableInstrument.addEventListener('change', (e) => {
        AppState.audioEnabled.instrument = e.target.checked;
        setStoredBool(TRAINER_AUDIO_INSTRUMENT_STORAGE_KEY, AppState.audioEnabled.instrument);
        syncMidiInBoostUi();
    });
}
const enableVirtualKeyboard = document.getElementById('enable-virtual-keyboard');
if (enableVirtualKeyboard) {
    enableVirtualKeyboard.addEventListener('change', (e) => {
        AppState.audioEnabled.virtual = e.target.checked;
        setStoredBool(TRAINER_AUDIO_VIRTUAL_STORAGE_KEY, AppState.audioEnabled.virtual);
    });
}
const enableMidiOutHandStaves = document.getElementById('enable-midiout-hand-staves');
if (enableMidiOutHandStaves) {
    enableMidiOutHandStaves.addEventListener('change', (e) => {
        AppState.midiOutEnabled.hands = e.target.checked;
        setStoredBool(TRAINER_MIDIOUT_HANDS_STORAGE_KEY, AppState.midiOutEnabled.hands);
    });
}
const enableMidiOutOther = document.getElementById('enable-midiout-other');
if (enableMidiOutOther) {
    enableMidiOutOther.addEventListener('change', (e) => {
        AppState.midiOutEnabled.other = e.target.checked;
        setStoredBool(TRAINER_MIDIOUT_OTHER_STORAGE_KEY, AppState.midiOutEnabled.other);
    });
}
const enableMidiOutInstrument = document.getElementById('enable-midiout-instrument');
if (enableMidiOutInstrument) {
    enableMidiOutInstrument.addEventListener('change', (e) => {
        AppState.midiOutEnabled.instrument = e.target.checked;
        setStoredBool(TRAINER_MIDIOUT_INSTRUMENT_STORAGE_KEY, AppState.midiOutEnabled.instrument);
    });
}
const enableMidiOutVirtualKeyboard = document.getElementById('enable-midiout-virtual-keyboard');
if (enableMidiOutVirtualKeyboard) {
    enableMidiOutVirtualKeyboard.addEventListener('change', (e) => {
        AppState.midiOutEnabled.virtual = e.target.checked;
        setStoredBool(TRAINER_MIDIOUT_VIRTUAL_STORAGE_KEY, AppState.midiOutEnabled.virtual);
    });
}

const loopMinSlider = document.getElementById('slider-loop-min');
const loopMaxSlider = document.getElementById('slider-loop-max');
const loopMinInput = document.getElementById('val-loop-min');
const loopMaxInput = document.getElementById('val-loop-max');
const loopMinDecreaseBtn = document.getElementById('btn-loop-min-decrease');
const loopMinIncreaseBtn = document.getElementById('btn-loop-min-increase');
const loopMaxDecreaseBtn = document.getElementById('btn-loop-max-decrease');
const loopMaxIncreaseBtn = document.getElementById('btn-loop-max-increase');

function syncLooperDependentUi() {
    const looperCheckbox = document.getElementById('check-looper');
    const loopCountInCheckbox = document.getElementById('check-loop-countin');
    const loopCountInRow = document.getElementById('looper-countin-row');
    const loopEnabled = !!looperCheckbox?.checked;

    if (loopCountInCheckbox) {
        loopCountInCheckbox.disabled = !loopEnabled;
        loopCountInCheckbox.checked = !!AppState.loopCountInEnabled;
    }

    if (loopCountInRow) {
        loopCountInRow.classList.toggle('is-disabled', !loopEnabled);
        loopCountInRow.setAttribute('aria-disabled', String(!loopEnabled));
    }
}

document.getElementById('check-looper').addEventListener('change', () => {
    renderLooper();
    enforceLooperBounds();
    syncLooperDependentUi();
});

const loopCountInCheckbox = document.getElementById('check-loop-countin');
if (loopCountInCheckbox) {
    loopCountInCheckbox.addEventListener('change', (e) => {
        if (e.target.disabled) return;
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

const metronomeMidiOutCheckbox = document.getElementById('check-metronome-midiout');
if (metronomeMidiOutCheckbox) {
    metronomeMidiOutCheckbox.addEventListener('change', (e) => {
        AppState.metronomeMidiOutEnabled = e.target.checked;
        setStoredBool(METRONOME_MIDIOUT_STORAGE_KEY, AppState.metronomeMidiOutEnabled);
        syncTempoMetronomeDependentUi();
    });
}

syncLooperDependentUi();

const metronomeCheckbox = document.getElementById('check-metronome');
if (metronomeCheckbox) {
    metronomeCheckbox.addEventListener('change', (e) => {
        syncTempoMetronomeDependentUi();

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

syncTempoMetronomeDependentUi();

function syncLooper(source, changedId) {
    let minVal = parseInt(loopMinInput.value, 10);
    let maxVal = parseInt(loopMaxInput.value, 10);
    const maxAllowed = parseInt(loopMaxSlider.max, 10) || 100;

    if (changedId === 'slider-loop-min') minVal = parseInt(loopMinSlider.value, 10);
    if (changedId === 'slider-loop-max') maxVal = parseInt(loopMaxSlider.value, 10);

    if (isNaN(minVal) || minVal < 1) minVal = 1;
    if (isNaN(maxVal) || maxVal < 1) maxVal = 1;
    if (minVal > maxAllowed) minVal = maxAllowed;
    if (maxVal > maxAllowed) maxVal = maxAllowed;

    if (minVal > maxVal) {
        if (changedId === 'slider-loop-min' || changedId === 'val-loop-min') maxVal = minVal;
        else if (changedId === 'slider-loop-max' || changedId === 'val-loop-max') minVal = maxVal;
    }

    loopMinSlider.value = minVal;
    loopMaxSlider.value = maxVal;
    loopMinInput.value = minVal;
    loopMaxInput.value = maxVal;
    AppState.looper.min = minVal;
    AppState.looper.max = maxVal;

    renderLooper();
    enforceLooperBounds();
}

function syncLooperInputIfReady(changedId) {
    const targetInput = changedId === 'val-loop-min' ? loopMinInput : loopMaxInput;
    if (!targetInput) return;
    if (targetInput.value === '') return;
    syncLooper('input', changedId);
}

function stepLooperValue(target, delta) {
    const input = target === 'min' ? loopMinInput : loopMaxInput;
    if (!input) return;
    const fallbackValue = target === 'min' ? AppState.looper.min : AppState.looper.max;
    const currentValue = parseInt(input.value, 10);
    input.value = (Number.isNaN(currentValue) ? fallbackValue : currentValue) + delta;
    syncLooper('input', target === 'min' ? 'val-loop-min' : 'val-loop-max');
}

loopMinSlider.addEventListener('input', (e) => syncLooper('slider', e.target.id));
loopMaxSlider.addEventListener('input', (e) => syncLooper('slider', e.target.id));
loopMinInput.addEventListener('input', (e) => syncLooperInputIfReady(e.target.id));
loopMaxInput.addEventListener('input', (e) => syncLooperInputIfReady(e.target.id));
loopMinInput.addEventListener('change', (e) => syncLooper('input', e.target.id));
loopMaxInput.addEventListener('change', (e) => syncLooper('input', e.target.id));
loopMinInput.addEventListener('blur', (e) => syncLooper('input', e.target.id));
loopMaxInput.addEventListener('blur', (e) => syncLooper('input', e.target.id));
loopMinDecreaseBtn?.addEventListener('click', () => stepLooperValue('min', -1));
loopMinIncreaseBtn?.addEventListener('click', () => stepLooperValue('min', 1));
loopMaxDecreaseBtn?.addEventListener('click', () => stepLooperValue('max', -1));
loopMaxIncreaseBtn?.addEventListener('click', () => stepLooperValue('max', 1));

const LOOP_STEPPER_HOLD_DELAY_MS = 320;
const LOOP_STEPPER_HOLD_REPEAT_MS = 170;
let activeLooperHold = null;

function clearLooperHold() {
    if (!activeLooperHold) return;
    if (activeLooperHold.delayTimer) clearTimeout(activeLooperHold.delayTimer);
    if (activeLooperHold.repeatTimer) clearInterval(activeLooperHold.repeatTimer);
    if (activeLooperHold.button && activeLooperHold.button.releasePointerCapture && activeLooperHold.pointerId != null) {
        try {
            if (activeLooperHold.button.hasPointerCapture?.(activeLooperHold.pointerId)) {
                activeLooperHold.button.releasePointerCapture(activeLooperHold.pointerId);
            }
        } catch (_) {}
    }
    activeLooperHold.button?.classList.remove('is-holding');
    activeLooperHold = null;
}

function beginLooperHold(button, target, delta, pointerId) {
    clearLooperHold();
    activeLooperHold = { button, pointerId, delayTimer: null, repeatTimer: null };
    button.classList.add('is-holding');

    if (button.setPointerCapture && pointerId != null) {
        try { button.setPointerCapture(pointerId); } catch (_) {}
    }

    activeLooperHold.delayTimer = setTimeout(() => {
        if (!activeLooperHold || activeLooperHold.button !== button) return;
        activeLooperHold.repeatTimer = setInterval(() => {
            stepLooperValue(target, delta);
        }, LOOP_STEPPER_HOLD_REPEAT_MS);
    }, LOOP_STEPPER_HOLD_DELAY_MS);
}

function wireLooperHold(button, target, delta) {
    if (!button) return;
    button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });
    button.addEventListener('dragstart', (e) => {
        e.preventDefault();
    });
    button.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        beginLooperHold(button, target, delta, e.pointerId);
    });
    button.addEventListener('pointerup', clearLooperHold);
    button.addEventListener('pointercancel', clearLooperHold);
    button.addEventListener('lostpointercapture', clearLooperHold);
    button.addEventListener('pointerleave', (e) => {
        if (activeLooperHold?.button !== button) return;
        if (e.buttons === 0) clearLooperHold();
    });
}

wireLooperHold(loopMinDecreaseBtn, 'min', -1);
wireLooperHold(loopMinIncreaseBtn, 'min', 1);
wireLooperHold(loopMaxDecreaseBtn, 'max', -1);
wireLooperHold(loopMaxIncreaseBtn, 'max', 1);

document.addEventListener('pointerup', clearLooperHold);
document.addEventListener('pointercancel', clearLooperHold);
window.addEventListener('blur', clearLooperHold);


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
        const isLoopEnabledAtEnd = document.getElementById('check-looper')?.checked;
        if (!isLoopEnabledAtEnd) {
            pausePlaybackFromToolbar();
            osmd.cursor.update();
            handleAutoScroll();
        }
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

    buildExpectedNotesFromEntries(entries, currentMeasureIdx, currentTimestamp);
    AppState.currentExpectedContext = {
        measureIndex: currentMeasureIdx,
        timestamp: currentTimestamp,
        signature: makeLedPreviewEntrySignature(entries)
    };

    renderFeedbackOverlay();
    renderVirtualKeyboard(entries, currentMeasureIdx, currentTimestamp);

    entries.forEach(e => {
        const sid = getResolvedStaffAssignmentIdFromEntry(e);
        const handRole = getAssignedHandRoleForStaff(sid);
        const isRH = handRole === 'right';
        const isLH = handRole === 'left';
        const isOther = (!isRH && !isLH);
        const isPracticingThisHand = (isRH && AppState.practice.right) || (isLH && AppState.practice.left);
        const playbackLeftEnabled = !!AppState.playback.left;
        const playbackRightEnabled = !!AppState.playback.right;
        const isSelectedHandPlayback = (isRH && playbackRightEnabled) || (isLH && playbackLeftEnabled);

        const routeToLocalAudio = ((isRH || isLH) && isSelectedHandPlayback && AppState.audioEnabled.hands) || 
                                  (isOther && AppState.audioEnabled.other);
        const routeToMidiOut = ((isRH || isLH) && isSelectedHandPlayback && AppState.midiOutEnabled.hands) || 
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
                        
                        if ((AppState.mode === 'wait' || AppState.mode === 'follow') && AppState.expectedNotes.length > 0 && !isPracticingThisHand) {
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
    
    const nextMeasureIdx = osmd.cursor.Iterator.CurrentMeasureIndex;
    let nextTimestamp = osmd.cursor.Iterator.currentTimeStamp.RealValue;
    const isEndReached = osmd.cursor.Iterator.EndReached;
    
    let fallbackLength = 1;
    if (entries && entries[0] && entries[0].Notes && entries[0].Notes.length > 0) {
        fallbackLength = entries[0].Notes[0].Length.RealValue;
    }

    if (isEndReached) {
        nextTimestamp = currentTimestamp + fallbackLength;
    }

    const beatsToWait = window.PTTiming.getTraversalBeatsToWait({
        currentMeasureIdx,
        currentTimestamp,
        nextMeasureIdx,
        nextTimestamp,
        fallbackLength,
        getMeasureTimingInfo
    });

    const currentRunningBpm = AppState.baseBpm * AppState.speedPercent;
    const waitSeconds = beatsToWait * (60 / currentRunningBpm);
    const playbackWindowStartSec = (AppState.mode === 'wait' || AppState.mode === 'follow') ? Tone.now() : AppState.anchorTime;

    const shouldDeferFollowScheduling = AppState.mode === 'follow' && AppState.expectedNotes.length > 0;
    if (!shouldDeferFollowScheduling) {
        scheduleMetronomeForPlaybackWindow(
            playbackWindowStartSec,
            currentMeasureIdx,
            currentTimestamp,
            waitSeconds,
            beatsToWait
        );
    } else {
        clearScheduledMetronomeEvents();
        clearTempoVisualPulse();
    }

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

    if (AppState.mode === 'wait' || AppState.mode === 'follow') {
        AppState.anchorTime = Tone.now() + waitSeconds;
    } else {
        AppState.anchorTime += waitSeconds;
    }
    
    timeToWaitMs = (AppState.anchorTime - Tone.now()) * 1000;
    
    if (timeToWaitMs < 0) {
        timeToWaitMs = 0; 
        if (AppState.mode === 'wait' || AppState.mode === 'follow') {
            AppState.anchorTime = Tone.now(); 
        }
    }

    if (AppState.mode === 'wait' || AppState.mode === 'follow') {
        AppState.isAudioBusy = true;
        AppState.followAdvanceInfo = AppState.mode === 'follow' ? {
            currentMeasureIdx,
            currentTimestamp,
            waitSeconds,
            beatsToWait
        } : null;
        
        if (AppState.expectedNotes.length > 0) {
            const allExpectedAlreadyHit = AppState.expectedNotes.every(n => n.hit);
            if (allExpectedAlreadyHit) {
                // One-hand early-grace reservations can promote held notes to hit as soon as
                // a new expected group is built. In wait/follow modes, that means this step
                // is already satisfied before any fresh keydown event occurs, so we need to
                // advance immediately instead of deadlocking on an already-hit group.
                setTimeout(() => {
                    if (!AppState.isPlaying || (AppState.mode !== 'wait' && AppState.mode !== 'follow')) return;
                    checkWaitModeAdvance();
                }, 0);
            }
            // Otherwise engine waits for user input.
        } else {
            startVisualSustains();
            const advanceDelayMs = AppState.mode === 'follow' ? Math.max(0, timeToWaitMs) : 10;
            if (AppState.mode === 'follow') {
                scheduleMetronomeForPlaybackWindow(
                    playbackWindowStartSec,
                    currentMeasureIdx,
                    currentTimestamp,
                    waitSeconds,
                    beatsToWait
                );
            }
            setTimeout(() => {
                if (AppState.isPlaying && (AppState.mode === 'wait' || AppState.mode === 'follow')) {
                    processMissedNotes();
                    osmd.cursor.update(); 
                    handleAutoScroll();
                    playbackLoop();
                }
            }, advanceDelayMs); 
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
    if (document.hidden) {
        releaseActiveVirtualPointer();
        return;
    }
    ensureLiveAudioReady();
});
window.addEventListener('pageshow', () => {
    ensureLiveAudioReady();
});
window.addEventListener('focus', () => {
    ensureLiveAudioReady();
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




// ensure synth cleanup
function releaseLowLatencySynth() {
    if (lowLatencySynth) {
        try { lowLatencySynth.releaseAll(); } catch(e) {}
    }
}
