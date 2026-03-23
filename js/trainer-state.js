// trainer-state.js
// Centralized app state and persisted settings (localStorage).
// This file should NOT contain rendering, playback, or UI logic.
// Other modules should read/write shared state and preference helpers through here first.

// ==========================================
// STATE MANAGEMENT
// ==========================================
const APP_VERSION = '1.0.2';
const UPDATE_MANIFEST_URL = 'https://ztbishop.github.io/piano-trainer-studio/version.json';
const UPDATE_MANIFEST_URL_STORAGE_KEY = 'pt_updateManifestUrl';
const UPDATE_RELEASES_URL = 'https://github.com/ztbishop/piano-trainer-studio/releases/latest';

const AppState = {
    mode: 'realtime',
    isPlaying: false,
    isAudioBusy: false, 
    zoom: 1.0,
    baseBpm: 120, 
    speedPercent: 1.0,
    looper: { enabled: false, min: 1, max: 100 },
    hands: { left: 2, right: 1 },
    practice: { left: true, right: true },
    audioEnabled: { left: false, right: false, other: false, instrument: false, virtual: true }, 
    midiOutEnabled: { left: false, right: false, other: false, instrument: false, virtual: false }, 
    expectedNotes: [], 
    pressedKeys: new Set(), 
    heldCorrectNotes: new Map(), 
    preExpectedHeldNotes: new Set(), 
    pendingAudio: [], 
    feedbackEnabled: true,
    anchorTime: 0,
    score: { correct: 0, wrong: 0 },
    
    sustainedVisuals: [], 
    visualNotesToStart: [],
    activeTimeouts: [],
    hardwareLEDState: new Map(),
    recentMidiEchoes: [],
    debugPersistentAnchors: false,
    debugEventFlow: false,
    debugMatchLogs: false,
    debugAnchorResolution: false,
    debugStickyFrameLimit: 30,
    debugFrameSeq: 0,
    debugAnchorHistory: [],
    ledSimulatorVisible: false,
    futurePreviewEnabled: true,
    futurePreviewDepth: 1,
    correctHighlightEnabled: false,
    wledDdpDebugEnabled: false,
    helperVersion: '',
    updateManifestUrl: '',
    updateStatus: '',
    updateLastCheckedAt: 0,
    updateInfo: null,
    countInActive: false,
    lastLedPreviewEvents: [],
    ledPreviewTimeline: [],
    ledPreviewTimelineDirty: true,
    ledPreviewTraversalIndex: -1,
    playerPianoType: 88,
    playerRange: null,
    outOfRangeCurrentNotes: [],
    ledOutputMode: 'none',
    midiOutChannel: 1,
    midiLightsChannel: 1,
    midiLedLowVelocity: false,
    wledIp: '',
    wledTransport: 'http-json',
    wledActiveTransport: 'http-json',
    wledHelperAvailable: false,
    wledHelperStatus: 'Helper: Not detected.',
    wledStatus: 'WLED idle.',
    wledConnectionState: 'none',
    ledCalibrationMode: false,
    ledCalibrationSelectedMidi: null,
    visualPulseEnabled: true,
    accentedDownbeatEnabled: true,
    loopCountInEnabled: true,
    currentScoreData: null,
    currentScoreFileName: '',
    inputVelocityEnabled: true,
    liveLowLatencyMonitoringEnabled: false,
    currentScoreFileType: '',
    currentScoreLibraryId: null,
    currentScoreTitle: '',
    scoreLibrarySelectedFolderId: '__all__',
    scoreLibraryView: 'folders',
    scoreLibraryManageMode: false,
    scoreLibrarySelectedScoreIds: []
};

const FULL_PIANO_MIDI_MIN = 21;
const FULL_PIANO_MIDI_MAX = 108;
const FULL_PIANO_KEY_COUNT = 88;
const PLAYER_PIANO_SIZES = [88, 76, 73, 61, 49, 37, 32, 25];
const PLAYER_PIANO_STORAGE_KEY = 'pt_playerPianoType';
const MIDI_IN_NAME_STORAGE_KEY = 'pt_savedMidiInName';
const MIDI_OUT_NAME_STORAGE_KEY = 'pt_savedMidiOutName';
const MIDI_LIGHTS_NAME_STORAGE_KEY = 'pt_savedMidiLightsName';

