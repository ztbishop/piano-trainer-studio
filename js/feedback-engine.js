// feedback-engine.js
// Owns feedback-note anchor resolution, expected-note matching, and overlay placement.
// This file must remain tied to the current stabilized rendered-note geometry behavior.
//
// WARNING:
// - Do not recalculate beam layout here.
// - Do not change OSMD/VexFlow coordinate assumptions casually.
// - Do not “clean up” notehead selection heuristics without targeted regression tests.
// - Keep feedback fixes isolated from playback scheduling and general UI changes.
//
// Fragile cases intentionally preserved here:
// - ornaments / lead-ins / non-note glyph clutter near noteheads
// - side-shifted same-stem chord clusters
// - augmentation dots and dot-like SVG shapes
// - fingering / technical / lyric / annotation rejection
// - cue or hidden notes that should not generate feedback expectations

// ==========================================
// VISUAL LOOPER ENGINE
// ==========================================
function renderScoreAndRefreshGeometry() {
    if (!osmd || !osmd.IsReadyToRender || !osmd.IsReadyToRender()) return;
    osmd.render();
    GeometryEngine.invalidate();
    GeometryEngine.renderLooper();
    if (window.FeedbackDebug?.renderStickyDebug) {
        window.FeedbackDebug.renderStickyDebug();
    }
}

