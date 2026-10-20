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

Default app URL: `http://127.0.0.1:8080/`. Node is needed for this server and the helper, not for the static frontend served by Live Server.

- Windows desktop: `Windows Launchers/Piano Trainer - Desktop.bat`
- Windows LAN: `Windows Launchers/Piano Trainer - iPad (Wi-Fi).bat`
- Mac equivalents: `Mac Launchers/Piano Trainer - Desktop.command` and `Mac Launchers/Piano Trainer - iPad (Wi-Fi).command`
- Server configuration: `PIANO_TRAINER_APP_HOST` and `PIANO_TRAINER_APP_PORT`.
- LAN hosting binds the app to `0.0.0.0`; `/connection-info` lists available addresses. For iPad MIDI practice, use the documented MIDIWeb workflow rather than the server page's generic Safari wording.

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

Do not launch, close, restart, or replace the user's Live Server or browser session unnecessarily. Prefer a separate test browser/tab on the supplied origin. Its MIDI permissions, browser storage, and devices can differ from the user's usual browser; describe that limitation. Opening the app can seed first-run defaults/starter scores in the test profile, and opening a library song updates its recent-open timestamp.

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

- Leave the final practiced note/chord of an enabled loop unplayed in Wait and Follow; verify it does not restart until satisfied. Compare Realtime's intended timed behavior. This currently exposes a documented defect.
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
- Asset URLs are cache-busted using the bootstrap version. URL `appv` and stored overrides can affect it; check these when investigating stale assets.
- GitHub commits, pushes, tags, and releases remain the user's responsibility unless explicitly delegated.
- Historical version instructions in `DEV_NOTES.md` are superseded by this section.

The default update manifest is root-relative and local runs read the local manifest; see review finding F6 before assuming that Check for Updates discovers remote GitHub releases or supports nested hosting. `site.webmanifest` has root-relative URLs too. Release tests should distinguish localhost root, custom-domain root, and a GitHub Pages project subpath.

## Completion and suggested commit text

Every file-changing update must include an accurate suggested commit title and description, even for documentation-only work. Do not create the commit.

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
