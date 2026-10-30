// scores-ui.js
// UI for displaying and selecting available scores.
// Reads search metadata; rendering and playback stay in the existing score-loading path.

// ⚠️ WARNING:
// Preserve current score-opening behavior from the active baseline only.
// Do not reintroduce older score browser or open-score logic during future edits.

// Metadata is a read-only session cache; never rewrite old library titles or MXL payloads.
const scoreSearchTitles = new Map();
let scoresDrawerRefreshGeneration = 0;
let scoreLibraryBusy = false;
let currentScoreStatusGeneration = 0;
const libraryDisabledControls = new Map();

function setLibraryStatus(message) {
    const status = document.getElementById('scores-status');
    if (status) status.textContent = message;
}

function syncLibraryBusyControls() {
    const panel = document.getElementById('scores-panel');
    if (!panel) return;
    panel.setAttribute('aria-busy', String(scoreLibraryBusy));
    if (scoreLibraryBusy) {
        panel.querySelectorAll('button, input, select').forEach(control => {
            if (!libraryDisabledControls.has(control)) libraryDisabledControls.set(control, control.disabled);
            control.disabled = true;
        });
    } else {
        libraryDisabledControls.forEach((disabled, control) => { control.disabled = disabled; });
        libraryDisabledControls.clear();
    }
}

async function runLibraryOperation(action) {
    if (scoreLibraryBusy) return;
    const previousFocus = document.activeElement;
    scoreLibraryBusy = true;
    syncLibraryBusyControls();
    try { await action(); }
    catch (error) { console.error('Library operation failed', error); setLibraryStatus(error?.message || 'Library operation failed.'); }
    finally {
        scoreLibraryBusy = false;
        syncLibraryBusyControls();
        await updateScoresActionButtonsState();
        if (previousFocus?.isConnected && document.activeElement === document.body) {
            const target = previousFocus.disabled ? document.getElementById('btn-scores-save-copy') : previousFocus;
            if (target && !target.disabled && !target.hidden) target.focus();
        }
    }
}

// A native modal dialog supplies focus containment, Escape, and focus restoration.
function requestLibraryTitle(defaultTitle, copy) {
    return new Promise(resolve => {
        const dialog = document.createElement('dialog');
        dialog.className = 'scores-save-dialog';
        const form = document.createElement('form');
        form.method = 'dialog';
        const heading = document.createElement('h3');
        heading.id = 'scores-save-heading';
        heading.textContent = copy ? 'Save a copy' : 'Save to Library';
        dialog.setAttribute('aria-labelledby', heading.id);
        const label = document.createElement('label');
        label.textContent = 'Score title';
        const input = document.createElement('input');
        input.value = defaultTitle;
        input.required = true;
        label.appendChild(input);
        const cancel = document.createElement('button');
        cancel.type = 'button'; cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => dialog.close());
        const save = document.createElement('button');
        save.type = 'submit'; save.textContent = copy ? 'Save copy' : 'Save';
        let result = null;
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!input.value.trim()) { input.focus(); return; }
            result = input.value.trim(); dialog.close();
        });
        dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true });
        form.append(heading, label, cancel, save); dialog.appendChild(form);
        document.body.appendChild(dialog); dialog.showModal(); input.select();
    });
}

async function cacheScoreSearchTitle(score) {
    // The drawer can initialize before the core classic script has loaded.
    // Do not cache that temporary lack of an MXL extractor as missing metadata.
    if (score.fileType === 'mxl' && typeof extractMusicXmlFromMxl !== 'function') return;
    const cached = scoreSearchTitles.get(score.id);
    if (cached && cached.updatedAt === score.updatedAt) return;
    let title = '';
    try {
        const xml = score.fileType === 'mxl' ? await extractMusicXmlFromMxl(score.rawData) : score.rawData;
        if (typeof xml === 'string') {
            const doc = new DOMParser().parseFromString(xml, 'application/xml');
            if (!doc.querySelector('parsererror')) {
                title = ['work-title', 'movement-title'].map(tag => doc.getElementsByTagName(tag)[0]?.textContent || '').join(' ').trim();
            }
        }
    } catch (_) { /* A failed metadata read must not prevent opening the original score. */ }
    scoreSearchTitles.set(score.id, { updatedAt: score.updatedAt, title });
}

function downloadLibraryData(data, fileName, type) {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = String(fileName || 'score.musicxml').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    link.addEventListener('click', event => event.stopPropagation());
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function promptForLibraryFolderChoice({ allowAll = false, title = 'Choose a folder:', folders = null } = {}) {
    const availableFolders = Array.isArray(folders) ? folders : await ScoreLibrary.getAllFolders();
    const choices = [];

    if (allowAll) choices.push({ value: '__all__', label: 'All Scores' });
    choices.push({ value: null, label: 'Unfiled' });
    availableFolders.forEach(folder => {
        choices.push({ value: folder.id, label: folder.name || 'New Folder' });
    });

    return new Promise((resolve) => {
        const overlay = document.createElement('dialog');
        overlay.className = 'scores-folder-dialog';
        overlay.setAttribute('aria-label', title);

        const panel = document.createElement('div');
        panel.className = 'scores-folder-picker-panel';
        overlay.appendChild(panel);

        const heading = document.createElement('div');
        heading.className = 'scores-folder-picker-title';
        heading.textContent = title;
        panel.appendChild(heading);

        const list = document.createElement('div');
        list.className = 'scores-folder-picker-list';
        panel.appendChild(list);

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                finish('__cancel__');
            }
        };

        const finish = (value) => {
            document.removeEventListener('keydown', onKeyDown, true);
            overlay.close();
            overlay.remove();
            resolve(value);
        };

        choices.forEach(choice => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'scores-folder-picker-option';
            btn.textContent = choice.label;
            btn.addEventListener('click', () => finish(choice.value));
            list.appendChild(btn);
        });

        const footer = document.createElement('div');
        footer.className = 'scores-folder-picker-footer';
        panel.appendChild(footer);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'scores-folder-picker-cancel';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => finish('__cancel__'));
        footer.appendChild(cancelBtn);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) finish('__cancel__');
        });

        document.addEventListener('keydown', onKeyDown, true);
        document.body.appendChild(overlay);
        overlay.addEventListener('cancel', event => { event.preventDefault(); finish('__cancel__'); });
        overlay.showModal();
    });
}



function closeScoresDrawer() {
    const panel = document.getElementById('scores-panel');
    if (!panel) return;
    if (window.ToolbarUI && typeof window.ToolbarUI.closeToolbarPanel === 'function') {
        window.ToolbarUI.closeToolbarPanel(panel);
        return;
    }
    panel.classList.remove('is-open', 'is-closing');
    panel.classList.add('hidden');
}

