// led.js
// Owns LED settings, calibration, simulator rendering, hardware MIDI LED output,
// and WLED transport/reconnect helpers.
// Does not own playback scheduling, score rendering, or feedback-note placement.

// ⚠️ WARNING:
// Keep reconnect behavior and LED/frame state flow compatible with the current
// stable renderVirtualKeyboard pipeline. Do not rewrite timing or synthesize
// alternate note state here unless the playback/render core is updated together.

function getConfiguredLedMasterBrightness() {
    return normalizeLedMasterBrightness(getClampedNumber(LED_MASTER_BRIGHTNESS_STORAGE_KEY, 1, 100, 25));
}

function getConfiguredLedFuture1Pct() {
    return normalizeLedFuturePct(getClampedNumber(LED_FUTURE1_PCT_STORAGE_KEY, 0, 100, 1), 1);
}

function getConfiguredLedFuture2Pct() {
    return normalizeLedFuturePct(getClampedNumber(LED_FUTURE2_PCT_STORAGE_KEY, 0, 100, 1), 1);
}

function getConfiguredLedCount() {
    return normalizeLedCount(getClampedNumber(LED_COUNT_STORAGE_KEY, 1, 500, 88));
}

(function migrateLegacyLedDefaults() {
    // Legacy migration disabled so first-run defaults are not overwritten.
})();

let ledCalibration = {};

function setPermissionNote(elementId, message) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const text = String(message || '').trim();
    el.textContent = text;
    el.classList.toggle('hidden', !text);
}

function showMidiPermissionHelp(message) {
    setPermissionNote('midi-permission-help', message || '');
}

function clearMidiPermissionHelp() {
    setPermissionNote('midi-permission-help', '');
}

function showWledPermissionHelp(message) {
    setPermissionNote('wled-permission-help', message || '');
}

function clearWledPermissionHelp() {
    setPermissionNote('wled-permission-help', '');
}

function isLikelyBrowserAccessIssue(err) {
    const message = String(err?.message || err || '').toLowerCase();
    return message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('load failed') ||
        message.includes('blocked') ||
        message.includes('mixed content') ||
        message.includes('connection refused') ||
        message.includes('cors');
}

function getMidiPermissionHelpText() {
    return 'MIDI access appears blocked or unavailable. Allow MIDI/device access in your browser, then refresh. MIDI only works on the device running this browser.';
}

function getWledPermissionHelpText(kind = 'wled') {
    if (kind === 'helper') {
        return 'DDP helper access failed. Allow local device access in your browser, then refresh. If access is already allowed, start the helper on this same device.';
    }
    return 'Browser access to local devices may be blocked. Allow local network or local device access for this site, then refresh and try WLED again.';
}

window.showMidiPermissionHelp = showMidiPermissionHelp;
window.clearMidiPermissionHelp = clearMidiPermissionHelp;
window.showWledPermissionHelp = showWledPermissionHelp;
window.clearWledPermissionHelp = clearWledPermissionHelp;

function loadLedCalibration() {
    try {
        const stored = localStorage.getItem(LED_CALIBRATION_STORAGE_KEY);
        ledCalibration = stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.warn('LED calibration load failed', e);
        ledCalibration = {};
    }
}

function saveLedCalibration() {
    try {
        localStorage.setItem(LED_CALIBRATION_STORAGE_KEY, JSON.stringify(ledCalibration));
    } catch (e) {
        console.warn('LED calibration save failed', e);
    }
}

function getLedCalibrationOffsetForMidi(midi) {
    const value = Number(ledCalibration?.[midi] ?? 0);
    if (!Number.isFinite(value)) return 0;
    return Math.round(value);
}

function setLedCalibrationOffsetForMidi(midi, offset) {
    const normalizedMidi = Number(midi);
    if (!Number.isFinite(normalizedMidi)) return;

    const normalizedOffset = Math.max(-40, Math.min(40, Math.round(Number(offset) || 0)));

    if (normalizedOffset === 0) {
        delete ledCalibration[normalizedMidi];
    } else {
        ledCalibration[normalizedMidi] = normalizedOffset;
    }

    saveLedCalibration();
    updateLedKeyMapping();
    WLEDController.clearLastSignature();
    renderVirtualKeyboard();
    syncLedCalibrationControls();
}

function resetAllLedCalibration() {
    ledCalibration = {};
    saveLedCalibration();
    updateLedKeyMapping();
    WLEDController.clearLastSignature();
    renderVirtualKeyboard();
    syncLedCalibrationControls();
}

function getLedCalibrationPreviewLabel(midi) {
    if (!Number.isFinite(Number(midi))) return 'No key selected';
    const offset = getLedCalibrationOffsetForMidi(midi);
    return `Selected Key: MIDI ${midi} | LED Offset: ${offset > 0 ? '+' : ''}${offset}`;
}

function syncLedCalibrationControls() {
    const panel = document.getElementById('led-calibration-panel');
    const toggleButton = document.getElementById('btn-led-calibration-toggle');
    const currentLabel = document.getElementById('led-calibration-current');
    const currentHint = document.getElementById('led-calibration-hint');
    const leftButton = document.getElementById('btn-led-calibration-left');
    const rightButton = document.getElementById('btn-led-calibration-right');
    const resetButton = document.getElementById('btn-led-calibration-reset-key');

    if (panel) panel.classList.toggle('hidden', !AppState.ledCalibrationMode);
    if (toggleButton) toggleButton.textContent = AppState.ledCalibrationMode ? 'Done LED Calibration' : 'Start LED Calibration';
    if (currentLabel) currentLabel.textContent = getLedCalibrationPreviewLabel(AppState.ledCalibrationSelectedMidi);
    if (currentHint) {
        currentHint.textContent = AppState.ledCalibrationSelectedMidi == null
            ? 'Press any piano key or click a virtual key to select it.'
            : 'Use Move Left / Move Right to line up the selected key.';
    }

    const hasSelection = AppState.ledCalibrationSelectedMidi != null;
    if (leftButton) leftButton.disabled = !hasSelection;
    if (rightButton) rightButton.disabled = !hasSelection;
    if (resetButton) resetButton.disabled = !hasSelection;

    positionLedCalibrationPanel();
}


function positionLedCalibrationPanel() {
    const panel = document.getElementById('led-calibration-panel');
    if (!panel) return;

    panel.style.left = '50%';
    panel.style.right = 'auto';
    panel.style.transform = 'translateX(-50%)';

    let bottomPx = 16;
    const bottomStack = document.getElementById('trainer-bottom-stack');
    if (bottomStack) {
        const rect = bottomStack.getBoundingClientRect();
        const visibleHeight = Math.max(0, window.innerHeight - rect.top);
        if (visibleHeight > 0) {
            bottomPx = Math.round(visibleHeight + 12);
        }
    }

    panel.style.bottom = `${bottomPx}px`;
}
function setLedCalibrationMode(enabled) {
    AppState.ledCalibrationMode = !!enabled;

    const optionsOverlay = document.getElementById('options-overlay');
    if (AppState.ledCalibrationMode && optionsOverlay) {
        if (typeof closeToolbarPanel === 'function') {
            closeToolbarPanel(optionsOverlay, true);
        } else {
            optionsOverlay.classList.remove('is-open', 'is-closing');
            optionsOverlay.classList.add('hidden');
            if (typeof syncToolbarButtonStates === 'function') {
                syncToolbarButtonStates();
            }
        }
    }

    if (!AppState.ledCalibrationMode) {
        AppState.ledCalibrationSelectedMidi = null;
    }

    syncLedCalibrationControls();
    WLEDController.clearLastSignature();
    renderVirtualKeyboard();
}

function selectLedCalibrationMidi(midi) {
    if (!AppState.ledCalibrationMode) return;
    AppState.ledCalibrationSelectedMidi = Number(midi);
    syncLedCalibrationControls();
    WLEDController.clearLastSignature();
    renderVirtualKeyboard();
}

function nudgeLedCalibration(delta) {
    const midi = AppState.ledCalibrationSelectedMidi;
    if (midi == null) return;
    const currentOffset = getLedCalibrationOffsetForMidi(midi);
    setLedCalibrationOffsetForMidi(midi, currentOffset + delta);
}

function downloadLedCalibrationBackup() {
    try {
        const keyCount = Number(AppState.playerPianoType) || 88;
        const ledCount = Number(LedEngine?.config?.ledCount) || getConfiguredLedCount();
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            playerPianoType: keyCount,
            ledCount,
            ledCalibration
        };

        const safeDate = new Date().toISOString().slice(0, 10);
        const filename = `LED-Calibration-Export-${safeDate}.json`;
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.warn('LED calibration export failed', err);
        window.alert('Could not export LED calibration.');
    }
}

function importLedCalibrationFromPayload(payload) {
    const rawCalibration = payload && typeof payload === 'object' && payload.ledCalibration && typeof payload.ledCalibration === 'object'
        ? payload.ledCalibration
        : payload;

    if (!rawCalibration || typeof rawCalibration !== 'object' || Array.isArray(rawCalibration)) {
        throw new Error('Invalid calibration payload');
    }

    const normalized = {};
    Object.entries(rawCalibration).forEach(([midi, offset]) => {
        const midiNum = Number(midi);
        const offsetNum = Math.round(Number(offset));
        if (!Number.isFinite(midiNum) || !Number.isFinite(offsetNum)) return;
        const clampedOffset = Math.max(-40, Math.min(40, offsetNum));
        if (clampedOffset !== 0) normalized[midiNum] = clampedOffset;
    });

    ledCalibration = normalized;
    saveLedCalibration();
    updateLedKeyMapping();
    WLEDController.clearLastSignature();
    renderVirtualKeyboard();
    syncLedCalibrationControls();
}

function handleLedCalibrationImportFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const payload = JSON.parse(String(reader.result || '{}'));
            importLedCalibrationFromPayload(payload);
        } catch (err) {
            console.warn('LED calibration import failed', err);
            window.alert('Invalid LED calibration file.');
        }
    };
    reader.readAsText(file);
}

function bindLedCalibrationNudgeButton(button, delta, boundDatasetKey) {
    if (!button || button.dataset[boundDatasetKey]) return;
    button.dataset[boundDatasetKey] = 'true';

    const initialDelayMs = 320;
    const repeatDelayMs = 150;
    let repeatTimeoutId = null;
    let repeatIntervalId = null;
    let activePointerId = null;
    let suppressClickUntil = 0;

    const clearRepeat = () => {
        if (repeatTimeoutId != null) {
            window.clearTimeout(repeatTimeoutId);
            repeatTimeoutId = null;
        }
        if (repeatIntervalId != null) {
            window.clearInterval(repeatIntervalId);
            repeatIntervalId = null;
        }
        activePointerId = null;
    };

    const startRepeat = () => {
        nudgeLedCalibration(delta);
        repeatTimeoutId = window.setTimeout(() => {
            repeatIntervalId = window.setInterval(() => {
                nudgeLedCalibration(delta);
            }, repeatDelayMs);
        }, initialDelayMs);
    };

    button.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        suppressClickUntil = Date.now() + 450;
        clearRepeat();
        activePointerId = e.pointerId;
        if (typeof button.setPointerCapture === 'function') {
            try { button.setPointerCapture(e.pointerId); } catch (_) {}
        }
        startRepeat();
    });

    const stopFromPointer = (e) => {
        if (activePointerId == null || e.pointerId !== activePointerId) return;
        suppressClickUntil = Date.now() + 450;
        clearRepeat();
    };

    button.addEventListener('pointerup', stopFromPointer);
    button.addEventListener('pointercancel', stopFromPointer);
    button.addEventListener('lostpointercapture', stopFromPointer);
    button.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    button.addEventListener('click', (e) => {
        if (Date.now() < suppressClickUntil) {
            e.preventDefault();
            return;
        }
        nudgeLedCalibration(delta);
    });
}

function initLedCalibrationControls() {
    loadLedCalibration();

    const toggleButton = document.getElementById('btn-led-calibration-toggle');
    const leftButton = document.getElementById('btn-led-calibration-left');
    const rightButton = document.getElementById('btn-led-calibration-right');
    const resetButton = document.getElementById('btn-led-calibration-reset-key');
    const resetAllButton = document.getElementById('btn-led-calibration-reset-all');
    const doneButton = document.getElementById('btn-led-calibration-done');
    const exportButton = document.getElementById('btn-led-calibration-export');
    const importButton = document.getElementById('btn-led-calibration-import');
    const importInput = document.getElementById('input-led-calibration-import');

    if (toggleButton && !toggleButton.dataset.boundLedCalibrationToggle) {
        toggleButton.dataset.boundLedCalibrationToggle = 'true';
        toggleButton.addEventListener('click', () => {
            setLedCalibrationMode(!AppState.ledCalibrationMode);
        });
    }

    bindLedCalibrationNudgeButton(leftButton, -1, 'boundLedCalibrationLeft');
    bindLedCalibrationNudgeButton(rightButton, 1, 'boundLedCalibrationRight');

    if (resetButton && !resetButton.dataset.boundLedCalibrationResetKey) {
        resetButton.dataset.boundLedCalibrationResetKey = 'true';
        resetButton.addEventListener('click', () => {
            const midi = AppState.ledCalibrationSelectedMidi;
            if (midi == null) return;
            setLedCalibrationOffsetForMidi(midi, 0);
        });
    }

    if (resetAllButton && !resetAllButton.dataset.boundLedCalibrationResetAll) {
        resetAllButton.dataset.boundLedCalibrationResetAll = 'true';
        resetAllButton.addEventListener('click', () => {
            const confirmed = window.confirm('Reset all LED calibration adjustments?');
            if (!confirmed) return;
            resetAllLedCalibration();
        });
    }

    if (doneButton && !doneButton.dataset.boundLedCalibrationDone) {
        doneButton.dataset.boundLedCalibrationDone = 'true';
        doneButton.addEventListener('click', () => {
            setLedCalibrationMode(false);
        });
    }

    if (exportButton && !exportButton.dataset.boundLedCalibrationExport) {
        exportButton.dataset.boundLedCalibrationExport = 'true';
        exportButton.addEventListener('click', downloadLedCalibrationBackup);
    }

    if (importButton && importInput && !importButton.dataset.boundLedCalibrationImport) {
        importButton.dataset.boundLedCalibrationImport = 'true';
        importButton.addEventListener('click', () => {
            importInput.value = '';
            importInput.click();
        });
    }

    if (importInput && !importInput.dataset.boundLedCalibrationImportInput) {
        importInput.dataset.boundLedCalibrationImportInput = 'true';
        importInput.addEventListener('change', (e) => {
            const [file] = e.target.files || [];
            handleLedCalibrationImportFile(file);
            e.target.value = '';
        });
    }

    syncLedCalibrationControls();
}

function syncLedCountControl() {
    const input = document.getElementById('input-led-count');
    if (input) {
        input.value = String(LedEngine.config.ledCount);
    }
}

function setLedCount(value, { save = true } = {}) {
    const ledCount = normalizeLedCount(value);
    LedEngine.config.ledCount = ledCount;
    LedEngine.frame = Array.from({ length: ledCount }, () => [0, 0, 0]);
    LedEngine.previousFrame = Array.from({ length: ledCount }, () => [0, 0, 0]);
    LedEngine.lastFrameTime = 0;

    if (save) {
        localStorage.setItem(LED_COUNT_STORAGE_KEY, String(ledCount));
    }

    syncLedCountControl();
    updateLedKeyMapping();
    WLEDController.clearLastSignature();
    LedEngine.renderOutputs();
}

function initLedCountControl() {
    setLedCount(getConfiguredLedCount(), { save: false });

    const input = document.getElementById('input-led-count');
    if (input && !input.dataset.boundLedCount) {
        input.dataset.boundLedCount = 'true';
        input.value = String(LedEngine.config.ledCount);
        input.addEventListener('change', (e) => {
            setLedCount(e.target.value);
        });
    }

    syncLedCountControl();
}

function syncLedBrightnessControls() {
    const masterSlider = document.getElementById('slider-led-master');
    const masterInput = document.getElementById('val-led-master');
    const future1Slider = document.getElementById('slider-led-future1');
    const future1Input = document.getElementById('val-led-future1');

    const masterPercent = Math.round((LedEngine.config.masterBrightness ?? 0.25) * 100);
    const future1Percent = String(LedEngine.config.future1BrightnessPct ?? 1);

    if (masterSlider) masterSlider.value = String(masterPercent);
    if (masterInput) masterInput.value = String(masterPercent);
    if (future1Slider) future1Slider.value = future1Percent;
    if (future1Input) future1Input.value = future1Percent;
}

function applyLedBrightnessSettings({ rerender = true } = {}) {
    syncLedBrightnessControls();
    WLEDController.clearLastSignature();
    if (rerender) {
        renderVirtualKeyboard();
    }
}

function setLedMasterBrightness(value, { save = true, rerender = true } = {}) {
    const normalized = normalizeLedMasterBrightness(value);
    LedEngine.config.masterBrightness = normalized / 100;
    if (save) {
        localStorage.setItem(LED_MASTER_BRIGHTNESS_STORAGE_KEY, String(normalized));
    }
    applyLedBrightnessSettings({ rerender });
}

function setLedFuture1BrightnessPct(value, { save = true, rerender = true } = {}) {
    const normalized = normalizeLedFuturePct(value, 1);
    LedEngine.config.future1BrightnessPct = normalized;
    if (save) {
        localStorage.setItem(LED_FUTURE1_PCT_STORAGE_KEY, String(normalized));
    }
    applyLedBrightnessSettings({ rerender });
}

function setLedFuture2BrightnessPct(value, { save = true, rerender = true } = {}) {
    const normalized = normalizeLedFuturePct(value, 1);
    LedEngine.config.future2BrightnessPct = normalized;
    if (save) {
        localStorage.setItem(LED_FUTURE2_PCT_STORAGE_KEY, String(normalized));
    }
    applyLedBrightnessSettings({ rerender });
}

function initLedBrightnessControls() {
    setLedMasterBrightness(getConfiguredLedMasterBrightness(), { save: false, rerender: false });
    setLedFuture1BrightnessPct(getConfiguredLedFuture1Pct(), { save: false, rerender: false });

    const masterSlider = document.getElementById('slider-led-master');
    const masterInput = document.getElementById('val-led-master');
    const future1Slider = document.getElementById('slider-led-future1');
    const future1Input = document.getElementById('val-led-future1');

    if (masterSlider && !masterSlider.dataset.boundLedMaster) {
        masterSlider.dataset.boundLedMaster = 'true';
        masterSlider.addEventListener('input', (e) => {
            setLedMasterBrightness(e.target.value);
        });
    }

    if (masterInput && !masterInput.dataset.boundLedMaster) {
        masterInput.dataset.boundLedMaster = 'true';
        masterInput.addEventListener('change', (e) => {
            setLedMasterBrightness(e.target.value);
        });
    }

    if (future1Slider && !future1Slider.dataset.boundLedFuture1) {
        future1Slider.dataset.boundLedFuture1 = 'true';
        future1Slider.addEventListener('input', (e) => {
            setLedFuture1BrightnessPct(e.target.value);
        });
    }

    if (future1Input && !future1Input.dataset.boundLedFuture1Input) {
        future1Input.dataset.boundLedFuture1Input = 'true';
        future1Input.addEventListener('change', (e) => {
            setLedFuture1BrightnessPct(e.target.value);
        });
    }

    syncLedBrightnessControls();
}

