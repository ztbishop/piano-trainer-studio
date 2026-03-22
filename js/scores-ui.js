// scores-ui.js
// UI for displaying and selecting available scores.
// Does not parse files or control playback directly.

// ⚠️ WARNING:
// Preserve current score-opening behavior from the active baseline only.
// Do not reintroduce older score browser or open-score logic during future edits.

async function promptForLibraryFolderChoice({ allowAll = false, title = 'Choose a folder:', folders = null } = {}) {
    const availableFolders = Array.isArray(folders) ? folders : await ScoreLibrary.getAllFolders();
    const choices = [];

    if (allowAll) choices.push({ value: '__all__', label: 'All Scores' });
    choices.push({ value: null, label: 'Unfiled' });
    availableFolders.forEach(folder => {
        choices.push({ value: folder.id, label: folder.name || 'New Folder' });
    });

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'scores-folder-picker-overlay';

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
                finish('__cancel__');
            }
        };

        const finish = (value) => {
            document.removeEventListener('keydown', onKeyDown, true);
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
    });
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
    return folderId === '__all__' || folderId === '__unfiled__' || folderId == null;
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
            { value: 'delete', label: 'Delete', danger: true },
            { value: '__cancel__', label: 'Cancel' }
        ]
    });
}

function createFoldersLibraryToolbar({ folders = [], activeFolderId = '__all__' } = {}) {
    const toolbar = document.createElement('div');
    toolbar.className = 'scores-library-toolbar';

    const info = document.createElement('div');
    info.className = 'scores-library-toolbar-info';
    toolbar.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'scores-library-toolbar-actions';
    toolbar.appendChild(actions);

    const realFolders = (folders || []).filter(folder => folder && folder.id);
    const manageMode = isFolderLibraryManageMode();
    const selectedSet = getFolderLibrarySelectionSet();
    const selectedCount = selectedSet.size;

    if (!manageMode) {
        info.textContent = activeFolderId && !isSystemFolderOption(activeFolderId)
            ? `Selected folder: ${getScoreLibraryFolderLabel(activeFolderId, folders)}`
            : 'Folders';

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
    if (folderId === '__all__') return countLabel;
    return `${getScoreLibraryFolderLabel(folderId, folders)} · ${countLabel}`;
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
        if (activeFolderId === '__all__') return true;
        if (activeFolderId === '__unfiled__' || activeFolderId == null) return !score.folderId;
        return score.folderId === activeFolderId;
    });
}

function createScoresLibraryToolbar({ filteredScores = [], folders = [], activeFolderId = '__all__' } = {}) {
    const toolbar = document.createElement('div');
    toolbar.className = 'scores-library-toolbar';

    const info = document.createElement('div');
    info.className = 'scores-library-toolbar-info';
    toolbar.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'scores-library-toolbar-actions';
    toolbar.appendChild(actions);

    const manageMode = isScoreLibraryManageMode();
    const selectedSet = getScoreLibrarySelectionSet();
    const selectedCount = selectedSet.size;

    if (!manageMode) {
        info.textContent = `Selected folder: ${getScoreLibraryFolderLabel(activeFolderId, folders)}`;

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
            { value: 'delete', label: 'Delete', danger: true },
            { value: '__cancel__', label: 'Cancel' }
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

    if (manageMode) {
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
            const fullScore = await ScoreLibrary.getScoreById(score.id);
            if (!fullScore) return;
            await loadScoreIntoApp(fullScore.rawData, {
                fileName: fullScore.fileName,
                fileType: fullScore.fileType,
                libraryScoreId: fullScore.id,
                title: fullScore.title
            });
        } catch (err) {
            console.error('Could not open library score', err);
        }
    });

    row.appendChild(button);

    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'scores-row-action-button';
    actionBtn.setAttribute('aria-label', `Actions for ${resolvedTitle}`);
    actionBtn.textContent = '⋯';
    actionBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const action = await showScoreRowActionMenu(score);
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
    const libraryList = document.getElementById('scores-library-list');
    if (!libraryList) return;

    try {
        await ScoreLibrary.init();
        const [folders, scores] = await Promise.all([
            ScoreLibrary.getAllFolders(),
            ScoreLibrary.getAllScores()
        ]);

        const validFolderIds = new Set(['__all__', '__unfiled__', ...folders.map(folder => folder.id)]);
        if (!validFolderIds.has(AppState.scoreLibrarySelectedFolderId)) {
            AppState.scoreLibrarySelectedFolderId = '__all__';
        }
        if (!['folders', 'scores'].includes(AppState.scoreLibraryView)) {
            AppState.scoreLibraryView = 'folders';
        }

        libraryList.innerHTML = '';

        const isSplitView = window.innerWidth >= 900;
        const filterOptions = [
            { value: '__all__', label: 'All Scores' },
            { value: '__unfiled__', label: 'Unfiled' },
            ...folders.map(folder => ({ value: folder.id, label: folder.name || 'New Folder' }))
        ];
        const activeFolderId = AppState.scoreLibrarySelectedFolderId;

        const getFilteredScores = () => getFilteredLibraryScores(scores, activeFolderId);

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
                empty.textContent = activeFolderId === '__all__'
                    ? 'No saved scores yet. Import files or save the current score.'
                    : `No scores in ${getScoreLibraryFolderLabel(activeFolderId, folders)} yet.`;
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
            empty.textContent = activeFolderId === '__all__'
                ? 'No saved scores yet. Import files or save the current score.'
                : `No scores in ${getScoreLibraryFolderLabel(activeFolderId, folders)} yet.`;
            scoresList.appendChild(empty);
        } else {
            filteredScores.forEach(score => scoresList.appendChild(createScoreRow(score, { manageMode: isScoreLibraryManageMode() })));
        }
    } catch (err) {
        console.error('Could not refresh scores drawer', err);
        libraryList.innerHTML = '<div class="scores-empty-state">Could not load the library.</div>';
    }
}

