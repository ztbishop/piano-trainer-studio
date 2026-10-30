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

Direct Open is temporary. Add File(s) uses the selected user folder, or Unfiled from All Scores/Unfiled/Demo Scores, without opening every score. It reports per-file progress, skips exact saved-content duplicates (including within the same batch), continues after read/conversion/storage failures, and lists added/already-saved/failed totals with filenames and errors. Added means stored, not a guarantee that every score will render. Conflicting library controls are disabled until completion; successful earlier writes remain if a later file fails.

The Current score area identifies the loaded score independently of search/folder selection. It shows Saved, Demo (not saved), or Not saved to library. Equality uses exact XML text or binary bytes, never filenames or converter-normalized MXL. Existing duplicates and starter copies are not removed. A retained library ID alone is insufficient after transposition.

Save to Library creates a new record only if the exact current content is not already saved. Already-saved content replaces that action with Save a copy for intentional duplicates. Neither action overwrites a record. Title and folder selection use modal dialogs with cancellation. A source snapshot prevents a later load from changing what an in-progress save writes. Save/backup-import feedback appears inline; backup merging follows the identity and preview rules below.

Transpose starts from `currentScoreOriginalData` every time. Saving the current transposed score stores the transformed data; reopening that saved record treats it as its own source. The record does not retain a separate full original/transpose history. See [Rendering and transpose](RENDERING_AND_TRANSPOSE.md).

## Library schema

Database: `pianoTrainerLibrary`, schema version 1. IDs use `crypto.randomUUID()` when available, with a timestamp/random fallback.

| Store | Fields | Indexes |
| --- | --- | --- |
| `folders` | `id`, `name`, `createdAt`, `updatedAt` | `by_name` |
| `scores` | `id`, `title`, `folderId`, `fileName`, `fileType`, `rawData`, `createdAt`, `updatedAt`, `lastOpenedAt` | `by_folderId`, `by_lastOpenedAt`, `by_title` |

`ScoreLibrary.transaction()` owns IndexedDB transaction completion/errors. It preserves the original request failure and waits for abort/rollback before reporting failure; failed database opens may be retried. Keep asynchronous work such as conversion outside an active write transaction; queue IDB requests through the existing transaction pattern.

Folder/score lists are loaded and sorted in JavaScript. Recent scores are selected by last-opened time. UI folder IDs `__all__` and `__unfiled__` represent views; real unfiled records have `folderId: null`. Multi-select move/delete and folder-with-scores deletion are explicit operations; ordinary `deleteFolder()` requires an empty folder.

Bundled demos are read from `assets/Starter_Scores.json` (16 scores) into a session cache and displayed in a permanent `__demos__` system folder at the bottom. They are never inserted into IndexedDB, included in All Scores/backups, renamed, moved, or deleted. Save to Library creates an ordinary editable copy. Existing starter folders/scores and the obsolete `pt_starterLibraryImported_v1` flag are left untouched; automatic starter seeding is removed.

Search filters the active folder by saved title, filename, and embedded MusicXML work/movement titles, case-insensitively. `scores-ui.js` caches extracted titles for the session; failed metadata extraction falls back to title/filename search and never prevents opening the original MXL. No stored title or raw data is rewritten.

Song menus download the saved payload, accurately labeled MusicXML or MXL. Converted imports have only their saved MusicXML; extra original-upload storage is not introduced. Folder exports use the existing version-1 backup structure containing that folder and its scores, including empty folders; full backups remain unchanged. Both use the same safe merge preview through Import Library (Merge).

## Backups and restore semantics

| Backup | Format | Restore behavior |
| --- | --- | --- |
| Score library | `{version: 1, exportedAt, folders, scores}`; binary data serialized as `{kind: 'arraybuffer', bytes: [...]}`, text as `{kind: 'text', text}` | Identity-aware merge with a preview; existing entries remain. Known identical entries are skipped, changed versions added separately, and uncertain matches kept separate by default. |
| Settings | `{version: 1, exportedAt, appVersion, settings}`; supported localStorage values plus fingerprinted hand assignments | Snapshots affected keys, writes supported entries and removes omitted resettable preferences, sets the first-run marker, and reloads only on success. Attempts rollback on failure; Web Storage cannot guarantee atomicity if access is revoked during rollback. Existing unrelated/assignment entries not explicitly cleared can remain. |
| LED calibration | Dedicated calibration JSON export/import in `led.js` | Applies calibration separately from songs; inspect calibration validation when changing its format. |

