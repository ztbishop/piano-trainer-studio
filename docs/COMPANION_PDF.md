# Practice with a companion PDF

Open the digital score in **Scores**, then choose **Attach PDF** and select the local printed edition. MusicXML, MXL and scores opened through the existing MIDI or Guitar Pro importer all supply the trainer's notes and timing. The PDF supplies the page you read. The virtual keyboard, hand assignments, grading and three practice modes still use the digital score.

The reader finds measure boxes on each page. One box should cover both piano staves, even through a full-measure rest in one hand. Click a box to pause and seek. When several score visits use the same box, the reader chooses the nearest visit allowed by the loop. **Score visit** lets you choose another eligible pass. **Show notation** returns to the digital view. **Scores → Show PDF** reopens the attached pages.

## Repeats and endings

A **visit** is one measure in playback order. For a score with repeat signs, OSMD supplies the order and each pass initially points to the same printed measure. A MIDI export can instead contain separate digital measures for each pass. The reader starts with matching measure numbers. Check the mapping when the arrangement differs from the print.

For the included study, the PDF shows four measures and the MIDI plays six. The intended printed sequence is **1, 2, 1, 2, 3, 4**.

1. Open **Map repeats and endings**. Set **From visit** to 3, **Through visit** to 4 and **First printed measure** to 1. Click **Map range**. Both visits now point to the printed repeat.
2. Map visits 5–6 to printed measures starting at 3. To correct an individual ending, choose the same first and last visit and enter its printed measure.
3. Choose **Leave unmapped** for a digital introduction, interlude or other passage absent from the PDF. The trainer continues through it with the PDF highlight cleared. The visit selectors show the current assignments.
4. Use **Loop** with digital score measure numbers. In the MIDI study, set beginning 3 and ending 4 to practice the second pass. Both printed boxes highlight again and boxes outside the loop are shaded. In Wait mode, the highlight holds until all required notes have been played. **Auto-scroll** controls whether the PDF follows a highlighted box onto another page.

## Correct the printed boxes

Choose **Mark measures**. Select a printed measure and drag its rectangle around the grand staff. A blue divider adjusts the two neighboring boxes together and supports the arrow keys. **Find boxes on page** lets you redraw, split, join or remove proposals before applying them. Review the first measure number and select **Replace saved boxes on this page** if you intend to replace existing geometry. Choose **Done marking** to practice.

Edits to boxes and assignments are kept in this browser for the digital score identity and PDF fingerprint. Reattach the PDF after reopening the score. Keep the PDF file separately. Current library and settings backups do not include the PDF or its mapping. Poor scans, unconnected staves or unusual page layouts can need manual correction.

## Implementation and credits

The page reader, editable box and divider tools, raster detector and editor layout come from Guitar Trainer Studio at commit `1e68d3e` under the project AGPL. Piano Trainer adapts them to OSMD visit positions and the existing looper. The detector recognizes the opening repeat dots on a paired piano staff. The local Mozilla PDF.js 6.5.438 distribution supplies the renderer, worker, maps, fonts and codecs with their accompanying licenses. [Guitar Trainer source](https://github.com/ztbishop/guitar-trainer-studio/tree/1e68d3e) · [Project license](../LICENSE) · [PDF.js provenance](../assets/vendor/pdfjs/SOURCE.md) · [PDF.js license](../assets/vendor/pdfjs/LICENSE)

The original CC0 two-page study and its MuseScore Studio 4.7.6 PDF and MIDI exports are checked in with the regression fixtures. [MusicXML](../tests/fixtures/grand-staff-repeat.musicxml) · [PDF](../tests/fixtures/grand-staff-repeat.pdf) · [MIDI](../tests/fixtures/grand-staff-repeat.mid)
