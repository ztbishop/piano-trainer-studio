# Rendering, feedback geometry, and transposition

Sources: [feedback-engine.js](../js/feedback-engine.js), [feedback-debug.js](../js/feedback-debug.js), [trainer-core.js](../js/trainer-core.js), [transpose-engine.js](../js/transpose/transpose-engine.js), and [transpose-ui.js](../js/transpose/transpose-ui.js). Mandatory protections are in [AGENTS.md](../AGENTS.md).

## Ownership and redraw lifecycle

OSMD owns MusicXML interpretation and engraving through its bundled VexFlow renderer. Application geometry adapts to the existing rendered result. It must not become an independent notation layout engine.

`renderScoreAndRefreshGeometry()` calls OSMD render, records the score container width used, invalidates geometry caches, refreshes active expected-note anchors from their original logical notes, and redraws feedback, loop shading, and optional sticky diagnostics. Resize is debounced by 300 ms in the core and only re-engraves when the score container width changed; duplicate/height-only events retain the existing SVG. Explicit load/zoom renders still run normally; zoom is constrained to 50–150%. No custom beam recalculation or second layout pass is introduced.

`clearFeedbackVisualStatePreserveScoring()` clears transient overlays before layout changes without resetting accuracy. This transient-feedback clearing still runs on resize even when engraving is skipped. Anchor refresh changes only `anchor`/`anchors` on existing targets, using their `sourceNotes`; it must not rebuild targets, reset hits/accuracy, consume reservations, or schedule playback. Do not confuse that with `clearVisuals()`, which also cancels tracked visual timers, clears holds/reservations, and updates hardware state.

## Coordinate and identity conventions

- Geometry uses OSMD units converted at `unitsToPx: 10` and SVG coordinates, not raw screen pixels.
- `clientPointToSvg()` converts through the SVG's viewBox and client rectangle. Click-to-measure and cursor comparisons must use that conversion.
- OSMD logical notes are linked to graphical notes by exact `sourceNote` object identity in `getGraphicalNote()`.
- Global staff assignment IDs are one-based; graphical measure staff indexes are zero-based. The core builds a global staff identity map across instruments.
- `GeometryEngine.noteAnchorCache` is a WeakMap keyed by the logical source note. Measure boxes use a separate Map. Both are invalidated after rendering.

`getNoteAnchor()` starts with the graphical notehead's preferred position, resolves candidate SVG noteheads, and caches the anchor. Selection safeguards distinguish side-shifted chord siblings and reject dots, fingering, text, lyrics, and nearby glyphs. Broader neighborhood searches must not override tight same-stem chord identity.

Expected correct feedback receives the note's cached rendered anchor. A playable unison group retains all source-note anchors and paints each distinct `(x,y)` once through `drawExpectedNoteFeedback()`, without changing geometry lookup or the primary matching anchor. Missing anchors retain the existing single fallback; valid anchors do not create extra cursor-derived copies. `resolveFeedbackAnchor()` also contains a cursor/pitch/staff fallback for wrong or unanchored feedback. The fallback keeps cursor X and the rendered staff top, but resolves the active clef from OSMD source instructions at the expected event (or cursor event when no matching expected context exists). `getFeedbackClef()` searches the global staff independently through measure-start, timed staff-entry and preceding measure-end instructions; it does not depend on traversal history, so backward navigation uses the same score-position result. G/F/C clef line and octave displacement determine the top-line diatonic reference. The existing sharp-based chromatic pitch map and staff-routing policy remain unchanged. Unknown/unpitched clefs retain the legacy staff-based approximation. Explicit rendered anchors and numeric exact-Y callers bypass this fallback. Its existence does not authorize replacing correct-note anchors with cursor positions.

## Layers and feedback lifetime

| SVG group | Owner/purpose |
| --- | --- |
| `pt-feedback-group` | Correct/wrong note markers |
| `pt-looper-group` | Measure loop highlighting |
| `pt-debug-group` | Observational sticky debug markers |

Overlay groups disable pointer events. OSMD's score/cursor remain distinct. `renderFeedbackOverlay()` rebuilds from correct history plus released/held incorrect feedback, scoped by the expected-event context. A held wrong marker and a released wrong marker have different lifetimes; changing one must not unexpectedly change grading.

The matching engine retains one playable target per staff/role/pitch while keeping every eligible source-note identity for feedback. See [Practice engine](PRACTICE_ENGINE.md) for scoring and unison semantics.

### Score cursor appearance

