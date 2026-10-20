# Practice engine and timing

Sources: [trainer-core.js](../js/trainer-core.js), [trainer-timing.js](../js/trainer-timing.js), [feedback-engine.js](../js/feedback-engine.js), and [trainer-state.js](../js/trainer-state.js). Strict protections remain in [AGENTS.md](../AGENTS.md). This describes the reviewed implementation, including limitations, rather than an idealized scheduler.

## State, units, and cursor ownership

| Value | Meaning |
| --- | --- |
| `note.halfTone + 12` | MIDI pitch used for matching/playback |
| `Length.RealValue`, iterator timestamps | Whole-note units; multiply by four to obtain quarter-note beats |
| `baseBpm * speedPercent` | Effective BPM; `speedPercent` is a ratio such as 0.5, while the UI uses 50 |
| `anchorTime`, `Tone.now()` | Audio-clock seconds |
| `durationMs`, timeout delays | Milliseconds |
| `CurrentMeasureIndex` | Zero-based measure index; loop/display controls are one-based |

`AppState.currentExpectedContext` identifies the event being graded. The OSMD iterator can already point at the following event because `playbackLoop()` advances it before waiting. Do not match a key solely against the iterator's current position.

The timing cache and LED preview timeline both temporarily reset and traverse the same cursor, then restore measure/timestamp. Preview is also used by early-input matching, so it is not merely a cosmetic LED feature. The traversals have 100,000-step safety limits. Preserve cursor and viewport during these operations, especially through repeats and count-in.

## One playback event

`startPlaybackFromToolbar()` resumes audio, optionally enters fullscreen, builds preview while preserving scroll, applies the mode latency profile, and starts count-in. Its callback starts Tone transport and `playbackLoop()`.

For a nonempty event, `playbackLoop()`:

1. Reads current measure/timestamp, applies a score tempo change, and builds expected notes/visuals.
2. Saves the matching context and renders feedback/keyboard states.
3. Resolves hand roles and routes selected score notes to audio/MIDI. Non-practiced-hand output can be deferred until the practiced notes are satisfied.
4. Moves the iterator forward and asks `PTTiming` for the interval to wait.
5. Handles loop boundaries, metronome scheduling, and mode-specific waiting.
6. On advancement, processes missed notes, updates the visible cursor, scrolls if enabled, and enters the next event.

Empty-entry traversal uses animation-frame continuation. A score ending without an enabled loop pauses playback. Loop restarts clear feedback and reset correct/wrong totals; optional loop count-in precedes the next pass. See the review's `WAIT-LOOP-GATE` finding: the current loop-boundary branch occurs before the Wait/Follow gate and can restart with an unsatisfied final event.

## Modes and routing

| Mode | Progression | Hand controls |
| --- | --- | --- |
| Realtime | Advances continuously against an accumulated audio-clock anchor; no wait for correctness | Practice and score-playback hands independently selectable |
| Wait for Me | Blocks on unsatisfied required notes; satisfied groups and groups with no required notes continue through a short callback | Practice hands selectable; score-playback hands disabled/default off |
| Follow Me | Waits for correct input while adapting progression delays to player timing | Exactly one practice hand; playback automatically uses the opposite hand |

`getCurrentModeSettings()` and `syncActiveHandStateFromMode()` separate per-mode hand choices from output-routing flags. Choices in `modeSettings` live in memory; they are not restored from the legacy `pt_practiceLeft/Right` and `pt_audioLeft/Right` keys. The mode itself and audio/MIDI routing flags are persisted. Do not promise that all hand toggles survive reload.

Wait's UI says score playback is unavailable and disables accompaniment routing controls, but saved routing flags remain intact. The engine's routing branch should be checked separately if changing accompaniment behavior; disabled controls alone are not a playback policy.

## Matching and scoring

`buildExpectedNotesFromEntries()` uses hand roles and enabled practice hands. It excludes rests, tie continuations, hidden/non-rendered cue/ornamental notes, and notes outside the configured player range. Out-of-range targets are tracked separately rather than blocking a smaller keyboard.

Current groups deduplicate by `staffId|handRole|midi`, not by XML-note identity. Across different pitches/staves roles remain separate; same-pitch same-staff voices can collapse. This is a design tension with strict preservation of distinct XML-note anchors; see the review before changing it.

