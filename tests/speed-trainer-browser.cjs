// Run against the local app server in a disposable Chrome profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const origin = process.env.PT_TEST_ORIGIN || 'http://127.0.0.1:5500';
const fixture = fs.readFileSync(path.join(__dirname,'fixtures','grand-staff-repeat.musicxml'),'utf8');
const tempo = bpm => `<direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`;
const score = fixture.replace('<barline location="left">',tempo(300)+'<barline location="left">')
    .replace('<measure number="2">','<measure number="2">'+tempo(360));

async function main() {
    const browser = await chromium.launch({channel:'chrome',args:['--mute-audio']});
    const page = await browser.newPage({viewport:{width:1280,height:820}});
    const el = id => page.locator('#'+id);
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    await page.route(/^https?:/,r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.addInitScript(() => {
        localStorage.setItem('pt_firstRunIntroSeen','true');
        Object.defineProperty(navigator,'requestMIDIAccess',{value:undefined});
    });
    async function loopMenu() {
        if (await el('looper-popup').isVisible()) return;
        if (await el('btn-looper').isVisible()) await el('btn-looper').click();
        else { await el('btn-more').click(); await el('btn-more-loop').click(); }
    }
    async function enable() {
        await loopMenu(); await el('training-action').click();
        assert.equal(await el('training-summary').textContent(),'Speed Trainer · 60%');
        assert.equal(await el('val-speed').inputValue(),'60');
        assert.equal(await el('training-start').isDisabled(),true);
        assert.equal(await page.getByRole('button',{name:'Increase Start (%)',exact:true}).isDisabled(),true);
        assert.equal(await page.evaluate(()=>AppState.isPlaying),false);
    }
    const pause = () => el('btn-play').click();
    async function load(xml) {
        await el('file-input').setInputFiles({name:'study.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
        await page.waitForFunction(expected=>AppState.currentScoreData===expected && !document.querySelector('#pdf-attach').disabled,xml);
    }
    async function screenshot(label) {
        if (process.env.PT_TEST_SCREENSHOTS) await el('looper-popup').screenshot({path:path.join(process.env.PT_TEST_SCREENSHOTS,label+'.png')});
    }
    try {
        await page.goto(origin);
        await loopMenu();
        const summary = el('training-summary');
        assert.equal(await summary.evaluate(s=>s.parentElement.open),false);
        await summary.press('Enter');
        assert.equal(await el('training-start').isDisabled(),true);
        await load(score); await loopMenu();
        assert.deepEqual(await page.evaluate(()=>{
            const it=osmd.Sheet.MusicPartManager.getIterator(), indices=[];
            while(!it.EndReached) { indices.push(it.CurrentMeasureIndex); it.moveToNext(); }
            return indices;
        }),[0,1,0,1,2,3]);
        if (!await summary.evaluate(s=>s.parentElement.open)) await summary.click();
        assert.equal(await el('training-action').isDisabled(),true);
        await el('check-looper').check();
        await el('val-loop-max').fill('2'); await el('val-loop-max').press('Tab');
        const shaded = () => page.evaluate(()=>GeometryEngine.getLooperGroup().querySelectorAll('rect[fill^="rgba"]').length);
        assert.equal(await shaded(),2);
        for (const [field,value] of Object.entries({start:60,target:100,step:5,every:2})) {
            const input = el('training-'+field);
            const label = await input.evaluate(e=>e.labels[0].textContent);
            assert.equal(await input.inputValue(),String(value));
            await input.click(); await input.press('ControlOrMeta+a'); await input.pressSequentially(String(value+2));
            await page.getByRole('button',{name:'Decrease '+label,exact:true}).click();
            assert.equal(await input.inputValue(),String(value+1));
            await page.getByRole('button',{name:'Increase '+label,exact:true}).press('Enter');
            assert.equal(await input.inputValue(),String(value+2));
            await input.fill(String(value));
        }
        await el('training-target').fill('60'); await el('training-action').click();
        assert.equal(await el('training-target').evaluate(e=>e.validity.customError),true);
        await el('training-target').fill('68');
        await screenshot('desktop-expanded');
        await summary.click(); await screenshot('desktop-collapsed'); await summary.press('Space');
        await page.setViewportSize({width:390,height:844}); await loopMenu();
        const fields = await page.locator('#training-fields input').evaluateAll(inputs=>inputs.map(i=>i.getBoundingClientRect().toJSON()));
        assert(fields.every(r=>r.x>=0 && r.right<=390 && r.width>0)); assert(fields[3].y>fields[0].y);
        await page.getByRole('button',{name:'Increase Speed increase (%)',exact:true}).click();
        assert.equal(await el('training-step').inputValue(),'6');
        await page.getByRole('button',{name:'Decrease Speed increase (%)',exact:true}).click();
        await screenshot('phone-expanded'); await summary.click(); await screenshot('phone-collapsed'); await summary.press('Enter');
        await page.setViewportSize({width:1280,height:820});
        await page.evaluate(()=>{
            window.trace = [];
            const state = () => ({speed:Number(document.querySelector('#val-speed').value),base:AppState.baseBpm,
                time:performance.now(),position:osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue});
            const click = playMetronomeClick, note = schedulePlaybackForDestinations, grade = processMissedNotes;
            playMetronomeClick = function(...args) {
                if (AppState.countInActive) trace.push({kind:'count',...state()});
                return click(...args);
            };
            schedulePlaybackForDestinations = function(pitch,...args) {
                if (pitch>=60) trace.push({kind:'note',pitch,...state()});
                return note(pitch,...args);
            };
            processMissedNotes = function(...args) {
                const result = grade(...args);
                trace.push({kind:'graded',...state()}); return result;
            };
            const analyser = Tone.getContext().rawContext.createAnalyser();
            masterPianoVolume.connect(analyser);
            const data = new Float32Array(analyser.fftSize);
            window.audioPeak=0;
            setInterval(()=>{analyser.getFloatTimeDomainData(data); for (const v of data) audioPeak=Math.max(audioPeak,Math.abs(v));},20);
        });
        for (const countIn of [false,true]) {
            await loopMenu(); await el('check-loop-countin').setChecked(countIn); await enable();
            assert.equal(await shaded(),2);
            await summary.click(); assert.equal(await summary.textContent(),'Speed Trainer · 60%');
            await page.evaluate(()=>{trace.length=0; audioPeak=0;}); await el('btn-play').click();
            await page.waitForFunction(()=>trace.filter(e=>e.kind==='note' && e.position===0).length>=6,null,{timeout:60000});
            await pause();
            const events = await page.evaluate(()=>trace);
            const notes = events.filter(e=>e.kind==='note');
            const starts = notes.filter(e=>e.position===0).slice(0,6);
            assert.deepEqual(starts.map(e=>e.speed),[60,60,65,65,68,68]);
            for (let i=0;i<5;i++) {
                const pass=events.filter(e=>e.time>=starts[i].time && e.time<starts[i+1].time);
                const played=pass.filter(e=>e.kind==='note');
                assert.deepEqual(played.map(e=>e.pitch),[60,62,60,62]);
                assert(played.every(e=>e.speed===starts[i].speed));
                const grades=pass.filter(e=>e.kind==='graded');
                assert.equal(grades.length,4); assert.equal(grades.at(-1).speed,starts[i].speed);
                const clicks=pass.filter(e=>e.kind==='count');
                assert.equal(clicks.length,countIn?2:0);
                if (countIn) {
                    assert(clicks.every(c=>c.base===300 && c.speed===starts[i+1].speed));
                    assert(Math.abs(clicks[1].time-clicks[0].time-6000000/(300*starts[i+1].speed))<80);
                }
                assert(Math.abs(played[1].time-played[0].time-12000000/(300*starts[i].speed))<100);
            }
            assert((await page.evaluate(()=>audioPeak))>.001);
            console.log('Loop count-in',countIn,'pass speeds',starts.map(e=>e.speed),'audio peak',await page.evaluate(()=>audioPeak));
            await loopMenu(); await summary.click(); await el('training-action').click();
            assert.equal(await el('val-speed').inputValue(),'68');
        }
        await el('check-loop-countin').uncheck(); await enable();
        await page.evaluate(()=>{trace.length=0;}); await el('btn-play').click();
        await page.waitForFunction(()=>trace.filter(e=>e.kind==='note').length===6);
        await pause();
        assert.match(await el('training-status').textContent(),/1 of 2/);
        await el('btn-play').click();
        await page.waitForFunction(()=>document.querySelector('#val-speed').value==='65');
        await pause(); await el('btn-reset').click();
        assert.equal(await el('val-speed').inputValue(),'60');
        // Use the notation click path to enter measure two halfway through a pass.
        await page.evaluate(()=>{
            const b=GeometryEngine.getMeasureBox(1,0);
            const svg=document.querySelector('#canvas-wrapper svg');
            const p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(svg.getScreenCTM());
            document.querySelector('#canvas-wrapper').dispatchEvent(new MouseEvent('click',{clientX:p.x,clientY:p.y,bubbles:true}));
        });
        assert.equal(await page.evaluate(()=>osmd.cursor.Iterator.CurrentMeasureIndex),1);
        await page.evaluate(()=>{trace.length=0;}); await el('btn-play').click();
        await page.waitForFunction(()=>trace.some(e=>e.kind==='note' && e.position===0));
        assert.match(await el('training-status').textContent(),/0 of 2/);
        await pause(); await loopMenu();
        await el('val-loop-min').fill('2'); await el('val-loop-min').press('Tab');
        assert.equal(await page.evaluate(()=>osmd.cursor.Iterator.CurrentMeasureIndex),1);
        assert.equal(await el('val-speed').inputValue(),'60');
        await el('val-loop-min').fill('4'); await el('val-loop-min').press('Tab');
        await page.evaluate(()=>{trace.length=0;}); await el('btn-play').click();
        await page.waitForFunction(()=>trace.some(e=>e.kind==='note') && osmd.cursor.Iterator.EndReached);
        await pause(); assert.equal(await page.evaluate(()=>osmd.cursor.Iterator.CurrentMeasureIndex),3);
        await el('btn-play').click();
        await page.waitForFunction(()=>document.querySelector('#val-speed').value==='65');
        await loopMenu(); await el('val-loop-min').fill('3'); await el('val-loop-min').press('Tab');
        assert.equal(await el('val-speed').inputValue(),'60'); assert.match(await el('training-status').textContent(),/0 of 2/);
        assert.equal(await page.evaluate(()=>osmd.cursor.Iterator.CurrentMeasureIndex),2);
        // Turn the loop off during its last sounding group. The pending wrap must not restart it.
        await el('btn-play').click();
        await el('looper-popup').waitFor({state:'hidden'}); await loopMenu();
        await page.waitForFunction(()=>osmd.cursor.Iterator.EndReached && AppState.isPlaying);
        await el('check-looper').uncheck(); assert.equal(await el('training-action').isDisabled(),true);
        assert.equal(await shaded(),0);
        await page.waitForFunction(()=>!AppState.isPlaying);
        await el('check-looper').check(); await enable(); await el('btn-tempo').click();
        await el('val-speed').fill('73'); await el('val-speed').press('Tab');
        assert.equal(await summary.textContent(),'Speed Trainer');
        await enable(); await el('btn-practice').click(); await el('mode-wait').check();
        assert.equal(await el('training-action').isDisabled(),true); assert.equal(await summary.textContent(),'Speed Trainer');
        await el('mode-follow').check(); assert.equal(await el('training-action').isDisabled(),true);
        await el('mode-realtime').check(); await enable(); await load(fixture);
        await page.waitForFunction(()=>document.querySelector('#training-summary').textContent==='Speed Trainer');
        await loopMenu();
        assert.equal(await el('slider-loop-min').inputValue(),'1');
        assert.equal(await el('slider-loop-max').inputValue(),await el('val-loop-max').inputValue());
        await el('val-loop-max').fill('2'); await el('val-loop-max').press('Tab');
        await enable();
        await el('btn-scores').click();
        await page.locator('.scores-tools summary', {hasText:/^PDF$/}).click();
        const [picker] = await Promise.all([page.waitForEvent('filechooser'),el('pdf-attach').click()]);
        await picker.setFiles(path.join(__dirname,'fixtures','grand-staff-repeat.pdf'));
        await el('pdf-find').click(); await el('pdf-use-score').click();
        const grayPdf = page.locator('.pdf-boxes .outside-loop');
        assert.deepEqual(await grayPdf.evaluateAll(boxes=>boxes.map(b=>b.dataset.measure)),['3','4']);
        assert.equal(await summary.textContent(),'Speed Trainer · 60%');
        await loopMenu(); await el('training-action').click();
        await el('btn-loop-min-increase').click();
        const activeBox = page.locator('.pdf-boxes .current');
        assert.equal(await activeBox.getAttribute('data-measure'),'2');
        await el('btn-loop-min-decrease').click();
        assert.equal(await activeBox.getAttribute('data-measure'),'1');
        assert.equal(await page.evaluate(()=>osmd.cursor.Iterator.CurrentMeasureIndex),0);
        await el('check-looper').uncheck();
        assert.equal(await grayPdf.count(),0);
        assert.deepEqual(errors,[]);
        console.log('Transport, partial pass, reset, availability and responsive menu checks passed.');
    } catch(error) {
        console.error(await page.evaluate(()=>({status:document.querySelector('#training-status')?.textContent,
            tail:window.trace?.slice(-12), errors:document.querySelector('#training-action')?.disabled})),errors);
        throw error;
    } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
