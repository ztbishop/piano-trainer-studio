// Run against the normal app server with Playwright and a local Chrome install.
// Uses a disposable browser context, no device permissions or external requests.
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require('playwright');
const origin = process.env.PT_TEST_ORIGIN || 'http://127.0.0.1:5500';
const fixture = ext => path.join(__dirname, 'fixtures', 'grand-staff-repeat.' + ext);

async function main() {
    const browser = await chromium.launch({channel:'chrome', args:['--mute-audio']});
    let page;
    try {
        page = await browser.newPage({viewport:{width:1160, height:800}});
        page.setDefaultTimeout(12000);
        const errors = [];
        page.on('pageerror', e => { errors.push(e.message); console.error(e.message); });
        page.on('dialog', async d => { console.error(d.message()); await d.dismiss(); });
        await page.route(/^https?:/, route => new URL(route.request().url()).origin === origin ?
            route.continue() : route.abort());
        await page.addInitScript(() => {
            localStorage.setItem('pt_firstRunIntroSeen', 'true');
            Object.defineProperty(navigator, 'requestMIDIAccess', {value: undefined});
        });
        await page.goto(origin);
        const el = id => page.locator('#' + id);
        const box = n => page.locator('.pdf-boxes [data-measure="' + n + '"]');
        async function attach() {
            await el('btn-scores').click();
            await el('pdf-file').setInputFiles(fixture('pdf'));
            await page.waitForFunction(() => !document.getElementById('pdf-view').hidden ||
                document.getElementById('pdf-attach-status').textContent.startsWith('Could not'));
            assert.equal(await el('pdf-view').isVisible(), true, await el('pdf-attach-status').textContent());
        }
        async function range(from, through, first) {
            await el('pdf-from').selectOption(String(from));
            await el('pdf-through').selectOption(String(through));
            if (first !== null) await el('pdf-first').fill(String(first));
            await el(first === null ? 'pdf-unmap' : 'pdf-apply-range').click();
        }
        async function mode(id) {
            await el('btn-practice').click();
            await el('mode-' + id).check();
            await el('btn-practice').click();
            await el('practice-popup').waitFor({state:'hidden'});
        }
        const active = () => page.locator('.pdf-boxes .current').getAttribute('data-measure');
        async function expectVisit(n, printed) {
            await page.waitForFunction(([visit, print]) =>
                document.querySelector('#pdf-target').textContent.startsWith('Visit ' + visit + ' ·') &&
                (document.querySelector('.pdf-boxes .current')?.dataset.measure ?? null) === print,
                [n, printed === null ? null : String(printed)]);
        }
        await el('file-input').setInputFiles(fixture('mid'));
        await page.waitForFunction(() => !document.getElementById('pdf-attach').disabled);
        await attach();
        console.log('MIDI import and PDF box geometry', await page.evaluate(() => ({
            measures: osmd.Sheet.SourceMeasures.length, visits: document.querySelector('#pdf-from').length,
            boxes: [...document.querySelectorAll('.pdf-boxes .pdf-box')].map(b => [b.style.left,b.style.top,b.style.width,b.style.height])
        })));
        assert.equal(await el('pdf-from').locator('option').count(), 6);
        assert.equal(await page.locator('.pdf-boxes .pdf-box').count(), 4);
        assert.equal(await page.locator('.pdf-reading-page').count(), 2);
        // Staff extents measured on the rendered MuseScore pages.
        for (const b of await page.locator('.pdf-boxes .pdf-box').all()) {
            assert(await b.evaluate(e => {
                const first = e.closest('[data-page]').dataset.page === '1';
                return parseFloat(e.style.top) < (first ? 16.1 : 9.8) &&
                    parseFloat(e.style.top) + parseFloat(e.style.height) > (first ? 25 : 18.7);
            }));
        }
        await el('pdf-map').click();
        const divider = page.locator('.pdf-barline').first();
        const original = await divider.getAttribute('aria-valuenow');
        await divider.press('ArrowRight');
        assert.notEqual(await divider.getAttribute('aria-valuenow'), original);
        await el('pdf-map').click();
        await page.locator('#pdf-order summary').click();
        await range(3,4,1);
        await range(5,6,3);
        await range(4,4,3); // individual ending override
        await box(3).click();
        await expectVisit(4,3);
        await range(4,4,null);
        await expectVisit(4,null);
        await range(4,4,2);
        await expectVisit(4,2);
        await page.locator('#pdf-order summary').click();
        await box(1).click();
        await expectVisit(3,1);
        await el('pdf-visit').selectOption('0');
        await expectVisit(1,1);
        await box(1).click();
        await el('pdf-visit').selectOption('2');
        await expectVisit(3,1);
        await mode('wait');
        await el('btn-looper').click();
        await el('val-loop-max').fill('4'); await el('val-loop-max').press('Tab');
        await el('val-loop-min').fill('3'); await el('val-loop-min').press('Tab');
        await el('check-looper').check(); await el('check-loop-countin').uncheck();
        await el('btn-looper').click();
        assert.equal(await box(3).evaluate(b => b.classList.contains('outside-loop')), true);
        await box(3).click();
        await expectVisit(3,1);
        await el('btn-play').click();
        await page.waitForFunction(() => AppState.isAudioBusy && AppState.expectedNotes.length > 0);
        const pitches = () => page.evaluate(() => AppState.expectedNotes.map(n => n.midi).sort());
        assert.deepEqual(await pitches(), [48,60]);
        const press = midi => page.evaluate(n => {
            triggerVirtualKey(n,true,'ui'); triggerVirtualKey(n,false,'ui');
        },midi);
        await press(71); await press(60);
        await expectVisit(3,1);
        assert.deepEqual(await page.evaluate(() => AppState.score), {correct:1,wrong:1});
        await press(48);
        await expectVisit(4,2);
        assert.deepEqual(await pitches(), [62]);
        await page.waitForTimeout(350);
        assert.equal(await active(), '2');
        await press(62);
        await expectVisit(3,1);
        assert.deepEqual(await pitches(), [48,60]);
        await el('btn-play').click();
        await el('btn-looper').click(); await el('check-looper').uncheck(); await el('btn-looper').click();
        await el('looper-popup').waitFor({state:'hidden'});
        await mode('realtime');
        await box(1).click();
        await el('btn-tempo').click(); await el('val-speed').fill('150'); await el('val-speed').press('Tab');
        await el('btn-tempo').click();
        await el('btn-play').click();
        await expectVisit(4,2);
        await press(62);
        assert(await page.evaluate(() => AppState.score.correct > 0));
        await expectVisit(5,3);
        await page.waitForFunction(() => document.querySelector('#pdf-page').value === '2' &&
            document.querySelector('#pdf-scroll').scrollTop > document.querySelector('#pdf-scroll').clientHeight);
        await el('btn-play').click();
        await mode('follow');
        await box(3).click();
        await el('btn-play').click();
        await page.waitForFunction(() => AppState.isAudioBusy && AppState.expectedNotes.length > 0);
        assert.deepEqual(await pitches(), [64]); await press(64);
        await expectVisit(6,4);
        await el('btn-play').click();
        await el('pdf-native').click();
        assert.equal(await el('canvas-wrapper').isVisible(), true);
        await el('btn-scores').click(); await el('pdf-show').click();
        await el('scores-panel').waitFor({state:'hidden'});
        await box(1).click();
        await expectVisit(3,1);
        await el('pdf-position').locator('select').selectOption('0');
        if (process.env.PT_TEST_SCREENSHOTS)
            await page.screenshot({path:path.join(process.env.PT_TEST_SCREENSHOTS,'qa-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        await page.locator('#pdf-order summary').click();
        const bounds = await el('pdf-apply-range').boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= 391);
        if (process.env.PT_TEST_SCREENSHOTS)
            await page.screenshot({path:path.join(process.env.PT_TEST_SCREENSHOTS,'qa-phone.png')});
        await page.locator('#pdf-order summary').click();
        await page.setViewportSize({width:1160,height:800});
        await page.reload();
        await el('file-input').setInputFiles(fixture('mid'));
        await page.waitForFunction(() => !document.getElementById('pdf-attach').disabled);
        await attach();
        await box(1).click(); await el('pdf-visit').selectOption('2');
        await expectVisit(3,1);
        await el('pdf-map').click();
        assert.notEqual(await divider.getAttribute('aria-valuenow'), original);
        await el('pdf-map').click();
        await el('file-input').setInputFiles(fixture('musicxml'));
        await page.waitForFunction(() => document.getElementById('pdf-view').hidden && !document.getElementById('pdf-attach').disabled);
        await attach();
        await box(1).click(); await el('pdf-visit').selectOption('2');
        await expectVisit(3,1);
        assert.equal(await page.evaluate(() => osmd.cursor.Iterator.CurrentMeasureIndex), 0);
        await mode('wait'); await el('btn-play').click();
        await page.waitForFunction(() => AppState.isAudioBusy && AppState.expectedNotes.length > 0);
        await expectVisit(3,1);
        await press(60); await press(48); await expectVisit(4,2);
        await el('btn-play').click();
        assert.deepEqual(errors, []);
        console.log('Companion PDF browser acceptance passed.');
    } catch (error) {
        if (page) console.error('Last practice state', await page.evaluate(() => ({
            label: document.querySelector('#pdf-target')?.textContent,
            status: document.querySelector('#pdf-status')?.textContent,
            playing: AppState.isPlaying, mode: AppState.mode, score: AppState.score,
            expected: AppState.expectedNotes.map(n => [n.midi,n.hit])
        })));
        throw error;
    } finally { await browser.close(); }
}
main().catch(e => {console.error(e);process.exitCode = 1;});