const GeometryEngine = {
    unitsToPx: 10,
    noteAnchorCache: new WeakMap(),
    measureBoxCache: new Map(),

    invalidate() {
        this.noteAnchorCache = new WeakMap();
        this.measureBoxCache.clear();
        this.clearSvgFeedback();
        this.clearSvgLooper();
        if (window.FeedbackDebug?.clearSvgDebug) {
            window.FeedbackDebug.clearSvgDebug();
        }
    },

    getSvg() {
        return document.querySelector('#osmd-container svg');
    },

    getSvgViewBox() {
        const svg = this.getSvg();
        return svg?.viewBox?.baseVal || null;
    },

    getSvgClientRect() {
        const svg = this.getSvg();
        return svg ? svg.getBoundingClientRect() : null;
    },

    clientPointToSvg(clientX, clientY) {
        const rect = this.getSvgClientRect();
        const viewBox = this.getSvgViewBox();
        if (!rect || !viewBox || rect.width === 0 || rect.height === 0) return null;

        return {
            x: ((clientX - rect.left) / rect.width) * viewBox.width + viewBox.x,
            y: ((clientY - rect.top) / rect.height) * viewBox.height + viewBox.y
        };
    },

    ensureGroup(id) {
        const svg = this.getSvg();
        if (!svg) return null;

        let group = svg.querySelector(`#${id}`);
        if (!group) {
            group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            group.setAttribute('id', id);
            group.setAttribute('pointer-events', 'none');
            svg.appendChild(group);
        }
        return group;
    },

    getFeedbackGroup() {
        return this.ensureGroup('pt-feedback-group');
    },

    getLooperGroup() {
        return this.ensureGroup('pt-looper-group');
    },

    clearSvgFeedback() {
        const group = this.getSvg()?.querySelector('#pt-feedback-group');
        if (group) group.replaceChildren();
    },

    clearSvgLooper() {
        const group = this.getSvg()?.querySelector('#pt-looper-group');
        if (group) group.replaceChildren();
    },

    makeNoteKey(sourceNote, measureIndex, staffIndex) {
        const voice = sourceNote?.ParentVoiceEntry;
        const timestamp = voice?.Timestamp?.RealValue ?? 'na';
        const halfTone = sourceNote?.halfTone ?? 'na';
        const length = sourceNote?.Length?.RealValue ?? 'na';
        const staffId = sourceNote?.ParentStaff?.id ?? 'na';
        return `${measureIndex}|${staffIndex}|${staffId}|${timestamp}|${halfTone}|${length}`;
    },

    getNoteheadShape(graphicalNote) {
        if (!graphicalNote) return null;

        const directCandidates = [
            graphicalNote.Notehead,
            graphicalNote.notehead,
            graphicalNote.NoteHead,
            graphicalNote.noteHead,
            graphicalNote.GraphicalNotehead,
            graphicalNote.graphicalNotehead,
            graphicalNote.graphicalNoteHead,
            graphicalNote.NoteHeads?.[0],
            graphicalNote.noteHeads?.[0],
            graphicalNote.noteheadShape,
            graphicalNote.NoteheadShape
        ].filter(Boolean);

        for (const candidate of directCandidates) {
            if (candidate?.PositionAndShape?.AbsolutePosition) {
                return candidate.PositionAndShape;
            }
        }

        const mainShape = graphicalNote?.PositionAndShape;
        const mainCenterX = ((mainShape?.AbsolutePosition?.x ?? 0) + ((mainShape?.Size?.width ?? 0) / 2)) * this.unitsToPx;
        const mainCenterY = ((mainShape?.AbsolutePosition?.y ?? 0) + ((mainShape?.Size?.height ?? 0) / 2)) * this.unitsToPx;
        const seen = new WeakSet();
        const compactShapes = [];
        const bannedPathPattern = /(fing|finger|technical|techniq|lyric|text|label|annotation|ornament|artic|dynam|tempo|express|rehears|string|pedal)/i;

        const visit = (node, depth = 0, path = '') => {
            if (!node || typeof node !== 'object' || depth > 4) return;
            if (seen.has(node)) return;
            seen.add(node);

            if (path && bannedPathPattern.test(path)) return;

            const ps = node.PositionAndShape;
            if (ps?.AbsolutePosition && ps?.Size) {
                const wPx = (ps.Size.width ?? 0) * this.unitsToPx;
                const hPx = (ps.Size.height ?? 0) * this.unitsToPx;

                if (wPx >= 3 && wPx <= 22 && hPx >= 3 && hPx <= 18) {
                    compactShapes.push(ps);
                }
            }

            if (Array.isArray(node)) {
                for (let idx = 0; idx < node.length; idx++) {
                    visit(node[idx], depth + 1, `${path}[${idx}]`);
                }
                return;
            }

            for (const key of Object.keys(node)) {
                if (key === 'parent' || key === 'Parent' || key === 'sourceNote') continue;
                const nextPath = path ? `${path}.${key}` : key;
                if (bannedPathPattern.test(nextPath)) continue;
                try {
                    visit(node[key], depth + 1, nextPath);
                } catch (e) {}
            }
        };

        visit(graphicalNote, 0, 'graphicalNote');

        if (compactShapes.length === 0) return null;

        compactShapes.sort((a, b) => {
            const aw = (a.Size?.width ?? 0) * this.unitsToPx;
            const ah = (a.Size?.height ?? 0) * this.unitsToPx;
            const bw = (b.Size?.width ?? 0) * this.unitsToPx;
            const bh = (b.Size?.height ?? 0) * this.unitsToPx;

            const aArea = aw * ah;
            const bArea = bw * bh;

            const aCenterX = (a.AbsolutePosition.x + ((a.Size?.width ?? 0) / 2)) * this.unitsToPx;
            const aCenterY = (a.AbsolutePosition.y + ((a.Size?.height ?? 0) / 2)) * this.unitsToPx;
            const bCenterX = (b.AbsolutePosition.x + ((b.Size?.width ?? 0) / 2)) * this.unitsToPx;
            const bCenterY = (b.AbsolutePosition.y + ((b.Size?.height ?? 0) / 2)) * this.unitsToPx;

            const aAspect = aw / Math.max(ah, 0.001);
            const bAspect = bw / Math.max(bh, 0.001);

            const score = (area, aspect, cx, cy) => {
                const areaPenalty = Math.abs(area - 70);
                const aspectPenalty = Math.abs(aspect - 1.6) * 18;
                const distPenalty = Math.abs(cx - mainCenterX) * 0.65 + Math.abs(cy - mainCenterY) * 0.45;
                return areaPenalty + aspectPenalty + distPenalty;
            };

            return score(aArea, aAspect, aCenterX, aCenterY) - score(bArea, bAspect, bCenterX, bCenterY);
        });

        return compactShapes[0];
    },

    getSvgNoteheadAnchor(graphicalNote, preferredAnchor = null, debugContext = null) {
        if (!graphicalNote?.getSVGGElement) return null;

        let root = null;
        try {
            root = graphicalNote.getSVGGElement();
        } catch (e) {
            root = null;
        }
        if (!root || !root.querySelectorAll) return null;

        const rootBox = (() => {
            try {
                return root.getBBox();
            } catch (e) {
                return null;
            }
        })();

        const rootCenterX = rootBox ? (rootBox.x + rootBox.width / 2) : null;
        const rootCenterY = rootBox ? (rootBox.y + rootBox.height / 2) : null;
        const preferredX = preferredAnchor?.x ?? null;
        const preferredY = preferredAnchor?.y ?? null;

        const nodes = Array.from(root.querySelectorAll('*'));
        const candidates = [];

        for (const node of nodes) {
            if (!node || typeof node.getBBox !== 'function') continue;

            const tag = (node.tagName || '').toLowerCase();
            if (!['path', 'ellipse', 'circle', 'polygon'].includes(tag)) continue;

            let box;
            try {
                box = node.getBBox();
            } catch (e) {
                continue;
            }

            const w = box?.width ?? 0;
            const h = box?.height ?? 0;
            if (w < 3 || w > 24 || h < 3 || h > 18) continue;

            const aspect = w / Math.max(h, 0.001);
            if (aspect < 0.45 || aspect > 3.2) continue;

            const cx = box.x + w / 2;
            const cy = box.y + h / 2;

            const fill = (node.getAttribute('fill') || window.getComputedStyle(node).fill || '').toLowerCase();
            const stroke = (node.getAttribute('stroke') || window.getComputedStyle(node).stroke || '').toLowerCase();

            const filled = fill && fill !== 'none' && fill !== 'transparent' && !fill.includes('rgba(0, 0, 0, 0)');
            const stroked = stroke && stroke !== 'none' && stroke !== 'transparent' && !stroke.includes('rgba(0, 0, 0, 0)');

            // Geometry-only junk rejection:
            // keep fixed17 scoring/fallback intact, but ignore tiny dot-like shapes
            // that sit slightly to the right of the preferred notehead center.
            const dx = preferredX == null ? 0 : Math.abs(cx - preferredX);
            const dy = preferredY == null ? 0 : Math.abs(cy - preferredY);
            const area = w * h;
            const relDx = preferredX == null ? null : (cx - preferredX);
            const relDy = preferredY == null ? null : (cy - preferredY);
            const isTinyDotLike = (w <= 9.5 && h <= 9.5) || area <= 52;
            const isRoundDotLike = aspect >= 0.65 && aspect <= 1.55;
            const isRightSideDotLike = preferredX != null && preferredY != null &&
                relDx >= 2 && relDx <= 18 && Math.abs(relDy) <= 5.6 &&
                isTinyDotLike && isRoundDotLike;
            const isVerticalDotLike = preferredX != null && preferredY != null &&
                Math.abs(relDx) <= 4.6 && Math.abs(relDy) >= 2 && Math.abs(relDy) <= 14 &&
                isTinyDotLike && isRoundDotLike;
            const isDiagonalRightDotLike = preferredX != null && preferredY != null &&
                relDx >= 2 && relDx <= 14 && Math.abs(relDy) >= 2 && Math.abs(relDy) <= 8 &&
                isTinyDotLike && isRoundDotLike;

            if (isRightSideDotLike || isVerticalDotLike || isDiagonalRightDotLike) {
                debugLogAnchorResolution('SVG_NOTEHEAD_REJECT_DOTLIKE', {
                    context: debugContext,
                    preferredAnchor,
                    rejected: {
                        x: cx,
                        y: cy,
                        w,
                        h,
                        area,
                        aspect,
                        dx: relDx,
                        dy: relDy,
                        reason: isRightSideDotLike ? 'right-side-dot' : (isVerticalDotLike ? 'vertical-dot' : 'diagonal-right-dot')
                    }
                });
                continue;
            }

            const areaPenalty = Math.abs(area - 70);
            const aspectPenalty = Math.abs(aspect - 1.6) * 18;
            const centerXPenalty = rootCenterX == null ? 0 : Math.abs(cx - rootCenterX) * 0.25;
            const centerYPenalty = rootCenterY == null ? 0 : Math.abs(cy - rootCenterY) * 0.1;
            const preferredXPenalty = preferredX == null ? 0 : Math.abs(cx - preferredX) * 0.5;
            const preferredYPenalty = preferredY == null ? 0 : Math.abs(cy - preferredY) * 2.8;
            const fillBonus = filled ? -18 : 0;
            const strokePenalty = filled ? 0 : (stroked ? 6 : 10);

            const score = areaPenalty + aspectPenalty + centerXPenalty + centerYPenalty + preferredXPenalty + preferredYPenalty + fillBonus + strokePenalty;
            candidates.push({ node, box, score });
        }

        if (candidates.length === 0) {
            debugLogAnchorResolution('SVG_NOTEHEAD_CANDIDATES_NONE', {
                context: debugContext,
                preferredAnchor
            });
            return null;
        }

        candidates.sort((a, b) => a.score - b.score);

        const selectCandidate = (() => {
            if (preferredX == null && preferredY == null) return candidates[0];

            const annotate = (items) => items.map(c => {
                const cx = c.box.x + (c.box.width / 2);
                const cy = c.box.y + (c.box.height / 2);
                return {
                    entry: c,
                    cx,
                    cy,
                    xDistance: preferredX == null ? 0 : Math.abs(cx - preferredX),
                    yDistance: preferredY == null ? 0 : Math.abs(cy - preferredY)
                };
            });

            const topScore = candidates[0].score;
            const closeScoreCandidates = candidates.filter(c => (c.score - topScore) <= 18);
            const closeScoreAnnotated = annotate(closeScoreCandidates);
            const closeScoreMinCx = closeScoreAnnotated.length ? Math.min(...closeScoreAnnotated.map(item => item.cx)) : null;
            const closeScoreMaxCx = closeScoreAnnotated.length ? Math.max(...closeScoreAnnotated.map(item => item.cx)) : null;
            const closeScoreXSpan = (closeScoreMinCx == null || closeScoreMaxCx == null) ? Infinity : (closeScoreMaxCx - closeScoreMinCx);
            const useChordClusterTieBreak = preferredY != null && closeScoreAnnotated.length > 1 && closeScoreXSpan <= 18;

            const anchorNeighborhood = useChordClusterTieBreak
                ? []
                : annotate(candidates).filter(item => item.xDistance <= 14 && item.yDistance <= 10);

            const geometricPool = useChordClusterTieBreak
                ? closeScoreAnnotated
                : (anchorNeighborhood.length > 0 ? anchorNeighborhood : closeScoreAnnotated);

            if (geometricPool.length <= 1) return geometricPool[0]?.entry || closeScoreCandidates[0] || candidates[0];

            const ranked = geometricPool.sort((a, b) => {
                if (useChordClusterTieBreak) {
                    if (a.yDistance !== b.yDistance) return a.yDistance - b.yDistance;
                    if (a.xDistance !== b.xDistance) return a.xDistance - b.xDistance;
                    return a.entry.score - b.entry.score;
                }
                if (a.xDistance !== b.xDistance) return a.xDistance - b.xDistance;
                if (a.yDistance !== b.yDistance) return a.yDistance - b.yDistance;
                return a.entry.score - b.entry.score;
            });

            const winner = ranked[0]?.entry || candidates[0];
            const logType = useChordClusterTieBreak
                ? 'SVG_NOTEHEAD_CHORD_CLUSTER_TIEBREAK'
                : (anchorNeighborhood.length > 0 ? 'SVG_NOTEHEAD_ANCHOR_NEIGHBORHOOD_TIEBREAK' : 'SVG_NOTEHEAD_X_PROXIMITY_TIEBREAK');

            debugLogAnchorResolution(logType, {
                context: debugContext,
                preferredAnchor,
                topScore,
                sameClusterXSpan: closeScoreXSpan,
                usedAnchorNeighborhood: anchorNeighborhood.length > 0,
                shortlisted: ranked.map(item => ({
                    x: item.cx,
                    y: item.cy,
                    w: item.entry.box.width,
                    h: item.entry.box.height,
                    score: item.entry.score,
                    xDistance: item.xDistance,
                    yDistance: item.yDistance
                })),
                chosen: {
                    x: winner.box.x + (winner.box.width / 2),
                    y: winner.box.y + (winner.box.height / 2),
                    w: winner.box.width,
                    h: winner.box.height,
                    score: winner.score
                }
            });

            return winner;
        })();

        const best = selectCandidate.box;
        const selected = {
            x: best.x + (best.width / 2),
            y: best.y + (best.height / 2)
        };

        debugLogAnchorResolution('SVG_NOTEHEAD_CANDIDATES', {
            context: debugContext,
            preferredAnchor,
            selected,
            candidates: candidates.slice(0, 6).map(c => ({
                x: c.box.x + (c.box.width / 2),
                y: c.box.y + (c.box.height / 2),
                w: c.box.width,
                h: c.box.height,
                score: c.score
            }))
        });

        return selected;
    },

    getSafeFallbackAnchor(graphicalNote, measureIndex, staffIndex) {
        const noteheadShape = this.getNoteheadShape(graphicalNote);
        const shape = noteheadShape || graphicalNote?.PositionAndShape;
        if (!shape?.AbsolutePosition) return null;

        return {
            x: (shape.AbsolutePosition.x + ((shape.Size?.width || 0) / 2)) * this.unitsToPx,
            y: (shape.AbsolutePosition.y + ((shape.Size?.height || 0) / 2)) * this.unitsToPx,
            measureIndex,
            staffIndex
        };
    },

    getNoteAnchor(sourceNote, measureIndex, staffIndex) {
        if (this.noteAnchorCache.has(sourceNote)) {
            const cached = this.noteAnchorCache.get(sourceNote);
            debugLogAnchorResolution('ANCHOR_CACHE_HIT', {
                note: describeLogicalNoteForDebug(sourceNote, measureIndex, staffIndex),
                anchor: cached ? { x: cached.x, y: cached.y, measureIndex: cached.measureIndex, staffIndex: cached.staffIndex } : null
            });
            return cached;
        }

        const debugContext = {
            note: describeLogicalNoteForDebug(sourceNote, measureIndex, staffIndex),
            noteKey: this.makeNoteKey(sourceNote, measureIndex, staffIndex)
        };

        const graphicalNote = getGraphicalNote(sourceNote, measureIndex, staffIndex);
        if (!graphicalNote) {
            debugLogAnchorResolution('ANCHOR_GRAPHICAL_NOTE_MISSING', debugContext);
            return null;
        }

        let anchor = null;
        let preferredAnchor = null;

        const noteheadShape = this.getNoteheadShape(graphicalNote);
        if (noteheadShape?.AbsolutePosition) {
            preferredAnchor = {
                x: (noteheadShape.AbsolutePosition.x + ((noteheadShape.Size?.width || 0) / 2)) * this.unitsToPx,
                y: (noteheadShape.AbsolutePosition.y + ((noteheadShape.Size?.height || 0) / 2)) * this.unitsToPx,
                measureIndex,
                staffIndex
            };
        } else {
            preferredAnchor = this.getSafeFallbackAnchor(graphicalNote, measureIndex, staffIndex);
        }

        debugLogAnchorResolution('ANCHOR_PREFERRED', {
            ...debugContext,
            graphical: describeGraphicalNoteForDebug(graphicalNote),
            preferredAnchor
        });

        const svgAnchor = this.getSvgNoteheadAnchor(graphicalNote, preferredAnchor, debugContext);
        if (svgAnchor) {
            anchor = {
                x: svgAnchor.x,
                y: svgAnchor.y,
                measureIndex,
                staffIndex
            };
        } else {
            anchor = preferredAnchor;
        }

        debugLogAnchorResolution('ANCHOR_FINAL', {
            ...debugContext,
            preferredAnchor,
            svgAnchor,
            finalAnchor: anchor
        });

        if (anchor) this.noteAnchorCache.set(sourceNote, anchor);
        return anchor;
    },

    getMeasureBox(measureIndex, staffIndex = 0) {

        const key = `${measureIndex}|${staffIndex}`;
        if (this.measureBoxCache.has(key)) return this.measureBoxCache.get(key);

        const measure = osmd?.GraphicSheet?.MeasureList?.[measureIndex]?.[staffIndex];
        if (!measure?.ParentStaffLine) return null;

        const sys = measure.ParentStaffLine.ParentMusicSystem;
        let topYUnits = sys.PositionAndShape.AbsolutePosition.y;
        let bottomYUnits = topYUnits + sys.PositionAndShape.Size.height;

        if (sys.StaffLines && sys.StaffLines.length > 0) {
            topYUnits = sys.StaffLines[0].PositionAndShape.AbsolutePosition.y;
            bottomYUnits = sys.StaffLines[sys.StaffLines.length - 1].PositionAndShape.AbsolutePosition.y + 4;
        }

        const paddingUnits = 4;
        const box = {
            x: measure.PositionAndShape.AbsolutePosition.x * this.unitsToPx,
            y: (topYUnits - paddingUnits) * this.unitsToPx,
            width: measure.PositionAndShape.Size.width * this.unitsToPx,
            height: ((bottomYUnits + paddingUnits) - (topYUnits - paddingUnits)) * this.unitsToPx
        };

        this.measureBoxCache.set(key, box);
        return box;
    },

    drawFeedbackMarker(anchor, isCorrect) {
        if (!AppState.feedbackEnabled || !anchor) return;
        const group = this.getFeedbackGroup();
        if (!group) return;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', anchor.x);
        circle.setAttribute('cy', anchor.y);
        circle.setAttribute('r', 6);
        circle.setAttribute('fill', isCorrect ? 'rgba(46, 204, 113, 0.55)' : 'rgba(231, 76, 60, 0.55)');
        circle.setAttribute('stroke', isCorrect ? 'rgba(39, 174, 96, 0.9)' : 'rgba(192, 57, 43, 0.9)');
        circle.setAttribute('stroke-width', '1.5');
        group.appendChild(circle);
    },

    renderLooper() {
        this.clearSvgLooper();
        if (!document.getElementById('check-looper').checked || !osmd?.GraphicSheet) return;

        const group = this.getLooperGroup();
        if (!group) return;

        const minIdx = AppState.looper.min - 1;
        const maxIdx = AppState.looper.max - 1;

        for (let i = 0; i < osmd.GraphicSheet.MeasureList.length; i++) {
            const box = this.getMeasureBox(i, 0);
            if (!box) continue;

            if (i < minIdx || i > maxIdx) {
                const shade = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                shade.setAttribute('x', box.x);
                shade.setAttribute('y', box.y);
                shade.setAttribute('width', box.width);
                shade.setAttribute('height', box.height);
                shade.setAttribute('fill', 'rgba(128, 128, 128, 0.35)');
                group.appendChild(shade);
            }

            if (i === minIdx || i === maxIdx) {
                const bracket = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                bracket.setAttribute('x', i === minIdx ? box.x : box.x + box.width - 6);
                bracket.setAttribute('y', box.y);
                bracket.setAttribute('width', 6);
                bracket.setAttribute('height', box.height);
                bracket.setAttribute('fill', '#3498db');
                group.appendChild(bracket);
            }
        }
    }
};

