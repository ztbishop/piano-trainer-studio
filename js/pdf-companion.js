// PDF reader and box editor adapted from Guitar Trainer Studio 1e68d3, 2026-11-24.
// AGPL-3.0. See LICENSE and docs/COMPANION_PDF.md.
import {scoreVisits, visitIndex, mapVisitRange} from './pdf-visits.js';
import {editPageBoxes, replacePageBoxes, addScoreBoxes} from './pdf-box-review.js';
import {barlineHandle} from './pdf-barline-controls.js';
import {mountPdfEditor} from './pdf-editor-layout.js';
import {readingPages} from './pdf-reading-pages.js';

export function measureBox(page, a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
  return w >= 0.005 && h >= 0.005 ? {page, x, y, w, h} : null;
}

const assets = new URL('../assets/vendor/pdfjs/', import.meta.url);
function validSavedBoxes(boxes, pageCount) {
  if (!boxes || typeof boxes !== 'object' || Array.isArray(boxes)) return false;
  return Object.entries(boxes).every(([number, box]) =>
    /^[1-9]\d{0,4}$/.test(number) && Number.isInteger(box?.page) && box.page >= 1 && box.page <= pageCount &&
    [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.x >= 0 && box.y >= 0 &&
    box.w > 0 && box.h > 0 && box.x + box.w <= 1.000001 && box.y + box.h <= 1.000001);
}

function initPdfCompanion() {
  const byId = id => document.getElementById('pdf-' + id);
  mountPdfEditor(byId('view'));
  const view = byId('view'), sheet = byId('sheet'), scroll = byId('scroll'), overlay = byId('boxes');
  const file = byId('file'), attach = byId('attach'), attachStatus = byId('attach-status');
  const pageSelect = byId('page'), measure = byId('measure'), mark = byId('map'), target = byId('target');
  const native = document.getElementById('canvas-wrapper');
  let pdf, documentTask, key, boxes = {}, page = 1, editing = false, visible = false, generation = 0;
  let drag, current, visits = [], mapping = [], currentVisit = 0, savedScroll = 0;
  let proposals=null, scanVersion=0, loopMeasures=null, loopKey;
  let scoreReview = null;
  const find=byId('find'), action=byId('action'), replace=byId('replace');
  const findPage = byId('find-page'), useScore = byId('use-score');
  const pagesRoot=byId('pages');
  const reader=readingPages(scroll,pagesRoot,jumpToMeasure,number=>{
    if(number===page || !visible || view.hidden)return;
    if(editing){
      if(!proposals && !drag && !find.disabled && !sheet.querySelector(':active'))goPage(number,false);
    } else {page=number;pageSelect.value=String(number);}
  },message);
  function message(text) {
    const status = byId('status');
    status.textContent = text;
    status.hidden = !text;
  }
  function updateAttachStatus(text) {
    attachStatus.textContent = text;
    attachStatus.hidden = !text;
  }
  function saveBoxes() {
    if (key) appLocalStorage.setItem(key, JSON.stringify({boxes, mapping}));
  }
  function boxElement(box, active, interactive=false) {
    const el = document.createElement(interactive?'button':'div');
    if(interactive) el.type='button';
    el.className = active ? 'pdf-box current' : 'pdf-box';
    for (const [style, field] of [['left','x'],['top','y'],['width','w'],['height','h']]) el.style[style] = (box[field] * 100) + '%';
    return el;
  }
  function paintBoxes(reveal = false) {
    if (!editing) {
      if (visible && !view.hidden) {
        renderPage();
        reader.update(current, loopMeasures, reveal && document.getElementById('check-autoscroll').checked);
      }
      return;
    }
    overlay.replaceChildren();
    const selected = Number(measure.value);
    const first = scoreReview ? reviewFirstNumber() : selected;
    const entries = proposals ? proposals.map((box,i)=>[first+i,box]) : Object.entries(boxes);
    let previous=null;
    for (const [i,[number, box]] of entries.entries()) {
      if (box?.page !== page) continue;
      const active = Number(number) === selected;
      const el = boxElement(box, active);
      const label=Number.isFinite(Number(number)) ? String(number) : '—';
      el.textContent = label;
      overlay.append(el);
      if((!proposals || action.value==='draw') && previous && (proposals || Number(number)===Number(previous.number)+1)) {
        const left=previous;
        const handle=barlineHandle(sheet,left.box,box,left.el,el,'Move barline before measure '+label,(a,b)=>{
          a.automatic = b.automatic = false;
          if(proposals) {proposals[i-1]=a;proposals[i]=b;}
          else {
            boxes[left.number] = a;
            boxes[number] = b;
            saveBoxes();
          }
          // Refresh the limits of the handles on either side of this pair.
          const refocus=document.activeElement===handle;
          paintBoxes();
          if(refocus)overlay.querySelector('[data-boundary="'+i+'"]')?.focus({preventScroll:true});
        });
        if(handle){handle.dataset.boundary=i;overlay.append(handle);}
      }
      previous={number,box,el};
    }
    byId('remove').disabled = !boxes[measure.value];
  }
  function visitLabel(index) {
    const visit = visits[index];
    return (index + 1) + ' · score ' + visit.measure + (visit.pass > 1 ? ' · pass ' + visit.pass : '');
  }
  function inLoop(visit) {
    return !document.getElementById('check-looper').checked ||
      (visit.measure >= AppState.looper.min && visit.measure <= AppState.looper.max);
  }
  function describeRangeChoices(first, last) {
    for (let i = first; i <= last; i++) {
      const description = visitLabel(i) + (mapping[i] == null ? ' → unmapped' : ' → print ' + mapping[i]);
      byId('from').options[i].text = description;
      byId('through').options[i].text = description;
    }
  }
  function jumpToMeasure(number) {
    const choices = [];
    visits.forEach((visit, i) => { if (mapping[i] === number && inLoop(visit)) choices.push(i); });
    if (!choices.length) {
      message('No score visit maps here within the current playback range.');
      return;
    }
    const nearest = choices.reduce((best, i) =>
      Math.abs(i - currentVisit) < Math.abs(best - currentVisit) ? i : best);
    seekCompanionVisit(visits[nearest].step);
    message('');
    const picker = byId('visit');
    picker.replaceChildren(...choices.map(i => new Option(visitLabel(i), i)));
    picker.value = nearest;
    byId('position').hidden = choices.length < 2;
  }
  byId('visit').onchange = event => {
    const visit = visits[Number(event.target.value)];
    if (visit && inLoop(visit)) seekCompanionVisit(visit.step);
  };
  function updateRange(unmap) {
    try {
      const first = Number(byId('from').value), last = Number(byId('through').value);
      const printed = unmap ? null : byId('first').valueAsNumber;
      mapping = mapVisitRange(mapping, first, last, printed, measure.length);
      describeRangeChoices(first - 1, last - 1);
      saveBoxes();
      loopKey = undefined;
      sync();
      message('Score visits ' + first + '–' + last + (unmap ? ' are unmapped.' :
        ' now follow printed measures ' + printed + '–' + (printed + last - first) + '.'));
    } catch (error) { message(error.message); }
  }
  byId('apply-range').onclick = () => updateRange(false);
  byId('unmap').onclick = () => updateRange(true);
  byId('from').onchange = () => {
    byId('through').value = byId('from').value;
    byId('first').value = mapping[Number(byId('from').value) - 1] || 1;
  };
  function reviewControls() {
    byId('review').hidden=!proposals;
    pageSelect.disabled=!!scoreReview;
    find.hidden=!!proposals;
    findPage.hidden=!!proposals;
    useScore.hidden=!scoreReview;
    byId('remove').hidden=!!proposals;
    byId('number-label').textContent=proposals?'First measure':'Measure';
    byId('use').textContent = scoreReview ? (page < pdf.numPages ? 'Review next page' : 'Save reviewed pages') : 'Use page boxes';
  }
  function endReview() {
    scanVersion++; proposals=null; scoreReview=null; find.disabled=findPage.disabled=false;replace.checked=false;
    reviewControls();
  }
  function describeReview() {
    reviewControls();
    const instructions={draw:'Drag a blue divider to adjust two neighboring boxes. Drag in blank space to add a box or inside a box to redraw it.',
      split:'Click the missing barline inside a box.',join:'Click the first of two boxes on the same line.',remove:'Click the extra box.'};
    if (scoreReview) {
      const here = reviewMapping(false), all = reviewMapping(true);
      byId('use').disabled = !!here.error;
      useScore.disabled = !!all.error;
      const detail = here.error || all.error || '';
      message('Page ' + page + ' of ' + pdf.numPages + ' · ' + proposals.length + ' proposed boxes. ' +
        (detail ? detail + ' ' : '') + instructions[action.value]);
    } else {
      const result = addScoreBoxes(boxes, Number(measure.value), proposals, measure.length);
      byId('use').disabled = !proposals.length || !!result.error;
      message(proposals.length+' boxes on this page. '+(result.error ? result.error+' ' : '')+instructions[action.value]);
    }
    paintBoxes();
  }
  function reviewMapping(includeRemaining) {
    const pending = includeRemaining ? proposals.concat(scoreReview.pages.slice(page).flat()) : proposals;
    return addScoreBoxes(scoreReview.draft, reviewFirstNumber(), pending, osmd.Sheet.SourceMeasures.length);
  }
  function reviewFirstNumber() {
    return measure.value ? Number(measure.value) : scoreReview.first;
  }
  function showScorePage(review, number, first) {
    goPage(number);
    scoreReview = review;
    review.first = first;
    proposals = review.pages[number - 1];
    measure.value = String(first);
    byId('replace-label').hidden = true;
    replace.checked = false;
    action.value = 'draw';
    describeReview();
  }
  function acceptScoreReview(includeRemaining) {
    const result = reviewMapping(includeRemaining);
    if (result.error) { describeReview(); return; }
    if (!includeRemaining && page < pdf.numPages) {
      scoreReview.draft = result.boxes;
      showScorePage(scoreReview, page + 1, reviewFirstNumber() + proposals.length);
      return;
    }
    boxes = result.boxes;
    saveBoxes();
    setEditing(false); current = undefined; sync();
    message(Object.keys(boxes).length + ' printed measure boxes saved.');
  }
  useScore.onclick = () => acceptScoreReview(true);
  async function scan(wholeScore) {
    const version=++scanVersion;
    find.disabled=findPage.disabled=true;message('Finding measure boxes…');
    try {
      const {detectPdfPage, detectPdfScore} = await import('./pdf-measure-detection.js');
      if(version!==scanVersion)return;
      if (wholeScore) {
        const pages = await detectPdfScore(pdf, () => version === scanVersion,
          n => message('Finding boxes on page ' + n + ' of ' + pdf.numPages + '…'));
        if (!pages || version !== scanVersion) return;
        if (!pages.some(boxes => boxes.length)) {
          message('No measure boxes found. Choose a page and draw its measures.');
          return;
        }
        // Older saved maps have no origin flag. Preserve them like hand marks.
        const draft = Object.fromEntries(Object.entries(boxes).filter(([,box]) => box.automatic !== true));
        showScorePage({pages, draft}, 1, 1);
        return;
      }
      const pdfPage=await pdf.getPage(page);
      if(version!==scanVersion)return;
      const result=await detectPdfPage(pdfPage,page);
      if(version!==scanVersion)return;
      const mapped=Object.keys(boxes).filter(n=>boxes[n].page===page);
      byId('replace-label').hidden=!mapped.length;
      if(mapped.length) measure.value=String(Math.min(...mapped.map(Number)));
      proposals=result;action.value='draw';describeReview();
    } catch(error) {if(version===scanVersion)message('Could not detect boxes. You can draw them on this page. '+error.message);}
    finally {if(version===scanVersion)find.disabled=findPage.disabled=false;}
  }
  find.onclick = () => scan(true);
  findPage.onclick = () => scan(false);
  byId('cancel').onclick=()=>{endReview();message('Unaccepted suggestions discarded.');paintBoxes();};
  action.onchange=replace.onchange=describeReview;
  byId('use').onclick=()=>{
    if(!proposals || byId('use').disabled)return;
    if (scoreReview) { acceptScoreReview(false); return; }
    const count=proposals.length, first=measure.selectedIndex;
    const replacing=replace.checked;
    let added=0;
    const numbers=proposals.map((_,i)=>measure.options[first+i].value);
    if(replacing) {
      const next=replacePageBoxes(boxes,page,numbers,proposals);
      if(!next)return;
      boxes=next;
    } else proposals.forEach((box,i)=>{
      if(!boxes[numbers[i]]) {boxes[numbers[i]]=box;added++;}
    });
    endReview();
    measure.selectedIndex=Math.min(measure.options.length-1,first+count);
    const summary=replacing?count+' boxes replaced on page '+page+'. ':added+' new boxes saved on page '+page+'. '+(added<count?'Existing mappings were kept. ':'');
    message(summary+'Select another page or choose Done marking.');
    saveBoxes();paintBoxes();sync();
  };
  function cancelDrag() {
    drag = null;
    overlay.querySelector('.drawing')?.remove();
  }
  function renderPage() {
    if (pdf && !view.hidden && scroll.clientWidth)
      reader.resize(Math.max(1, Math.round(scroll.clientWidth * AppState.zoom)));
  }
  function goPage(number, scrollToPage=true) {
    if(page!==number) {
      endReview();cancelDrag();message('');
      byId('position').hidden=true;
      if(editing) {
        const mapped=Object.entries(boxes);
        const onPage=mapped.filter(([,b])=>b.page===number).map(([n])=>Number(n));
        const before=mapped.filter(([,b])=>b.page<number).map(([n])=>Number(n));
        const first=onPage.length?Math.min(...onPage):before.length?Math.max(...before)+1:null;
        if(first!==null && Array.from(measure.options).some(o=>Number(o.value)===first))measure.value=String(first);
      }
    }
    page = number;
    pageSelect.value = String(page);
    if(editing) {reader.placeEditor(page,sheet);paintBoxes();}
    if(scrollToPage)reader.jump(page);
  }
  function setEditing(value) {
    editing = value;
    endReview();byId('position').hidden=true;
    cancelDrag();
    mark.textContent = editing ? 'Done marking' : 'Mark measures';
    mark.setAttribute('aria-pressed', String(editing));
    byId('edit').hidden = !editing;
    sheet.hidden=!editing;
    pagesRoot.classList.toggle('marking',editing);
    if(editing) {
      reader.placeEditor(page,sheet);
    } else {
      overlay.replaceChildren();
      reader.populate(boxes,boxElement,String);
    }
    sheet.classList.toggle('mapping', editing);
    message(editing ? 'Find boxes in the score, drag a blue divider, or choose a measure and redraw its box.' : '');
    paintBoxes();
  }
  const musicArea = document.getElementById('music-area');
  function sync() {
    view.hidden = !visible;
    native.inert = visible;
    musicArea.classList.toggle('reading-pdf', visible);
    byId('show').hidden = !pdf || visible;
    if (!pdf || !visits.length) return;
    const number = mapping[currentVisit];
    const rangeKey = document.getElementById('check-looper').checked ?
      AppState.looper.min + '-' + AppState.looper.max : '';
    const changed = loopKey !== rangeKey;
    if (changed) {
      loopKey = rangeKey;
      loopMeasures = rangeKey ? new Set(mapping.filter((n,i) => n != null && inLoop(visits[i]))) : null;
    }
    target.textContent = 'Visit ' + visitLabel(currentVisit) +
      (number == null ? ' · Unmapped' : ' · Printed ' + number + (boxes[number] ? '' : ' (no box)'));
    if (visible && (current !== number || changed)) {
      current = number;
      byId('position').hidden = true;
      paintBoxes(!editing);
    }
    renderPage();
  }
  function position(iterator) {
    if (!pdf || !iterator || !visits.length) return false;
    const next = iterator.EndReached ? visits.length - 1 : visitIndex(visits, iterator.CurrentEnrolledTimestamp.RealValue);
    if (next !== currentVisit) { currentVisit = next; sync(); }
    return visible;
  }
  function reset() {
    generation++;
    reader.clear();
    documentTask?.destroy(); documentTask = null;
    pdf = null; key = null; boxes = {}; visits = []; mapping = []; visible = false;
    current = undefined; loopKey = undefined; currentVisit = 0;
    file.value = ''; attach.disabled = true; byId('order').open = false;
    setEditing(false); updateAttachStatus(''); sync();
  }
  async function open(selected) {
    if (!osmd.Sheet || attach.disabled) return;
    const score = osmd.Sheet, version = ++generation;
    if (pdf) { endReview(); paintBoxes(); }
    let task;
    try {
      updateAttachStatus('Opening PDF…');
      const [lib, bytes] = await Promise.all([import('../assets/vendor/pdfjs/build/pdf.min.mjs'), selected.arrayBuffer()]);
      if (version !== generation) return;
      const traversal = scoreVisits(score, osmd.cursor.Iterator.SkipInvisibleNotes);
      if (!traversal.length) throw new Error('The digital score contains no measures.');
      lib.GlobalWorkerOptions.workerSrc = new URL('build/pdf.worker.min.mjs', assets).href;
      task = lib.getDocument({data:new Uint8Array(bytes), wasmUrl:new URL('wasm/', assets).href, cMapUrl:new URL('cmaps/', assets).href,
        cMapPacked:true, standardFontDataUrl:new URL('standard_fonts/', assets).href, iccUrl:new URL('iccs/', assets).href, isEvalSupported:false});
      const loaded = await task.promise;
      const identity = HandAssignment.scoreIdentity();
      const storageKey = identity && 'pt_companionPDF_v1_' + identity + '_' + loaded.fingerprints[0];
      let saved;
      try { saved = storageKey && JSON.parse(appLocalStorage.getItem(storageKey)); } catch { /* Rebuild from the PDF. */ }
      if (!validSavedBoxes(saved?.boxes, loaded.numPages)) saved = null;
      const pages = [], missedPages = [], detected = {};
      let count = 0;
      for (let i = 1; i <= loaded.numPages; i++) {
        if (version !== generation) return;
        const pdfPage = await loaded.getPage(i);
        if (version !== generation) return;
        pages.push(pdfPage);
        if (saved?.boxes) continue;
        updateAttachStatus('Finding measure boxes on page ' + i + ' of ' + loaded.numPages + '…');
        let found = [];
        try {
          const {detectPdfPage} = await import('./pdf-measure-detection.js');
          found = await detectPdfPage(pdfPage, i);
        } catch { /* This page can still be marked manually. */ }
        if (!found.length) missedPages.push(i);
        for (const box of found) detected[++count] = box;
      }
      if (version !== generation || score !== osmd.Sheet) return;
      pausePlaybackFromToolbar();
      reader.load(pages);
      const oldTask = documentTask;
      documentTask = task; task = null; oldTask?.destroy();
      pdf = loaded; key = storageKey; boxes = saved?.boxes || detected;
      visits = traversal;
      const limit = Math.max(score.SourceMeasures.length, ...Object.keys(boxes).map(Number));
      mapping = Array.isArray(saved?.mapping) && saved.mapping.length === visits.length &&
        saved.mapping.every(n => n === null || Number.isInteger(n) && n > 0 && n <= limit)
        ? saved.mapping : visits.map(v => v.measure);
      page = 1; current = undefined; loopKey = undefined;
      pageSelect.replaceChildren(); measure.replaceChildren();
      for (let i = 1; i <= pdf.numPages; i++) pageSelect.add(new Option(i,i));
      for (let i = 1; i <= limit; i++) measure.add(new Option(i,i));
      for (const id of ['from','through']) {
        byId(id).replaceChildren(...visits.map((_,i) => new Option(visitLabel(i),i+1)));
      }
      describeRangeChoices(0, visits.length - 1);
      if (!visible) savedScroll = musicArea.scrollTop;
      musicArea.scrollTop = 0;
      visible = true; updateAttachStatus(''); hideToolbarPanels();
      setEditing(!Object.keys(boxes).length);
      currentVisit = visitIndex(visits, osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue);
      sync();
      if (missedPages.length) message('Check pages ' + missedPages.join(', ') + ' and draw any missing measures.');
      else if (!saved && count !== score.SourceMeasures.length)
        message(count + ' printed boxes for ' + score.SourceMeasures.length + ' digital measures. Review the repeat and ending mapping.');
    } catch (error) {
      if (version === generation) updateAttachStatus('Could not open this PDF. ' + error.message);
    } finally { if (task) await task.destroy(); }
  }
  function point(event) {
    const rect = sheet.getBoundingClientRect();
    const clamp = n => Math.max(0, Math.min(1, n));
    return {x:clamp((event.clientX - rect.left) / rect.width), y:clamp((event.clientY - rect.top) / rect.height)};
  }
  function startBox(event) {
    if (!editing || (find.disabled && !proposals) || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const start=point(event);
    const hit=proposals?.findIndex(b=>start.x>=b.x && start.x<=b.x+b.w && start.y>=b.y && start.y<=b.y+b.h) ?? -1;
    drag = {id:event.pointerId, start, hit};
    sheet.setPointerCapture(event.pointerId);
  }
  sheet.onpointerdown=startBox;
  pagesRoot.addEventListener('pointerdown',event=>{
    if(!editing || sheet.contains(event.target) || event.button!==0 || !event.isPrimary)return;
    const number=Number(event.target.closest('[data-page]')?.dataset.page);
    if(!number || number===page || proposals || drag || find.disabled)return;
    goPage(number,false);
    startBox(event);
  });
  sheet.onpointermove = event => {
    if (drag?.id !== event.pointerId || (proposals && action.value!=='draw')) return;
    overlay.querySelector('.drawing')?.remove();
    const box = measureBox(page, drag.start, point(event));
    if (box) { const el = boxElement(box, true); el.classList.add('drawing'); overlay.append(el); }
  };
  sheet.onpointerup = event => {
    if (drag?.id !== event.pointerId) return;
    const end=point(event), box = measureBox(page, drag.start, end);
    const hit=drag.hit;
    cancelDrag();
    if(proposals) {
      proposals=editPageBoxes(proposals,hit,action.value,end.x,box);
      describeReview();return;
    }
    if (!box) return;
    boxes[measure.value] = box;
    saveBoxes();
    measure.selectedIndex = Math.min(measure.selectedIndex + 1, measure.options.length - 1);
    paintBoxes(); sync();
  };
  sheet.onlostpointercapture = sheet.onpointercancel = cancelDrag;
  measure.onchange = () => { if(proposals){describeReview();return;}
    const selected=measure.value;
    if (boxes[selected]) goPage(boxes[selected].page);
    measure.value=selected;paintBoxes();
  };
  pageSelect.onchange = () => goPage(Number(pageSelect.value));
  byId('remove').onclick = () => { delete boxes[measure.value]; saveBoxes(); paintBoxes(); sync(); };
  mark.onclick = () => { if (!editing) pausePlaybackFromToolbar(); setEditing(!editing); current = undefined; sync(); };
  byId('native').onclick = () => { if(editing)setEditing(false); visible = false; sync(); musicArea.scrollTop = savedScroll; handleAutoScroll(); };
  byId('show').onclick = () => { hideToolbarPanels(); savedScroll = musicArea.scrollTop; musicArea.scrollTop = 0; visible = true; current = undefined; sync(); };
  attach.onclick = () => file.click();
  file.onchange = () => { const selected = file.files[0]; file.value = ''; if (selected) open(selected); };
  new ResizeObserver(renderPage).observe(scroll);
  return {position, reset, loopChanged: sync, resize: renderPage, scoreReady: () => { attach.disabled = false; }};
}


window.CompanionPDF = initPdfCompanion();
if (AppState.currentScoreData) window.CompanionPDF.scoreReady();
