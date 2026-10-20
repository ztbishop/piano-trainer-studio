// Presentation-only coarse buttons. Existing setting handlers own validation,
// persistence and application; range input/change semantics stay untouched.
(() => {
    const controls = [
        ['val-bpm', null, 'BPM', 1],
        ['val-speed', 'slider-speed', 'Speed'],
        ['val-metro-vol', 'slider-metro-vol', 'Metronome level'],
        ['val-piano-vol', 'slider-piano-vol', 'App audio volume'],
        ['val-midiout-vol', 'slider-midiout-vol', 'MIDI output volume'],
        ['val-midiin-boost', 'slider-midiin-boost', 'MIDI input boost'],
        ['val-zoom', 'slider-zoom', 'Score zoom'],
        ['val-led-master', 'slider-led-master', 'Master LED brightness']
    ];

    for (const [inputId, sliderId, label, minimum] of controls) {
        const input = document.getElementById(inputId);
        const slider = sliderId ? document.getElementById(sliderId) : null;
        if (!input) continue;
        const group = document.createElement('span');
        group.className = 'number-stepper';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', `${label} controls`);
        input.parentNode.insertBefore(group, input);
        input.closest('.tempo-row, .practice-row, .brightness-row')?.classList.add('number-step-row');

        const buttons = [-1, 1].map(direction => {
            const button = document.createElement('button');
            const action = direction < 0 ? 'Decrease' : 'Increase';
            button.type = 'button';
            button.id = `${inputId}-${direction < 0 ? 'decrease' : 'increase'}`;
            button.className = 'number-step-button';
            button.textContent = direction < 0 ? '−' : '+';
            button.setAttribute('aria-label', `${action} ${label} to the ${direction < 0 ? 'previous' : 'next'} multiple of five`);
            button.addEventListener('click', () => {
                if (input.disabled || input.value.trim() === '') return;
                const current = Number(input.value);
                if (!Number.isFinite(current)) return;
                const minText = input.min || slider?.min;
                const maxText = input.max || slider?.max;
                const min = minText ? Number(minText) : (minimum ?? -Infinity);
                const max = maxText ? Number(maxText) : Infinity;
                const next = direction > 0
                    ? (Math.floor(current / 5) + 1) * 5
                    : (Math.ceil(current / 5) - 1) * 5;
                const value = Math.min(max, Math.max(min, next));
                if (value === current) return;
                input.value = String(value);
                // A single commit, including for zoom: never synthesize range input.
                input.dispatchEvent(new Event('change', { bubbles: true }));
            });
            return button;
        });
        group.append(buttons[0], input, buttons[1]);
        const syncDisabled = () => buttons.forEach(button => { button.disabled = input.disabled; });
        new MutationObserver(syncDisabled).observe(input, { attributes: true, attributeFilter: ['disabled'] });
        syncDisabled();
    }
})();