function renderLooper() {
    GeometryEngine.renderLooper();
}

function enforceLooperBounds() {
    if (!document.getElementById('check-looper').checked || !osmd.cursor) return;
    
    const minLoop = AppState.looper.min;
    const maxLoop = AppState.looper.max;
    const current = osmd.cursor.Iterator.CurrentMeasureIndex + 1;
    
    if (current < minLoop || current > maxLoop) {
        osmd.cursor.reset();
        while (!osmd.cursor.Iterator.EndReached && osmd.cursor.Iterator.CurrentMeasureIndex < minLoop - 1) {
            osmd.cursor.Iterator.moveToNext();
        }
        osmd.cursor.update();
        handleAutoScroll();
    }
}


// ==========================================
// VISUAL FEEDBACK & AUTO-SCROLL
// ==========================================
function handleAutoScroll() {
    const autoScrollCheckbox = document.getElementById('check-autoscroll');
    if (autoScrollCheckbox && !autoScrollCheckbox.checked) return;
    if (!osmd.cursor || !osmd.cursor.cursorElement) return;

    const musicArea = document.getElementById('music-area');
    const cursorEl = osmd.cursor.cursorElement;

    const musicAreaRect = musicArea.getBoundingClientRect();
    const cursorRect = cursorEl.getBoundingClientRect();

    const cursorScreenY = cursorRect.top - musicAreaRect.top;

    if (cursorScreenY > (musicAreaRect.height * 0.6) || cursorScreenY < 0) {
        const targetScrollTop = musicArea.scrollTop + cursorScreenY - (musicAreaRect.height * 0.1);
        musicArea.scrollTo({
            top: Math.max(0, targetScrollTop),
            behavior: 'smooth' 
        });
    }
}

