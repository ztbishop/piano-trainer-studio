// midi-import.js
// Experimental browser-only MIDI import pipeline.
// Converts .mid/.midi files into simplified MusicXML so the app can keep using OSMD.
// Keep parsing/conversion logic isolated here so trainer-core.js remains the single score-loading path.

(function () {
    const MIDI_IMPORT_FOLDER_NAME = 'MIDI Imports';
    const DEFAULT_SPLIT_MIDI = 60; // Middle C (C4)
    const DIVISIONS_PER_QUARTER = 24; // Supports straight + triplet-friendly timing.
    const EPSILON = 1e-6;

    function isMidiFileName(fileName = '') {
        return /\.(mid|midi)$/i.test(String(fileName || '').trim());
    }

    function getMidiImportBaseTitle(fileName = '') {
        const base = String(fileName || '').trim();
        if (!base) return 'Imported MIDI';
        return base.replace(/\.(mid|midi)$/i, '').trim() || 'Imported MIDI';
    }

    function readArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error || new Error('Could not read MIDI file.'));
            reader.onload = () => resolve(reader.result);
            reader.readAsArrayBuffer(file);
        });
    }

    function showExperimentalMidiWarning(fileName = '') {
        return window.confirm(
            `Experimental MIDI import for "${fileName || 'this file'}"?

` +
            'This will convert MIDI into simplified sheet music. Results may be less accurate than MusicXML.'
        );
    }

    function ensureScoreLibraryAvailable() {
        if (!window.ScoreLibrary) {
            throw new Error('Score library is not available.');
        }
    }

    async function ensureMidiImportsFolder() {
        ensureScoreLibraryAvailable();
        const folders = await ScoreLibrary.getAllFolders();
        const existing = (folders || []).find(folder => String(folder?.name || '').trim().toLowerCase() === MIDI_IMPORT_FOLDER_NAME.toLowerCase());
        if (existing) return existing;
        return ScoreLibrary.createFolder(MIDI_IMPORT_FOLDER_NAME);
    }

    function decodeAscii(bytes, start, end) {
        let out = '';
        for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i] || 0);
        return out;
    }

    function readUint32(bytes, offset) {
        return ((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    }

    function readUint16(bytes, offset) {
        return (bytes[offset] << 8) | bytes[offset + 1];
    }

    function readVarLen(bytes, offset) {
        let value = 0;
        let i = offset;
        while (i < bytes.length) {
            const b = bytes[i];
            value = (value << 7) | (b & 0x7f);
            i += 1;
            if (!(b & 0x80)) break;
        }
        return { value, nextOffset: i };
    }

    function parseMidiArrayBuffer(arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        if (decodeAscii(bytes, 0, 4) !== 'MThd') {
            throw new Error('Invalid MIDI file header.');
        }

        const headerLength = readUint32(bytes, 4);
        const format = readUint16(bytes, 8);
        const trackCount = readUint16(bytes, 10);
        const division = readUint16(bytes, 12);
        if (division & 0x8000) {
            throw new Error('SMPTE MIDI timing is not supported yet.');
        }
        const ppq = division;
        let offset = 8 + headerLength;
        const tempos = [];
        const timeSignatures = [];
        const tracks = [];
        const allNotes = [];

        for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
            if (decodeAscii(bytes, offset, offset + 4) !== 'MTrk') {
                throw new Error(`Invalid MIDI track header at track ${trackIndex + 1}.`);
            }
            const trackLength = readUint32(bytes, offset + 4);
            const trackEnd = offset + 8 + trackLength;
            let ptr = offset + 8;
            let absTick = 0;
            let runningStatus = null;
            const activeNotes = new Map();
            let trackName = '';
            let instrumentName = '';
            let channelUseMask = 0;
            const programByChannel = new Map();

            while (ptr < trackEnd) {
                const delta = readVarLen(bytes, ptr);
                absTick += delta.value;
                ptr = delta.nextOffset;
                if (ptr >= trackEnd) break;

                let statusByte = bytes[ptr];
                let dataOffset = ptr + 1;
                if (statusByte < 0x80) {
                    if (runningStatus == null) throw new Error(`Running status missing in track ${trackIndex + 1}.`);
                    statusByte = runningStatus;
                    dataOffset = ptr;
                } else if (statusByte < 0xf0) {
                    runningStatus = statusByte;
                }

                if (statusByte === 0xff) {
                    const metaType = bytes[dataOffset];
                    const metaLen = readVarLen(bytes, dataOffset + 1);
                    const metaStart = metaLen.nextOffset;
                    const metaEnd = metaStart + metaLen.value;
                    if (metaEnd > trackEnd) break;

                    if (metaType === 0x03) trackName = decodeAscii(bytes, metaStart, metaEnd);
                    if (metaType === 0x04) instrumentName = decodeAscii(bytes, metaStart, metaEnd);
                    if (metaType === 0x51 && metaLen.value === 3) {
                        const mpqn = (bytes[metaStart] << 16) | (bytes[metaStart + 1] << 8) | bytes[metaStart + 2];
                        tempos.push({ tick: absTick, mpqn });
                    }
                    if (metaType === 0x58 && metaLen.value >= 2) {
                        timeSignatures.push({
                            tick: absTick,
                            numerator: bytes[metaStart] || 4,
                            denominator: Math.pow(2, bytes[metaStart + 1] || 2)
                        });
                    }

                    ptr = metaEnd;
                    continue;
                }

                if (statusByte === 0xf0 || statusByte === 0xf7) {
                    const sysexLen = readVarLen(bytes, dataOffset);
                    ptr = sysexLen.nextOffset + sysexLen.value;
                    continue;
                }

                const eventType = statusByte & 0xf0;
                const channel = (statusByte & 0x0f) + 1;
                channelUseMask |= (1 << (channel - 1));

                if (eventType === 0x80 || eventType === 0x90) {
                    const noteNumber = bytes[dataOffset];
                    const velocity = bytes[dataOffset + 1];
                    const key = `${channel}:${noteNumber}`;
                    const isNoteOn = eventType === 0x90 && velocity > 0;
                    if (isNoteOn) {
                        const activeList = activeNotes.get(key) || [];
                        activeList.push({ startTick: absTick, velocity });
                        activeNotes.set(key, activeList);
                    } else {
                        const activeList = activeNotes.get(key) || [];
                        const started = activeList.shift();
                        if (activeList.length) activeNotes.set(key, activeList);
                        else activeNotes.delete(key);
                        if (started) {
                            allNotes.push({
                                trackIndex,
                                channel,
                                midi: noteNumber,
                                velocity: started.velocity,
                                startTick: started.startTick,
                                endTick: Math.max(absTick, started.startTick + 1)
                            });
                        }
                    }
                    ptr = dataOffset + 2;
                    continue;
                }

                if (eventType === 0xa0 || eventType === 0xb0 || eventType === 0xe0) {
                    ptr = dataOffset + 2;
                    continue;
                }

                if (eventType === 0xc0 || eventType === 0xd0) {
                    if (eventType === 0xc0) programByChannel.set(channel, bytes[dataOffset]);
                    ptr = dataOffset + 1;
                    continue;
                }

                ptr = dataOffset;
            }

            tracks.push({
                index: trackIndex,
                name: trackName,
                instrumentName,
                channels: Array.from({ length: 16 }, (_, idx) => idx + 1).filter(channel => channelUseMask & (1 << (channel - 1))),
                programs: Array.from(programByChannel.entries()).map(([channel, program]) => ({ channel, program }))
            });
            offset = trackEnd;
        }

        if (!tempos.length) tempos.push({ tick: 0, mpqn: 500000 });
        if (!timeSignatures.length) timeSignatures.push({ tick: 0, numerator: 4, denominator: 4 });

        return { format, ppq, tempos, timeSignatures, tracks, notes: allNotes };
    }

    function getPrimaryTimeSignature(parsed) {
        return (parsed.timeSignatures || []).slice().sort((a, b) => (a.tick - b.tick))[0] || { numerator: 4, denominator: 4, tick: 0 };
    }

    function getPrimaryTempo(parsed) {
        return (parsed.tempos || []).slice().sort((a, b) => (a.tick - b.tick))[0] || { tick: 0, mpqn: 500000 };
    }

    function buildTrackSummaries(parsed) {
        const noteCountsByTrack = new Map();
        (parsed.notes || []).forEach(note => noteCountsByTrack.set(note.trackIndex, (noteCountsByTrack.get(note.trackIndex) || 0) + 1));
        return (parsed.tracks || []).map(track => ({
            trackIndex: track.index,
            name: track.name || `Track ${track.index + 1}`,
            instrumentName: track.instrumentName || '',
            channels: track.channels || [],
            noteCount: noteCountsByTrack.get(track.index) || 0
        }));
    }

    function getQuantUnitTicks(ppq) {
        return Math.max(1, Math.round(ppq / DIVISIONS_PER_QUARTER));
    }

    function quantizeToUnit(value, unit) {
        return Math.round(value / unit) * unit;
    }

    function mergeSamePitchOverlaps(notes, quantUnitTicks) {
        const startTolerance = Math.max(1, Math.round(quantUnitTicks / 2));
        const overlapTolerance = Math.max(1, Math.round(quantUnitTicks / 3));
        const groups = new Map();

        (notes || []).forEach(note => {
            const key = `${note.staff}:${note.midi}`;
            const list = groups.get(key) || [];
            const last = list[list.length - 1];
            const startsNearlyTogether = !!last && Math.abs(note.startTick - last.startTick) <= startTolerance;
            const overlapsConflicting = !!last && note.startTick < (last.endTick - overlapTolerance);
            if (last && (startsNearlyTogether || overlapsConflicting)) {
                last.startTick = Math.min(last.startTick, note.startTick);
                last.endTick = Math.max(last.endTick, note.endTick);
                last.durationTicks = Math.max(quantUnitTicks, last.endTick - last.startTick);
                last.velocity = Math.max(last.velocity || 0, note.velocity || 0);
                last.mergedSourceIds = (last.mergedSourceIds || []).concat(note.id);
                if (note.trackIndex < last.trackIndex) last.trackIndex = note.trackIndex;
                if (note.channel < last.channel) last.channel = note.channel;
                return;
            }
            list.push({ ...note, mergedSourceIds: [note.id] });
            groups.set(key, list);
        });

        return Array.from(groups.values())
            .flat()
            .sort((a, b) => (a.startTick - b.startTick) || (b.durationTicks - a.durationTicks) || (a.staff - b.staff) || (a.midi - b.midi));
    }

    function quantizeMidiForPiano(parsed, options = {}) {
        const ppq = Math.max(1, Number(parsed.ppq) || 480);
        const primaryTimeSignature = getPrimaryTimeSignature(parsed);
        const ticksPerBeat = ppq * (4 / Math.max(1, primaryTimeSignature.denominator || 4));
        const quantUnitTicks = getQuantUnitTicks(ppq);
        const splitMidi = Number.isFinite(Number(options.splitMidi)) ? Number(options.splitMidi) : DEFAULT_SPLIT_MIDI;
        const measureTicks = Math.max(quantUnitTicks, Math.round(ticksPerBeat * Math.max(1, primaryTimeSignature.numerator || 4)));
        const noteIdPrefix = `midi_${Date.now().toString(36)}`;

        const quantizedRaw = (parsed.notes || [])
            .map((note, idx) => {
                const startTick = Math.max(0, quantizeToUnit(note.startTick, quantUnitTicks));
                const endTick = Math.max(startTick + quantUnitTicks, quantizeToUnit(note.endTick, quantUnitTicks));
                const durationTicks = Math.max(quantUnitTicks, endTick - startTick);
                const staff = note.midi < splitMidi ? 2 : 1;
                return {
                    id: `${noteIdPrefix}_${idx + 1}`,
                    trackIndex: note.trackIndex,
                    channel: note.channel,
                    midi: note.midi,
                    velocity: note.velocity,
                    startTick,
                    endTick,
                    durationTicks,
                    staff
                };
            })
            .filter(note => note.durationTicks > 0)
            .sort((a, b) => (a.startTick - b.startTick) || (b.durationTicks - a.durationTicks) || (a.staff - b.staff) || (a.midi - b.midi));

        const quantized = mergeSamePitchOverlaps(quantizedRaw, quantUnitTicks);

        return {
            ppq,
            splitMidi,
            primaryTimeSignature,
            primaryTempo: getPrimaryTempo(parsed),
            measureTicks,
            quantUnitTicks,
            notes: quantized,
            trackSummaries: buildTrackSummaries(parsed),
            mergedDuplicateCount: Math.max(0, quantizedRaw.length - quantized.length)
        };
    }

    function midiToPitch(midi) {
        const names = [
            ['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0],
            ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]
        ];
        const [step, alter] = names[((midi % 12) + 12) % 12];
        return {
            step,
            alter,
            octave: Math.floor(midi / 12) - 1
        };
    }

    const TYPE_BY_QUARTERS = new Map([
        [4, 'whole'],
        [2, 'half'],
        [1, 'quarter'],
        [0.5, 'eighth'],
        [0.25, '16th'],
        [0.125, '32nd']
    ]);

    function getApproximateType(quarterLength) {
        let bestType = '16th';
        let bestDistance = Infinity;
        TYPE_BY_QUARTERS.forEach((type, value) => {
            const distance = Math.abs(value - quarterLength);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestType = type;
            }
        });
        return bestType;
    }

    function escapeXml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    function chooseLaneForNote(lanes, note, overlapTolerance) {
        let bestLane = null;
        let bestGap = Infinity;
        lanes.forEach(lane => {
            if ((lane.lastEndTick - overlapTolerance) <= note.startTick) {
                const gap = Math.max(0, note.startTick - lane.lastEndTick);
                const sameTrackBonus = lane.trackIndex === note.trackIndex ? -0.25 : 0;
                const score = gap + sameTrackBonus;
                if (score < bestGap) {
                    bestGap = score;
                    bestLane = lane;
                }
            }
        });
        return bestLane;
    }

    function buildVoiceLanes(notes, quantUnitTicks) {
        const overlapTolerance = Math.max(1, Math.round(quantUnitTicks / 2));
        const lanes = [];
        (notes || []).forEach(note => {
            const targetLane = chooseLaneForNote(lanes, note, overlapTolerance);
            if (targetLane) {
                targetLane.notes.push(note);
                targetLane.lastEndTick = Math.max(targetLane.lastEndTick, note.endTick);
                if (note.trackIndex === targetLane.trackIndex) targetLane.sameTrackCount += 1;
                return;
            }
            lanes.push({
                trackIndex: note.trackIndex,
                notes: [note],
                lastEndTick: note.endTick,
                sameTrackCount: 1
            });
        });
        return lanes.map((lane, idx) => ({
            voiceKey: `lane_${idx + 1}`,
            notes: lane.notes.slice().sort((a, b) => (a.startTick - b.startTick) || (b.durationTicks - a.durationTicks) || (a.midi - b.midi))
        }));
    }

    function buildVoiceTimeline(notes) {
        const grouped = [];
        const sorted = (notes || []).slice().sort((a, b) => (a.startTick - b.startTick) || (b.durationTicks - a.durationTicks) || (a.midi - b.midi));
        sorted.forEach(note => {
            const previous = grouped[grouped.length - 1];
            if (previous && previous.startTick === note.startTick && previous.durationTicks === note.durationTicks) {
                previous.notes.push(note);
                return;
            }
            grouped.push({
                type: 'chord',
                startTick: note.startTick,
                durationTicks: note.durationTicks,
                notes: [note]
            });
        });

        const events = [];
        let cursorTick = 0;
        grouped.forEach(group => {
            if (group.startTick > cursorTick) {
                events.push({ type: 'rest', startTick: cursorTick, durationTicks: group.startTick - cursorTick });
            }
            events.push({
                type: 'chord',
                startTick: group.startTick,
                durationTicks: group.durationTicks,
                notes: group.notes.slice().sort((a, b) => a.midi - b.midi)
            });
            cursorTick = Math.max(cursorTick, group.startTick + group.durationTicks);
        });

        return events;
    }


    function buildSingleVoiceTimelineFromNotes(notes) {
        const sorted = (notes || []).slice().sort((a, b) => (a.startTick - b.startTick) || (b.durationTicks - a.durationTicks) || (a.midi - b.midi));
        const grouped = [];
        sorted.forEach(note => {
            const prev = grouped[grouped.length - 1];
            if (prev && prev.startTick === note.startTick) {
                prev.notes.push(note);
                prev.durationTicks = Math.max(prev.durationTicks, note.durationTicks);
                return;
            }
            grouped.push({
                type: 'chord',
                startTick: note.startTick,
                durationTicks: note.durationTicks,
                notes: [note]
            });
        });
        const events = [];
        let cursorTick = 0;
        grouped.forEach(group => {
            if (group.startTick > cursorTick) {
                events.push({ type: 'rest', startTick: cursorTick, durationTicks: group.startTick - cursorTick });
            }
            events.push({
                type: 'chord',
                startTick: group.startTick,
                durationTicks: group.durationTicks,
                notes: group.notes.slice().sort((a, b) => a.midi - b.midi)
            });
            cursorTick = Math.max(cursorTick, group.startTick + group.durationTicks);
        });
        return events;
    }

    function buildStaffVoices(notes, quantUnitTicks) {
        return buildVoiceLanes(notes, quantUnitTicks).map(lane => ({
            voiceKey: lane.voiceKey,
            notes: lane.notes,
            timeline: buildVoiceTimeline(lane.notes)
        }));
    }

    function splitEventAcrossMeasures(event, measureTicks) {
        const chunks = [];
        let remaining = event.durationTicks;
        let cursor = event.startTick;
        while (remaining > 0) {
            const measureIndex = Math.floor(cursor / measureTicks);
            const measureStartTick = measureIndex * measureTicks;
            const localOffset = cursor - measureStartTick;
            const available = measureTicks - localOffset;
            const chunkTicks = Math.min(remaining, available);
            chunks.push({
                type: event.type,
                measureIndex,
                localTick: localOffset,
                durationTicks: chunkTicks,
                notes: event.notes || []
            });
            cursor += chunkTicks;
            remaining -= chunkTicks;
        }
        return chunks;
    }

    function buildMeasureBuckets(timeline, measureTicks) {
        const buckets = new Map();
        (timeline || []).forEach(event => {
            splitEventAcrossMeasures(event, measureTicks).forEach(chunk => {
                const list = buckets.get(chunk.measureIndex) || [];
                list.push(chunk);
                buckets.set(chunk.measureIndex, list);
            });
        });
        buckets.forEach(list => list.sort((a, b) => a.localTick - b.localTick));
        return buckets;
    }

    function renderNoteLikeXml(event, staff, voice, divisions, ppq) {
        const quarterLength = event.durationTicks / ppq;
        const durationValue = Math.max(1, Math.round(quarterLength * divisions));
        const xml = [];

        if (event.type === 'rest') {
            xml.push('<note>');
            xml.push('<rest/>');
            xml.push(`<duration>${durationValue}</duration>`);
            xml.push(`<voice>${voice}</voice>`);
            xml.push(`<type>${getApproximateType(quarterLength)}</type>`);
            xml.push(`<staff>${staff}</staff>`);
            xml.push('</note>');
            return { xml: xml.join(''), durationValue };
        }

        event.notes.forEach((note, noteIndex) => {
            const pitch = midiToPitch(note.midi);
            xml.push('<note>');
            if (noteIndex > 0) xml.push('<chord/>');
            xml.push('<pitch>');
            xml.push(`<step>${pitch.step}</step>`);
            if (pitch.alter) xml.push(`<alter>${pitch.alter}</alter>`);
            xml.push(`<octave>${pitch.octave}</octave>`);
            xml.push('</pitch>');
            xml.push(`<duration>${durationValue}</duration>`);
            xml.push(`<voice>${voice}</voice>`);
            xml.push(`<type>${getApproximateType(quarterLength)}</type>`);
            xml.push(`<staff>${staff}</staff>`);
            xml.push('</note>');
        });

        return { xml: xml.join(''), durationValue };
    }

    function buildMusicXmlFromQuantized(quantized, options = {}) {
        const title = options.title || 'Imported MIDI';
        const noteMeta = [];
        const ppq = quantized.ppq;
        const divisions = DIVISIONS_PER_QUARTER;
        const timeSig = quantized.primaryTimeSignature;
        const measureTicks = quantized.measureTicks;
        const measureDurationDivisions = Math.max(1, Math.round((measureTicks / ppq) * divisions));

        const rightTimeline = buildSingleVoiceTimelineFromNotes(quantized.notes.filter(note => note.staff === 1));
        const leftTimeline = buildSingleVoiceTimelineFromNotes(quantized.notes.filter(note => note.staff === 2));
        const rightBuckets = [{
            voiceNumber: 1,
            voiceKey: 'staff_1',
            buckets: buildMeasureBuckets(rightTimeline, measureTicks)
        }];
        const leftBuckets = [{
            voiceNumber: 1,
            voiceKey: 'staff_2',
            buckets: buildMeasureBuckets(leftTimeline, measureTicks)
        }];
        const maxTick = quantized.notes.reduce((maxValue, note) => Math.max(maxValue, note.endTick), 0);
        const measureCount = Math.max(1, Math.ceil(maxTick / measureTicks));
        const bpm = Math.max(30, Math.min(300, Math.round(60000000 / Math.max(1, quantized.primaryTempo.mpqn || 500000))));
        const lines = [];

        lines.push('<?xml version="1.0" encoding="UTF-8" standalone="no"?>');
        lines.push('<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">');
        lines.push('<score-partwise version="3.1">');
        lines.push(`<work><work-title>${escapeXml(title)}</work-title></work>`);
        lines.push('<part-list>');
        lines.push('<score-part id="P1"><part-name>Piano</part-name></score-part>');
        lines.push('</part-list>');
        lines.push('<part id="P1">');

        for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
            lines.push(`<measure number="${measureIndex + 1}">`);
            if (measureIndex === 0) {
                lines.push('<attributes>');
                lines.push(`<divisions>${divisions}</divisions>`);
                lines.push('<key><fifths>0</fifths></key>');
                lines.push(`<time><beats>${Math.max(1, timeSig.numerator || 4)}</beats><beat-type>${Math.max(1, timeSig.denominator || 4)}</beat-type></time>`);
                lines.push('<staves>2</staves>');
                lines.push('<clef number="1"><sign>G</sign><line>2</line></clef>');
                lines.push('<clef number="2"><sign>F</sign><line>4</line></clef>');
                lines.push('</attributes>');
                lines.push(`<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>`);
            }

            const renderVoiceMeasure = (events, staffNumber, voiceNumber) => {
                const sortedEvents = (events || []).slice().sort((a, b) => a.localTick - b.localTick);
                let localCursor = 0;
                const staffXml = [];

                if (!sortedEvents.length) {
                    const emptyEvent = { type: 'rest', startTick: measureIndex * measureTicks, durationTicks: measureTicks };
                    staffXml.push(renderNoteLikeXml(emptyEvent, staffNumber, voiceNumber, divisions, ppq).xml);
                    return staffXml.join('');
                }

                sortedEvents.forEach(event => {
                    if (event.localTick > localCursor) {
                        staffXml.push(renderNoteLikeXml({
                            type: 'rest',
                            startTick: 0,
                            durationTicks: event.localTick - localCursor
                        }, staffNumber, voiceNumber, divisions, ppq).xml);
                    }
                    staffXml.push(renderNoteLikeXml({
                        type: event.type,
                        startTick: event.localTick,
                        durationTicks: event.durationTicks,
                        notes: event.notes || []
                    }, staffNumber, voiceNumber, divisions, ppq).xml);
                    if (event.type === 'chord') {
                        (event.notes || []).forEach(note => {
                            noteMeta.push({
                                sourceId: note.id,
                                midi: note.midi,
                                trackIndex: note.trackIndex,
                                channel: note.channel,
                                staff: staffNumber,
                                measure: measureIndex + 1,
                                voice: voiceNumber,
                                startTick: note.startTick,
                                durationTicks: note.durationTicks
                            });
                        });
                    }
                    localCursor = event.localTick + event.durationTicks;
                });

                if (localCursor < measureTicks) {
                    staffXml.push(renderNoteLikeXml({
                        type: 'rest',
                        startTick: localCursor,
                        durationTicks: measureTicks - localCursor
                    }, staffNumber, voiceNumber, divisions, ppq).xml);
                }
                return staffXml.join('');
            };

            const renderMeasureForStaff = (voiceBuckets, staffNumber) => {
                const voices = (voiceBuckets || []).length ? voiceBuckets : [{ voiceNumber: 1, buckets: new Map() }];
                const xml = [];
                voices.forEach((voice, voiceIdx) => {
                    if (voiceIdx > 0) {
                        xml.push(`<backup><duration>${measureDurationDivisions}</duration></backup>`);
                    }
                    xml.push(renderVoiceMeasure((voice.buckets.get(measureIndex) || []), staffNumber, voice.voiceNumber));
                });
                return xml.join('');
            };

            lines.push(renderMeasureForStaff(rightBuckets, 1));
            lines.push(`<backup><duration>${measureDurationDivisions}</duration></backup>`);
            lines.push(renderMeasureForStaff(leftBuckets, 2));
            lines.push('</measure>');
        }

        lines.push('</part>');
        lines.push('</score-partwise>');

        return {
            musicXml: lines.join(''),
            noteMeta,
            bpm,
            measureCount
        };
    }

    async function convertMidiFileToScore(file, options = {}) {
        const rawArrayBuffer = await readArrayBuffer(file);
        const parsed = parseMidiArrayBuffer(rawArrayBuffer);
        if (!parsed.notes.length) {
            throw new Error('This MIDI file does not contain any note events.');
        }
        const quantized = quantizeMidiForPiano(parsed, options);
        const title = getMidiImportBaseTitle(file?.name || 'Imported MIDI');
        const built = buildMusicXmlFromQuantized(quantized, { title });
        return {
            rawData: built.musicXml,
            fileName: `${title}.musicxml`,
            fileType: 'musicxml',
            title,
            sourceType: 'midi',
            sourceFileName: file?.name || `${title}.mid`,
            importMeta: {
                kind: 'midi-import-v6-time-sliced',
                warning: 'Experimental MIDI import',
                splitMidi: quantized.splitMidi,
                quantization: '1/24-quarter',
                trackSummaries: quantized.trackSummaries,
                measureCount: built.measureCount,
                estimatedBpm: built.bpm,
                sourceFormat: parsed.format,
                ppq: parsed.ppq,
                noteCount: parsed.notes.length,
                preservesOverlapLanes: false,
                singleVoicePerStaffLayout: true,
                tripletFriendlyDivisions: DIVISIONS_PER_QUARTER,
                mergedDuplicateCount: quantized.mergedDuplicateCount || 0
            }
        };
    }

    async function convertAndLoadMidiFile(file) {
        const converted = await convertMidiFileToScore(file);
        await loadScoreIntoApp(converted.rawData, converted);
        return converted;
    }

    window.MidiImport = {
        MIDI_IMPORT_FOLDER_NAME,
        DEFAULT_SPLIT_MIDI,
        isMidiFileName,
        getMidiImportBaseTitle,
        showExperimentalMidiWarning,
        ensureMidiImportsFolder,
        parseMidiArrayBuffer,
        convertMidiFileToScore,
        convertAndLoadMidiFile
    };
})();
