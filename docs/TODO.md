# Piano Trainer Studio to-do list

This backlog tracks requested enhancements and outstanding review findings. Adding an item records follow-up work; it does not authorize implementation. Follow [AGENTS.md](../AGENTS.md), inspect the current code, and agree on the scope when starting an item. Mark completion only after recording actual validation and pending checks in [CHANGELOG.md](CHANGELOG.md).

**Status as of October 20, 2026:** UI-001/UI-002 owner acceptance is complete. FIX-003/FIX-004 are implemented with focused regressions and browser validation; further device/timing acceptance remains pending as listed below. Other review findings remain outstanding. Reproduced issues, conditional risks, and maintenance recommendations have different evidence levels; do not present them all as proven live-user failures.

## Requested UI enhancements

### UI-001: One-step sliders with coarse numeric buttons and free numeric entry

- [x] Revised with user approval October 20, 2026: keep sliders at **1**, retain valid typed integers, and add horizontal **minus/plus** buttons moving to the previous/next multiple of five (73 → 70/75).
- [x] Implement for BPM, Speed, metronome volume/level, App Audio volume, MIDI Out volume, MIDI In Boost, Zoom and Master LED brightness. Preserve Master minimum 1. Leave Looper/hold-to-repeat, transpose and Future brightness unchanged.
- [x] Follow-up clarification October 20: Future note brightness also gets matching horizontal minus/plus buttons, with **one-unit** steps and the existing 0–100 bounds. This supersedes leaving that row unchanged.
- [x] Reuse original setting handlers and preserve Zoom preview-on-input/apply-on-change. Document [control ownership and scoped layout](UI_CONTROLS.md).
- [x] Focused adapter/zoom-source regressions and Live Server UI smoke checks completed; see the [change record](CHANGELOG.md#2026-10-20-coarse-numeric-menu-buttons-no-application-release) for exact coverage and limits.
- [x] Owner confirmed usual-display layout and physical audio/MIDI/WLED acceptance complete on October 20, 2026. This is owner-reported acceptance, separate from the earlier automated/browser smoke checks.

### UI-002: Thinner blue score cursor, matching Guitar Trainer Studio

- [x] Implemented October 20, 2026. The user's Guitar Trainer Studio screenshots/current local CSS supersede the earlier Piano Marvel reference: blue **#4DAEEA**, soft edges, approximately **16px** painted width at 100% score zoom, scaling with score zoom.
- [x] Retain OSMD's standard cursor geometry and follow behavior; narrow only its paint with a CSS mask. No changes to navigation, timing, engraving, feedback anchors, or hand/note/LED color rules.
- [x] Live Server browser smoke checks used built-in Mary Had a Little Lamb, Fur Elise Easy Piano, and Minuet in G Major: score zoom, narrow/desktop viewports, resize/beaming, all three mode appearances, virtual input/feedback, seek/reset, a Realtime loop, and a backward repeat. See [actual validation and limitations](CHANGELOG.md#2026-10-20-thinner-blue-score-cursor-no-application-release).
- [x] Owner confirmed visual/device acceptance and remaining protected geometry/timing checks complete on October 20, 2026. This acceptance covers UI-002; separately recorded review defects remain separate.

## Outstanding reproduced issues

Evidence and suggested fix boundaries are in the [October 20 code review, findings F1–F6](CODE_REVIEW_2026-10-20.md). These were isolated source/control-flow reproductions, not full browser/MIDI acceptance tests. The optional Node server findings do not describe VS Code Live Server.

- [ ] **FIX-001 / F1 — Handle malformed URL encoding in the optional Node server.** Return a controlled error instead of letting a request terminate the process; verify a subsequent valid request succeeds.
- [ ] **FIX-002 / F2 — Enforce real site-root containment in the optional Node server.** Reject traversal into sibling paths sharing the site's name prefix; test Windows/path-separator cases.
- [x] **FIX-003 / F3 — Preserve the final required-note gate at Wait loop boundaries.** Wait/Follow now require the entire final practiced group before restarting. Realtime and boundaries without required notes retain timed looping. See the [baseline reproduction, validation and limitations](CHANGELOG.md#2026-10-20-final-loop-note-gate-no-application-release). The owner authorized retaining this fix after clarifying the observed behavior.
- [ ] **FIX-003 acceptance:** physical MIDI/audio/LED and measured metronome/final-note sustain; browser loop count-in, early-input chords, rests/hidden notes, long ties, original MXL and complex repeats/endings remain pending. Mocked coverage does not establish these real-score/device cases.
- [x] **FIX-004 / F4 — Prevent callbacks from a prior playback run from reviving after pause/restart.** Implemented run-owned count-in/advance timers, frames, score-note releases and async startup cancellation. Focused regressions and Live Server smoke checks passed; see the [change record](CHANGELOG.md#2026-10-20-playback-callback-ownership-no-application-release).
- [ ] **FIX-004 acceptance:** physical MIDI/audio/LED cleanup, measured metronome/count-in synchronization, real-score loop count-in/repeats/endings/ties and full Wait/Follow early-input progression remain pending for this lifecycle change. UI acceptance above predates this patch.
- [ ] **FIX-005 / F5 — Correct enharmonic octave-boundary transposition.** B-sharp 4 plus one semitone produced C-sharp 4 rather than C-sharp 5. Cover C-flat/B-sharp, both directions, double accidentals, and actual OSMD reload/playback.
- [ ] **FIX-006 / F6 — Define update/manifest behavior for nested hosting and local installs.** Fix or explicitly scope root-relative URLs; distinguish remote release detection from checking a local manifest. Verify localhost, the custom-domain root, and the supported GitHub Pages subpath.

## Investigations requiring further evidence

The [review's conditional risks/design questions](CODE_REVIEW_2026-10-20.md) hold the detailed rationale. Reproduce the real score/device case before choosing a fix.

- [ ] **INV-001 — Multi-segment ties.** Inspect actual bundled OSMD topology with a three-segment tie fixture; the synthetic shared-array probe summed only two segments.
- [ ] **INV-002 — Same-pitch unison voices and distinct anchors.** Reconcile current staff/role/pitch deduplication with preserving distinct XML-note anchors; decide playable-target versus visual-marker identity.
- [ ] **INV-003 — Assignment identity when canonical XML is unavailable.** Prevent unrelated affected scores from sharing the empty-source fingerprint; verify MXL extraction/conversion fallback and voice metadata behavior.
- [ ] **INV-004 — Wrong/unanchored-note feedback after clef changes.** Exercise the cursor/staff-index fallback on clef changes and multiple instruments before altering the protected geometry pipeline.
- [ ] **INV-005 — Smaller-keyboard pitch endpoints.** Verify actual supported device endpoints against symmetric trimming; determine whether explicit lowest/highest-key configuration is needed.
- [ ] **INV-006 — MIDI holds, disconnects, echo filtering, and output switching.** Test unplug while held, input/channel changes, identical pitches on multiple channels, legitimate input matching recent output, and old/new output note-off destinations.
- [ ] **INV-007 — Storage failure and backup validation.** Define behavior for unavailable/quota-limited storage, malformed/unknown-version backups, and duplicate additive imports while preserving existing data/compatibility.
- [ ] **INV-008 — Complex/timewise transposition support.** Verify timewise documents, multiple staff keys, explicit accidentals, and microtonal inputs before broad compatibility claims.

## Testing and maintenance recommendations

These are recommendations, not completed fixes or authorization for a broad refactor. Detailed context is in the [review](CODE_REVIEW_2026-10-20.md).

- [ ] **ENG-001 — Establish focused automated regressions.** Prioritize the reproduced loop gate, callback ownership, transpose octave cases, timing math, and server request/path handling. Read-only review probes are not an application regression suite.
- [ ] **ENG-002 — Add redistributable minimal MusicXML fixtures.** Cover repeats/endings, one-hand gaps, reused part voice IDs/cross-staff voices, hidden notes, unisons, clef changes, dots, and long tie chains; record actual browser/hardware acceptance separately.
- [ ] **ENG-003 — Consolidate duplicate MIDI output globals after tests exist.** Preserve current channel, velocity, echo, routing, and note-off behavior when removing load-order-dependent declarations.
- [ ] **ENG-004 — Improve logging and review stale/unused diagnostics.** Log successful loads at an appropriate level; investigate the unused synth-cleanup reference, legacy help fragments, and misleading scaffold comments before removing anything.
- [ ] **ENG-005 — Inventory vendor provenance and referenced notices.** Record exact bundled sources/versions/modifications and review missing adjacent notice files named by bundle banners before updating vendors.
- [ ] **ENG-006 — Align helper package/runtime version guidance.** Resolve the 0.1.0 package versus 0.1.2 health-report distinction and document any protocol/release implications.

## Backlog maintenance and longer-term ideas

During each authorized code update, review related entries, add material newly discovered follow-ups, and update the relevant developer docs. Record completed work with validation and explicitly pending browser/MIDI/hardware acceptance. Keep historical review evidence intact; link the actual fix/change record rather than rewriting an old observation as if it never occurred.

Descriptive commits and deliberate releases are the ongoing workflow documented in [CHANGELOG.md](CHANGELOG.md), not a pending repair to old Git history. Longer-term scales, triads, arpeggios, chord-progressions, and bundled-runtime ideas remain proposals in [Project context](PROJECT_CONTEXT.md). They require a separate scoped request before implementation.