function getGraphicalNote(logicalNote, mIdx, staffIdx) {
    try {
        if (!osmd.GraphicSheet || !osmd.GraphicSheet.MeasureList) return null;
        const measure = osmd.GraphicSheet.MeasureList[mIdx][staffIdx];
        if (!measure || !measure.staffEntries) return null;

        const debugCandidates = [];

        for (let i = 0; i < measure.staffEntries.length; i++) {
            const se = measure.staffEntries[i];
            if (!se.graphicalVoiceEntries) continue;
            for (let j = 0; j < se.graphicalVoiceEntries.length; j++) {
                const gve = se.graphicalVoiceEntries[j];
                if (!gve.notes) continue;
                for (let k = 0; k < gve.notes.length; k++) {
                    const gn = gve.notes[k];
                    const src = gn?.sourceNote;
                    if (src) {
                        debugCandidates.push({
                            isExact: src === logicalNote,
                            sameHalfTone: src?.halfTone === logicalNote?.halfTone,
                            sameTimestamp: (src?.ParentVoiceEntry?.Timestamp?.RealValue ?? null) === (logicalNote?.ParentVoiceEntry?.Timestamp?.RealValue ?? null),
                            sameLength: (src?.Length?.RealValue ?? null) === (logicalNote?.Length?.RealValue ?? null),
                            ...describeGraphicalNoteForDebug(gn)
                        });
                    }
                    if (gn.sourceNote === logicalNote) {
                        debugLogAnchorResolution('GRAPHICAL_NOTE_MATCH', {
                            target: describeLogicalNoteForDebug(logicalNote, mIdx, staffIdx),
                            chosen: describeGraphicalNoteForDebug(gn),
                            nearby: debugCandidates
                                .filter(c => c.sameHalfTone || c.sameTimestamp || c.isExact)
                                .slice(0, 12)
                        });
                        return gn;
                    }
                }
            }
        }

        debugLogAnchorResolution('GRAPHICAL_NOTE_MISS', {
            target: describeLogicalNoteForDebug(logicalNote, mIdx, staffIdx),
            nearby: debugCandidates
                .filter(c => c.sameHalfTone || c.sameTimestamp)
                .slice(0, 12)
        });
    } catch(e) { console.error("Error finding graphical note:", e); }
    return null;
}