function normalizeLedOutputMode(value) {
    return ['none', 'midi', 'wled'].includes(value) ? value : 'none';
}

function normalizeWledTransport(value) {
    return ['http-json', 'ddp'].includes(value) ? value : 'http-json';
}

const WLED_HELPER_BASE_URL = 'http://127.0.0.1:4818';
const WLED_HELPER_HEALTH_URL = `${WLED_HELPER_BASE_URL}/api/health`;
const WLED_HELPER_FRAME_URL = `${WLED_HELPER_BASE_URL}/api/wled/frame`;
const WLED_HELPER_CLEAR_URL = `${WLED_HELPER_BASE_URL}/api/wled/clear`;

function compareSemverLoose(a, b) {
    const parse = (value) => String(value || '')
        .trim()
        .replace(/^[^\d]*/, '')
        .split(/[\.-]/)
        .map(part => {
            const n = Number(part);
            return Number.isFinite(n) ? n : 0;
        });
    const aa = parse(a);
    const bb = parse(b);
    const len = Math.max(aa.length, bb.length, 3);
    for (let i = 0; i < len; i++) {
        const av = aa[i] || 0;
        const bv = bb[i] || 0;
        if (av > bv) return 1;
        if (av < bv) return -1;
    }
    return 0;
}

function getAppVersionDisplayText() {
    return `Version: ${APP_VERSION || 'unknown'}`;
}

function buildUpdateStatusText() {
    if (AppState.updateStatus) return AppState.updateStatus;
    if (!AppState.updateManifestUrl) return 'Update checks are not configured yet.';
    return 'Update status: not checked yet.';
}

function isLocalAppRuntime() {
    const host = String(window.location.hostname || '').toLowerCase();
    return window.location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1';
}

function getUpdateActionUrl() {
    const downloadUrl = String(AppState.updateInfo?.downloadUrl || '').trim();
    const releaseUrl = String(AppState.updateInfo?.releaseUrl || '').trim();
    return downloadUrl || releaseUrl || UPDATE_RELEASES_URL || '';
}

function getRequestedAssetVersion() {
    try {
        const url = new URL(window.location.href);
        return String(url.searchParams.get('appv') || '').trim();
    } catch (_) {
        return '';
    }
}

function setAssetVersionOverride(version) {
    const normalized = String(version || '').trim();
    if (!normalized) {
        localStorage.removeItem(ASSET_VERSION_OVERRIDE_STORAGE_KEY);
        return;
    }
    localStorage.setItem(ASSET_VERSION_OVERRIDE_STORAGE_KEY, normalized);
}

function clearAssetVersionOverrideIfCurrent() {
    const requested = getRequestedAssetVersion();
    const stored = String(localStorage.getItem(ASSET_VERSION_OVERRIDE_STORAGE_KEY) || '').trim();
    if (requested && compareSemverLoose(APP_VERSION, requested) >= 0) {
        localStorage.removeItem(ASSET_VERSION_OVERRIDE_STORAGE_KEY);
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('appv');
            url.searchParams.delete('t');
            window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        } catch (_) {}
        return;
    }
    if (stored && compareSemverLoose(APP_VERSION, stored) >= 0) {
        localStorage.removeItem(ASSET_VERSION_OVERRIDE_STORAGE_KEY);
    }
}

function forceReloadToVersion(version) {
    const normalized = String(version || '').trim();
    if (!normalized) {
        window.location.reload();
        return;
    }

    setAssetVersionOverride(normalized);

    try {
        const url = new URL(window.location.href);
        url.searchParams.set('appv', normalized);
        url.searchParams.set('t', String(Date.now()));
        window.location.replace(url.toString());
    } catch (_) {
        window.location.reload();
    }
}

function syncUpdateControls() {
    const versionEl = document.getElementById('app-version-display');
    const statusEl = document.getElementById('update-status');
    const button = document.getElementById('btn-check-updates');

    if (versionEl) versionEl.textContent = getAppVersionDisplayText();
    if (statusEl) statusEl.textContent = buildUpdateStatusText();

    if (button) {
        button.disabled = false;
        if (AppState.updateInfo?.updateAvailable) {
            button.textContent = isLocalAppRuntime() ? 'Download Latest' : 'Reload to Update';
        } else if (AppState.updateInfo && AppState.updateInfo.remoteVersion) {
            button.textContent = 'Up to Date';
        } else {
            button.textContent = 'Check for Updates';
        }
    }
}

