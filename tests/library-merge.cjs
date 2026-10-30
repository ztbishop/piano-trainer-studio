const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/score-library.js'), 'utf8');
function harness() {
    let id = 0;
    const context = vm.createContext({ URL, ArrayBuffer, Uint8Array, console,
        document: { baseURI: 'http://localhost/' }, window: { crypto: { randomUUID: () => `generated-${++id}` } },
        getScoreFileTypeFromName: () => 'xml' });
    vm.runInContext(source, context);
    const lib = context.window.ScoreLibrary;
    const db = { folders: [], scores: [] };
    lib.readMergeSnapshot = async () => structuredClone(db);
    lib.getAllFolders = async () => structuredClone(db.folders);
    lib.getAllScores = async () => structuredClone(db.scores);
    lib.transaction = async (names, mode, execute) => {
        const next = structuredClone(db); let aborted = false;
        const stores = Object.fromEntries(names.map(key => [key, {
            getAll() { const request = {}; queueMicrotask(() => request.onsuccess({ target: { result: structuredClone(next[key]) } })); return request; },
            add(record) { if (next[key].some(item => item.id === record.id)) throw Error('ID collision'); next[key].push(structuredClone(record)); },
            put(record) { const i = next[key].findIndex(item => item.id === record.id); if (i < 0) next[key].push(structuredClone(record)); else next[key][i] = structuredClone(record); }
        }]));
        execute(stores, { abort() { aborted = true; } });
        await new Promise(resolve => setImmediate(resolve));
        if (aborted) throw Error('Aborted');
        Object.assign(db, next);
    };
    return { lib, db };
}
const score = (id, text = '<same/>', folderId = 'folder') => ({ id, title: 'Song', fileName: 'song.xml', fileType: 'xml', folderId, rawData: { kind: 'text', text } });
const backup = (scores = [score('one'), score('copy')], folders = [{ id: 'folder', name: 'Practice' }]) => ({ version: 1, folders, scores });
(async () => {
    const { lib, db } = harness();
    assert.equal(lib.validateBackup(JSON.parse(fs.readFileSync(path.join(__dirname, '../assets/Starter_Scores.json'), 'utf8'))).scores.length, 16, 'Bundled older version-1 backup remains compatible');
    const original = backup();
    assert.equal((await lib.importBackup(original)).added, 2);
    assert.equal(db.scores.length, 2, 'Identical intentional copies both restored');
    assert.equal((await lib.importBackup(original)).added, 0);
    db.scores[0].title = 'Local rename'; db.scores[0].folderId = null; db.folders[0].name = 'Local folder rename';
    await lib.importBackup(original);
    assert.equal(db.scores[0].title, 'Local rename'); assert.equal(db.scores[0].folderId, null);
    assert.equal(db.folders[0].name, 'Local folder rename');
    const changed = backup([score('one', '<changed/>')]);
    assert.equal((await lib.importBackup(changed)).added, 1);
    assert.equal((await lib.importBackup(changed)).added, 0, 'Changed version identity remembered');
    assert.equal(db.scores[0].rawData, '<same/>');
    const roundTrip = await lib.exportBackup();
    const restored = harness(); await restored.lib.importBackup(roundTrip);
    assert.equal(restored.db.scores.length, 3);
    assert.equal((await restored.lib.importBackup(original)).added, 0, 'Identity survives export/restore');
    assert.equal((await restored.lib.importBackup(changed)).added, 0);

    const legacy = harness();
    await legacy.lib.importBackup(backup([score('old-generated')]));
    const prepared = await legacy.lib.prepareBackupMerge(backup([score('original-id')]));
    const plan = legacy.lib.planBackupMerge(prepared);
    assert.equal(plan.uncertain, 1); assert.equal(plan.added, 1);
    await legacy.lib.applyBackupMerge(prepared);
    assert.equal(legacy.db.scores.length, 2, 'Uncertain entries kept separate by default');
    assert.equal((await legacy.lib.importBackup(backup([score('original-id')]))).added, 0);
    const manual = harness(); await manual.lib.importBackup(backup([score('old-generated')]));
    await manual.lib.applyBackupMerge(await manual.lib.prepareBackupMerge(backup([score('original-id')])), { scores: { 'original-id': 'old-generated' } });
    assert.equal(manual.db.scores.length, 1);
    assert.equal((await manual.lib.importBackup(backup([score('original-id')]))).added, 0, 'Explicit association remembered');
    const two = backup([score('a'), score('b')]);
    const doublePlan = await manual.lib.prepareBackupMerge(two);
    assert.throws(() => manual.lib.planBackupMerge(doublePlan, { scores: { a: 'old-generated', b: 'old-generated' } }), /used twice/);

    const folders = harness();
    await folders.lib.importBackup(backup([], [{ id: 'local', name: ' Practice ' }]));
    const incomingFolder = backup([], [{ id: 'remote', name: 'practice' }]);
    assert.equal((await folders.lib.importBackup(incomingFolder)).foldersAdded, 0);
    assert.equal(folders.db.folders[0].name, ' Practice ');
    const separate = await folders.lib.prepareBackupMerge(backup([], [{ id: 'another', name: 'PRACTICE' }]));
    await folders.lib.applyBackupMerge(separate, { folders: { another: 'separate' } });
    assert.equal(folders.db.folders.length, 2);
    const sameNames = backup([], [{ id: 'x', name: 'Practice' }, { id: 'y', name: 'Practice' }]);
    assert.equal((await folders.lib.importBackup(sameNames)).foldersAdded, 2, 'Same-name distinct folders preserved');
    assert.equal((await folders.lib.importBackup(sameNames)).foldersAdded, 0);

    const bin = harness();
    const binary = backup([{ ...score('mxl'), fileType: 'mxl', fileName: 'song.mxl', rawData: { kind: 'arraybuffer', bytes: [80, 75, 0, 255] } }]);
    await bin.lib.importBackup(binary); assert.equal((await bin.lib.importBackup(binary)).added, 0);
    assert.deepEqual(Array.from(new Uint8Array(bin.db.scores[0].rawData)), [80, 75, 0, 255]);
    const stale = await bin.lib.prepareBackupMerge(backup()); bin.db.folders[0].name = 'Changed elsewhere';
    await assert.rejects(bin.lib.applyBackupMerge(stale), /library changed/);
    assert.equal(bin.db.scores.length, 1);
    for (const malformed of [null, {}, { ...original, version: 99 }, backup([score('a'), score('a')]), backup([score('missing', '<s/>', 'absent')]), backup([{ ...score('bytes'), rawData: { kind: 'arraybuffer', bytes: [256] } }]), backup([{ ...score('empty'), rawData: { kind: 'text', text: '' } }])]) {
        await assert.rejects(lib.prepareBackupMerge(malformed), /Invalid library backup/);
    }
    assert.equal(db.scores.length, 3, 'Malformed imports leave data untouched');
    console.log('Backup merge passed: identity/repeat imports, copies, changed versions, provenance round trip, legacy choices, one-to-one matching, folders, binary data, validation and stale previews.');
})().catch(error => { console.error(error); process.exitCode = 1; });
