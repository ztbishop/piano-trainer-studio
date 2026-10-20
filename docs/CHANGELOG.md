# Change history and future update records

## How to use this file

Record meaningful behavior, workflow, or architectural changes with their purpose, actual validation, and pending acceptance. Small related edits can share an entry. This is not a replacement for Git history or a requirement to release/tag every commit.

For future work:

1. Check Git status and inspect current code/docs.
2. Make the requested focused change; update the relevant subsystem document.
3. Run appropriate checks and record remaining browser/hardware acceptance honestly.
4. Provide a suggested commit title and description. The user chooses when to commit, group related edits, bump release versions, tag, and push.

Versions identify chosen releases; commits preserve implementation history. Detailed messages are useful, but old broad version-only messages do not erase their diffs. Do not rewrite old commits/tags to invent a finer history. `git log -- path`, `git show <commit> -- path`, and `git blame` can still investigate the recorded snapshots. Uncommitted/intermediate edits never saved in Git cannot be reconstructed reliably from version labels.

## 2026-10-20: v1.3.1 version preparation

- Updated `version.json` and the index bootstrap fallback together to 1.3.1 for the saved MIDI output volume initialization fix described below. Historical version references remain unchanged.
- Validated matching version values, JSON and inline-script parsing, and diff whitespace. Live Server version display and new playback/hardware acceptance were not checked for this version-only update; the device check below remains pending.
- Commit, tag, push and GitHub Release publication remain owner actions; no Git mutation or publication performed by the agent.

## 2026-10-20: saved MIDI output volume initialization (no application release)

- FIX-007 / GitHub #17: restoring a saved MIDI Out destination now sends its current CC11 expression level. Preferences initialize before asynchronous MIDI access, and the prior restoration selected the output without sending its saved volume. This explains why reapplying the same slider value could reduce startup loudness. Reconnection/repopulation also reapplies the level; manual output/channel changes retain their existing behavior. No note velocity, scheduler, engraving, routing preference, WLED or MIDI-input path changes.
- Added `node tests/midi-output-init.cjs`. It failed on the baseline missing startup message and passes with the focused restoration change. Actual setup/restoration/expression/listener functions with isolated devices/storage cover Realtime/Wait/Follow, 0/65/100%, channel 1/16 initialization, disconnect/reconnect/removal/reappearance, manual output and channel switching, None/missing devices, separate LED destination and unchanged routing flags. A restored 65% output receives CC11=83 without moving the slider. Syntax and diff whitespace checked; existing playback-lifecycle and numeric-control regressions passed.
- Browser: separate Codex in-app tab on existing Live Server, app boot and Settings/MIDI selectors remained usable. WebMIDI permission was unavailable in that profile, so the restored-device path was verified by captured mock MIDI messages, not actual hardware. No storage clearing, server replacement or physical-device interaction. Physical startup/reconnect loudness is pending and can be checked on the owner's piano; the original reporter is not required. No GitHub issue/comment changes.
- Updated MIDI/development/backlog documentation. Application version remains 1.3.0; no new release, commit or push.

## 2026-10-20: deployment-relative update and install paths (no application release)

- FIX-006: default update manifest is now `version.json` relative to the app, matching bootstrap. Web manifest start URL/scope and icons resolve within the deployment directory at root or nested hosting. No new remote endpoint, storage migration, service worker, application version or deployment.
- Default localhost checks are scoped explicitly to local files: Check Local Files / Local Files Current, with a note that remote releases were not checked. Newer locally served files offer Reload to Update rather than a download; existing confirmation/cache-busting is retained. Local startup still does not auto-reload. Saved different-manifest overrides retain their existing local Download Latest action; hosted automatic update/reload behavior remains. Changes in `led.js` are restricted to existing update helpers, not LED transport/rendering.
- Added `node tests/hosting-paths.cjs`: actual update helpers with isolated storage/fetch/navigation verify root/nested localhost, custom-domain and GitHub Pages URL semantics; manifest start/scope/icons; local status/reload; saved remote overrides/downloads; failures/missing versions; and hosted auto-reload retaining the subpath. Syntax checks and review probes passed; UPDATE-SUBPATH now resolves `/piano-trainer-studio/version.json`. Diff whitespace checked. These mocked/URL tests do not establish deployed-site behavior.
- Browser: separate Codex in-app tabs on existing Live Server `http://127.0.0.1:5500/index.html` and a temporary loopback preview at `http://127.0.0.1:5518/piano-trainer-studio/index.html`. Preview mounted the unchanged optional-server handler at a subpath without editing its production routing. App boot, Local Files Current status and manual recheck passed. Inspected affected controls/text at 1280x720 and 390x844; local status text/buttons fit their rows, then restored viewport. Nested console had no warnings/errors; root had the existing unavailable-MIDI state. Real HTTP reads returned 200 for version/web manifests and both icons at root and subpath. Closed temporary tabs/stopped preview; no storage clearing or user server changes. New preview origin seeded first-run defaults/library independently.
- Pending: actual custom-domain/GitHub Pages deployment, install/relaunch/existing shortcuts, live remote-manifest CORS/newer-release/download acceptance and hardware/timing checks. Local previews do not validate an already installed app. Updated development guidance/backlog; no commit, push or release.