async function checkForUpdates({ manual = false } = {}) {
    const button = document.getElementById('btn-check-updates');
    if (button) button.disabled = true;

    if (!AppState.updateManifestUrl) {
        AppState.updateLastCheckedAt = Date.now();
        AppState.updateInfo = null;
        AppState.updateStatus = 'Update checks are not configured yet.';
        syncUpdateControls();
        return;
    }

    try {
        const response = await fetch(`${AppState.updateManifestUrl}${AppState.updateManifestUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
        const manifest = await response.json();
        const remoteVersion = String(manifest?.version || '').trim();
        const releaseUrl = String(manifest?.releaseUrl || UPDATE_RELEASES_URL || '').trim();
        const downloadUrl = String(manifest?.downloadUrl || '').trim();
        const updateAvailable = remoteVersion ? compareSemverLoose(remoteVersion, APP_VERSION) > 0 : false;

        AppState.updateInfo = {
            currentVersion: APP_VERSION,
            remoteVersion,
            updateAvailable,
            releaseUrl,
            downloadUrl
        };
        AppState.updateLastCheckedAt = Date.now();

        if (!remoteVersion) {
            AppState.updateStatus = 'Update manifest is missing a version value.';
        } else if (updateAvailable) {
            AppState.updateStatus = `Update available: ${remoteVersion}.`;
            if (!manual && !isLocalAppRuntime()) {
                AppState.updateStatus = `Updating to ${remoteVersion}...`;
                syncUpdateControls();
                forceReloadToVersion(remoteVersion);
                return;
            }
        } else {
            AppState.updateStatus = 'Up to date.';
            clearAssetVersionOverrideIfCurrent();
        }
    } catch (err) {
        AppState.updateLastCheckedAt = Date.now();
        AppState.updateInfo = null;
        AppState.updateStatus = manual
            ? `Update check failed: ${err?.message || String(err)}`
            : 'Update check unavailable.';
    } finally {
        syncUpdateControls();
    }
}

function initUpdateControls() {
    AppState.updateManifestUrl = String(localStorage.getItem(UPDATE_MANIFEST_URL_STORAGE_KEY) || UPDATE_MANIFEST_URL || '').trim();
    AppState.updateStatus = '';
    clearAssetVersionOverrideIfCurrent();
    const button = document.getElementById('btn-check-updates');
    if (button && !button.dataset.boundCheckUpdates) {
        button.dataset.boundCheckUpdates = 'true';
        button.addEventListener('click', async () => {
            if (AppState.updateInfo?.updateAvailable) {
                if (isLocalAppRuntime()) {
                    const releaseUrl = getUpdateActionUrl();
                    if (releaseUrl) window.open(releaseUrl, '_blank', 'noopener');
                    else window.alert('No release URL is configured yet.');
                    return;
                }
                const shouldReload = window.confirm(`Version ${AppState.updateInfo.remoteVersion} is available. Reload now?`);
                if (shouldReload) forceReloadToVersion(AppState.updateInfo.remoteVersion);
                return;
            }
            await checkForUpdates({ manual: true });
        });
    }
    syncUpdateControls();
    checkForUpdates({ manual: false }).catch(() => {});
}

function hasAcceptedWledDdpWarning() {
    return localStorage.getItem(WLED_TRANSPORT_WARNING_ACCEPTED_STORAGE_KEY) === '1';
}

function syncWledTransportControls() {
    const transportSelect = document.getElementById('wled-transport');
    const transportHint = document.getElementById('wled-transport-hint');
    const runtimeNote = document.getElementById('wled-transport-runtime');
    const helperNote = document.getElementById('wled-helper-status');
    const ddpDebugCheckbox = document.getElementById('check-wled-ddp-debug');
    const ddpDebugRow = document.getElementById('row-wled-ddp-debug');

    const selectedTransport = normalizeWledTransport(AppState.wledTransport);
    const activeTransport = normalizeWledTransport(AppState.wledActiveTransport || 'http-json');
    const helperAvailable = !!AppState.wledHelperAvailable;

    if (transportSelect) transportSelect.value = selectedTransport;
    if (ddpDebugCheckbox) {
        ddpDebugCheckbox.checked = !!AppState.wledDdpDebugEnabled;
        ddpDebugCheckbox.disabled = selectedTransport !== 'ddp';
    }
    if (ddpDebugRow) {
        const showDdpDebug = AppState.ledOutputMode === 'wled' && selectedTransport === 'ddp';
        ddpDebugRow.classList.toggle('hidden', !showDdpDebug);
    }

    const debugFieldset = document.getElementById('fs-display-debug');
    const debugNoteCheckbox = document.getElementById('check-debug');

    const staveFeedbackEnabled = AppState?.feedbackEnabled !== false;
    const ddpActive = AppState.ledOutputMode === 'wled' && selectedTransport === 'ddp';

    if (debugNoteCheckbox) {
        const showNoteDebug = !!staveFeedbackEnabled;
        debugNoteCheckbox.parentElement.classList.toggle('hidden', !showNoteDebug);
    }

    if (debugFieldset) {
        const showDebugSection = (staveFeedbackEnabled || ddpActive);
        debugFieldset.classList.toggle('hidden', !showDebugSection);
    }


    if (transportHint) {
        transportHint.textContent = selectedTransport === 'ddp'
            ? 'DDP may require a local sender in browser mode.'
            : '';
        transportHint.classList.toggle('hidden', selectedTransport !== 'ddp');
    }

    if (runtimeNote) {
        if (selectedTransport === 'ddp') {
            if (!helperAvailable) {
                runtimeNote.textContent = 'Active: HTTP JSON (DDP fallback active)';
            } else if (AppState.wledActiveTransport === 'ddp' && AppState.wledDdpLastSendOk) {
                runtimeNote.textContent = 'Active: DDP';
            } else {
                runtimeNote.textContent = 'Active: DDP (awaiting frame confirm)';
            }
        } else {
            runtimeNote.textContent = 'Active: HTTP JSON';
        }
    }

    if (helperNote) {
        if (selectedTransport === 'ddp') {
            if (!helperAvailable) {
                helperNote.textContent = 'Helper: Not detected. Using HTTP JSON fallback.';
            } else if (AppState.wledDdpLastSendOk) {
                helperNote.textContent = AppState.wledHelperStatus || 'Helper: Connected on localhost. Last DDP frame sent.';
            } else {
                helperNote.textContent = AppState.wledHelperStatus || 'Helper: Connected on localhost. Waiting for a confirmed DDP frame.';
            }
            helperNote.classList.remove('hidden');
        } else {
            helperNote.textContent = AppState.wledHelperStatus || 'Helper: Not detected.';
            helperNote.classList.add('hidden');
        }
    }
}

function setWledTransport(value, { save = true } = {}) {
    const previousTransport = normalizeWledTransport(AppState.wledTransport);
    AppState.wledTransport = normalizeWledTransport(value);
    if (save) localStorage.setItem(WLED_TRANSPORT_STORAGE_KEY, AppState.wledTransport);
    AppState.wledDdpLastSendOk = false;
    AppState.wledDdpLastSendAt = 0;
    AppState.wledDdpLastError = '';
    WLEDController.clearLastSignature();
    syncWledTransportControls();

    if (AppState.ledOutputMode === 'wled') {
        armWledIfNeeded(AppState.wledTransport === 'ddp' ? 'WLED ready. DDP selected.' : 'WLED ready.');
        renderVirtualKeyboard();

        if (AppState.wledTransport === 'ddp') {
            Promise.resolve().then(async () => {
                const helperReady = await WLEDController.checkLocalHelperAvailability({ force: true });
                if (!helperReady) {
                    WLEDController.markDisconnected('DDP helper unavailable. Using HTTP JSON fallback.');
                    return;
                }
                WLEDController.clearLastSignature();
                await WLEDController.resendCurrentFrame({ preferCurrentTransport: true });
            }).catch((err) => {
                console.warn('WLED DDP transport switch recovery failed', err);
            });
        } else if (previousTransport === 'ddp') {
            Promise.resolve().then(async () => {
                WLEDController.clearLastSignature();
                await WLEDController.resendCurrentFrame({ preferCurrentTransport: true });
            }).catch((err) => {
                console.warn('WLED HTTP transport switch recovery failed', err);
            });
        }
    }
}

function confirmAndSetWledTransport(value) {
    const normalized = normalizeWledTransport(value);
    if (normalized !== 'ddp' || hasAcceptedWledDdpWarning()) {
        setWledTransport(normalized);
        return true;
    }

    const confirmed = window.confirm(
        'DDP is experimental.\n\n' +
        'It may require a local sender or standalone build and may not work directly in browser mode.\n\n' +
        'Switch to DDP anyway?'
    );

    if (!confirmed) {
        syncWledTransportControls();
        return false;
    }

    localStorage.setItem(WLED_TRANSPORT_WARNING_ACCEPTED_STORAGE_KEY, '1');
    setWledTransport('ddp');
    return true;
}

window.syncSettingsDebugVisibility = syncWledTransportControls;

function syncWledStatus() {
    const status = document.getElementById('wled-status');
    if (status) status.textContent = AppState.wledStatus || 'WLED idle.';
}

function updateConnectionStatusIndicator(elementId, state, labelText = null) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const dot = el.querySelector('.status-dot');
    const label = el.querySelector('.status-label');
    if (!dot || !label) return;

    dot.classList.remove('status-connected', 'status-disconnected', 'status-none');
    el.classList.remove('status-connected-text', 'status-disconnected-text', 'status-none-text');

    let resolvedText = labelText;
    if (state === 'connected') {
        dot.classList.add('status-connected');
        el.classList.add('status-connected-text');
        resolvedText = resolvedText || 'Connected';
    } else if (state === 'disconnected') {
        dot.classList.add('status-disconnected');
        el.classList.add('status-disconnected-text');
        resolvedText = resolvedText || 'Disconnected';
    } else {
        dot.classList.add('status-none');
        el.classList.add('status-none-text');
        resolvedText = resolvedText || 'None';
    }

    label.textContent = resolvedText;
}

function getSelectedMidiInputState() {
    const midiInSelect = document.getElementById('midi-in');
    const selectedId = midiInSelect?.value || 'none';
    if (selectedId === 'none') return 'none';
    const input = midiAccess?.inputs?.get(selectedId);
    return input && input.state !== 'disconnected' ? 'connected' : 'disconnected';
}

function getSelectedMidiOutputState() {
    const midiOutSelect = document.getElementById('midi-out');
    const selectedId = midiOutSelect?.value || 'none';
    if (selectedId === 'none') return 'none';
    const output = midiAccess?.outputs?.get(selectedId);
    return output && output.state !== 'disconnected' ? 'connected' : 'disconnected';
}

function getSelectedLedMidiOutputState() {
    const midiLightsSelect = document.getElementById('midi-lights');
    const selectedId = midiLightsSelect?.value || 'none';
    if (selectedId === 'none') return 'none';
    const output = midiAccess?.outputs?.get(selectedId);
    return output && output.state !== 'disconnected' ? 'connected' : 'disconnected';
}

function updateConnectionStatuses() {
    if (typeof syncMidiOutChannelVisibility === 'function') {
        syncMidiOutChannelVisibility();
    }
    updateConnectionStatusIndicator('midi-in-connection-status', getSelectedMidiInputState());
    updateConnectionStatusIndicator('midi-out-connection-status', getSelectedMidiOutputState());

    let ledState = 'none';
    if (AppState.ledOutputMode === 'midi') {
        ledState = getSelectedLedMidiOutputState();
    } else if (AppState.ledOutputMode === 'wled') {
        if (!String(AppState.wledIp || '').trim()) {
            ledState = 'none';
        } else {
            ledState = AppState.wledConnectionState || 'disconnected';
        }
    }

    updateConnectionStatusIndicator('led-connection-status', ledState);
}

function refreshConnectionStatuses() {
    updateConnectionStatuses();
    syncWledStatus();
}

function syncLedOutputModeControls() {
    const modeSelect = document.getElementById('led-output-mode');
    const midiRow = document.getElementById('midi-lights-row');
    const wledSettings = document.getElementById('wled-settings');
    const ledCountRow = document.getElementById('led-count-row');
    const brightnessSettings = document.getElementById('led-brightness-settings');
    const calibrationSettings = document.getElementById('led-calibration-settings');
    const ipInput = document.getElementById('input-wled-ip');
    const reverseCheckbox = document.getElementById('check-led-reverse');

    if (modeSelect) modeSelect.value = AppState.ledOutputMode;
    if (ipInput) ipInput.value = AppState.wledIp || '';
    if (reverseCheckbox) reverseCheckbox.checked = !!AppState.ledReverse;

    const showMidiSettings = AppState.ledOutputMode === 'midi';
    const showWledSettings = AppState.ledOutputMode === 'wled';

    if (midiRow) midiRow.classList.toggle('hidden', !showMidiSettings);
    if (wledSettings) wledSettings.classList.toggle('hidden', !showWledSettings);
    if (ledCountRow) ledCountRow.classList.toggle('hidden', !showWledSettings);
    if (brightnessSettings) brightnessSettings.classList.toggle('hidden', !showWledSettings);
    if (calibrationSettings) calibrationSettings.classList.toggle('hidden', !showWledSettings);
    if (!showWledSettings) clearWledPermissionHelp();

    if (window.MidiLedTestController && typeof window.MidiLedTestController.syncControls === 'function') {
        window.MidiLedTestController.syncControls();
    }

    syncLedCountControl();
    syncWledTransportControls();
    syncWledStatus();
    updateConnectionStatuses();
}

function setWledStatus(text) {
    AppState.wledStatus = text;
    syncWledStatus();
}

function armWledIfNeeded(statusText = 'WLED ready.') {
    if (AppState.ledOutputMode !== 'wled' || !String(AppState.wledIp || '').trim()) {
        AppState.wledConnectionState = 'none';
        updateConnectionStatuses();
        return;
    }
    WLEDController.ensureSolidMode()
        .then((ready) => {
            if (ready) {
                WLEDController.markConnected(statusText);
            } else {
                WLEDController.markDisconnected('WLED unreachable. Retrying…');
            }
        })
        .catch(() => {
            WLEDController.markDisconnected('WLED unreachable. Retrying…');
        });
}

function setLedOutputMode(value, { save = true } = {}) {
    AppState.ledOutputMode = normalizeLedOutputMode(value);

    if (save) localStorage.setItem(LED_OUTPUT_MODE_STORAGE_KEY, AppState.ledOutputMode);

    if (AppState.ledOutputMode !== 'midi') {
        wipeHardwareLEDs();
        if (window.MidiLedTestController && typeof window.MidiLedTestController.stop === 'function') {
            window.MidiLedTestController.stop({ statusText: 'MIDI LED idle.' });
        }
    }

    if (AppState.ledOutputMode !== 'wled') {
        WLEDController.forceClear().catch(() => {});
        WLEDController.cancelReconnect();
        WLEDController.stopHealthCheck();
        AppState.wledConnectionState = 'none';
        setWledStatus('WLED idle.');
    }

    WLEDController.clearLastSignature();
    initUpdateControls();
    syncLedOutputModeControls();

    if (AppState.ledOutputMode === 'wled') {
        AppState.wledConnectionState = String(AppState.wledIp || '').trim() ? 'disconnected' : 'none';
        WLEDController.checkLocalHelperAvailability({ force: true }).catch(() => {});
        WLEDController.startHealthCheck();
        armWledIfNeeded('WLED ready.');
    }

    updateConnectionStatuses();
    renderVirtualKeyboard();
}

function setLedReverse(value, { save = true } = {}) {
    AppState.ledReverse = !!value;
    if (save) {
        setStoredBool(LED_REVERSE_STORAGE_KEY, AppState.ledReverse);
    }
    updateLedKeyMapping();
    WLEDController.clearLastSignature();
    LedEngine.renderOutputs();
}

function buildChromaticTestNotes() {
    const range = typeof getPlayerPlayableRange === 'function'
        ? getPlayerPlayableRange()
        : { minMidi: 21, maxMidi: 108 };
    const notes = [];
    for (let note = range.minMidi; note <= range.maxMidi; note++) notes.push(note);
    for (let note = range.maxMidi - 1; note > range.minMidi; note--) notes.push(note);
    return notes;
}

function setWledIp(value, { save = true } = {}) {
    AppState.wledIp = String(value || '').trim();
    if (save) localStorage.setItem(WLED_IP_STORAGE_KEY, AppState.wledIp);
    WLEDController.clearLastSignature();
    WLEDController.cancelReconnect();
    AppState.wledConnectionState = AppState.wledIp ? 'disconnected' : 'none';
    initUpdateControls();
    syncLedOutputModeControls();

    if (AppState.ledOutputMode === 'wled') {
        WLEDController.checkLocalHelperAvailability({ force: true }).catch(() => {});
        WLEDController.startHealthCheck();
        armWledIfNeeded('WLED ready.');
    } else {
        WLEDController.stopHealthCheck();
        updateConnectionStatuses();
    }
}

function initLedOutputControls() {
    const savedMode = localStorage.getItem(LED_OUTPUT_MODE_STORAGE_KEY);
    const savedIp = localStorage.getItem(WLED_IP_STORAGE_KEY);
    const savedTransport = localStorage.getItem(WLED_TRANSPORT_STORAGE_KEY);

    AppState.ledOutputMode = normalizeLedOutputMode(savedMode || 'none');
    AppState.wledIp = String(savedIp || '').trim();
    AppState.wledTransport = normalizeWledTransport(savedTransport || 'http-json');
    AppState.wledActiveTransport = 'http-json';
    AppState.wledHelperAvailable = false;
    AppState.wledHelperStatus = 'Helper: Not detected.';
    AppState.wledDdpDebugEnabled = getStoredBool(WLED_DDP_DEBUG_STORAGE_KEY, false);

    const modeSelect = document.getElementById('led-output-mode');
    const ipInput = document.getElementById('input-wled-ip');
    const transportSelect = document.getElementById('wled-transport');
    const reverseCheckbox = document.getElementById('check-led-reverse');
    const ddpDebugCheckbox = document.getElementById('check-wled-ddp-debug');
    const testBtn = document.getElementById('btn-test-wled');
    const resendBtn = document.getElementById('btn-resend-wled');

    if (modeSelect && !modeSelect.dataset.boundLedOutputMode) {
        modeSelect.dataset.boundLedOutputMode = 'true';
        modeSelect.addEventListener('change', (e) => setLedOutputMode(e.target.value));
    }

    if (ipInput && !ipInput.dataset.boundWledIp) {
        ipInput.dataset.boundWledIp = 'true';
        ipInput.addEventListener('change', (e) => setWledIp(e.target.value));
    }

    if (transportSelect && !transportSelect.dataset.boundWledTransport) {
        transportSelect.dataset.boundWledTransport = 'true';
        transportSelect.addEventListener('change', (e) => {
            const changed = confirmAndSetWledTransport(e.target.value);
            if (!changed) {
                transportSelect.value = normalizeWledTransport(AppState.wledTransport);
            }
        });
    }

    if (reverseCheckbox && !reverseCheckbox.dataset.boundLedReverse) {
        reverseCheckbox.dataset.boundLedReverse = 'true';
        reverseCheckbox.checked = !!AppState.ledReverse;
        reverseCheckbox.addEventListener('change', (e) => {
            setLedReverse(e.target.checked);
        });
    }


    if (ddpDebugCheckbox && !ddpDebugCheckbox.dataset.boundWledDdpDebug) {
        ddpDebugCheckbox.dataset.boundWledDdpDebug = 'true';
        ddpDebugCheckbox.checked = !!AppState.wledDdpDebugEnabled;
        ddpDebugCheckbox.addEventListener('change', (e) => {
            AppState.wledDdpDebugEnabled = !!e.target.checked;
            localStorage.setItem(WLED_DDP_DEBUG_STORAGE_KEY, AppState.wledDdpDebugEnabled ? 'true' : 'false');
            syncWledTransportControls();
            if (AppState.ledOutputMode === 'wled') {
                WLEDController.checkLocalHelperAvailability({ force: true }).catch(() => {});
            }
        });
    }
    if (testBtn && !testBtn.dataset.boundWledTest) {
        testBtn.dataset.boundWledTest = 'true';
        testBtn.addEventListener('click', async () => {
            await WLEDController.testPattern();
        });
    }

    if (resendBtn && !resendBtn.dataset.boundWledResend) {
        resendBtn.dataset.boundWledResend = 'true';
        resendBtn.addEventListener('click', async () => {
            await WLEDController.resendCurrentFrame();
        });
    }

    initUpdateControls();
    syncLedOutputModeControls();

    if (AppState.ledOutputMode === 'wled') {
        WLEDController.checkLocalHelperAvailability({ force: true }).catch(() => {});
        WLEDController.startHealthCheck();
        armWledIfNeeded('WLED ready.');
    } else {
        WLEDController.stopHealthCheck();
    }
}


function normalizePlayerPianoType(value) {
    const numericValue = Number(value);
    return PLAYER_PIANO_SIZES.includes(numericValue) ? numericValue : 88;
}

function derivePlayerRangeFromKeyboardSize(keyCount) {
    const normalizedKeyCount = normalizePlayerPianoType(keyCount);
    const keysTrimmed = FULL_PIANO_KEY_COUNT - normalizedKeyCount;
    const trimLow = Math.floor(keysTrimmed / 2);
    const trimHigh = keysTrimmed - trimLow;
    const minMidi = FULL_PIANO_MIDI_MIN + trimLow;
    const maxMidi = FULL_PIANO_MIDI_MAX - trimHigh;

    return {
        keyCount: normalizedKeyCount,
        minMidi,
        maxMidi,
        trimmedLowKeys: trimLow,
        trimmedHighKeys: trimHigh
    };
}

function getPlayerPlayableRange() {
    if (!AppState.playerRange || AppState.playerRange.keyCount !== AppState.playerPianoType) {
        AppState.playerRange = derivePlayerRangeFromKeyboardSize(AppState.playerPianoType);
    }
    return AppState.playerRange;
}

function isMidiInPlayerRange(midi) {
    const range = getPlayerPlayableRange();
    return Number(midi) >= range.minMidi && Number(midi) <= range.maxMidi;
}

function isCurrentOutOfRangeScoreNote(midi) {
    return AppState.outOfRangeCurrentNotes.some(note => Number(note.midi) === Number(midi));
}

function getMidiKeyPosition01(midi) {
    const range = getPlayerPlayableRange();
    const playableSpan = Math.max(1, range.maxMidi - range.minMidi);
    return (Number(midi) - range.minMidi) / playableSpan;
}

function keyPosition01ToLedIndex(position01) {
    const clamped = Math.max(0, Math.min(1, position01));
    const normalizedPosition = AppState.ledReverse ? (1 - clamped) : clamped;
    return Math.round(normalizedPosition * Math.max(0, LedEngine.config.ledCount - 1));
}

function updateLedKeyMapping() {
    LedEngine.keyToLed.clear();

    const range = getPlayerPlayableRange();

    for (let midi = range.minMidi; midi <= range.maxMidi; midi++) {
        const keyPosition01 = getMidiKeyPosition01(midi);
        let ledIndex = keyPosition01ToLedIndex(keyPosition01);

        const calibrationOffset = getLedCalibrationOffsetForMidi(midi);
        ledIndex += calibrationOffset;
        ledIndex = Math.max(0, Math.min(LedEngine.config.ledCount - 1, ledIndex));

        LedEngine.keyToLed.set(midi, ledIndex);
    }
}

function syncPlayerPianoTypeControl() {
    const select = document.getElementById('select-player-piano-type');
    if (select) {
        select.value = String(AppState.playerPianoType);
    }

    const label = document.getElementById('player-piano-range-label');
    if (label) {
        const range = getPlayerPlayableRange();
        label.textContent = `Playable Range: MIDI ${range.minMidi}–${range.maxMidi}`;
    }
}

function refreshPlayerRangeDependentState() {
    AppState.expectedNotes = AppState.expectedNotes.filter(note => isMidiInPlayerRange(note.midi));
    AppState.visualNotesToStart = AppState.visualNotesToStart.filter(note => isMidiInPlayerRange(note.midi));
    AppState.sustainedVisuals = AppState.sustainedVisuals.filter(note => isMidiInPlayerRange(note.midi));
    AppState.outOfRangeCurrentNotes = AppState.outOfRangeCurrentNotes.filter(note => !isMidiInPlayerRange(note.midi));
    AppState.heldCorrectNotes.forEach((staffId, midi) => {
        if (!isMidiInPlayerRange(midi)) {
            AppState.heldCorrectNotes.delete(midi);
        }
    });
    updateLedKeyMapping();
    WLEDController.clearLastSignature();
    LedEngine.renderOutputs();
}

function setPlayerPianoType(value, { save = true, rerender = true } = {}) {
    AppState.playerPianoType = normalizePlayerPianoType(value);
    AppState.playerRange = derivePlayerRangeFromKeyboardSize(AppState.playerPianoType);

    if (save) {
        localStorage.setItem(PLAYER_PIANO_STORAGE_KEY, String(AppState.playerPianoType));
    }

    syncPlayerPianoTypeControl();
    refreshPlayerRangeDependentState();
    AppState.ledPreviewTimelineDirty = true;
    AppState.lastLedPreviewEvents = [];
    AppState.ledPreviewTraversalIndex = -1;

    if (rerender) {
        renderVirtualKeyboard();
    }
}

function initPlayerPianoTypeControl() {
    const saved = localStorage.getItem(PLAYER_PIANO_STORAGE_KEY);
    setPlayerPianoType(saved ?? 88, { save: false, rerender: false });

    const select = document.getElementById('select-player-piano-type');
    if (select && !select.dataset.boundPlayerRange) {
        select.dataset.boundPlayerRange = 'true';
        select.value = String(AppState.playerPianoType);
        select.addEventListener('change', (e) => {
            setPlayerPianoType(e.target.value);
        });
    }

    syncPlayerPianoTypeControl();
}

/* ------------------------------------------------------
   LED ENGINE (scaffold - no rendering yet)
------------------------------------------------------ */

const LedEngine = {

  // configurable settings
  config: {
    ledCount: 88,
    masterBrightness: 0.25,
    future1BrightnessPct: 1,
    future2BrightnessPct: 1,
    futurePreview: 1,   // 0,1
    pulseEnabled: false
  },

  // LED framebuffer (RGB)
  frame: [],
  previousFrame: [],
  lastFrameTime: 0,

  // key → LED mapping
  keyToLed: new Map(),

  // animation state
  pulsePhase: 0,

  init() {

    // initialize framebuffer
    this.frame = new Array(this.config.ledCount);
    this.previousFrame = new Array(this.config.ledCount);

    for (let i = 0; i < this.config.ledCount; i++) {
      this.frame[i] = [0, 0, 0];
      this.previousFrame[i] = [0, 0, 0];
    }

    this.lastFrameTime = 0;

  },

  clear() {

    for (let i = 0; i < this.frame.length; i++) {
      this.frame[i][0] = 0;
      this.frame[i][1] = 0;
      this.frame[i][2] = 0;
    }

  },

  setLed(index, r, g, b) {

    if (index < 0 || index >= this.frame.length) return;

    this.frame[index][0] = r;
    this.frame[index][1] = g;
    this.frame[index][2] = b;

  },

  getPulseFactor() {
    return 1;
  },

  getStateBrightnessMultiplier(state) {
    let multiplier = Math.max(0, Math.min(1, this.config.masterBrightness ?? 0.25));

    if (state === 'future1-l' || state === 'future1-r') {
      multiplier *= Math.max(0, Math.min(1, (this.config.future1BrightnessPct ?? 1) / 100));
    } else if (state === 'future2-l' || state === 'future2-r') {
      multiplier *= Math.max(0, Math.min(1, (this.config.future2BrightnessPct ?? 1) / 100));
    }

    return multiplier;
  },

  applyBrightnessToColor(color, state) {
    const multiplier = this.getStateBrightnessMultiplier(state);
    return color.map(channel => Math.max(0, Math.min(255, Math.round(channel * multiplier))));
  },

  getMidiVelocityForState(state) {
    if (AppState.ledOutputMode === 'midi') {
      return AppState.midiLedLowVelocity ? 1 : 100;
    }
    const multiplier = this.getStateBrightnessMultiplier(state);
    return Math.max(1, Math.min(127, Math.round(127 * multiplier)));
  },

  getColorForState(state) {
    switch (state) {
      case 'expected-l':
        return [0, 0, 255];

      case 'expected-r':
        return [0, 255, 0];

      case 'pressed-l':
        return [185, 130, 25];

      case 'pressed-r':
        return [185, 130, 25];

      case 'wrong':
        return [255, 0, 0];

      case 'active':
        return [185, 130, 25];

      case 'future1-l':
        return [0, 0, 255];

      case 'future1-r':
        return [0, 255, 0];

      case 'future2-l':
        return [0, 0, 255];

      case 'future2-r':
        return [0, 255, 0];

      case 'calibration':
        return [255, 255, 255];
    }

    return [0, 0, 0];
  },

  renderFromStates(desiredStates) {

    this.clear();

    desiredStates.forEach((state, midiNote) => {

      const ledIndex = this.keyToLed.get(midiNote);
      if (ledIndex === undefined) return;

      const baseColor = this.getColorForState(state);
      const [r, g, b] = this.applyBrightnessToColor(baseColor, state);
      this.setLed(ledIndex, r, g, b);

    });

    this.previousFrame = this.frame.map(c => [c[0], c[1], c[2]]);
    this.lastFrameTime = performance.now();

  },

  hasResidualLight() {
    return false;
  },

  ensureSimulator() {
    return;
  },

  applyPlayableRangeLayout() {
    const row = document.getElementById('led-simulator-row');
    if (!row) return;

    const range = getPlayerPlayableRange();
    let leftPercent = 0;
    let widthPercent = 100;

    const keyboard = document.getElementById('virtual-keyboard');
    const firstKey = document.querySelector(`.key[data-midi="${range.minMidi}"]`);
    const lastKey = document.querySelector(`.key[data-midi="${range.maxMidi}"]`);

    if (keyboard && firstKey && lastKey && keyboard.scrollWidth > 0) {
      const keyboardWidth = keyboard.scrollWidth;
      const leftPx = firstKey.offsetLeft;
      const rightPx = lastKey.offsetLeft + lastKey.offsetWidth;

      leftPercent = (leftPx / keyboardWidth) * 100;
      widthPercent = ((rightPx - leftPx) / keyboardWidth) * 100;
    } else {
      const totalKeys = FULL_PIANO_KEY_COUNT;
      const startIndex = Math.max(0, range.minMidi - FULL_PIANO_MIDI_MIN);
      const endIndex = Math.max(startIndex, range.maxMidi - FULL_PIANO_MIDI_MIN);
      leftPercent = (startIndex / totalKeys) * 100;
      widthPercent = (((endIndex - startIndex) + 1) / totalKeys) * 100;
    }

    row.style.left = `${leftPercent}%`;
    row.style.width = `${Math.max(0, Math.min(100, widthPercent))}%`;
  },

  renderOutputs() {
    if (AppState.ledOutputMode === 'wled') {
      WLEDController.queueFrame(this.frame);
    }
  },

  renderSimulator() {
    return;
  }

};


const WLEDController = {
    frameIntervalMs: 20,
    reconnectIntervalMs: 3000,
    healthCheckIntervalMs: 3000,
    fetchTimeoutMs: 1200,
    reconnectTimer: null,
    healthCheckTimer: null,
    healthCheckInFlight: false,
    pendingHexFrame: null,
    pendingFrameSignature: '',
    sending: false,
    flushScheduled: false,
    lastFrameSignature: '',
    testPatternRunning: false,
    testPatternToken: 0,
    helperFrameSequence: 1,
    helperClientSessionId: (() => {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                return window.crypto.randomUUID();
            }
        } catch (_) {}
        return `pt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    })(),
    ensureConfigured() {
        return AppState.ledOutputMode === 'wled' && !!String(AppState.wledIp || '').trim();
    },
    getBaseUrl() {
        const ip = String(AppState.wledIp || '').trim();
        return ip ? `http://${ip}` : '';
    },
    getSelectedTransport() {
        return normalizeWledTransport(AppState.wledTransport);
    },
    getActiveTransport() {
        const selected = this.getSelectedTransport();
        const active = selected === 'ddp' && AppState.wledHelperAvailable ? 'ddp' : 'http-json';
        AppState.wledActiveTransport = active;
        return active;
    },
    helperIsNeeded() {
        return this.ensureConfigured() && this.getSelectedTransport() === 'ddp';
    },
    clearLastSignature() {
        this.lastFrameSignature = '';
        this.pendingFrameSignature = '';
        this.pendingHexFrame = null;
    },
    cancelReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    },
    async fetchWithTimeout(url, options = {}, timeoutMs = this.fetchTimeoutMs) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
            return await fetch(url, {
                ...options,
                signal: controller.signal
            });
        } finally {
            window.clearTimeout(timer);
        }
    },
    helperCheckPromise: null,
    helperLastCheckedAt: 0,
    async checkLocalHelperAvailability({ force = false } = {}) {
        if (!this.helperIsNeeded()) {
            this.helperLastCheckedAt = Date.now();
            AppState.wledHelperAvailable = false;
            AppState.wledHelperStatus = this.ensureConfigured()
                ? 'Helper: Not needed for HTTP JSON.'
                : 'Helper: Not detected.';
            AppState.wledActiveTransport = this.getActiveTransport();
            syncWledTransportControls();
            return false;
        }

        const now = Date.now();
        if (!force && this.helperCheckPromise) return this.helperCheckPromise;
        if (!force && now - this.helperLastCheckedAt < 1500) return !!AppState.wledHelperAvailable;

        this.helperCheckPromise = (async () => {
            const wasAvailable = !!AppState.wledHelperAvailable;
            let available = false;
            let helperData = {};
            try {
                const helperHealthUrl = `${WLED_HELPER_HEALTH_URL}?debug=${AppState.wledDdpDebugEnabled ? '1' : '0'}`;
                const response = await this.fetchWithTimeout(helperHealthUrl, {
                    method: 'GET',
                    cache: 'no-store'
                }, 600);
                if (response && response.ok) {
                    helperData = await response.json().catch(() => ({}));
                    available = !!helperData?.ok;
                }
            } catch (err) {
                available = false;
                if (isLikelyBrowserAccessIssue(err)) {
                    showWledPermissionHelp(getWledPermissionHelpText('helper'));
                }
            }

            this.helperLastCheckedAt = Date.now();
            AppState.wledHelperAvailable = available;
            if (available) {
                clearWledPermissionHelp();
                if (helperData?.version) AppState.helperVersion = String(helperData.version).trim();
                const lastTransport = helperData?.lastFrame?.transport;
                const lastOutcome = helperData?.lastFrame?.outcome;
                AppState.wledHelperStatus = (lastTransport && lastOutcome)
                    ? `Helper: Connected on localhost. Last frame ${lastTransport.toUpperCase()} ${lastOutcome}.`
                    : 'Helper: Connected on localhost.';
            } else {
                if (this.getSelectedTransport() === 'ddp') {
                    showWledPermissionHelp(getWledPermissionHelpText('helper'));
                }
                AppState.wledHelperStatus = 'Helper: Not detected.';
                AppState.wledDdpLastSendOk = false;
            }
            AppState.wledActiveTransport = this.getActiveTransport();
            syncWledTransportControls();

            if (!wasAvailable && available && this.getSelectedTransport() === 'ddp' && AppState.ledOutputMode === 'wled') {
                this.clearLastSignature();
                requestAnimationFrame(() => {
                    if (!this.ensureConfigured() || this.getSelectedTransport() !== 'ddp') return;
                    this.resendCurrentFrame({ preferCurrentTransport: true }).catch((err) => {
                        console.warn('WLED helper recovery resend failed', err);
                    });
                });
            }
            return available;
        })();

        try {
            return await this.helperCheckPromise;
        } finally {
            this.helperCheckPromise = null;
        }
    },
    startHealthCheck() {
        this.stopHealthCheck();
        if (!this.ensureConfigured()) return;
        if (!this.helperIsNeeded()) {
            this.checkHealth().catch(() => {});
            return;
        }

        const runCheck = async () => {
            if (!this.ensureConfigured()) return;
            if (this.healthCheckInFlight) return;

            this.healthCheckInFlight = true;
            try {
                await this.checkLocalHelperAvailability();
                await this.checkHealth();
            } finally {
                this.healthCheckInFlight = false;
            }
        };

        runCheck().catch(() => {});
        this.healthCheckTimer = setInterval(() => {
            runCheck().catch(() => {});
        }, this.healthCheckIntervalMs);
    },
    stopHealthCheck() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
        this.healthCheckInFlight = false;
    },
    async ping() {
        if (!this.ensureConfigured()) return false;
        const base = this.getBaseUrl();
        if (!base) return false;

        try {
            const response = await this.fetchWithTimeout(`${base}/json/info`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-store'
            });
            return !!response && response.ok;
        } catch (err) {
            if (AppState.ledOutputMode === 'wled' && isLikelyBrowserAccessIssue(err)) {
                showWledPermissionHelp(getWledPermissionHelpText('wled'));
            }
            return false;
        }
    },
    scheduleReconnect() {
        if (this.reconnectTimer || !this.ensureConfigured()) return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            if (!this.ensureConfigured()) return;

            const reachable = await this.ping();
            if (!reachable) {
                this.markDisconnected('WLED unreachable. Retrying…');
                return;
            }

            await this.handleReconnectRecovery('WLED reconnected. Strip cleared.');
        }, this.reconnectIntervalMs);
    },
    async checkHealth() {
        if (!this.ensureConfigured()) return;

        const reachable = await this.ping();
        if (!reachable) {
            this.markDisconnected('WLED unreachable. Retrying…');
            return;
        }

        if (AppState.wledConnectionState !== 'connected') {
            await this.handleReconnectRecovery('WLED reconnected. Strip cleared.');
        }
    },
    markConnected(statusText = 'WLED ready.') {
        this.cancelReconnect();
        clearWledPermissionHelp();
        AppState.wledConnectionState = 'connected';
        setWledStatus(statusText);
        updateConnectionStatuses();
    },
    markDisconnected(statusText = 'WLED unreachable. Retrying…') {
        AppState.wledConnectionState = String(AppState.wledIp || '').trim() ? 'disconnected' : 'none';
        setWledStatus(statusText);
        updateConnectionStatuses();
        this.scheduleReconnect();
    },
    frameToHexArray(frame) {
        return frame.map(([r, g, b]) => [r, g, b].map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('').toUpperCase());
    },
    frameSignature(frame) {
        let acc = frame.length >>> 0;
        for (let i = 0; i < frame.length; i++) {
            const [r, g, b] = frame[i];
            acc = (acc * 33 + r * 3 + g * 5 + b * 7 + i) >>> 0;
        }
        return `${frame.length}:${acc}`;
    },
    async ensureSolidMode() {
        if (!this.ensureConfigured()) return false;
        const base = this.getBaseUrl();
        if (!base) return false;

        try {
            await this.fetchWithTimeout(`${base}/win&T=1&A=255&FX=0`, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-store'
            }, 1500);
            return true;
        } catch (primaryErr) {
            try {
                await this.fetchWithTimeout(`${base}/win&T=1&A=255&FX=0`, {
                    method: 'GET',
                    mode: 'no-cors',
                    cache: 'no-store'
                }, 1500);
                return true;
            } catch (fallbackErr) {
                if (isLikelyBrowserAccessIssue(fallbackErr) || isLikelyBrowserAccessIssue(primaryErr)) {
                    showWledPermissionHelp(getWledPermissionHelpText('wled'));
                }
                return false;
            }
        }
    },
    async sendHexFrameViaHttp(hexFrame) {
        if (!this.ensureConfigured()) throw new Error('WLED not configured');
        const base = this.getBaseUrl();
        if (!base) throw new Error('Missing WLED base URL');

        const rgbFrame = this.hexFrameToRgbFrame(hexFrame);
        const payloads = [
            JSON.stringify({ on: true, seg: { id: 0, i: rgbFrame } }),
            JSON.stringify({ on: true, seg: [{ id: 0, i: rgbFrame }] }),
            JSON.stringify({ on: true, seg: { id: 0, i: hexFrame } })
        ];

        let lastError = null;
        for (const payload of payloads) {
            try {
                const response = await this.fetchWithTimeout(`${base}/json/state`, {
                    method: 'POST',
                    mode: 'cors',
                    cache: 'no-store',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: payload
                }, 1500);
                if (response && response.type !== 'opaque' && !response.ok) {
                    throw new Error(`WLED HTTP JSON request failed (${response.status})`);
                }
                return;
            } catch (primaryErr) {
                lastError = primaryErr;
                try {
                    await this.fetchWithTimeout(`${base}/json/state`, {
                        method: 'POST',
                        mode: 'no-cors',
                        cache: 'no-store',
                        body: payload
                    }, 1500);
                    return;
                } catch (fallbackErr) {
                    lastError = fallbackErr;
                }
            }
        }

        if (isLikelyBrowserAccessIssue(lastError)) {
            showWledPermissionHelp(getWledPermissionHelpText('wled'));
        }
        throw lastError || new Error('WLED HTTP JSON request failed');
    },
    hexFrameToRgbFrame(hexFrame) {
        return hexFrame.map((hex) => {
            const value = String(hex || '000000').padStart(6, '0').slice(0, 6);
            return [
                parseInt(value.slice(0, 2), 16) || 0,
                parseInt(value.slice(2, 4), 16) || 0,
                parseInt(value.slice(4, 6), 16) || 0
            ];
        });
    },
    async postHelperJson(url, payload) {
        const response = await this.fetchWithTimeout(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
            cache: 'no-store'
        }, 1200);

        if (!response || !response.ok) {
            throw new Error(`Helper request failed (${response ? response.status : 'no response'})`);
        }

        return await response.json().catch(() => ({}));
    },
    async sendHexFrameViaHelper(hexFrame, transport = 'ddp') {
        if (!this.ensureConfigured()) throw new Error('WLED not configured');
        const rgbFrame = this.hexFrameToRgbFrame(hexFrame);
        const payload = {
            transport,
            wledIp: String(AppState.wledIp || '').trim(),
            ledCount: rgbFrame.length,
            sequence: this.helperFrameSequence++,
            clientSessionId: this.helperClientSessionId,
            timestamp: Date.now(),
            frame: rgbFrame,
            debugEnabled: !!AppState.wledDdpDebugEnabled
        };
        const result = await this.postHelperJson(WLED_HELPER_FRAME_URL, payload);
        if (!result || result.ok !== true) {
            AppState.wledDdpLastSendOk = false;
            AppState.wledDdpLastError = result?.error || 'Helper frame request failed';
            syncWledTransportControls();
            throw new Error(AppState.wledDdpLastError);
        }
        if (transport === 'ddp') {
            AppState.wledDdpLastSendOk = !result.skipped;
            AppState.wledDdpLastSendAt = Date.now();
            AppState.wledDdpLastError = result.skipped ? (result.reason || 'DDP frame skipped') : '';
            AppState.wledHelperStatus = result.skipped
                ? `Helper: Connected on localhost. Last DDP frame skipped (${result.reason || 'unknown'}).`
                : 'Helper: Connected on localhost. Last DDP frame sent.';
            syncWledTransportControls();
        }
        return result;
    },
    async clearViaHelper({ transport = 'ddp', repeat = 2 } = {}) {
        if (!this.ensureConfigured()) throw new Error('WLED not configured');
        const payload = {
            transport,
            wledIp: String(AppState.wledIp || '').trim(),
            ledCount: Math.max(0, Number(LedEngine.frame.length) || 0),
            repeat,
            clientSessionId: this.helperClientSessionId,
            debugEnabled: !!AppState.wledDdpDebugEnabled
        };
        return await this.postHelperJson(WLED_HELPER_CLEAR_URL, payload);
    },
    async sendHexFrame(hexFrame) {
        const activeTransport = this.getActiveTransport();
        if (activeTransport === 'ddp') {
            return await this.sendHexFrameViaHelper(hexFrame, 'ddp');
        }
        if (activeTransport === 'http-json') {
            return await this.sendHexFrameViaHttp(hexFrame);
        }

        throw new Error(`Unsupported WLED transport: ${activeTransport}`);
    },
    queueFrame(frame) {
        if (!this.ensureConfigured()) return;

        const signature = this.frameSignature(frame);
        if (signature === this.lastFrameSignature || signature === this.pendingFrameSignature) return;

        this.pendingFrameSignature = signature;
        this.pendingHexFrame = this.frameToHexArray(frame);

        if (this.flushScheduled) return;
        this.flushScheduled = true;

        requestAnimationFrame(() => {
            this.flushScheduled = false;
            if (!this.pendingHexFrame || !this.ensureConfigured()) return;
            if (!this.sending) {
                this.flushQueue();
            }
        });
    },
    async flushQueue() {
        if (this.sending) return;
        this.sending = true;

        try {
            while (this.pendingHexFrame && this.ensureConfigured()) {
                const frame = this.pendingHexFrame;
                const signature = this.pendingFrameSignature;
                this.pendingHexFrame = null;
                this.pendingFrameSignature = '';

                await this.sendHexFrame(frame);
                this.lastFrameSignature = signature;
                const activeTransport = this.getActiveTransport();
                const transportLabel = activeTransport === 'ddp'
                    ? (AppState.wledDdpLastSendOk
                        ? 'DDP frame confirmed via localhost helper.'
                        : 'DDP selected via localhost helper (awaiting frame confirm).')
                    : (this.getSelectedTransport() === 'ddp'
                        ? 'HTTP JSON active; DDP fallback in use. Helper not detected.'
                        : 'HTTP JSON active.');
                this.markConnected(`WLED connected (${frame.length} LEDs, ${transportLabel})`);

                if (this.pendingHexFrame) {
                    await new Promise(resolve => setTimeout(resolve, this.frameIntervalMs));
                }
            }
        } catch (err) {
            console.warn('WLED send error', err);
            this.markDisconnected('WLED send error. Retrying…');
        } finally {
            this.sending = false;

            if (this.pendingHexFrame && this.ensureConfigured() && !this.flushScheduled) {
                this.flushScheduled = true;
                requestAnimationFrame(() => {
                    this.flushScheduled = false;
                    if (!this.sending) {
                        this.flushQueue();
                    }
                });
            }
        }
    },
    makeOffHexFrame() {
        return Array.from({ length: LedEngine.frame.length }, () => '000000');
    },
    async forceSendHexFrame(hexFrame, statusText = null) {
        if (!this.ensureConfigured()) return false;

        try {
            const ready = await this.ensureSolidMode();
            if (!ready) {
                this.markDisconnected('WLED unreachable. Retrying…');
                return false;
            }

            await this.sendHexFrame(hexFrame);
            this.lastFrameSignature = '';
            this.pendingFrameSignature = '';
            this.pendingHexFrame = null;

            if (statusText) {
                this.markConnected(statusText);
            } else {
                this.markConnected('WLED ready.');
            }

            return true;
        } catch (err) {
            console.warn('WLED force send error', err);
            this.markDisconnected('WLED force-send failed. Retrying…');
            return false;
        }
    },
    async handleReconnectRecovery(statusText = 'WLED reconnected. Restoring current notes.') {
        if (!this.ensureConfigured()) return false;

        try {
            const ready = await this.ensureSolidMode();
            if (!ready) {
                this.markDisconnected('WLED unreachable. Retrying…');
                return false;
            }

            // First, force the strip fully dark so recovery never shows stale notes.
            const offFrame = this.makeOffHexFrame();
            await this.sendHexFrame(offFrame);

            // Match the proven "toggle away and back to WLED" recovery behavior:
            // clear transport dedupe state, mark connected, then trigger a normal
            // render pass from current app state (using cached playback state /
            // sustained visuals / held notes / last future preview) rather than
            // trying to synthesize a special reconnect frame.
            this.clearLastSignature();
            this.markConnected(statusText);

            requestAnimationFrame(() => {
                if (!this.ensureConfigured()) return;
                this.clearLastSignature();
                renderVirtualKeyboard();
            });

            return true;
        } catch (err) {
            console.warn('WLED reconnect recovery error', err);
            this.markDisconnected('WLED reconnect failed. Retrying…');
            return false;
        }
    },
    async forceClear() {
        const activeTransport = this.getActiveTransport();
        if (activeTransport === 'ddp') {
            try {
                await this.clearViaHelper({ transport: 'ddp', repeat: 2 });
                this.lastFrameSignature = '';
                this.pendingFrameSignature = '';
                this.pendingHexFrame = null;
                this.markConnected('WLED cleared.');
                return true;
            } catch (err) {
                console.warn('WLED helper clear error', err);
            }
        }
        const offFrame = this.makeOffHexFrame();
        return await this.forceSendHexFrame(offFrame, 'WLED cleared.');
    },
    async resendCurrentFrame({ preferCurrentTransport = false } = {}) {
        const currentFrame = this.frameToHexArray(LedEngine.frame);
        if (preferCurrentTransport) {
            this.clearLastSignature();
            await this.sendHexFrame(currentFrame);
            const activeTransport = this.getActiveTransport();
            const statusText = activeTransport === 'ddp'
                ? `WLED frame re-sent over DDP (${currentFrame.length} LEDs).`
                : `WLED frame re-sent over HTTP JSON (${currentFrame.length} LEDs).`;
            this.markConnected(statusText);
            return true;
        }
        return await this.forceSendHexFrame(currentFrame, `WLED frame re-sent (${currentFrame.length} LEDs).`);
    },
    setTestButtonState(isRunning) {
        const testBtn = document.getElementById('btn-test-wled');
        if (!testBtn) return;
        testBtn.textContent = isRunning ? 'Stop Test' : 'Test LED Strip';
    },
    async stopTestPattern({ restoreFrame = true, statusText = 'WLED test stopped.' } = {}) {
        if (!this.testPatternRunning && !restoreFrame) return;

        this.testPatternRunning = false;
        this.testPatternToken += 1;
        this.setTestButtonState(false);

        try {
            const offFrame = this.makeOffHexFrame();
            await this.forceSendHexFrame(offFrame, statusText);
        } catch (err) {
            console.warn('WLED test stop clear error', err);
        }

        if (restoreFrame) {
            this.clearLastSignature();
            LedEngine.renderOutputs();
        }
    },
    async testPattern() {
        if (this.testPatternRunning) {
            await this.stopTestPattern({ statusText: 'WLED test stopped.' });
            return;
        }

        if (!this.ensureConfigured()) {
            setWledStatus('Enter a WLED IP address first.');
            return;
        }

        const notes = buildChromaticTestNotes();
        const ledCount = Math.max(0, Number(LedEngine.frame.length) || 0);
        if (!ledCount || !notes.length) {
            setWledStatus('No playable LEDs configured to test.');
            return;
        }

        const original = LedEngine.frame.map(rgb => [...rgb]);
        const originalSignature = this.frameSignature(original);
        const runToken = ++this.testPatternToken;
        const stepMs = 45;
        const statusEvery = 8;
        this.testPatternRunning = true;
        this.setTestButtonState(true);

        try {
            const ready = await this.ensureSolidMode();
            if (!ready) {
                this.markDisconnected('WLED unreachable. Retrying…');
                return;
            }

            setWledStatus('Running WLED note test…');

            for (let index = 0; index < notes.length; index += 1) {
                const note = notes[index];
                if (!this.testPatternRunning || this.testPatternToken !== runToken) return;

                const ledIndex = LedEngine.keyToLed.get(note);
                const frame = Array.from({ length: ledCount }, () => '000000');
                if (Number.isInteger(ledIndex) && ledIndex >= 0 && ledIndex < ledCount) {
                    frame[ledIndex] = '666666';
                }

                const stepStartedAt = performance.now();
                await this.sendHexFrame(frame);
                this.lastFrameSignature = '';
                this.pendingFrameSignature = '';
                this.pendingHexFrame = null;

                if (index === 0 || index === notes.length - 1 || index % statusEvery === 0) {
                    this.markConnected(`WLED test note ${note} (${index + 1}/${notes.length}).`);
                }

                const totalElapsedMs = performance.now() - stepStartedAt;
                const remainingDelayMs = Math.max(0, stepMs - totalElapsedMs);
                if (remainingDelayMs > 0) {
                    await new Promise(resolve => setTimeout(resolve, remainingDelayMs));
                }
            }

            setWledStatus('WLED note test complete.');
        } catch (err) {
            console.warn('WLED test error', err);
            setWledStatus('WLED test failed.');
        } finally {
            const stillOwnsRun = this.testPatternToken === runToken;
            this.testPatternRunning = false;
            this.setTestButtonState(false);

            try {
                await this.sendHexFrame(this.makeOffHexFrame());
            } catch (err) {
                console.warn('WLED test cleanup clear error', err);
            }

            LedEngine.frame = original.map(rgb => [...rgb]);
            this.clearLastSignature();

            if (stillOwnsRun && this.frameSignature(original) === originalSignature) {
                LedEngine.renderOutputs();
            } else {
                this.clearLastSignature();
                renderVirtualKeyboard();
            }
        }
    }
};