function openScoresImportPicker() {
    const input = document.getElementById('score-import-input');
    if (!input) return;
    input.value = '';
    input.click();
}

function ensureScoresDrawerOpen() {
    const panel = document.getElementById('scores-panel');
    if (!panel) return;
    if (window.ToolbarUI && typeof window.ToolbarUI.showToolbarPanel === 'function') {
        window.ToolbarUI.showToolbarPanel(panel);
        return;
    }
    panel.classList.remove('hidden', 'is-closing');
    requestAnimationFrame(() => {
        panel.classList.add('is-open');
    });
}

async function updateScoresActionButtonsState(scores = null) {
    const generation = ++currentScoreStatusGeneration;
    const rawData = AppState.currentScoreData;
    const save = document.getElementById('btn-scores-save-current');
    const copy = document.getElementById('btn-scores-save-copy');
    const title = document.getElementById('scores-current-title');
    const status = document.getElementById('scores-current-state');
    if (!save) return;
    save.disabled = scoreLibraryBusy || rawData == null;
    if (copy) copy.disabled = scoreLibraryBusy || rawData == null;
    if (title) title.textContent = rawData == null ? 'No score loaded' : AppState.currentScoreTitle || AppState.currentScoreFileName;
    try {
        const savedScores = scores || (rawData == null ? [] : await ScoreLibrary.getAllScores());
        const current = savedScores.find(score => score.id === AppState.currentScoreLibraryId && ScoreLibrary.sameScoreData(score.rawData, rawData));
        const match = current || (rawData == null ? null : await ScoreLibrary.findMatchingScore(rawData, savedScores));
        const demo = rawData == null || match ? null : (await ScoreLibrary.getDemoScores().catch(() => [])).find(item => ScoreLibrary.sameScoreData(item.rawData, rawData));
        if (generation !== currentScoreStatusGeneration || rawData !== AppState.currentScoreData) return;
        if (copy) copy.hidden = !match;
        if (title && match) title.textContent = match.title;
        save.hidden = !!match;
        save.textContent = 'Save to Library';
        save.disabled = scoreLibraryBusy || rawData == null || !!match;
        save.title = match ? 'This exact score is already saved. Use Save a copy for another entry.' : 'Save the current score without replacing an existing entry.';
        if (status) status.textContent = rawData == null ? 'Open a file or choose a demo to begin.' : match ? `Saved as ${match.title}` : demo ? 'Demo · not saved to library' : 'Not saved to library';
    } catch (error) {
        if (generation !== currentScoreStatusGeneration) return;
        if (status) status.textContent = 'Could not check library status.';
    }
}

function getFolderLibrarySelectionSet() {
    return new Set((AppState.scoreLibrarySelectedFolderIds || []).filter(Boolean));
}

function setFolderLibrarySelection(folderIds) {
    AppState.scoreLibrarySelectedFolderIds = Array.from(new Set((folderIds || []).filter(Boolean)));
}

function clearFolderLibrarySelection() {
    AppState.scoreLibrarySelectedFolderIds = [];
}

function isFolderLibraryManageMode() {
    return !!AppState.scoreLibraryFolderManageMode;
}

function setFolderLibraryManageMode(enabled) {
    AppState.scoreLibraryFolderManageMode = !!enabled;
    if (!AppState.scoreLibraryFolderManageMode) {
        clearFolderLibrarySelection();
    }
}

function toggleFolderLibrarySelection(folderId) {
    const next = getFolderLibrarySelectionSet();
    if (next.has(folderId)) next.delete(folderId);
    else next.add(folderId);
    setFolderLibrarySelection(Array.from(next));
}

function isSystemFolderOption(folderId) {
    return folderId === '__demos__' || folderId === '__all__' || folderId === '__unfiled__' || folderId == null;
}

function buildActionMenu({ titleText = '', items = [] } = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'scores-action-menu-overlay';
        overlay.addEventListener('click', (e) => e.stopPropagation());

        const panel = document.createElement('div');
        panel.className = 'scores-action-menu-panel';
        panel.addEventListener('click', (e) => e.stopPropagation());
        overlay.appendChild(panel);

        const title = document.createElement('div');
        title.className = 'scores-action-menu-title';
        title.textContent = titleText;
        panel.appendChild(title);

        const actions = document.createElement('div');
        actions.className = 'scores-action-menu-actions';
        panel.appendChild(actions);

        const finish = (value) => {
            overlay.remove();
            document.removeEventListener('keydown', onKeyDown, true);
            resolve(value);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') finish('__cancel__');
        };

        items.forEach((item) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `scores-action-menu-button${item.danger ? ' scores-action-menu-button-danger' : ''}`;
            btn.textContent = item.label;
            btn.addEventListener('click', () => finish(item.value));
            actions.appendChild(btn);
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) finish('__cancel__');
        });

        document.addEventListener('keydown', onKeyDown, true);
        document.body.appendChild(overlay);
    });
}

function showFolderRowActionMenu(folder) {
    return buildActionMenu({
        titleText: String(folder?.name || 'New Folder').trim() || 'New Folder',
        items: [
            { value: 'rename', label: 'Rename' },
            { value: 'export', label: 'Export folder' },
            { value: 'delete', label: 'Delete', danger: true }
        ]
    });
}