## 2026-10-20: optional server request and path protection (no application release)

- FIX-001/FIX-002: malformed URL parsing/decoding and decoded NUL paths now return controlled HTTP 400. Path resolution uses separator-aware site containment and rechecks the normalized root allowlist; sibling names sharing the site prefix and traversal into disallowed roots are rejected. Canonical file containment also rejects external junction/symlink targets, including directory indexes. Valid root/asset URLs, query strings, MIME types, HEAD, cache/CORS headers and connection-info retain their existing behavior. Only the optional app server changed; no frontend, launcher, WLED helper, port/default binding or Live Server changes.
- Baseline: evaluated committed server source with an isolated handler/resolver; `/%` threw URIError and an assets traversal resolved to a sibling named PianoApp-other. No real sibling data was accessed during that reproduction.
- Added `node tests/local-web-server.cjs`: Windows/POSIX path fixtures plus real HTTP requests against an ephemeral loopback listener and generated OS-temp files. Verified controlled 400 plus subsequent 200, raw/encoded/mixed-separator traversal rejection, normalized allowlist, real Windows junction escape rejection, ordinary assets/MIME/query strings, directory index, HEAD and connection-info. Test cleans up its own listener/temp directory. Sandbox initially blocked junction creation and loopback requests; rerunning the same isolated test outside the sandbox passed, including the physical junction. The restricted-host fallback reports mocked canonical-target coverage explicitly.
- Updated the read-only review probe with a response stub so controlled errors are observed correctly; it now reports both server findings absent. Syntax for changed JavaScript, review probes and diff whitespace checked. The remaining update-subpath finding and conditional tie topology risk remain separate.
- Browser: temporary loopback-only server on port 5517 using the actual checkout, separate Codex in-app tab at 1280x720. App booted, initialized the starter library in that separate origin, and rendered Mary Had a Little Lamb. Connection-info displayed host/LAN addresses. Console showed only the existing misleading successful-load error during score load. Closed the test tab and stopped only the temporary server; no storage clearing. Windows desktop/LAN launcher sources were inspected, not executed. No iPad/LAN-device or WLED/MIDI/hardware acceptance claimed.
- Updated development guidance and backlog. Pending actual launcher and remote-device acceptance. No version bump, commit or push.

## 2026-10-20: enharmonic transpose octaves (no application release)

