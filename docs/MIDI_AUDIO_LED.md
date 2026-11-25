# MIDI, audio, virtual keyboard, and LED output

Sources: [midi.js](../js/midi.js), audio/input/preview functions in [trainer-core.js](../js/trainer-core.js), [led.js](../js/led.js), and [helper/server.js](../helper/server.js).

## MIDI input and device lifecycle

`setupMIDI()` requests WebMIDI, populates input/output/light devices and channel selectors, and subscribes to connection changes. Saved IDs drive restoration; names are saved for display. This app does not implement Guitar Trainer's per-device profiles, Hex policies, pitch-bend interpretation, or capture system.

Input selection detaches the prior `onmidimessage` handler and attaches a new handler. Selected channel 0 means Any, otherwise channels are one-based 1–16. Note-On with velocity above zero calls `triggerVirtualKey(note, true, 'midi', velocity)`; Note-Off and velocity-zero Note-On call its release path. Other MIDI commands are not practice input. In particular, incoming sustain CC and pitch bend do not implement a pedal-aware grading model here.

The outgoing echo list records status/pitch/velocity for approximately 120 ms and is bounded. Input with exactly matching recent bytes is suppressed to prevent feedback loops. This is a heuristic, not physical-device attribution: legitimate matching input during the window can also be suppressed. Preserve/measure this distinction before tuning the window.

Pitch holds use `pressedKeys: Set<midi>` and related pitch-keyed maps. Source/channel identity is not retained in those sets. Releasing one source/channel can remove the held state for an identical pitch from another. Disconnect/channel-switch handling should be tested with held notes; it does not have the Guitar project's stronger session/epoch model.

## Virtual input and playable range

The virtual keyboard sends through the same `triggerVirtualKey()` grading/routing path using source `ui`. Pointer/touch/mouse cleanup releases active virtual input on cancellation, blur, or page hiding. This does not prove physical MIDI keys have been released on device removal.

Full piano range is MIDI 21–108. Smaller keyboard sizes are implemented by symmetric trimming of the 88-key range, not by a configurable lowest key. For example, 61 keys derive MIDI 34–94; many physical keyboards have a different endpoint layout. Check actual hardware before assuming key count maps its full span. `isMidiInPlayerRange()` filters required score targets, so a range mismatch affects grading as well as LEDs.

`renderVirtualKeyboard()` combines expected, held/correct, wrong, active, out-of-range, and future-preview states. The preview timeline is also used by early-grace matching; invalidating it after role/range changes is behaviorally important even when LED hardware is disabled.

The existing selector and its endpoints remain unchanged:

| Keys | Lowest MIDI | Highest MIDI |
| --- | --- | --- |
| 88 | 21 (A0) | 108 (C8) |
| 76 | 27 | 102 |
| 73 | 28 | 100 |
| 61 | 34 | 94 |
| 49 | 40 | 88 |
| 37 | 46 | 82 |
| 32 | 49 | 80 |
| 25 | 52 | 76 |

Both endpoints are included. Changing size pauses active practice/count-in through the existing stop path, clears transient feedback/reservations and rebuilds current score targets and preview state. This restores newly playable notes on expansion and records excluded notes on shrink; accuracy totals remain intact. Selecting the same size does not restart the current attempt. Startup restoration does not trigger this reset. Score playback scheduling, live-input routing, saved size format and per-MIDI LED calibration are unchanged.