function createFoldersLibraryToolbar({ folders = [], activeFolderId = '__all__' } = {}) {
    const toolbar = document.createElement('div');
    const realFolders = (folders || []).filter(folder => folder && folder.id);
    const manageMode = isFolderLibraryManageMode();
    toolbar.className = `scores-library-toolbar${manageMode ? ' is-manage-mode' : ''}`;

    const info = document.createElement('div');
    info.className = 'scores-library-toolbar-info';
    toolbar.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'scores-library-toolbar-actions';
    toolbar.appendChild(actions);
    const selectedSet = getFolderLibrarySelectionSet();
    const selectedCount = selectedSet.size;

    if (!manageMode) {
        info.textContent = 'Folders';

        const newFolderBtn = document.createElement('button');
        newFolderBtn.type = 'button';
        newFolderBtn.className = 'scores-toolbar-button';
        newFolderBtn.textContent = 'New Folder';
        newFolderBtn.addEventListener('click', createLibraryFolder);
        actions.appendChild(newFolderBtn);

        const manageBtn = document.createElement('button');
        manageBtn.type = 'button';
        manageBtn.className = 'scores-toolbar-button';
        manageBtn.textContent = 'Manage';
        manageBtn.disabled = realFolders.length === 0;
        manageBtn.addEventListener('click', async () => {
            setFolderLibraryManageMode(true);
            await refreshScoresDrawer();
        });
        actions.appendChild(manageBtn);
        return toolbar;
    }

    info.textContent = selectedCount > 0
        ? `${selectedCount} selected`
        : 'Select folders to delete';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'scores-toolbar-button';
    const allVisibleSelected = realFolders.length > 0 && realFolders.every(folder => selectedSet.has(folder.id));
    selectAllBtn.textContent = allVisibleSelected ? 'Deselect All' : 'Select All';
    selectAllBtn.addEventListener('click', async () => {
        if (allVisibleSelected) {
            clearFolderLibrarySelection();
        } else {
            setFolderLibrarySelection(realFolders.map(folder => folder.id));
        }
        await refreshScoresDrawer();
    });
    actions.appendChild(selectAllBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'scores-toolbar-button scores-toolbar-button-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = selectedCount === 0;
    deleteBtn.addEventListener('click', async () => {
        const selectedIds = Array.from(getFolderLibrarySelectionSet());
        if (!selectedIds.length) return;

        const selectedFolders = realFolders.filter(folder => selectedIds.includes(folder.id));
        const selectedScores = (await ScoreLibrary.getAllScores()).filter(score => selectedIds.includes(score.folderId));
        const confirmed = window.confirm(
            `Delete ${selectedFolders.length} selected folder${selectedFolders.length === 1 ? '' : 's'}? ` +
            `Any scores inside ${selectedFolders.length === 1 ? 'it will' : 'them will'} also be deleted.`
        );
        if (!confirmed) return;

        try {
            await ScoreLibrary.deleteFoldersAndScores(selectedIds);
            if (AppState.currentScoreLibraryId && selectedScores.some(score => score.id === AppState.currentScoreLibraryId)) {
                AppState.currentScoreLibraryId = null;
            }
            if (selectedIds.includes(AppState.scoreLibrarySelectedFolderId)) {
                AppState.scoreLibrarySelectedFolderId = '__all__';
            }
            setFolderLibraryManageMode(false);
            await refreshScoresDrawer();
        } catch (err) {
            console.error('Could not delete selected folders', err);
            window.alert(err?.message || 'Could not delete the selected folders.');
        }
    });
    actions.appendChild(deleteBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'scores-toolbar-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', async () => {
        setFolderLibraryManageMode(false);
        await refreshScoresDrawer();
    });
    actions.appendChild(cancelBtn);

    return toolbar;
}

function createFolderListRow(option, { activeFolderId = '__all__', folders = [], showQuickAction = true } = {}) {
    const isManageMode = isFolderLibraryManageMode();
    const isSystem = isSystemFolderOption(option.value);
    const isActive = String(activeFolderId) === String(option.value);

    if (isManageMode && !isSystem) {
        const selectedSet = getFolderLibrarySelectionSet();
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'scores-folder-list-item scores-manage-row-button';
        row.setAttribute('aria-pressed', selectedSet.has(option.value) ? 'true' : 'false');
        if (selectedSet.has(option.value)) row.classList.add('is-selected');

        const indicator = document.createElement('span');
        indicator.className = 'scores-select-indicator';
        indicator.textContent = selectedSet.has(option.value) ? '✓' : '';
        row.appendChild(indicator);

        const label = document.createElement('span');
        label.textContent = option.label;
        row.appendChild(label);

        row.addEventListener('click', async () => {
            toggleFolderLibrarySelection(option.value);
            await refreshScoresDrawer();
        });

        return row;
    }

    const row = document.createElement('div');
    row.className = 'scores-item-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scores-folder-list-item';
    if (isActive) btn.classList.add('is-active');
    btn.textContent = option.label;
    btn.addEventListener('click', async () => {
        AppState.scoreLibrarySelectedFolderId = option.value;
        setScoreLibraryManageMode(false);
        AppState.scoreLibraryView = 'scores';
        await refreshScoresDrawer();
    });
    row.appendChild(btn);

    if (!showQuickAction || isSystem || isManageMode) {
        return row;
    }

    const folder = (folders || []).find(item => item.id === option.value);
    if (!folder) return row;

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'scores-row-action-button';
    actionBtn.setAttribute('aria-label', `Actions for folder ${option.label}`);
    actionBtn.textContent = '⋯';
    actionBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const action = await showFolderRowActionMenu(folder);
        if (action === 'export') {
            try {
                downloadLibraryData(JSON.stringify(await ScoreLibrary.exportBackup(folder.id), null, 2), folder.name + '.json', 'application/json');
            } catch (error) { window.alert(error.message || 'Could not export folder.'); }
            return;
        }
        if (action === 'rename') {
            const nextName = window.prompt('Rename folder:', folder.name || 'New Folder');
            if (nextName == null) return;
            try {
                await ScoreLibrary.renameFolder(folder.id, nextName);
                await refreshScoresDrawer();
            } catch (err) {
                console.error('Could not rename folder', err);
                window.alert(err?.message || 'Could not rename that folder.');
            }
            return;
        }

        if (action === 'delete') {
            const folderScores = (await ScoreLibrary.getAllScores()).filter(score => score.folderId === folder.id);
            const confirmed = window.confirm(
                `Delete folder "${folder.name || 'New Folder'}"? ` +
                `${folderScores.length ? `This will also delete ${folderScores.length} score${folderScores.length === 1 ? '' : 's'} inside it.` : 'This cannot be undone.'}`
            );
            if (!confirmed) return;
            try {
                await ScoreLibrary.deleteFolderAndScores(folder.id);
                if (AppState.currentScoreLibraryId && folderScores.some(score => score.id === AppState.currentScoreLibraryId)) {
                    AppState.currentScoreLibraryId = null;
                }
                if (AppState.scoreLibrarySelectedFolderId === folder.id) {
                    AppState.scoreLibrarySelectedFolderId = '__all__';
                }
                await refreshScoresDrawer();
            } catch (err) {
                console.error('Could not delete folder', err);
                window.alert(err?.message || 'Could not delete that folder.');
            }
        }
    });
    row.appendChild(actionBtn);

    return row;
}


function normalizeComparableScoreName(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\.(musicxml|xml|mxl)$/i, '')
        .replace(/[^a-z0-9]+/g, '');
}

function shouldShowScoreFileName(title, fileName) {
    const normalizedTitle = normalizeComparableScoreName(title);
    const normalizedFile = normalizeComparableScoreName(fileName);

    if (!normalizedFile) return false;
    if (!normalizedTitle) return true;
    if (normalizedTitle === normalizedFile) return false;
    if (normalizedTitle.startsWith(normalizedFile) || normalizedFile.startsWith(normalizedTitle)) return false;

    return true;
}