Both a library backup and settings backup are needed for a fuller move to a new browser/origin. Neither is a backup of source code, releases, or external analytics. Library backups validate version, unique IDs, folder references, metadata and text/binary payload structure before any write. Unsupported versions or malformed records reject the entire import. Settings backup validation follows the separate rules below.

### Settings backup validation and compatibility

`validateSettingsBackupPayload()` is pure: it validates the entire payload before the importer touches either preference store. Supported inputs are the exported numeric `version: 1` wrapper, an older unversioned `{settings: {...}}` wrapper, and an older flat settings map. An explicit unsupported/non-numeric version, malformed wrapper, empty/unknown-only payload or malformed supported value rejects the whole import. Informational export/app-version metadata does not control compatibility. A library backup is not a settings backup.

Global values are checked against the supported enums, integer control ranges and boolean/text types. Older string values and numeric/boolean primitives are accepted for their appropriate settings; they normalize to storage strings. Legacy null entries count as absent. Unknown/obsolete keys are ignored and never written. LED calibration must be JSON object text mapping MIDI notes 0–127 to integer offsets -40–40. Fingerprinted hand assignments must be JSON object text with supported staff/voice modes, roles, positive staff IDs, paired part/voice identities and a boolean accompaniment flag when present. Optional assignment fields remain supported for older data. Invalid known content is not silently clamped or partially imported.

