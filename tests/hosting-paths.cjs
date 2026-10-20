// Actual update helpers with isolated storage/fetch/navigation; no network or browser data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const state = fs.readFileSync(path.join(root, 'js/trainer-state.js'), 'utf8');
const led = fs.readFileSync(path.join(root, 'js/led.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'site.webmanifest'), 'utf8'));
function fixture(href, override = '') {
    const stored = new Map(override ? [['pt_updateManifestUrl', override]] : []);
    const button = { dataset: {}, addEventListener(type, callback) { this[type] = callback; } };
    const elements = { 'btn-check-updates': button, 'app-version-display': {}, 'update-status': {} };
    const location = new URL(href), requests = [], reloads = [], downloads = [];
    location.replace = url => reloads.push(url); location.reload = () => reloads.push(href);
    const context = vm.createContext({
        URL, console, localStorage: {
            getItem: key => stored.get(key) ?? null,
            setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key)
        },
        window: { __PT_ASSET_VERSION__: '1.2.9', location, history: { replaceState() {} },
            confirm: () => true, open: url => downloads.push(url) },
        document: { getElementById: id => elements[id] },
        AppState: { updateManifestUrl: override || 'version.json', updateInfo: null, updateStatus: '' },
        fetch: async url => { requests.push(new URL(url, href)); return { ok: true, json: async () => ({version:'1.2.9'}) }; }
    });
    vm.runInContext(state.slice(state.indexOf('const APP_MANIFEST'), state.indexOf('const AppState')), context);
    vm.runInContext(led.slice(led.indexOf('function compareSemverLoose'), led.indexOf('function hasAcceptedWledDdpWarning')), context);
    return { context, button, requests, reloads, downloads, stored };
}

(async () => {
    for (const href of [
        'http://127.0.0.1:5500/index.html', 'http://localhost:8080/',
        'http://127.0.0.1:5518/piano-trainer-studio/index.html',
        'https://www.pianotrainerstudio.com/',
        'https://ztbishop.github.io/piano-trainer-studio/index.html'
    ]) {
        const f = fixture(href), appFolder = new URL('./', href);
        const updatePath = vm.runInContext('UPDATE_MANIFEST_URL', f.context);
        assert.equal(new URL(updatePath, href).href, new URL('version.json', appFolder).href);
        const manifestUrl = new URL('site.webmanifest', appFolder);
        assert.equal(new URL(manifest.start_url, manifestUrl).href, appFolder.href);
        assert.equal(new URL(manifest.scope, manifestUrl).href, appFolder.href);
        for (const icon of manifest.icons) {
            assert.equal(new URL(icon.src, manifestUrl).href, new URL(icon.src, appFolder).href);
            assert(new URL(icon.src, manifestUrl).pathname.startsWith(appFolder.pathname));
            assert(fs.existsSync(path.join(root, icon.src)));
        }
        f.context.AppState.updateManifestUrl = updatePath;
        await f.context.checkForUpdates({manual:true});
        assert.equal(f.requests[0].pathname, new URL('version.json', href).pathname);
        assert.equal(f.context.isAppManifestCheck(), true);
        if (f.context.isLocalAppRuntime()) {
            assert.match(f.context.AppState.updateStatus, /Remote releases were not checked/);
            assert.equal(f.button.textContent, 'Local Files Current');
        } else assert.equal(f.context.AppState.updateStatus, 'Up to date.');
        assert.equal(f.reloads.length, 0);
        f.context.fetch = async () => ({ok:true,json:async()=>({version:'1.3.0'})});
        await f.context.checkForUpdates({manual:true});
        assert.equal(f.button.textContent, 'Reload to Update');
        assert.equal(f.context.shouldDownloadUpdate(), false);
    }
    const local = fixture('http://127.0.0.1:5500/index.html?keep=yes#score');
    local.context.fetch = async () => ({ok:true,json:async()=>({version:'1.3.0'})});
    local.context.initUpdateControls();
    await new Promise(setImmediate);
    assert.equal(local.reloads.length, 0, 'Local startup must not auto-reload');
    await local.button.click();
    const reloaded = new URL(local.reloads[0]);
    assert.equal(reloaded.searchParams.get('appv'), '1.3.0');
    assert.equal(reloaded.searchParams.get('keep'), 'yes'); assert.equal(reloaded.hash, '#score');
    assert.equal(local.downloads.length, 0);
    assert.equal(local.stored.get('pt_assetVersionOverride'), '1.3.0');
    const unavailable = fixture('http://127.0.0.1:5500/index.html');
    unavailable.context.fetch = async () => { throw Error('offline test'); };
    await unavailable.context.checkForUpdates({manual:true});
    assert.equal(unavailable.button.textContent, 'Check Local Files');
    assert.match(unavailable.context.AppState.updateStatus, /offline test/);
    unavailable.context.fetch = async () => ({ok:true,json:async()=>({})});
    await unavailable.context.checkForUpdates({manual:true});
    assert.equal(unavailable.button.textContent, 'Check Local Files');
    assert.match(unavailable.context.AppState.updateStatus, /missing a version/);

    const remote = fixture('http://localhost:8080/index.html', 'https://updates.example.invalid/release.json?channel=test');
    assert.equal(vm.runInContext('UPDATE_MANIFEST_URL', remote.context), 'https://updates.example.invalid/release.json?channel=test');
    remote.context.fetch = async url => {
        remote.requests.push(new URL(url));
        return {ok:true,json:async()=>({version:'1.3.0',downloadUrl:'https://example.invalid/download.zip'})};
    };
    remote.context.initUpdateControls(); await new Promise(setImmediate);
    assert.equal(remote.button.textContent, 'Download Latest');
    assert.equal(remote.requests[0].searchParams.get('channel'), 'test');
    await remote.button.click(); assert.deepEqual(remote.downloads, ['https://example.invalid/download.zip']);
    assert.equal(remote.reloads.length, 0);
    remote.context.fetch = async () => { throw Error('network test'); };
    await remote.context.checkForUpdates({manual:true});
    assert.equal(remote.context.AppState.updateInfo, null);
    assert.match(remote.context.AppState.updateStatus, /Update check failed: network test/);

    const hosted = fixture('https://ztbishop.github.io/piano-trainer-studio/');
    hosted.context.fetch = async () => ({ok:true,json:async()=>({version:'1.3.0'})});
    await hosted.context.checkForUpdates();
    assert.equal(new URL(hosted.reloads[0]).pathname, '/piano-trainer-studio/');
    assert.equal(new URL(hosted.reloads[0]).searchParams.get('appv'), '1.3.0');
    console.log('Hosting regressions passed: root/subpath manifest+icons, local labels/reload, saved remote overrides/downloads, failure handling and hosted auto-reload.');
})().catch(error => {console.error(error); process.exitCode = 1;});
