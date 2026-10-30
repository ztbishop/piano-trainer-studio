# Development and regression checks

Project rules live in `../AGENTS.md`; module ownership lives in `ARCHITECTURE.md`. This guide describes the development workflow and verification evidence expected for future changes.

Use the [developer index](README.md) for task-specific guides. The [October 20 review](CODE_REVIEW_2026-10-20.md) lists known reproduced defects and conditional risks; do not treat them as passing regression checks. Record meaningful future changes using [CHANGELOG.md](CHANGELOG.md).

## Run with VS Code Live Server

1. Open this repository folder in VS Code.
2. Open `index.html` with Live Server and use the served localhost/loopback URL in your MIDI-testing browser.
3. Allow browser MIDI access, select the MIDI device/channel in Settings, and load a score.
4. Check the browser Console and Network panels while testing.

There is no frontend build step or root npm package. No dependency installation is needed for the bundled app. Keep the same hostname and port to retain the same browser library/settings: `localhost` and `127.0.0.1`, or different ports, are different origins.

Opening `index.html` directly as a file is not the supported development workflow: manifest loading, fetched resources, and browser APIs should be tested through a server.

## Alternative local server and launchers

With Node.js installed, from the repository root:

```powershell
node local-web-server.js
```

Use the existing `http://127.0.0.1:5500/index.html` Live Server origin. Launchers now share port 5500 by default; run only one app server at a time. A port collision reports a useful message without stopping the other server. Wi-Fi launchers open the app on loopback and the server prints LAN URLs for other devices. WLED remains on 4818. Old port-8080 browser data is untouched; export/import both backup types if moving it to 5500.

Default app URL: `http://127.0.0.1:5500/`. Node is needed for this server and the helper, not for the static frontend served by Live Server.

- Windows desktop: `Windows Launchers/Piano Trainer - Desktop.bat`
- Windows LAN: `Windows Launchers/Piano Trainer - iPad (Wi-Fi).bat`
- Mac equivalents: `Mac Launchers/Piano Trainer - Desktop.command` and `Mac Launchers/Piano Trainer - iPad (Wi-Fi).command`
- Server configuration: `PIANO_TRAINER_APP_HOST` and `PIANO_TRAINER_APP_PORT`.
- LAN hosting binds the app to `0.0.0.0`; `/connection-info` lists available addresses. For iPad MIDI practice, use the documented MIDIWeb workflow rather than the server page's generic Safari wording.

The optional server returns HTTP 400 for malformed URL encoding/parsing or decoded NUL paths, and 404 for disallowed/missing files or paths escaping the site root. It treats URL/Windows separators consistently, checks the normalized path against both the site boundary and existing root allowlist, and checks the actual file's canonical path before reading (including directory indexes and junction/symlink targets). Root names sharing the site's prefix do not count as contained. Normal asset query strings, MIME types and `/connection-info` remain supported. These checks belong to `local-web-server.js`; they do not change VS Code Live Server or the separate WLED helper.

## Optional WLED helper

The helper requires Node.js 18 or newer and has no external npm dependencies:

```powershell
node helper/server.js
```

It binds to `127.0.0.1:4818`; `GET /api/health` checks availability. It forwards frames/clear requests through HTTP JSON or DDP/UDP port 4048. The app's helper address is fixed to localhost port 4818, even though the helper's port can be overridden using `PORT`.

The low-latency launcher is `Windows Launchers/WLED Helper - Low Latency (DDP).bat` or its Mac equivalent. App hosting and helper hosting are separate processes. DDP selected without an available helper falls back to HTTP JSON.

The iPad Wi-Fi launcher starts only the app server. It does not start a WLED helper or make the computer's localhost bridge accessible on the iPad. Test iPad HTTP JSON behavior on the actual device/browser/network. See `LED-Setup.md` for calibration and hardware setup.

## Checks available today

There is no unified application test runner or CI test workflow. Standalone focused regressions are available below; do not invent an `npm test` command.

