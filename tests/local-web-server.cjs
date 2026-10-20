// Real server source: cross-platform resolver cases and isolated loopback HTTP fixtures.
// No user's running server, browser storage, helper, or device is touched.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../local-web-server.js'), 'utf8');
function load(root, paths, httpModule, fileSystem = fs) {
    const context = vm.createContext({
        __dirname: root, process: { env: { PIANO_TRAINER_APP_PORT: '0' } }, console: { log() {} },
        require(name) {
            if (name === 'http') return httpModule;
            if (name === 'path') return paths;
            if (name === 'fs') return fileSystem;
            if (name === 'url') return require('node:url');
            if (name === 'os') return os;
            throw Error(`Unexpected module ${name}`);
        }
    });
    vm.runInContext(source, context, { filename: 'local-web-server.js' });
    return context;
}

for (const [paths, root] of [[path.win32, 'C:\\test\\PianoApp'], [path.posix, '/test/PianoApp']]) {
    const context = load(root, paths, { createServer: () => ({ listen() {} }) }, { realpathSync: p => p });
    for (const request of ['/%', '/%GG', '/%C0%AF', '/assets/%E0%A4', '/assets/%00.txt', 'http://[invalid']) {
        assert.equal(context.safeResolve(request)?.type, 'bad-request', request);
    }
    for (const request of [
        '/assets/../../PianoApp-other/secret.txt', '/assets/%2e%2e/%2e%2e/PianoApp-other/secret.txt',
        '/assets%5c..%5c..%5cPianoApp-other%5csecret.txt', '/assets/..\\..\\PianoApp-other/secret.txt',
        '/assets/../helper/server.js', '/assets%2f..%2fhelper/server.js', '/.git/config',
        '/helper/server.js', '/C:/Windows/win.ini', '/assets/../../../Windows/win.ini'
    ]) assert.equal(context.safeResolve(request), null, request);
    for (const [request, relative] of [
        ['/', 'index.html'], ['/index.html?v=1.2.9', 'index.html'], ['/js/trainer-core.js', 'js/trainer-core.js'],
        ['/assets/space%20name.txt', 'assets/space name.txt'], ['/assets/%C3%A9.txt', 'assets/é.txt'],
        ['/assets/../style.css', 'style.css'], ['/assets%5cscore.musicxml', 'assets/score.musicxml']
    ]) assert.equal(context.safeResolve(request)?.fullPath, paths.resolve(root, relative), request);
    assert.equal(context.safeResolve('/connection-info?from=launcher')?.type, 'connection-info');
    if (paths === path.win32) {
        assert.equal(context.isWithinSite(root, 'D:\\test\\PianoApp\\index.html'), false);
        assert.equal(context.isWithinSite(root, 'c:\\TEST\\pianoapp\\index.html'), true);
    }
}

function request(port, requestPath, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: requestPath, method }, res => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
        });
        req.on('error', reject); req.end();
    });
}

(async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pts-server-'));
    const root = path.join(temporary, 'PianoApp'), sibling = path.join(temporary, 'PianoApp-other');
    let server;
    try {
        fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
        fs.mkdirSync(path.join(root, 'js')); fs.mkdirSync(path.join(root, 'helper')); fs.mkdirSync(sibling);
        for (const [relative, text] of [
            ['index.html', '<title>server regression</title>'], ['style.css', 'body {}'],
            ['version.json', '{"version":"test"}'], ['site.webmanifest', '{}'], ['js/app.js', '/* fixture */'],
            ['assets/space name.txt', 'space'], ['assets/é.txt', 'unicode'], ['assets/module.wasm', 'wasm'],
            ['assets/score.musicxml', '<score-partwise/>'], ['helper/server.js', 'private fixture']
        ]) fs.writeFileSync(path.join(root, relative), text);
        fs.writeFileSync(path.join(sibling, 'secret.txt'), 'outside secret');
        fs.writeFileSync(path.join(sibling, 'index.html'), 'outside index');
        const link = path.join(root, 'assets', 'external');
        let fileSystem = fs, realLink = true;
        try {
            fs.symlinkSync(sibling, link, process.platform === 'win32' ? 'junction' : 'dir');
        } catch (error) {
            if (!['EPERM', 'EACCES'].includes(error.code)) throw error;
            realLink = false;
            fs.mkdirSync(link); fs.writeFileSync(path.join(link, 'secret.txt'), 'mock link content');
            // Restricted hosts can still exercise the canonical-path rejection branch.
            fileSystem = { ...fs, realpath(target, callback) {
                if (target === path.join(link, 'secret.txt') || target === path.join(link, 'index.html')) {
                    callback(null, path.join(sibling, path.basename(target)));
                } else fs.realpath(target, callback);
            } };
        }
        fs.mkdirSync(path.join(root, 'assets', 'page'));
        fs.writeFileSync(path.join(root, 'assets', 'page', 'index.html'), 'inside index');
        const listening = new Promise((resolve, reject) => {
            load(root, path, { createServer(handler) {
                server = http.createServer(handler);
                server.once('listening', resolve); server.once('error', reject);
                return server;
            } }, fileSystem);
        });
        await listening;
        const port = server.address().port;
        for (const requestPath of ['/%', '/%GG', '/%C0%AF', '/assets/%00.txt']) {
            assert.equal((await request(port, requestPath)).status, 400, requestPath);
            assert.equal((await request(port, '/')).status, 200, 'Valid request after malformed URL');
        }
        for (const requestPath of [
            '/assets/../../PianoApp-other/secret.txt', '/assets/%2e%2e/%2e%2e/PianoApp-other/secret.txt',
            '/assets%5c..%5c..%5cPianoApp-other%5csecret.txt', '/assets/../helper/server.js',
            '/assets/external/secret.txt', '/assets/external/', '/missing', '/.git/config', '/helper/server.js'
        ]) assert.equal((await request(port, requestPath)).status, 404, requestPath);
        for (const [requestPath, type, body] of [
            ['/?v=1', 'text/html', 'server regression'], ['/js/app.js?v=1', 'application/javascript', 'fixture'],
            ['/version.json', 'application/json', 'test'], ['/site.webmanifest', 'application/manifest+json', '{}'],
            ['/assets/space%20name.txt', 'text/plain', 'space'], ['/assets/%C3%A9.txt', 'text/plain', 'unicode'],
            ['/assets/module.wasm', 'application/wasm', 'wasm'], ['/assets/score.musicxml', 'application/vnd.recordare.musicxml+xml', 'score-partwise'],
            ['/assets/page/', 'text/html', 'inside index'], ['/connection-info', 'text/html', 'iPad Connection']
        ]) {
            const response = await request(port, requestPath);
            assert.equal(response.status, 200, requestPath); assert(response.headers['content-type'].startsWith(type), requestPath);
            assert(response.body.includes(body), requestPath); assert.equal(response.headers['cache-control'], 'no-store');
            assert.equal(response.headers['access-control-allow-origin'], '*');
        }
        const head = await request(port, '/index.html', 'HEAD');
        assert.equal(head.status, 200); assert.equal(head.body, '');
        console.log('Server regressions passed: Windows/POSIX paths, controlled 400 + recovery, traversal/allowlist rejection, real HTTP assets/MIME/index/connection-info/HEAD.');
        console.log(realLink ? 'Physical junction/symlink rejection passed.' : 'Canonical link-target rejection passed with mocked realpath; physical junction creation unavailable (EPERM/EACCES).');
    } finally {
        if (server?.listening) await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
        // Remove only this test's generated direct child of the OS temporary directory.
        assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
        assert(path.basename(temporary).startsWith('pts-server-'));
        fs.rmSync(temporary, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
