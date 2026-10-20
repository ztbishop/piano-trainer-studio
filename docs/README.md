# Developer documentation index

Start with the repository [AGENTS.md](../AGENTS.md). It owns strict requirements and working agreements; these documents explain the implementation and evidence without replacing those rules.

The October 20, 2026 review used local revision `b40e412` (application version 1.2.9). Subsequent code changes must update the relevant subsystem documents. A dated review remains a historical observation, not a promise that every finding is still open.

## Read by task

| Task | Read |
| --- | --- |
| Start a new chat or understand product scope | [Project context](PROJECT_CONTEXT.md) |
| Find module ownership, initialization, or integration boundaries | [Architecture](ARCHITECTURE.md) |
| Change menu sliders, numeric buttons, layout, or their setting handlers | [Menu numeric controls](UI_CONTROLS.md) |
| Run locally, test, prepare an update | [Development](DEVELOPMENT.md) |
| Find requested enhancements, outstanding fixes, and investigations | [To-do list](TODO.md) |
| Change modes, grading, repeats, loops, early input, or metronome timing | [Practice engine](PRACTICE_ENGINE.md) |
| Change import, library, backups, preferences, or hand assignment | [Scores and storage](SCORES_AND_STORAGE.md) |
| Diagnose feedback placement, resize, MusicXML, or transpose | [Rendering and transpose](RENDERING_AND_TRANSPOSE.md) |
| Change MIDI, audio routing, virtual input, keyboard range, or WLED | [MIDI, audio, and LEDs](MIDI_AUDIO_LED.md) |
| See reproduced issues and recommended follow-up work | [October 20 code review](CODE_REVIEW_2026-10-20.md) |
| Understand available history and record future meaningful changes | [Change history](CHANGELOG.md) |
| Set up/calibrate LED hardware | [LED setup](LED-Setup.md) |

## Current versus historical material

- [DEV_NOTES.md](DEV_NOTES.md) preserves older investigations, changelog fragments, and former filenames. It is useful evidence when diagnosing a regression, not a source to restore wholesale.
- [Practice Mode Behaviors.txt](Practice%20Mode%20Behaviors.txt) records earlier behavior descriptions. Current source-level details, including Follow Me tap carry and late-hit waits, are in `PRACTICE_ENGINE.md`.
- [Repeat marker delays - fixes.txt](Repeat%20marker%20delays%20-%20fixes.txt) explains the origin of current-measure remainder timing. Keep that protection when changing traversal.
- [Prompt Context.txt](Prompt%20Context.txt) is a compatibility entry point for older prompts.
- The Guitar Trainer repository was consulted for documentation organization: subsystem ownership, evidence, and explicitly pending acceptance checks. Its instrument-specific policies, renderer, filters, and test counts do not apply here.

## Evidence and maintenance

Keep implementation facts, desired behavior, reproduced defects, and unverified hypotheses distinct. Source references below use relative paths/function names so they work in the checkout and on GitHub. Prefer inspecting the function over assuming line numbers stay fixed.

Run the read-only [review probes](diagnostics/review-probes.cjs) with:

```powershell
node docs/diagnostics/review-probes.cjs
```

The probes read actual source and use isolated mocks; they do not start servers, connect MIDI/LEDs, modify browser storage, or change application files. `issueObserved: true` means the documented issue was observed by that probe, not that application regression testing passed. The tie case is explicitly conditional on a synthetic object topology. They are diagnostics, not an application test suite; see the dated review for interpretation.

When completing a change, update the relevant current document and record meaningful behavior/validation in `CHANGELOG.md`. Do not generate a new release number, tag, or long historical narrative for every small edit. The user still owns commits and pushes.

Maintain related entries in `TODO.md` as work proceeds: record material newly discovered follow-ups, keep unverified risks distinct from reproduced defects, and link completed fixes to actual validation. Recording an item does not authorize expanding the current task to implement it.