const LED_COUNT_STORAGE_KEY = 'pt_ledCount';
const LED_OUTPUT_MODE_STORAGE_KEY = 'pt_ledOutputMode';
const WLED_IP_STORAGE_KEY = 'pt_wledIp';
const WLED_TRANSPORT_STORAGE_KEY = 'pt_wledTransport';
const WLED_TRANSPORT_WARNING_ACCEPTED_STORAGE_KEY = 'pt_wledTransportWarningAccepted';
const WLED_DDP_DEBUG_STORAGE_KEY = 'pt_wledDdpDebugEnabled';
const LED_MASTER_BRIGHTNESS_STORAGE_KEY = 'pt_ledMasterBrightness';
const LED_FUTURE1_PCT_STORAGE_KEY = 'pt_ledFuture1Pct';
const LED_FUTURE2_PCT_STORAGE_KEY = 'pt_ledFuture2Pct';
const LED_FADE_OUT_MS = 0;
const LED_CALIBRATION_STORAGE_KEY = 'pt_ledCalibration';

const TRAINER_MODE_STORAGE_KEY = 'pt_trainerMode';
const TRAINER_FEEDBACK_STORAGE_KEY = 'pt_feedbackEnabled';
const TRAINER_FUTURE_PREVIEW_STORAGE_KEY = 'pt_futurePreviewEnabled';
const TRAINER_FUTURE_DEPTH_STORAGE_KEY = 'pt_futurePreviewDepth';
const TRAINER_CORRECT_HIGHLIGHT_STORAGE_KEY = 'pt_correctHighlightEnabled';
const TRAINER_PRACTICE_LH_STORAGE_KEY = 'pt_practiceLeft';
const TRAINER_PRACTICE_RH_STORAGE_KEY = 'pt_practiceRight';
const TRAINER_AUDIO_LH_STORAGE_KEY = 'pt_audioLeft';
const TRAINER_AUDIO_RH_STORAGE_KEY = 'pt_audioRight';
const TRAINER_AUDIO_OTHER_STORAGE_KEY = 'pt_audioOther';
const TRAINER_AUDIO_INSTRUMENT_STORAGE_KEY = 'pt_audioInstrument';
const TRAINER_AUDIO_VIRTUAL_STORAGE_KEY = 'pt_audioVirtualKeyboard';
const TRAINER_MIDIOUT_LH_STORAGE_KEY = 'pt_midiOutLeft';
const TRAINER_MIDIOUT_RH_STORAGE_KEY = 'pt_midiOutRight';
const TRAINER_MIDIOUT_OTHER_STORAGE_KEY = 'pt_midiOutOther';
const TRAINER_MIDIOUT_INSTRUMENT_STORAGE_KEY = 'pt_midiOutInstrument';
const TRAINER_MIDIOUT_VIRTUAL_STORAGE_KEY = 'pt_midiOutVirtualKeyboard';
const TRAINER_INPUT_VELOCITY_STORAGE_KEY = 'pt_inputVelocityEnabled';
const TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY = 'pt_liveLowLatencyMonitoringEnabled';
const TRAINER_PIANO_VOL_STORAGE_KEY = 'pt_trainerPianoVolume';
const TRAINER_ZOOM_STORAGE_KEY = 'pt_trainerZoom';
const TRAINER_AUTOSCROLL_STORAGE_KEY = 'pt_autoScroll';
const TRAINER_KEYBOARD_STORAGE_KEY = 'pt_virtualKeyboardVisible';
const SETTINGS_DEBUG_STORAGE_KEY = 'pt_debugEnabled';
const SETTINGS_LED_SIM_STORAGE_KEY = 'pt_virtualLedsVisible';
const MIDI_IN_ID_STORAGE_KEY = 'pt_savedMidiIn';
const MIDI_OUT_ID_STORAGE_KEY = 'pt_savedMidiOut';
const MIDI_LIGHTS_ID_STORAGE_KEY = 'pt_savedMidiLights';
const MIDI_OUT_CHANNEL_STORAGE_KEY = 'pt_savedMidiOutChannel';
const MIDI_LIGHTS_CHANNEL_STORAGE_KEY = 'pt_savedMidiLightsChannel';
const MIDI_LED_LOW_VELOCITY_STORAGE_KEY = 'pt_midiLedLowVelocity';
const VISUAL_PULSE_STORAGE_KEY = 'pt_visualPulseEnabled';
const LOOP_COUNT_IN_STORAGE_KEY = 'pt_loopCountInEnabled';
const METRONOME_VOL_STORAGE_KEY = 'pt_metronomeVolume';
const ACCENTED_DOWNBEAT_STORAGE_KEY = 'pt_accentedDownbeatEnabled';

const DEFAULT_PREFERENCES = Object.freeze({
    playerPianoType: 88,
    ledCount: 88,
    trainerPianoVolume: 80,
    metronomeVolume: 25,
    ledMasterBrightness: 40,
    ledFuture1Pct: 10,
    ledFuture2Pct: 10
});

const FIRST_RUN_INIT_STORAGE_KEY = 'pt_firstRunInit_20260321';
const SKIP_FIRST_RUN_ONCE_STORAGE_KEY = 'pt_skipFirstRunOnce';
let pendingFirstRunNotice = false;