The focused numeric-button adapter regression is standalone: `node tests/numeric-controls.cjs`. See [Menu controls](UI_CONTROLS.md) for its scope and browser checks; it does not verify real rendering or hardware.

Playback lifecycle regressions: `node tests/playback-lifecycle.cjs` covers actual core functions with fake timers/frames, stale count-in callbacks, loop count-in cancellation, score MIDI note-off ownership and asynchronous startup cancellation/rejection. These mocks do not establish real browser/device timing or output cleanup.

Loop-gate regressions: `node tests/loop-gate.cjs` exercises actual playback and Wait/Follow advance functions with a fake iterator/clock. Covers unsatisfied/partial chords at range and score-end boundaries, early/late satisfaction, accompaniment release, sustain startup, count-in, cancellation, score reset, rests/inactive hands, Realtime and interior Wait timing. For the historical isolated reproduction only, use `node tests/loop-gate.cjs --baseline=ee9bd60`; do not use a post-fix revision as a known-bug baseline. Real-score/device acceptance remains separate.

Transpose octave regressions: `node tests/transpose-octaves.cjs` exercises actual pitch/harmony helpers using minimal node mocks: 2,352 combinations of step, integer alter, octave, direction and spelling bias, explicit boundary spellings, malformed-alter fallback, harmony wrapping and public zero-shift text preservation. Browser DOMParser/OSMD checks use the original [enharmonic fixture and instructions](../tests/fixtures/README.md); helper mocks do not establish full MusicXML compatibility or physical playback.

Optional-server regressions: `node tests/local-web-server.cjs` runs the actual source with Windows/POSIX resolver cases and a real temporary loopback HTTP listener using generated fixture files. Tests malformed requests followed by valid requests, encoded/mixed-separator traversal, normalized allowlisting, junction/symlink escapes, valid assets/MIME/query strings, directory indexes, HEAD and `/connection-info`. It closes its own listener and removes only its generated OS-temp directory; existing servers, launchers, browser data and the WLED helper are untouched. Restricted environments may need permission for loopback connections. If junction creation is denied, the test reports a mocked canonical-target check instead of claiming a physical junction pass. LAN/iPad and launcher execution remain separate acceptance checks.

Launcher-address regressions: `node tests/launcher-addresses.cjs` checks the server default/override port, loopback URLs, LAN console messages, collision handling and unchanged WLED endpoint with a fake listener. Actual Mac/LAN execution remains separate.

Hosting regressions: `node tests/hosting-paths.cjs` exercises the actual bootstrap using isolated network mocks: relative manifest/assets, version fallback, version display, removed updater behavior, and manifest/icon paths. `node tests/library-appearance.cjs` covers demo isolation, scoped/full backups, binary backup validation, search filtering and appearance persistence with isolated stores/DOM; neither establishes browser layout or engraving.

MIDI output initialization: `node tests/midi-output-init.cjs` exercises actual asynchronous setup, output restoration, expression helpers and manual output/channel listeners with in-memory devices/storage. Covers all modes, 0/65/100% levels, channels, reconnect, missing/disconnected/None outputs, separate LED destinations and unchanged routing flags. It captures CC11 bytes without opening hardware or modifying browser data; audible piano acceptance remains separate.

The read-only diagnostic probes added under docs can be rerun separately:

```powershell
node docs/diagnostics/review-probes.cjs
```

These source-extraction/mocked probes report observed issues, not application pass/fail. `issueObserved: true` identifies a reproduced issue; a zero process exit only means the diagnostics completed. They neither replace tests for a future fix nor verify real rendering/MIDI. See [the review](CODE_REVIEW_2026-10-20.md) for each finding's evidence level.

Read-only application/helper syntax checks from the repository root:

```powershell
$appScripts = @(Get-ChildItem -LiteralPath js -Recurse -Filter *.js) + @(Get-Item -LiteralPath local-web-server.js,helper/server.js,debug-overlay.js)
foreach ($appScript in $appScripts) {
    node --check $appScript.FullName
    if ($LASTEXITCODE -ne 0) { throw "Syntax check failed: $($appScript.FullName)" }
}
git diff --check
git status --short --branch
```

