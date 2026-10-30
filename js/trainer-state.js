// trainer-state.js
// Centralized app state and persisted settings (appLocalStorage).
// This file should NOT contain rendering, playback, or UI logic.
// Other modules should read/write shared state and preference helpers through here first.

// ==========================================
// STATE MANAGEMENT
// ==========================================
const APP_MANIFEST = window.__PT_APP_MANIFEST__ || {};
const APP_REPO_SLUG = 'ztbishop/piano-trainer-studio';
const APP_VERSION = String(window.__PT_ASSET_VERSION__ || APP_MANIFEST.version || 'dev').trim();

const AppState = {
    mode: 'realtime',
    followAdvanceInfo: null,
    currentExpectedContext: null,
    earlyGraceReservations: new Map(),
    isPlaying: false,
    isAudioBusy: false, 
    zoom: 1.0,
    baseBpm: 120, 
    speedPercent: 1.0,
    looper: { enabled: false, min: 1, max: 100 },
    hands: { left: 2, right: 1 },
    practice: { left: true, right: true },
    playback: { left: true, right: true },
    modeSettings: {
        realtime: { practice: { left: true, right: true }, playback: { left: true, right: true } },
        wait: { practice: { left: true, right: true }, playback: { left: false, right: false } },
        follow: { practice: { left: false, right: true }, playback: { left: true, right: false } }
    },
    audioEnabled: { hands: true, other: false, instrument: false, virtual: true }, 
    midiOutEnabled: { hands: false, other: false, instrument: false, virtual: false }, 
    midiOutVolume: 65,
    midiInBoost: 100,
    expectedNotes: [], 
    pressedKeys: new Set(), 
    heldCorrectNotes: new Map(), 
    preExpectedHeldNotes: new Set(), 
    activeHeldIncorrectFeedback: new Map(),
    releasedIncorrectFeedback: [],
    correctFeedbackHistory: [],
    realtimeWrongPressInCurrentContext: false,
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
    futurePreviewEnabled: true,
    futurePreviewDepth: 1,
    correctHighlightEnabled: false,
    wledDdpDebugEnabled: false,
    helperVersion: '',
    countInActive: false,
    lastLedPreviewEvents: [],
    ledPreviewTimeline: [],
    ledPreviewTimelineDirty: true,
    ledPreviewTraversalIndex: -1,
    playerPianoType: 88,
    playerRange: null,
    outOfRangeCurrentNotes: [],
    ledOutputMode: 'none',
    midiInChannel: 0,
    midiOutChannel: 1,
    midiLightsChannel: 1,
    midiLedLowVelocity: false,
    ledReverse: false,
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
    metronomeMidiOutEnabled: false,
    currentScoreData: null,
    currentScoreOriginalData: null,
    currentScoreFileName: '',
    currentScoreOriginalFileName: '',
    inputVelocityEnabled: true,
    liveLowLatencyMonitoringEnabled: true,
    lowLatencyPlaybackEnabled: false,
    currentScoreFileType: '',
    currentScoreOriginalFileType: '',
    currentScoreLibraryId: null,
    currentScoreTitle: '',
    fullscreenOnPlay: false,
    pseudoFullscreenActive: false,
    transpose: {
        available: false,
        sourceKeyLabel: 'No score loaded',
        sourceKeyFound: false,
        mode: 'key',
        semitones: 0,
        targetKey: 'sig-0',
        updateKeySignature: true,
        active: false,
        activeLabel: 'Original score',
        disableReason: 'Load a MusicXML-based score to enable transpose.'
    },
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
const LED_REVERSE_STORAGE_KEY = 'pt_ledReverse';
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
const TRAINER_PLAYBACK_LH_STORAGE_KEY = 'pt_audioLeft';
const TRAINER_PLAYBACK_RH_STORAGE_KEY = 'pt_audioRight';
const TRAINER_AUDIO_HANDS_STORAGE_KEY = 'pt_audioHands';
const TRAINER_AUDIO_OTHER_STORAGE_KEY = 'pt_audioOther';
const TRAINER_AUDIO_INSTRUMENT_STORAGE_KEY = 'pt_audioInstrument';
const TRAINER_AUDIO_VIRTUAL_STORAGE_KEY = 'pt_audioVirtualKeyboard';
const TRAINER_MIDIOUT_HANDS_STORAGE_KEY = 'pt_midiOutHands';
const TRAINER_MIDIOUT_OTHER_STORAGE_KEY = 'pt_midiOutOther';
const TRAINER_MIDIOUT_INSTRUMENT_STORAGE_KEY = 'pt_midiOutInstrument';
const TRAINER_MIDIOUT_VIRTUAL_STORAGE_KEY = 'pt_midiOutVirtualKeyboard';
const TRAINER_INPUT_VELOCITY_STORAGE_KEY = 'pt_inputVelocityEnabled';
const TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY = 'pt_liveLowLatencyMonitoringEnabled';
const TRAINER_LOW_LATENCY_PLAYBACK_STORAGE_KEY = 'pt_lowLatencyPlaybackEnabled';
const TRAINER_PIANO_VOL_STORAGE_KEY = 'pt_trainerPianoVolume';
const TRAINER_MIDIOUT_VOL_STORAGE_KEY = 'pt_trainerMidiOutVolume';
const TRAINER_MIDIIN_BOOST_STORAGE_KEY = 'pt_trainerMidiInBoost';
const TRAINER_ZOOM_STORAGE_KEY = 'pt_trainerZoom';
const TRAINER_AUTOSCROLL_STORAGE_KEY = 'pt_autoScroll';
const TRAINER_KEYBOARD_STORAGE_KEY = 'pt_virtualKeyboardVisible';
const TRAINER_FULLSCREEN_ON_PLAY_STORAGE_KEY = 'pt_fullscreenOnPlay';
const SETTINGS_DEBUG_STORAGE_KEY = 'pt_debugEnabled';
const MIDI_IN_ID_STORAGE_KEY = 'pt_savedMidiIn';
const MIDI_OUT_ID_STORAGE_KEY = 'pt_savedMidiOut';
const MIDI_LIGHTS_ID_STORAGE_KEY = 'pt_savedMidiLights';
const MIDI_IN_CHANNEL_STORAGE_KEY = 'pt_savedMidiInChannel';
const MIDI_OUT_CHANNEL_STORAGE_KEY = 'pt_savedMidiOutChannel';
const MIDI_LIGHTS_CHANNEL_STORAGE_KEY = 'pt_savedMidiLightsChannel';
const MIDI_LED_LOW_VELOCITY_STORAGE_KEY = 'pt_midiLedLowVelocity';
const VISUAL_PULSE_STORAGE_KEY = 'pt_visualPulseEnabled';
const LOOP_COUNT_IN_STORAGE_KEY = 'pt_loopCountInEnabled';
const METRONOME_VOL_STORAGE_KEY = 'pt_metronomeVolume';
const METRONOME_MIDIOUT_STORAGE_KEY = 'pt_metronomeMidiOutEnabled';
const ACCENTED_DOWNBEAT_STORAGE_KEY = 'pt_accentedDownbeatEnabled';

const DEFAULT_PREFERENCES = Object.freeze({
    playerPianoType: 88,
    ledCount: 88,
    trainerPianoVolume: 80,
    trainerMidiOutVolume: 65,
    trainerMidiInBoost: 100,
    metronomeVolume: 25,
    ledMasterBrightness: 25,
    ledFuture1Pct: 1,
    ledFuture2Pct: 1
});

const FIRST_RUN_INIT_STORAGE_KEY = 'pt_firstRunInit_20260321';
const SKIP_FIRST_RUN_ONCE_STORAGE_KEY = 'pt_skipFirstRunOnce';
let pendingFirstRunNotice = false;

function seedFirstRunDefaults() {
    const skipOnce = appSessionStorage.getItem(SKIP_FIRST_RUN_ONCE_STORAGE_KEY) === 'true';
    if (skipOnce) {
        appSessionStorage.removeItem(SKIP_FIRST_RUN_ONCE_STORAGE_KEY);
        appLocalStorage.setItem(FIRST_RUN_INIT_STORAGE_KEY, 'true');
        pendingFirstRunNotice = false;
        return;
    }

    if (appLocalStorage.getItem(FIRST_RUN_INIT_STORAGE_KEY) === 'true') return;

    if (appLocalStorage.getItem(PLAYER_PIANO_STORAGE_KEY) === null) appLocalStorage.setItem(PLAYER_PIANO_STORAGE_KEY, String(DEFAULT_PREFERENCES.playerPianoType));
    if (appLocalStorage.getItem(LED_COUNT_STORAGE_KEY) === null) appLocalStorage.setItem(LED_COUNT_STORAGE_KEY, String(DEFAULT_PREFERENCES.ledCount));
    if (appLocalStorage.getItem(TRAINER_PIANO_VOL_STORAGE_KEY) === null) appLocalStorage.setItem(TRAINER_PIANO_VOL_STORAGE_KEY, String(DEFAULT_PREFERENCES.trainerPianoVolume));
    if (appLocalStorage.getItem(TRAINER_MIDIOUT_VOL_STORAGE_KEY) === null) appLocalStorage.setItem(TRAINER_MIDIOUT_VOL_STORAGE_KEY, String(DEFAULT_PREFERENCES.trainerMidiOutVolume));
    if (appLocalStorage.getItem(TRAINER_MIDIIN_BOOST_STORAGE_KEY) === null) appLocalStorage.setItem(TRAINER_MIDIIN_BOOST_STORAGE_KEY, String(DEFAULT_PREFERENCES.trainerMidiInBoost));
    if (appLocalStorage.getItem(METRONOME_VOL_STORAGE_KEY) === null) appLocalStorage.setItem(METRONOME_VOL_STORAGE_KEY, String(DEFAULT_PREFERENCES.metronomeVolume));
    if (appLocalStorage.getItem(LED_MASTER_BRIGHTNESS_STORAGE_KEY) === null) appLocalStorage.setItem(LED_MASTER_BRIGHTNESS_STORAGE_KEY, String(DEFAULT_PREFERENCES.ledMasterBrightness));
    if (appLocalStorage.getItem(LED_FUTURE1_PCT_STORAGE_KEY) === null) appLocalStorage.setItem(LED_FUTURE1_PCT_STORAGE_KEY, String(DEFAULT_PREFERENCES.ledFuture1Pct));
    if (appLocalStorage.getItem(LED_FUTURE2_PCT_STORAGE_KEY) === null) appLocalStorage.setItem(LED_FUTURE2_PCT_STORAGE_KEY, String(DEFAULT_PREFERENCES.ledFuture2Pct));

    if (appLocalStorage.getItem(FIRST_RUN_INIT_STORAGE_KEY) === null) appLocalStorage.setItem(FIRST_RUN_INIT_STORAGE_KEY, 'true');
    pendingFirstRunNotice = true;
}

function consumePendingFirstRunNotice() {
    const shouldShow = pendingFirstRunNotice;
    pendingFirstRunNotice = false;
    return shouldShow;
}

const RESETTABLE_PREFERENCE_KEYS = [
    'pt_appearance',
    PLAYER_PIANO_STORAGE_KEY,
    MIDI_IN_NAME_STORAGE_KEY,
    MIDI_OUT_NAME_STORAGE_KEY,
    MIDI_LIGHTS_NAME_STORAGE_KEY,
    MIDI_IN_ID_STORAGE_KEY,
    MIDI_IN_CHANNEL_STORAGE_KEY,
    MIDI_OUT_ID_STORAGE_KEY,
    MIDI_LIGHTS_ID_STORAGE_KEY,
    MIDI_OUT_CHANNEL_STORAGE_KEY,
    MIDI_LIGHTS_CHANNEL_STORAGE_KEY,
    MIDI_LED_LOW_VELOCITY_STORAGE_KEY,
    LED_COUNT_STORAGE_KEY,
    LED_OUTPUT_MODE_STORAGE_KEY,
    LED_REVERSE_STORAGE_KEY,
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
    TRAINER_PLAYBACK_LH_STORAGE_KEY,
    TRAINER_PLAYBACK_RH_STORAGE_KEY,
    TRAINER_AUDIO_HANDS_STORAGE_KEY,
    TRAINER_AUDIO_OTHER_STORAGE_KEY,
    TRAINER_AUDIO_INSTRUMENT_STORAGE_KEY,
    TRAINER_AUDIO_VIRTUAL_STORAGE_KEY,
    TRAINER_MIDIOUT_HANDS_STORAGE_KEY,
    TRAINER_MIDIOUT_OTHER_STORAGE_KEY,
    TRAINER_MIDIOUT_INSTRUMENT_STORAGE_KEY,
    TRAINER_MIDIOUT_VIRTUAL_STORAGE_KEY,
    TRAINER_INPUT_VELOCITY_STORAGE_KEY,
    TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY,
    TRAINER_LOW_LATENCY_PLAYBACK_STORAGE_KEY,
    TRAINER_PIANO_VOL_STORAGE_KEY,
    TRAINER_MIDIOUT_VOL_STORAGE_KEY,
    TRAINER_MIDIIN_BOOST_STORAGE_KEY,
    TRAINER_ZOOM_STORAGE_KEY,
    TRAINER_AUTOSCROLL_STORAGE_KEY,
    TRAINER_KEYBOARD_STORAGE_KEY,
    TRAINER_FULLSCREEN_ON_PLAY_STORAGE_KEY,
    SETTINGS_DEBUG_STORAGE_KEY,
    VISUAL_PULSE_STORAGE_KEY,
    LOOP_COUNT_IN_STORAGE_KEY,
    METRONOME_VOL_STORAGE_KEY,
    METRONOME_MIDIOUT_STORAGE_KEY,
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
    const value = appLocalStorage.getItem(key);
    if (value === null) return fallback;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
}

function getStoredNumber(key, fallback) {
    const value = Number(appLocalStorage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
}

function getClampedNumber(key, min, max, defaultVal) {
    const raw = appLocalStorage.getItem(key);
    if (raw === null || raw === '') return Math.min(max, Math.max(min, defaultVal));
    const num = Number(raw);
    return Math.min(max, Math.max(min, Number.isFinite(num) ? num : defaultVal));
}

function setStoredBool(key, value) {
    appLocalStorage.setItem(key, value ? 'true' : 'false');
}

function clearSavedPreferences() {
    appSessionStorage.replace({}, [SKIP_FIRST_RUN_ONCE_STORAGE_KEY]);
    appLocalStorage.replace({}, [...RESETTABLE_PREFERENCE_KEYS, FIRST_RUN_INIT_STORAGE_KEY]);
}

function buildSettingsBackupPayload() {
    appLocalStorage.requireStorage();
    const settings = {};
    RESETTABLE_PREFERENCE_KEYS.forEach((key) => {
        const value = appLocalStorage.getItem(key);
        if (value !== null) settings[key] = value;
    });

    appLocalStorage.keys().filter(key => /^pt_handAssignment_v1_[a-f0-9]{32}$/.test(key)).forEach(key => { settings[key] = appLocalStorage.getItem(key); });

    appLocalStorage.requireStorage();
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
        window.alert(err.message || 'Could not export settings backup.');
    }
}

// Pure validation: never read/write storage or touch the score library here.
function validateSettingsBackupPayload(payload) {
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
    if (!record(payload)) throw new Error('Settings backup must be a JSON object.');
    if (owns(payload, 'version') && payload.version !== 1) throw new Error('Unsupported settings backup version. Expected version 1 or an older unversioned backup.');
    if (owns(payload, 'version') && !owns(payload, 'settings')) throw new Error('Settings backup is missing its settings object. Use Import Library for score backups.');
    const raw = owns(payload, 'settings') ? payload.settings : payload;
    if (!record(raw)) throw new Error('Settings backup settings must be an object.');
    const normalized = {};
    const invalid = (key, expectation) => { throw new Error(`Invalid setting "${key}": ${expectation}. Nothing was imported.`); };
    const number = (value, key, min, max) => {
        if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') invalid(key, 'expected a number');
        const n = Number(value);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) invalid(key, `expected an integer from ${min} to ${max}`);
        return n;
    };
    const enums = {
        pt_appearance: ['light', 'soft-light', 'dark'], pt_playerPianoType: PLAYER_PIANO_SIZES.map(String),
        pt_ledOutputMode: ['none', 'midi', 'wled'], pt_wledTransport: ['http-json', 'ddp'],
        pt_trainerMode: ['realtime', 'wait', 'follow'], pt_wledTransportWarningAccepted: ['0', '1']
    };
    const ranges = {
        pt_ledCount: [1, 500], pt_ledMasterBrightness: [1, 100], pt_ledFuture1Pct: [0, 100], pt_ledFuture2Pct: [0, 100],
        pt_trainerPianoVolume: [0, 100], pt_trainerMidiOutVolume: [0, 100], pt_metronomeVolume: [0, 100],
        pt_trainerMidiInBoost: [50, 200], pt_trainerZoom: [50, 150],
        pt_savedMidiInChannel: [0, 16], pt_savedMidiOutChannel: [1, 16], pt_savedMidiLightsChannel: [1, 16],
        // Retained for older backups; the current preview depth is fixed at one.
        pt_futurePreviewDepth: [0, Number.MAX_SAFE_INTEGER]
    };
    const strings = ['pt_savedMidiInName', 'pt_savedMidiOutName', 'pt_savedMidiLightsName',
        'pt_savedMidiIn', 'pt_savedMidiOut', 'pt_savedMidiLights', 'pt_wledIp'];
    const booleans = [
        'pt_midiLedLowVelocity', 'pt_ledReverse', 'pt_wledDdpDebugEnabled', 'pt_feedbackEnabled',
        'pt_futurePreviewEnabled', 'pt_correctHighlightEnabled', 'pt_practiceLeft', 'pt_practiceRight',
        'pt_audioLeft', 'pt_audioRight', 'pt_audioHands', 'pt_audioOther', 'pt_audioInstrument', 'pt_audioVirtualKeyboard',
        'pt_midiOutHands', 'pt_midiOutOther', 'pt_midiOutInstrument', 'pt_midiOutVirtualKeyboard',
        'pt_inputVelocityEnabled', 'pt_liveLowLatencyMonitoringEnabled', 'pt_lowLatencyPlaybackEnabled',
        'pt_autoScroll', 'pt_virtualKeyboardVisible', 'pt_fullscreenOnPlay', 'pt_debugEnabled',
        'pt_visualPulseEnabled', 'pt_loopCountInEnabled', 'pt_metronomeMidiOutEnabled', 'pt_accentedDownbeatEnabled'
    ];
    const jsonObject = (value, key) => {
        if (typeof value !== 'string') invalid(key, 'expected a JSON object encoded as text');
        let parsed;
        try { parsed = JSON.parse(value); } catch (_) { invalid(key, 'invalid JSON'); }
        if (!record(parsed)) invalid(key, 'expected a JSON object');
        return parsed;
    };
    for (const key of RESETTABLE_PREFERENCE_KEYS) {
        if (!owns(raw, key) || raw[key] === null) continue; // Legacy null entries mean absent.
        const value = raw[key];
        if (owns(enums, key)) {
            if (!['string', 'number'].includes(typeof value) || !enums[key].includes(String(value))) invalid(key, 'unsupported choice');
            normalized[key] = String(value);
        } else if (owns(ranges, key)) {
            normalized[key] = String(number(value, key, ...ranges[key]));
        } else if (strings.includes(key)) {
            if (typeof value !== 'string') invalid(key, 'expected text');
            normalized[key] = value;
        } else if (booleans.includes(key)) {
            if (![true, false, 'true', 'false'].includes(value)) invalid(key, 'expected true or false');
            normalized[key] = String(value);
        } else if (key === LED_CALIBRATION_STORAGE_KEY) {
            const parsed = jsonObject(value, key), calibration = {};
            for (const [midi, offset] of Object.entries(parsed)) {
                if (!/^(0|[1-9]\d*)$/.test(midi)) invalid(key, 'invalid MIDI note key');
                number(midi, key, 0, 127);
                calibration[midi] = number(offset, key, -40, 40);
            }
            normalized[key] = JSON.stringify(calibration);
        } else invalid(key, 'no supported validation rule');
    }
    for (const key of Object.keys(raw).filter(key => /^pt_handAssignment_v1_[a-f0-9]{32}$/.test(key))) {
        if (raw[key] === null) continue;
        const saved = jsonObject(raw[key], key), assignment = {};
        if (!['mode', 'staff', 'voice', 'playAccompaniment'].some(field => owns(saved, field))) invalid(key, 'missing hand-assignment fields');
        if (owns(saved, 'mode')) {
            if (!['staff', 'voice'].includes(saved.mode)) invalid(key, 'unsupported assignment mode');
            assignment.mode = saved.mode;
        }
        if (owns(saved, 'playAccompaniment')) {
            if (typeof saved.playAccompaniment !== 'boolean') invalid(key, 'accompaniment must be true or false');
            assignment.playAccompaniment = saved.playAccompaniment;
        }
        for (const field of ['staff', 'voice']) if (owns(saved, field)) {
            if (!record(saved[field])) invalid(key, `${field} assignments must be an object`);
            const roles = {};
            for (const [id, role] of Object.entries(saved[field])) {
                if (!['left', 'right', 'accompaniment', 'ignore'].includes(role)) invalid(key, 'unsupported hand role');
                if (field === 'staff') {
                    if (!/^[1-9]\d*$/.test(id)) invalid(key, 'invalid staff number');
                    number(id, key, 1, Number.MAX_SAFE_INTEGER);
                } else {
                    let pair; try { pair = JSON.parse(id); } catch (_) { invalid(key, 'invalid voice identity'); }
                    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(value => typeof value === 'string')) invalid(key, 'invalid voice identity');
                }
                roles[id] = role;
            }
            assignment[field] = roles;
        }
        normalized[key] = JSON.stringify(assignment);
    }
    if (!Object.keys(normalized).length) throw new Error('No supported settings found in backup. Nothing was imported.');
    return normalized;
}

