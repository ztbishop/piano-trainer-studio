// Deterministic failure events; no real browser database or storage pressure.
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseline = process.argv.find(arg => arg.startsWith('--baseline='))?.split('=')[1];
const source = baseline ? execFileSync('git', ['show', `${baseline}:js/score-library.js`], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, 'js/score-library.js'), 'utf8');
const delay = () => new Promise(resolve => setImmediate(resolve));
const setup = factory => {
    const context = vm.createContext({ URL, document: { baseURI: 'http://localhost/' }, window: { indexedDB: factory } });
    vm.runInContext(source, context); return context.window.ScoreLibrary;
};
(async () => {
    let opens = 0;
    const lib = setup({ open() {
        const request = {};
        queueMicrotask(() => {
            if (++opens === 1) { request.error = new DOMException('Temporary storage failure', 'UnknownError'); request.onerror(); }
            else { request.result = {}; request.onsuccess(); }
        });
        return request;
    } });
    await assert.rejects(lib.init());
    let retryWorked = false;
    try { await lib.init(); retryWorked = true; } catch (_) {}
    let tx;
    lib.init = async () => ({ transaction() { tx = { objectStore: () => ({}) }; return tx; } });
    let settled = false, cause;
    const operation = lib.transaction(['scores'], 'readwrite', () => {}).catch(error => { cause = error; }).finally(() => { settled = true; });
    await delay();
    const quota = new DOMException('Test storage budget reached', 'QuotaExceededError');
    tx.onerror({ target: { error: quota } });
    await delay();
    const waitedForRollback = !settled;
    tx.error = quota; tx.onabort(); await operation;
    const quotaPreserved = cause?.name === 'QuotaExceededError';
    console.log(JSON.stringify({ revision: baseline || 'working', retryWorked, waitedForRollback, quotaPreserved }));
    if (!baseline) {
        assert(retryWorked); assert(waitedForRollback); assert(quotaPreserved);
        // A read request may reject before the transaction. It must not leak an
        // unhandled promise rejection while waiting for the abort event.
        let rejectRead;
        const reading = lib.transaction(['scores'], 'readonly', () => new Promise((_, reject) => { rejectRead = reject; })).catch(error => error);
        await delay(); rejectRead(quota); tx.onerror({ target: { error: quota } });
        await delay(); tx.error = quota; tx.onabort(); assert.equal((await reading).name, 'QuotaExceededError');
        let synchronousTx;
        lib.init = async () => ({ transaction() {
            synchronousTx = { objectStore: () => ({}), abort() { queueMicrotask(() => this.onabort()); } }; return synchronousTx;
        } });
        await assert.rejects(lib.transaction(['scores'], 'readwrite', () => { throw quota; }), { name: 'QuotaExceededError' });
        console.log('Storage failure handling passed: retry, original quota cause, rollback completion, read rejection and synchronous write failure.');
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
