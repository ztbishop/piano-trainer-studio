// Actual workflow functions with isolated records, delayed conversion, and UI controls.
// No application database, files, renderer, preferences, or hardware are modified.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

(async () => {
    const controls = new Map();
    for (const id of ['btn-scores-save-current', 'btn-scores-save-copy', 'scores-current-title', 'scores-current-state', 'scores-status']) {
        controls.set(id, { disabled: false, textContent: '' });
    }
    const panel = { setAttribute() {}, querySelectorAll: () => [...controls.values()] };
    const expectedErrors = [];
    const context = vm.createContext({ console: { ...console, error: (...args) => expectedErrors.push(args) }, ArrayBuffer, Uint8Array, URL,
        window: {}, document: { baseURI: 'http://127.0.0.1:5500/', getElementById: id => id === 'scores-panel' ? panel : controls.get(id) },
        AppState: { scoreLibrarySelectedFolderId: 'folder', currentScoreData: null },
        getScoreDisplayTitle: name => name, getScoreFileTypeFromName: () => 'musicxml' });
    vm.runInContext(read('js/score-library.js'), context);
    const lib = context.window.ScoreLibrary;
    const records = [{ id: 'original', title: 'Original', rawData: '<original/>', folderId: 'folder' }];
    lib.getAllScores = async () => records.slice();
    lib.getAllFolders = async () => [{ id: 'folder', name: 'Folder' }];
    lib.getDemoScores = async () => [{ rawData: '<demo/>' }];
    lib.saveScore = async score => {
        if (score.fileName === 'quota.xml') throw Error('Storage full');
        const saved = { ...score, id: `new-${records.length}` }; records.push(saved); return saved;
    };
    vm.runInContext(read('js/scores-ui.js').split('\ninitScoresDrawerShell();')[0], context);
    context.ensureScoresDrawerOpen = () => {};
    context.refreshScoresDrawer = async () => context.updateScoresActionButtonsState();
    context.setScoreLibraryManageMode = context.setFolderLibraryManageMode = () => {};
    const status = () => controls.get('scores-current-state').textContent;
    const message = () => controls.get('scores-status').textContent;
    const state = context.AppState;
    assert(lib.sameScoreData(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2])));
    assert(lib.sameScoreData(new Uint8Array([0, 1, 2, 9]).subarray(1, 3), new Uint8Array([1, 2]).buffer));
    assert(!lib.sameScoreData(new Uint8Array([1]), new Uint8Array([2])));
    assert(!lib.sameScoreData('<a/>', '<a />'), 'Do not normalize rendering sources');
    assert(!lib.sameScoreData(null, null));
    let release;
    const delayed = new Promise(resolve => { release = resolve; });
    context.readScoreFile = async file => {
        if (file.name === 'first.xml') await delayed;
        if (file.name === 'bad.xml') throw Error('Read failed');
        return { rawData: file.data, title: file.name, fileName: file.name, fileType: 'xml' };
    };
    const importing = context.importFilesToLibrary([
        { name: 'first.xml', data: '<first/>' }, { name: 'bad.xml' },
        { name: 'renamed.xml', data: '<original/>' }, { name: 'quota.xml', data: '<quota/>' },
        { name: 'last.xml', data: '<last/>' }]);
    await Promise.resolve(); await Promise.resolve();
    assert(controls.get('btn-scores-save-copy').disabled, 'Busy disables conflicting actions');
    await context.importFilesToLibrary([{ name: 'reentrant.xml', data: '<unexpected/>' }]);
    release(); await importing;
    assert.equal(records.length, 3);
    assert.equal(records[1].folderId, 'folder');
    assert.match(message(), /2 added, 1 already saved, 2 failed/);
    assert.match(message(), /bad.xml: Read failed/); assert.match(message(), /quota.xml: Storage full/);
    assert(!records.some(record => record.fileName === 'reentrant.xml'));
    // All Scores and Demo views import to Unfiled, never into a system folder.
    state.scoreLibrarySelectedFolderId = '__demos__';
    await context.importFilesToLibrary([{ name: 'unfiled.xml', data: '<unfiled/>' }]);
    assert.equal(records.at(-1).folderId, null);
    state.currentScoreData = '<original/>'; state.currentScoreLibraryId = 'original'; state.currentScoreTitle = 'Original';
    await context.updateScoresActionButtonsState();
    assert.equal(status(), 'Saved as Original');
    assert(controls.get('btn-scores-save-current').disabled);
    assert(!controls.get('btn-scores-save-copy').disabled);
    const before = records.length;
    context.requestLibraryTitle = async () => { throw Error('Duplicate save must not prompt'); };
    await context.saveCurrentScoreToLibrary(); assert.equal(records.length, before);
    context.requestLibraryTitle = async () => 'Intentional copy';
    context.promptForLibraryFolderChoice = async () => 'folder';
    await context.saveCurrentScoreToLibrary({ copy: true });
    assert.equal(records.length, before + 1); assert.equal(records[0].title, 'Original');
    assert.equal(status(), 'Saved as Intentional copy');
    // Transposition can retain the library ID; compare actual data before saying Saved.
    state.currentScoreData = '<transposed/>';
    await context.updateScoresActionButtonsState();
    assert.equal(status(), 'Not saved to library'); assert(!controls.get('btn-scores-save-current').disabled);
    context.requestLibraryTitle = async () => null;
    await context.saveCurrentScoreToLibrary(); assert.equal(records.length, before + 1);
    context.requestLibraryTitle = async () => 'Transposed';
    await context.saveCurrentScoreToLibrary();
    assert.equal(records.at(-1).rawData, '<transposed/>'); assert.equal(records[0].rawData, '<original/>');
    state.currentScoreData = '<demo/>';
    await context.updateScoresActionButtonsState(); assert.equal(status(), 'Demo · not saved to library');
    let imported = null;
    lib.importBackup = async payload => { imported = payload; };
    await context.importScoreLibraryBackupFile({ name: 'backup.json', text: async () => '{"version":1}' });
    assert.equal(imported.version, 1); assert.match(message(), /can create copies/);
    await context.importScoreLibraryBackupFile({ name: 'bad.json', text: async () => '{' });
    assert.match(message(), /JSON|property|Unexpected/i);
    assert.equal(expectedErrors.length, 1, 'Only the intentionally malformed backup reports an operation error');
    await context.importFilesToLibrary([{ name: 'recovery.xml', data: '<recovery/>' }]);
    assert.equal(records.at(-1).rawData, '<recovery/>', 'Errors release the busy guard');
    console.log('Library workflow passed: partial failures, progress, busy/reentry recovery, exact text/binary matching, explicit copies, transposed saves, demo/current status, and unchanged backup delegation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
