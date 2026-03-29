// midi-import.js
// Conversion wrapper for browser-side score imports using webmscore.
// Keeps conversion isolated so the main trainer remains MusicXML-first.

(function () {
    const WEBSMCORE_SCRIPT_URL = 'assets/vendor/webmscore/webmscore.js';
    const CONVERTER_IMPORT_FORMATS = Object.freeze({
        '.mid': 'midi',
        '.midi': 'midi',
        '.mscz': 'mscz',
        '.mscx': 'mscx',
        '.gp': 'gp',
        '.gp3': 'gp3',
        '.gp4': 'gp4',
        '.gp5': 'gp5',
        '.gpx': 'gpx',
        '.gtp': 'gtp',
        '.ptb': 'ptb',
        '.mxl': 'mxl'
    });

    let webMscoreScriptPromise = null;
    let webMscoreReadyPromise = null;

    function getFileExtension(fileName = '') {
        const match = String(fileName || '').trim().toLowerCase().match(/(\.[^.]+)$/);
        return match ? match[1] : '';
    }

    function getBaseTitle(fileName = '') {
        const base = String(fileName || '').trim();
        if (!base) return 'Imported Score';
        return base.replace(/\.[^.]+$/i, '').trim() || 'Imported Score';
    }

    function getWebMscoreFormat(fileName = '') {
        return CONVERTER_IMPORT_FORMATS[getFileExtension(fileName)] || null;
    }

    function isConverterImportFileName(fileName = '') {
        return !!getWebMscoreFormat(fileName);
    }

    function readArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error || new Error('Could not read that file.'));
            reader.onload = () => resolve(reader.result);
            reader.readAsArrayBuffer(file);
        });
    }

    function uint8ArrayToString(data) {
        if (typeof data === 'string') return data;
        if (data instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(data));
        if (ArrayBuffer.isView(data)) return new TextDecoder('utf-8').decode(data);
        if (data && data.buffer instanceof ArrayBuffer) {
            return new TextDecoder('utf-8').decode(new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || data.buffer.byteLength));
        }
        throw new Error('Converted score was not returned as text.');
    }

    function getMusicXmlExportMethod(score) {
        if (!score) return null;
        if (typeof score.saveXml === 'function') return 'saveXml';
        if (typeof score.saveMusicXml === 'function') return 'saveMusicXml';
        if (typeof score.saveMxml === 'function') return 'saveMxml';
        if (typeof score.saveMusicXML === 'function') return 'saveMusicXML';
        return null;
    }

    async function exportMusicXmlText(score) {
        const methodName = getMusicXmlExportMethod(score);
        if (!methodName) {
            throw new Error('webmscore loaded, but this build does not expose a MusicXML export function.');
        }
        const exported = await score[methodName]();
        return uint8ArrayToString(exported);
    }

    async function ensureWebMscoreLoaded() {
        if (window.WebMscore && window.WebMscore.ready) {
            await window.WebMscore.ready;
            return window.WebMscore;
        }

        if (!webMscoreScriptPromise) {
            webMscoreScriptPromise = new Promise((resolve, reject) => {
                const existing = document.querySelector('script[data-webmscore-loader="true"]');
                if (existing) {
                    resolve();
                    return;
                }

                const script = document.createElement('script');
                script.src = WEBSMCORE_SCRIPT_URL;
                script.async = true;
                script.dataset.webmscoreLoader = 'true';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(
                    'Could not load the local webmscore converter files. ' +
                    'Download them into assets/vendor/webmscore first.'
                ));
                document.head.appendChild(script);
            });
        }

        await webMscoreScriptPromise;

        if (!window.WebMscore || !window.WebMscore.ready) {
            throw new Error('webmscore did not initialize correctly.');
        }

        if (!webMscoreReadyPromise) {
            webMscoreReadyPromise = window.WebMscore.ready;
        }

        await webMscoreReadyPromise;
        return window.WebMscore;
    }

    async function convertFileToScore(file) {
        if (!file) throw new Error('No file selected.');

        const format = getWebMscoreFormat(file.name || '');
        if (!format) {
            throw new Error('That file type is not supported for conversion.');
        }

        const WebMscore = await ensureWebMscoreLoaded();
        const bytes = new Uint8Array(await readArrayBuffer(file));
        let score = null;

        try {
            score = await WebMscore.load(format, bytes);
            const rawData = await exportMusicXmlText(score);
            return {
                rawData,
                fileName: `${getBaseTitle(file.name || '')}.musicxml`,
                fileType: 'musicxml',
                title: getBaseTitle(file.name || '')
            };
        } catch (err) {
            console.error('Converted score import failed', err);
            throw new Error(
                `Could not convert "${file.name || 'that file'}". ` +
                'Some MIDI, MuseScore, or Guitar Pro files may need cleanup in MuseScore before importing.'
            );
        } finally {
            if (score && typeof score.destroy === 'function') {
                try { score.destroy(); } catch (_) {}
            }
        }
    }



    async function normalizeScoreToMusicXml(rawData, { fileName = 'Untitled Score', fileType = '' } = {}) {
        const resolvedType = String(fileType || getFileExtension(fileName || '') || '').toLowerCase().replace(/^\./, '');
        if (resolvedType === 'xml' || resolvedType === 'musicxml') {
            return uint8ArrayToString(rawData);
        }

        if (resolvedType !== 'mxl') {
            throw new Error('Only MusicXML text and compressed MXL are supported for transpose normalization.');
        }

        const WebMscore = await ensureWebMscoreLoaded();
        const bytes = rawData instanceof Uint8Array
            ? rawData
            : rawData instanceof ArrayBuffer
                ? new Uint8Array(rawData)
                : rawData instanceof Blob
                    ? new Uint8Array(await rawData.arrayBuffer())
                    : rawData && rawData.buffer instanceof ArrayBuffer
                        ? new Uint8Array(rawData.buffer, rawData.byteOffset || 0, rawData.byteLength || rawData.buffer.byteLength)
                        : null;

        if (!bytes) {
            throw new Error('Could not normalize this score for transpose.');
        }

        let score = null;
        try {
            score = await WebMscore.load('mxl', bytes);
            return await exportMusicXmlText(score);
        } finally {
            if (score && typeof score.destroy === 'function') {
                try { score.destroy(); } catch (_) {}
            }
        }
    }

    async function convertAndLoadScoreFile(file) {
        const converted = await convertFileToScore(file);
        if (typeof window.loadScoreIntoApp !== 'function') {
            throw new Error('loadScoreIntoApp() is not available.');
        }
        await window.loadScoreIntoApp(converted.rawData, converted);
        return converted;
    }

    window.MidiImport = {
        getWebMscoreFormat,
        isConverterImportFileName,
        ensureWebMscoreLoaded,
        convertFileToScore,
        convertAndLoadScoreFile,
        convertAndLoadMidiFile: convertAndLoadScoreFile,
        normalizeScoreToMusicXml,
        supportedExtensions: Object.freeze(Object.keys(CONVERTER_IMPORT_FORMATS))
    };
})();


