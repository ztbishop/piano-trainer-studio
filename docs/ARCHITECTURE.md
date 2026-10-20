# Architecture

Current project rules: [AGENTS.md](../AGENTS.md). Workflow and regression checks: [DEVELOPMENT.md](DEVELOPMENT.md). Capabilities and decisions: [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

Use the [developer index](README.md) to route a task to focused subsystem docs. Verified against local revision `b40e412` during the October 20, 2026 review; findings are recorded separately in [the dated review](CODE_REVIEW_2026-10-20.md).

## Application model and dependencies

The frontend is static HTML/CSS/JavaScript with ordered classic scripts and shared globals, principally `AppState`. There is no frontend build step, framework, account service, or required application backend. OSMD uses VexFlow for engraving; Tone.js provides audio and metronome scheduling. Core libraries, Salamander piano samples, and webmscore/WASM conversion assets are bundled locally.

`index.html` reads `version.json` during bootstrap and applies version query strings to app assets. It loads Tone.js and OSMD first, then state, transpose engine/UI, toolbar, library/UI, LEDs, MIDI, import conversion, feedback/debug, timing, hand assignment, and finally the trainer core. Preserve dependency order: earlier modules can define callbacks that are invoked only after core initialization.

## Current structure

- `/assets/js` = local third-party vendor libraries kept separate for offline use
- `/assets/audio` = static audio assets such as Salamander samples
- `/assets/vendor/webmscore` = browser-side score converter and WASM/data assets
- `/js` = extracted app modules with focused ownership
- `js/trainer-core.js` = remaining integration layer for rendering lifecycle, playback scheduling, metronome flow, repeat/jump handling, and cross-module orchestration
- `/docs` = architecture notes and development notes

## Current modules

- `js/trainer-state.js` = shared state and persisted preference helpers
- `js/trainer-timing.js` = shared timing math for traversal waits, measure remainder checks, and playback scheduling inputs
- `js/toolbar-ui.js` = toolbar/menu shell
- `js/scores-ui.js` = score browser UI shell
- `js/score-library.js` = score library shell
- `js/led.js` = LED simulator, calibration, and hardware/WLED output
- `js/midi.js` = WebMIDI setup, selectors, and connection state wiring
- `js/midi-import.js` = lazy-loaded webmscore conversion wrapper for MIDI/MuseScore/Guitar Pro imports
- `js/hand-assignment.js` = score-specific staff/voice performance roles, suggestions, and persistence
- `js/transpose/transpose-engine.js` = MusicXML pitch/key transforms before rendering
- `js/transpose/transpose-ui.js` = transpose controls and reload/reset coordination
- `js/feedback-engine.js` = production feedback-note matching, anchor resolution, and overlay placement
- `js/feedback-debug.js` = developer-only feedback diagnostics and sticky debug labels
- `js/trainer-core.js` = remaining trainer core and orchestration
- `quick-start.html` and `js/quick-start-content.js` = supplementary help content; neither is referenced by the current index script chain. Current in-app help markup is in `index.html`.
- `local-web-server.js` = optional Node static server and LAN connection-info page
- `helper/server.js` = optional transport-only localhost WLED HTTP/DDP bridge
- `debug-overlay.js` = supplementary root diagnostic file; not loaded by the current app index. Do not assume it owns the production feedback debug layer.
- `style.css` and `index.html` = actual interface/layout/controls and static welcome content; toolbar code owns panel state rather than the entire markup

## Startup and integration boundaries

1. The inline index bootstrap synchronously reads the relative version manifest, chooses the newest of fallback/manifest/URL/stored versions, and writes CSS/vendor script tags.
2. State initialization reads/seeds storage. Most modules register listeners at evaluation time because control markup already exists; transpose/hand-assignment also perform deferred setup. Keep this timing in mind when moving script tags.
3. Core constructs OSMD with `autoResize: false`, Tone sampler/synths, timing/visual state, and the remaining control listeners.
4. Core boot initializes virtual keys/LEDs, applies stored preferences, requests MIDI, renders output/status, applies the mode, and starts the animation-frame LED output loop. The library initializes/loads its starter data through score-drawer refresh rather than a separate backend.
5. User score selection goes through the existing load lifecycle. There is no automatically loaded current song at first boot.

Classic script declarations share a global lexical environment; not every top-level `const`/`let` is a property on `window`. Explicit `window.*` APIs coexist with global functions. Duplicate global function declarations can be replaced by later scripts: MIDI output helpers are an existing example. Script extraction/reordering therefore needs integration tests, not just independent syntax checks.

There is a web manifest but no registered service worker in the reviewed app scripts. Do not assume a complete offline/PWA caching architecture.

## Core navigation map

The core intentionally still spans several responsibilities. Use function names to locate the affected seam rather than extracting unrelated code during a feature fix.

| Area | Useful entry points | Detailed guide |
| --- | --- | --- |
| Mode/default/routing UI state | `getCurrentModeSettings`, `syncActiveHandStateFromMode`, `applyPersistedTrainerAndSettingsPreferences`, `applyModeSettings` | [Practice](PRACTICE_ENGINE.md), [Storage](SCORES_AND_STORAGE.md) |
| Audio/context/metronome | `applyToneLatencyProfileForMode`, `ensurePianoSamplerLoaded`, `scheduleMetronomeForPlaybackWindow`, `startWaitModeMetronome` | [MIDI/audio/LED](MIDI_AUDIO_LED.md) |
| Score/MXL lifecycle | `readScoreFile`, `extractMusicXmlFromMxl`, `getCanonicalMusicXmlForTranspose`, `getOsmdLoadPayload`, `loadScoreIntoApp`, `initSongUI` | [Scores](SCORES_AND_STORAGE.md) |
| Staff and hand resolution | `rebuildGlobalStaffIdentityMap`, `getResolvedStaffAssignmentIdFromNote`, `HandAssignment.roleForNote` | [Scores](SCORES_AND_STORAGE.md) |
| Preview/early input | `ensureLedPreviewTimelineBuilt`, `findSingleHandPracticeTimelineWindow`, `tryReserveSingleHandEarlyGrace`, `tryReserveRealtimeUpcomingHeldNote` | [Practice](PRACTICE_ENGINE.md) |
| Key/audio/output state | `triggerVirtualKey`, `renderVirtualKeyboard`, `schedulePlaybackForDestinations`, `startVisualSustains`, `clearVisuals` | [MIDI/audio/LED](MIDI_AUDIO_LED.md) |
| Transport/navigation | `startPlaybackFromToolbar`, `doCountInAndStart`, `stopPlaybackState`, `checkWaitModeAdvance`, `playbackLoop` | [Practice](PRACTICE_ENGINE.md) |
| Render/zoom/seek integration | `renderScoreAndRefreshGeometry`, resize handler, `applyZoom`, canvas click handler | [Rendering](RENDERING_AND_TRANSPOSE.md) |

## Data and event flow

1. A direct file or library entry supplies score data; converter formats become MusicXML through `MidiImport`.
2. `loadScoreIntoApp()` resets playback, keeps the original source, loads OSMD, refreshes rendered geometry, and initializes hand assignment.
3. Ordinary MXL rendering uses the original compressed source. Separate extracted XML supports assignment/transposition; converter fallback for that XML must not replace the ordinary render payload.
4. The OSMD cursor iterator supplies note events. Hand assignment resolves performance roles; feedback builds expected-note groups and rendered-note anchors.
5. MIDI and virtual-key input pass through `triggerVirtualKey()` into matching, scoring, audio routing, and visual/LED state.
6. The trainer core advances the cursor according to practice mode, uses `PTTiming` for waits, and schedules audio/metronome/output cleanup.

## Hand assignment boundary

Display staff and clef remain owned by OSMD. `HandAssignment` resolves left/right/accompaniment/ignore roles by staff or part-scoped voice identity, with staff fallback. Assignment changes pause playback and rebuild transient matching/preview state. Do not infer performance hand solely from a note's current display staff or clef. See `PROJECT_CONTEXT.md` for defaults and persistence behavior.

## Persistence and external services

- IndexedDB `pianoTrainerLibrary` stores score records and folders. Raw score data is retained for reopening and library backups.
- localStorage stores preferences, calibration, version overrides, starter-library state, and content-fingerprinted hand assignments. Settings backups include assignment entries.
- Storage is browser-origin-specific; changing hostname/port or browser creates a separate library/settings context. There is no automatic cloud sync.
- `led.js` sends HTTP JSON to WLED directly or uses the localhost helper for DDP. The helper owns transport, not practice decisions. LAN app hosting does not expose the helper.
- Cloudflare and Google Analytics are external scripts in `index.html`; `README.html` also loads an external Markdown renderer. Bundled core assets do not guarantee every help/online feature works offline.


## Timing module boundary

- `js/trainer-timing.js` is shared infrastructure for all practice modes
- It answers **how long** structural traversal should wait
- It must not directly move the cursor, render feedback, or update UI
- `trainer-core.js` remains the orchestrator that decides **when** each mode advances
- Realtime structural jumps should use current-measure remainder timing instead of first-note fallbacks or raw iterator deltas

## Why `trainer-core.js` stays together for now
The remaining file still owns the most timing-sensitive systems:
- playback scheduling
- repeat/jump traversal
- metronome behavior and drift fixes
- count-in handoff
- score render lifecycle coordination

Keeping those areas together is safer while playback/navigation behavior is still being stabilized.

Realtime uses an accumulated anchor with iterator-driven traversal and browser timers. Wait mode depends on satisfied input; Follow Me adapts remaining waits to player timing. A monotonic/hybrid scheduler was discussed historically but is not the current implementation or an authorized refactor.

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

## First-run preferences

When displayed defaults differ from actual behavior, inspect persisted preference helpers and first-run seeding. A missing localStorage value must not accidentally become numeric zero when a nonzero default is intended.