- FIX-005: calculate absolute pitch using the unwrapped natural step plus alter, then derive output pitch class and octave. B-sharp 4 plus one semitone now becomes C-sharp 5 rather than C-sharp 4; C-flat and double-accidental crossings retain their octave too. Existing integer parsing/malformed-alter fallback, key selection, spelling bias, harmony wrapping, zero-shift handling and output-range policy remain unchanged. No OSMD/VexFlow, geometry, timing, MXL load-source or routing changes.
- Added `tests/transpose-octaves.cjs` plus an original CC0 MusicXML fixture and [browser instructions](../tests/fixtures/README.md). The pre-fix review probe reproduced the B-sharp error; the new regression also failed before the correction. After the correction, 2,352 absolute-pitch cases, explicit boundary spellings, malformed-alter fallback, harmony and zero-shift checks passed. Changed JavaScript syntax, existing loop/lifecycle/numeric-controls regressions, review probes and diff whitespace checked. The transpose probe now observes C-sharp 5; unrelated findings remain.
- Browser: separate Codex in-app tab on existing `http://127.0.0.1:5500/index.html`, 1280x720, fixture opened through normal Scores → Open File. Applied semitones +1 then -1, each from the original source. Inspected OSMD notation and key signatures; in Wait mode all first-measure notes matched the expected virtual keys with 100% accuracy: +1 = MIDI 73/60/74/59, -1 = 71/58/72/57. D-flat key mode rendered its five-flat signature, D-flat 5 first note and D-flat/C harmony. Transpose Reset restored original key/notes and B-sharp/C-flat harmony. Console showed existing denied-WebMIDI and misleading successful-load messages; no new errors observed. No fixture save into the library, storage clearing or server restart.
- Pending: physical MIDI/audio playback/listening; transformed save/reopen, hand assignments and loops; full protected-score/original-MXL geometry and complex-key/explicit-accidental/microtonal/timewise cases. Virtual matching is not audible playback acceptance. Fixture endpoint notes were rendered, not exhaustively played. No version bump, commit or push.

## 2026-10-20: final loop note gate (no application release)

- FIX-003: Wait for Me and Follow Me retain the final required group until all its notes are satisfied, then release deferred accompaniment/sustain visuals and schedule loop completion. Wait keeps the full final-event duration; Follow retains its existing adaptive delay. Early-satisfied groups progress without another attack. Realtime and boundaries without required notes keep timed looping. Optional count-in and per-loop score/feedback reset remain in the existing restart path. Stop/reset clears pending completion and run ownership cancels queued callbacks. No engraving, matching geometry, timing-math, preview, routing-preference or Live Server changes.
- Baseline evidence: committed `ee9bd60` core, temporarily served through the existing Live Server, built-in Mary Had a Little Lamb, measure 1 loop, count-in between loops off, Wait mode. Virtual E4/D4/C4 input followed by no final D4 caused a return to E4 without that attack. Source history traces the branch to the initial release; no documented rationale for a timed Wait/Follow exception was found. This supports a defect classification, not certainty about original intent. Owner then authorized retaining the fix. Temporary comparison HTML/core files were removed.
- Automated: `node tests/loop-gate.cjs --baseline=ee9bd60` reproduced both Wait/Follow failures with an isolated chord fixture. `node tests/loop-gate.cjs` passed unsatisfied/partial and early-satisfied groups, range/score-end boundaries, late/on-time Follow timing, deferred accompaniment, sustain startup, count-in, cancellation, score reset, rests/inactive hands, Realtime and interior Wait timing. Existing lifecycle and numeric-controls/zoom-source regressions passed; changed JavaScript syntax and diff whitespace checked. Adapted review probe now reports no Wait-loop gate observation; unrelated findings remain.
- Browser: separate Codex in-app tab, `http://127.0.0.1:5500/index.html`, 1280x720, built-in Mary Had a Little Lamb, loop 1–1, loop count-in off, virtual input. In Wait and right-hand Follow, played E4/D4/C4, withheld final D4 beyond its ordinary interval, and observed it remain required; D4 then restarted at E4. Wait retained 100%; wrong C4 at Follow's final D4 lowered accuracy without releasing the gate, and correct D4 then restarted/reset the score. Realtime advanced without input during the loop. Console showed existing denied-WebMIDI and misleading successful-load messages, with no new errors. Restored test profile to Wait, loop disabled, range 1–8 and count-in off, then reset. No storage clearing or server restart.
- Pending: physical MIDI/audio/LED cleanup, measured metronome/final-note sustain, browser loop count-in, early-input chords, rests/hidden notes, long ties, original MXL and complex repeats/endings. These are not established by mocked tests or the simple-score browser checks. Version unchanged; no commit/push.

## 2026-10-20: playback callback ownership (no application release)