`findExpectedMatchForMidi()` chooses an unhit matching pitch; if multiple candidates exist, rendered anchor proximity to cursor X breaks ties. A key attack can:

- Hit a required note: add correct credit, draw its anchored feedback, and mark it hit.
- Match an already satisfied/sustained note: suppress a false wrong result without adding fresh credit.
- Reserve a future note: defer credit until its target event is built.
- Match none of those: count a wrong attack and show wrong feedback.

Unhit required notes add wrong counts during `processMissedNotes()`. In Realtime, a wrong attack in the current context suppresses redundant red missed-target visuals, but it does not suppress missed-note penalties. Accuracy is `correct / (correct + wrong)`, not a duration-weighted score or a timing-error statistic.

`pressedKeys` and early reservations are keyed by MIDI pitch, not physical hand, source, or channel. Simultaneous identical pitches across channels/devices are therefore not independent attacks/holds.

## Early input and Follow Me waits

- `tryReserveRealtimeUpcomingHeldNote()` searches future timeline events within 1.1 quarter-note beats and requires the note to remain held for carry.
- `tryReserveSingleHandEarlyGrace()` applies only with one practice hand and no unsatisfied current group. Follow Me permits tap carry: the note may be released before its target. In Realtime this path allows tap carry within 1.05 beats.
- Building the target group consumes eligible reservations and adds credit. If all required notes are already satisfied, a callback enters `checkWaitModeAdvance()` to avoid waiting for a redundant keydown.
- Repeated satisfied notes, sustain matches, and reservations are checked before classifying wrong input. Preserve that order when fixing false errors.

Follow Me uses remaining scheduled time when positive. Late hits, or a remaining delay below 60% of the full interval, use the full interval to avoid a catch-up burst. Thus old notes saying it always uses the remaining time are incomplete. Empty-practice events follow tempo in Follow Me; Wait skips them with a short delay.

## Repeats, meter, ties, and metronome

`PTTiming.getTraversalBeatsToWait()` uses playable current-measure remainder for backward timestamp movement and jumps over more than one measure. Ordinary progression uses the timestamp difference. `getRemainingMeasureWaitWhole()` prefers actual cached measure length, then nominal meter, then a fallback if data is unavailable. Keep those units distinct.

`rebuildMeasureTimingCache()` derives event starts and observed next starts while traversing the score, with meter fallback. Pickup measures, long rests, repeat topology, and empty measures require real-score tests; nominal meter alone is insufficient.

`getCombinedTieLength()` attempts same-pitch tie traversal. The synthetic three-segment/shared-array case is incomplete in the current helper; real OSMD tie topology needs a fixture before a fix. Score playback uses 90% of calculated duration, while visual sustain has its own shortening rules.

Metronome clicks can be local or MIDI channel 10. Wait uses a dedicated ticking path; other progression windows schedule clicks from musical timing. Count-in currently uses the meter numerator with `60 / effectiveBpm` seconds per click, so compound/denominator-sensitive meter should be acceptance-tested rather than assumed correct.

## Stop/reset boundaries and verification

Pause stops transport/metronome work, releases audio voices, sends output sustain-off/all-notes-off/all-sound-off, clears transient matching state, and clears hardware guidance. Reset additionally clears scores/feedback and moves to score/loop start.

`activeTimeouts` still tracks selected visual timers. Playback/count-in timeouts, empty-event animation frames, score-note releases and delayed MIDI metronome attacks now use a separate run-owned cancellation pipeline in core. Pause, reset, score load and active/pending-start mode changes invalidate the run and clear queued continuations. Guards also reject callbacks already dispatched from a previous run. Loop count-in stays within the current run; musical wait calculations are unchanged. Async toolbar startup ignores superseded audio/fullscreen completion and prevents duplicate pending starts. Deferred sampled score audio carries its run identity. Short MIDI metronome note-offs retain their captured output and complete so channel-10 clicks are released; live monitoring and device-switch identity remain separate. See `tests/playback-lifecycle.cjs` and the [change record](CHANGELOG.md#2026-10-20-playback-callback-ownership-no-application-release) for actual coverage and pending acceptance.

Use the [development matrix](DEVELOPMENT.md) for mode, repeat, loop, tie, early-input, and pause/restart tests. The [dated review](CODE_REVIEW_2026-10-20.md) distinguishes isolated reproductions from pending browser/hardware checks.
