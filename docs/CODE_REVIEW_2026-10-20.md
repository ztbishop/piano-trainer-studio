# Code and documentation review: October 20, 2026

## Scope and baseline

Reviewed local revision `b40e412`, application version 1.2.9. The working tree was clean at the start. This review changes only `/docs`; application behavior, vendor assets, launchers, versions, Git tags, and release history are unchanged. No commit, push, fetch, or deployment was performed.

The review traced application scripts, bootstrap/CSS/UI ownership, score imports/storage, hand assignment, feedback geometry, practice scheduling, MIDI/audio/LED routes, optional servers, existing documentation, and local Git history. Vendor metadata/banners were inspected; the bundled minified libraries were not independently audited. The local Guitar Trainer docs were used as a structural reference, not as Piano's implementation specification.

Evidence labels:

- **Isolated reproduction:** actual source evaluated with deterministic in-memory inputs/mocks. This can establish a function/control-flow defect, but not real browser/device impact in every score.
- **Source finding:** directly observable behavior or gap in the reviewed code; no complete runtime reproduction claimed.
- **Conditional hypothesis:** a synthetic input demonstrates a failure shape; a real OSMD/device fixture is still needed.
- **Recommendation:** follow-up work, not an instruction to implement it during documentation review.

## Findings to address deliberately

### F1: Local static server can throw on malformed request encoding

**Isolated reproduction; recommended priority: high for server robustness.**

In [local-web-server.js](../local-web-server.js), `safeResolve()` calls `decodeURIComponent()` without catching invalid encodings; the HTTP request callback also has no surrounding catch. Passing `/%` to the captured actual request handler throws `URIError` before a response is produced. With ordinary Node uncaught-exception handling, an incoming request can terminate this optional process.

This affects the bundled Node server, including LAN launchers. It does not establish an issue in VS Code Live Server or GitHub Pages. Fix with controlled bad-request handling and tests that a subsequent valid request still succeeds. The probe does not open a socket or terminate any process.

### F2: Local static server root containment is a string-prefix check

**Isolated reproduction; recommended priority: high before relying on LAN isolation.**

`safeResolve()` checks `fullPath.startsWith(SITE_DIR)` after normalization. A request beginning with an allowed root such as `assets`, then traversing into a sibling named with the same root prefix, resolves outside the intended site directory and still passes that check. The probe returned an illustrative `PianoApp-audit-probe/probe.txt` sibling path; it did not create that directory or read a sibling file.

Recommend separator-aware containment via resolved relative paths, rejecting traversal/absolute escapes and malformed encodings, with platform-specific tests. Existing first-segment allowlisting is insufficient by itself. Scope is the optional Node server, not the separately maintained Live Server extension.

### F3: Wait-mode loop boundary bypasses its final unsatisfied gate

**Isolated reproduction; recommended priority: high for practice correctness.**

In [trainer-core.js](../js/trainer-core.js), `playbackLoop()` schedules its loop-boundary restart before entering mode-specific wait handling. With a final required note unhit, Wait mode and a one-measure loop enabled, executing the boundary callback processes the miss and resets the cursor without an attack. The probe observed one reset and one unhit note processed.

Original intent is not established by the available code/history. Upcoming-note preview is a separate timeline/visual system. Automatically leaving an unsatisfied final group contradicts ordinary Wait progression; it is not necessary to show future notes. If time-driven loop rehearsal is desired, define it as an explicit behavior rather than silently making Wait's last event timed.

Follow Me uses the same early boundary branch and warrants a corresponding fixture. Recommended fix: gate loop completion on the current practice group, while preserving realtime timing, final-note sustain, loop score reset, accompaniment, and count-in. Browser/UI and physical MIDI acceptance are still pending. No behavior was changed in this review.

### F4: Pausing and quickly restarting can revive old count-in callbacks

**Isolated reproduction; recommended priority: high for lifecycle correctness.**

`doCountInAndStart()` schedules callbacks guarded by `AppState.isPlaying`, without a run token or tracked timeout handle. `stopPlaybackState()` sets the boolean false but does not cancel these timers. If a new run makes it true before the old callback executes, both old and new count-in chains can call their start callbacks. The deterministic probe observed `old attempt` followed by `new attempt`.

