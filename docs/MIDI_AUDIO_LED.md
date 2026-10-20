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

Input boost affects local MIDI monitoring velocity. MIDI output volume is CC11 expression on the selected output channel; note velocities are separately normalized. Metronome output uses channel 10, independent of that selected channel. Devices differ in whether channel 10 produces percussion; verify on the user's instrument.

Pause/reset attempts local release-all and MIDI CC64=0, CC123=0, and CC120=0. Individual scheduled note-offs are not all run-owned/cancelled; the review records the related lifecycle risk. Output-device/channel changes during a scheduled note need acceptance checks on the old and new destinations.

`getSelectedMidiOutOutput()`, `sendMidiOutNoteOn()`, and `sendMidiOutNoteOff()` are declared in both `midi.js` and the later core script. Classic-script load order means the core declarations win at runtime. Consolidating them requires deliberate comparison of velocity/channel/echo behavior, not deleting a seemingly unused duplicate blindly.

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
