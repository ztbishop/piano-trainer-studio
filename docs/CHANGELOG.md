# Change history and future update records

## How to use this file

Record meaningful behavior, workflow, or architectural changes with their purpose, actual validation, and pending acceptance. Small related edits can share an entry. This is not a replacement for Git history or a requirement to release/tag every commit.

For future work:

1. Check Git status and inspect current code/docs.
2. Make the requested focused change; update the relevant subsystem document.
3. Run appropriate checks and record remaining browser/hardware acceptance honestly.
4. Provide a suggested commit title and description. The user chooses when to commit, group related edits, bump release versions, tag, and push.

Versions identify chosen releases; commits preserve implementation history. Detailed messages are useful, but old broad version-only messages do not erase their diffs. Do not rewrite old commits/tags to invent a finer history. `git log -- path`, `git show <commit> -- path`, and `git blame` can still investigate the recorded snapshots. Uncommitted/intermediate edits never saved in Git cannot be reconstructed reliably from version labels.

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