Related playback-advance and MIDI/audio note-off callbacks also use loose timers; selected visual/metronome timers have their own cleanup. Do not assume `activeTimeouts` covers them all. Recommend explicit run ownership/cancellation and tests for pause/start, reset/load, mode switches, loops, and overlapping repeated pitches. Actual audible/browser/MIDI consequences still require acceptance tests.

### F5: Enharmonic octave-boundary transposition can shift by an extra octave

**Isolated reproduction; recommended priority: medium, higher for scores using C-flat/B-sharp.**

In [transpose-engine.js](../js/transpose/transpose-engine.js), `rewritePitchNode()` calculates `octave * 12 + pitchSemitone(step, alter)`, where the latter is already reduced modulo 12. This discards the octave crossing of B-sharp/C-flat before applying the requested shift.

The actual helper converted B-sharp 4 plus one semitone to C-sharp 4; the correct result is C-sharp 5. The probe used minimal pitch-node objects, not a full browser XML document. Recommend calculating absolute pitch from the unwrapped step-plus-alter value, then checking both octave directions, double accidentals, harmony spelling, output range, and saved/reopened scores in OSMD. Do not mix this fix with rendering/layout changes.

### F6: Update and manifest paths assume a site-root deployment

**Isolated URL reproduction plus source finding; recommended priority: medium if supporting the GitHub Pages subpath.**

In [trainer-state.js](../js/trainer-state.js), `UPDATE_MANIFEST_URL` defaults to `/version.json` despite a comment describing relative-path behavior. At a document under `/piano-trainer-studio/`, it resolves to the host root rather than that project directory. By contrast, index bootstrap fetches relative `version.json`. This is URL-resolution evidence, not a claim about the current public site's redirects or HTTP response.

[site.webmanifest](../site.webmanifest) similarly uses root-relative start/icon URLs. The custom domain and localhost root mask that distinction. A local update check also reads the local checkout manifest, so it cannot independently discover newer GitHub releases without a different configured manifest endpoint.

Recommend defining root versus subpath support explicitly, testing nested hosting, and deciding whether Check for Updates means remote release detection or local asset refresh. Do not silently change remote endpoints or publish releases.

## Conditional risks and design questions

| Item | Evidence and next step |
| --- | --- |
| Multi-segment ties | `getCombinedTieLength()` follows the first different entry of `tie.Notes` before explicit next links. A synthetic shared three-note array sums 0.5 rather than 0.75 whole notes. **Conditional hypothesis:** inspect real bundled OSMD tie topology in a redistributable three-segment fixture before claiming affected real scores. |
| Distinct unison XML notes | `buildExpectedNotesFromEntries()` merges by staff/role/MIDI and retains one anchor. This can conflict with the strict rule preserving distinct XML notes. Define whether one playable pitch should have multiple visual anchors; test duplicated voices before altering established deduplication. |
| Missing canonical XML | Loading can return null canonical XML after extraction/conversion failure. `HandAssignment.initialize()` then fingerprints empty text, so affected scores can share an assignment key and lack voice metadata. Need a raw-source identity/fallback test. |
| Wrong-note fallback geometry | `resolveFeedbackAnchor()` falls back to cursor X and staff-index-based Y when an exact anchor is absent. That path is not active-clef-aware. Reproduce wrong notes after clef changes/multi-instrument staff assignment before modifying geometry. |
| Keyboard range assumptions | Smaller key counts are symmetric trims of MIDI 21–108, not measured device endpoints. A 61-key selection becomes 34–94. Check intended supported hardware; wrong range can exclude valid practice targets. |
| MIDI disconnect/identity | Holds are pitch-only and input changes do not provide comprehensive held-note/session cleanup. Test unplug while held, channel switches, repeated same-pitch channels, echo filtering, and output switches. Do not import Guitar's stronger guarantees by assumption. |
| Storage and backup validation | Many storage operations are unguarded. Import accepts permissive payloads without rejecting unsupported schema versions. Library restore is additive/new-ID and can duplicate data. Recommend validators and isolated fixtures before migrations. |
| Timewise/complex transpose | Root recognition is broader than the part/measure transformation loop. Test timewise, multiple staff keys, explicit accidentals, and microtones before claiming comprehensive support. |