- FIX-004: stop/reset now invalidate playback-run ownership and cancel count-in/advance timers, empty-event frames, scheduled score MIDI note-offs and sampled-score releases. Deferred score sampler loading and asynchronous toolbar audio/fullscreen startup cannot revive a superseded run. Duplicate pending toolbar starts are ignored. Delayed MIDI metronome attacks are guarded; short metronome releases still complete on their captured output. Existing immediate output cleanup remains in place. No timing math, loop gate, engraving, feedback geometry or Live Server workflow changes.
- Added standalone `node tests/playback-lifecycle.cjs` and adapted the read-only review probe to the new scheduling boundary. The probe now observes only the new count-in start; other documented findings remain observed. Updated practice, MIDI/audio, development and backlog documentation.
- Owner reported UI-001 usual-display layout and physical audio/MIDI/WLED acceptance complete, and UI-002 visual/device plus remaining protected geometry/timing acceptance complete. Recorded that separately from agent testing; historical pending statements in earlier entries describe their original handoffs.
- Automated validation: changed JavaScript syntax, playback lifecycle regressions (including actual Wait/Follow advance functions, deferred sampler completion and async startup cancellation/rejection), existing numeric-controls/zoom-source regressions and read-only review probes passed. Diff whitespace checked. The review probe still reports unrelated known issues; its overall execution is not an application acceptance pass.
- Browser: separate Codex in-app tab on existing Live Server at `http://127.0.0.1:5500/index.html`, 825x728, built-in Mary Had a Little Lamb. Exercised rapid pause/restart and reset in Realtime, rapid count-in pause/restart in Wait and Follow, and Follow-to-Realtime mode change after starting count-in. Observed reset stopped at the score start, restarted Wait at the first required note, and mode change stopped playback. Console showed the existing WebMIDI permission warning and misleading successful-load error; no new lifecycle errors observed. Restored Realtime and reset; no storage clearing or server restart.
- Pending for this patch: physical MIDI/audio/LED output cleanup and repeated-pitch acceptance, measured count-in/metronome synchronization, real-score loop count-in/repeats/endings/ties, load-during-count-in browser acceptance and full Wait/Follow early-input progression. Loop count-in cancellation and stale note-off behavior were tested with mocks, not devices. FIX-003 final-loop gating remains outstanding. Version unchanged; no commit or push.

## 2026-10-20: Future brightness one-unit buttons (no application release)

- Added the same horizontal minus/plus layout as Master brightness to Future note brightness. Its buttons change by **1**, preserving the 0–100 range, slider, typed entry, and existing brightness setter/persistence. Other controls retain their coarse five-step behavior. No LED transport, calibration, rendering, or timing changes.
- Extended the presentation adapter with a per-control step and accessible one-unit labels. Reused existing brightness-row styling; no CSS or markup changes were needed. Updated UI-001 and [control ownership](UI_CONTROLS.md).
- Validation: changed JavaScript syntax, `node tests/numeric-controls.cjs` (including new Future 1 → 2 → 1 → 0 and 99 → 100 bound/no-op cases, existing coarse controls and zoom-source regressions), and `git diff --check` passed.
- Browser: separate Codex in-app tab on existing Live Server origin, 1440x900 and 390x844. Verified both buttons, 0/100 bounds, native 37 entry with slider synchronization, keyboard button activation 37 → 38, slider keyboard increment 1 → 2, saved 38 after reload, and matching desktop/narrow layouts. Master remained 25. Restored Future to 1 and LED mode to None after testing; no storage clearing.
- Pending: physical WLED brightness acceptance and owner visual acceptance in the usual browser. No LED device was connected in the test profile; calibration/transport were not exercised. No application version bump, commit or push.

## 2026-10-20: coarse numeric menu buttons (no application release)

