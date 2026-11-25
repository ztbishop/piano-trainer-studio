// Speed Trainer controls and pass progression adapted from Guitar Trainer Studio 2bf5d3b (AGPL-3.0).
window.SpeedTrainer = (() => {
    const get = name => document.getElementById('training-' + name);
    let ready = false, run = null;

    function available() {
        const {min, max} = AppState.looper;
        return ready && AppState.mode === 'realtime' && document.getElementById('check-looper').checked &&
            min >= 1 && min <= max && max <= osmd.Sheet.SourceMeasures.length;
    }
    function sync() {
        const usable = available();
        if (!usable) run = null;
        get('fields').disabled = !usable || !!run;
        get('action').disabled = !usable;
        get('action').textContent = run ? 'End speed training' : 'Enable speed training';
        get('summary').textContent = run ? 'Speed Trainer · ' + run.percent + '%' : 'Speed Trainer';
        let status = usable ? '' : 'Enable a loop in Realtime to train speed.';
        if (run) status = run.percent === run.target ? 'Target reached. Looping at this speed.' :
            run.completed + ' of ' + run.every + ' loops at this speed.';
        if (get('status').textContent !== status) get('status').textContent = status;
    }
    function end() { run = null; sync(); }
    function startPass() {
        // Count-in needs the written tempo at the loop entrance, including an inherited tempo.
        const measures = osmd.Sheet.SourceMeasures;
        let index = osmd.cursor.Iterator.CurrentMeasureIndex;
        while (index > 0 && !measures[index]?.TempoInBPM) index--;
        AppState.baseBpm = measures[index]?.TempoInBPM || 120;
        updateTempo('percent', run.percent);
        run.startTime = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue;
        run.partial = false;
        run.finalTime = null;
        sync();
    }
    const form = document.getElementById('speed-training-form');
    form.addEventListener('input', () => get('target').setCustomValidity(''));
    form.addEventListener('submit', event => {
        event.preventDefault();
        if (run) { end(); return; }
        if (!available() || !form.reportValidity()) return;
        const [start,target,step,every] = ['start','target','step','every'].map(name => get(name).valueAsNumber);
        if (target <= start) {
            get('target').setCustomValidity('Choose a target higher than the starting speed.');
            get('target').reportValidity();
            return;
        }
        run = {start,target,step,every};
        resetPlaybackToLoopStart(false);
    });
    return {
        get active() { return !!run; },
        setReady(value) { ready = value; sync(); },
        sync, end,
        reset() {
            if (!run) return;
            run.completed = 0;
            run.percent = run.start;
            startPass();
        },
        seek() {
            if (run) run.partial = osmd.cursor.Iterator.CurrentEnrolledTimestamp.RealValue !== run.startTime;
        },
        pendingBoundary(time) { if (run) run.finalTime = time; },
        takePausedBoundary() {
            const time = run?.finalTime;
            if (run) run.finalTime = null;
            return time;
        },
        finishPass() {
            if (!run) return;
            if (!run.partial && run.percent < run.target) {
                run.completed++;
                if (run.completed === run.every) {
                    run.percent = Math.min(run.target, run.percent + run.step);
                    run.completed = 0;
                }
            }
            startPass();
        }
    };
})();
