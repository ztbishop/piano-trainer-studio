# Piano Trainer Studio to-do list

Reconciled October 30, 2026 against current source and the [change history](CHANGELOG.md). This is an outstanding-work list, not a list of known failures. An unchecked test means evidence is still needed. Recording an item does not authorize implementation; follow [AGENTS.md](../AGENTS.md).

## Confirmed problems and limitations

No unresolved reproduced runtime defect or confirmed validation gap is currently tracked here. Settings-backup validation is now implemented and tested; see the [validation update](CHANGELOG.md#2026-10-30--settings-backup-validation-no-application-release).

The previously reproduced runtime defects FIX-001–FIX-007 have implementations and recorded regression results. Their remaining device/score acceptance is consolidated below; they are not outstanding unfixed bugs. This does not establish that the app has no other defects.

## Things still to test or investigate

Reproduce the relevant case before deciding on a fix. The [October 20 review](CODE_REVIEW_2026-10-20.md#conditional-risks-and-design-questions) records the original hypotheses; the [development checklist](DEVELOPMENT.md#manual-regression-checklist) defines protected behavior.

### Score and input investigations

- [ ] **INV-005 — Smaller keyboards.** Compare physical lowest/highest keys with symmetric trimming; determine whether explicit endpoint configuration is needed.
- [ ] **INV-006 — MIDI connection changes.** Test unplugging while held, input/channel changes, identical pitches on multiple channels, legitimate input near echoed output, and note-off delivery after output switches.
- [ ] **INV-008 — Complex transposition.** Test timewise documents, multiple staff keys, explicit accidental elements and microtones. The enharmonic octave fix does not establish these cases.

### Acceptance of implemented changes

Each item consolidates checks previously repeated under several updates. Prior passing checks remain valid for their recorded scope; these are the remaining cases, not instructions to rerun everything after every update.

- [ ] **Playback and feedback (FIX-003/FIX-004 and later regression acceptance).** Real-score loop count-in, final-note sustain, early-input chords, rests/hidden notes, long ties, repeats/endings, and pause/restart/load during count-in; measured metronome synchronization and physical MIDI/audio/LED cleanup. Include original MXL and protected side-shifted chord, ornament, lead-in and complex clef-change geometry cases (including real C/octave/transposing-instrument clefs). Simple-score browser tests and mocked regressions have passed; use [practice](PRACTICE_ENGINE.md) and [rendering](RENDERING_AND_TRANSPOSE.md) guidance for the remaining cases.
- [ ] **Transformed scores (FIX-005 acceptance).** Physical playback/listening and an end-to-end transpose → save → reopen → hand assignment → loop test. Existing pitch regressions and OSMD/virtual-input checks are recorded in the [transpose update](CHANGELOG.md#2026-10-20-enharmonic-transpose-octaves-no-application-release).
- [ ] **Device settings (FIX-007 and later preference changes).** Verify audible saved MIDI output volume on startup/reconnect, and current audio/MIDI/WLED preferences and routing on actual hardware. No-device tests do not establish audible/device behavior. See [MIDI/audio/LED guidance](MIDI_AUDIO_LED.md).
- [ ] **Import and browser workflows.** Real converted-format imports and a disposable-data library/settings transfer between browser profiles/origins; verify the current app through VS Code Live Server. Isolated IndexedDB merge/rollback tests and Node-served browser checks already passed. Do not mutate or clear the user's library for testing. See [storage guidance](SCORES_AND_STORAGE.md).
- [ ] **Hosting and devices (remaining FIX-001/FIX-002/FIX-006 acceptance).** Mac launchers, remote LAN/iPad access, deployed custom-domain/GitHub Pages assets, and install/relaunch/existing shortcuts. The user-started Windows launcher and local Node-served browser were exercised on October 30. Automatic update-check/CORS acceptance is obsolete because the updater was removed; deployed manifest/shortcut behavior still needs checking. See [hosting guidance](DEVELOPMENT.md#hosting-and-version-display).

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

Keep detailed implementation and validation in [CHANGELOG.md](CHANGELOG.md), rather than repeating completed checklists here.

- **UI-001/UI-002:** numeric controls and thinner cursor implemented; owner acceptance recorded October 20. That acceptance does not cover later playback patches.
- **FIX-001–FIX-007:** server request/path protection, final-loop note gating, playback callback ownership, enharmonic octave transposition, deployment-relative paths and saved MIDI output volume implemented. Remaining acceptance is listed once above.
- **October 30 requests:** updater removal/release link, permanent demos, appearance, downloads/folder exports/search, launcher alignment, import feedback, Save a copy/current status, menu cleanup and duplicate-aware backup merging implemented.
- **INV-001:** real bundled OSMD scores confirmed truncated multi-segment tie lengths; ordered traversal is fixed with Node and parsed-score playback/feedback regressions. Audible/device sustain and complex timing acceptance remain above. See [evidence](CHANGELOG.md#2026-10-30--multi-segment-tie-duration-no-application-release).
- **Resize geometry:** confirmed unnecessary same-width redraws move rest glyphs and active targets retain stale coordinates after zoom. Width-gated resize and source-note anchor refresh address these cases; see [validation and limits](CHANGELOG.md#2026-10-30--resize-geometry-and-pending-feedback-anchors-no-application-release). Broader geometry/hardware acceptance remains above.
- **INV-002:** same-pitch playable groups now retain all cached feedback anchors while keeping one credit/penalty. Real-score and isolated regression evidence, plus remaining geometry/hardware limits, are in [the change record](CHANGELOG.md#2026-10-30--unison-feedback-and-practice-button-no-application-release).
- **INV-004:** clef-change wrong/unanchored feedback now uses active score-position clefs rather than assuming staff 1 is treble and other staffs are bass. Real-score comparisons and input coverage are recorded in [the change history](CHANGELOG.md#2026-10-30--clef-change-feedback-no-application-release). Real C/octave/transposing-instrument and broader complex-geometry/hardware acceptance remain outstanding.
- **INV-003:** missing-XML assignment identity now uses original source contents, with isolated Node and real-MXL browser coverage. The old shared empty identity remains untouched and unused; see the [fix and limits](CHANGELOG.md#2026-10-30--hand-assignment-identity-without-xml-no-application-release).
- **Storage follow-ups:** large-library matching improvements, transaction rollback/error recovery and app-wide unavailable-preference handling implemented with isolated regression coverage. Settings backup schema/value validation is also implemented with legacy compatibility and isolated Node/browser tests. The storage-limit and real-profile acceptance cases above remain open.
- Removed obsolete updater acceptance, duplicate hardware/geometry/hosting checks, and the stale blanket request to establish tests. Historical change records retain their original evidence and limitations; this cleanup does not mark unperformed tests as passed.