function drawFeedbackNote(midi, isCorrect, targetStaffId, forceMIdx = null, anchorOrExactY = null) {
    if (!AppState.feedbackEnabled) return;

    if (anchorOrExactY && typeof anchorOrExactY === 'object' && anchorOrExactY.x != null && anchorOrExactY.y != null) {
        GeometryEngine.drawFeedbackMarker(anchorOrExactY, isCorrect);
        window.FeedbackDebug?.pushStickyDebugFrame?.({
            kind: 'feedback',
            measureIndex: forceMIdx,
            notes: [{
                midi,
                staffId: targetStaffId,
                anchor: anchorOrExactY,
                hit: isCorrect,
                kind: 'feedback'
            }]
        });
        return;
    }

    let anchor = null;

    if (osmd?.cursor?.cursorElement) {
        const cursorRect = osmd.cursor.cursorElement.getBoundingClientRect();
        const cursorCenter = GeometryEngine.clientPointToSvg(
            cursorRect.left + (cursorRect.width / 2),
            cursorRect.top + (cursorRect.height / 2)
        );

        if (cursorCenter) {
            let yPos = null;

            if (typeof anchorOrExactY === 'number') {
                yPos = anchorOrExactY;
            } else {
                const mIdx = forceMIdx !== null ? forceMIdx : osmd.cursor.Iterator.CurrentMeasureIndex;
                if (!targetStaffId) {
                    const fallbackStaffId = (midi >= 60) ? AppState.hands.right : AppState.hands.left;
                    targetStaffId = fallbackStaffId ?? AppState.hands.right ?? 1;
                }
                const staffIdx = Math.max(0, (Number(targetStaffId) || 1) - 1);

                const staffMeasure = osmd.GraphicSheet.MeasureList[mIdx][staffIdx] || osmd.GraphicSheet.MeasureList[mIdx][0];
                const staffTopY = staffMeasure.PositionAndShape.AbsolutePosition.y * 10;

                const pitchMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
                const step = (Math.floor(midi / 12) - 1) * 7 + pitchMap[midi % 12];
                const fallbackAnchor = (staffIdx === 0) ? 38 : 26;
                yPos = staffTopY + (fallbackAnchor - step) * 5;
            }

            anchor = { x: cursorCenter.x, y: yPos };
        }
    }

    if (anchor) {
        GeometryEngine.drawFeedbackMarker(anchor, isCorrect);
        window.FeedbackDebug?.pushStickyDebugFrame?.({
            kind: 'feedback',
            measureIndex: forceMIdx,
            notes: [{
                midi,
                staffId: targetStaffId,
                anchor,
                hit: isCorrect,
                kind: 'feedback'
            }]
        });
    }
}

