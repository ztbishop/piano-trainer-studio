# Piano Trainer Studio: project instructions

## Start here

- Check Git status before editing. Preserve existing user changes; never reset or discard them.
- Read `docs/PROJECT_CONTEXT.md` for current capabilities and decisions, then the documentation relevant to the requested change.
- Use `docs/ARCHITECTURE.md` for module boundaries and `docs/DEVELOPMENT.md` for running, testing, and release guidance.
- Inspect the current implementation before editing. The current working tree is the implementation baseline; historical chat attachments and old filenames are not replacement sources.
- Implement only the requested scope. Preserve existing behavior except for explicitly requested changes. Do not reintroduce removed score logic or UI controls.
- Future ideas and historical discussion are context, not authorization to implement them.

## Strict rendering and feedback requirements

- Preserve OSMD/VexFlow engraving, beam layout behavior, and the existing anchor coordinate system. Do not recalculate beam groups during resize or introduce a separate beam re-layout after the initial render.
- Beam groups must never drift when the window resizes.
- Feedback notes must anchor to the original rendered VexFlow note positions using the established geometry/cache pipeline. Never replace them with cursor centers or independently recalculated musical positions.
- Preserve separate anchors for simultaneous chord notes, including side-shifted same-stem noteheads. Do not collapse distinct XML notes merely because their timestamps match.
- Preserve notehead selection safeguards for ornaments, lead-ins, augmentation dots, fingering, lyrics, and annotations.
- Clef changes must not displace feedback notes; fallback MIDI notes and accidentals must remain on the correct staff lines.
- Hidden/non-rendered cue or ornamental notes must not become required ghost notes.
- Keep debug overlays in their own layer. Diagnostics must not own production matching or geometry rules or interfere with rendering.
- Pass original MXL data directly to OSMD for ordinary rendering. Never substitute converter-normalized XML as the ordinary MXL render source. Separate XML extraction for hand assignment/transposition and explicitly requested transposition remain supported.

## Strict timing, input, and routing requirements

- Keep `trainer-timing.js` limited to timing calculations. Cursor advancement and orchestration belong in `trainer-core.js`.
- Preserve current-measure remainder timing for realtime structural jumps, backward repeats, and alternate-ending skips. Do not replace it with first-note fallback lengths or raw iterator timestamp deltas for those transitions.
- Preserve count-in handoff, metronome synchronization, score tempo changes, tempo scaling, ties, and loop boundaries. Do not rewrite the playback scheduler as incidental cleanup.
- Preserve the differences between Realtime, Wait for Me, and Follow Me. Preserve one-hand early-input handling, rest/inactive-hand progression, wrong-note suppression, and prevention of already-satisfied-note deadlocks.
- Mode changes must not overwrite saved audio/MIDI routing preferences. Preserve immediate output cleanup on pause/reset and audio recovery on focus/resume.
- MIDI input must continue through `triggerVirtualKey()` so matching, scoring, audio, and LEDs share the existing path.
- Hand roles are performance roles, independent of display staff/clef. Preserve voice mapping across staves, staff fallback, accompaniment/ignore behavior, and score-specific persistence.
- Preserve the shared LED frame pipeline and keep the Node helper transport-only.
- Preserve existing browser data and backup compatibility. Never clear storage as part of routine testing.

## Validation and documentation

- Follow the affected-area regression checklist in `docs/DEVELOPMENT.md`. Run appropriate checks and state exactly what was and was not tested.
- Before finalizing code changes, run syntax checks for changed JavaScript and exercise the affected behavior in the browser when browser access is available. Run any relevant automated tests if present; add focused regression coverage when practical for a substantive bug fix. Do not stop at suggesting tests that you can run yourself.
- For UI changes, inspect the result at relevant viewport sizes and verify the affected controls. For playback/input changes, exercise the affected practice modes and navigation paths. Hardware-dependent checks may require the user's MIDI piano/LED setup; report them as pending when unavailable.
- Syntax checks do not establish browser, MIDI, engraving, timing, or hardware correctness. Do not report unperformed manual checks as passed.
- For work affecting protected systems, verify the relevant regression cases. If required scores/hardware are unavailable, identify the outstanding verification in the handoff.
- Keep fixes to fragile systems focused. Avoid unrelated refactors, vendor-library changes, dependency additions, and UI redesigns.
- Update the relevant current documentation when behavior, architecture, workflows, limitations, or project rules change. Avoid duplicating rules across documents; link to their canonical location.
- Historical notes in `docs/DEV_NOTES.md` explain past fixes, not current setup or release policy.
- Do not bump application versions for documentation-only changes. Follow `docs/DEVELOPMENT.md` when a release/version update is requested.

## Git and completion handoff

- The user owns commits and pushes. Do not commit, push, tag, merge, or publish a release unless explicitly asked.
- After every update that changes project files, summarize the changes, validation results, and remaining risks or manual checks.
- Include a suggested Git commit title and description in the final response, ready for the user to copy. Keep the title concise and imperative; the description should explain the final change and actual validation. Label tests that were not run and omit claims about unverified behavior.
- For a read-only chat with no changes, state that no commit is needed.
- End with the Git status/change scope so the user can review and commit the work.
