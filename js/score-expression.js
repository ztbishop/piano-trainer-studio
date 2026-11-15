// Read-only score expression: output velocity and gate only, never cursor timing or engraving.
(function () {
    const velocities = Object.freeze({ ppp: 28, pp: 40, p: 56, mp: 72, mf: 88, f: 104, ff: 116, fff: 124 });
    // The bundled OSMD does not export DynamicEnum. Its fixed levels are ppp=3 through fff=10.
    const dynamicNames = Object.freeze({ 3: 'ppp', 4: 'pp', 5: 'p', 6: 'mp', 7: 'mf', 8: 'f', 9: 'ff', 10: 'fff' });
    const sheetCaches = new WeakMap();
    const epsilon = 1e-9;
    const defaultDynamicChange = 16;

    function dynamicVelocity(dynamic) {
        const name = dynamicNames[dynamic?.DynEnum];
        return Object.prototype.hasOwnProperty.call(velocities, name) ? velocities[name] : null;
    }

    function buildCache(sheet) {
        const staffIndices = new Map((sheet.Staves || []).map((staff, index) => [staff, index]));
        const events = [];
        const instrumentEvents = new Map();
        const fixedEvents = [];
        const sourceEvents = [];
        const seenSpans = new Set();
        for (const measure of sheet.SourceMeasures || []) {
            (measure.StaffLinkedExpressions || []).forEach((expressions, staffIndex) => {
                for (const expression of expressions || []) {
                    const velocity = dynamicVelocity(expression.InstantaneousDynamic);
                    const timestamp = expression.AbsoluteTimestamp?.RealValue;
                    if (velocity != null && Number.isFinite(timestamp)) {
                        const event = { timestamp, velocity, staffIndex };
                        (fixedEvents[staffIndex] ||= []).push(event);
                        sourceEvents.push(event);
                    }
                    const span = expression.StartingContinuousDynamic;
                    if (!span || seenSpans.has(span)) continue;
                    seenSpans.add(span);
                    const start = span.StartMultiExpression?.AbsoluteTimestamp?.RealValue;
                    const endBase = span.EndMultiExpression?.AbsoluteTimestamp?.RealValue;
                    // OSMD stores a wedge stop's MusicXML offset separately from its source timestamp.
                    const endOffset = span.EndMultiExpression?.EndOffsetFraction?.RealValue ?? 0;
                    const end = endBase + endOffset;
                    if ((span.DynamicType === 0 || span.DynamicType === 1) &&
                        Number.isFinite(start) && Number.isFinite(endBase) && Number.isFinite(endOffset) &&
                        Number.isFinite(end) && end > start + epsilon) {
                        sourceEvents.push({ timestamp: start, endTimestamp: end, staffIndex,
                            direction: span.DynamicType === 0 ? 1 : -1 });
                    }
                }
            });
        }
        for (const staffEvents of fixedEvents) {
            staffEvents?.sort((a, b) => a.timestamp - b.timestamp);
        }
        // Fixed marks at an onset establish the starting level before any hairpins there.
        sourceEvents.sort((a, b) => a.timestamp - b.timestamp || Number(!!a.direction) - Number(!!b.direction));
        const cache = { staffIndices, events, instrumentEvents };
        for (const source of sourceEvents) {
            const event = { ...source };
            const instrument = sheet.Staves?.[event.staffIndex]?.ParentInstrument;
            if (event.direction) {
                event.velocity = levelAt(cache, event.staffIndex, instrument, event.timestamp);
                event.endVelocity = Math.max(28, Math.min(124, event.velocity + event.direction * defaultDynamicChange));
                const staffFixed = fixedEvents[event.staffIndex] || [];
                const target = staffFixed[lastEventIndex(staffFixed, event.timestamp) + 1];
                // A fixed mark within the span ends the ramp. Never borrow a distant later mark.
                if (target && target.timestamp <= event.endTimestamp + epsilon &&
                    (target.velocity - event.velocity) * event.direction >= 0) {
                    event.endTimestamp = target.timestamp;
                    event.endVelocity = target.velocity;
                }
            }
            (events[event.staffIndex] ||= []).push(event);
            if (instrument && typeof instrument === 'object') {
                if (!instrumentEvents.has(instrument)) instrumentEvents.set(instrument, []);
                instrumentEvents.get(instrument).push(event);
            }
        }
        return cache;
    }

    function lastEventIndex(events, timestamp) {
        let low = 0;
        let high = events.length;
        // Query source position each time, so seeks and repeats never inherit a later dynamic.
        while (low < high) {
            const mid = (low + high) >>> 1;
            if (events[mid].timestamp <= timestamp + epsilon) low = mid + 1;
            else high = mid;
        }
        return low - 1;
    }

    function eventLevel(event, timestamp) {
        if (!event.direction) return event.velocity;
        const progress = Math.max(0, Math.min(1, (timestamp - event.timestamp) / (event.endTimestamp - event.timestamp)));
        return event.velocity + progress * (event.endVelocity - event.velocity);
    }

    function levelAt(cache, staffIndex, instrument, timestamp) {
        const events = cache.events[staffIndex] || [];
        const index = lastEventIndex(events, timestamp);
        if (index >= 0) return eventLevel(events[index], timestamp);

        // Before a staff's first expression, inherit the instrument's latest unambiguous level.
        // Own-staff expressions retain precedence; OSMD lacks full author-intended playback scope.
        const partEvents = cache.instrumentEvents.get(instrument) || [];
        let partIndex = lastEventIndex(partEvents, timestamp);
        if (partIndex < 0) return 100;
        const latestTimestamp = partEvents[partIndex].timestamp;
        const latestByStaff = new Map();
        while (partIndex >= 0 && Math.abs(partEvents[partIndex].timestamp - latestTimestamp) <= epsilon) {
            const event = partEvents[partIndex--];
            if (!latestByStaff.has(event.staffIndex)) latestByStaff.set(event.staffIndex, Math.round(eventLevel(event, timestamp)));
        }
        const levels = new Set(latestByStaff.values());
        return levels.size === 1 ? levels.values().next().value : 100;
    }

    function velocityAt(note, sheet) {
        if (!sheet || typeof sheet !== 'object') return 100;
        let cache = sheetCaches.get(sheet);
        if (!cache) {
            cache = buildCache(sheet);
            sheetCaches.set(sheet, cache);
        }
        const staffEntry = note?.ParentStaffEntry || note?.ParentVoiceEntry?.ParentSourceStaffEntry;
        const staffIndex = cache.staffIndices.get(staffEntry?.ParentStaff);
        const timestamp = staffEntry?.AbsoluteTimestamp?.RealValue;
        if (staffIndex == null || !Number.isFinite(timestamp)) return 100;
        return Math.round(levelAt(cache, staffIndex, staffEntry.ParentStaff.ParentInstrument, timestamp));
    }

    function resolve(note, sheet) {
        const enums = window.opensheetmusicdisplay?.ArticulationEnum;
        const articulations = note?.ParentVoiceEntry?.Articulations || [];
        const has = name => enums?.[name] != null && articulations.some(item => item?.articulationEnum === enums[name]);
        // A tied attack retains the existing combined sustain, even if its first segment has a dot.
        const staccato = !note?.NoteTie && has('staccato');
        const velocity = Math.min(127, velocityAt(note, sheet) + (has('accent') ? 15 : 0));
        return { velocity, gate: staccato ? 0.5 : 0.9, staccato };
    }

    function mergeOutputs(requests) {
        const groups = new Map();
        // Tone and MIDI release by pitch. Arbitrate only this onset's output requests,
        // independently for each destination and immediate/deferred accompaniment.
        for (const request of requests) {
            for (const destination of ['toLocalAudio', 'toMidiOut']) {
                if (!request[destination]) continue;
                const key = `${request.midi}|${!!request.deferred}|${destination}`;
                const existing = groups.get(key);
                if (existing) {
                    existing.durationMs = Math.max(existing.durationMs, request.durationMs);
                    existing.velocity = Math.max(existing.velocity, request.velocity);
                    existing.staccato = existing.staccato && !!request.staccato;
                } else {
                    groups.set(key, {
                        midi: request.midi, durationMs: request.durationMs, velocity: request.velocity,
                        staccato: !!request.staccato, deferred: !!request.deferred,
                        toLocalAudio: destination === 'toLocalAudio', toMidiOut: destination === 'toMidiOut'
                    });
                }
            }
        }
        const outputs = new Map();
        for (const request of groups.values()) {
            const key = `${request.midi}|${request.deferred}|${request.durationMs}|${request.velocity}|${request.staccato}`;
            const existing = outputs.get(key);
            if (existing) {
                existing.toLocalAudio ||= request.toLocalAudio;
                existing.toMidiOut ||= request.toMidiOut;
            } else {
                outputs.set(key, request);
            }
        }
        return [...outputs.values()];
    }

    window.ScoreExpression = Object.freeze({ resolve, mergeOutputs });
})();
