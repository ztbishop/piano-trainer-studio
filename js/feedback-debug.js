// feedback-debug.js
// Developer-only diagnostic helpers for feedback-note troubleshooting.
// Renders visual debug labels and console traces for expected note positions.
// Not an end-user feature. Do not move production feedback logic here.
//
// WARNING:
// - Keep this file observational/debugging-oriented only.
// - Do not move production matching, anchor, or placement heuristics into this file.
// - Debug overlays must stay in their own SVG layer and must not interfere with rendering.

window.FeedbackDebug = window.FeedbackDebug || {
    // Observational only. These snapshots never feed GeometryEngine's cache or grading.
    noteheadComparisons: [],
    comparedSourceNotes: new WeakMap(),
    comparisonLimit: 48,

    clearNoteheadComparisons() {
        this.noteheadComparisons = [];
        this.comparedSourceNotes = new WeakMap();
    },

    compareNotehead(sourceNote, graphicalNote, measureIndex, staffIndex, currentAnchor) {
        if (!this.isDebugEnabled() || !sourceNote || typeof sourceNote !== 'object') return null;
        const previous = this.comparedSourceNotes.get(sourceNote);
        if (previous && this.noteheadComparisons.includes(previous)) return previous;
        const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.y)
            ? { x: value.x, y: value.y } : null;
        const comparison = {
            note: this.describeLogicalNoteForDebug(sourceNote, measureIndex, staffIndex),
            currentAnchor: point(currentAnchor), directAnchor: null,
            headIndex: null, headCount: null, delta: null,
            status: 'unavailable', reason: null
        };
        try {
            if (sourceNote.PrintObject === false || sourceNote.isCueNote || sourceNote.Notehead === 'none' || sourceNote.isRest?.()) {
                throw Error('non-playable-note');
            }
            if (graphicalNote?.sourceNote !== sourceNote) throw Error('source-identity-mismatch');
            if (typeof graphicalNote.getNoteheadSVGs !== 'function') throw Error('notehead-api-missing');
            const index = graphicalNote.vfnoteIndex;
            const heads = graphicalNote.getNoteheadSVGs();
            comparison.headIndex = Number.isInteger(index) ? index : null;
            comparison.headCount = heads?.length ?? null;
            // The renderer records its sorted chord index, not the XML note order.
            if (!Number.isInteger(index) || index < 0 || graphicalNote.vfnote?.[1] !== index) throw Error('invalid-head-index');
            if (!heads?.length || heads.length !== graphicalNote.vfnote?.[0]?.note_heads?.length || index >= heads.length) {
                throw Error('head-count-mismatch');
            }
            const head = heads[index];
            const svg = GeometryEngine.getSvg();
            if (!svg || !head?.isConnected || head.ownerSVGElement !== svg || !svg.contains(head) || !head.classList.contains('vf-notehead')) {
                throw Error('rendered-head-missing');
            }
            // Check ancestors too: hidden voice groups must not supply a visible target.
            for (let node = head; node && node !== svg; node = node.parentElement) {
                const style = window.getComputedStyle(node);
                if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') {
                    throw Error('rendered-head-hidden');
                }
            }
            const box = head.getBBox();
            if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
                throw Error('empty-head-bounds');
            }
            // Only this diagnostic point is transformed; production coordinates stay untouched.
            const rootMatrix = svg.getScreenCTM(), headMatrix = head.getScreenCTM();
            if (!rootMatrix || !headMatrix) throw Error('head-transform-missing');
            const matrix = rootMatrix.inverse().multiply(headMatrix);
            if (![matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f].every(Number.isFinite)) throw Error('invalid-head-transform');
            const x = box.x + box.width / 2, y = box.y + box.height / 2;
            comparison.directAnchor = point({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f });
            if (!comparison.directAnchor) throw Error('invalid-head-center');
            if (comparison.currentAnchor) {
                const dx = comparison.directAnchor.x - comparison.currentAnchor.x;
                const dy = comparison.directAnchor.y - comparison.currentAnchor.y;
                comparison.delta = { x: dx, y: dy, distance: Math.hypot(dx, dy) };
                // One SVG unit is a diagnostic highlight threshold, never an acceptance rule.
                comparison.status = comparison.delta.distance > 1 ? 'different' : 'aligned';
            } else {
                comparison.status = 'current-unavailable';
            }
        } catch (error) {
            comparison.reason = error?.message || 'comparison-failed';
        }
        this.comparedSourceNotes.set(sourceNote, comparison);
        this.noteheadComparisons.push(comparison);
        if (this.noteheadComparisons.length > this.comparisonLimit) this.noteheadComparisons.shift();
        this.debugLogAnchorResolution('NOTEHEAD_COMPARISON', comparison);
        return comparison;
    },

    compareCurrentExpectedNotes() {
        if (!this.isDebugEnabled() || typeof GeometryEngine === 'undefined') return;
        for (const expected of AppState.expectedNotes || []) {
            for (const source of expected.sourceNotes || []) {
                // Read the existing cache only. Enabling Debug cannot resolve or replace a production anchor.
                this.compareNotehead(source, getGraphicalNote(source, expected.mIdx, expected.staffId - 1),
                    expected.mIdx, expected.staffId - 1, GeometryEngine.noteAnchorCache.get(source));
            }
        }
    },

    renderNoteheadComparisons(group) {
        const add = (parent, tag, attrs, text = '') => {
            const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
            for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
            element.textContent = text;
            parent.appendChild(element);
            return element;
        };
        for (const item of this.noteheadComparisons) {
            const a = item.currentAnchor, b = item.directAnchor;
            const g = add(group, 'g', { 'data-debug-kind': 'notehead-comparison', 'data-comparison-status': item.status });
            if (a) add(g, 'circle', { cx: a.x, cy: a.y, r: 6, fill: 'none', stroke: '#d97706', 'stroke-width': 1.5, 'data-feedback-comparison': 'current' });
            if (b) add(g, 'path', { d: `M ${b.x} ${b.y - 5} L ${b.x + 5} ${b.y} L ${b.x} ${b.y + 5} L ${b.x - 5} ${b.y} Z`, fill: 'none', stroke: '#00a6c7', 'stroke-width': 1.5, 'data-feedback-comparison': 'direct' });
            if (a && b && item.status === 'different') {
                add(g, 'line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#c026d3', 'stroke-width': 1.5, 'stroke-dasharray': '2 2' });
                add(g, 'text', { x: b.x + 7, y: b.y - 9, fill: '#c026d3', 'font-size': 10, 'font-family': 'monospace' }, `Δ ${item.delta.distance.toFixed(1)}`);
            }
            add(g, 'title', {}, `m${(item.note.measureIndex ?? -1) + 1} staff ${item.note.staffId} MIDI ${item.note.midi}: ${item.status}${item.reason ? ' (' + item.reason + ')' : ''}`);
        }
        if (this.noteheadComparisons.length) {
            const different = this.noteheadComparisons.filter(item => item.status === 'different').length;
            const unavailable = this.noteheadComparisons.filter(item => item.status.includes('unavailable')).length;
            const box = GeometryEngine.getSvgViewBox();
            const legend = add(group, 'g', { 'data-feedback-comparison': 'legend', fill: '#7c3aed', 'font-size': 11, 'font-family': 'monospace' });
            add(legend, 'text', { x: (box?.x || 0) + 12, y: (box?.y || 0) + 14 }, 'Debug: orange ○ current; cyan ◇ direct');
            add(legend, 'text', { x: (box?.x || 0) + 12, y: (box?.y || 0) + 28 }, `Differences: ${different} (magenta); unavailable: ${unavailable}`);
        }
    },

    isDebugEnabled() {
        return !!(AppState.debugPersistentAnchors || AppState.debugEventFlow || AppState.debugMatchLogs || AppState.debugAnchorResolution);
    },

    syncDebugCheckbox() {
        const checkbox = document.getElementById('check-debug');
        if (checkbox) checkbox.checked = this.isDebugEnabled();
    },

    debugLogEvent(label, payload = {}) {
        if (!AppState.debugEventFlow) return;
        try {
            console.log(label, payload);
            console.warn('[PianoTrainer debug event]', label, payload);
        } catch (e) {}
    },

    describeLogicalNoteForDebug(note, measureIndex = null, staffIndex = null) {
        const voice = note?.ParentVoiceEntry;
        return {
            measureIndex,
            staffIndex,
            staffId: note?.ParentStaff?.id ?? null,
            midi: note?.halfTone != null ? note.halfTone + 12 : null,
            halfTone: note?.halfTone ?? null,
            length: note?.Length?.RealValue ?? null,
            timestamp: voice?.Timestamp?.RealValue ?? null,
            isRest: !!(note?.isRest && note.isRest()),
            hasTie: !!note?.NoteTie
        };
    },

    describeGraphicalNoteForDebug(gn) {
        const src = gn?.sourceNote;
        const shape = gn?.PositionAndShape;
        return {
            midi: src?.halfTone != null ? src.halfTone + 12 : null,
            halfTone: src?.halfTone ?? null,
            staffId: src?.ParentStaff?.id ?? null,
            timestamp: src?.ParentVoiceEntry?.Timestamp?.RealValue ?? null,
            length: src?.Length?.RealValue ?? null,
            absX: shape?.AbsolutePosition?.x ?? null,
            absY: shape?.AbsolutePosition?.y ?? null,
            width: shape?.Size?.width ?? null,
            height: shape?.Size?.height ?? null
        };
    },

    debugLogAnchorResolution(label, payload = {}) {
        if (!AppState.debugAnchorResolution) return;
        try {
            console.warn('[PianoTrainer anchor]', label, payload);
        } catch (e) {}
    },

    getDebugGroup() {
        return typeof GeometryEngine !== 'undefined' ? GeometryEngine.ensureGroup('pt-debug-group') : null;
    },

    clearSvgDebug() {
        const group = typeof GeometryEngine !== 'undefined' ? GeometryEngine.getSvg()?.querySelector('#pt-debug-group') : null;
        if (group) group.replaceChildren();
    },

    pushStickyDebugFrame(frame) {
        if (!AppState.debugPersistentAnchors || !frame || !Array.isArray(frame.notes) || frame.notes.length === 0) return;

        const normalizedNotes = frame.notes
            .filter(n => n && n.anchor && Number.isFinite(n.anchor.x) && Number.isFinite(n.anchor.y))
            .map(n => ({
                midi: n.midi,
                staffId: n.staffId,
                kind: n.kind || 'expected',
                hit: !!n.hit,
                anchor: {
                    x: n.anchor.x,
                    y: n.anchor.y
                }
            }));

        if (normalizedNotes.length === 0) return;

        const entry = {
            seq: ++AppState.debugFrameSeq,
            measureIndex: frame.measureIndex ?? null,
            timestamp: frame.timestamp ?? null,
            kind: frame.kind || 'expected',
            notes: normalizedNotes
        };

        AppState.debugAnchorHistory.push(entry);
        this.debugLogEvent('STICKY_DEBUG_FRAME_PUSHED', {
            seq: entry.seq,
            measureIndex: entry.measureIndex,
            kind: entry.kind,
            noteCount: entry.notes.length,
            notes: entry.notes.map(n => ({ midi: n.midi, staffId: n.staffId, kind: n.kind, hit: n.hit, anchor: n.anchor }))
        });
        const maxFrames = Math.max(1, AppState.debugStickyFrameLimit || 10);
        if (AppState.debugAnchorHistory.length > maxFrames) {
            AppState.debugAnchorHistory.splice(0, AppState.debugAnchorHistory.length - maxFrames);
        }

        this.renderStickyDebug();
    },

    renderStickyDebug() {
        this.clearSvgDebug();

        if (!AppState.debugPersistentAnchors) return;
        const group = this.getDebugGroup();
        if (!group) return;

        const history = AppState.debugAnchorHistory || [];
        this.renderNoteheadComparisons(group);

        const total = history.length;
        this.debugLogEvent('STICKY_DEBUG_RENDER', { frameCount: total });
        history.forEach((frame, frameIndex) => {
            const opacity = 0.95;

            frame.notes.forEach((note, noteIndex) => {
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.setAttribute('data-debug-seq', String(frame.seq));
                g.setAttribute('data-debug-kind', frame.kind || 'expected');
                g.setAttribute('opacity', String(opacity));

                const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ring.setAttribute('cx', note.anchor.x);
                ring.setAttribute('cy', note.anchor.y);
                ring.setAttribute('r', note.kind === 'feedback' ? '8' : '6');
                ring.setAttribute('fill', 'none');
                ring.setAttribute('stroke', note.kind === 'feedback'
                    ? (note.hit ? 'rgba(46, 204, 113, 0.95)' : 'rgba(231, 76, 60, 0.95)')
                    : 'rgba(255, 140, 0, 0.95)');
                ring.setAttribute('stroke-width', note.kind === 'feedback' ? '2' : '1.5');
                g.appendChild(ring);

                const h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                h.setAttribute('x1', note.anchor.x - 4);
                h.setAttribute('y1', note.anchor.y);
                h.setAttribute('x2', note.anchor.x + 4);
                h.setAttribute('y2', note.anchor.y);
                h.setAttribute('stroke', 'rgba(255, 255, 255, 0.85)');
                h.setAttribute('stroke-width', '1');
                g.appendChild(h);

                const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                v.setAttribute('x1', note.anchor.x);
                v.setAttribute('y1', note.anchor.y - 4);
                v.setAttribute('x2', note.anchor.x);
                v.setAttribute('y2', note.anchor.y + 4);
                v.setAttribute('stroke', 'rgba(255, 255, 255, 0.85)');
                v.setAttribute('stroke-width', '1');
                g.appendChild(v);

                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', note.anchor.x + 7);
                label.setAttribute('y', note.anchor.y - 7 - ((noteIndex % 2) * 9));
                label.setAttribute('font-size', '9');
                label.setAttribute('font-family', 'monospace');
                label.setAttribute('fill', note.kind === 'feedback'
                    ? (note.hit ? 'rgba(46, 204, 113, 0.95)' : 'rgba(231, 76, 60, 0.95)')
                    : 'rgba(255, 140, 0, 0.95)');
                label.textContent = `${frame.measureIndex ?? '?'}:${note.staffId ?? '?'}:${note.midi ?? '?'}`;
                g.appendChild(label);

                group.appendChild(g);
            });
        });
    },

    setDebugEnabled(enabled, options = {}) {
        const next = !!enabled;
        const {
            clearHistory = !next,
            logChange = true,
            reason = 'ui-toggle'
        } = options;

        AppState.debugPersistentAnchors = next;
        AppState.debugEventFlow = next;
        AppState.debugMatchLogs = next;
        AppState.debugAnchorResolution = next;

        window.debugStickyAnchors = next;

        if (!next) {
            this.clearNoteheadComparisons();
            if (clearHistory) {
                AppState.debugAnchorHistory = [];
            }
            this.clearSvgDebug();
            if (clearHistory) {
                this.renderStickyDebug();
            }
        } else {
            try { this.compareCurrentExpectedNotes(); } catch (e) { /* Diagnostics cannot interrupt practice. */ }
            this.renderStickyDebug();
        }

        this.syncDebugCheckbox();

        if (logChange) {
            console.error('[PianoTrainer debug TOGGLE]', {
                enabled: next,
                reason,
                stickyFrames: AppState.debugStickyFrameLimit,
                stickyHistory: AppState.debugAnchorHistory.length,
                ts: new Date().toISOString()
            });
        }
    },

    init() {
        const debugCheckbox = document.getElementById('check-debug');
        if (debugCheckbox && !debugCheckbox.dataset.ptDebugBound) {
            debugCheckbox.addEventListener('change', (e) => {
                setStoredBool(SETTINGS_DEBUG_STORAGE_KEY, e.target.checked);
                this.setDebugEnabled(e.target.checked, {
                    clearHistory: !e.target.checked,
                    logChange: e.target.checked,
                    reason: 'checkbox'
                });
            });
            debugCheckbox.dataset.ptDebugBound = '1';
        }

        this.setDebugEnabled(getStoredBool(SETTINGS_DEBUG_STORAGE_KEY, false), {
            clearHistory: !getStoredBool(SETTINGS_DEBUG_STORAGE_KEY, false),
            logChange: false,
            reason: 'startup'
        });

        window.__ptDebugHeartbeat && clearInterval(window.__ptDebugHeartbeat);
        window.__ptDebugHeartbeat = setInterval(() => {
            try {
                if (!this.isDebugEnabled()) return;
                if (!AppState.debugEventFlow && !AppState.debugMatchLogs) return;
                console.error('[PianoTrainer debug HEARTBEAT]', {
                    isPlaying: AppState.isPlaying,
                    expectedNotes: AppState.expectedNotes.length,
                    stickyHistory: AppState.debugAnchorHistory.length,
                    ts: new Date().toISOString()
                });
            } catch (e) {}
        }, 4000);
    }
};

