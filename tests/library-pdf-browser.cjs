// Run against the local app server with Playwright and Chrome. All profiles are disposable.
const assert = require('node:assert/strict');
const {openPdfMenu} = require('./pdf-menu.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const origin = process.env.PT_TEST_ORIGIN || 'http://127.0.0.1:5500';
const fixture = ext => path.join(__dirname, 'fixtures', 'grand-staff-repeat.' + ext);

async function main() {
    const browser = await chromium.launch({channel:'chrome', args:['--mute-audio']});
    let page;
    const errors = [];
    const el = id => page.locator('#' + id);
    async function profile(legacyScore) {
        const context = await browser.newContext({viewport:{width:1160,height:800}});
        await context.route(/^https?:/, route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
        await context.addInitScript(() => {
            localStorage.setItem('pt_firstRunIntroSeen','true');
            Object.defineProperty(navigator,'requestMIDIAccess',{value:undefined});
        });
        page = await context.newPage();
        page.setDefaultTimeout(12000);
        page.on('pageerror', error => errors.push(error.message));
        if (legacyScore) {
            await page.route(origin+'/migration-test', route => route.fulfill({contentType:'text/html',body:'<title>Version 1 fixture</title>'}));
            await page.goto(origin+'/migration-test');
            await page.evaluate(score => new Promise((resolve,reject) => {
                const req = indexedDB.open('pianoTrainerLibrary',1);
                req.onupgradeneeded = () => {
                    const folders = req.result.createObjectStore('folders',{keyPath:'id'});
                    folders.createIndex('by_name','name');
                    const scores = req.result.createObjectStore('scores',{keyPath:'id'});
                    for (const key of ['folderId','lastOpenedAt','title']) scores.createIndex('by_'+key,key);
                    scores.add({...score,rawData:score.rawData.text});
                };
                req.onerror = () => reject(req.error);
                req.onsuccess = () => { req.result.close(); resolve(); };
            }),legacyScore);
        }
        await page.goto(origin);
    }
    async function drawer() {
        if (!await el('scores-panel').isVisible()) await el('btn-scores').click();
        await el('scores-panel').waitFor({state:'visible'});
    }
    async function midi(input) {
        await el('file-input').setInputFiles(input);
        await page.waitForFunction(() => !document.querySelector('#pdf-attach').disabled && document.querySelector('#pdf-view').hidden);
    }
    async function attach(input = fixture('pdf')) {
        await drawer();
        await page.locator('.scores-tools summary', {hasText:/^PDF$/}).click();
        const [picker] = await Promise.all([page.waitForEvent('filechooser'), el('pdf-attach').click()]);
        await picker.setFiles(input);
        await el('scores-panel').waitFor({state:'hidden'});
        await el('pdf-view').waitFor({state:'visible'});
    }
    async function save(title) {
        await drawer();
        if (!title) {
            for (const width of [390,1160]) {
                await page.setViewportSize({width,height:800});
                for (const button of ['btn-scores-save-current','btn-scores-save-copy']) {
                    const rect = await el(button).boundingBox();
                    assert(rect && rect.x >= 0 && rect.x + rect.width <= width);
                }
                if (width === 390) {
                    await el('scores-library-tools').click();
                    const rect = await el('btn-scores-import-library').boundingBox();
                    assert(rect && rect.x >= 0 && rect.x + rect.width <= width);
                    await el('scores-library-tools').press('Escape');
                }
                if (process.env.PT_TEST_SCREENSHOTS) await el('scores-panel').screenshot({
                    path:path.join(process.env.PT_TEST_SCREENSHOTS,'library-pdf-'+width+'.png')
                });
            }
        }
        await el('btn-scores-save-current').click();
        if (title) {
            await page.getByLabel('Score title').fill(title);
            await page.getByRole('button',{name:'Save',exact:true}).click();
            await page.locator('dialog').getByRole('button',{name:'Unfiled',exact:true}).click();
        }
        await page.waitForFunction(() => document.querySelector('#scores-status').textContent.startsWith('Saved ') &&
            document.querySelector('#scores-panel').getAttribute('aria-busy') === 'false');
        await el('btn-scores').click();
        await el('scores-panel').waitFor({state:'hidden'});
    }
    async function openScore(title, marking = false) {
        await drawer();
        await page.locator('.scores-item-button').filter({has:page.getByText(title,{exact:true})}).click();
        await el('scores-panel').waitFor({state:'hidden'});
        await el('pdf-view').waitFor({state:'visible'});
        assert.equal(await el('pdf-map').isVisible(),marking);
    }
    async function forget(accept) {
        await openPdfMenu(page);
        const button = el('pdf-forget');
        const bounds = await button.boundingBox();
        assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width);
        if (process.env.PT_TEST_SCREENSHOTS) await page.screenshot({
            path:path.join(process.env.PT_TEST_SCREENSHOTS,'pdf-forget-'+page.viewportSize().width+'.png')
        });
        const dialog = page.waitForEvent('dialog').then(async dialog => {
            const prompt = dialog.message();
            if (accept) await dialog.accept(); else await dialog.dismiss();
            return prompt;
        });
        await button.click();
        assert.match(await dialog,/grand-staff-repeat\.pdf/);
    }
    const cachedPairs = () => page.evaluate(() => Object.fromEntries(
        Object.entries(localStorage).filter(([key]) => key.startsWith('pt_companionPDF_v1_'))));
    async function expectFreshMap() {
        assert(await el('pdf-find').isVisible());
        assert.equal(await el('pdf-page').inputValue(),'1');
        assert.equal(await el('pdf-measure').inputValue(),'1');
        assert.equal(await page.locator('#pdf-view .pdf-box').count(),0);
        assert.deepEqual(await page.evaluate(()=>CompanionPDF.attachment().pdf.mapping),[1,2,3,4,5,6]);
    }
    async function scan() {
        await el('pdf-find').click();
        await el('pdf-use-score').click();
    }
    const scores = () => page.evaluate(() => ScoreLibrary.getAllScores());
    const assetCount = () => page.evaluate(() => ScoreLibrary.transaction(['pdfs'],'readonly',({pdfs}) => ScoreLibrary.requestToPromise(pdfs.count())));
    async function importBackup(payload) {
        await drawer();
        await el('scores-library-tools').click();
        const [picker] = await Promise.all([page.waitForEvent('filechooser'), el('btn-scores-import-library').click()]);
        await picker.setFiles({name:'Library.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
        await page.locator('dialog').getByRole('button',{name:'Import',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#scores-status').textContent.startsWith('Backup merged:') &&
            document.querySelector('#scores-panel').getAttribute('aria-busy') === 'false');
    }
    async function range(first, last, printed) {
        await el('pdf-from').selectOption(String(first));
        await el('pdf-through').selectOption(String(last));
        await el('pdf-first').fill(String(printed));
        await el('pdf-apply-range').click();
    }
    async function verifyPlayback(expected) {
        const target = page.locator('.pdf-reading-page[data-page="2"] button[data-measure="3"]');
        assert(Math.abs(await target.evaluate(b => parseFloat(b.style.width)) - 100*expected.w) < .0001);
        await page.locator('.pdf-boxes button[data-measure="2"]').click();
        await openPdfMenu(page);
        await el('pdf-visit').selectOption('3'); // visit 4, last measure before page two
        await el('btn-practice').click(); await el('mode-realtime').check(); await el('btn-practice').click();
        await el('btn-play').click();
        await page.waitForFunction(() => AppState.isPlaying && document.querySelector('#pdf-target').textContent.startsWith('Visit 5 ·') &&
            document.querySelector('.pdf-reading-page[data-page="2"] .pdf-box.current')?.dataset.measure === '3');
        await el('btn-play').click();
    }
    try {
        await profile();
        await midi(fixture('mid')); await attach(); await scan();
        await openPdfMenu(page); await el('pdf-start-order').click(); await range(3,4,1);
        const originalCache = await cachedPairs();
        assert.equal(Object.keys(originalCache).length,1);
        await page.setViewportSize({width:390,height:844});
        await forget(false);
        assert.deepEqual(await cachedPairs(),originalCache);
        await openPdfMenu(page); await el('pdf-start-marking').click();
        await el('pdf-page').selectOption('2');
        await el('pdf-find-page').click();
        await el('pdf-use').waitFor({state:'visible'});
        await forget(true);
        await expectFreshMap();
        assert.deepEqual(await cachedPairs(),{});
        assert.deepEqual(await scores(),[]);
        await page.reload(); await midi(fixture('mid')); await attach(); await expectFreshMap();
        await page.setViewportSize({width:1160,height:800});
        await scan();
        await openPdfMenu(page);
        await el('pdf-start-order').click(); await range(3,4,1); await range(5,6,3);
        await page.locator('#pdf-order summary').click();
        await save('Piano A');
        const [first] = await scores();
        assert.equal(first.pdf.fileName,'grand-staff-repeat.pdf');
        await openPdfMenu(page);
        await el('pdf-start-marking').click(); await el('pdf-page').selectOption('2');
        await el('pdf-measure').selectOption('4');
        const lastBox = page.locator('#pdf-boxes .pdf-box',{hasText:/^4$/});
        await lastBox.scrollIntoViewIfNeeded();
        const last = await lastBox.boundingBox();
        await el('pdf-remove').click();
        assert.equal((await scores())[0].pdf.boxes[4],undefined);
        await page.mouse.move(last.x+1,last.y+1); await page.mouse.down();
        await page.mouse.move(last.x+last.width,last.y+last.height); await page.mouse.up();
        assert.equal((await scores())[0].pdf.boxes[4].page,2);
        await page.locator('#pdf-boxes .pdf-barline').press('ArrowRight');
        await el('pdf-map').click();
        const corrected = (await scores())[0].pdf;
        assert.notEqual(corrected.boxes[3].w,first.pdf.boxes[3].w);
        assert.deepEqual(corrected.mapping,[1,2,1,2,3,4]);
        await page.reload(); await openScore('Piano A'); await verifyPlayback(corrected.boxes[3]);

        // Change the two explicit C4 attacks and releases to E4 in the fixture.
        const arrangement = await fs.readFile(fixture('mid'));
        for (let i=0; i<arrangement.length-2; i++) if (arrangement[i]===0x90 && arrangement[i+1]===60) arrangement[i+1]=64;
        await midi({name:'arrangement-b.mid',mimeType:'audio/midi',buffer:arrangement});
        await save('Piano B'); await attach(); await scan(); await save();
        const both = await scores();
        assert.equal(both.length,2); assert.equal(await assetCount(),1);
        const second = both.find(s=>s.title==='Piano B');
        assert.deepEqual(second.pdf.mapping,[1,2,3,4,5,6]);
        assert.equal(second.pdf.hash,first.pdf.hash);
        assert.notEqual(second.pdf.boxes[3].w,corrected.boxes[3].w);

        await drawer(); await el('scores-library-tools').click();
        const [download] = await Promise.all([page.waitForEvent('download'),el('btn-scores-export-library').click()]);
        const backup = JSON.parse(await fs.readFile(await download.path(),'utf8'));
        assert.equal(backup.version,2); assert.equal(backup.pdfs.length,1);
        assert.deepEqual(Buffer.from(backup.pdfs[0].data,'base64'),await fs.readFile(fixture('pdf')));
        await el('btn-scores').click(); await el('scores-panel').waitFor({state:'hidden'});
        const pairA = Object.keys(originalCache)[0];
        const beforeForget = await cachedPairs();
        assert.equal(Object.keys(beforeForget).length,2);
        await openPdfMenu(page); await el('pdf-native').click();
        await forget(true); await expectFreshMap();
        assert.deepEqual(await cachedPairs(),{[pairA]:beforeForget[pairA]});
        await page.reload(); await openScore('Piano B', true); await expectFreshMap();
        assert.deepEqual((await scores()).find(s=>s.id===second.id).pdf,{...second.pdf,boxes:{}});
        assert.deepEqual((await scores()).find(s=>s.id===first.id).pdf,corrected);
        assert.equal(await assetCount(),1);
        // Replace B's attachment with another valid PDF stream, then switch it back.
        const changedBytes = Buffer.concat([await fs.readFile(fixture('pdf')),Buffer.from('\n% Alternate edition\n')]);
        await attach({name:'alternate.pdf',mimeType:'application/pdf',buffer:changedBytes});
        await save();
        assert.equal(await assetCount(),2);
        const replaced = (await scores()).find(s=>s.id===second.id);
        assert.notEqual(replaced.pdf.hash,first.pdf.hash);
        assert.equal(replaced.pdf.fileName,'alternate.pdf');
        await attach(); await save();
        assert.equal(await assetCount(),1);
        await attach({name:'B edition.pdf',mimeType:'application/pdf',buffer:await fs.readFile(fixture('pdf'))});
        await save();
        assert.equal((await scores()).find(s=>s.id===second.id).pdf.fileName,'B edition.pdf');
        assert.equal(await assetCount(),1);
        await page.context().close();

        await profile(); assert.equal((await scores()).length,0);
        const rejected = await page.evaluate(async data => {
            const errors = [];
            for (const corrupt of [
                b => {b.pdfs[0].hash = 'invalid';},
                b => {b.scores[0].pdf.hash = 'missing';},
                b => {b.scores[0].pdf.boxes[3].w = -1;}
            ]) {
                const copy = structuredClone(data); corrupt(copy);
                try { await ScoreLibrary.importBackup(copy); }
                catch (error) { errors.push(error.message); }
            }
            return errors;
        },backup);
        assert.equal(rejected.length,3);
        assert.equal((await scores()).length,0); assert.equal(await assetCount(),0);
        await importBackup(backup);
        let pickers = 0; page.on('filechooser', () => pickers++);
        await openScore('Piano A'); await verifyPlayback(corrected.boxes[3]);
        assert.equal(pickers,0);
        assert.deepEqual((await scores()).find(s=>s.id===first.id).pdf,corrected);
        const tampered = structuredClone(backup);
        tampered.scores.find(s=>s.id===first.id).pdf.boxes[3].w /= 2;
        await importBackup(tampered);
        assert.deepEqual((await scores()).find(s=>s.id===first.id).pdf,corrected);
        await drawer();
        await page.getByRole('button',{name:'Actions for Piano B',exact:true}).click();
        page.once('dialog',dialog=>dialog.accept());
        await page.getByRole('button',{name:'Delete',exact:true}).click();
        await page.waitForFunction(async()=> (await ScoreLibrary.getAllScores()).length===1);
        assert.equal(await assetCount(),1);
        await page.reload(); await openScore('Piano A'); await verifyPlayback(corrected.boxes[3]);
        await page.evaluate(id=>ScoreLibrary.deleteScores([id]),first.id);
        assert.equal(await assetCount(),0);

        const legacy = {version:1,folders:backup.folders,scores:backup.scores.map(({pdf,...s})=>s)};
        await importBackup(legacy); await importBackup(backup);
        assert.equal((await scores()).length,2); assert.equal(await assetCount(),1);
        assert.deepEqual((await scores()).find(s=>s.id===first.id).pdf,corrected);
        await page.context().close();
        await profile(legacy.scores[0]);
        assert.equal((await scores()).length,1);
        assert.equal(await page.evaluate(async()=>(await ScoreLibrary.init()).version),2);
        await importBackup(backup); assert.equal((await scores()).length,2);
        await openScore('Piano A'); await verifyPlayback(corrected.boxes[3]);
        const folderResult = await page.evaluate(async () => {
            const folder = await ScoreLibrary.createFolder('PDF folder');
            const [a,b] = await ScoreLibrary.getAllScores();
            await ScoreLibrary.moveScoresToFolder([a.id],folder.id);
            const scoped = await ScoreLibrary.exportBackup(folder.id);
            await ScoreLibrary.deleteFolderAndScores(folder.id);
            const remaining = await ScoreLibrary.getScoreById(b.id);
            const asset = await ScoreLibrary.getPdf(remaining.pdf.hash);
            return [scoped.scores.length,scoped.pdfs.length,!!asset];
        });
        assert.deepEqual(folderResult,[1,1,true]);
        assert.deepEqual(errors,[]);
        console.log('Passed PDF save, autosave, pair-specific reset, reopen, playback, deduplication, backup, merge and last-reference deletion.');
    } catch (error) {
        console.error('Scores drawer:', await el('scores-panel').innerText(), errors);
        throw error;
    } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
