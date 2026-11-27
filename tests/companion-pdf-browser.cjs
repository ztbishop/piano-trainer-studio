// Run against the normal app server with Playwright and a local Chrome install.
// Uses a disposable browser context, no device permissions or external requests.
const assert = require('node:assert/strict');
const {openPdfMenu} = require('./pdf-menu.cjs');
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
            await page.locator('.scores-tools summary', {hasText:/^PDF$/}).click();
            const [chooser] = await Promise.all([page.waitForEvent('filechooser'), el('pdf-attach').click()]);
            await chooser.setFiles(fixture('pdf'));
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
        async function expectBlankEditor() {
            assert.equal(await el('pdf-map').isVisible(), true);
            assert.equal(await el('pdf-find').isVisible(), true);
            assert.equal(await el('pdf-measure').inputValue(), '1');
            assert.equal(await page.locator('#pdf-view .pdf-box').count(), 0);
        }
        async function scanFromPageTwo() {
            await el('pdf-page').selectOption('2');
            assert.equal(await el('pdf-page').inputValue(), '2');
            await page.evaluate(() => {
                window.scanPages = [];
                const observer = new MutationObserver(records => {
                    for (const record of records) for (const node of record.addedNodes) {
                        const match = /^Finding boxes on page (\d+)/.exec(node.textContent);
                        if (match) window.scanPages.push(Number(match[1]));
                    }
                    if (!document.getElementById('pdf-use-score').hidden) observer.disconnect();
                });
                observer.observe(document.getElementById('pdf-status'), {childList:true});
            });
            await el('pdf-find').click();
            await el('pdf-use-score').waitFor({state:'visible'});
            assert.equal(await el('pdf-page').inputValue(), '1');
            assert.deepEqual(await page.evaluate(() => window.scanPages), [1,2]);
        }
        async function correctProposal(index, action) {
            await el('pdf-action').selectOption(action);
            const proposal = page.locator('#pdf-boxes .pdf-box').nth(index);
            await proposal.scrollIntoViewIfNeeded();
            const rect = await proposal.boundingBox();
            await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
        }
        const savedMap = () => page.evaluate(() => {
            const key = Object.keys(localStorage).find(k => k.startsWith('pt_companionPDF_v1_'));
            return JSON.parse(localStorage.getItem(key));
        });
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
        await expectBlankEditor();
        assert.equal(await savedMap(), null);
        await scanFromPageTwo();
        const previewNumbers = () => page.locator('.pdf-reading-page').evaluateAll(pages =>
            pages.map(p => [...p.querySelectorAll('.pdf-boxes .pdf-box')].map(b => Number(b.textContent))));
        assert.deepEqual(await previewNumbers(), [[1,2],[3,4]]);
        assert.equal(await el('pdf-sheet').isVisible(), false);
        await page.locator('.pdf-reading-page[data-page="2"] .pdf-boxes .pdf-box').first().scrollIntoViewIfNeeded();
        await page.waitForFunction(()=>document.querySelector('#pdf-page').value==='2');
        assert.equal(await savedMap(), null);
        // Edit the later page first. Its explicit numbering survives an earlier correction.
        await el('pdf-correct-page').click();
        await el('pdf-measure').selectOption('4');
        await el('pdf-page').selectOption('1');
        await correctProposal(1, 'remove');
        await el('pdf-use').click();
        assert.deepEqual(await previewNumbers(), [[1],[4,5]]);
        await el('pdf-cancel').click();
        assert.equal(await savedMap(), null);
        await scanFromPageTwo();
        assert.deepEqual(await previewNumbers(), [[1,2],[3,4]]);
        await el('pdf-use-score').click();
        console.log('MIDI import and PDF box geometry', await page.evaluate(() => ({
            measures: osmd.Sheet.SourceMeasures.length, visits: document.querySelector('#pdf-from').length,
            boxes: [...document.querySelectorAll('.pdf-boxes .pdf-box')].map(b => [b.style.left,b.style.top,b.style.width,b.style.height])
        })));
        assert.equal(await el('pdf-from').locator('option').count(), 6);
        for (const width of [1160,390]) {
            await page.setViewportSize({width,height:800});
            const pane = await el('pdf-view').boundingBox();
            const paper = await el('pdf-scroll').boundingBox();
            assert(Math.abs(pane.height-paper.height)<1 && Math.abs(pane.y-paper.y)<1);
            assert(!await el('pdf-target').isVisible());
            await openPdfMenu(page);
            const button = await el('pdf-start-marking').boundingBox();
            assert(button.x>=0 && button.x+button.width<=width);
            if (process.env.PT_TEST_SCREENSHOTS) await page.screenshot({path:path.join(process.env.PT_TEST_SCREENSHOTS,'pt-pdf-menu-'+width+'.png')});
            await el('pdf-page').selectOption('2');
            await openPdfMenu(page); await el('pdf-start-marking').click();
            assert.equal(await el('pdf-sheet').evaluate(s=>s.closest('[data-page]').dataset.page),'2');
            await el('pdf-map').click();
            assert(!await el('pdf-tools').isVisible());
            await openPdfMenu(page); await el('pdf-page').selectOption('1');
        }
        await page.setViewportSize({width:1160,height:800});
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
        await openPdfMenu(page);
        await el('pdf-start-marking').click();
        // Correct the first page and carry its count to page two.
        await scanFromPageTwo();
        await page.setViewportSize({width:390,height:844});
        const accept = await el('pdf-use-score').boundingBox();
        assert(accept.x >= 0 && accept.x + accept.width <= 390);
        assert((await el('pdf-scroll').boundingBox()).height > 80);
        if (process.env.PT_TEST_SCREENSHOTS) await page.screenshot({path:path.join(process.env.PT_TEST_SCREENSHOTS,'pt-whole-score-phone.png')});
        await page.setViewportSize({width:1160,height:800});
        await el('pdf-correct-page').click();
        await correctProposal(1, 'remove');
        await el('pdf-use').click();
        assert.deepEqual(await previewNumbers(), [[1],[2,3]]);
        await el('pdf-page').selectOption('2');
        await el('pdf-correct-page').click();
        assert.equal(await el('pdf-measure').inputValue(), '2');
        await el('pdf-use').click();
        await el('pdf-use-score').click();
        const corrected = await savedMap();
        assert.deepEqual(Object.values(corrected.boxes).map(b => b.page), [1,2,2]);
        await page.reload();
        await el('file-input').setInputFiles(fixture('mid'));
        await page.waitForFunction(() => !document.getElementById('pdf-attach').disabled);
        await attach();
        assert.equal(await el('pdf-map').isVisible(), false);
        assert.equal(await page.locator('.pdf-boxes .pdf-box').count(), 3);
        assert.equal(await box(2).evaluate(b => b.closest('[data-page]').dataset.page), '2');
        assert.deepEqual(await savedMap(), corrected);
        await openPdfMenu(page);
        await el('pdf-start-marking').click();
        await scanFromPageTwo();
        await el('pdf-use-score').click();
        assert.equal(await page.locator('.pdf-boxes .pdf-box').count(), 4);
        await openPdfMenu(page);
        await el('pdf-start-marking').click();
        const divider = page.locator('.pdf-barline').first();
        await el('pdf-page').selectOption('1');
        const original = await divider.getAttribute('aria-valuenow');
        await divider.press('ArrowRight');
        assert.notEqual(await divider.getAttribute('aria-valuenow'), original);
        await el('pdf-measure').selectOption('4');
        const lastBox = page.locator('#pdf-boxes .pdf-box', {hasText:/^4$/});
        await lastBox.scrollIntoViewIfNeeded();
        const last = await lastBox.boundingBox();
        await page.mouse.move(last.x + 2, last.y + 2);
        await page.mouse.down();
        await page.mouse.move(last.x + last.width - 2, last.y + last.height - 2);
        await page.mouse.up();
        const handMarked = await savedMap();
        assert(!handMarked.boxes[4].automatic);
        await el('pdf-find-page').click();
        await el('pdf-use').waitFor({state:'visible'});
        assert.equal(await el('pdf-page').inputValue(), '2');
        assert.equal(await el('pdf-use-score').isVisible(), false);
        await el('pdf-use').click();
        assert.deepEqual(await savedMap(), handMarked);
        await scanFromPageTwo();
        await el('pdf-correct-page').click();
        await correctProposal(0, 'join');
        assert.equal(await el('pdf-use-score').isDisabled(), true);
        assert.match(await el('pdf-status').textContent(), /Measure 2 belongs to page 1.*page 2/);
        await el('pdf-use').click();
        await el('pdf-page').selectOption('2');
        await el('pdf-correct-page').click();
        assert.equal(await el('pdf-measure').inputValue(), '2');
        assert.equal(await el('pdf-use-score').isDisabled(), true);
        assert.deepEqual(await savedMap(), handMarked);
        await el('pdf-cancel').click();
        await scanFromPageTwo();
        await el('pdf-use-score').click();
        assert.deepEqual((await savedMap()).boxes[1], handMarked.boxes[1]);
        assert.deepEqual((await savedMap()).boxes[2], handMarked.boxes[2]);
        assert.deepEqual((await savedMap()).boxes[4], handMarked.boxes[4]);
        await openPdfMenu(page);
        await el('pdf-start-order').click();
        await range(1,1,null);
        await box(1).click();
        assert.match(await el('pdf-status').textContent(), /Printed measure 1 has no score visit/);
        assert.equal(await el('pdf-from').inputValue(),'1');
        assert.equal(await el('pdf-through').inputValue(),'1');
        assert.equal(await el('pdf-first').inputValue(),'1');
        await el('pdf-apply-range').click();
        await box(4).click(); await expectVisit(4,4);
        await el('btn-reset').click(); await expectVisit(1,1);
        await openPdfMenu(page);
        await el('pdf-page').selectOption('2');
        await el('btn-reset').click();
        await page.waitForFunction(()=>document.querySelector('#pdf-page').value==='1' &&
            document.querySelector('.pdf-boxes .current').getBoundingClientRect().top <
            document.querySelector('#pdf-scroll').getBoundingClientRect().bottom);
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
        await openPdfMenu(page);
        await el('pdf-visit').selectOption('0');
        await expectVisit(1,1);
        await box(1).click();
        await openPdfMenu(page);
        await el('pdf-visit').selectOption('2');
        await expectVisit(3,1);
        await openPdfMenu(page);
        assert.equal(await el('pdf-beat-guide').isChecked(), false);
        await el('pdf-beat-guide').check();
        await el('btn-scores').click();
        await el('scores-panel').waitFor({state:'hidden'});
        assert.equal(await el('pdf-pages').evaluate(p => p.style.getPropertyValue('--pdf-beat-width')), 'max(5px, 0%)');
        await mode('wait');
        await el('btn-looper').click();
        await el('val-loop-max').fill('4'); await el('val-loop-max').press('Tab');
        await el('val-loop-min').fill('3'); await el('val-loop-min').press('Tab');
        await el('check-looper').check(); await el('check-loop-countin').uncheck();
        await el('btn-looper').click();
        assert.equal(await box(3).evaluate(b => b.classList.contains('outside-loop')), true);
        await box(3).click();
        assert.match(await el('pdf-status').textContent(), /outside the current loop \(3–4\)/);
        await expectVisit(3,1);
        await el('btn-play').click();
        await page.waitForFunction(() => AppState.isAudioBusy && AppState.expectedNotes.length > 0);
        const pitches = () => page.evaluate(() => AppState.expectedNotes.map(n => n.midi).sort());
        assert.deepEqual(await pitches(), [48,60]);
        const press = midi => page.evaluate(n => {
            triggerVirtualKey(n,true,'ui'); triggerVirtualKey(n,false,'ui');
        },midi);
        const stripColor = () => box(1).evaluate(b => getComputedStyle(b, '::after').backgroundColor);
        await page.evaluate(() => triggerVirtualKey(71,true,'ui'));
        assert.equal(await stripColor(), 'rgb(181, 45, 48)');
        await page.evaluate(() => triggerVirtualKey(71,false,'ui'));
        assert.equal(await stripColor(), 'rgb(18, 101, 160)');
        await press(60);
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
        await openPdfMenu(page);
        await el('pdf-native').click();
        assert.equal(await el('canvas-wrapper').isVisible(), true);
        await el('btn-scores').click();
        await page.locator('.scores-tools summary', {hasText:'PDF'}).click();
        await el('pdf-show').click();
        await el('scores-panel').waitFor({state:'hidden'});
        await box(1).click();
        await expectVisit(3,1);
        await openPdfMenu(page);
        await el('pdf-position').locator('select').selectOption('0');
        if (process.env.PT_TEST_SCREENSHOTS)
            await page.screenshot({path:path.join(process.env.PT_TEST_SCREENSHOTS,'qa-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        await openPdfMenu(page);
        await el('pdf-start-order').click();
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
        await openPdfMenu(page);
        await el('pdf-start-marking').click();
        await scanFromPageTwo();
        await el('pdf-use-score').click();
        await box(1).click();
        await expectVisit(1,1);
        await box(1).click();
        await openPdfMenu(page);
        await el('pdf-visit').selectOption('2');
        await expectVisit(3,1);
        await openPdfMenu(page);
        await el('pdf-start-marking').click();
        assert.notEqual(await divider.getAttribute('aria-valuenow'), original);
        await el('pdf-map').click();
        await el('file-input').setInputFiles(fixture('musicxml'));
        await page.waitForFunction(() => document.getElementById('pdf-view').hidden && !document.getElementById('pdf-attach').disabled);
        await attach();
        // The same PDF paired with a different score starts blank. Hand-mark
        // the first grand-staff measure, then reopen this partial map.
        await expectBlankEditor();
        const sheet = await el('pdf-sheet').boundingBox();
        await page.mouse.move(sheet.x + sheet.width * .12, sheet.y + sheet.height * .145);
        await page.mouse.down();
        await page.mouse.move(sheet.x + sheet.width * .56, sheet.y + sheet.height * .26);
        await page.mouse.up();
        assert.equal(await el('pdf-measure').inputValue(), '2');
        await page.reload();
        await el('file-input').setInputFiles(fixture('musicxml'));
        await page.waitForFunction(() => !document.getElementById('pdf-attach').disabled);
        await attach();
        assert.equal(await el('pdf-map').isVisible(), false);
        assert.equal(await page.locator('.pdf-boxes .pdf-box').count(), 1);
        await box(1).click(); await expectVisit(1,1);
        await openPdfMenu(page);
        await el('pdf-start-marking').click();
        await scanFromPageTwo();
        await el('pdf-correct-page').click();
        await el('pdf-measure').selectOption('2');
        assert.equal(await el('pdf-use-score').isDisabled(), true);
        assert.match(await el('pdf-status').textContent(), /last written measure \(4\)/);
        await el('pdf-measure').selectOption('1');
        await el('pdf-use-score').click();
        await page.reload();
        await el('file-input').setInputFiles(fixture('musicxml'));
        await page.waitForFunction(() => !document.getElementById('pdf-attach').disabled);
        await attach();
        await box(1).click(); await expectVisit(1,1);
        await box(1).click();
        await openPdfMenu(page);
        await el('pdf-visit').selectOption('2');
        await expectVisit(3,1);
        assert.equal(await page.evaluate(() => osmd.cursor.Iterator.CurrentMeasureIndex), 0);
        await mode('wait'); await el('btn-play').click();
        await page.waitForFunction(() => AppState.isAudioBusy && AppState.expectedNotes.length > 0);
        await expectVisit(3,1);
        await press(60); await press(48); await expectVisit(4,2);
        await el('btn-play').click();
        if (process.env.PT_BEAT_SCORE && process.env.PT_BEAT_PDF) {
            await el('file-input').setInputFiles(process.env.PT_BEAT_SCORE);
            await page.waitForFunction(() => osmd.Sheet?.SourceMeasures.length > 6 && !document.querySelector('#pdf-attach').disabled);
            await el('pdf-file').setInputFiles(process.env.PT_BEAT_PDF);
            await el('pdf-find').click();
            await el('pdf-use-score').click({timeout:120000});
            await openPdfMenu(page);
            await el('pdf-beat-guide').check();
            const widths = await page.evaluate(() => {
                const it = osmd.Sheet.MusicPartManager.getIterator();
                const widths = [];
                while (!it.EndReached && it.CurrentMeasureIndex === 0) {
                    CompanionPDF.position(it);
                    const box = document.querySelector('#pdf-pages .pdf-box.current');
                    widths.push(parseFloat(getComputedStyle(box, '::after').width) / box.clientWidth);
                    it.moveToNext();
                }
                return widths;
            });
            console.log('First measure progress fractions', widths);
            assert(widths.length > 3 && widths[0] < 0.1 && widths.at(-1) > 0.7);
            assert(widths.every((w,i) => w <= 1 && (!i || w >= widths[i-1])));
        }
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