function getCursorSvgX() {
    if (!osmd?.cursor?.cursorElement) return null;
    const rect = osmd.cursor.cursorElement.getBoundingClientRect();
    const p = GeometryEngine.clientPointToSvg(rect.left + (rect.width / 2), rect.top + (rect.height / 2));
    return p ? p.x : null;
}

function findExpectedMatchForMidi(midi) {
    const candidates = AppState.expectedNotes.filter(n => n.midi === midi && !n.hit);
    if (AppState.debugMatchLogs) {
        debugLogEvent('MATCH_CANDIDATES', {
            midi,
            count: candidates.length,
            candidates: candidates.map(n => ({
                midi: n.midi,
                staffId: n.staffId,
                mIdx: n.mIdx,
                hit: n.hit,
                anchor: n.anchor ? { x: n.anchor.x, y: n.anchor.y } : null
            }))
        });
    }
    if (candidates.length === 0) return null;
    if (candidates.length === 1) {
        if (AppState.debugMatchLogs) {
            debugLogEvent('MATCH_CHOSEN', {
                midi,
                reason: 'single-candidate',
                chosen: {
                    staffId: candidates[0].staffId,
                    mIdx: candidates[0].mIdx,
                    anchor: candidates[0].anchor ? { x: candidates[0].anchor.x, y: candidates[0].anchor.y } : null
                }
            });
        }
        return candidates[0];
    }

    const cursorX = getCursorSvgX();
    if (cursorX == null) {
        if (AppState.debugMatchLogs) {
            debugLogEvent('MATCH_CHOSEN', {
                midi,
                reason: 'no-cursor-x',
                chosen: {
                    staffId: candidates[0].staffId,
                    mIdx: candidates[0].mIdx,
                    anchor: candidates[0].anchor ? { x: candidates[0].anchor.x, y: candidates[0].anchor.y } : null
                }
            });
        }
        return candidates[0];
    }

    const chosen = candidates
        .slice()
        .sort((a, b) => {
            const ax = a.anchor?.x ?? cursorX;
            const bx = b.anchor?.x ?? cursorX;
            return Math.abs(ax - cursorX) - Math.abs(bx - cursorX);
        })[0];

    if (AppState.debugMatchLogs) {
        debugLogEvent('MATCH_CHOSEN', {
            midi,
            reason: 'closest-to-cursor-x',
            cursorX,
            chosen: {
                staffId: chosen.staffId,
                mIdx: chosen.mIdx,
                anchor: chosen.anchor ? { x: chosen.anchor.x, y: chosen.anchor.y } : null
            }
        });
    }

    return chosen;
}

