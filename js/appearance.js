// Appearance changes only paint. They never rerender or alter OSMD geometry.
(() => {
    const allowed = ['light', 'soft-light', 'dark'];
    const control = document.getElementById('appearance');
    function apply(value) {
        const appearance = allowed.includes(value) ? value : 'light';
        document.documentElement.dataset.appearance = appearance;
        control.value = appearance;
    }
    let saved = 'light';
    try { saved = localStorage.getItem('pt_appearance'); } catch (_) {}
    apply(saved);
    control.addEventListener('change', () => {
        apply(control.value);
        try { localStorage.setItem('pt_appearance', control.value); } catch (_) {}
    });
})();