function importSettingsBackupPayload(payload) {
    const normalizedSettings = validateSettingsBackupPayload(payload);

    appSessionStorage.replace({}, [SKIP_FIRST_RUN_ONCE_STORAGE_KEY]);
    appLocalStorage.replace({ ...normalizedSettings, [FIRST_RUN_INIT_STORAGE_KEY]: 'true' }, RESETTABLE_PREFERENCE_KEYS);
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
            window.alert(err.message || 'Could not import settings backup.');
        }
    };
    reader.onerror = () => window.alert('Could not read settings backup. Nothing was imported.');
    reader.onabort = () => window.alert('Settings backup reading was cancelled. Nothing was imported.');
    reader.readAsText(file);
}


function normalizeMidiChannel(value, fallback = 1) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(1, Math.min(16, Math.round(numericValue)));
}

function normalizeMidiInputChannel(value, fallback = 0) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return fallback;
    if (numericValue <= 0) return 0;
    return Math.max(1, Math.min(16, Math.round(numericValue)));
}

seedFirstRunDefaults();

AppState.midiInChannel = normalizeMidiInputChannel(appLocalStorage.getItem(MIDI_IN_CHANNEL_STORAGE_KEY), 0);
AppState.midiOutChannel = normalizeMidiChannel(appLocalStorage.getItem(MIDI_OUT_CHANNEL_STORAGE_KEY), 1);
AppState.midiLightsChannel = normalizeMidiChannel(appLocalStorage.getItem(MIDI_LIGHTS_CHANNEL_STORAGE_KEY), 1);

AppState.midiLedLowVelocity = getStoredBool(MIDI_LED_LOW_VELOCITY_STORAGE_KEY, false);
AppState.ledReverse = getStoredBool(LED_REVERSE_STORAGE_KEY, false);
AppState.inputVelocityEnabled = true;
AppState.liveLowLatencyMonitoringEnabled = true;
AppState.lowLatencyPlaybackEnabled = getStoredBool(TRAINER_LOW_LATENCY_PLAYBACK_STORAGE_KEY, false);
setStoredBool(TRAINER_INPUT_VELOCITY_STORAGE_KEY, true);
setStoredBool(TRAINER_LIVE_LOW_LATENCY_STORAGE_KEY, true);


