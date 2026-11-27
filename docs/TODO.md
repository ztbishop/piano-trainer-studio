# Piano Trainer Studio to-do list

Reconciled October 30, 2026 against current source and the [change history](CHANGELOG.md). This is an outstanding-work list, not a list of known failures. An unchecked test means evidence is still needed. Recording an item does not authorize implementation; follow [AGENTS.md](../AGENTS.md).

## Confirmed problems and limitations

The short-hairpin boundary defect is now fixed for valid source XML, with the four reported Chopin spans verified in captured playback. Malformed or ambiguous source parts retain the documented OSMD fallback. See [source recovery evidence](DEVELOPMENT.md#source-hairpin-boundary-checks).

The previously reproduced runtime defects FIX-001–FIX-007 have implementations and recorded regression results. Their remaining device/score acceptance is consolidated below; they are not outstanding unfixed bugs. This does not establish that the app has no other defects.

## Things still to test or investigate

- Evaluate the optional [PDF beat guide](COMPANION_PDF.md#beat-guide-trial-and-guitar-trainer-handoff) during physical-piano practice. Chrome checks cover Arirang's first-bar segments, Wait wrong-key release and correction, Realtime success and loop reset. Check whether the colors and approximate positions are helpful on dense or irregularly spaced passages before requesting a Guitar Trainer port.

### Companion scores and practice workflows

- [x] **Review a whole PDF scan at once.** Numbered boxes appear across all printed pages before saving. A single acceptance saves the draft, including optional page corrections. [Workflow](COMPANION_PDF.md#correct-the-printed-boxes)

- [x] **Forget markings for one score/PDF pair.** The PDF menu clears the active pair’s boxes and repeat overrides and reopens the marking editor. [Workflow](COMPANION_PDF.md) · [Regression checks](DEVELOPMENT.md#companion-pdf-checks)
- [x] **Full-height companion PDF reader.** Page navigation, notation, marking and repeat-visit selection are in Scores → PDF. The browser regression opens the editor on page two and checks the full reading area at desktop and phone widths. [Reader workflow](COMPANION_PDF.md)
- [x] **Companion PDF with digital score.** Local MuseScore PDF/MIDI and MusicXML regression covers paired staves, a resting hand, editable boxes, range and single-visit corrections, an unmapped passage, second-pass seeking, loops and Wait grading. [Acceptance procedure](DEVELOPMENT.md#companion-pdf-checks)
- [ ] **Owner acceptance.** Try a publisher's piano part with printed first and second endings and an imperfect scan. Check touch editing on iPad and play with physical MIDI. Review the extra suggested box in the three-measure Guitar Pro smoke fixture. [Observed results](DEVELOPMENT.md#companion-pdf-checks)
- [ ] **Manual recording sync.** If a piano recording becomes part of practice, test a small tap/anchor workflow against a repeated passage before considering the full Guitar Trainer editor.
- [ ] **Standalone PDF + recording.** Track separately as an optional tap-timed, ungraded Realtime workflow without a digital score.
- [ ] **Score-based Auto-sync.** Evaluate separately on actual piano recordings after manual recording mapping works.
- [x] **Looper Speed Trainer.** Realtime training increases the tempo after complete transport loops and holds at the target. [Behavior](PRACTICE_ENGINE.md#speed-trainer) · [Browser regression](DEVELOPMENT.md#speed-trainer-checks)
- [x] **Arirang opening measure and Speed Trainer editing.** Owner corrected the missing first-visit mapping. The reader now offers a repair for an unmapped box and reveals the mapped start on Reset. Verified first-measure seeking and looping on the local MIDI/PDF, plus typing and visible step buttons in the trainer. [Browser checks](DEVELOPMENT.md#companion-pdf-checks)

Reproduce the relevant case before deciding on a fix. The [October 20 review](CODE_REVIEW_2026-10-20.md#conditional-risks-and-design-questions) records the original hypotheses; the [development checklist](DEVELOPMENT.md#manual-regression-checklist) defines protected behavior.

### Score and input investigations

- [ ] **Feedback notehead comparison acceptance.** The owner reports occasional red/green markers over nearby dots; that exact case has not been reproduced. Debug now compares the unchanged production resolver with indexed rendered noteheads. The isolated preview reproduced a 29.91-SVG-unit disagreement in bundled Waltz in A Minor, app measure 13. Review that case, the reported score and the historical Mozart/Chopin dot, ornament and shifted-chord cases before proposing any production resolver change. A difference is diagnostic evidence, not an automatically confirmed defect; fixed-size marker overlap is a separate possibility. See [comparison semantics](RENDERING_AND_TRANSPOSE.md#observational-notehead-comparison) and [validation](DEVELOPMENT.md#feedback-comparison-checks).

- [ ] **INV-005 — Physical smaller-keyboard acceptance.** All eight existing ranges now have isolated endpoint/input/LED tests; current-event expansion/shrink defects were reproduced and fixed. Compare a real smaller device's MIDI endpoints with the [documented ranges](MIDI_AUDIO_LED.md#virtual-input-and-playable-range). Physical smaller-keyboard/WLED acceptance remains unperformed; the owner's 88-key A–C instrument fits the full-range model. Endpoint learning/custom ranges remain optional pending a concrete mismatch, not a required new control.
- [ ] **INV-006 — MIDI connection changes.** Test unplugging while held, input/channel changes, identical pitches on multiple channels, legitimate input near echoed output, and note-off delivery after output switches.
- [ ] **INV-008 — Complex transposition.** Test timewise documents, multiple staff keys, explicit accidental elements and microtones. The enharmonic octave fix does not establish these cases.

### Acceptance of implemented changes

Each item consolidates checks previously repeated under several updates. Prior passing checks remain valid for their recorded scope; these are the remaining cases, not instructions to rerun everything after every update.

- [ ] **WLED palette acceptance on the strip.** Try default and custom hand, black-key, active, wrong and calibration colors on physical hardware. Compare expected and future notes at normal viewing distance and brightness, especially dim future tints. Browser frame checks cover the editor, reset and saved settings. Physical HTTP/DDP output and shade acceptance remain pending. [Behavior](MIDI_AUDIO_LED.md#optional-black-key-colors) · [Validation](DEVELOPMENT.md#black-key-led-color-checks)

- [ ] **Expressive playback acceptance.** Staccato, ordinary accents, fixed dynamics and source-corrected crescendos/diminuendos are implemented under the existing default-off option. Resolver/integration tests, 82 source-parser and 77 loader checks, 1,239 browser checks and 20 real-sample audio checks passed; see [source recovery validation](DEVELOPMENT.md#source-hairpin-boundary-checks). The owner confirmed audible staccato, `pp` and return to forte in Chopin's Nocturne Op. 9 No. 2. After the requested accent increase to +24 (G5 80 versus nearby 56, approximately 3.10 dB with the current sampler), the owner tentatively reported more noticeable accents but remained unsure about crescendos. This strength is an app tuning convention. The new bundled [comparison demo](MIDI_AUDIO_LED.md#expression-comparison-demo) has explicit pp→f→pp targets and passed 897 captured-output browser checks; successive targetless ramps are bounded and repeated playback does not accumulate extra changes ([evidence](DEVELOPMENT.md#expressive-comparison-demo-checks)). Pending: listening acceptance of the demo's ramps and accents, physical MIDI/VST response, broader score/release balance, and ambiguous staff/voice dynamic scope. These are unverified acceptance checks. Pedal, rubato and advanced articulation remain outside this feature.

- [ ] **Playback and feedback (FIX-003/FIX-004 and later regression acceptance).** Real-score loop count-in, final-note sustain, early-input chords, rests/hidden notes, long ties, repeats/endings, and pause/restart/load during count-in; measured metronome synchronization and physical MIDI/audio/LED cleanup. Include original MXL and protected side-shifted chord, ornament, lead-in and complex clef-change geometry cases (including real C/octave/transposing-instrument clefs). Simple-score browser tests and mocked regressions have passed; use [practice](PRACTICE_ENGINE.md) and [rendering](RENDERING_AND_TRANSPOSE.md) guidance for the remaining cases.
- [ ] **Transformed scores (FIX-005 acceptance).** Physical playback/listening and an end-to-end transpose → save → reopen → hand assignment → loop test. Existing pitch regressions and OSMD/virtual-input checks are recorded in the [transpose update](CHANGELOG.md#2026-10-20-enharmonic-transpose-octaves-no-application-release).
- [ ] **Device settings (FIX-007 and later preference changes).** Verify audible saved MIDI output volume on startup/reconnect, and current audio/MIDI/WLED preferences and routing on actual hardware. No-device tests do not establish audible/device behavior. See [MIDI/audio/LED guidance](MIDI_AUDIO_LED.md).
- [ ] **Import and browser workflows.** Real converted-format imports and a disposable-data library/settings transfer between browser profiles/origins; verify the current app through VS Code Live Server. Isolated IndexedDB merge/rollback tests and Node-served browser checks already passed. Do not mutate or clear the user's library for testing. See [storage guidance](SCORES_AND_STORAGE.md).
- [ ] **Hosting and devices (remaining FIX-001/FIX-002/FIX-006 acceptance).** Check Mac launchers, remote LAN/iPad access, deployed assets, and install/relaunch with existing shortcuts. The v1.4.0 local Chrome check verified the displayed version and asset URLs with the manifest available and with its request blocked. The Windows launcher was exercised on October 30. [Hosting guidance](DEVELOPMENT.md#hosting-and-version-display)

### Storage limits (remaining INV-007 investigation)

- [ ] **Physical limits and interrupted access.** Actual quota exhaustion, permission revocation during settings rollback, extreme duplicate-heavy libraries and memory pressure. Use disposable profiles/origins; never fill the user's shared storage quota or clear site data. Completed coverage includes 3,200 real IndexedDB entries, 10,000-entry planner fixtures, bounded quota-error rollback/retry, opaque-origin denial, and full-app blocked-storage startup/control checks. See [stress results](CHANGELOG.md#2026-10-30--large-library-and-storage-failure-checks-no-application-release) and [unavailable-storage recovery](CHANGELOG.md#2026-10-30--unavailable-storage-recovery-no-application-release). Simulated failure is not physical quota testing.

## Optional improvements

These are maintenance or product recommendations, not confirmed runtime failures or approved feature work.

- [ ] **Regression fixtures and remaining coverage (ENG-001/ENG-002).** Expand timing-math coverage and add redistributable MusicXML fixtures for repeats/endings, one-hand gaps, reused part voice IDs/cross-staff voices, hidden notes, unisons, clef changes, dots and long ties. The original request to establish focused regressions is fulfilled for loop gating, callback ownership, transpose octaves and server handling; see [existing checks](DEVELOPMENT.md#checks-available-today).
- [ ] **MIDI helper consolidation (ENG-003).** Consider removing duplicate global output helpers after channel, velocity, echo, routing and note-off coverage protects their behavior.
- [ ] **Diagnostic cleanup (ENG-004).** Correct misleading success-at-error-level logging; review the apparently unused synth-cleanup reference, legacy help fragments and stale comments before removing anything.
- [ ] **Vendor inventory (ENG-005).** Record bundled versions, sources, modifications and referenced notice files before vendor updates. The historical packaging observation is not a legal-compliance determination.
- [ ] **Helper version guidance (ENG-006).** Reconcile package/runtime version reporting and document app versus helper/protocol version policy.

Maintenance evidence: [review recommendations](CODE_REVIEW_2026-10-20.md#maintenance-recommendations). Longer-term scales, triads, arpeggios, chord progressions and bundled desktop runtimes remain [unapproved product ideas](PROJECT_CONTEXT.md#future-ideas-not-implementation-requests).

## Completed or superseded work

- Library PDF storage and backups now retain score-specific boxes and repeat mappings. The version-1 backup regression checks all bundled entries without assuming a fixed demo count. [Library PDF checks](DEVELOPMENT.md#companion-pdf-checks)

- Matched Guitar Trainer's companion attachment flow. A new pair starts in Mark measures for drawing or optional detection. A pair with saved boxes returns to reading view. [Practice guide](COMPANION_PDF.md)

- Ported whole-score PDF detection and review from Guitar Trainer `85803aa`, including numbering checks, hand-mark protection and saved-map reopening. [Workflow](COMPANION_PDF.md#correct-the-printed-boxes) · [Browser checks](DEVELOPMENT.md#companion-pdf-checks)

- Corrected the uneven Scores action rows after adding Attach PDF. [Layout and viewport checks](CHANGELOG.md#2026-11-24--scores-menu-layout)

Keep detailed implementation and validation in [CHANGELOG.md](CHANGELOG.md), rather than repeating completed checklists here.

- **Expressive comparison demo:** added an original eight-measure study to permanent Demo Scores with staccato, accents and explicit crescendo/diminuendo targets. Playback strengths remain unchanged; listening acceptance remains above. See [validation](DEVELOPMENT.md#expressive-comparison-demo-checks).
- **Short hairpin boundaries:** separate source metadata now recovers all 17 Chopin wedges, including the four previously collapsed spans. Original MXL rendering, note/grace/cue data and engraving remain unchanged; off/on mode comparisons passed. See [validation and remaining limits](DEVELOPMENT.md#source-hairpin-boundary-checks).
- **UI-001/UI-002:** numeric controls and thinner cursor implemented; owner acceptance recorded October 20. That acceptance does not cover later playback patches.
- **FIX-001–FIX-007:** server request/path protection, final-loop note gating, playback callback ownership, enharmonic octave transposition, deployment-relative paths and saved MIDI output volume implemented. Remaining acceptance is listed once above.
- **October 30 requests:** updater removal/release link, permanent demos, appearance, downloads/folder exports/search, launcher alignment, import feedback, Save a copy/current status, menu cleanup and duplicate-aware backup merging implemented.
- **INV-001:** real bundled OSMD scores confirmed truncated multi-segment tie lengths; ordered traversal is fixed with Node and parsed-score playback/feedback regressions. Audible/device sustain and complex timing acceptance remain above. See [evidence](CHANGELOG.md#2026-10-30--multi-segment-tie-duration-no-application-release).
- **Resize geometry:** confirmed unnecessary same-width redraws move rest glyphs and active targets retain stale coordinates after zoom. Width-gated resize and source-note anchor refresh address these cases; see [validation and limits](CHANGELOG.md#2026-10-30--resize-geometry-and-pending-feedback-anchors-no-application-release). Broader geometry/hardware acceptance remains above.
- **INV-002:** same-pitch playable groups now retain all cached feedback anchors while keeping one credit/penalty. Real-score and isolated regression evidence, plus remaining geometry/hardware limits, are in [the change record](CHANGELOG.md#2026-10-30--unison-feedback-and-practice-button-no-application-release).
- **INV-004:** clef-change wrong/unanchored feedback now uses active score-position clefs rather than assuming staff 1 is treble and other staffs are bass. Real-score comparisons and input coverage are recorded in [the change history](CHANGELOG.md#2026-10-30--clef-change-feedback-no-application-release). Real C/octave/transposing-instrument and broader complex-geometry/hardware acceptance remain outstanding.
- **INV-003:** missing-XML assignment identity now uses original source contents, with isolated Node and real-MXL browser coverage. The old shared empty identity remains untouched and unused; see the [fix and limits](CHANGELOG.md#2026-10-30--hand-assignment-identity-without-xml-no-application-release).
- **Keyboard size changes:** current targets now rebuild when expanding/shrinking the selected range; active practice pauses through existing cleanup. All eight unchanged presets passed boundary checks and Moonlight passed real-score refresh checks in all modes. See [validation and limits](DEVELOPMENT.md#keyboard-size-checks); physical endpoint acceptance remains under INV-005.
- **Storage follow-ups:** large-library matching improvements, transaction rollback/error recovery and app-wide unavailable-preference handling implemented with isolated regression coverage. Settings backup schema/value validation is also implemented with legacy compatibility and isolated Node/browser tests. The storage-limit and real-profile acceptance cases above remain open.
- Removed obsolete updater acceptance, duplicate hardware/geometry/hosting checks, and the stale blanket request to establish tests. Historical change records retain their original evidence and limitations; this cleanup does not mark unperformed tests as passed.
