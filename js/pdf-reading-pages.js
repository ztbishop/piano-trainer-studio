// Adapted from Guitar Trainer Studio 1e68d3 (AGPL-3.0), 2026-11-24.
// Page geometry and hit targets stay mounted. Only nearby pages need raster images.
export function readingPages(scroll, root, onJump, onPage, onError) {
  let pages = [], width = 0, observer, active, range, scrollFrame = 0;
  const targets = new Map();
  function release(p) {
    p.task?.cancel();
    p.task = null;
    if (p.canvas) {
      p.canvas.remove();
      p.canvas.width = p.canvas.height = 0;
      p.canvas = null;
    }
  }
  function clear() {
    observer?.disconnect();
    cancelAnimationFrame(scrollFrame);
    pages.forEach(release);
    pages = [];
    targets.clear();
    width = 0;
    root.replaceChildren();
  }
  function draw(p) {
    release(p);
    if (!width || !p.near || root.hidden) return;
    const canvas = document.createElement('canvas');
    const scale = Math.min(devicePixelRatio || 1, 2, Math.sqrt(8000000 / (width ** 2 * p.base.height / p.base.width)));
    const viewport = p.pdf.getViewport({scale:width * scale / p.base.width});
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    p.node.prepend(canvas);
    p.canvas = canvas;
    const task = p.pdf.render({canvas, viewport});
    p.task = task;
    task.promise.catch(error => { if (p.task === task) onError('Could not draw PDF page '+p.number+'. '+error.message); });
  }
  function load(docPages) {
    clear();
    pages = docPages.map((pdf, i) => {
      const node = document.createElement('section'), layer = document.createElement('div');
      const base = pdf.getViewport({scale:1}), number = i + 1;
      node.className = 'pdf-reading-page';
      node.dataset.page = number;
      node.setAttribute('aria-label', 'Page '+number);
      node.style.aspectRatio = base.width+' / '+base.height;
      layer.className = 'pdf-boxes';
      node.append(layer);
      root.append(node);
      return {node, layer, pdf, number, base};
    });
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const p = pages[Number(entry.target.dataset.page)-1];
        if (p?.node !== entry.target) continue;
        p.near = entry.isIntersecting;
        draw(p);
      }
    }, {root:scroll, rootMargin:'100% 0px'});
    pages.forEach(p => observer.observe(p.node));
  }
  function resize(w) {
    if (width === w) return;
    width = w;
    root.style.width = w+'px';
    pages.filter(p => p.near).forEach(draw);
  }
  function populate(boxes, makeBox, label) {
    pages.forEach(p => p.layer.replaceChildren());
    targets.clear();
    active = range = undefined;
    for (const [key, box] of Object.entries(boxes)) {
      const number = Number(key), p = pages[box?.page-1];
      if (!p) continue;
      const el = makeBox(box, false, true);
      el.dataset.measure = key;
      el.setAttribute('aria-label', 'Go to measure '+label(number));
      el.onclick = () => onJump(number);
      p.layer.append(el);
      targets.set(number, el);
    }
  }
  function follow(el) {
    if (!el) return;
    const frame = scroll.getBoundingClientRect(), rect = el.getBoundingClientRect();
    if (rect.top < frame.top || rect.bottom > frame.bottom) scroll.scrollTop += rect.top-frame.top-12;
    if (rect.left < frame.left || rect.right > frame.right) scroll.scrollLeft += rect.left-frame.left-8;
    onPage(Number(el.closest('[data-page]').dataset.page));
  }
  function preview(entries, makeBox) {
    targets.clear();
    pages.forEach((p,i) => {
      p.layer.replaceChildren(...Array.from(entries[i] || [], ([number,box]) => {
        const el = makeBox(box);
        const label = document.createElement('span');
        label.textContent = number;
        el.append(label);
        return el;
      }));
    });
  }
  function update(number, loop, reveal) {
    targets.get(active)?.classList.remove('current');
    targets.get(number)?.classList.add('current');
    if (range !== loop) {
      for (const [n, el] of targets) el.classList.toggle('outside-loop', !!loop && !loop.has(n));
    }
    active = number; range = loop;
    if (reveal) follow(targets.get(number));
  }
  scroll.addEventListener('scroll', () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      if (root.hidden || !scroll.clientHeight) return;
      const top = scroll.getBoundingClientRect().top + Math.min(80, scroll.clientHeight/3);
      const first = pages.find(p => p.node.getBoundingClientRect().bottom > top);
      if (first) onPage(first.number);
    });
  }, {passive:true});
  function jump(number) {
    const p = pages[number-1];
    if (p) scroll.scrollTop += p.node.getBoundingClientRect().top-scroll.getBoundingClientRect().top;
  }
  function placeEditor(number, sheet) {
    pages[number-1]?.node.append(sheet);
  }
  return {clear, load, resize, populate, preview, update, jump, placeEditor};
}