For documentation-only changes, review links, commands, and consistency and run `git diff --check`; browser/hardware checks are unnecessary unless runtime files changed. Syntax checks do not test DOM integration or inline HTML scripts.

Do not launch, close, restart, or replace the user's Live Server or browser session unnecessarily. Prefer a separate test browser/tab on the supplied origin. Its MIDI permissions, browser storage, and devices can differ from the user's usual browser; describe that limitation. Opening the app can seed first-run preference defaults in the test profile, and opening a library song updates its recent-open timestamp.

## Library workflow checks

`node tests/library-workflow.cjs` runs actual UI/library functions with isolated stores and controls: text/binary matching, partial import failures, busy/reentry recovery, deliberate copies, transformed saves and status, and backup preview/apply/cancellation.

Open `docs/diagnostics/library-workflow.html` through the existing server and click **Run isolated checks** for 19 real IndexedDB checks; enable the interactive option and confirm both default previews for 21 total. It loads the current library source into a uniquely named temporary database and the workflow functions with isolated UI adapters, then closes/deletes only that test database. It does not open the application database, seed preferences, connect hardware or render notation. The checks include repeated backups, uncertain legacy copies, explicit association persistence, changed versions, stale previews and rollback of earlier writes after a simulated storage failure. Save-title/folder dialogs and responsive menus still need actual app inspection.

`node tests/library-merge.cjs` covers actual validation/planning/apply functions with isolated store adapters: intentional copies, known IDs and aliases, local rename/move preservation, changed-version repeat imports, export/restore identity, uncertain defaults and manual choices, one-to-one matching, same-name/empty folders, binary payloads, malformed backups and stale previews. Compare the real IndexedDB checks above before claiming storage correctness.

## Verification layers and a useful first test suite

| Layer | What it establishes | What it does not establish |
| --- | --- | --- |
| JS syntax, inline-script parsing, diff/link checks | Parsable code and internally consistent documentation | DOM behavior, sound, musical timing, or device correctness |
| Isolated deterministic source probes/unit tests | Behavior for explicit inputs and mocked clocks/data | Real OSMD object topology or full browser lifecycle |
| Browser smoke/integration | Actual script boot, controls, SVG score loading, affected UI behavior | Physical MIDI/LED output or measured audio latency |
| Owner device acceptance | Behavior on the actual piano/browser/controller/network | Every score/browser/device combination |

Prioritize focused tests for final Wait-loop gating, timer-run ownership, transpose octave crossings, server path/request handling, and `PTTiming` structural jumps. Then add small redistributable MusicXML fixtures for hidden notes, clef changes, cross-staff voices, unisons, and multi-segment ties. Keep production scheduler/rendering changes separate from test harness setup; do not copy Guitar Trainer's renderer or MIDI policies into this app.

## Manual regression checklist

Run checks relevant to the changed area. Timing/input/rendering changes need the corresponding protected-system checks, not just syntax validation. Record score, measure, browser, input device, mode, tempo, expected result, and actual result. Separate passed checks from those awaiting hardware or sample scores. Use backups before tests that intentionally change library/settings; never clear storage as a shortcut.