The October 30 checks cover every listed size and real-score size changes; see [keyboard regression instructions](DEVELOPMENT.md#keyboard-size-checks). Key count alone does not identify a physical keyboard's pitch endpoints. A future endpoint-learning/custom-range option remains optional pending an actual device mismatch; no new controls or device detection were added.

## Audio and MIDI routing

| Source | Local audio/MIDI bucket |
| --- | --- |
| Selected score hands | `hands`, further gated by mode playback-hand selection |
| Assigned accompaniment | `other`, gated by `HandAssignment.playAccompaniment()` |
| Live MIDI keyboard | `instrument` |
| Virtual keyboard | `virtual` |

Local and MIDI destinations have independent flags. Wait/Follow controls constrain score-hand playback without rewriting saved output flags. Live MIDI monitoring can double the piano's own sound if both are enabled; this is a routing choice, not grading.

Tone uses locally bundled Salamander samples, preferring OGG when supported and otherwise MP3. `ensurePianoSamplerLoaded()` memoizes readiness. `ensureLiveAudioReady()` resumes the existing audio context; pointer/touch/focus/pageshow/visibility handlers retry after suspension. The optional `lowLatencyPlaybackSynth` is an alternative for score playback in Realtime/Follow; live playback has its own immediate timing path. The `lowLatencyLive` option in `playLocalPianoNote()` affects release/retrigger behavior; it does not switch live sound to a separate synth.

Selecting Follow Me applies a lower Tone look-ahead/update interval/latency profile; selecting another mode restores the captured default profile. The choice is based on mode, including when paused. Changes to context timing can affect metronome and monitoring together.

### Optional expressive score playback

**More → Audio / Routing → Expressive score playback** is off by default. Its boolean preference `pt_expressivePlaybackEnabled` participates in settings backup/import/reset; older backups that omit it restore the default off state. Switching it during playback/count-in pauses through the existing output-cleanup path. Mode changes preserve the preference.

`js/score-expression.js` combines parsed OSMD expressions with read-only MusicXML wedge metadata from `js/score-expression-source.js`, without changing notes, engraving, cursor timing or expected-note matching. It supplies output parameters to the existing score-routing path, including deferred Follow Me accompaniment. The same velocities and durations reach App Audio and MIDI Out; live keyboard/virtual input and metronome behavior are unchanged.

- Fixed levels use MIDI velocities `ppp=28`, `pp=40`, `p=56`, `mp=72`, `mf=88`, `f=104`, `ff=116`, `fff=124`. Unmarked notes retain 100. Ordinary accents add 24 after any gradual-dynamic calculation, capped at 127. This emphasis is an application playback convention rather than a notation standard; these values are not grading criteria.
- Crescendos/diminuendos linearly interpolate velocity by score position for each new note attack. The first own-staff fixed dynamic strictly after the start becomes the target when it falls within or at the end of the span and agrees with the indicated direction; the ramp ends at that mark. Otherwise the endpoint changes by 16 velocity units, bounded to 28–124. The ending level persists until another expression on that staff takes over. New overlapping spans start from the current interpolated level; the latest start takes priority. Fixed markings take effect at their own positions even when they conflict with an earlier ramp's direction. Sustaining notes are not continuously amplified or retriggered.
- Untied staccato notes sound for 50% of their musical duration instead of the existing 90%. Tied notes retain combined sustain; a staccato marking on a tied note does not shorten it. Rhythmic advancement, feedback/LED sustain timing and tie-continuation exclusions retain their existing rules.
- Grading uses the existing expected-event/pitch rules, independently of the output gate. A staccato sound ending does not close the input window; Realtime retains its normal event boundary, while Wait/Follow retain their required-note progression. Played hold duration and velocity are not expression-grading criteria: a staccato marking does not require an earlier release, and dynamics/accents do not require harder or softer playing. See [grading regression evidence](DEVELOPMENT.md#expression-grading-checks).
- For sampled staccato attacks, Tone captures an 80 ms release envelope and the shared one-second default is immediately restored. No samples are added or replaced. Ordinary/live attacks keep the existing envelope; the experimental simple synth keeps its own envelope and receives the expressive duration/velocity.
- With expression enabled, simultaneous requests for the same MIDI pitch share the longest duration and strongest velocity on each destination. A shared pitch uses the short release only when every contributing request is staccato, so a staccato voice cannot cut an ordinary unison short. Immediate/deferred phases and local/MIDI destinations are kept separate. Source notes, individual feedback anchors and disabled playback are unchanged; this does not redesign overlapping-pitch lifetimes across different score events.
- The latest expression on a note's source staff takes priority. Before that staff's first fixed marking or gradual-dynamic start, it inherits the latest unambiguous expression level from the same instrument. This accommodates common piano files with markings on only one staff without overriding explicit independent staff dynamics. Parsed staff placement does not fully specify every author's intended voice/part scope; this is a basic playback convention, not full notation interpretation.
- Dynamics are queried by source position rather than playback history, including seeks and repeats. Cached metadata belongs to each loaded OSMD sheet; rebinding clears its previous source and resolver caches. Valid score-partwise source parts supply wedge start/stop positions from the MusicXML stream, mapped by part ID, staff identity and measure ordinal onto OSMD measure starts. Divisions, note durations, backup and forward determine only this expression clock; grace notes and additional chord tones do not advance it. Wedge numbers pair starts/stops within a part, with the starting staff retaining ownership. Only offsets marked `sound="yes"` affect playback, following the [MusicXML offset rule](https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/offset/); graphical placement never moves the playback boundary.
- Source wedge metadata replaces parsed wedges for each valid mapped part, recovering boundaries that OSMD shortened or collapsed. Missing, unsupported, malformed or ambiguous source parts retain the OSMD fallback; other valid parts remain usable. Text `cresc.`/`dim.` stays on OSMD's parsed spans, which may be auto-closed at score end. Fallback spans retain parsed ending offsets, and missing, invalid or nonpositive spans are ignored. The source parser never adds required notes or changes grace/cue-note matching. See [loading and source identity](SCORES_AND_STORAGE.md#import-paths-and-source-identity).
- Compound dynamics (`sfz`, `fp`), pedal, rubato, fermatas and other articulations are outside this feature. Sample velocity changes gain; the current sampler has no velocity-layer switching, and no additional samples are required for gradual dynamics.

Validation and remaining listening/device acceptance are recorded in [Development](DEVELOPMENT.md#basic-expression-checks) and [TODO](TODO.md).

Input boost affects local MIDI monitoring velocity. MIDI output volume is CC11 expression on the selected output channel; note velocities are separately normalized. Metronome output uses channel 10, independent of that selected channel. Devices differ in whether channel 10 produces percussion; verify on the user's instrument.

Saved MIDI output restoration applies the current CC11 expression level after selecting the available destination. Preference initialization runs before asynchronous WebMIDI access, so its earlier volume update alone cannot initialize a device. Restoration now sends the level on startup and device repopulation/reconnection; manual output/channel changes retain their existing sends. Missing/disconnected/None outputs receive no message, and restoring only an LED destination does not send playback expression. See `tests/midi-output-init.cjs` and the [issue #17 change record](CHANGELOG.md#2026-10-20-saved-midi-output-volume-initialization-no-application-release). Physical loudness remains device-dependent and needs acceptance separately from captured MIDI bytes.

Pause/reset attempts local release-all and MIDI CC64=0, CC123=0, and CC120=0. Scheduled score MIDI note-offs and sampled-score releases are now run-owned and cancelled on stop, preventing a previous run from releasing the next run's repeated pitch. Short channel-10 metronome note-offs still complete against their captured output to release clicks. See [playback lifecycle](PRACTICE_ENGINE.md#stopreset-boundaries-and-verification). Output-device/channel changes during a scheduled note still need acceptance checks on the old and new destinations.

`getSelectedMidiOutOutput()`, `sendMidiOutNoteOn()`, and `sendMidiOutNoteOff()` are declared in both `midi.js` and the later core script. Classic-script load order means the core declarations win at runtime. Consolidating them requires deliberate comparison of velocity/channel/echo behavior, not deleting a seemingly unused duplicate blindly.

### Expression comparison demo

Open **Scores → Demo Scores → Expressive Playback Demo**. This original CC0 study lasts about 20 seconds at its written quarter-note tempo of 96. Use Realtime with right-hand playback enabled, leave volume and tempo unchanged, and compare from the beginning with **Expressive score playback** off and then on. Toggling the option pauses playback, so restart the passage after switching it. The left hand rests throughout to keep the comparison clear.

| Measures | Listen for with expression enabled |
| --- | --- |
| 1–2 | The same short motif first sounds ordinary, then detached under the staccato dots. |
| 3–4 | Repeated C notes first sound even; the marked beats 2 and 4 in measure 4 gain emphasis. |
| 5–6 | Repeated C notes grow from **pp** to the written **f** on the last note of measure 6. |
| 7–8 | The same pitch becomes softer from **f** to **pp** on the final note. |

Explicit starting and ending levels make the ramps unambiguous and much larger than the modest targetless default. There are no articulations within the ramp sections and no sustained melody covering them. Expression off uses velocity 100 and the ordinary gate throughout.

Separate successive crescendos without ending dynamics do accumulate the chosen +16 steps, bounded at 124; diminuendos are bounded at 28. Written fixed dynamics reset the level. Replaying, seeking or looping the same passage does not add another increase/decrease: the result is determined by source position. The engine retains this modest default; the demo uses written targets for a clear comparison.

## LED pipeline and mapping

The core computes desired key states; `LedEngine` maps them to an RGB framebuffer and simulator/MIDI/WLED output. Mapping uses MIDI position within the derived player range, optional reverse, rounded LED index, and per-key calibration offsets clamped to strip length. Brightness and future brightness are separate multipliers; current preview depth is one despite legacy depth-2 fields/colors.

| State | RGB intent |
| --- | --- |
| Expected LH / RH | Blue / green |
| Correct/active | Warm gold |
| Wrong | Red |
| Future | Dimmer hand color |
| Calibration | White |

MIDI light output sends supported expected-hand states through its configured device/channel; it does not reproduce the full WLED RGB palette. Low-velocity mode uses velocity 1 instead of 100. The LED test controller retains a selected test output and active-note set for stop cleanup.

### Optional black-key colors

**Settings → LED Setup → Colors → Use distinct colors for black keys** is WLED-only and off by default. It saves `pt_ledBlackKeyColors` in localStorage and participates in Settings backup/import/reset. Older backups without the preference restore off. Enabling it immediately refreshes the existing shared LED framebuffer; switching output modes preserves the preference.

Expand **Customize colors** to use a color picker, type a six-digit hex value, or enter RGB as three comma-separated integers from 0 to 255. Left and right hands default to blue and green. Enabling distinct black keys reveals the two extra colors, initially violet `#6000FF` and teal `#00FF80`. Disabling the checkbox uses the ordinary hand colors for every key and remembers the extra colors. The strip uses physical key position regardless of score spelling.

Active and correct notes share gold `#B98219` by default. Wrong notes default to red and calibration to white. Master brightness scales the whole strip. Future notes use their hand color with the additional Future brightness setting. At very low brightness RGB rounding can obscure a tint. The virtual keyboard has its own display colors.

Changes save locally in `pt_ledPalette` and travel with settings export/import. Older backups use the original palette. **Reset colors to defaults** restores all seven colors and preserves brightness, the black-key checkbox and calibration offsets. [Checks and limits](DEVELOPMENT.md#black-key-led-color-checks)

`WLEDController` deduplicates frame signatures, keeps the newest queued frame, schedules flushes by animation frame, handles HTTP/helper timeouts, clears/reconnects the strip, and maintains status. Local `LedEngine.renderOutputs()` is also called continuously by the core's animation-frame loop. Frame deduplication limits network sends; animation-frame invocation does not mean every frame was sent to hardware.

## Transport contract

| Path | Implementation |
| --- | --- |
| WLED direct HTTP | Browser to `http://<wledIp>/json/state`; status through `/json/info`; tries JSON payload variants and a no-CORS fallback |
| Helper health | `GET http://127.0.0.1:4818/api/health`, with optional debug query |
| Helper frame | `POST /api/wled/frame` with `transport`, `wledIp`, `ledCount`, `sequence`, `clientSessionId`, `timestamp`, RGB `frame`, optional `debugEnabled` |
| Helper clear | `POST /api/wled/clear` with destination/count/session and bounded repeat request |
| DDP | Helper sends RGB data over UDP port 4048 |

The helper is optional, transport-only, and bound to localhost; there is no MIDI bridge. It supports HTTP JSON and DDP, but the app normally uses it for DDP only. DDP selection falls back to direct HTTP when helper availability is absent. A no-CORS send can return without readable confirmation; UI success is not proof that LEDs physically changed.

The helper keeps last sequence by IP/client session, skips older numbered frames, normalizes RGB values, and exposes last-frame status. JSON bodies are bounded to approximately 5 MiB. It does not currently bound all numeric `ledCount` inputs or expire sequence-map sessions. Preserve localhost binding and transport-only scope; any wider service exposure would require a separate design review.

Helper package metadata says 0.1.0 while `/api/health` reports runtime `HELPER_VERSION` 0.1.2. Document which is being inspected; do not use package version alone to infer protocol capabilities.

LAN app hosting does not expose the computer's helper to an iPad. Direct HTTP connectivity depends on the actual browser/network permissions. [Development](DEVELOPMENT.md) covers launchers; [LED setup](LED-Setup.md) covers hardware/calibration.

## Acceptance evidence

The October 20 browser smoke check reached startup, starter library, and score rendering through Live Server. WebMIDI was denied in that separate test browser. It did not verify physical input, latency, audio listening, metronome synchronization, or LED hardware. Use the [development matrix](DEVELOPMENT.md) for those checks and record actual device/browser details.
