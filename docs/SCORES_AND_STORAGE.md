# Score loading, hand assignment, and storage

Sources: [score-library.js](../js/score-library.js), [scores-ui.js](../js/scores-ui.js), [midi-import.js](../js/midi-import.js), [hand-assignment.js](../js/hand-assignment.js), [trainer-state.js](../js/trainer-state.js), and score-loading functions in [trainer-core.js](../js/trainer-core.js).

## Import paths and source identity

| Input | Path and stored data |
| --- | --- |
| `.xml`, `.musicxml` | Text MusicXML; normal OSMD load |
| `.mxl` | Original compressed `ArrayBuffer`/binary payload for OSMD; separate canonical XML extraction for assignment/transpose |
| `.mid`, `.midi`, `.mscz`, `.mscx`, `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gtp`, `.ptb` | `MidiImport.convertFileToScore()` lazily loads bundled webmscore and returns `.musicxml` text |

Accepted extension does not guarantee conversion compatibility. Converted MIDI does not reconstruct the composer's original engraving/voice/hand intent. Conversion is local to the browser; no conversion service is called by the wrapper. The supplied webmscore package metadata says `0.21.0-a`; it is vendored, not installed at startup.

`loadScoreIntoApp()` stops old playback, resets speed to 100% unless preserving transpose state, clones original/render sources, obtains canonical XML, loads/renders OSMD, initializes score UI and assignments, resets the cursor, invalidates preview, and updates current-score metadata. Loop bounds are reset to the loaded score's range. A library open also updates its recent-open timestamp.

MXL XML extraction reads ZIP entries and container metadata, supports stored/deflated entries through `DecompressionStream`, and falls back to converter export if needed. This fallback supports metadata/transposition only; ordinary OSMD rendering still uses original MXL. If canonical XML cannot be obtained, ordinary rendering may work while voice metadata/transpose are limited. See the review for empty-source assignment identity risk.

Direct Open is temporary. Add File(s) imports into a chosen library folder without loading every score. Bulk imports run sequentially: if a later file fails, earlier saves can remain. Save Current creates a new score record; it is not an overwrite operation.

Transpose starts from `currentScoreOriginalData` every time. Saving the current transposed score stores the transformed data; reopening that saved record treats it as its own source. The record does not retain a separate full original/transpose history. See [Rendering and transpose](RENDERING_AND_TRANSPOSE.md).

## Library schema

Database: `pianoTrainerLibrary`, schema version 1. IDs use `crypto.randomUUID()` when available, with a timestamp/random fallback.

| Store | Fields | Indexes |
| --- | --- | --- |
| `folders` | `id`, `name`, `createdAt`, `updatedAt` | `by_name` |
| `scores` | `id`, `title`, `folderId`, `fileName`, `fileType`, `rawData`, `createdAt`, `updatedAt`, `lastOpenedAt` | `by_folderId`, `by_lastOpenedAt`, `by_title` |

`ScoreLibrary.transaction()` owns IndexedDB transaction completion/errors. Keep asynchronous work such as conversion outside an active write transaction; queue IDB requests through the existing transaction pattern.

Folder/score lists are loaded and sorted in JavaScript. Recent scores are selected by last-opened time. UI folder IDs `__all__` and `__unfiled__` represent views; real unfiled records have `folderId: null`. Multi-select move/delete and folder-with-scores deletion are explicit operations; ordinary `deleteFolder()` requires an empty folder.

Starter data is a version-1 library backup at [Starter_Scores.json](../assets/Starter_Scores.json), containing 3 folders and 16 scores in the reviewed revision. `pt_starterLibraryImported_v1` prevents repeat imports. If existing scores are present, the marker is set without adding starters. Deleting all songs later does not automatically reseed them while that marker remains.

## Backups and restore semantics

| Backup | Format | Restore behavior |
| --- | --- | --- |
| Score library | `{version: 1, exportedAt, folders, scores}`; binary data serialized as `{kind: 'arraybuffer', bytes: [...]}`, text as `{kind: 'text', text}` | Additive import with new IDs; folder links remapped; existing library remains. Reimporting can duplicate songs/folders. |
| Settings | `{version: 1, exportedAt, appVersion, settings}`; supported localStorage values plus fingerprinted hand assignments | Clears the known resettable global preferences, imports supported entries, sets first-run markers, and reloads. Existing unrelated/assignment entries not explicitly cleared can remain. |
| LED calibration | Dedicated calibration JSON export/import in `led.js` | Applies calibration separately from songs; inspect calibration validation when changing its format. |

Both a library backup and settings backup are needed for a fuller move to a new browser/origin. Neither is a backup of source code, releases, or external analytics. Current imports are permissive and do not reject unknown backup versions; schema-validation hardening is a recommendation, not an implemented guarantee.

Use disposable data and backups for restore/deletion tests. Never clear the user's browser storage for routine debugging.

## Preferences and lifecycle

`RESETTABLE_PREFERENCE_KEYS` is the canonical global settings allowlist. Key families cover device IDs/names/channels, piano size, audio/MIDI routing, volumes, UI display, debug, LED transport/brightness/calibration, and trainer/metronome options. Do not infer active persistence from a declared key alone.

- `seedFirstRunDefaults()` uses `pt_firstRunInit_20260321`; imports use a session skip marker to avoid overwriting imported values on reload.
- Input velocity and live low-latency monitoring are explicitly forced on at startup, even though legacy storage keys exist.
- Per-mode practice/playback hand choices live in `AppState.modeSettings`; old corresponding storage keys remain in the backup/reset list but are not used by current change handlers/startup restoration.
- Hand assignments use dynamic `pt_handAssignment_v1_<32 hex characters>` keys. They are included in settings export/import, but not the resettable global-preference list.
- Starter-import and asset/update overrides are separate from the ordinary resettable list. Reset Settings is not a full wipe of the origin.
- Many global storage reads/writes are unguarded. Hand-assignment storage has its own fallback warning, but that does not make the entire app safe when localStorage is blocked.

There is no cross-origin/browser/device cloud sync. Hostname, scheme, and port define storage identity. A different Live Server port can appear to lose songs while leaving them in the previous origin.

## Hand/voice roles

`HandAssignment.initialize()` matches score-partwise XML parts to OSMD instruments and builds global staff identities. It defaults a unique recognized two-staff piano part to RH/LH when available, otherwise the first two staves; extras default to Ignore. Piano recognition uses the part name or MIDI program 1–8.

Voice keys combine part ID and XML voice ID. Only voices unambiguously matched to OSMD within their part appear as selectable voice mappings. Voice mode falls back to staff roles for unmapped/unavailable voices. Cross-staff suggestions require at least 8 notes and 90% concentration on one staff; applying them is an explicit user action.

Roles are left, right, accompaniment, or ignore. Accompaniment has a separate enable flag and uses the Other audio/MIDI routing bucket. A visible mute hint can offer to enable local accompaniment output. Role changes pause active playback, clear pending audio/visuals/reservations, invalidate preview, and rebuild the current group.

The persistence fingerprint is a deterministic identity hash of canonical source XML, not a security hash or filename ID. Whitespace/converter output changes can change it; copying identical XML can share assignments. Unavailable canonical XML currently falls back to an empty input, which needs a safer identity policy before promising score-local persistence for every MXL.

## Before changing this subsystem

Check existing backup compatibility, new-ID additive import, starter markers, source/original identity, transpose reset, and score-local assignments. For migrations, define behavior for old payloads and storage failure before changing schema versions. See [Development](DEVELOPMENT.md) and [the review](CODE_REVIEW_2026-10-20.md).
