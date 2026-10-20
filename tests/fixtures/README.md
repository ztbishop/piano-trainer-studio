# MusicXML regression fixtures

`enharmonic-octaves.musicxml` is an original CC0 fixture. Open it through Scores → Open File on the existing Live Server; saving into the library is unnecessary.

Measure 1 contains B-sharp 4, C-flat 4, B-double-sharp 4 and C-double-flat 4. In Wait for Me, the expected MIDI pitches are:

| Transform from original | First four MIDI pitches | Sharp spelling equivalents |
| --- | --- | --- |
| Original/reset | 72, 59, 73, 58 | C5, B3, C-sharp 5, A-sharp 3 |
| Semitones +1 | 73, 60, 74, 59 | C-sharp 5, C4, D5, B3 |
| Semitones -1 | 71, 58, 72, 57 | B4, A-sharp 3, C5, A3 |
| Target D-flat major | 73, 60, 74, 59 | D-flat 5, C4, D5, B3 |

The harmony root/bass start at B-sharp/C-flat. Expected text after +1 is C-sharp/C, after -1 is B/A-sharp, and in D-flat key mode is D-flat/C. Inspect OSMD notation/key signature, play the corresponding virtual keys, and verify transpose Reset restores the original spelling. Each Apply must start from the original rather than accumulate shifts.

Measure 2 adds ordinary B4/C4 and endpoint A0/C8 notes. A shifted endpoint may lie outside the player's configured range; this fixture does not introduce a clipping policy. Unit tests check pitch arithmetic independently of player-range filtering.

This fixture deliberately omits explicit accidental elements. Microtones, timewise documents, staff-specific/mid-score keys, explicit accidental rewriting, instrument transposition and long tie chains remain separate investigations. It does not establish original-MXL engraving or hardware correctness.
