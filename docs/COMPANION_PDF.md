# Practice with a companion PDF

Open the digital score in **Scores**, then choose **PDF → Attach PDF** and select the local printed edition. MusicXML, MXL and scores opened through the existing MIDI or Guitar Pro importer all supply the trainer's notes and timing. The PDF supplies the page you read. The virtual keyboard, hand assignments, grading and three practice modes still use the digital score.

A new score/PDF pair opens in **Mark measures** with a blank map. Drag a box around the first measure, covering both piano staves even when one hand rests. The measure selector advances after each box. Or choose **Find boxes in score** to review suggested boxes. Choose **Done marking** when you are ready to practice. Reattaching the same pair with saved boxes opens directly in reading view, even if you marked only part of the score.

Click a box in reading view to pause and seek. When several score visits use the same box, the reader chooses the nearest visit allowed by the loop. **Score visit** lets you choose another eligible pass. **Show notation** returns to the digital view. **Scores → PDF → Show PDF** reopens the attached pages.

## Repeats and endings

A **visit** is one measure in playback order. For a score with repeat signs, OSMD supplies the order and each pass initially points to the same printed measure. A MIDI export can instead contain separate digital measures for each pass. The reader starts with matching measure numbers. Check the mapping when the arrangement differs from the print.

For the included study, the PDF shows four measures and the MIDI plays six. The intended printed sequence is **1, 2, 1, 2, 3, 4**.

1. Open **Map repeats and endings**. Set **From visit** to 3, **Through visit** to 4 and **First printed measure** to 1. Click **Map range**. Both visits now point to the printed repeat.
2. Map visits 5–6 to printed measures starting at 3. To correct an individual ending, choose the same first and last visit and enter its printed measure.
3. Choose **Leave unmapped** for a digital introduction, interlude or other passage absent from the PDF. The trainer continues through it with the PDF highlight cleared. The visit selectors show the current assignments.
4. Use **Loop** with digital score measure numbers. In the MIDI study, set beginning 3 and ending 4 to practice the second pass. Both printed boxes highlight again and boxes outside the loop are shaded. In Wait mode, the highlight holds until all required notes have been played. **Auto-scroll** controls whether the PDF follows a highlighted box onto another page.

## Correct the printed boxes

Choose **Mark measures → Find boxes in score** from any page. The scan starts at page one and processes one page at a time in printed order. Choose **Use score boxes** to accept the set. To correct a page, redraw, split, join or remove its proposed boxes, then choose **Review next page**. Its first measure number follows the count you just approved. You can adjust **First measure** on each page. **Use score boxes** also accepts the remaining pages, and **Save reviewed pages** finishes on the last page. **Cancel** discards the draft, including earlier pages in this review.

A rescan keeps hand-drawn boxes, adjusted dividers and boxes from older saved mappings. The editor flags a number claimed by two pages or numbering past the last written digital measure and blocks saving until you resolve it. Repeat and ending assignments survive a rescan.

To change a saved rectangle directly, select its measure and drag around the grand staff. A blue divider adjusts two neighbors together and supports the arrow keys. **Find on this page** limits detection to the current page. Select **Replace saved boxes on this page** when you want its proposals to replace existing marks. Choose **Done marking** to practice.

Edits to boxes and assignments are kept in this browser for the digital score identity and PDF fingerprint. Reattach the PDF after reopening the score. Keep the PDF file separately. Current library and settings backups do not include the PDF or its mapping. Poor scans, unconnected staves or unusual page layouts can need manual correction.

## Implementation and credits

The page reader, editable box and divider tools, raster detector and editor layout come from Guitar Trainer Studio at commit `1e68d3e` under the project AGPL. Piano Trainer adapts them to OSMD visit positions and the existing looper. The detector recognizes the opening repeat dots on a paired piano staff. The local Mozilla PDF.js 6.5.438 distribution supplies the renderer, worker, maps, fonts and codecs with their accompanying licenses. [Guitar Trainer source](https://github.com/ztbishop/guitar-trainer-studio/tree/1e68d3e) · [Project license](../LICENSE) · [PDF.js provenance](../assets/vendor/pdfjs/SOURCE.md) · [PDF.js license](../assets/vendor/pdfjs/LICENSE)

The original CC0 two-page study and its MuseScore Studio 4.7.6 PDF and MIDI exports are checked in with the regression fixtures. [MusicXML](../tests/fixtures/grand-staff-repeat.musicxml) · [PDF](../tests/fixtures/grand-staff-repeat.pdf) · [MIDI](../tests/fixtures/grand-staff-repeat.mid)

The whole-score scan and numbering checks were ported from Guitar Trainer Studio under the same license. Piano Trainer uses OSMD's written measures for numbering and stages page corrections until the review is saved. [Guitar Trainer commit 85803aa](https://github.com/ztbishop/guitar-trainer-studio/commit/85803aa)