These are recorded for future investigation; they are not evidence that all affected user workflows currently fail.

## Maintenance recommendations

1. **Add a small meaningful regression suite before refactoring the core.** Begin with timing math, final-loop gating, callback ownership, transposition octave boundaries, and static-server handling. Expand to actual DOM/OSMD fixtures for geometry and assignment, not snapshots of implementation text.
2. **Create minimal redistributable score fixtures.** Prioritize repeats/endings, one-hand rests, cross-staff voices with reused part voice IDs, hidden notes, unison voices, clef changes, augmentation dots, and three-segment ties. Existing Mozart/Chopin references are useful but not reproducible without the exact edition.
3. **Consolidate duplicate global MIDI output helpers cautiously.** Core declarations override earlier `midi.js` definitions. Establish channel, echo, velocity, and note-off tests before changing script boundaries.
4. **Improve observability.** Successful score load is logged at error level; avoid interpreting it as a fatal load error. `releaseLowLatencySynth()` references a name not declared in app scripts and appears unused. Legacy helpers/quick-start fragments and comments such as LED "scaffold" should be reviewed rather than trusted as architecture.
5. **Track vendor provenance and notices.** Current Tone/OSMD banners name adjacent license files that are absent from `assets/js`; exact loaded bundle provenance is not centrally recorded. Inventory original source/version, modifications, and referenced notices before vendor updates. This is a packaging/documentation observation, not a legal-compliance determination.
6. **Clarify helper/update versions.** Helper package metadata is 0.1.0 while runtime health reports 0.1.2. Use one documented release policy, and distinguish app version from helper protocol/runtime version.
7. **Separate commits from releases.** Keep small descriptive commits and a concise behavior/validation entry for meaningful changes. Choose release tags deliberately; do not rewrite old history to manufacture missing explanations.

## Verification performed

- Read-only isolated probes in [review-probes.cjs](diagnostics/review-probes.cjs) reproduced `SERVER-URI`, `SERVER-PATH`, `PLAYBACK-EPOCH`, `WAIT-LOOP-GATE`, `TRANSPOSE-OCTAVE`, and `UPDATE-SUBPATH`. `TIE-TOPOLOGY` reproduced only its explicitly synthetic case.
- Application/helper JavaScript syntax and inline-script syntax were checked during this review, together with the diagnostic script. Syntax success is not behavioral acceptance.
- Relative links in changed/current Markdown documents and final diff whitespace were checked. Runtime files were confirmed outside the change scope.
- On the user-started `http://127.0.0.1:5500/index.html`, a separate in-app browser reached welcome/toolbar, displayed the 16-score starter library, and rendered **Mary Had a Little Lamb** with SVG notation/cursor. Opening that score updates its recent-open metadata in the separate test browser; no user browser settings/library entries were deliberately edited or cleared.
- Browser diagnostics showed WebMIDI `NotAllowedError` and the misleading success-at-error-level message. No uncaught rendering failure was observed in that limited score-load smoke check. No MIDI permission was granted by the review.
- **Not verified:** live MIDI, LEDs/DDP, audible playback/latency/metronome, mobile/iPad, alternate viewports, browser reproduction of the isolated defects, converter compatibility across formats, or the full manual regression matrix. No app fixes were made.

## Re-run and interpret diagnostics

```powershell
node docs/diagnostics/review-probes.cjs
```

The command intentionally prints observations rather than passing/failing the application. A zero exit means the probes completed; it does not mean findings were fixed. Source-boundary assertions fail if refactoring makes extraction obsolete. The static server's legacy `url.parse()` can also emit a Node deprecation warning; the probes do not suppress or repair it. After a real fix, add proper regression tests and update the finding's status with the relevant commit and actual acceptance evidence.
