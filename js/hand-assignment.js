/* Score-local performance roles. Display staff remains owned by OSMD. */
window.HandAssignment = (() => {
    const roles = ['left', 'right', 'accompaniment', 'ignore'];
    const roleLabels = ['Left hand', 'Right hand', 'Accompaniment', 'Ignore'];
    let state = null;
    let storageKey = null;
    let staffInfo = [];
    let voices = [];
    let defaults = {};
    let noteVoices = new WeakMap();
    let storageWarning = '';
    const el = id => document.getElementById(id);
    const validRole = role => roles.includes(role);
    const voiceKey = (part, voice) => JSON.stringify([part, voice]);

    // Deterministic content fingerprint also works on HTTP LAN/iPad connections,
    // where SubtleCrypto is unavailable. This is an identity key, not a security hash.
    function fingerprint(text) {
        let a = 1779033703, b = 3144134277, c = 1013904242, d = 2773480762;
        for (let i = 0; i < text.length; i++) {
            const k = text.charCodeAt(i);
            a = b ^ Math.imul(a ^ k, 597399067);
            b = c ^ Math.imul(b ^ k, 2869860233);
            c = d ^ Math.imul(c ^ k, 951274213);
            d = a ^ Math.imul(d ^ k, 2716044179);
        }
        a = Math.imul(c ^ (a >>> 18), 597399067);
        b = Math.imul(d ^ (b >>> 22), 2869860233);
        c = Math.imul(a ^ (c >>> 17), 951274213);
        d = Math.imul(b ^ (d >>> 19), 2716044179);
        return [a ^ b ^ c ^ d, b ^ a, c ^ a, d ^ a].map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
    }

    async function initialize(xml) {
        state = null;
        storageKey = null;
        storageWarning = '';
        staffInfo = [];
        voices = [];
        noteVoices = new WeakMap();
        const doc = new DOMParser().parseFromString(xml || '', 'application/xml');
        const parts = Array.from(doc.querySelectorAll('score-partwise > part'));
        const instruments = osmd.Sheet.Instruments || [];
        const partMetadata = [];
        let globalStaff = 1;
        instruments.forEach((instrument, index) => {
            const part = parts[index];
            const partId = part?.getAttribute('id') || `part-${index + 1}`;
            const declaration = Array.from(doc.querySelectorAll('score-part')).find(p => p.getAttribute('id') === partId);
            const name = declaration?.querySelector('part-name')?.textContent?.trim() || `Part ${index + 1}`;
            const program = Number(declaration?.querySelector('midi-program')?.textContent || 0);
            const staves = instrument.Staves || [];
            const ids = staves.map((staff, localIndex) => {
                const id = globalStaff++;
                staffInfo.push({ id, name, partId, local: localIndex + 1 });
                return id;
            });
            const stats = new Map();
            part?.querySelectorAll('measure > note').forEach(note => {
                if (!note.querySelector('pitch')) return;
                const voice = note.querySelector('voice')?.textContent?.trim();
                if (!voice) return;
                const localStaff = Number(note.querySelector('staff')?.textContent || 1);
                const staffId = ids[localStaff - 1];
                if (!staffId) return;
                if (!stats.has(voice)) stats.set(voice, { key: voiceKey(partId, voice), voice, name, counts: {}, total: 0 });
                const item = stats.get(voice);
                item.counts[staffId] = (item.counts[staffId] || 0) + 1;
                item.total++;
            });
            partMetadata.push({ partId, ids, stats, piano: /piano|grand|klavier/i.test(name) || (program >= 1 && program <= 8) });
        });
        defaults = Object.fromEntries(staffInfo.map(s => [s.id, 'ignore']));
        const pianoParts = partMetadata.filter(p => p.piano && p.ids.length === 2);
        const selected = staffInfo.length > 2 && pianoParts.length === 1 ? pianoParts[0].ids : staffInfo.map(s => s.id).slice(0, 2);
        if (selected[0]) defaults[selected[0]] = 'right';
        if (selected[1]) defaults[selected[1]] = 'left';

        // Match exposed OSMD voice IDs within their instrument, never globally.
        osmd.cursor.reset();
        const iterator = osmd.cursor.Iterator;
        while (!iterator.EndReached) {
            (iterator.CurrentVoiceEntries || []).forEach(entry => (entry.Notes || []).forEach(note => {
                const staffId = getResolvedStaffAssignmentIdFromNote(note);
                const info = staffInfo.find(s => s.id === staffId);
                const part = partMetadata.find(p => p.partId === info?.partId);
                const id = String(note.ParentVoiceEntry?.ParentVoice?.VoiceId ?? '');
                const matches = part ? [...part.stats.values()].filter(v => v.voice === id || (/^\d+$/.test(v.voice) && String(Number(v.voice)) === id)) : [];
                if (matches.length === 1) {
                    noteVoices.set(note, matches[0].key);
                    matches[0].available = true;
                }
            }));
            iterator.moveToNext();
        }
        osmd.cursor.reset();
        voices = partMetadata.flatMap(p => [...p.stats.values()]).filter(v => v.available);
        state = { mode: 'staff', staff: { ...defaults }, voice: {}, playAccompaniment: true };
        try {
            storageKey = 'pt_handAssignment_v1_' + fingerprint(xml || '');
            const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
            if (saved) {
                state.mode = saved.mode === 'voice' && voices.length ? 'voice' : 'staff';
                for (const s of staffInfo) if (validRole(saved.staff?.[s.id])) state.staff[s.id] = saved.staff[s.id];
                for (const v of voices) if (validRole(saved.voice?.[v.key])) state.voice[v.key] = saved.voice[v.key];
                state.playAccompaniment = saved.playAccompaniment !== false;
            }
        } catch (error) {
            storageWarning = 'Assignments work for this session; browser storage is unavailable.';
        }
        syncLegacyHands();
        render();
    }

    function suggestion(v) {
        const ranked = Object.entries(v.counts).sort((a, b) => b[1] - a[1]);
        const [staff, count] = ranked[0] || [];
        // Conservative suggestion only; never silently switches assignment mode.
        return count >= 8 && count / v.total >= 0.9 ? state.staff[staff] : null;
    }
    function roleForStaff(id) { return state ? (state.staff[id] || 'ignore') : null; }
    function roleForNote(note) {
        const key = noteVoices.get(note);
        if (state?.mode === 'voice' && key && validRole(state.voice[key])) return state.voice[key];
        return roleForStaff(getResolvedStaffAssignmentIdFromNote(note));
    }
    function syncLegacyHands() {
        if (!state) return;
        for (const role of ['left', 'right']) {
            AppState.hands[role] = staffInfo.find(s => state.staff[s.id] === role)?.id ?? null;
            if (el(role === 'left' ? 'assign-lh' : 'assign-rh')) el(role === 'left' ? 'assign-lh' : 'assign-rh').value = AppState.hands[role] ?? '';
        }
    }
    function saveAndRefresh() {
        try { if (storageKey) localStorage.setItem(storageKey, JSON.stringify(state)); }
        catch (_) { storageWarning = 'Assignments work for this session; browser storage is unavailable.'; }
        syncLegacyHands();
        // Stop queued notes and clear old hand colors before rebuilding the current frame.
        if (AppState.isPlaying) pausePlaybackFromToolbar();
        AppState.pendingAudio = [];
        clearVisuals();
        AppState.currentExpectedContext = null;
        AppState.ledPreviewTraversalIndex = -1;
        AppState.ledPreviewTimeline = [];
        AppState.ledPreviewTimelineDirty = true;
        AppState.lastLedPreviewEvents = [];
        AppState.earlyGraceReservations.clear();
        const it = osmd?.cursor?.Iterator;
        if (it) {
            buildExpectedNotesFromEntries(it.CurrentVoiceEntries || [], it.CurrentMeasureIndex, it.currentTimeStamp?.RealValue ?? null);
            renderVirtualKeyboard(it.CurrentVoiceEntries || [], it.CurrentMeasureIndex, it.currentTimeStamp?.RealValue ?? null);
        }
        render();
    }
    function setCompact(left, right) {
        if (!state) return;
        state.staff = Object.fromEntries(staffInfo.map(s => [s.id, s.id === right ? 'right' : s.id === left ? 'left' : 'ignore']));
        saveAndRefresh();
    }
    function makeSelect(value, onChange, fallback = false) {
        const select = document.createElement('select');
        if (fallback) select.add(new Option('Follow staff', ''));
        roles.forEach((role, i) => select.add(new Option(roleLabels[i], role)));
        select.value = value || '';
        select.addEventListener('change', () => { onChange(select.value); saveAndRefresh(); });
        return select;
    }
    function render() {
        const host = el('assignment-details');
        if (!host) return;
        host.replaceChildren();
        el('assignment-mode').disabled = !state;
        el('assignment-mode').value = state?.mode || 'staff';
        el('assignment-mode').querySelector('[value="voice"]').disabled = !voices.length;
        const compact = !state || (state.mode === 'staff' && staffInfo.length <= 2 && !Object.values(state.staff).includes('accompaniment') && new Set(Object.values(state.staff)).size === staffInfo.length);
        el('assignment-compact').hidden = !compact;
        el('assignment-advanced').hidden = !state || state.mode !== 'staff' || !compact;
        if (!state) return;
        const advanced = el('assignment-advanced').getAttribute('aria-expanded') === 'true';
        if (!compact || advanced) {
            el('assignment-compact').hidden = true;
            const items = state.mode === 'voice' ? voices : staffInfo;
            for (const item of items) {
                const label = document.createElement('label');
                label.className = 'assignment-item';
                const text = document.createElement('span');
                text.textContent = state.mode === 'voice' ? `${item.name} — Voice ${item.voice}` : `${item.name} — Staff ${item.local}`;
                const key = state.mode === 'voice' ? item.key : item.id;
                label.append(text, makeSelect(state[state.mode][key], value => {
                    if (value) state[state.mode][key] = value;
                    else delete state[state.mode][key];
                }, state.mode === 'voice'));
                host.append(label);
            }
            if (state.mode === 'voice') {
                const help = document.createElement('p');
                help.className = 'assignment-help';
                help.textContent = 'Voices keep their hand when they cross staves. Unassigned or missing voices follow the staff assignments.';
                host.append(help);
            }
        }
        const notice = el('assignment-notice');
        notice.replaceChildren();
        const cross = voices.some(v => Object.keys(v.counts).length > 1 && ['left', 'right'].includes(suggestion(v)) && Object.keys(v.counts).some(s => state.staff[s] !== suggestion(v)));
        if (state.mode === 'staff' && cross) {
            notice.append(document.createTextNode('Possible cross-staff notes detected. '));
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'assignment-link';
            button.textContent = 'Use suggested voice mapping';
            button.onclick = () => {
                for (const v of voices) { const role = suggestion(v); if (validRole(role)) state.voice[v.key] = role; }
                state.mode = 'voice'; saveAndRefresh();
            };
            notice.append(button);
        } else if (state.mode === 'staff' && staffInfo.length > 2) {
            notice.textContent = 'Review assignments for this score. Extra staves default to Ignore.';
        }
        notice.hidden = !notice.textContent;
        const hasAccompaniment = Object.values(state.staff).includes('accompaniment') || (state.mode === 'voice' && Object.values(state.voice).includes('accompaniment'));
        el('assignment-accompaniment').hidden = !hasAccompaniment;
        el('play-accompaniment').checked = state.playAccompaniment;
        const output = el('assignment-output');
        output.replaceChildren();
        output.hidden = !hasAccompaniment || !state.playAccompaniment || AppState.audioEnabled.other || AppState.midiOutEnabled.other;
        if (!output.hidden) {
            output.append(document.createTextNode('Accompaniment output is muted. '));
            const enable = document.createElement('button');
            enable.type = 'button'; enable.className = 'assignment-link'; enable.textContent = 'Enable sound';
            enable.onclick = () => {
                const control = el('enable-other');
                control.checked = true;
                control.dispatchEvent(new Event('change'));
                render();
            };
            output.append(enable);
        }
        el('assignment-storage').textContent = storageWarning;
        el('assignment-storage').hidden = !storageWarning;
    }
    document.addEventListener('DOMContentLoaded', () => {
        el('assignment-mode').addEventListener('change', event => { if (state) { state.mode = event.target.value; saveAndRefresh(); } });
        el('assignment-advanced').addEventListener('click', event => {
            const expanded = event.target.getAttribute('aria-expanded') !== 'true';
            event.target.setAttribute('aria-expanded', String(expanded));
            event.target.textContent = expanded ? 'Simple assignments' : 'Edit all assignments';
            render();
        });
        el('play-accompaniment').addEventListener('change', event => { state.playAccompaniment = event.target.checked; saveAndRefresh(); });
        ['enable-other', 'enable-midiout-other'].forEach(id => el(id)?.addEventListener('change', render));
        render();
    });
    return { deactivate: () => { state = null; }, initialize, roleForStaff, roleForNote, setCompact, ready: () => !!state,
        playAccompaniment: () => state?.playAccompaniment !== false,
        snapshot: () => JSON.parse(JSON.stringify({ state, voices, staffInfo })) };
})();
