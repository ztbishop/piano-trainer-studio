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
        if (history.length === 0) return;

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
            if (clearHistory) {
                AppState.debugAnchorHistory = [];
            }
            this.clearSvgDebug();
            if (clearHistory) {
                this.renderStickyDebug();
            }
        } else {
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
