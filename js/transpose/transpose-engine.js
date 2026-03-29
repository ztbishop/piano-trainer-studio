// transpose-engine.js
// Score transposition helpers for pre-render MusicXML transforms.
// This module rewrites MusicXML pitch/key data before OSMD loads the score.
// It intentionally does not touch timing, layout, ties, slurs, or beams.
(function() {
    const NOTE_NAMES_SHARP = [
        { step: 'C', alter: 0 },
        { step: 'C', alter: 1 },
        { step: 'D', alter: 0 },
        { step: 'D', alter: 1 },
        { step: 'E', alter: 0 },
        { step: 'F', alter: 0 },
        { step: 'F', alter: 1 },
        { step: 'G', alter: 0 },
        { step: 'G', alter: 1 },
        { step: 'A', alter: 0 },
        { step: 'A', alter: 1 },
        { step: 'B', alter: 0 }
    ];

    const NOTE_NAMES_FLAT = [
        { step: 'C', alter: 0 },
        { step: 'D', alter: -1 },
        { step: 'D', alter: 0 },
        { step: 'E', alter: -1 },
        { step: 'E', alter: 0 },
        { step: 'F', alter: 0 },
        { step: 'G', alter: -1 },
        { step: 'G', alter: 0 },
        { step: 'A', alter: -1 },
        { step: 'A', alter: 0 },
        { step: 'B', alter: -1 },
        { step: 'B', alter: 0 }
    ];

    const STEP_TO_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const MAJOR_KEY_BY_FIFTHS = {
        '-7': { tonic: 11, label: 'Cb major', bias: 'flat' },
        '-6': { tonic: 6, label: 'Gb major', bias: 'flat' },
        '-5': { tonic: 1, label: 'Db major', bias: 'flat' },
        '-4': { tonic: 8, label: 'Ab major', bias: 'flat' },
        '-3': { tonic: 3, label: 'Eb major', bias: 'flat' },
        '-2': { tonic: 10, label: 'Bb major', bias: 'flat' },
        '-1': { tonic: 5, label: 'F major', bias: 'flat' },
        '0': { tonic: 0, label: 'C major', bias: 'sharp' },
        '1': { tonic: 7, label: 'G major', bias: 'sharp' },
        '2': { tonic: 2, label: 'D major', bias: 'sharp' },
        '3': { tonic: 9, label: 'A major', bias: 'sharp' },
        '4': { tonic: 4, label: 'E major', bias: 'sharp' },
        '5': { tonic: 11, label: 'B major', bias: 'sharp' },
        '6': { tonic: 6, label: 'F# major', bias: 'sharp' },
        '7': { tonic: 1, label: 'C# major', bias: 'sharp' }
    };
    const MINOR_KEY_BY_FIFTHS = {
        '-7': { tonic: 8, label: 'Ab minor', bias: 'flat' },
        '-6': { tonic: 3, label: 'Eb minor', bias: 'flat' },
        '-5': { tonic: 10, label: 'Bb minor', bias: 'flat' },
        '-4': { tonic: 5, label: 'F minor', bias: 'flat' },
        '-3': { tonic: 0, label: 'C minor', bias: 'flat' },
        '-2': { tonic: 7, label: 'G minor', bias: 'flat' },
        '-1': { tonic: 2, label: 'D minor', bias: 'flat' },
        '0': { tonic: 9, label: 'A minor', bias: 'sharp' },
        '1': { tonic: 4, label: 'E minor', bias: 'sharp' },
        '2': { tonic: 11, label: 'B minor', bias: 'sharp' },
        '3': { tonic: 6, label: 'F# minor', bias: 'sharp' },
        '4': { tonic: 1, label: 'C# minor', bias: 'sharp' },
        '5': { tonic: 8, label: 'G# minor', bias: 'sharp' },
        '6': { tonic: 3, label: 'D# minor', bias: 'sharp' },
        '7': { tonic: 10, label: 'A# minor', bias: 'sharp' }
    };

    const SIGNATURE_PRESETS = [
        { value: 'sig--7', label: 'Cb major / Ab minor', tonic: 11, fifths: -7, bias: 'flat' },
        { value: 'sig--6', label: 'Gb major / Eb minor', tonic: 6, fifths: -6, bias: 'flat' },
        { value: 'sig--5', label: 'Db major / Bb minor', tonic: 1, fifths: -5, bias: 'flat' },
        { value: 'sig--4', label: 'Ab major / F minor', tonic: 8, fifths: -4, bias: 'flat' },
        { value: 'sig--3', label: 'Eb major / C minor', tonic: 3, fifths: -3, bias: 'flat' },
        { value: 'sig--2', label: 'Bb major / G minor', tonic: 10, fifths: -2, bias: 'flat' },
        { value: 'sig--1', label: 'F major / D minor', tonic: 5, fifths: -1, bias: 'flat' },
        { value: 'sig-0', label: 'C major / A minor', tonic: 0, fifths: 0, bias: 'sharp' },
        { value: 'sig-1', label: 'G major / E minor', tonic: 7, fifths: 1, bias: 'sharp' },
        { value: 'sig-2', label: 'D major / B minor', tonic: 2, fifths: 2, bias: 'sharp' },
        { value: 'sig-3', label: 'A major / F# minor', tonic: 9, fifths: 3, bias: 'sharp' },
        { value: 'sig-4', label: 'E major / C# minor', tonic: 4, fifths: 4, bias: 'sharp' },
        { value: 'sig-5', label: 'B major / G# minor', tonic: 11, fifths: 5, bias: 'sharp' },
        { value: 'sig-6', label: 'F# major / D# minor', tonic: 6, fifths: 6, bias: 'sharp' },
        { value: 'sig-7', label: 'C# major / A# minor', tonic: 1, fifths: 7, bias: 'sharp' }
    ];

    const KEY_PRESET_BY_VALUE = new Map(SIGNATURE_PRESETS.map(entry => [entry.value, entry]));

    function mod(n, m) {
        return ((n % m) + m) % m;
    }

    function isXmlString(rawData) {
        return typeof rawData === 'string' && /<score-partwise\b|<score-timewise\b/i.test(rawData);
    }

    function parseXml(xmlString) {
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlString, 'application/xml');
        const errorNode = xml.querySelector('parsererror');
        if (errorNode) {
            throw new Error('Could not parse MusicXML for transposition.');
        }
        return xml;
    }

    function serializeXml(xmlDoc) {
        return new XMLSerializer().serializeToString(xmlDoc);
    }

    function getFirstText(parent, selector) {
        const node = parent ? parent.querySelector(selector) : null;
        return node ? String(node.textContent || '').trim() : '';
    }

    function ensureChild(parent, name) {
        let child = Array.from(parent.children || []).find(node => node.tagName === name);
        if (!child) {
            child = parent.ownerDocument.createElement(name);
            parent.appendChild(child);
        }
        return child;
    }

    function setOrRemoveChildText(parent, name, value) {
        const existing = Array.from(parent.children || []).find(node => node.tagName === name);
        const numeric = Number(value || 0);
        if (!Number.isFinite(numeric) || numeric === 0) {
            if (existing) existing.remove();
            return null;
        }
        const child = existing || parent.ownerDocument.createElement(name);
        child.textContent = String(numeric);
        if (!existing) parent.appendChild(child);
        return child;
    }

    function pitchSemitone(step, alter) {
        return mod((STEP_TO_SEMITONE[String(step || '').toUpperCase()] ?? 0) + Number(alter || 0), 12);
    }

    function tonicFromKeySignature(fifths, mode) {
        const lookup = String(mode || 'major').toLowerCase() === 'minor' ? MINOR_KEY_BY_FIFTHS : MAJOR_KEY_BY_FIFTHS;
        return lookup[String(fifths)] || null;
    }

    function getGroupedLabelForFifths(fifths) {
        const majorInfo = MAJOR_KEY_BY_FIFTHS[String(fifths)] || null;
        const minorInfo = MINOR_KEY_BY_FIFTHS[String(fifths)] || null;
        if (majorInfo && minorInfo) return `${majorInfo.label} / ${minorInfo.label}`;
        return majorInfo?.label || minorInfo?.label || 'Unknown';
    }

    function detectScoreKey(xmlDoc) {
        const keyNode = xmlDoc.querySelector('part > measure attributes key, measure attributes key, attributes key');
        if (!keyNode) {
            return {
                found: false,
                label: 'Unknown',
                mode: 'major',
                tonic: null,
                fifths: null,
                bias: 'sharp'
            };
        }
        const fifths = Number.parseInt(getFirstText(keyNode, 'fifths'), 10);
        const mode = (getFirstText(keyNode, 'mode') || 'major').toLowerCase() === 'minor' ? 'minor' : 'major';
        const majorInfo = MAJOR_KEY_BY_FIFTHS[String(fifths)] || null;
        const presetValue = Number.isFinite(fifths) ? `sig-${fifths}` : null;
        const inferredPreset = presetValue ? KEY_PRESET_BY_VALUE.get(presetValue) || null : null;
        return {
            found: Number.isFinite(fifths) && !!majorInfo,
            label: getGroupedLabelForFifths(fifths),
            mode,
            tonic: majorInfo?.tonic ?? null,
            fifths: Number.isFinite(fifths) ? fifths : null,
            presetValue,
            bias: majorInfo?.bias || (Number(fifths) < 0 ? 'flat' : 'sharp'),
            inferredPreset
        };
    }

    function getKeyPresets() {
        return SIGNATURE_PRESETS.map(entry => ({ ...entry }));
    }

    function getPresetByValue(value) {
        return KEY_PRESET_BY_VALUE.get(String(value || '').trim()) || null;
    }

    function chooseSpellingForPitchClass(pitchClass, bias = 'sharp') {
        const table = bias === 'flat' ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
        return table[mod(pitchClass, 12)];
    }

    function chooseKeySignatureForTonic(tonic, mode, preferredBias = 'sharp') {
        const lookup = String(mode || 'major').toLowerCase() === 'minor' ? MINOR_KEY_BY_FIFTHS : MAJOR_KEY_BY_FIFTHS;
        const matches = Object.entries(lookup)
            .filter(([, info]) => info.tonic === mod(tonic, 12))
            .map(([fifths, info]) => ({ fifths: Number(fifths), ...info }));

        if (!matches.length) return null;
        const exactBias = matches.find(entry => entry.bias === preferredBias);
        if (exactBias) return exactBias;
        return matches.slice().sort((a, b) => Math.abs(a.fifths) - Math.abs(b.fifths))[0];
    }

    function rewritePitchNode(pitchNode, semitoneDelta, keyBias) {
        if (!pitchNode) return;
        const stepNode = pitchNode.querySelector('step');
        const octaveNode = pitchNode.querySelector('octave');
        if (!stepNode || !octaveNode) return;

        const step = String(stepNode.textContent || '').trim().toUpperCase();
        const alterNode = pitchNode.querySelector('alter');
        const alter = alterNode ? Number.parseInt(alterNode.textContent || '0', 10) : 0;
        const octave = Number.parseInt(octaveNode.textContent || '0', 10);
        if (!Number.isFinite(octave) || !(step in STEP_TO_SEMITONE)) return;

        const absoluteSemitone = (octave * 12) + pitchSemitone(step, alter) + Number(semitoneDelta || 0);
        const nextPitchClass = mod(absoluteSemitone, 12);
        const nextOctave = Math.floor(absoluteSemitone / 12);
        const spelling = chooseSpellingForPitchClass(nextPitchClass, keyBias);

        stepNode.textContent = spelling.step;
        setOrRemoveChildText(pitchNode, 'alter', spelling.alter);
        octaveNode.textContent = String(nextOctave);
    }

    function rewriteHarmonyNode(harmonyNode, semitoneDelta, keyBias) {
        if (!harmonyNode) return;
        const root = harmonyNode.querySelector('root');
        const bass = harmonyNode.querySelector('bass');
        [root, bass].forEach(section => {
            if (!section) return;
            const stepNode = section.querySelector('root-step, bass-step');
            const alterNode = section.querySelector('root-alter, bass-alter');
            if (!stepNode) return;
            const step = String(stepNode.textContent || '').trim().toUpperCase();
            const alter = alterNode ? Number.parseInt(alterNode.textContent || '0', 10) : 0;
            if (!(step in STEP_TO_SEMITONE)) return;
            const pitchClass = pitchSemitone(step, alter) + Number(semitoneDelta || 0);
            const spelling = chooseSpellingForPitchClass(pitchClass, keyBias);
            stepNode.textContent = spelling.step;
            const alterTag = /root/i.test(stepNode.tagName) ? 'root-alter' : 'bass-alter';
            setOrRemoveChildText(section, alterTag, spelling.alter);
        });
    }

    function rewriteKeyNode(keyNode, semitoneDelta, options) {
        if (!keyNode) return { bias: options.defaultBias || 'sharp', mode: 'major', fifths: 0 };
        const fifthsNode = keyNode.querySelector('fifths');
        const modeNode = keyNode.querySelector('mode');
        const fifths = Number.parseInt(fifthsNode?.textContent || '0', 10);
        const currentMode = (modeNode?.textContent || options.targetMode || 'major').toLowerCase() === 'minor' ? 'minor' : 'major';
        const tonicInfo = tonicFromKeySignature(fifths, currentMode);
        const preferredBias = options.targetBias || tonicInfo?.bias || options.defaultBias || (fifths < 0 ? 'flat' : 'sharp');
        const transposed = chooseKeySignatureForTonic((tonicInfo?.tonic ?? 0) + Number(semitoneDelta || 0), currentMode, preferredBias);
        if (transposed && fifthsNode) fifthsNode.textContent = String(transposed.fifths);
        if (modeNode) modeNode.textContent = currentMode;
        return {
            bias: transposed?.bias || preferredBias,
            mode: currentMode,
            fifths: transposed?.fifths ?? fifths
        };
    }

    function transposeXml(xmlString, options = {}) {
        if (!isXmlString(xmlString)) {
            throw new Error('This score is not available as raw MusicXML text, so transpose is disabled for it right now.');
        }

        const xmlDoc = parseXml(xmlString);
        const detectedKey = detectScoreKey(xmlDoc);
        const mode = String(options.mode || 'semitone').toLowerCase();
        let semitoneDelta = Number.parseInt(options.semitones || '0', 10);
        let targetPreset = null;

        if (mode === 'key') {
            targetPreset = getPresetByValue(options.targetKey);
            if (!targetPreset) {
                throw new Error('Choose a target key before applying transpose.');
            }
            if (!detectedKey.found || detectedKey.tonic == null) {
                throw new Error('This score does not expose a readable key signature. Use semitones for this score.');
            }
            semitoneDelta = mod(targetPreset.tonic - detectedKey.tonic, 12);
            if (semitoneDelta > 6) semitoneDelta -= 12;
        }

        if (!Number.isFinite(semitoneDelta)) semitoneDelta = 0;
        if (mode === 'key' && targetPreset && detectedKey.found && detectedKey.presetValue === targetPreset.value) {
            return {
                xmlString,
                semitoneDelta: 0,
                sourceKey: detectedKey,
                targetKeyLabel: targetPreset.label,
                targetPreset
            };
        }
        if (semitoneDelta === 0 && mode === 'semitone' && !options.forceKeySignatureUpdate) {
            return {
                xmlString,
                semitoneDelta,
                sourceKey: detectedKey,
                targetKeyLabel: detectedKey.label,
                targetPreset: null
            };
        }

        const updateKeySignature = options.updateKeySignature !== false;
        const defaultBias = targetPreset?.bias || detectedKey.bias || 'sharp';
        const parts = Array.from(xmlDoc.querySelectorAll('part'));

        parts.forEach(partNode => {
            let currentBias = defaultBias;
            Array.from(partNode.children || []).filter(node => node.tagName === 'measure').forEach(measureNode => {
                Array.from(measureNode.children || []).forEach(child => {
                    if (child.tagName === 'attributes') {
                        const keyNode = child.querySelector('key');
                        if (keyNode) {
                            if (updateKeySignature) {
                                const rewritten = rewriteKeyNode(keyNode, semitoneDelta, {
                                    targetBias: targetPreset?.bias || null,
                                    targetMode: detectedKey.mode,
                                    defaultBias
                                });
                                currentBias = rewritten.bias || currentBias;
                            } else {
                                const currentFifths = Number.parseInt(getFirstText(keyNode, 'fifths') || '0', 10);
                                currentBias = currentFifths < 0 ? 'flat' : 'sharp';
                            }
                        }
                    }

                    if (child.tagName === 'note') {
                        const pitchNode = Array.from(child.children || []).find(node => node.tagName === 'pitch');
                        if (pitchNode) rewritePitchNode(pitchNode, semitoneDelta, currentBias);
                    }

                    if (child.tagName === 'harmony') {
                        rewriteHarmonyNode(child, semitoneDelta, currentBias);
                    }
                });
            });
        });

        const targetKeyInfo = targetPreset
            ? { label: targetPreset.label, fifths: targetPreset.fifths, bias: targetPreset.bias, tonic: targetPreset.tonic }
            : detectScoreKey(xmlDoc);

        return {
            xmlString: serializeXml(xmlDoc),
            semitoneDelta,
            sourceKey: detectedKey,
            targetKeyLabel: targetKeyInfo.label,
            targetPreset: targetPreset || null
        };
    }

    window.TransposeEngine = {
        isXmlString,
        parseXml,
        serializeXml,
        detectScoreKey,
        getKeyPresets,
        getPresetByValue,
        transposeXml
    };
})();