function seedFirstRunDefaults() {
    const skipOnce = sessionStorage.getItem(SKIP_FIRST_RUN_ONCE_STORAGE_KEY) === 'true';
    if (skipOnce) {
        sessionStorage.removeItem(SKIP_FIRST_RUN_ONCE_STORAGE_KEY);
        localStorage.setItem(FIRST_RUN_INIT_STORAGE_KEY, 'true');
        pendingFirstRunNotice = false;
        return;
    }

    if (localStorage.getItem(FIRST_RUN_INIT_STORAGE_KEY) === 'true') return;

    localStorage.setItem(PLAYER_PIANO_STORAGE_KEY, String(DEFAULT_PREFERENCES.playerPianoType));
    localStorage.setItem(LED_COUNT_STORAGE_KEY, String(DEFAULT_PREFERENCES.ledCount));
    localStorage.setItem(TRAINER_PIANO_VOL_STORAGE_KEY, String(DEFAULT_PREFERENCES.trainerPianoVolume));
    localStorage.setItem(METRONOME_VOL_STORAGE_KEY, String(DEFAULT_PREFERENCES.metronomeVolume));
    localStorage.setItem(LED_MASTER_BRIGHTNESS_STORAGE_KEY, String(DEFAULT_PREFERENCES.ledMasterBrightness));
    localStorage.setItem(LED_FUTURE1_PCT_STORAGE_KEY, String(DEFAULT_PREFERENCES.ledFuture1Pct));
    localStorage.setItem(LED_FUTURE2_PCT_STORAGE_KEY, String(DEFAULT_PREFERENCES.ledFuture2Pct));

    localStorage.setItem(FIRST_RUN_INIT_STORAGE_KEY, 'true');
    pendingFirstRunNotice = true;
}

function consumePendingFirstRunNotice() {
    const shouldShow = pendingFirstRunNotice;
    pendingFirstRunNotice = false;
    return shouldShow;
}

const RESETTABLE_PREFERENCE_KEYS = [
    PLAYER_PIANO_STORAGE_KEY,
    MIDI_IN_NAME_STORAGE_KEY,
    MIDI_OUT_NAME_STORAGE_KEY,
    MIDI_LIGHTS_NAME_STORAGE_KEY,
    MIDI_IN_ID_STORAGE_KEY,
    MIDI_OUT_ID_STORAGE_KEY,
    MIDI_LIGHTS_ID_STORAGE_KEY,
    MIDI_OUT_CHANNEL_STORAGE_KEY,
    MIDI_LIGHTS_CHANNEL_STORAGE_KEY,
    MIDI_LED_LOW_VELOCITY_STORAGE_KEY,
    LED_COUNT_STORAGE_KEY,
    LED_OUTPUT_MODE_STORAGE_KEY,
    WLED_IP_STORAGE_KEY,
    WLED_TRANSPORT_STORAGE_KEY,
    WLED_TRANSPORT_WARNING_ACCEPTED_STORAGE_KEY,
    WLED_DDP_DEBUG_STORAGE_KEY,
    LED_MASTER_BRIGHTNESS_STORAGE_KEY,
    LED_FUTURE1_PCT_STORAGE_KEY,
    LED_FUTURE2_PCT_STORAGE_KEY,
    LED_CALIBRATION_STORAGE_KEY,
    TRAINER_MODE_STORAGE_KEY,
    TRAINER_FEEDBACK_STORAGE_KEY,
    TRAINER_FUTURE_PREVIEW_STORAGE_KEY,
    TRAINER_FUTURE_DEPTH_STORAGE_KEY,
    TRAINER_CORRECT_HIGHLIGHT_STORAGE_KEY,
    TRAINER_PRACTICE_LH_STORAGE_KEY,
    TRAINER_PRACTICE_RH_STORAGE_KEY,
    TRAINER_AUDIO_LH_STORAGE_KEY,
    TRAINER_AUDIO_RH_STORAGE_KEY,
    TRAINER_AUDIO_OTHER_STORAGE_KEY,
    TRAINER_AUDIO_INSTRUMENT_STORAGE_KEY,
    TRAINER_AUDIO_VIRTUAL_STORAGE_KEY,
    TRAINER_MIDIOUT_LH_STORAGE_KEY,
    TRAINER_MIDIOUT_RH_STORAGE_KEY,
    TRAINER_MIDIOUT_OTHER_STORAGE_KEY,
    TRAINER_MIDIOUT_INSTRUMENT_STORAGE_KEY,
    TRAINER_MIDIOUT_VIRTUAL_STORAGE_KEY,
    TRAINER_INPUT_VELOCITY_STORAGE_KEY,
    TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY,
    TRAINER_PIANO_VOL_STORAGE_KEY,
    TRAINER_ZOOM_STORAGE_KEY,
    TRAINER_AUTOSCROLL_STORAGE_KEY,
    TRAINER_KEYBOARD_STORAGE_KEY,
    SETTINGS_DEBUG_STORAGE_KEY,
    SETTINGS_LED_SIM_STORAGE_KEY,
    VISUAL_PULSE_STORAGE_KEY,
    LOOP_COUNT_IN_STORAGE_KEY,
    METRONOME_VOL_STORAGE_KEY,
    ACCENTED_DOWNBEAT_STORAGE_KEY
];

