// toolbar-ui.js
// Handles top toolbar interactions and menu visibility.
// Does not contain playback, rendering, or trainer engine logic.

// ⚠️ WARNING:
// Keep this layer limited to UI intent and menu state wiring.
// Do not trigger rendering, playback timing, or LED pipeline side effects directly here.

// ===== Toolbar shell + floating panel coordination =====

const scoresPanel = document.getElementById('scores-panel');
const optionsOverlay = document.getElementById('options-overlay');
const tempoPopup = document.getElementById('tempo-popup');
const practicePopup = document.getElementById('practice-popup');
const looperPopup = document.getElementById('looper-popup');
const helpOverlay = document.getElementById('help-overlay');
const popupPanels = [scoresPanel, optionsOverlay, tempoPopup, practicePopup, looperPopup, helpOverlay].filter(Boolean);
const POPUP_ANIMATION_MS = 180;
const panelButtonMap = new Map([
    [scoresPanel, document.getElementById('btn-scores')],
    [optionsOverlay, document.getElementById('btn-options')],
    [helpOverlay, document.getElementById('btn-help')],
    [tempoPopup, document.getElementById('btn-tempo')],
    [practicePopup, document.getElementById('btn-practice')],
    [looperPopup, document.getElementById('btn-looper')]
].filter(([panel, button]) => panel && button));

function syncToolbarButtonStates() {
    panelButtonMap.forEach((button, panel) => {
        const isOpen = !panel.classList.contains('hidden') && panel.classList.contains('is-open');
        button.classList.toggle('is-open', isOpen);
        button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
}

function showToolbarPanel(panel) {
    if (!panel) return;
    popupPanels.forEach(other => {
        if (other !== panel) closeToolbarPanel(other, true);
    });

    if (!panel.classList.contains('hidden') && panel.classList.contains('is-open')) return;

    panel.classList.remove('hidden', 'is-closing');
    requestAnimationFrame(() => {
        panel.classList.add('is-open');
        syncToolbarButtonStates();
    });
}

function closeToolbarPanel(panel, immediate = false) {
    if (!panel || panel.classList.contains('hidden')) return;

    panel.classList.remove('is-open');

    if (immediate) {
        panel.classList.remove('is-closing');
        panel.classList.add('hidden');
        syncToolbarButtonStates();
        return;
    }

    panel.classList.add('is-closing');

    const finalizeClose = (event) => {
        if (event && event.target !== panel) return;
        panel.classList.remove('is-closing');
        panel.classList.add('hidden');
        panel.removeEventListener('transitionend', finalizeClose);
        syncToolbarButtonStates();
    };

    panel.addEventListener('transitionend', finalizeClose);
    window.setTimeout(() => {
        if (panel.classList.contains('is-closing')) {
            finalizeClose();
        }
    }, POPUP_ANIMATION_MS + 40);
}

function hideToolbarPanels(immediate = false) {
    popupPanels.forEach(panel => closeToolbarPanel(panel, immediate));
}

function toggleToolbarPanel(panel) {
    if (!panel) return;
    const shouldShow = panel.classList.contains('hidden') || !panel.classList.contains('is-open');
    if (shouldShow) {
        showToolbarPanel(panel);
    } else {
        closeToolbarPanel(panel);
    }
}

const btnScores = document.getElementById('btn-scores');
if (btnScores && scoresPanel) {
    btnScores.addEventListener('click', async (e) => {
        e.stopPropagation();
        const shouldShow = scoresPanel.classList.contains('hidden') || !scoresPanel.classList.contains('is-open');
        if (shouldShow) {
            AppState.scoreLibraryView = 'folders';
            try { await refreshScoresDrawer(); } catch (err) {}
        }
        toggleToolbarPanel(scoresPanel);
    });
}

document.getElementById('btn-options').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleToolbarPanel(optionsOverlay);
});

const btnHelp = document.getElementById('btn-help');
if (btnHelp && helpOverlay) {
    btnHelp.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleToolbarPanel(helpOverlay);
    });
}

