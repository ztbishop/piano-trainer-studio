# Architecture

## Current structure
- `/assets/js` = local third-party vendor libraries kept separate for offline use
- `/assets/audio` = static audio assets such as Salamander samples
- `/js` = extracted app modules with focused ownership
- `trainer-core.js` = remaining integration layer for rendering lifecycle, playback scheduling, metronome flow, repeat/jump handling, and cross-module orchestration
- `/docs` = architecture notes and development notes

## Current modules
- `js/trainer-state.js` = shared state and persisted preference helpers
- `js/toolbar-ui.js` = toolbar/menu shell
- `js/scores-ui.js` = score browser UI shell
- `js/score-library.js` = score library shell
- `js/led.js` = LED simulator, calibration, and hardware/WLED output
- `js/midi.js` = WebMIDI setup, selectors, and connection state wiring
- `js/feedback-engine.js` = production feedback-note matching, anchor resolution, and overlay placement
- `js/feedback-debug.js` = developer-only feedback diagnostics and sticky debug labels
- `trainer-core.js` = remaining trainer core and orchestration

## Why `trainer-core.js` stays together for now
The remaining file still owns the most timing-sensitive systems:
- playback scheduling
- repeat/jump traversal
- metronome behavior and drift fixes
- count-in handoff
- score render lifecycle coordination

Keeping those areas together is safer while playback/navigation behavior is still being stabilized.

## Fragile systems
- Feedback-note anchor positioning and resize stability
- Beam/layout rendering stability
- Playback repeat/jump timing
- Metronome sync and drift behavior
- LED shared frame pipeline

## Commenting standard
- Minimal HTML comments only when script order is non-obvious
- Short ownership header comments at the top of app JS files
- Targeted warning comments above fragile functions only
- Larger structure notes belong in `/docs`, not in `index.html`

## Debug rule
- `js/feedback-debug.js` is developer-only diagnostic tooling
- It must not own production feedback matching or anchor-placement rules

## Rename note
- `app.js` was renamed to `trainer-core.js` once the safer module boundaries were extracted
- The rename is organizational only; playback/rendering logic remains together on purpose