function formatScorePaneSummary(folderId, folders, scoreCount) {
    const countLabel = `${scoreCount} score${scoreCount === 1 ? '' : 's'}`;
    const folderLabel = getScoreLibraryFolderLabel(folderId, folders);
    return `${countLabel} • ${folderLabel}`;
}

function getScoreLibrarySelectionSet() {
    return new Set((AppState.scoreLibrarySelectedScoreIds || []).filter(Boolean));
}

function setScoreLibrarySelection(scoreIds) {
    AppState.scoreLibrarySelectedScoreIds = Array.from(new Set((scoreIds || []).filter(Boolean)));
}

function clearScoreLibrarySelection() {
    AppState.scoreLibrarySelectedScoreIds = [];
}

function isScoreLibraryManageMode() {
    return !!AppState.scoreLibraryManageMode;
}

function setScoreLibraryManageMode(enabled) {
    AppState.scoreLibraryManageMode = !!enabled;
    if (!AppState.scoreLibraryManageMode) {
        clearScoreLibrarySelection();
    }
}

function toggleScoreLibrarySelection(scoreId) {
    const next = getScoreLibrarySelectionSet();
    if (next.has(scoreId)) next.delete(scoreId);
    else next.add(scoreId);
    setScoreLibrarySelection(Array.from(next));
}

function getFilteredLibraryScores(scores, activeFolderId) {
    return (scores || []).filter(score => {
        const query = String(AppState.scoreLibrarySearch || '').trim().toLowerCase();
        if (![score.title, score.fileName, scoreSearchTitles.get(score.id)?.title].join(' ').toLowerCase().includes(query)) return false;
        if (activeFolderId === '__all__') return !score.isDemo;
        if (activeFolderId === '__unfiled__' || activeFolderId == null) return !score.folderId;
        return score.folderId === activeFolderId;
    });
}

function createScoresLibraryToolbar({ filteredScores = [], folders = [], activeFolderId = '__all__' } = {}) {
    const toolbar = document.createElement('div');
    const manageMode = isScoreLibraryManageMode();
    toolbar.className = `scores-library-toolbar${manageMode ? ' is-manage-mode' : ''}`;

    const info = document.createElement('div');
    info.className = 'scores-library-toolbar-info';
    toolbar.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'scores-library-toolbar-actions';
    toolbar.appendChild(actions);
    const selectedSet = getScoreLibrarySelectionSet();
    const selectedCount = selectedSet.size;

    if (!manageMode) {
        info.textContent = '';

        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'scores-search';
        search.placeholder = 'Search title or filename';
        search.setAttribute('aria-label', search.placeholder);
        search.value = AppState.scoreLibrarySearch || '';
        let searchTimer;
        search.addEventListener('input', async () => {
            AppState.scoreLibrarySearch = search.value;
            setScoreLibrarySelection([]);
            clearTimeout(searchTimer);
            searchTimer = setTimeout(async () => {
                const focused = document.activeElement === search;
                const start = search.selectionStart, end = search.selectionEnd;
                await refreshScoresDrawer();
                const replacement = document.querySelector('.scores-search');
                if (focused && replacement) {
                    replacement.focus();
                    replacement.setSelectionRange(start, end);
                }
            }, 120);
        });
        actions.appendChild(search);
        if (activeFolderId === '__demos__') return toolbar;
        const addFilesBtn = document.createElement('button');
        addFilesBtn.type = 'button';
        addFilesBtn.className = 'scores-toolbar-button';
        addFilesBtn.textContent = 'Add File(s)';
        addFilesBtn.addEventListener('click', openScoresImportPicker);
        actions.appendChild(addFilesBtn);

        const manageBtn = document.createElement('button');
        manageBtn.type = 'button';
        manageBtn.className = 'scores-toolbar-button';
        manageBtn.textContent = 'Manage';
        manageBtn.addEventListener('click', async () => {
            setScoreLibraryManageMode(true);
            await refreshScoresDrawer();
        });
        actions.appendChild(manageBtn);
        return toolbar;
    }

    info.textContent = selectedCount > 0
        ? `${selectedCount} selected`
        : 'Select scores to move or delete';

    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.className = 'scores-toolbar-button';
    const allVisibleSelected = filteredScores.length > 0 && filteredScores.every(score => selectedSet.has(score.id));
    selectAllBtn.textContent = allVisibleSelected ? 'Deselect All' : 'Select All';
    selectAllBtn.addEventListener('click', async () => {
        if (allVisibleSelected) {
            const next = getScoreLibrarySelectionSet();
            filteredScores.forEach(score => next.delete(score.id));
            setScoreLibrarySelection(Array.from(next));
        } else {
            const next = getScoreLibrarySelectionSet();
            filteredScores.forEach(score => next.add(score.id));
            setScoreLibrarySelection(Array.from(next));
        }
        await refreshScoresDrawer();
    });
    actions.appendChild(selectAllBtn);

    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.className = 'scores-toolbar-button';
    moveBtn.textContent = 'Move';
    moveBtn.disabled = selectedCount === 0;
    moveBtn.addEventListener('click', async () => {
        const selectedIds = Array.from(getScoreLibrarySelectionSet());
        if (!selectedIds.length) return;
        const selectedFolderId = await promptForLibraryFolderChoice({
            title: `Move ${selectedIds.length} selected score${selectedIds.length === 1 ? '' : 's'} to which folder?`,
            folders
        });
        if (selectedFolderId === '__cancel__') return;
        try {
            await ScoreLibrary.moveScoresToFolder(selectedIds, selectedFolderId);
            setScoreLibraryManageMode(false);
            AppState.scoreLibrarySelectedFolderId = selectedFolderId ?? '__unfiled__';
            AppState.scoreLibraryView = window.innerWidth >= 900 ? 'folders' : 'scores';
            if (AppState.currentScoreLibraryId && selectedIds.includes(AppState.currentScoreLibraryId)) {
                const moved = await ScoreLibrary.getScoreById(AppState.currentScoreLibraryId);
                if (moved) AppState.currentScoreTitle = moved.title || AppState.currentScoreTitle;
            }
            await refreshScoresDrawer();
        } catch (err) {
            console.error('Could not move selected scores', err);
            window.alert('Could not move the selected scores.');
        }
    });
    actions.appendChild(moveBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'scores-toolbar-button scores-toolbar-button-danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = selectedCount === 0;
    deleteBtn.addEventListener('click', async () => {
        const selectedIds = Array.from(getScoreLibrarySelectionSet());
        if (!selectedIds.length) return;
        const confirmed = window.confirm(`Delete ${selectedIds.length} selected score${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`);
        if (!confirmed) return;
        try {
            await ScoreLibrary.deleteScores(selectedIds);
            if (AppState.currentScoreLibraryId && selectedIds.includes(AppState.currentScoreLibraryId)) {
                AppState.currentScoreLibraryId = null;
            }
            setScoreLibraryManageMode(false);
            await refreshScoresDrawer();
        } catch (err) {
            console.error('Could not delete selected scores', err);
            window.alert('Could not delete the selected scores.');
        }
    });
    actions.appendChild(deleteBtn);

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'scores-toolbar-button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', async () => {
        setScoreLibraryManageMode(false);
        await refreshScoresDrawer();
    });
    actions.appendChild(cancelBtn);

    return toolbar;
}