function normalizeLedCount(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 88;
    return Math.max(1, Math.min(500, Math.round(numericValue)));
}

function normalizeLedMasterBrightness(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return 70;
    return Math.max(1, Math.min(100, Math.round(numericValue)));
}

function normalizeLedFuturePct(value, fallback) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function getStoredBool(key, fallback) {
    const value = localStorage.getItem(key);
    if (value === null) return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
}

function getStoredNumber(key, fallback) {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
}

function getClampedNumber(key, min, max, defaultVal) {
    const raw = localStorage.getItem(key);
    const num = Number(raw);
    return Math.min(max, Math.max(min, Number.isFinite(num) ? num : defaultVal));
}

function setStoredBool(key, value) {
    localStorage.setItem(key, value ? 'true' : 'false');
}

function clearSavedPreferences() {
    RESETTABLE_PREFERENCE_KEYS.forEach((key) => localStorage.removeItem(key));
    localStorage.removeItem(FIRST_RUN_INIT_STORAGE_KEY);
    sessionStorage.removeItem(SKIP_FIRST_RUN_ONCE_STORAGE_KEY);
}

function buildSettingsBackupPayload() {
    const settings = {};
    RESETTABLE_PREFERENCE_KEYS.forEach((key) => {
        const value = localStorage.getItem(key);
        if (value !== null) settings[key] = value;
    });

    return {
        version: 1,
        exportedAt: new Date().toISOString(),
        appVersion: APP_VERSION,
        settings
    };
}

function downloadSettingsBackup() {
    try {
        const payload = buildSettingsBackupPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeDate = new Date().toISOString().slice(0, 10);
        link.href = url;
        link.download = `Piano-Trainer-Settings-Backup-${safeDate}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.warn('Settings backup export failed', err);
        window.alert('Could not export settings backup.');
    }
}

function importSettingsBackupPayload(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('Invalid settings backup payload');
    }

    const rawSettings = payload && typeof payload.settings === 'object' && payload.settings && !Array.isArray(payload.settings)
        ? payload.settings
        : payload;

    const normalizedSettings = {};
    RESETTABLE_PREFERENCE_KEYS.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(rawSettings, key)) return;
        const value = rawSettings[key];
        if (value === null || value === undefined) return;
        normalizedSettings[key] = String(value);
    });

    if (Object.keys(normalizedSettings).length === 0) {
        throw new Error('No supported settings found in backup');
    }

    clearSavedPreferences();
    Object.entries(normalizedSettings).forEach(([key, value]) => {
        localStorage.setItem(key, value);
    });

    sessionStorage.setItem(SKIP_FIRST_RUN_ONCE_STORAGE_KEY, 'true');
    localStorage.setItem(FIRST_RUN_INIT_STORAGE_KEY, 'true');
    pendingFirstRunNotice = false;
}

function handleSettingsBackupImportFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const payload = JSON.parse(String(reader.result || '{}'));
            importSettingsBackupPayload(payload);
            window.alert('Settings imported. The app will now reload to apply them.');
            window.location.reload();
        } catch (err) {
            console.warn('Settings backup import failed', err);
            window.alert('Invalid settings backup file.');
        }
    };
    reader.readAsText(file);
}


function normalizeMidiChannel(value, fallback = 1) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(1, Math.min(16, Math.round(numericValue)));
}

seedFirstRunDefaults();

AppState.midiOutChannel = normalizeMidiChannel(localStorage.getItem(MIDI_OUT_CHANNEL_STORAGE_KEY), 1);
AppState.midiLightsChannel = normalizeMidiChannel(localStorage.getItem(MIDI_LIGHTS_CHANNEL_STORAGE_KEY), 1);

AppState.midiLedLowVelocity = getStoredBool(MIDI_LED_LOW_VELOCITY_STORAGE_KEY, false);
AppState.inputVelocityEnabled = getStoredBool(TRAINER_INPUT_VELOCITY_STORAGE_KEY, true);
AppState.liveLowLatencyMonitoringEnabled = getStoredBool(TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY, false);