The OSMD constructor in `trainer-core.js` retains the standard cursor type and follow behavior, with blue `#4DAEEA` at 0.4 alpha. The visual reference is Guitar Trainer Studio's soft blue cursor. A scoped CSS mask on OSMD cursor images narrows the painted band to approximately 16px at 100% score zoom (8px at 50%, 24px at 150%).

Keep the native cursor image dimensions, position, and center intact: feedback fallbacks and auto-scroll read its bounding rectangle. The mask affects paint only; do not narrow the actual element or shift it to achieve this appearance. OSMD continues to own cursor height, movement, rendering, and zoom. Hand/note/LED colors are independent of this styling. Browser evidence and pending acceptance are recorded in the [change history](CHANGELOG.md#2026-10-20-thinner-blue-score-cursor-no-application-release).

### Appearance

Display offers Light, Soft Light (gray paper), and Dark (charcoal paper/light neutral notation). `js/appearance.js` persists `pt_appearance`; CSS changes surface and neutral SVG ink colors only. No renderer call, CSS inversion, beam recalculation, coordinate transform, or anchor invalidation occurs on a theme change. Authored score colors and feedback/debug/loop overlay ink are excluded from the neutral-ink override. Browser contrast, glyph coverage and protected geometry acceptance must be recorded separately from mocked preference tests.

## Debugging a placement problem

1. Record the score/edition, measure, pitch, staff/voice role, mode, zoom, and whether resize triggered it.
2. Enable the existing feedback Debug control only for the reproduction. It enables matching/event/anchor traces and sticky frames; ordinary debug output is disabled by default.
3. Check whether the expected note exists, whether the exact graphical note is found, and whether an anchor is cached. Missing expectations, wrong anchors, and stale rendered geometry are different failures.
4. Compare preferred and selected SVG candidates before changing rejection/tie-break rules. Preserve chord siblings and non-note-glyph rejection.
5. Retest the known Mozart/Chopin cases in `DEVELOPMENT.md`, plus a small score showing the new issue. Do not use historical replacement JS files as the baseline.

The current successful-load path writes `File loaded successfully.` using `console.error()`. Treat that specific message as misleading logging, not proof of a failed load. It was observed during the review's browser smoke check; see the dated report.

## Transposition data flow

`TransposeUI` detects availability from original/canonical XML, maintains key/semitone controls, invokes `TransposeEngine.transposeXml()`, and reloads through `loadScoreIntoApp()` with `skipTransposeReset: true`. Applying again starts from the original source, avoiding cumulative pitch shifts. Reset reloads that source and resets the controls.

The engine:

- Recognizes score-partwise/timewise roots for availability and parses with the browser DOMParser.
- Detects an initial key signature and offers grouped major/relative-minor signature presets.
- For key mode, chooses the nearest semitone shift in the range -6 through +6; semitone mode uses the selected integer shift.
- Iterates parts/measures and rewrites pitched note step/alter/octave and harmony root/bass.
- Optionally rewrites key signatures and selects sharp/flat spelling tables. Notes are not re-engraved by custom code; OSMD renders the resulting XML.

Transforming pitch changes the score intentionally, but durations, ties, slurs, and beam layout are not intended transformation targets. Ordinary MXL rendering continues to use original compressed data; transposed output is explicit transformed MusicXML.

## Supported assumptions and open edges

- The transformation implementation iterates part children that are measures. Recognizing a timewise root is not evidence of complete timewise transformation support.
- Source detection and spelling use simplified key/pitch-class logic. Mid-score key changes, multiple staff-specific keys, explicit accidental elements, enharmonic spelling, instrument transposition, and microtonal alters need real-score fixtures before broad compatibility claims.
- `rewritePitchNode()` calculates absolute pitch from octave, natural step and the unwrapped integer alter before deriving the new pitch class/octave. This preserves B-sharp/C-flat and double-accidental octave crossings. Harmony remains pitch-class-only; key/spelling selection is unchanged. The original octave-loss defect is fixed; see [validation](CHANGELOG.md#2026-10-20-enharmonic-transpose-octaves-no-application-release), `tests/transpose-octaves.cjs` and the [fixture instructions](../tests/fixtures/README.md). Integer parsing/microtonal limitations and the existing output-range behavior are unchanged.
- A transposed save stores the transformed score, not a persistent original/transform history. Reopening it establishes a new original source.
- Assignment identity normally remains tied to the preserved canonical source during a transpose session. Verify hand roles when saving/reopening transformed scores.

Changes here require affected rendering and transpose checks from [Development](DEVELOPMENT.md). The [review](CODE_REVIEW_2026-10-20.md) records current evidence and priorities.
