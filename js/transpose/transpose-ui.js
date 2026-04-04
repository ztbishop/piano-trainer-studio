// transpose-ui.js
// UI wiring for score transposition. Keeps toolbar interactions separate from render internals.
(function() {
    const panel = document.getElementById('transpose-popup');
    const sourceLabel = document.getElementById('transpose-current-key');
    const modeSelect = document.getElementById('transpose-mode');
    const targetKeySelect = document.getElementById('transpose-target-key');
    const semitoneInput = document.getElementById('transpose-semitones');
    const semitoneValue = document.getElementById('transpose-semitones-value');
    const updateKeySignatureCheckbox = document.getElementById('transpose-update-key-signature');
    const applyButton = document.getElementById('btn-transpose-apply');
    const resetButton = document.getElementById('btn-transpose-reset');
    const statusEl = document.getElementById('transpose-status');
    const modeRows = Array.from(document.querySelectorAll('[data-transpose-mode-row]'));

    function getDefaultState() {
        return {
            available: false,
            sourceKeyLabel: 'No score loaded',
            sourceKeyFound: false,
            mode: 'key',
            semitones: 0,
            targetKey: null,
            updateKeySignature: true,
            active: false,
            activeLabel: 'Original score',
            disableReason: 'Load a MusicXML-based score to enable transpose.'
        };
    }

    function ensureTransposeState() {
        if (typeof AppState === 'undefined') return getDefaultState();
        if (!AppState.transpose || typeof AppState.transpose !== 'object') {
            AppState.transpose = getDefaultState();
        }
        return AppState.transpose;
    }

    function setStatus(text, isError = false) {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.classList.toggle('is-error', !!isError);
    }

    function populateKeySelect() {
        if (!targetKeySelect || !window.TransposeEngine) return;
        const presets = window.TransposeEngine.getKeyPresets();
        targetKeySelect.innerHTML = presets.map(preset => `<option value="${preset.value}">${preset.label}</option>`).join('');
    }

    function syncModeRows() {
        const state = ensureTransposeState();
        modeRows.forEach(row => {
            row.classList.toggle('hidden', row.getAttribute('data-transpose-mode-row') !== state.mode);
        });
    }

    function syncUiFromState() {
        const state = ensureTransposeState();
        if (sourceLabel) sourceLabel.textContent = state.sourceKeyLabel || 'Unknown';
        if (modeSelect) modeSelect.value = state.mode || 'key';
        if (targetKeySelect && state.targetKey) targetKeySelect.value = state.targetKey;
        if (semitoneInput) semitoneInput.value = String(Number(state.semitones || 0));
        if (semitoneValue) semitoneValue.textContent = String(Number(state.semitones || 0));
        if (updateKeySignatureCheckbox) updateKeySignatureCheckbox.checked = state.updateKeySignature !== false;

        const enabled = !!state.available;
        if (modeSelect) modeSelect.disabled = !enabled;
        if (targetKeySelect) targetKeySelect.disabled = !enabled;
        if (semitoneInput) semitoneInput.disabled = !enabled;
        if (updateKeySignatureCheckbox) updateKeySignatureCheckbox.disabled = !enabled;
        if (applyButton) applyButton.disabled = !enabled;
        if (resetButton) resetButton.disabled = !enabled;

        syncModeRows();

        if (!enabled) {
            setStatus(state.disableReason || 'Load a MusicXML-based score to enable transpose.');
        } else if (state.active) {
            setStatus(`Applied: ${state.activeLabel || 'Transposed score'}`);
        } else {
            setStatus('Ready. Transpose is applied from the original source score each time. \nTanspose by Key Signature or by Semitones');
        }
    }

    function refreshAvailabilityFromCurrentScore() {
        const state = ensureTransposeState();
        const originalData = AppState.currentScoreOriginalData;
        const fallbackData = AppState.currentScoreData;
        const transposeSource = (window.TransposeEngine && window.TransposeEngine.isXmlString(originalData))
            ? originalData
            : ((window.TransposeEngine && window.TransposeEngine.isXmlString(fallbackData)) ? fallbackData : null);
        state.available = !!(window.TransposeEngine && transposeSource);
        if (!state.available) {
            state.sourceKeyLabel = AppState.currentScoreData ? 'Unavailable for this score' : 'No score loaded';
            state.sourceKeyFound = false;
            state.disableReason = AppState.currentScoreData
                ? 'Transpose works on XML, MusicXML, normalized MXL, and imported files that convert to MusicXML.'
                : 'Load a MusicXML-based score to enable transpose.';
            state.active = false;
            state.activeLabel = 'Original score';
            return state;
        }

        const detected = window.TransposeEngine.detectScoreKey(window.TransposeEngine.parseXml(transposeSource));
        state.sourceKeyLabel = detected.label || 'Unknown';
        state.sourceKeyFound = !!detected.found;
        state.disableReason = '';
        if (detected.found) {
            const inferredPreset = detected.presetValue ? window.TransposeEngine.getPresetByValue(detected.presetValue) : null;
            const hasValidTargetKey = !!window.TransposeEngine.getPresetByValue(state.targetKey);
            if (inferredPreset && (!state.targetKey || !hasValidTargetKey)) {
                state.targetKey = inferredPreset.value;
            }
        } else if (!window.TransposeEngine.getPresetByValue(state.targetKey)) {
            state.targetKey = 'sig-0';
        }
        return state;
    }

    function handleScoreLoaded() {
        const state = ensureTransposeState();
        Object.assign(state, getDefaultState());
        refreshAvailabilityFromCurrentScore();
        syncUiFromState();
    }

    async function applyTranspose() {
        const state = ensureTransposeState();
        refreshAvailabilityFromCurrentScore();
        if (!state.available) {
            syncUiFromState();
            return;
        }
        if (!window.TransposeEngine || typeof window.loadScoreIntoApp !== 'function') return;

        try {
            if (state.mode === 'key' && state.sourceKeyFound) {
                const selectedPreset = window.TransposeEngine.getPresetByValue(state.targetKey);
                const originalXml = AppState.currentScoreOriginalData;
                const detected = (window.TransposeEngine && window.TransposeEngine.isXmlString(originalXml))
                    ? window.TransposeEngine.detectScoreKey(window.TransposeEngine.parseXml(originalXml))
                    : null;
                if (selectedPreset && detected?.presetValue && selectedPreset.value === detected.presetValue) {
                    setStatus('Target key already matches the current key. Choose a different key or use semitones.', true);
                    return;
                }
            }

            const result = window.TransposeEngine.transposeXml(AppState.currentScoreOriginalData, {
                mode: state.mode,
                semitones: Number(state.semitones || 0),
                targetKey: state.targetKey,
                updateKeySignature: state.updateKeySignature !== false
            });

            const originalName = AppState.currentScoreOriginalFileName || AppState.currentScoreFileName || 'Untitled Score.musicxml';
            await window.loadScoreIntoApp(result.xmlString, {
                fileName: originalName.replace(/\.(mxl)$/i, '.musicxml'),
                fileType: 'musicxml',
                libraryScoreId: AppState.currentScoreLibraryId,
                title: AppState.currentScoreTitle,
                originalRawData: AppState.currentScoreOriginalData,
                originalFileName: AppState.currentScoreOriginalFileName || AppState.currentScoreFileName,
                originalFileType: AppState.currentScoreOriginalFileType || AppState.currentScoreFileType,
                skipTransposeReset: true
            });

            state.active = true;
            state.activeLabel = state.mode === 'key'
                ? `to ${result.targetKeyLabel}`
                : `${result.semitoneDelta > 0 ? '+' : ''}${result.semitoneDelta} semitones`;
            setStatus(`Applied: ${state.activeLabel}`);
            syncUiFromState();
        } catch (err) {
            console.error('Transpose apply failed', err);
            setStatus(err?.message || 'Could not transpose this score.', true);
        }
    }

    async function resetTranspose() {
        const state = ensureTransposeState();
        if (!AppState.currentScoreOriginalData || typeof window.loadScoreIntoApp !== 'function') {
            handleScoreLoaded();
            return;
        }

        try {
            await window.loadScoreIntoApp(AppState.currentScoreOriginalData, {
                fileName: AppState.currentScoreOriginalFileName || AppState.currentScoreFileName || 'Untitled Score.musicxml',
                fileType: AppState.currentScoreOriginalFileType || AppState.currentScoreFileType || 'musicxml',
                libraryScoreId: AppState.currentScoreLibraryId,
                title: AppState.currentScoreTitle,
                originalRawData: AppState.currentScoreOriginalData,
                originalFileName: AppState.currentScoreOriginalFileName || AppState.currentScoreFileName,
                originalFileType: AppState.currentScoreOriginalFileType || AppState.currentScoreFileType,
                skipTransposeReset: true
            });
            state.active = false;
            state.activeLabel = 'Original score';
            state.semitones = 0;
            refreshAvailabilityFromCurrentScore();
            const originalXml = AppState.currentScoreOriginalData;
            const detected = (window.TransposeEngine && window.TransposeEngine.isXmlString(originalXml))
                ? window.TransposeEngine.detectScoreKey(window.TransposeEngine.parseXml(originalXml))
                : null;
            const inferredPreset = detected?.presetValue ? window.TransposeEngine.getPresetByValue(detected.presetValue) : null;
            state.targetKey = inferredPreset?.value || 'sig-0';
            syncUiFromState();
        } catch (err) {
            console.error('Transpose reset failed', err);
            setStatus(err?.message || 'Could not reset transpose.', true);
        }
    }

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            const state = ensureTransposeState();
            state.mode = modeSelect.value === 'semitone' ? 'semitone' : 'key';
            syncUiFromState();
        });
    }

    if (targetKeySelect) {
        targetKeySelect.addEventListener('change', () => {
            const state = ensureTransposeState();
            state.targetKey = targetKeySelect.value;
        });
    }

    if (semitoneInput) {
        semitoneInput.addEventListener('input', () => {
            const state = ensureTransposeState();
            state.semitones = Number(semitoneInput.value || 0);
            if (semitoneValue) semitoneValue.textContent = String(state.semitones);
        });
    }

    if (updateKeySignatureCheckbox) {
        updateKeySignatureCheckbox.addEventListener('change', () => {
            const state = ensureTransposeState();
            state.updateKeySignature = !!updateKeySignatureCheckbox.checked;
        });
    }

    if (applyButton) applyButton.addEventListener('click', applyTranspose);
    if (resetButton) resetButton.addEventListener('click', resetTranspose);

    populateKeySelect();
    syncUiFromState();

    window.TransposeUI = {
        ensureTransposeState,
        syncUiFromState,
        refreshAvailabilityFromCurrentScore,
        handleScoreLoaded,
        applyTranspose,
        resetTranspose,
        getPanel: () => panel
    };
})();