const btnHelpClose = document.getElementById('btn-help-close');
if (btnHelpClose && helpOverlay) {
    btnHelpClose.addEventListener('click', () => closeToolbarPanel(helpOverlay));
}

const btnHelpGotIt = document.getElementById('btn-help-got-it');
if (btnHelpGotIt && helpOverlay) {
    btnHelpGotIt.addEventListener('click', () => closeToolbarPanel(helpOverlay));
}

const btnTempo = document.getElementById('btn-tempo');
if (btnTempo && tempoPopup) {
    btnTempo.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleToolbarPanel(tempoPopup);
    });
}

const btnPractice = document.getElementById('btn-practice');
if (btnPractice && practicePopup) {
    btnPractice.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleToolbarPanel(practicePopup);
    });
}

const btnLooper = document.getElementById('btn-looper');
if (btnLooper && looperPopup) {
    btnLooper.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleToolbarPanel(looperPopup);
    });
}

function isAnyToolbarPanelOpen() {
    return popupPanels.some(panel => !panel.classList.contains('hidden'));
}

document.addEventListener('click', (e) => {
    if (
        e.target.closest('#static-menu') ||
        e.target.closest('#scores-panel') ||
        e.target.closest('#options-overlay') ||
        e.target.closest('#tempo-popup') ||
        e.target.closest('#practice-popup') ||
        e.target.closest('#looper-popup') ||
        e.target.closest('#help-overlay') ||
        e.target.closest('#first-run-overlay') ||
        e.target.closest('#led-calibration-panel') ||
        e.target.closest('.scores-action-menu-overlay') ||
        e.target.closest('.scores-folder-picker-overlay')
    ) {
        return;
    }

    if (isAnyToolbarPanelOpen()) {
        hideToolbarPanels();
        e.stopPropagation();
    }
});

function positionScoresPanel() {
    const panel = document.getElementById('scores-panel');
    if (!panel) return;

    const nav = document.getElementById('static-menu');

    let topPx = 58;
    if (nav) {
        const navRect = nav.getBoundingClientRect();
        topPx = Math.round(navRect.bottom + 10);
    }

    panel.style.top = `${topPx}px`;
    panel.style.bottom = `12px`;
}




function showFirstRunIntro() {
    const overlay = document.getElementById('first-run-overlay');
    if (!overlay) return;
    hideToolbarPanels(true);
    overlay.classList.remove('hidden');
}

function closeFirstRunIntro() {
    const overlay = document.getElementById('first-run-overlay');
    if (!overlay) return;
    overlay.classList.add('hidden');
}

function markFirstRunIntroSeen() {
    try { localStorage.setItem('pt_firstRunIntroSeen', 'true'); } catch (err) {}
}

function maybeShowFirstRunIntro() {
    const overlay = document.getElementById('first-run-overlay');
    if (!overlay) return false;
    try {
        if (localStorage.getItem('pt_firstRunIntroSeen') === 'true') return false;
    } catch (err) {}
    showFirstRunIntro();
    return true;
}

const btnFirstRunStart = document.getElementById('btn-first-run-start');
if (btnFirstRunStart) {
    btnFirstRunStart.addEventListener('click', () => {
        markFirstRunIntroSeen();
        closeFirstRunIntro();
    });
}

const btnFirstRunHelp = document.getElementById('btn-first-run-help');
if (btnFirstRunHelp) {
    btnFirstRunHelp.addEventListener('click', () => {
        markFirstRunIntroSeen();
        closeFirstRunIntro();
        if (helpOverlay) showToolbarPanel(helpOverlay);
    });
}

window.ToolbarUI = {
    syncToolbarButtonStates,
    showToolbarPanel,
    closeToolbarPanel,
    hideToolbarPanels,
    toggleToolbarPanel,
    isAnyToolbarPanelOpen,
    positionScoresPanel
};

window.IntroUI = {
    maybeShowFirstRunIntro,
    showFirstRunIntro,
    closeFirstRunIntro,
    markFirstRunIntroSeen
};