| Area | Cases and expected behavior |
| --- | --- |
| Load/import | XML, MusicXML, original MXL, and an affected converted format load; MXL engraving preserves slurs/grace notes/grouping. Conversion failures give useful feedback. |
| Feedback geometry | Resize and zoom without beam drift or displaced overlays. Test simultaneous and side-shifted chord notes, clef changes, accidentals, dots, fingering, annotations, and lead-ins. Feedback anchors remain attached to rendered noteheads. |
| Hidden notes/ties | Hidden/non-rendered notes do not block practice. Tie continuations do not require fresh attacks; tied playback duration and visual sustain remain correct. |
| Realtime | Continuous tempo progression; correct, wrong, and missed notes grade correctly. Test early held notes, score tempo changes, tempo scaling, and metronome alignment. |
| Wait for Me | Required chord notes must all be satisfied before progression. Wrong input cannot release the wait. Rests/inactive-hand gaps do not deadlock. Saved routing preferences survive mode changes. |
| Follow Me | Exactly one practiced hand and opposite-hand playback. Test on-time/late input, early input, repeated notes, rests, and cross-hand timeline gaps. Already-satisfied early notes advance without deadlock or false wrong-note classification. |
| Navigation/timing | Backward repeats and first/second endings have no added stall or playback burst. Test pickup measures, long final notes, ties, click-to-start, loops, count-in, and metronome handoff. |
| Hand assignment | Staff and voice modes, cross-staff voices, multiple parts with reused voice IDs, accompaniment/ignore, missing-voice fallback, persistence on reopening, and settings backup/restore. Assignment changes stop queued playback and refresh colors/expected notes. |
| Audio/MIDI | Device/channel selection, reconnect, velocity-zero note-off, virtual input, routing controls, pause/reset cleanup without stuck notes, and audio recovery after minimizing/focus changes. |
| Transpose | Key/semitone changes and reset; notation, playback pitch, expected notes, hand assignments, library identity, and loop behavior remain coherent. |
| Library/settings | Starter import, add/open/rename/move, folders, bulk import, both backup types, and restore preserve data. Test intentional deletions only with disposable data. |
| LEDs | Simulator and hardware colors match expected/correct/wrong/future states. Test calibration, brightness, test-stop cleanup, HTTP JSON, DDP helper availability/fallback, and clear on pause/reset. |

Additional regression cases identified during the deep dive:

- Leave the final practiced note/chord of an enabled loop unplayed in Wait and Follow; verify it does not restart until satisfied. Compare Realtime's intended timed behavior. FIX-003 addresses the former boundary-gate defect; retain this regression case.
- Pause during count-in, immediately Play again, then test reset/load/mode change before old callbacks fire. Observe cursor, clicks, notes, and count-in starts, not only the button label.
- Transpose B-sharp/C-flat around octave boundaries and test a tie extending over at least three score events.
- Reopen with different hand toggles and test both backup types, preserving the distinction between in-memory choices, routing flags, and assignment keys.
- Test a 61-key or other smaller instrument's actual endpoints, not only the selected key count.

### Evidence record template

```text
Revision and change:
Browser/profile/origin/viewport:
Score/edition and exact measure/event:
Mode, hand/voice roles, tempo, loop/count-in:
MIDI device/channel and audio/LED routing (or explicitly unavailable):
Steps and expected behavior:
Observed result and diagnostic evidence:
Checks completed:
Checks pending and why:
```

Historical score examples in `DEV_NOTES.md` include Mozart Fantasy in D minor K.397 around measures 53–56 (ghost notes) and 69 (lead-in anchoring), plus Chopin Nocturne Op. 9 No. 2 measures 8, 14, and 16 (anchoring). These are references, not checked-in regression fixtures; numbering can differ between editions. Future bug fixes should record the exact score/edition and a reproducible case, adding redistributable minimal fixtures where appropriate.

## Version and release policy

- Documentation-only changes do not change application versions.
- For an explicitly requested version/release update, keep `version.json` and `index.html`'s `FALLBACK_ASSET_VERSION` consistent.
- `trainer-state.js` derives `APP_VERSION` from bootstrap/manifest data; it has no separate hardcoded release number to bump.
- Asset URLs are cache-busted using the bootstrap manifest version (or fallback). Legacy URL `appv` and stored overrides are ignored and not deleted.
- GitHub commits, pushes, tags, and releases remain the user's responsibility unless explicitly delegated.
- Historical version instructions in `DEV_NOTES.md` are superseded by this section.

## Keyboard size checks