- Added horizontal 40px minus/plus buttons to BPM, Speed, metronome volume/level, App Audio volume, MIDI Out volume, MIDI In Boost, Zoom and Master LED brightness. Buttons move to the next/previous multiple of five; sliders retain one-unit steps and typed integers retain the existing validation/ranges. Master brightness still stops at 1. Looper, hold-to-repeat, Future brightness and transpose were not edited.
- The isolated `js/numeric-controls.js` presentation adapter loads after core and sends numeric change events to the original handlers. No scheduling, engraving, routing, storage format or zoom handler changes. Existing slider thumbs and numeric widths are retained; tracks shorten to fit. Scoped narrow-view fieldset/row rules prevent the new controls clipping in Tempo, Audio and Display.
- Added [menu-control ownership/behavior guidance](UI_CONTROLS.md), developer index/architecture links, and a standalone adapter/zoom-source regression. Updated UI-001 to the approved one-step slider/horizontal-button scope. Version remains 1.2.9; no release was requested.
- Automated validation: `node tests/numeric-controls.cjs` passed off-grid stepping, bounds, disabled state, blank entry, one numeric commit, untouched range handlers, and actual core zoom binding source with mocked rendering/storage (preview input: zero renders/saves; committed change: one render). Changed JavaScript and inline index scripts parsed; diff whitespace checked.
- Browser: separate Codex in-app browser on existing `http://127.0.0.1:5500/index.html`, at 1440x900 and 390x844. Inspected Tempo, Audio/Routing (including visible MIDI In Boost), Display and WLED brightness. Verified native 73 entry stays 73 and syncs its slider, coarse 75/70 steps, Speed 200 and metronome 100 upper bounds, MIDI boost 51 → 50, Master minimum 1 and 1 → 5 keyboard button activation. Slider keyboard input still moved by one. Disabled metronome/MIDI Out buttons and hidden Boost behavior were checked. Saved volume/zoom/brightness values survived reload; test changes were restored via controls without clearing storage.
- Built-in Fur Elise Easy Piano: released Zoom drag changed the rendered SVG, native 103% entry remained 103%, and plus applied 105% with attached beams and aligned two-staff cursor. Mid-drag render counts were verified through the zoom-source regression, not instrumented in the live browser. Full protected-score engraving/anchor acceptance was not performed.
- Built-in Mary Had a Little Lamb: Play, tempo buttons during Realtime/Wait/Follow, mode changes, pause/reset and a virtual-input attempt exercised as smoke checks. No measured timing, grading, audible metronome sync or full navigation/loop acceptance claim. Existing known loop/callback findings remain outstanding.
- Console review showed unavailable WebMIDI warnings and the documented misleading successful-load error message; no new control-related errors observed. MIDI Out live operation and physical audio/MIDI/WLED acceptance remain pending because no device was available. WLED brightness UI was tested with an empty device IP, then LED mode restored to None. Owner visual acceptance, especially shortened tracks, remains pending.

## 2026-10-20: thinner blue score cursor (no application release)

