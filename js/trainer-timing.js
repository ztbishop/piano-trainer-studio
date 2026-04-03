/**
 * Piano Trainer Studio
 * File: trainer-timing.js
 * Purpose: Centralized timing math for score traversal and playback scheduling.
 * Scope: Time calculations only. Does NOT control cursor rendering, feedback anchors, or UI.
 */

window.PTTiming = window.PTTiming || {};

// ⚠️ CRITICAL: Structural jump timing (repeats / endings)
// Do NOT replace these rules with first-note fallback lengths or raw iterator timestamp deltas.
// Realtime structural traversal must use the playable remainder of the current measure to avoid
// delay bugs on backward repeats and second-pass ending skips.
window.PTTiming.getRemainingMeasureWaitWhole = function getRemainingMeasureWaitWhole(options = {}) {
    const {
        currentMeasureIdx,
        currentTimestamp,
        fallbackLength = 1,
        getMeasureTimingInfo
    } = options;

    const fallbackWhole = Number.isFinite(fallbackLength) && fallbackLength > 0 ? fallbackLength : 0.25;
    const timing = typeof getMeasureTimingInfo === 'function' ? getMeasureTimingInfo(currentMeasureIdx) : null;
    const measureStart = Number.isFinite(timing?.startTimestamp) ? timing.startTimestamp : null;
    const measureLength = Number.isFinite(timing?.actualLengthWhole) && timing.actualLengthWhole > 0
        ? timing.actualLengthWhole
        : (Number.isFinite(timing?.nominalMeasureLengthWhole) && timing.nominalMeasureLengthWhole > 0 ? timing.nominalMeasureLengthWhole : null);

    if (!Number.isFinite(currentTimestamp) || measureStart == null || measureLength == null) {
        return fallbackWhole;
    }

    const measureEnd = measureStart + measureLength;
    const remainingWhole = measureEnd - currentTimestamp;
    if (!Number.isFinite(remainingWhole) || remainingWhole <= 1e-6) {
        return fallbackWhole;
    }

    return Math.max(1e-6, remainingWhole);
};

window.PTTiming.getTraversalBeatsToWait = function getTraversalBeatsToWait(options = {}) {
    const {
        currentMeasureIdx,
        currentTimestamp,
        nextMeasureIdx,
        nextTimestamp,
        fallbackLength = 1,
        getMeasureTimingInfo
    } = options;

    const remainingMeasureWhole = window.PTTiming.getRemainingMeasureWaitWhole({
        currentMeasureIdx,
        currentTimestamp,
        fallbackLength,
        getMeasureTimingInfo
    });

    if (nextTimestamp < currentTimestamp) {
        return remainingMeasureWhole * 4;
    }

    if (nextMeasureIdx > currentMeasureIdx + 1) {
        return remainingMeasureWhole * 4;
    }

    return (nextTimestamp - currentTimestamp) * 4;
};
