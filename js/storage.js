// Preference persistence only. Never substitute an in-memory score library.
function createPreferenceStorage(getStorage, label) {
    const memory = new Map();
    let failure = null;
    function unavailable(error) {
        failure = error;
        const show = () => {
            let notice = document.getElementById('storage-warning');
            if (notice) return;
            if (!notice) {
                notice = document.createElement('div');
                notice.id = 'storage-warning';
                notice.setAttribute('role', 'status');
                notice.style.cssText = 'position:fixed;bottom:8px;left:8px;right:8px;z-index:10000;padding:10px;background:#fff3cd;color:#332600;border:1px solid #997300;font:14px sans-serif;';
                document.body.appendChild(notice);
            }
            notice.textContent = `${label} is unavailable. Some preference changes may last only for this page session. Restore browser storage access and reload; do not clear site data. `;
            const dismiss = document.createElement('button');
            dismiss.textContent = 'Dismiss';
            dismiss.setAttribute('aria-label', 'Dismiss storage warning');
            dismiss.onclick = () => { notice.hidden = true; };
            notice.appendChild(dismiss);
        };
        if (document.body) show(); else document.addEventListener('DOMContentLoaded', show, { once: true });
    }
    function requireStorage() {
        if (failure) throw new Error(`${label} is unavailable. Changes are session-only; restore storage access and reload before backing up, importing or resetting settings.`);
        try { return getStorage(); } catch (error) { unavailable(error); return requireStorage(); }
    }
    return {
        getItem(key) {
            if (failure && memory.has(key)) return memory.get(key);
            try { const value = getStorage().getItem(key); memory.set(key, value); return value; }
            catch (error) { unavailable(error); }
            return memory.get(key) ?? null;
        },
        setItem(key, value) {
            memory.set(key, String(value));
            if (!failure) try { getStorage().setItem(key, String(value)); } catch (error) { unavailable(error); }
        },
        removeItem(key) {
            memory.set(key, null);
            if (!failure) try { getStorage().removeItem(key); } catch (error) { unavailable(error); }
        },
        keys() {
            try { return Object.keys(requireStorage()); }
            catch (error) { unavailable(error); throw error; }
        },
        requireStorage,
        // Web Storage has no transactions. Snapshot first and restore touched keys
        // on failure; never clear the origin or proceed to a success/reload message.
        replace(entries, removals = []) {
            const storage = requireStorage();
            const keys = [...new Set([...Object.keys(entries), ...removals])];
            const before = new Map();
            const touched = [];
            try {
                for (const key of keys) before.set(key, storage.getItem(key));
                for (const [key, value] of Object.entries(entries)) { touched.push(key); storage.setItem(key, value); }
                for (const key of removals) if (!(key in entries)) { touched.push(key); storage.removeItem(key); }
            } catch (error) {
                let rollbackFailed = false;
                for (const key of touched.reverse()) try {
                    const value = before.get(key);
                    if (value === null) storage.removeItem(key); else storage.setItem(key, value);
                } catch (_) { rollbackFailed = true; }
                unavailable(error);
                throw new Error(rollbackFailed ? 'Settings storage failed and some changes could not be restored. Do not clear site data. Restore storage access before retrying.' : 'Settings storage failed. No settings changes were retained. Restore storage access before retrying.');
            }
            for (const key of keys) memory.delete(key);
        }
    };
}
const appLocalStorage = createPreferenceStorage(() => window.localStorage, 'Preference storage');
const appSessionStorage = createPreferenceStorage(() => window.sessionStorage, 'Session storage');