function showScoreRowActionMenu(score) {
    return buildActionMenu({
        titleText: String(score?.title || getScoreDisplayTitle(score?.fileName || '') || 'Untitled Score').trim() || 'Untitled Score',
        items: [
            { value: 'rename', label: 'Rename' },
            { value: 'move', label: 'Move' },
            { value: 'download', label: score.fileType === 'mxl' ? 'Download saved MXL' : 'Download saved MusicXML' },
            { value: 'delete', label: 'Delete', danger: true }
        ]
    });
}


function createScoreRow(score, { compact = false, manageMode = false } = {}) {
    const resolvedTitle = String(score.title || getScoreDisplayTitle(score.fileName || '') || 'Untitled Score').trim() || 'Untitled Score';
    const resolvedFileName = String(score.fileName || '').trim();
    const showFileNameMeta = shouldShowScoreFileName(resolvedTitle, resolvedFileName);
    const metaText = showFileNameMeta ? resolvedFileName : '';

    const buildRowContent = ({ includeLoadedBadge = false } = {}) => {
        const content = document.createElement('div');
        content.className = 'scores-item-content';

        const title = document.createElement('div');
        title.className = 'scores-item-title';
        title.textContent = resolvedTitle;
        content.appendChild(title);

        if (metaText) {
            const meta = document.createElement('div');
            meta.className = 'scores-item-meta';
            meta.textContent = metaText;
            content.appendChild(meta);
        }

        if (includeLoadedBadge) {
            const badge = document.createElement('div');
            badge.className = 'scores-item-badge';
            badge.textContent = 'Loaded';
            content.appendChild(badge);
        }

        return content;
    };

    if (manageMode && !score.isDemo) {
        const selectedSet = getScoreLibrarySelectionSet();
        const row = document.createElement('button');
        row.type = 'button';
        row.className = `${compact ? 'scores-item-button is-compact' : 'scores-item-button'} scores-manage-row-button`;
        row.setAttribute('aria-pressed', selectedSet.has(score.id) ? 'true' : 'false');
        if (selectedSet.has(score.id)) row.classList.add('is-selected');

        const indicator = document.createElement('span');
        indicator.className = 'scores-select-indicator';
        indicator.textContent = selectedSet.has(score.id) ? '✓' : '';
        row.appendChild(indicator);
        row.appendChild(buildRowContent());

        row.addEventListener('click', async () => {
            toggleScoreLibrarySelection(score.id);
            await refreshScoresDrawer();
        });

        return row;
    }

    const row = document.createElement('div');
    row.className = 'scores-item-row';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = compact ? 'scores-item-button is-compact' : 'scores-item-button';
    const isLoaded = !!(AppState.currentScoreLibraryId && score.id === AppState.currentScoreLibraryId);
    if (isLoaded) {
        button.classList.add('is-loaded');
    }
    button.appendChild(buildRowContent({ includeLoadedBadge: isLoaded }));

    button.addEventListener('click', async () => {
        try {
            const fullScore = score.isDemo ? score : await ScoreLibrary.getScoreById(score.id);
            if (!fullScore) return;
            await loadScoreIntoApp(fullScore.rawData, {
                fileName: fullScore.fileName,
                fileType: fullScore.fileType,
                libraryScoreId: score.isDemo ? null : fullScore.id,
                title: fullScore.title
            });
            closeScoresDrawer();
        } catch (err) {
            console.error('Could not open library score', err);
        }
    });

    row.appendChild(button);
    if (score.isDemo) return row;

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'scores-row-action-button';
    actionBtn.setAttribute('aria-label', `Actions for ${resolvedTitle}`);
    actionBtn.textContent = '⋯';
    actionBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const action = await showScoreRowActionMenu(score);
        if (action === 'download') {
            try {
                const saved = await ScoreLibrary.getScoreById(score.id);
                if (!saved) throw new Error('Score no longer exists.');
                downloadLibraryData(saved.rawData, saved.fileName, saved.fileType === 'mxl' ? 'application/vnd.recordare.musicxml' : 'application/vnd.recordare.musicxml+xml');
            } catch (error) { window.alert(error.message || 'Could not download score.'); }
            return;
        }
        if (action === 'rename') {
            const nextTitle = window.prompt('Rename score:', resolvedTitle);
            if (nextTitle == null) return;
            try {
                await ScoreLibrary.renameScore(score.id, nextTitle);
                await refreshScoresDrawer();
            } catch (err) {
                console.error('Could not rename score', err);
                window.alert(err?.message || 'Could not rename that score.');
            }
            return;
        }

        if (action === 'move') {
            try {
                const folders = await ScoreLibrary.getAllFolders();
                const selectedFolderId = await promptForLibraryFolderChoice({
                    title: `Move "${resolvedTitle}" to which folder?`,
                    folders
                });
                if (selectedFolderId === '__cancel__') return;

                await ScoreLibrary.moveScoresToFolder([score.id], selectedFolderId);
                AppState.scoreLibrarySelectedFolderId = selectedFolderId ?? '__unfiled__';
                await refreshScoresDrawer();
            } catch (err) {
                console.error('Could not move score', err);
                window.alert(err?.message || 'Could not move that score.');
            }
            return;
        }

        if (action === 'delete') {
            const confirmed = window.confirm(`Delete score "${resolvedTitle}"?`);
            if (!confirmed) return;
            try {
                await ScoreLibrary.deleteScores([score.id]);
                if (AppState.currentScoreLibraryId === score.id) {
                    AppState.currentScoreLibraryId = null;
                }
                await refreshScoresDrawer();
            } catch (err) {
                console.error('Could not delete score', err);
                window.alert(err?.message || 'Could not delete that score.');
            }
        }
    });
    row.appendChild(actionBtn);

    return row;
}