function debugLogEvent(label, payload = {}) {
    return window.FeedbackDebug.debugLogEvent(label, payload);
}

function describeLogicalNoteForDebug(note, measureIndex = null, staffIndex = null) {
    return window.FeedbackDebug.describeLogicalNoteForDebug(note, measureIndex, staffIndex);
}

function describeGraphicalNoteForDebug(gn) {
    return window.FeedbackDebug.describeGraphicalNoteForDebug(gn);
}

function debugLogAnchorResolution(label, payload = {}) {
    return window.FeedbackDebug.debugLogAnchorResolution(label, payload);
}

function isDebugEnabled() {
    return window.FeedbackDebug.isDebugEnabled();
}

function syncDebugCheckbox() {
    return window.FeedbackDebug.syncDebugCheckbox();
}

function setDebugEnabled(enabled, options = {}) {
    return window.FeedbackDebug.setDebugEnabled(enabled, options);
}

window.forcePianoTrainerDebugStatus = function(tag = 'manual') {
    const snapshot = {
        tag,
        debugAnchors: AppState.debugPersistentAnchors,
        debugEventFlow: AppState.debugEventFlow,
        debugMatchLogs: AppState.debugMatchLogs,
        debugAnchorResolution: AppState.debugAnchorResolution,
        debugStickyFrames: AppState.debugStickyFrameLimit,
        stickyHistory: AppState.debugAnchorHistory.length,
        expectedNotes: AppState.expectedNotes.length,
        isPlaying: AppState.isPlaying,
        ts: new Date().toISOString()
    };
    if (window.FeedbackDebug.isDebugEnabled()) {
        console.error('[PianoTrainer debug STATUS]', snapshot);
    }
    return snapshot;
};

