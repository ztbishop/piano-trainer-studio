// score-library.js
// Handles loading and managing score files and score-library metadata.
// Does not own rendering layout, trainer playback timing, or feedback note placement.

// ⚠️ WARNING:
// Treat score parsing and score-library persistence as separate from OSMD rendering internals.
// Keep IndexedDB/library changes behavior-preserving unless intentionally changing library UX.

const SCORE_LIBRARY_DB_NAME = 'pianoTrainerLibrary';
const SCORE_LIBRARY_DB_VERSION = 1;
const SCORE_LIBRARY_FOLDER_STORE = 'folders';
const SCORE_LIBRARY_SCORE_STORE = 'scores';
const STARTER_LIBRARY_ASSET_PATH = new URL('assets/Starter_Scores.json', document.baseURI).toString();
const STARTER_LIBRARY_IMPORT_STORAGE_KEY = 'pt_starterLibraryImported_v1';


// ===== Score library + drawer workflow =====

function makeLibraryId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `ptlib-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function arrayBufferToByteArray(buffer) {
    return Array.from(new Uint8Array(buffer));
}

function byteArrayToArrayBuffer(bytes) {
    return new Uint8Array(Array.isArray(bytes) ? bytes : []).buffer;
}

function serializeScoreRawData(rawData) {
    if (rawData instanceof ArrayBuffer) {
        return { kind: 'arraybuffer', bytes: arrayBufferToByteArray(rawData) };
    }
    return { kind: 'text', text: String(rawData ?? '') };
}

function deserializeScoreRawData(payload) {
    if (!payload || typeof payload !== 'object') return '';
    if (payload.kind === 'arraybuffer') return byteArrayToArrayBuffer(payload.bytes);
    return String(payload.text ?? '');
}

const ScoreLibrary = {
    dbPromise: null,

    async init() {
        if (!('indexedDB' in window)) {
            throw new Error('IndexedDB is not available in this browser.');
        }

        if (!this.dbPromise) {
            this.dbPromise = new Promise((resolve, reject) => {
                const request = window.indexedDB.open(SCORE_LIBRARY_DB_NAME, SCORE_LIBRARY_DB_VERSION);
                request.onerror = () => reject(request.error || new Error('Could not open the score library database.'));
                request.onupgradeneeded = () => {
                    const db = request.result;

                    if (!db.objectStoreNames.contains(SCORE_LIBRARY_FOLDER_STORE)) {
                        const folderStore = db.createObjectStore(SCORE_LIBRARY_FOLDER_STORE, { keyPath: 'id' });
                        folderStore.createIndex('by_name', 'name', { unique: false });
                    }

                    if (!db.objectStoreNames.contains(SCORE_LIBRARY_SCORE_STORE)) {
                        const scoreStore = db.createObjectStore(SCORE_LIBRARY_SCORE_STORE, { keyPath: 'id' });
                        scoreStore.createIndex('by_folderId', 'folderId', { unique: false });
                        scoreStore.createIndex('by_lastOpenedAt', 'lastOpenedAt', { unique: false });
                        scoreStore.createIndex('by_title', 'title', { unique: false });
                    }
                };
                request.onsuccess = () => resolve(request.result);
            });
        }

        return this.dbPromise;
    },

    async transaction(storeNames, mode, executor) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(storeNames, mode);
            const stores = Object.fromEntries(storeNames.map(name => [name, tx.objectStore(name)]));
            let result;

            tx.oncomplete = () => resolve(result);
            tx.onerror = () => reject(tx.error || new Error('Library transaction failed.'));
            tx.onabort = () => reject(tx.error || new Error('Library transaction was aborted.'));

            try {
                result = executor(stores, tx);
            } catch (err) {
                reject(err);
                try { tx.abort(); } catch (e) {}
            }
        });
    },

    requestToPromise(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error('Library request failed.'));
        });
    },

    async getAllFolders() {
        return this.transaction([SCORE_LIBRARY_FOLDER_STORE], 'readonly', ({ [SCORE_LIBRARY_FOLDER_STORE]: store }) =>
            this.requestToPromise(store.getAll())
        ).then(items => (items || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
    },

    async getAllScores() {
        return this.transaction([SCORE_LIBRARY_SCORE_STORE], 'readonly', ({ [SCORE_LIBRARY_SCORE_STORE]: store }) =>
            this.requestToPromise(store.getAll())
        ).then(items => (items || []).sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''))));
    },

    async getRecentScores(limit = 8) {
        const scores = await this.getAllScores();
        return scores
            .filter(score => !!score.lastOpenedAt)
            .sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0))
            .slice(0, limit);
    },

    async createFolder(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) throw new Error('Folder name is required.');

        const folder = {
            id: makeLibraryId(),
            name: trimmed,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        await this.transaction([SCORE_LIBRARY_FOLDER_STORE], 'readwrite', ({ [SCORE_LIBRARY_FOLDER_STORE]: store }) => {
            store.put(folder);
        });

        return folder;
    },


    async renameFolder(folderId, nextName) {
        const trimmed = String(nextName || '').trim();
        if (!folderId) throw new Error('Folder not found.');
        if (!trimmed) throw new Error('Folder name is required.');

        const folder = await this.transaction([SCORE_LIBRARY_FOLDER_STORE], 'readonly', ({ [SCORE_LIBRARY_FOLDER_STORE]: store }) =>
            this.requestToPromise(store.get(folderId))
        );
        if (!folder) throw new Error('Folder not found.');

        folder.name = trimmed;
        folder.updatedAt = Date.now();

        await this.transaction([SCORE_LIBRARY_FOLDER_STORE], 'readwrite', ({ [SCORE_LIBRARY_FOLDER_STORE]: store }) => {
            store.put(folder);
        });

        return folder;
    },

    async deleteFolder(folderId) {
        if (!folderId) throw new Error('Folder not found.');
        const scores = await this.getAllScores();
        const inFolder = scores.filter(score => score.folderId === folderId);
        if (inFolder.length > 0) throw new Error('Folder must be empty before deleting.');

        await this.transaction([SCORE_LIBRARY_FOLDER_STORE], 'readwrite', ({ [SCORE_LIBRARY_FOLDER_STORE]: store }) => {
            store.delete(folderId);
        });

        return true;
    },

    async deleteFolderAndScores(folderId) {
        const ids = Array.from(new Set([folderId].filter(Boolean)));
        if (!ids.length) throw new Error('Folder not found.');
        await this.deleteFoldersAndScores(ids);
        return true;
    },

    async deleteFoldersAndScores(folderIds) {
        const ids = Array.from(new Set((folderIds || []).filter(Boolean)));
        if (!ids.length) return 0;

        await this.transaction([SCORE_LIBRARY_FOLDER_STORE, SCORE_LIBRARY_SCORE_STORE], 'readwrite', ({ [SCORE_LIBRARY_FOLDER_STORE]: folderStore, [SCORE_LIBRARY_SCORE_STORE]: scoreStore }) => {
            const getAllScoresRequest = scoreStore.getAll();
            getAllScoresRequest.onsuccess = () => {
                const allScores = Array.isArray(getAllScoresRequest.result) ? getAllScoresRequest.result : [];
                allScores.forEach((score) => {
                    if (ids.includes(score.folderId)) {
                        scoreStore.delete(score.id);
                    }
                });
                ids.forEach((folderId) => folderStore.delete(folderId));
            };
        });

        return ids.length;
    },

    async saveScore({ title, folderId = null, fileName, fileType, rawData, lastOpenedAt = null }) {
        const now = Date.now();
        const score = {
            id: makeLibraryId(),
            title: String(title || getScoreDisplayTitle(fileName || '') || 'Untitled Score').trim() || 'Untitled Score',
            folderId: folderId || null,
            fileName: fileName || 'Untitled Score.xml',
            fileType: fileType || getScoreFileTypeFromName(fileName || ''),
            rawData,
            createdAt: now,
            updatedAt: now,
            lastOpenedAt
        };

        await this.transaction([SCORE_LIBRARY_SCORE_STORE], 'readwrite', ({ [SCORE_LIBRARY_SCORE_STORE]: store }) => {
            store.put(score);
        });

        return score;
    },

    async getScoreById(scoreId) {
        if (!scoreId) return null;
        return this.transaction([SCORE_LIBRARY_SCORE_STORE], 'readonly', ({ [SCORE_LIBRARY_SCORE_STORE]: store }) =>
            this.requestToPromise(store.get(scoreId))
        );
    },

    async renameScore(scoreId, nextTitle) {
        const trimmed = String(nextTitle || '').trim();
        if (!scoreId) throw new Error('Score not found.');
        if (!trimmed) throw new Error('Score name is required.');

        const score = await this.getScoreById(scoreId);
        if (!score) throw new Error('Score not found.');

        score.title = trimmed;
        score.updatedAt = Date.now();

        await this.transaction([SCORE_LIBRARY_SCORE_STORE], 'readwrite', ({ [SCORE_LIBRARY_SCORE_STORE]: store }) => {
            store.put(score);
        });

        return score;
    },

    async markScoreOpened(scoreId) {
        const score = await this.getScoreById(scoreId);
        if (!score) return null;
        score.lastOpenedAt = Date.now();
        score.updatedAt = Date.now();

        await this.transaction([SCORE_LIBRARY_SCORE_STORE], 'readwrite', ({ [SCORE_LIBRARY_SCORE_STORE]: store }) => {
            store.put(score);
        });

        return score;
    },

    async moveScoresToFolder(scoreIds, folderId = null) {
        const ids = Array.from(new Set((scoreIds || []).filter(Boolean)));
        if (!ids.length) return 0;

        await this.transaction([SCORE_LIBRARY_SCORE_STORE], 'readwrite', ({ [SCORE_LIBRARY_SCORE_STORE]: store }) => {
            ids.forEach((scoreId) => {
                const request = store.get(scoreId);
                request.onsuccess = () => {
                    const score = request.result;
                    if (!score) return;
                    score.folderId = folderId || null;
                    score.updatedAt = Date.now();
                    store.put(score);
                };
            });
        });

        return ids.length;
    },

    async deleteScores(scoreIds) {
        const ids = Array.from(new Set((scoreIds || []).filter(Boolean)));
        if (!ids.length) return 0;

        await this.transaction([SCORE_LIBRARY_SCORE_STORE], 'readwrite', ({ [SCORE_LIBRARY_SCORE_STORE]: store }) => {
            ids.forEach((scoreId) => store.delete(scoreId));
        });

        return ids.length;
    },

    async exportBackup() {
        const folders = await this.getAllFolders();
        const scores = await this.getAllScores();
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            folders: folders.map(folder => ({ ...folder })),
            scores: scores.map(score => ({
                ...score,
                rawData: serializeScoreRawData(score.rawData)
            }))
        };
    },

    async importBackup(payload) {
        const folders = Array.isArray(payload?.folders) ? payload.folders : [];
        const scores = Array.isArray(payload?.scores) ? payload.scores : [];
        const folderIdMap = new Map();

        await this.transaction([SCORE_LIBRARY_FOLDER_STORE, SCORE_LIBRARY_SCORE_STORE], 'readwrite', ({ [SCORE_LIBRARY_FOLDER_STORE]: folderStore, [SCORE_LIBRARY_SCORE_STORE]: scoreStore }) => {
            folders.forEach(folder => {
                const newId = makeLibraryId();
                folderIdMap.set(folder.id, newId);
                folderStore.put({
                    id: newId,
                    name: String(folder.name || 'New Folder').trim() || 'New Folder',
                    createdAt: Number(folder.createdAt) || Date.now(),
                    updatedAt: Number(folder.updatedAt) || Date.now()
                });
            });

            scores.forEach(score => {
                scoreStore.put({
                    id: makeLibraryId(),
                    title: String(score.title || getScoreDisplayTitle(score.fileName || '') || 'Untitled Score').trim() || 'Untitled Score',
                    folderId: folderIdMap.get(score.folderId) || null,
                    fileName: score.fileName || 'Imported Score.xml',
                    fileType: score.fileType || getScoreFileTypeFromName(score.fileName || ''),
                    rawData: deserializeScoreRawData(score.rawData),
                    createdAt: Number(score.createdAt) || Date.now(),
                    updatedAt: Date.now(),
                    lastOpenedAt: Number(score.lastOpenedAt) || null
                });
            });
        });
    },

    async importStarterLibraryOnce() {
        if (localStorage.getItem(STARTER_LIBRARY_IMPORT_STORAGE_KEY) === 'true') return false;

        const existingScores = await this.getAllScores();
        if (existingScores.length > 0) {
            localStorage.setItem(STARTER_LIBRARY_IMPORT_STORAGE_KEY, 'true');
            return false;
        }

        const response = await fetch(STARTER_LIBRARY_ASSET_PATH, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Could not load starter library (${response.status}).`);
        }

        const payload = await response.json();
        await this.importBackup(payload);
        localStorage.setItem(STARTER_LIBRARY_IMPORT_STORAGE_KEY, 'true');
        return true;
    }
};


function getScoreLibraryFolderLabel(folderId, folders) {
    if (folderId === '__all__') return 'All Scores';
    if (folderId == null || folderId === '__unfiled__') return 'Unfiled';
    const folder = (folders || []).find(item => item.id === folderId);
    return folder?.name || 'Unknown Folder';
}


window.ScoreLibrary = ScoreLibrary;