Run `node tests/keyboard-range.cjs` plus unison-feedback, resize-geometry, multi-segment-ties, playback-lifecycle, loop-gate, settings-backup, storage-unavailable and midi-output-init. The range suite runs actual range/mapping/target functions with isolated adapters: all eight unchanged spans, inclusive endpoints, adjacent exclusions, reversed/calibrated LED endpoints, expansion/shrink, pause/count-in delegation, unchanged accuracy, same-size preservation and startup/persistence.

Open `docs/diagnostics/keyboard-range.html` through the existing server, load the isolated app and run checks. It installs memory-only preferences before startup, blocks IndexedDB/MIDI and omits analytics. Original generated MusicXML chords test both endpoints plus adjacent outside pitches for each size, using actual OSMD and `triggerVirtualKey` matching in Realtime/Wait/Follow. The bundled Moonlight Sonata XML supplies a real event for shrinking/expanding the current range in all three modes. The 157 assertions include virtual-key endpoint styling, forward/reverse LED mapping, size persistence, retained accuracy and engraving, and same-size preservation.

Live audio/MIDI routing, early-input reservations and Wait/Follow advancement are stubbed to hold events for inspection. This is not continuous playback, physical MIDI/WLED acceptance or proof that all keyboards of a given size share these endpoints. Native scores/settings are never opened. Check the real device's lowest/highest MIDI notes before proposing custom-range support; the owner's 88-key A–C instrument fits the existing full-range model.

### Hosting and version display

The relative `version.json` bootstrap supplies the running version and asset cache keys, with an embedded fallback if unavailable. Settings displays that version and a fixed GitHub Releases link. Automatic/manual update checks, forced reloads and remote manifest overrides have been removed. Legacy updater keys/URL parameters are ignored without clearing browser data. Manifest start/scope/icons stay deployment-relative. Test root/subpath hosting and installed shortcuts after deployment; local mocks cannot establish public-host behavior.

## Completion and suggested commit text

Follow the current commit/push authorization in [AGENTS.md](../AGENTS.md). Use an accurate commit title and description including validation; provide suggested text if work remains uncommitted.

Example format:

```text
Title: Fix Follow Me progression through inactive-hand rests

Description:
Explain the specific problem and resulting behavior.
Mention relevant documentation changes.

Validation: List checks actually performed and their results.
Pending: State any browser/MIDI/hardware verification not performed.
```

Scale the description to the change. Avoid claiming manual validation from syntax checks, or describing changes not present in the final diff. Review `git diff` and Git status before handing work back.

### Isolated large-library and storage-failure checks

Run `node tests/library-scale.cjs` and `node tests/library-storage.cjs`. The scale test counts exact-content comparisons as a deterministic regression guard; optional `PIANO_SCALE_COUNT=10000` increases the generated fixture. `--baseline=da96116` on either script reports the pre-fix behavior without enforcing the new assertions. Failure-event mocks verify retry, original error preservation and waiting for rollback.

Open `docs/diagnostics/library-stress.html` through the existing server and run its button. It substitutes a unique disposable database name before loading the library code, creates 3,200 mixed text/binary scores and 100 folders, and removes only that database afterward. The optional preview uses in-memory data after database removal; cancel it. The test injects QuotaExceededError after a bounded 64 KiB test-write budget into a real transaction, checks rollback and retry, and uses an opaque-origin sandbox for actual storage denial. It never opens the app database or changes preferences. This is not physical quota exhaustion: do not fill shared-origin storage to test failure. Record fixture timings, browser/environment and remaining limits rather than extrapolating to unlimited libraries.

### Unavailable storage across the app

`node tests/storage-unavailable.cjs` checks blocked getters, read/write failure fallback, no delayed write-through, preserved readable values, settings batch rollback, healthy imports and non-overwriting first-run defaults. It also guards against direct preference-store access outside `storage.js`.

Open `docs/diagnostics/storage-unavailable.html` on the existing server, then **Load isolated app** and **Run isolated app checks**. This loads the full current app in a frame with localStorage, sessionStorage and IndexedDB getters blocked before any app code. The native stores are never opened. MIDI access is disabled and external analytics scripts are omitted. Checks cover startup, warning, failed settings operations, library retry, demo/direct-file rendering and session appearance changes. Inspect/dismiss the warning at desktop and narrow widths. This controlled denial is not device permission revocation, physical quota exhaustion, or MIDI/WLED hardware acceptance.

