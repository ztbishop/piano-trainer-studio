// Piano Trainer library attachments, adapted from Guitar Trainer Studio 3a7752b (AGPL-3.0).
const LibraryPDF = {
    hash(bytes) { return scoreContentFingerprint(new Uint8Array(bytes), 'pdf-v1'); },

    validBoxes(boxes, pageCount) {
        if (!boxes || typeof boxes !== 'object' || Array.isArray(boxes)) return false;
        return Object.entries(boxes).every(([number, box]) =>
            /^[1-9]\d{0,4}$/.test(number) && Number.isInteger(box?.page) && box.page >= 1 && box.page <= pageCount &&
            [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.x >= 0 && box.y >= 0 &&
            box.w > 0 && box.h > 0 && box.x + box.w <= 1.000001 && box.y + box.h <= 1.000001);
    },

    validateAttachment(pdf, assets) {
        if (!pdf || !assets.has(pdf.hash) || typeof pdf.fileName !== 'string' || !pdf.fileName.trim() ||
            !Number.isSafeInteger(pdf.pageCount) || pdf.pageCount < 1 || !this.validBoxes(pdf.boxes, pdf.pageCount) ||
            !Array.isArray(pdf.mapping) || !pdf.mapping.every(n => n === null || Number.isSafeInteger(n) && n > 0))
            throw new Error('Invalid library backup: invalid PDF reference or measure mapping.');
        const {hash, fileName, pageCount, boxes, mapping} = pdf;
        return {hash, fileName, pageCount, boxes, mapping};
    },

    encode(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return btoa(binary);
    },

    decodeAssets(rows) {
        if (!Array.isArray(rows)) throw new Error('Invalid library backup: missing PDF assets.');
        const assets = new Map();
        for (const row of rows) {
            if (typeof row?.data !== 'string' || !row.data.length || row.data.length % 4 ||
                !/^[A-Za-z0-9+/]*={0,2}$/.test(row.data)) throw new Error('Invalid library backup: invalid PDF data.');
            const bytes = Uint8Array.from(atob(row.data), c => c.charCodeAt(0)).buffer;
            if (this.hash(bytes) !== row.hash || assets.has(row.hash))
                throw new Error('Invalid library backup: incorrect or duplicate PDF hash.');
            assets.set(row.hash, bytes);
        }
        return assets;
    },

    async store(store, hash, bytes) {
        const existing = await ScoreLibrary.requestToPromise(store.get(hash));
        if (!existing) store.add({hash, bytes});
        else if (!ScoreLibrary.sameScoreData(existing.bytes, bytes)) throw new Error('Two different PDFs have the same content fingerprint.');
    },

    release(stores, hash) {
        if (!hash) return;
        stores.scores.index('pdfHash').count(hash).onsuccess = event => {
            if (!event.target.result) stores.pdfs.delete(hash);
        };
    }
};