- Matched Guitar Trainer Studio's blue `#4DAEEA` and soft narrow appearance, using 0.4 cursor alpha and a painted band approximately 16px wide at 100% score zoom. Width scales with OSMD zoom. The user authorized this focused appearance change; no version bump was requested.
- Retained OSMD's standard cursor type, native image bounds/center, height, and follow behavior. A CSS mask narrows paint only because feedback fallbacks and auto-scroll read the cursor's bounding rectangle. Engraving, timing, matching, routing, source loading, and other colors were not edited.
- Updated [rendering documentation](RENDERING_AND_TRANSPOSE.md#score-cursor-appearance) and [UI-002](TODO.md#ui-002-thinner-blue-score-cursor-matching-guitar-trainer-studio), replacing its earlier Piano Marvel reference with the user's supplied Guitar Trainer Studio reference.
- Validation: `node --check js/trainer-core.js` and `git diff --check` passed. No application automated test suite exists; the unrelated review probes were not rerun.
- Browser: separate Codex in-app browser tab at the existing `http://127.0.0.1:5500/index.html`; no server restart or storage clearing. Tested at 825x728 and 1440x900. Built-in Mary Had a Little Lamb rendered with blue cursor in Realtime, Wait for Me, and Follow Me; virtual E4/D4/C4 input exercised progression and feedback as a smoke check, not comprehensive matching/timing acceptance. Pause/reset worked. Native cursor widths measured 15/30/45px at 50/100/150% score zoom; the mask remained applied.
- Built-in Fur Elise Easy Piano showed the full two-staff cursor and attached beams after narrowing/widening the viewport and letting the existing resize lifecycle settle. Realtime loop measures 1-2, loop count-in off: observed the cursor return from late measure 2 to earlier in the loop, retaining its blue appearance. Loop enable/count-in choices were restored afterward.
- Built-in Minuet in G Major: clicked measure 16, started Realtime, and observed the backward repeat return to the first system with aligned cursor/feedback. No measured timing or audio-sync claim is made.
- Console review found the documented misleading `File loaded successfully.` error messages and unavailable WebMIDI warnings; no new cursor-related errors were observed.
- Pending: owner shade/width acceptance on the usual browser/display; physical MIDI, LED, and audible sync acceptance (MIDI permission unavailable in the test browser); full protected-score cases for side-shifted chords, clef changes, hidden notes, ornaments/lead-ins, and original-MXL comparisons. Wait/Follow final-loop gating and prior-run callback issues remain outstanding review items, not fixes or passing regressions from this appearance work.

## 2026-10-20: requested UI backlog (no application release)

- Added [TODO.md](TODO.md) and linked it from the developer index.
- Recorded five-step sliders/stacked numeric arrows with unrestricted valid numeric typing, and a thinner blue score cursor using Piano Marvel as a visual reference.
- Recorded scope/visual details to settle during implementation and the relevant regression checks. Neither enhancement has been implemented.
- Expanded the backlog with all six reproduced review findings, eight investigations, and six testing/maintenance recommendations. They remain outstanding; no application fixes were made.
- Made ongoing developer-documentation and backlog maintenance explicit in AGENTS.md, including evidence levels, completion validation, and scope limits.
- Validation: relative documentation links and diff whitespace checked. Application files/version unchanged; browser tests are not required for this backlog-only update.

## 2026-10-20: documentation deep dive (no application release)

- Added a developer index and focused practice/timing, score/storage, rendering/transpose, and MIDI/audio/LED documents based on revision `b40e412`.
- Added a dated review separating isolated defect reproductions, source findings, conditional hypotheses, and recommendations.
- Added read-only diagnostic probes for the documented findings. These are not an app test suite or fixes.
- Extended current architecture/development/context docs and linked historical behavior notes to the current implementation guide.
- Validation: source/command/link consistency, application/helper/diagnostic and inline-script syntax checks, and diff whitespace. Limited Live Server smoke: startup, starter library, and Mary Had a Little Lamb rendering in a separate browser. Live MIDI/LED/audio and full regression acceptance remain pending.
- Application version remains 1.2.9. No application behavior, commits, tags, pushes, or releases were changed.

## Verified historical anchors

The following are selected local Git subjects, not reconstructed per-edit narratives. Dates are Git author dates as printed by the review, not release-service publication dates. Consult each diff for exact scope. Earlier notes remain in [DEV_NOTES.md](DEV_NOTES.md).

| Recorded date | Commit | Subject |
| --- | --- | --- |
| 2026-03-22 | `6012ec5` | Initial release of Piano Trainer Studio |
| 2026-03-23 | `f18827a` | v1.0.5 - Additional File Formats |
| 2026-03-24 | `1144700` | v1.0.6 - Added Tranposer |
| 2026-03-29 | `7c6f0d6` | v1.1.2 - Followme-LED-fix |
| 2026-04-02 | `5a0fc26` | v1.1.6 - CustomDomain |
| 2026-04-03 | `d5fc800` | v1.1.7 - Follow-MIDI-Fixes |
| 2026-04-15 | `9b21d7e` | v1.2.4 |
| 2026-10-06 | `bcf6eaf` | Release v1.2.5: voice-based hand assignment and cross-staff support |
| 2026-10-07 | `798da27` | Release v1.2.6 |
| 2026-10-07 | `1f157e4` | Release v1.2.8: improve search metadata |
| 2026-10-08 | `3994735` | Release v1.2.9: add Google Analytics |
| 2026-10-11 | `b40e412` | Add project guidance and regression documentation |

At the review baseline there were 31 reachable commits and local version tags through v1.2.9. A missing v1.2.7 entry/tag is not evidence of an identifiable lost change. No historical tags were added or moved.

## Entry template

```text
YYYY-MM-DD: concise description (release version only if applicable)

Problem/purpose:
Resulting behavior or documentation:
Affected subsystem/docs:
Validation actually completed:
Pending browser/MIDI/hardware checks:
Commit: add the real hash after the user commits, if useful.
```