async function refreshScoresDrawer() {
    const generation = ++scoresDrawerRefreshGeneration;
    const libraryList = document.getElementById('scores-library-list');
    if (!libraryList) return;

    try {
        await ScoreLibrary.init();
        const [folders, scores] = await Promise.all([
            ScoreLibrary.getAllFolders(),
            ScoreLibrary.getAllScores()
        ]);

        await updateScoresActionButtonsState(scores);
        const validFolderIds = new Set(['__all__', '__unfiled__', '__demos__', ...folders.map(folder => folder.id)]);
        if (!validFolderIds.has(AppState.scoreLibrarySelectedFolderId)) {
            AppState.scoreLibrarySelectedFolderId = '__all__';
        }
        if (!['folders', 'scores'].includes(AppState.scoreLibraryView)) {
            AppState.scoreLibraryView = 'folders';
        }

        const isSplitView = window.innerWidth >= 900;
        const filterOptions = [
            { value: '__all__', label: 'All Scores' },
            { value: '__unfiled__', label: 'Unfiled' },
            ...folders.map(folder => ({ value: folder.id, label: folder.name || 'New Folder' })),
            { value: '__demos__', label: 'Demo Scores' }
        ];
        const activeFolderId = AppState.scoreLibrarySelectedFolderId;

        const displayedScores = activeFolderId === '__demos__' ? await ScoreLibrary.getDemoScores() : scores;
        await Promise.all(displayedScores.map(cacheScoreSearchTitle));
        if (generation !== scoresDrawerRefreshGeneration) return;
        libraryList.innerHTML = '';
        const getFilteredScores = () => getFilteredLibraryScores(displayedScores, activeFolderId);

        if (isSplitView) {
            const shell = document.createElement('div');
            shell.className = 'scores-split-shell';
            libraryList.appendChild(shell);

            const foldersPane = document.createElement('div');
            foldersPane.className = 'scores-split-pane scores-split-folders';
            shell.appendChild(foldersPane);

            const foldersHeader = document.createElement('div');
            foldersHeader.className = 'scores-split-pane-header scores-split-pane-header-row';
            foldersHeader.appendChild(createFoldersLibraryToolbar({ folders, activeFolderId }));
            foldersPane.appendChild(foldersHeader);

            const foldersList = document.createElement('div');
            foldersList.className = 'scores-split-list';
            foldersPane.appendChild(foldersList);

            filterOptions.forEach(option => {
                foldersList.appendChild(createFolderListRow(option, {
                    activeFolderId,
                    folders,
                    showQuickAction: true
                }));
            });

            const scoresPane = document.createElement('div');
            scoresPane.className = 'scores-split-pane scores-split-scores';
            shell.appendChild(scoresPane);

            const filteredScores = getFilteredScores();

            const scoresHeader = document.createElement('div');
            scoresHeader.className = 'scores-split-pane-header scores-split-pane-header-summary';
            scoresHeader.textContent = formatScorePaneSummary(activeFolderId, folders, filteredScores.length);
            scoresPane.appendChild(scoresHeader);

            const scoresList = document.createElement('div');
            scoresList.className = 'scores-split-list';
            scoresPane.appendChild(scoresList);

            scoresList.appendChild(createScoresLibraryToolbar({
                filteredScores,
                folders,
                activeFolderId
            }));

            if (!filteredScores.length) {
                const empty = document.createElement('div');
                empty.className = 'scores-folder-empty';
                empty.textContent = AppState.scoreLibrarySearch ? 'No scores match this search.' : activeFolderId === '__all__'
                    ? 'No saved scores yet. Add files to the library or save the current score.'
                    : (AppState.scoreLibrarySearch ? 'No scores match this search.' : `No scores in ${getScoreLibraryFolderLabel(activeFolderId, folders)} yet.`);
                scoresList.appendChild(empty);
            } else {
                filteredScores.forEach(score => scoresList.appendChild(createScoreRow(score, { manageMode: isScoreLibraryManageMode() })));
            }
            return;
        }

        const browserShell = document.createElement('div');
        browserShell.className = 'scores-browser-shell';
        libraryList.appendChild(browserShell);

        const browserHeader = document.createElement('div');
        browserHeader.className = 'scores-browser-header';
        browserShell.appendChild(browserHeader);

        const browserBody = document.createElement('div');
        browserBody.className = 'scores-browser-body';
        browserShell.appendChild(browserBody);

        if (AppState.scoreLibraryView === 'folders') {
            const title = document.createElement('div');
            title.className = 'scores-browser-title';
            title.textContent = 'Folders';
            browserHeader.appendChild(title);

            browserBody.appendChild(createFoldersLibraryToolbar({
                folders,
                activeFolderId
            }));

            const folderList = document.createElement('div');
            folderList.className = 'scores-browser-list';
            browserBody.appendChild(folderList);

            filterOptions.forEach(option => {
                folderList.appendChild(createFolderListRow(option, {
                    activeFolderId,
                    folders,
                    showQuickAction: true
                }));
            });
            return;
        }

        const backButton = document.createElement('button');
        backButton.type = 'button';
        backButton.className = 'scores-browser-back';
        backButton.textContent = '← Back';
        backButton.addEventListener('click', async () => {
            AppState.scoreLibraryView = 'folders';
            await refreshScoresDrawer();
        });
        browserHeader.appendChild(backButton);

        const title = document.createElement('div');
        title.className = 'scores-browser-title';
        title.textContent = getScoreLibraryFolderLabel(activeFolderId, folders);
        browserHeader.appendChild(title);

        const filteredScores = getFilteredScores();

        browserBody.appendChild(createScoresLibraryToolbar({
            filteredScores,
            folders,
            activeFolderId
        }));

        const scoresList = document.createElement('div');
        scoresList.className = 'scores-browser-list';
        browserBody.appendChild(scoresList);

        if (!filteredScores.length) {
            const empty = document.createElement('div');
            empty.className = 'scores-folder-empty';
            empty.textContent = AppState.scoreLibrarySearch ? 'No scores match this search.' : activeFolderId === '__all__'
                ? 'No saved scores yet. Add files to the library or save the current score.'
                : `No scores in ${getScoreLibraryFolderLabel(activeFolderId, folders)} yet.`;
            scoresList.appendChild(empty);
        } else {
            filteredScores.forEach(score => scoresList.appendChild(createScoreRow(score, { manageMode: isScoreLibraryManageMode() })));
        }
    } catch (err) {
        console.error('Could not refresh scores drawer', err);
        if (generation !== scoresDrawerRefreshGeneration) return;
        libraryList.innerHTML = '<div class="scores-empty-state">Could not load the library.</div>';
    }
}