//editing function buildexpectednotefromentries to let playback ring through tied notes//
function getCombinedTieLength(note) {
    if (!note) return 0;

    let total = 0;
    let current = note;
    const seen = new Set();

    while (current && !seen.has(current)) {
        seen.add(current);

        if (current.Length && typeof current.Length.RealValue === 'number') {
            total += current.Length.RealValue;
        }

        const tie = current.NoteTie;
        if (!tie) break;

        // Prefer an explicit next note link if present
        const next =
            tie.Notes?.find(n => n !== current) ||
            tie.NextNote ||
            tie.nextNote ||
            null;

        if (!next) break;

        // Only combine true same-pitch ties
        if (next.halfTone !== current.halfTone) break;

        current = next;
    }

    return total || (note.Length?.RealValue ?? 0);
}

function buildExpectedNotesFromEntries(entries, currentMeasureIdx, currentTimestamp = null) {
    AppState.expectedNotes = [];
    AppState.visualNotesToStart = [];
    AppState.outOfRangeCurrentNotes = [];

    const mergedExpected = new Map();
    const mergedVisuals = new Map();
    const mergedOutOfRange = new Map();

    entries.forEach(e => {
        const sid = window.getResolvedStaffAssignmentIdFromEntry ? window.getResolvedStaffAssignmentIdFromEntry(e) : Number(e.Notes[0]?.ParentStaff?.id);
        const handRole = window.getAssignedHandRoleForStaff ? window.getAssignedHandRoleForStaff(sid) : null;
        const isRH = handRole === 'right';
        const isLH = handRole === 'left';
        const isPracticingThisHand = (isRH && AppState.practice.right) || (isLH && AppState.practice.left);

        if (isPracticingThisHand) {
            e.Notes.forEach(n => {
                const isInvisibleCue =
                    n.Notehead === 'none' ||
                    n.PrintObject === false ||
                    n.isCueNote === true;

                if (isInvisibleCue) {
                    return;
                }

                if (!n.isRest()) {
                    const isTieContinuation = n.NoteTie && n.NoteTie.StartNote !== n;

                    if (!isTieContinuation) {
                        const midi = n.halfTone + 12;
                        const key = `${sid}|${midi}`;

                        if (!isMidiInPlayerRange(midi)) {
                            if (!mergedOutOfRange.has(key)) {
                                mergedOutOfRange.set(key, { midi, staffId: sid, mIdx: currentMeasureIdx });
                            }
                            return;
                        }

                        const combinedLength = (n.NoteTie && n.NoteTie.StartNote === n)
                            ? getCombinedTieLength(n)
                            : n.Length.RealValue;

                        const noteDurationSeconds = (combinedLength * 4) * (60 / (AppState.baseBpm * AppState.speedPercent));
                        const durationMs = noteDurationSeconds * 1000;

                        let visualDurationMs = durationMs * 0.85;
                        let visualEndTimestamp = null;
                        if (AppState.mode === 'wait' && Number.isFinite(currentTimestamp)) {
                            visualEndTimestamp = currentTimestamp + (combinedLength * 0.85);
                        }

                        const staffIdx = sid - 1;
                        const anchor = GeometryEngine.getNoteAnchor(n, currentMeasureIdx, staffIdx);

                        const existingExpected = mergedExpected.get(key);
                        if (!existingExpected) {
                            mergedExpected.set(key, { midi, staffId: sid, hit: false, mIdx: currentMeasureIdx, anchor });
                        } else {
                            debugLogAnchorResolution('EXPECTED_NOTE_DEDUPE_COLLISION', {
                                key,
                                currentMeasureIdx,
                                incoming: {
                                    midi,
                                    staffId: sid,
                                    anchor: anchor ? { x: anchor.x, y: anchor.y } : null,
                                    note: describeLogicalNoteForDebug(n, currentMeasureIdx, staffIdx)
                                },
                                existing: {
                                    midi: existingExpected.midi,
                                    staffId: existingExpected.staffId,
                                    anchor: existingExpected.anchor ? { x: existingExpected.anchor.x, y: existingExpected.anchor.y } : null
                                }
                            });
                            if (!existingExpected.anchor && anchor) {
                                existingExpected.anchor = anchor;
                            }
                        }

                        const existingVisual = mergedVisuals.get(key);
                        if (!existingVisual) {
                            mergedVisuals.set(key, {
                                midi,
                                staffId: sid,
                                durationMs: visualDurationMs,
                                endTimestamp: visualEndTimestamp,
                                mIdx: currentMeasureIdx
                            });
                        } else {
                            existingVisual.durationMs = Math.max(existingVisual.durationMs, visualDurationMs);
                            if (Number.isFinite(visualEndTimestamp)) {
                                existingVisual.endTimestamp = Number.isFinite(existingVisual.endTimestamp)
                                    ? Math.max(existingVisual.endTimestamp, visualEndTimestamp)
                                    : visualEndTimestamp;
                            }
                        }
                    }
                }
            });
        }
    });

    AppState.expectedNotes = Array.from(mergedExpected.values());
    AppState.visualNotesToStart = Array.from(mergedVisuals.values());
    AppState.outOfRangeCurrentNotes = Array.from(mergedOutOfRange.values());

    if (typeof window.applyPendingEarlyGraceMatches === 'function') {
        window.applyPendingEarlyGraceMatches();
    }

    window.FeedbackDebug?.pushStickyDebugFrame?.({
        kind: 'expected',
        measureIndex: currentMeasureIdx,
        timestamp: osmd?.cursor?.Iterator?.currentTimeStamp?.RealValue ?? null,
        notes: AppState.expectedNotes.map(n => ({
            midi: n.midi,
            staffId: n.staffId,
            anchor: n.anchor,
            hit: n.hit,
            kind: 'expected'
        }))
    });

    debugLogEvent('EXPECTED_NOTES_BUILT', {
        measureIndex: currentMeasureIdx,
        count: AppState.expectedNotes.length,
        outOfRangeCount: AppState.outOfRangeCurrentNotes.length,
        expected: AppState.expectedNotes.map(n => ({
            midi: n.midi,
            staffId: n.staffId,
            mIdx: n.mIdx,
            hit: n.hit,
            anchor: n.anchor ? { x: n.anchor.x, y: n.anchor.y } : null
        })),
        outOfRange: AppState.outOfRangeCurrentNotes.map(n => ({
            midi: n.midi,
            staffId: n.staffId,
            mIdx: n.mIdx
        })),
        visuals: AppState.visualNotesToStart.map(n => ({
            midi: n.midi,
            staffId: n.staffId,
            durationMs: n.durationMs,
            mIdx: n.mIdx
        }))
    });
}

function processMissedNotes() {
    let missedCount = 0;
    AppState.expectedNotes.forEach(n => {
        if (!n.hit) {
            drawFeedbackNote(n.midi, false, n.staffId, n.mIdx, n.anchor);
            AppState.score.wrong++;
            missedCount++;
        }
    });

    if (missedCount > 0) {
        updateScoreDisplay();
    }
}



