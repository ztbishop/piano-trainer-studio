// Adapted from Guitar Trainer Studio 1e68d3 (AGPL-3.0), 2026-11-24.
export function mountPdfEditor(view) {
  view.innerHTML = `
          <div id="pdf-tools" class="pdf-tools" hidden>
            <button id="pdf-map" type="button">Done marking</button>
            <span id="pdf-editor-page"></span>
            <span id="pdf-edit" hidden><label><span id="pdf-number-label">Measure</span> <select id="pdf-measure"></select></label>
              <button id="pdf-remove" type="button">Remove box</button>
              <button id="pdf-find" type="button">Find boxes in score</button>
              <button id="pdf-find-page" type="button">Find on this page</button>
              <span id="pdf-review" hidden><label>Correction <select id="pdf-action">
                <option value="draw">Draw or redraw</option><option value="split">Split at click</option>
                <option value="join">Join with next</option><option value="remove">Remove extra</option>
              </select></label>
              <label id="pdf-replace-label" hidden><input id="pdf-replace" type="checkbox"> Replace saved boxes on this page</label>
              <button id="pdf-use-score" type="button" hidden>Use score boxes</button>
              <button id="pdf-correct-page" type="button" hidden>Correct this page</button>
              <button id="pdf-use" type="button">Use page boxes</button><button id="pdf-cancel" type="button">Cancel</button></span></span>
          </div>
          <details id="pdf-order"><summary>Map repeats and endings</summary>
            <p>Visits count measures in playback order. Map a range to consecutive printed measures, or choose one visit to correct an ending.</p>
            <div class="pdf-range">
              <label>From visit <select id="pdf-from"></select></label>
              <label>Through visit <select id="pdf-through"></select></label>
              <label>First printed measure <input id="pdf-first" type="number" min="1" value="1"></label>
              <button type="button" id="pdf-apply-range">Map range</button>
              <button type="button" id="pdf-unmap">Leave unmapped</button>
            </div>
          </details>
          <p id="pdf-status" role="status" hidden></p>
          <div id="pdf-scroll" tabindex="0" aria-label="PDF page">
            <div id="pdf-pages"></div>
            <div id="pdf-sheet"><div id="pdf-boxes"></div></div>
          </div>`;
}