async function importFilesToLibrary(files) {
    const incoming = Array.from(files || []).filter(Boolean);
    if (!incoming.length) return;

    try {
        const folders = await ScoreLibrary.getAllFolders();
        const selectedFolderId = await promptForLibraryFolderChoice({
            title: 'Import scores into which folder?',
            folders
        });
        if (selectedFolderId === '__cancel__') return;

        for (const file of incoming) {
            if ((file.name || '').match(/\.(mid|midi)$/i)) continue;
            const scoreFile = await readScoreFile(file);
            await ScoreLibrary.saveScore({
                title: scoreFile.title,
                folderId: selectedFolderId,
                fileName: scoreFile.fileName,
                fileType: scoreFile.fileType,
                rawData: scoreFile.rawData
            });
        }

        setScoreLibraryManageMode(false);
        setFolderLibraryManageMode(false);
        AppState.scoreLibrarySelectedFolderId = selectedFolderId ?? '__unfiled__';
        AppState.scoreLibraryView = 'scores';
        await refreshScoresDrawer();
    } catch (err) {
        console.error('Could not import score files', err);
        window.alert('Could not import one or more score files.');
    }
}

async function saveCurrentScoreToLibrary() {
    if (AppState.currentScoreData == null) {
        window.alert('Load a score first, then save it to the library.');
        return;
    }

    const defaultTitle = AppState.currentScoreTitle || getScoreDisplayTitle(AppState.currentScoreFileName || 'Untitled Score');
    const title = window.prompt('Save score to library as:', defaultTitle);
    if (title == null) return;

    try {
        const folders = await ScoreLibrary.getAllFolders();
        const selectedFolderId = await promptForLibraryFolderChoice({
            title: 'Save score into which folder?',
            folders
        });
        if (selectedFolderId === '__cancel__') return;

        const saved = await ScoreLibrary.saveScore({
            title,
            folderId: selectedFolderId,
            fileName: AppState.currentScoreFileName || `${title}.xml`,
            fileType: AppState.currentScoreFileType || getScoreFileTypeFromName(AppState.currentScoreFileName || ''),
            rawData: AppState.currentScoreData,
            lastOpenedAt: Date.now()
        });
        AppState.currentScoreLibraryId = saved.id;
        AppState.currentScoreTitle = saved.title;
        setScoreLibraryManageMode(false);
        setFolderLibraryManageMode(false);
        AppState.scoreLibrarySelectedFolderId = selectedFolderId ?? '__unfiled__';
        AppState.scoreLibraryView = 'scores';
        await refreshScoresDrawer();
    } catch (err) {
        console.error('Could not save current score', err);
        window.alert('Could not save the current score to the library.');
    }
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
        link.download = 'Scores-Export.json';
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

async function importScoreLibraryBackupFile(file) {
    if (!file) return;

    try {
        const text = await file.text();
        const payload = JSON.parse(text);
        await ScoreLibrary.importBackup(payload);
        setScoreLibraryManageMode(false);
        setFolderLibraryManageMode(false);
        AppState.scoreLibraryView = 'folders';
        await refreshScoresDrawer();
    } catch (err) {
        console.error('Could not import library backup', err);
        window.alert('Invalid library backup file.');
    }
}

function initScoresDrawerShell() {
    const btnOpenFile = document.getElementById('btn-scores-open-file');
    const btnImportFiles = document.getElementById('btn-scores-import-files');
    const btnSaveCurrent = document.getElementById('btn-scores-save-current');
    const btnNewFolder = document.getElementById('btn-scores-new-folder');
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
        btnImportFiles.addEventListener('click', () => {
            importInput.value = '';
            importInput.click();
        });
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

    if (btnNewFolder && !btnNewFolder.dataset.boundScoresNewFolder) {
        btnNewFolder.dataset.boundScoresNewFolder = 'true';
        btnNewFolder.addEventListener('click', createLibraryFolder);
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
    initScoresDrawerShell
};