async function importFilesToLibrary(files) {
    const incoming = Array.from(files || []).filter(Boolean);
    if (!incoming.length) return;
    await runLibraryOperation(async () => {
        const folders = await ScoreLibrary.getAllFolders();
        const active = AppState.scoreLibrarySelectedFolderId;
        const selectedFolderId = folders.some(folder => folder.id === active) ? active : null;
        const existing = await ScoreLibrary.getAllScores();
        let added = 0, skipped = 0;
        const failed = [];
        ensureScoresDrawerOpen();
        for (const [index, file] of incoming.entries()) {
            setLibraryStatus(`Adding ${index + 1} of ${incoming.length}: ${file.name}`);
            try {
                const useConverter = window.MidiImport && typeof window.MidiImport.isConverterImportFileName === 'function'
                    && window.MidiImport.isConverterImportFileName(file.name || '');
                const scoreFile = useConverter ? await window.MidiImport.convertFileToScore(file) : await readScoreFile(file);
                if (await ScoreLibrary.findMatchingScore(scoreFile.rawData, existing)) { skipped++; continue; }
                const saved = await ScoreLibrary.saveScore({ ...scoreFile, folderId: selectedFolderId });
                existing.push(saved);
                added++;
            } catch (error) {
                failed.push(`${file.name}: ${error?.message || 'Could not import file'}`);
            }
        }
        setScoreLibraryManageMode(false);
        setFolderLibraryManageMode(false);
        AppState.scoreLibrarySelectedFolderId = selectedFolderId ?? '__unfiled__';
        AppState.scoreLibraryView = 'scores';
        await refreshScoresDrawer();
        setLibraryStatus(`${added} added, ${skipped} already saved, ${failed.length} failed.${failed.length ? '\n' + failed.join('\n') : ''}`);
    });
}

async function saveCurrentScoreToLibrary({ copy = false } = {}) {
    if (AppState.currentScoreData == null) return;
    // Capture the source before awaiting dialogs; a later score load must not change what is saved.
    const source = { rawData: AppState.currentScoreData, fileName: AppState.currentScoreFileName,
        fileType: AppState.currentScoreFileType, title: AppState.currentScoreTitle };
    await runLibraryOperation(async () => {
        const match = await ScoreLibrary.findMatchingScore(source.rawData);
        if (match && !copy) { setLibraryStatus(`Already saved as ${match.title}. Use Save a copy for another entry.`); return; }
        const defaultTitle = match?.title || source.title || getScoreDisplayTitle(source.fileName || 'Untitled Score');
        const title = await requestLibraryTitle(copy ? `${defaultTitle} (copy)` : defaultTitle, copy);
        if (title == null) return;
        const folders = await ScoreLibrary.getAllFolders();
        const selectedFolderId = await promptForLibraryFolderChoice({ title: 'Save into which folder?', folders });
        if (selectedFolderId === '__cancel__') return;
        const saved = await ScoreLibrary.saveScore({ title, folderId: selectedFolderId,
            fileName: source.fileName || `${title}.xml`,
            fileType: source.fileType || getScoreFileTypeFromName(source.fileName || ''),
            rawData: source.rawData, lastOpenedAt: Date.now() });
        if (AppState.currentScoreData === source.rawData) {
            AppState.currentScoreLibraryId = saved.id;
            AppState.currentScoreTitle = saved.title;
        }
        setScoreLibraryManageMode(false);
        setFolderLibraryManageMode(false);
        AppState.scoreLibrarySelectedFolderId = selectedFolderId ?? '__unfiled__';
        AppState.scoreLibraryView = 'scores';
        await refreshScoresDrawer();
        setLibraryStatus(`Saved ${saved.title}.`);
    });
}

async function createLibraryFolder() {
    const folderName = window.prompt('New folder name:');
    if (folderName == null) return;

    try {
        const folder = await ScoreLibrary.createFolder(folderName);
        setFolderLibraryManageMode(false);
        AppState.scoreLibrarySelectedFolderId = folder.id;
        AppState.scoreLibraryView = 'scores';
        await refreshScoresDrawer();
    } catch (err) {
        console.error('Could not create library folder', err);
        window.alert(err?.message || 'Could not create that folder.');
    }
}

async function exportScoreLibraryBackup() {
    try {
        const payload = await ScoreLibrary.exportBackup();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'Scores-Library-Backup.json';
        link.addEventListener('click', (event) => {
            event.stopPropagation();
        });
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Could not export score library', err);
        window.alert('Could not export the library backup.');
    }
}

function previewLibraryMerge(prepared) {
    return new Promise(resolve => {
        const choices = { folders: Object.create(null), scores: Object.create(null) };
        const dialog = document.createElement('dialog');
        dialog.className = 'scores-save-dialog scores-merge-dialog';
        dialog.setAttribute('aria-labelledby', 'scores-merge-heading');
        const heading = document.createElement('h3'); heading.id = 'scores-merge-heading'; heading.textContent = 'Import library backup';
        const note = document.createElement('p');
        note.textContent = 'Existing scores stay unchanged. Possible duplicates are kept separate unless you choose an existing entry.';
        const summary = document.createElement('p'); summary.setAttribute('role', 'status');
        const rows = document.createElement('div'); rows.className = 'scores-merge-rows';
        const footer = document.createElement('div'); footer.className = 'scores-merge-footer';
        const cancel = document.createElement('button'); cancel.textContent = 'Cancel'; cancel.type = 'button';
        const confirm = document.createElement('button'); confirm.textContent = 'Import'; confirm.type = 'button';
        const finish = value => { dialog.close(); dialog.remove(); resolve(value); };
        cancel.onclick = () => finish(null);
        dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
        confirm.onclick = () => finish(choices);
        const addChoice = (key, labelText, options, value, change) => {
            const label = document.createElement('label'); label.textContent = labelText;
            const select = document.createElement('select'); select.id = key;
            for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.appendChild(option); }
            select.value = value;
            select.onchange = () => { change(select.value); render(); document.getElementById(key)?.focus(); };
            label.appendChild(select); rows.appendChild(label);
        };
        const render = () => {
            let plan;
            try { plan = ScoreLibrary.planBackupMerge(prepared, choices); }
            catch (error) { summary.textContent = error.message; confirm.disabled = true; return; }
            confirm.disabled = false;
            summary.textContent = `Scores to add: ${plan.added} · Already represented: ${plan.skipped} · Possible duplicates: ${plan.uncertain}. Folders reused: ${plan.foldersReused} · New folders: ${plan.foldersAdded}.`;
            rows.replaceChildren();
            for (const row of plan.folderRows) {
                if (row.suggestion) addChoice(`merge-folder-${row.incoming.id}`, `Folder: ${row.incoming.name}`, [['reuse', `Use existing folder: ${row.suggestion.name}`], ['separate', 'Keep as a separate folder']], choices.folders[row.incoming.id] || 'reuse', value => { choices.folders[row.incoming.id] = value; choices.scores = Object.create(null); });
                else if (!row.target) {
                    const description = document.createElement('p'); description.textContent = `New folder: ${row.incoming.name}`; rows.appendChild(description);
                }
            }
            for (const row of plan.scoreRows) {
                if (row.candidates.length) {
                    const folder = prepared.incoming.folders.find(folder => folder.id === row.incoming.folderId)?.name || 'Unfiled';
                    addChoice(`merge-score-${row.incoming.id}`, `${row.incoming.title} (${folder}) — possible duplicate`, [['', 'Keep separate (recommended)'], ...row.candidates.map(candidate => [candidate.id, `Use existing entry: ${candidate.title} (${candidate.id.slice(-8)})`])], choices.scores[row.incoming.id] || '', value => { choices.scores[row.incoming.id] = value; });
                } else if (row.changed) {
                    const description = document.createElement('p'); description.textContent = `${row.incoming.title}: different content; add a separate version.`; rows.appendChild(description);
                }
            }
        };
        footer.append(cancel, confirm); dialog.append(heading, note, summary, rows, footer);
        render(); document.body.appendChild(dialog); dialog.showModal(); cancel.focus();
    });
}

