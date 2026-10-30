# Menu numeric controls

## Ownership

- `index.html` owns the original menu rows, numeric/range IDs, labels and bounds.
- `style.css` owns their layout and existing range tracks/thumbs. Its final **Coarse numeric controls** block owns the added button groups and scoped responsive adjustments; earlier menu overrides remain in place.
- `js/numeric-controls.js`, loaded after `trainer-core.js`, wraps nine existing numeric inputs with horizontal minus/plus buttons. It is presentation-only and dispatches a single bubbling numeric `change` event per effective button action. It does not install slider handlers, write preferences, or call the renderer/scheduler.
- `js/trainer-core.js` retains the existing tempo, audio, MIDI boost and zoom validation/application handlers. `js/led.js` retains brightness validation, persistence and output behavior. `js/toolbar-ui.js` owns opening/closing menus.

## Behavior and scope

Sliders and native numeric keyboard arrows retain one-unit steps. Direct numeric entry retains existing integer validation and ranges. Coarse buttons move to the next/previous multiple of five: 73 increases to 75 and decreases to 70. Values clamp to the existing bounds, including Master brightness's minimum 1. Blank entries are left to existing validation; disabled numeric fields disable their buttons too.

Enabled coarse controls: BPM, Speed, metronome volume/level, App Audio volume, MIDI Out volume, MIDI In Boost, score Zoom, and Master LED brightness. Future note brightness uses the same button layout but changes by **1**, within its existing 0–100 range. Its slider and typed entry retain one-unit precision. Looper retains its existing plus/minus, one-measure steps and hold-to-repeat. LED count and transpose remain unchanged. New buttons have ordinary click/keyboard activation, without hold-to-repeat.

Zoom's range `input` updates its preview values only; range `change` applies zoom and rerenders through `applyZoom()`. The adapter preserves these listeners. A Zoom button commits through the numeric field's existing `change` handler once. Do not dispatch both `input` and `change` for a button or introduce rendering on range `input`.

Button targets are 40px square. Existing numeric box widths and range thumbs are retained. Flexible tracks shorten to fit. At widths up to 760px, affected Audio, Display and brightness rows put the label above the slider/buttons; Tempo uses two columns where needed. These rules are scoped to adapted rows, not a global menu redesign.

## Checks

Run `node tests/numeric-controls.cjs` for isolated adapter cases (off-grid steps, bounds, disabled state, blank entry and one numeric commit without changing range handlers). It also executes the actual zoom binding source with mocked rendering/storage: preview input must neither render nor save, and committed changes must render once. These mocked checks do not establish browser layout, actual engraving or hardware correctness.

Follow [Development](DEVELOPMENT.md) for browser/hardware checks. Verify native typing and blur, both buttons, keyboard activation, slider one-unit movement, bounds, disabled controls, persistence and responsive fit. For Zoom, compare the SVG during a drag and after release; score rendering must wait until release. Exercise navigation/feedback after zoom on a built-in score. Actual validation and pending acceptance belong in [Change history](CHANGELOG.md).

## Menu organization and status

Practice retains modes, hand selection/playback and visual feedback, with Hand assignment in an expandable disclosure. Its toolbar button summarizes mode, practiced hands and an enabled loop range by reading the existing controls; it does not write settings or orchestrate playback. The experimental simple synth switch is in More → Audio / Routing, using its original ID and handler. Routing labels are Assigned hands and Accompaniment (performance roles, not engraving staves).

Settings lists MIDI and LED setup before About; Debug is in Advanced. Tempo and Loop appear in More only at widths where their direct toolbar buttons are hidden (1060px and below). Menu top/max-height follows the actual wrapped toolbar bounds so phone controls remain reachable. This only positions menus; OSMD layout/feedback geometry is unchanged.

Validate desktop and phone menus, disclosures, existing setting handlers, summary updates after mode/hand/loop changes and score loads, and keyboard dismissal of save/folder dialogs. Library workflow details live in [Scores and storage](SCORES_AND_STORAGE.md).
