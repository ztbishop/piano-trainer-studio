// Generated in-memory records only; never opens an application database.
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.split('=')[1];
const source = baseline ? execFileSync('git', ['show', `${baseline}:js/score-library.js`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js/score-library.js'), 'utf8');
const context = vm.createContext({ URL, ArrayBuffer, Uint8Array, document: { baseURI: 'http://localhost/' }, window: {} });
vm.runInContext(source, context);
const lib = context.window.ScoreLibrary;
const count = Number(process.env.PIANO_SCALE_COUNT || 2000);
const scores = Array.from({ length: count }, (_, i) => ({ id: `local-${i}`, title: `Score ${i}`, fileName: `${i}.xml`, fileType: 'xml', folderId: 'folder', rawData: `<score>${i}${'x'.repeat(4096)}</score>` }));
const snapshot = { folders: [{ id: 'folder', name: 'Folder' }], scores };
for (const scenario of ['repeat', 'legacy']) {
    const incoming = { folders: snapshot.folders, scores: scores.map((score, i) => ({ ...score, id: scenario === 'repeat' ? score.id : `legacy-${i}`, mergeIds: [] })) };
    let comparisons = 0;
    const equal = lib.sameScoreData;
    lib.sameScoreData = (...args) => { comparisons++; return equal.call(lib, ...args); };
    const start = performance.now();
    const plan = lib.planBackupMerge({ snapshot, incoming });
    const ms = Math.round(performance.now() - start);
    lib.sameScoreData = equal;
    assert.equal(plan.added, scenario === 'repeat' ? 0 : count);
    assert.equal(plan.uncertain, scenario === 'repeat' ? 0 : count);
    console.log(JSON.stringify({ revision: baseline || 'working', count, scenario, ms, comparisons }));
    if (!baseline) assert(comparisons <= count * 4, 'Distinct-title legacy matching must not compare every score against every other score');
}