async function importScoreLibraryBackupFile(file) {
    if (!file) return;
    await runLibraryOperation(async () => {
        ensureScoresDrawerOpen();
        setLibraryStatus(`Checking backup: ${file.name}`);
        const prepared = await ScoreLibrary.prepareBackupMerge(JSON.parse(await file.text()));
        const choices = await previewLibraryMerge(prepared);
        if (!choices) { setLibraryStatus('Import cancelled. No library changes.'); return; }
        const result = await ScoreLibrary.applyBackupMerge(prepared, choices);
        setScoreLibraryManageMode(false);
        setFolderLibraryManageMode(false);
        AppState.scoreLibraryView = 'folders';
        await refreshScoresDrawer();
        setLibraryStatus(`Backup merged: ${result.added} scores added, ${result.skipped} already represented; ${result.foldersAdded} new folders, ${result.foldersReused} reused. Existing scores kept.`);
    });
    if (document.activeElement === document.body) document.getElementById('btn-scores-import-library')?.focus();
}


function initScoresDrawerShell() {
    const btnOpenFile = document.getElementById('btn-scores-open-file');
    const btnImportFiles = document.getElementById('btn-scores-import-files');
    const btnSaveCurrent = document.getElementById('btn-scores-save-current');
    const btnExportLibrary = document.getElementById('btn-scores-export-library');
    const btnImportLibrary = document.getElementById('btn-scores-import-library');
    const importInput = document.getElementById('score-import-input');
    const backupInput = document.getElementById('library-backup-input');

    if (btnOpenFile && !btnOpenFile.dataset.boundScoresOpen) {
        btnOpenFile.dataset.boundScoresOpen = 'true';
        btnOpenFile.addEventListener('click', () => {
            if (typeof window.openScoreFilePicker === 'function') {
                window.openScoreFilePicker();
            } else {
                console.error('openScoreFilePicker is not available');
            }
        });
    }

    if (btnImportFiles && importInput && !btnImportFiles.dataset.boundScoresImport) {
        btnImportFiles.dataset.boundScoresImport = 'true';
        btnImportFiles.addEventListener('click', openScoresImportPicker);
    }

    if (importInput && !importInput.dataset.boundScoresImportInput) {
        importInput.dataset.boundScoresImportInput = 'true';
        importInput.addEventListener('change', async () => {
            try {
                await importFilesToLibrary(importInput.files);
            } finally {
                importInput.value = '';
            }
        });
    }

    if (btnSaveCurrent && !btnSaveCurrent.dataset.boundScoresSaveCurrent) {
        btnSaveCurrent.dataset.boundScoresSaveCurrent = 'true';
        btnSaveCurrent.addEventListener('click', saveCurrentScoreToLibrary);
    }

    if (btnExportLibrary && !btnExportLibrary.dataset.boundScoresExportLibrary) {
        btnExportLibrary.dataset.boundScoresExportLibrary = 'true';
        btnExportLibrary.addEventListener('click', exportScoreLibraryBackup);
    }

    if (btnImportLibrary && backupInput && !btnImportLibrary.dataset.boundScoresImportLibrary) {
        btnImportLibrary.dataset.boundScoresImportLibrary = 'true';
        btnImportLibrary.addEventListener('click', () => {
            backupInput.value = '';
            backupInput.click();
        });
    }

    if (backupInput && !backupInput.dataset.boundScoresBackupInput) {
        backupInput.dataset.boundScoresBackupInput = 'true';
        backupInput.addEventListener('change', async () => {
            try {
                const [file] = backupInput.files || [];
                await importScoreLibraryBackupFile(file);
            } finally {
                backupInput.value = '';
            }
        });
    }

    const copyButton = document.getElementById('btn-scores-save-copy');
    if (copyButton && !copyButton.dataset.boundSaveCopy) {
        copyButton.dataset.boundSaveCopy = 'true';
        copyButton.addEventListener('click', () => saveCurrentScoreToLibrary({ copy: true }));
    }
    const panel = document.getElementById('scores-panel');
    if (panel && !panel.dataset.busyBound) {
        panel.dataset.busyBound = 'true';
        panel.addEventListener('click', event => {
            if (scoreLibraryBusy) { event.preventDefault(); event.stopImmediatePropagation(); }
        }, true);
        new MutationObserver(syncLibraryBusyControls).observe(panel, { childList: true, subtree: true });
    }
    positionScoresPanel();
    window.addEventListener('resize', positionScoresPanel);
    refreshScoresDrawer();

    let scoresLayoutResizeRaf = null;
    const handleScoresLayoutResize = () => {
        if (scoresLayoutResizeRaf) cancelAnimationFrame(scoresLayoutResizeRaf);
        scoresLayoutResizeRaf = requestAnimationFrame(() => {
            scoresLayoutResizeRaf = null;
            refreshScoresDrawer();
        });
    };
    window.addEventListener('resize', handleScoresLayoutResize);
}

initScoresDrawerShell();
positionScoresPanel();

syncToolbarButtonStates();


window.ScoresUI = {
    promptForLibraryFolderChoice,
    refreshScoresDrawer,
    importFilesToLibrary,
    saveCurrentScoreToLibrary,
    createLibraryFolder,
    exportScoreLibraryBackup,
    importScoreLibraryBackupFile,
    initScoresDrawerShell,
    closeScoresDrawer,
    updateScoresActionButtonsState
};