window.setDebugStickyFrames = function(count) {
    const nextCount = Math.max(1, parseInt(count, 10) || 10);
    AppState.debugStickyFrameLimit = nextCount;
    if (AppState.debugAnchorHistory.length > nextCount) {
        AppState.debugAnchorHistory.splice(0, AppState.debugAnchorHistory.length - nextCount);
    }
    if (AppState.debugPersistentAnchors) {
        window.FeedbackDebug.renderStickyDebug();
    } else {
        window.FeedbackDebug.clearSvgDebug();
    }
    return AppState.debugStickyFrameLimit;
};

window.clearStickyDebug = function() {
    AppState.debugAnchorHistory = [];
    window.FeedbackDebug.clearNoteheadComparisons();
    if (AppState.debugPersistentAnchors) {
        window.FeedbackDebug.renderStickyDebug();
    } else {
        window.FeedbackDebug.clearSvgDebug();
    }
};

Object.defineProperty(window, 'debugAnchors', {
    get() { return AppState.debugPersistentAnchors; },
    set(value) {
        window.FeedbackDebug.setDebugEnabled(!!value, {
            clearHistory: !value,
            logChange: !!value,
            reason: 'window.debugAnchors'
        });
    }
});

Object.defineProperty(window, 'debugEventFlow', {
    get() { return AppState.debugEventFlow; },
    set(value) { AppState.debugEventFlow = !!value; window.FeedbackDebug.syncDebugCheckbox(); }
});

Object.defineProperty(window, 'debugMatchLogs', {
    get() { return AppState.debugMatchLogs; },
    set(value) { AppState.debugMatchLogs = !!value; window.FeedbackDebug.syncDebugCheckbox(); }
});

Object.defineProperty(window, 'debugAnchorResolution', {
    get() { return AppState.debugAnchorResolution; },
    set(value) { AppState.debugAnchorResolution = !!value; window.FeedbackDebug.syncDebugCheckbox(); }
});

window.FeedbackDebug.init();


