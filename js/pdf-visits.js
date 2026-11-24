// Visits are in performance order. The score measure is OSMD's one-based
// source index, the same unit as the existing looper. Neither is a PDF box ID.
export function scoreVisits(sheet, skipInvisible) {
    const iterator = sheet.MusicPartManager.getIterator();
    iterator.SkipInvisibleNotes = skipInvisible;
    const visits = [], passes = new Map();
    for (let step = 0; !iterator.EndReached; step++, iterator.moveToNext()) {
        if (step >= 100000) throw new Error('This score exceeds the supported PDF traversal length.');
        const measure = iterator.CurrentMeasureIndex + 1;
        if (measure === visits.at(-1)?.measure && !iterator.JumpOccurred) continue;
        const pass = (passes.get(measure) || 0) + 1;
        passes.set(measure, pass);
        visits.push({step, measure, pass, time: iterator.CurrentEnrolledTimestamp.RealValue});
    }
    return visits;
}

export function visitIndex(visits, time) {
    let lo = 0, hi = visits.length - 1;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (visits[mid].time <= time) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

export function mapVisitRange(mapping, first, last, printed, limit) {
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > mapping.length)
        throw new Error('Choose a valid first and last score visit.');
    if (printed !== null && (!Number.isInteger(printed) || printed < 1 || printed + last - first > limit))
        throw new Error('The printed range must fit within the available measure numbers.');
    const next = mapping.slice();
    for (let i = first; i <= last; i++) next[i - 1] = printed === null ? null : printed + i - first;
    return next;
}