### Settings backup validation checks

Run `node tests/settings-backup.cjs` for 46 shared isolated cases: all supported keys, current/unversioned wrapper/flat formats, typed primitives, calibration/assignments, unknown/null keys, replacement semantics, round trip, rejection without writes and commit rollback. The harness uses memory-only stores and a throwing IndexedDB getter. Also run `node tests/storage-unavailable.cjs` for unavailable preference storage.

Open `docs/diagnostics/settings-backup.html` through the existing server and choose **Run isolated checks**. It patches only the storage providers and alert/reload sinks before loading the current modules; native browser stores are never opened. The same 46 cases plus three actual FileReader cases (malformed JSON, unsupported version, valid legacy file) give 49 checks. Reload is counted rather than navigating the page; this does not establish real profile migration, disk quota exhaustion or hardware restoration. Shared test data lives in `docs/diagnostics/settings-backup-cases.js` so Node and browser run identical validation cases.

### Hand-assignment identity checks

Run `node tests/hand-assignment-identity.cjs` for unchanged canonical-key compatibility (a recorded pre-change fingerprint), ignored/preserved empty-XML keys, distinct source bytes, reopen behavior, Blob/buffer/view equivalence, text/binary domain separation, missing/malformed XML and no initialization writes. It runs actual initialization with minimal DOM/OSMD adapters and memory-only preferences.

Open `docs/diagnostics/hand-assignment-identity.html` on the existing server, then load the isolated app and run its checks. Before app startup it substitutes memory-only preference stores, blocks IndexedDB and disables MIDI. It forces only the canonical XML extraction helper to return null in the test frame; the real OSMD renderer loads original bundled Hot Cross Buns/Mary Had a Little Lamb MXL files. Fourteen checks cover normal/fallback restoration, same-name isolation, renamed source persistence, backup round trip, identity-less loads, staff-only messaging, original MXL bytes and unchanged SVG path geometry for the compared score. The final frame displays the fallback notice for inspection. This is controlled extraction failure, not a test of every corrupt ZIP/converter failure or physical MIDI/WLED setup. Existing complex-score geometry/timing acceptance remains separate.

### Multi-segment tie checks

Run `node tests/multi-segment-ties.cjs`, `node tests/playback-lifecycle.cjs` and `node tests/loop-gate.cjs`. The tie helper cases cover the exact three-segment length patterns observed in bundled scores, four segments, two/untied notes, same-pitch guarding, explicit links and cycle termination. Lifecycle/gate suites retain their existing mocked coverage.

Open `docs/diagnostics/multi-segment-ties.html` through the existing server, load the isolated app, then run its checks. Native preferences are replaced with memory stores before startup; IndexedDB and MIDI are blocked. Real OSMD loads Moonlight Sonata 1st Movement (XML), Prelude I in C major BWV 846 (MXL), and The Entertainer (MXL). The test observes all ten three-segment tie objects and existing two-segment ties, and compares SVG paths before/after traversal.

For one long tie per score, it invokes the actual playback loop in Realtime/Wait/Follow at 75% speed with both practice/playback hands enabled to reach the duration calculation. Output requests are captured, future playback/metronome/visual-start callbacks suppressed, and overrides restored afterward. Checks verify the existing 90% output and 85% visual factors and use real continuation notes to verify no fresh required attack/visual. This is 227 assertions on actual parsed scores, not continuous playback, listening, physical MIDI/WLED acceptance or a replacement for the normal mode/loop tests. The documented renderer and timing protections still apply.

### Same-pitch unison feedback checks

Run `node tests/unison-feedback.cjs`, `node tests/multi-segment-ties.cjs`, `node tests/playback-lifecycle.cjs`, `node tests/loop-gate.cjs` and `node tests/numeric-controls.cjs`. Unison cases execute the actual grouping/feedback functions with isolated adapters: multiple/overlapping/missing anchors, one credit/penalty, early carry, staff/role separation, hidden/rest/tie exclusions and Realtime wrong-note suppression.

