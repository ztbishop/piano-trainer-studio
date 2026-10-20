# Change history and future update records

## How to use this file

Record meaningful behavior, workflow, or architectural changes with their purpose, actual validation, and pending acceptance. Small related edits can share an entry. This is not a replacement for Git history or a requirement to release/tag every commit.

For future work:

1. Check Git status and inspect current code/docs.
2. Make the requested focused change; update the relevant subsystem document.
3. Run appropriate checks and record remaining browser/hardware acceptance honestly.
4. Provide a suggested commit title and description. The user chooses when to commit, group related edits, bump release versions, tag, and push.

Versions identify chosen releases; commits preserve implementation history. Detailed messages are useful, but old broad version-only messages do not erase their diffs. Do not rewrite old commits/tags to invent a finer history. `git log -- path`, `git show <commit> -- path`, and `git blame` can still investigate the recorded snapshots. Uncommitted/intermediate edits never saved in Git cannot be reconstructed reliably from version labels.

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
