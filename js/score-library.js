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

    sameScoreData(a, b) {
        if (typeof a === 'string' && typeof b === 'string') return a === b;
        const bytes = value => value instanceof ArrayBuffer ? new Uint8Array(value)
            : ArrayBuffer.isView(value) ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength) : null;
        const left = bytes(a), right = bytes(b);
        return !!(left && right && left.length === right.length && left.every((value, index) => value === right[index]));
    },

    async findMatchingScore(rawData, scores = null) {
        return (scores || await this.getAllScores()).find(score => this.sameScoreData(score.rawData, rawData)) || null;
    },

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

    async exportBackup(folderId = null) {
        const folders = await this.getAllFolders();
        const scores = await this.getAllScores();
        return {
            version: 1,
            exportedAt: new Date().toISOString(),
            folders: folders.filter(folder => !folderId || folder.id === folderId).map(folder => ({ ...folder })),
            scores: scores.filter(score => !folderId || score.folderId === folderId).map(score => ({
                ...score,
                rawData: serializeScoreRawData(score.rawData)
            }))
        };
    },

    validateBackup(payload) {
        const fail = message => { throw new Error(`Invalid library backup: ${message}`); };
        if (!payload || payload.version !== 1 || !Array.isArray(payload.folders) || !Array.isArray(payload.scores)) {
            fail('choose a Piano Trainer version-1 library or folder backup.');
        }
        const ids = items => {
            const seen = new Set();
            for (const item of items) {
                if (!item || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) fail('missing or duplicate entry ID.');
                seen.add(item.id);
            }
            return seen;
        };
        const folderIds = ids(payload.folders); ids(payload.scores);
        const text = (value, label) => {
            if (typeof value !== 'string' || !value.trim()) fail(`${label} is missing.`);
            return value;
        };
        const aliases = item => {
            if (item.mergeIds !== undefined && (!Array.isArray(item.mergeIds) || item.mergeIds.some(id => typeof id !== 'string' || !id.trim()))) fail('invalid import identities.');
            return [...new Set([item.id, ...(item.mergeIds || [])])];
        };
        const folders = payload.folders.map(folder => ({ id: folder.id, name: text(folder.name, 'folder name'), mergeIds: aliases(folder),
            createdAt: Number(folder.createdAt) || Date.now(), updatedAt: Number(folder.updatedAt) || Date.now() }));
        const scores = payload.scores.map(score => {
            if (score.folderId != null && !folderIds.has(score.folderId)) fail('a score refers to a missing folder.');
            const data = score.rawData;
            if (!data || !['text', 'arraybuffer'].includes(data.kind)) fail('unrecognized score data.');
            if (data.kind === 'text' && (typeof data.text !== 'string' || !data.text.length)) fail('empty or invalid score text.');
            if (data.kind === 'arraybuffer' && (!Array.isArray(data.bytes) || !data.bytes.length || data.bytes.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255))) fail('invalid binary score bytes.');
            return { id: score.id, title: text(score.title, 'score title'), fileName: text(score.fileName, 'filename'),
                fileType: typeof score.fileType === 'string' && score.fileType ? score.fileType : getScoreFileTypeFromName(score.fileName),
                folderId: score.folderId ?? null, rawData: deserializeScoreRawData(data), mergeIds: aliases(score),
                createdAt: Number(score.createdAt) || Date.now(), updatedAt: Number(score.updatedAt) || Date.now(), lastOpenedAt: Number(score.lastOpenedAt) || null };
        });
        return { folders, scores };
    },

    // Snapshot both stores together. Commit rechecks this snapshot inside its write transaction.
    async readMergeSnapshot() {
        const snapshot = { folders: [], scores: [] };
        await this.transaction(['folders', 'scores'], 'readonly', stores => {
            for (const key of ['folders', 'scores']) stores[key].getAll().onsuccess = event => { snapshot[key] = event.target.result; };
        });
        return snapshot;
    },

    mergeSnapshotKey({ folders, scores }) {
        const sorted = entries => entries.slice().sort((a, b) => a.id.localeCompare(b.id));
        return JSON.stringify({ folders: sorted(folders), scores: sorted(scores).map(score => ({ ...score, rawData: serializeScoreRawData(score.rawData) })) });
    },

    async prepareBackupMerge(payload) {
        const incoming = this.validateBackup(payload);
        const snapshot = await this.readMergeSnapshot();
        return { incoming, snapshot, snapshotKey: this.mergeSnapshotKey(snapshot) };
    },

    planBackupMerge(prepared, choices = {}) {
        const { incoming, snapshot } = prepared;
        const identities = item => new Set([item.id, ...(item.mergeIds || [])]);
        const related = (a, b) => [...identities(a)].some(id => identities(b).has(id));
        const nameKey = name => name.trim().toLowerCase();
        const folderRows = [], scoreRows = [], folderMap = new Map();
        const reservedFolders = new Set(), reservedScores = new Set();
        const knownFolder = new Map(), knownScore = new Map();
        // Reserve exact IDs before aliases, so an older imported version cannot steal a copy's identity.
        for (const direct of [true, false]) {
            for (const folder of incoming.folders) {
                if (knownFolder.has(folder.id)) continue;
                const match = snapshot.folders.find(local => !reservedFolders.has(local.id) && (direct ? local.id === folder.id : related(local, folder)));
                if (match) { knownFolder.set(folder.id, match); reservedFolders.add(match.id); }
            }
            for (const score of incoming.scores) {
                if (knownScore.has(score.id)) continue;
                const match = snapshot.scores.find(local => !reservedScores.has(local.id) && this.sameScoreData(local.rawData, score.rawData) && (direct ? local.id === score.id : related(local, score)));
                if (match) { knownScore.set(score.id, match); reservedScores.add(match.id); }
            }
        }
        for (const folder of incoming.folders) {
            const known = knownFolder.get(folder.id);
            const sameName = snapshot.folders.filter(local => nameKey(local.name) === nameKey(folder.name));
            const uniqueIncoming = incoming.folders.filter(other => nameKey(other.name) === nameKey(folder.name)).length === 1;
            const suggestion = !known && uniqueIncoming && sameName.length === 1 && !reservedFolders.has(sameName[0].id) ? sameName[0] : null;
            const target = known || (choices.folders?.[folder.id] === 'separate' ? null : suggestion);
            if (target) reservedFolders.add(target.id);
            folderMap.set(folder.id, target?.id || folder.id);
            folderRows.push({ incoming: folder, target, suggestion });
        }
        for (const score of incoming.scores) {
            const known = knownScore.get(score.id);
            const knownDifferent = !known && snapshot.scores.some(local => related(local, score));
            const candidates = known || knownDifferent ? [] : snapshot.scores.filter(local => !reservedScores.has(local.id)
                && this.sameScoreData(local.rawData, score.rawData) && local.title === score.title && local.fileName === score.fileName
                && local.fileType === score.fileType && (local.folderId ?? null) === (folderMap.get(score.folderId) ?? null));
            const choice = Object.prototype.hasOwnProperty.call(choices.scores || {}, score.id) ? choices.scores[score.id] : null;
            const target = known || (choice ? candidates.find(local => local.id === choice) : null);
            if (choice && !known && !target) throw new Error('A selected existing entry is unavailable or used twice. Review the matches again.');
            if (target) reservedScores.add(target.id);
            scoreRows.push({ incoming: score, target, candidates, changed: knownDifferent });
        }
        return { folderRows, scoreRows,
            added: scoreRows.filter(row => !row.target).length, skipped: scoreRows.filter(row => row.target).length,
            uncertain: scoreRows.filter(row => row.candidates.length).length,
            foldersAdded: folderRows.filter(row => !row.target).length, foldersReused: folderRows.filter(row => row.target).length };
    },

    async applyBackupMerge(prepared, choices = {}) {
        const plan = this.planBackupMerge(prepared, choices);
        let failure;
        try {
            await this.transaction(['folders', 'scores'], 'readwrite', (stores, tx) => {
                const current = {}; let reads = 0;
                const commit = () => {
                    if (++reads !== 2) return;
                    try {
                        if (this.mergeSnapshotKey(current) !== prepared.snapshotKey) throw new Error('The library changed while the preview was open. Choose the backup again to refresh the preview.');
                        const folderIds = new Set(current.folders.map(item => item.id));
                        const scoreIds = new Set(current.scores.map(item => item.id));
                        const allocate = (wanted, used) => { let id = wanted; while (used.has(id)) id = makeLibraryId(); used.add(id); return id; };
                        const remember = (target, source, store) => {
                            const mergeIds = [...new Set([...(target.mergeIds || []), source.id, ...(source.mergeIds || [])])];
                            if (JSON.stringify(mergeIds) !== JSON.stringify(target.mergeIds || [])) store.put({ ...target, mergeIds });
                        };
                        const folderMap = new Map();
                        for (const row of plan.folderRows) {
                            if (row.target) {
                                folderMap.set(row.incoming.id, row.target.id);
                                remember(row.target, row.incoming, stores.folders);
                            } else {
                                const id = allocate(row.incoming.id, folderIds);
                                folderMap.set(row.incoming.id, id);
                                stores.folders.add({ ...row.incoming, id });
                            }
                        }
                        for (const row of plan.scoreRows) {
                            if (row.target) remember(row.target, row.incoming, stores.scores);
                            else stores.scores.add({ ...row.incoming, id: allocate(row.incoming.id, scoreIds), folderId: folderMap.get(row.incoming.folderId) || null });
                        }
                    } catch (error) { failure = error; tx.abort(); }
                };
                for (const key of ['folders', 'scores']) stores[key].getAll().onsuccess = event => { current[key] = event.target.result; commit(); };
            });
        } catch (error) { throw failure || error; }
        return { added: plan.added, skipped: plan.skipped, foldersAdded: plan.foldersAdded, foldersReused: plan.foldersReused };
    },

    async importBackup(payload) {
        return this.applyBackupMerge(await this.prepareBackupMerge(payload));
    },

    demoPromise: null,
    async getDemoScores() {
        if (!this.demoPromise) {
            this.demoPromise = fetch(STARTER_LIBRARY_ASSET_PATH).then(response => {
                if (!response.ok) throw new Error('Could not load demo scores.');
                return response.json();
            }).then(payload => payload.scores.map((score, index) => ({
                ...score, id: '__demo_' + index, folderId: '__demos__', isDemo: true,
                rawData: deserializeScoreRawData(score.rawData)
            }))).catch(error => { this.demoPromise = null; throw error; });
        }
        return this.demoPromise;
    }

};


function getScoreLibraryFolderLabel(folderId, folders) {
    if (folderId === '__all__') return 'All Scores';
    if (folderId === '__demos__') return 'Demo Scores';
    if (folderId == null || folderId === '__unfiled__') return 'Unfiled';
    const folder = (folders || []).find(item => item.id === folderId);
    return folder?.name || 'Unknown Folder';
}


window.ScoreLibrary = ScoreLibrary;