Open `docs/diagnostics/unison-feedback.html` through the existing server; load the isolated app, then run checks. Memory-only preferences are installed before startup; IndexedDB and MIDI are blocked. Real OSMD loads bundled Minuet in G Major, Moonlight Sonata 1st Movement and Waltz in A Minor. It scans eligible unisons, tests actual virtual-key input, misses and early carry in each mode, checks original engraving paths, then exercises Moonlight measure 23 at 75/100/125% zoom with resize/rebuilt feedback. Live audio/MIDI routing and Wait/Follow advancement are stubbed to hold each event for inspection; this is not continuous playback or hardware acceptance. Minuet currently contributes no eligible parsed unison group. Check Practice popup status and button sizing at desktop and phone widths separately.

### Resize geometry checks

Run `node tests/resize-geometry.cjs` with the unison-feedback, numeric-controls, multi-segment-ties, playback-lifecycle and loop-gate suites. The resize suite executes the actual render wrapper and debounced handler with geometry adapters, checking width gating, explicit renders, source-note anchor refresh, missing-anchor fallback and preserved practice state.

Open `docs/diagnostics/resize-geometry.html` on the existing server. Load the isolated app and run checks. It uses memory-only preferences, blocks IndexedDB/MIDI, and disables live audio/MIDI routing and Wait/Follow advance while asserting input results. Real bundled Moonlight Sonata XML, Prelude I in C major BWV 846 MXL and The Entertainer MXL are rendered at 75/100/125% and frame widths 1100/740/1100. Repeated same-width and height-only events must retain the identical SVG and engraving paths (including beams); changed widths/zoom must refresh current targets without rebuilding scoring state. Actual key input is then checked in all three modes. The final view shows Moonlight measure 23 feedback after zoom. Native library/settings are never opened.

Different-width renders intentionally reflow notation; unchanged path strings across different widths are not a useful assertion. Inspect beam/stem attachment, noteheads/rests and feedback at the rendered widths. OSMD can change spacing/slur/rest placement between explicit renders; do not introduce a second beam-layout pass or vendor changes to force path equality. Physical MIDI/audio and the historical complex geometry cases remain separate acceptance checks.

### Clef-change feedback checks

Run `node tests/clef-feedback.cjs` plus resize-geometry, unison-feedback, multi-segment-ties, playback-lifecycle and loop-gate. Clef unit cases execute the real resolver with source-instruction adapters: exact/inherited/mid-measure/end boundaries, backward queries, independent global staffs, G/F/C lines and octave displacement, chromatic-step policy, expected-context precedence, explicit anchors/exact Y and absent geometry. C-clef/octave cases are synthetic coverage, not real-score acceptance.

Open `docs/diagnostics/clef-feedback.html` through the existing server and run its isolated app. It loads bundled Fur Elise XML, Prelude I in C major BWV 846 MXL, Sonata No. 16 1st Movement K.545 MXL, and the two-part Entertainer MXL. Hand-picked boundary assertions include Fur Elise's lower-staff change at absolute time 4.8125, Prelude measure 32 at 31.5625, and Mozart lower-staff changes; reverse queries check navigation independence. Natural-note fallback heights are compared with actual cached rendered noteheads around the changes, while explicit anchors (including accidentals) must be returned unchanged. Wrong/correct virtual-key input and missed-note scoring are checked in each mode at 75/100/125%, along with same-width resize.

The harness substitutes memory-only preferences, blocks IndexedDB/MIDI, and stubs live audio/MIDI, Wait/Follow advance and early-note reservation helpers to isolate placement. It never opens native scores/settings. It does not establish hardware, continuous playback, early-grace timing, every enharmonic spelling or real C/octave/transposing-instrument clef behavior. The final view displays Fur Elise's changed-clef staff with correct and wrong feedback for visual inspection.
