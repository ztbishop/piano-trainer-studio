// Read-only MusicXML hairpin timing. Rendering, notes and playback traversal remain owned by OSMD/core.
(function () {
    const epsilon = 1e-9;
    const name = node => node?.localName || node?.nodeName?.split(':').pop();
    const children = node => Array.from(node?.children || node?.childNodes || []).filter(child => child.nodeType === 1);
    const child = (node, tag) => children(node).find(item => name(item) === tag);
    const text = (node, tag) => child(node, tag)?.textContent?.trim();
    const positive = value => {
        const number = Number(value);
        if (!Number.isFinite(number) || number <= 0) throw Error('Invalid MusicXML duration/divisions');
        return number;
    };

    function readPart(part, instrument, sheet, staffIndices) {
        const measures = children(part).filter(node => name(node) === 'measure');
        const sourceMeasures = sheet.SourceMeasures || [];
        if (measures.length !== sourceMeasures.length || !measures.length) return null;
        const staffIds = (instrument.Staves || []).map(staff => staffIndices.get(staff));
        if (!staffIds.length || staffIds.some(id => id == null) || new Set(staffIds).size !== staffIds.length) return null;
        const result = new Map(staffIds.map(id => [id, []]));
        const events = [];
        let divisions;
        for (let index = 0; index < measures.length; index++) {
            const absolute = sourceMeasures[index].AbsoluteTimestamp?.RealValue;
            const length = sourceMeasures[index].Duration?.RealValue;
            if (!Number.isFinite(absolute) || !Number.isFinite(length) || length < 0) return null;
            let cursor = 0;
            for (const element of children(measures[index])) {
                const tag = name(element);
                if (tag === 'attributes') {
                    const value = text(element, 'divisions');
                    if (value != null) divisions = positive(value);
                } else if (tag === 'note') {
                    // Grace notes and additional chord tones never advance the MusicXML stream clock.
                    if (!child(element, 'grace') && !child(element, 'chord')) {
                        cursor += positive(text(element, 'duration')) / (4 * positive(divisions));
                    }
                } else if (tag === 'backup' || tag === 'forward') {
                    const duration = positive(text(element, 'duration')) / (4 * positive(divisions));
                    cursor += tag === 'backup' ? -duration : duration;
                } else if (tag === 'direction') {
                    const wedges = children(element).filter(node => name(node) === 'direction-type')
                        .flatMap(node => children(node).filter(item => name(item) === 'wedge'));
                    if (!wedges.length) continue;
                    const staffValue = text(element, 'staff');
                    const staff = staffValue == null ? 1 : Number(staffValue);
                    if (!Number.isInteger(staff) || staff < 1 || staff > staffIds.length) return null;
                    let offset = 0;
                    const offsetElement = child(element, 'offset');
                    // MusicXML offset sound defaults to "no": visual displacement is not playback time.
                    if (offsetElement?.getAttribute('sound') === 'yes') {
                        const value = offsetElement.textContent?.trim();
                        if (!value) return null;
                        offset = Number(value) / (4 * positive(divisions));
                        if (!Number.isFinite(offset)) return null;
                    }
                    for (const wedge of wedges) {
                        const type = wedge.getAttribute('type');
                        if (type === 'continue') continue;
                        if (!['crescendo', 'diminuendo', 'stop'].includes(type)) return null;
                        const numberValue = wedge.getAttribute('number');
                        const number = numberValue == null || numberValue === '' ? 1 : Number(numberValue);
                        if (!Number.isInteger(number) || number < 1) return null;
                        events.push({ timestamp: absolute + cursor + offset, type, number, staffIndex: staffIds[staff - 1] });
                    }
                }
                // An incompatible stream must not replace otherwise usable parsed OSMD expressions.
                if (cursor < -epsilon || cursor > length + epsilon) return null;
            }
        }
        const scoreStart = sourceMeasures[0].AbsoluteTimestamp.RealValue;
        const finalMeasure = sourceMeasures[sourceMeasures.length - 1];
        const scoreEnd = finalMeasure.AbsoluteTimestamp.RealValue + finalMeasure.Duration.RealValue;
        events.sort((a, b) => a.timestamp - b.timestamp || Number(a.type !== 'stop') - Number(b.type !== 'stop'));
        const open = new Map();
        for (const event of events) {
            if (event.timestamp < scoreStart - epsilon || event.timestamp > scoreEnd + epsilon) return null;
            if (event.type === 'stop') {
                const start = open.get(event.number);
                if (!start || event.timestamp <= start.timestamp + epsilon) return null;
                result.get(start.staffIndex).push({ timestamp: start.timestamp, endTimestamp: event.timestamp,
                    direction: start.type === 'crescendo' ? 1 : -1 });
                open.delete(event.number);
            } else {
                if (open.has(event.number)) return null;
                open.set(event.number, event);
            }
        }
        return open.size ? null : result;
    }

    function read(sheet, xml) {
        if (!sheet || typeof xml !== 'string' || !xml.trim() || typeof DOMParser !== 'function') return null;
        let root;
        try { root = new DOMParser().parseFromString(xml, 'application/xml').documentElement; }
        catch (_) { return null; }
        const hasParseError = node => name(node) === 'parsererror' || children(node).some(hasParseError);
        if (name(root) !== 'score-partwise' || hasParseError(root)) return null;
        const parts = children(root).filter(node => name(node) === 'part');
        if (!parts.length) return null;
        const instruments = sheet.Instruments || [];
        const staffIndices = new Map((sheet.Staves || []).map((staff, index) => [staff, index]));
        const result = new Map();
        for (const part of parts) {
            const id = part.getAttribute('id');
            const matches = instruments.filter(instrument => instrument.IdString === id);
            if (!id || matches.length !== 1 || parts.filter(item => item.getAttribute('id') === id).length !== 1) continue;
            try {
                const mapped = readPart(part, matches[0], sheet, staffIndices);
                if (mapped) for (const [staff, spans] of mapped) result.set(staff, spans);
            } catch (_) { /* Invalid source metadata leaves this part on the existing OSMD fallback. */ }
        }
        return result.size ? result : null;
    }

    window.ScoreExpressionSource = Object.freeze({ read });
})();