Successful import retains the established replacement policy: resettable global preferences missing from the backup are removed, while unrelated keys, starter markers and hand assignments absent from the backup remain. Scores/folders are never accessed by settings import. Validation errors cause zero writes; storage failures during commit use the existing snapshot/rollback path, with an explicit warning if rollback itself fails. File read/parse failures do not import or reload. Export keeps version 1 and preserves stored values; it is not a repair operation for malformed saved preferences. See [isolated validation checks](DEVELOPMENT.md#settings-backup-validation-checks).

### Library merge identity and preview

Version-1 library and folder backups remain supported. Imported entries retain their incoming ID when available; collisions allocate a fresh local ID. Optional `mergeIds` arrays record source identities on folders/scores, including explicit associations with older imports. Export carries these arrays forward without changing the version-1 payload shape or database schema. Older app versions can read the score data but may forget these associations when they import it. Save a copy creates a new independent identity, not inherited merge history.

Matching reserves exact IDs first, then remembered identities, one-to-one. A score is already represented only when the identity and exact stored content match. Current titles, folder placement, timestamps and content remain unchanged; only internal import identities can be appended. Known identities with different content become separate versions, whose source identity is remembered so repeated imports do not keep adding that version. Multiple intentional entries in a backup are never mapped to a single existing entry.

Older imports that regenerated IDs cannot be linked with certainty. Exact content, title, filename, file type and resolved folder identify possible matches. The preview defaults to Keep separate, with an explicit Use existing entry option; that choice is remembered. A reused folder is matched by identity first, otherwise a unique case-insensitive trimmed name can be suggested. Users can keep a suggested folder separate instead. Ambiguous names and multiple distinct same-name incoming folders are not collapsed; empty folders are retained.

Identity, folder-name and score-metadata indexes narrow candidate searches; exact content comparison and one-to-one reservation still decide matches. Preview totals update as choices change. Cancel/Escape writes nothing. Validation and comparison do not parse, normalize, transpose or re-render music. MXL bytes and XML text remain exact. Commit rechecks both stores against the preview snapshot inside a single read/write transaction: intervening edits require a fresh preview; failed writes abort all folder, score and association changes. Settings, hand assignments and demos are not imported by a library backup.

Use disposable data and backups for restore/deletion tests. Never clear the user's browser storage for routine debugging.

## Preferences and lifecycle

`RESETTABLE_PREFERENCE_KEYS` is the canonical global settings allowlist. Key families cover device IDs/names/channels, piano size, audio/MIDI routing, volumes, UI display, debug, LED transport/brightness/calibration, and trainer/metronome options. Do not infer active persistence from a declared key alone.

- `seedFirstRunDefaults()` uses `pt_firstRunInit_20260321`; imports set the persistent first-run marker; the legacy session skip marker remains readable for compatibility.
- Input velocity and live low-latency monitoring are explicitly forced on at startup, even though legacy storage keys exist.
- Per-mode practice/playback hand choices live in `AppState.modeSettings`; old corresponding storage keys remain in the backup/reset list but are not used by current change handlers/startup restoration.
- Hand assignments use dynamic `pt_handAssignment_v1_<32 hex characters>` keys. They are included in settings export/import, but not the resettable global-preference list.
- Legacy starter-import and updater keys remain untouched but are no longer consumed. `pt_appearance` is included in settings backup/reset. Reset Settings is not a full wipe of the origin.
- All app preference access uses `appLocalStorage`/`appSessionStorage` from `storage.js`. Blocked getters, reads or writes produce a dismissible warning and session-only values. After a failure, writes remain in memory until reload; readable saved values remain available and no deferred defaults are flushed to disk. First-run defaults fill missing keys only. Settings export refuses incomplete/session-only data; import/reset reject unavailable storage and report failed rollback explicitly. Restore browser access and reload rather than clearing site data.
- IndexedDB remains a persistent-only library: failures never become an empty replacement database or a fake successful save. The drawer offers Retry library and bundled demos; direct Open File remains available. Saved status is unknown while reads fail, and a failed recent-open timestamp does not prevent score rendering.

There is no cross-origin/browser/device cloud sync. Hostname, scheme, and port define storage identity. A different Live Server port can appear to lose songs while leaving them in the previous origin.

## Hand/voice roles

`HandAssignment.initialize()` matches score-partwise XML parts to OSMD instruments and builds global staff identities. It defaults a unique recognized two-staff piano part to RH/LH when available, otherwise the first two staves; extras default to Ignore. Piano recognition uses the part name or MIDI program 1–8.

Voice keys combine part ID and XML voice ID. Only voices unambiguously matched to OSMD within their part appear as selectable voice mappings. Voice mode falls back to staff roles for unmapped/unavailable voices. Cross-staff suggestions require at least 8 notes and 90% concentration on one staff; applying them is an explicit user action.

Roles are left, right, accompaniment, or ignore. Accompaniment has a separate enable flag and uses the Other audio/MIDI routing bucket. A visible mute hint can offer to enable local accompaniment output. Role changes pause active playback, clear pending audio/visuals/reservations, invalidate preview, and rebuild the current group.

The persistence fingerprint is a deterministic identity hash, not a security hash or filename ID. Valid canonical MusicXML keeps its existing fingerprint unchanged. Whitespace/converter output changes can change it; identical XML can share assignments.

When canonical XML is missing, blank or malformed, identity falls back to the original source contents passed by `loadScoreIntoApp()`. Text and binary inputs have separate hash prefixes, distinct from canonical XML; Blob/File, ArrayBuffer and byte-view inputs resolve to their exact bytes (respecting view bounds). Names and library IDs do not affect identity. Identical source copies share assignments, while changed contents get a different identity. The original source is used across transpose operations; OSMD still receives the original MXL render payload without converter substitution.

Fallback permits staff assignments, with a notice that voice metadata is unavailable. If no usable source exists or it cannot be read, assignments are temporary for that load and do not read/write a shared identity. The historical empty-XML entry is neither read, migrated nor deleted because its owner cannot be determined. Fallback and canonical-XML assignments remain separate: when extraction succeeds again, the normal XML identity takes precedence rather than guessing a staff/voice migration. Repacking an MXL can change its raw-byte identity even if the music is unchanged.

Fallback keys retain the `pt_handAssignment_v1_<32 hex characters>` format, so current settings export/import includes them without a schema/version change. See [identity regression checks](DEVELOPMENT.md#hand-assignment-identity-checks).

## Before changing this subsystem

Check existing backup compatibility, repeat imports and intentional copies, starter markers, source/original identity, transpose reset, and score-local assignments. For migrations, define behavior for old payloads and storage failure before changing schema versions. See [Development](DEVELOPMENT.md) and [the review](CODE_REVIEW_2026-10-20.md).
