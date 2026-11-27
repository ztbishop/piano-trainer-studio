# Practice with a companion PDF

Open the digital score in **Scores**, then choose **PDF → Attach PDF** and select the local printed edition. MusicXML, MXL and scores opened through the existing MIDI or Guitar Pro importer all supply the trainer's notes and timing. The PDF supplies the page you read. The virtual keyboard, hand assignments, grading and three practice modes still use the digital score.

A new score/PDF pair opens in **Mark measures** with a blank map. Drag a box around the first measure, covering both piano staves even when one hand rests. The measure selector advances after each box. Or choose **Find boxes in score** to review suggested boxes. Choose **Done marking** when you are ready to practice. Reattaching the same pair with saved boxes opens directly in reading view, even if you marked only part of the score.

The browser remembers boxes and repeat assignments even for files opened directly from disk. To start over, choose **Scores → PDF → Forget markings…** and confirm the score and PDF names. The attached PDF opens in **Mark measures** on page one with empty boxes and the default written-measure numbering. If you opened a library entry with its saved PDF, the reset also saves to that entry. Other arrangements using the same PDF keep their markings.

Click a box in reading view to pause and seek. The printed page fills the score pane. Open **Scores → PDF** to change **Page**, **Show notation**, or **Mark measures** on the page in view. When several score visits use the same box, the reader chooses the nearest visit allowed by the loop. **Score visit** in the same menu lets you choose another eligible pass. **Show PDF** returns from notation to the attached pages.

## Repeats and endings

While paused at the beginning of a loop, moving **Beginning Measure** earlier also moves the cursor and PDF highlight to the new start. **Reset** brings the mapped start back into view, even after browsing to another page. If you click a box with no assigned visit, the reader opens **Map repeats and endings**. Check the proposed visit and choose **Map range** to save the link. If a loop excludes an already mapped box, the message shows the active range.

A **visit** is one measure in playback order. For a score with repeat signs, OSMD supplies the order and each pass initially points to the same printed measure. A MIDI export can instead contain separate digital measures for each pass. The reader starts with matching measure numbers. Check the mapping when the arrangement differs from the print.

For the included study, the PDF shows four measures and the MIDI plays six. The intended printed sequence is **1, 2, 1, 2, 3, 4**.

1. Open **Scores → PDF → Map repeats and endings**. Set **From visit** to 3, **Through visit** to 4 and **First printed measure** to 1. Click **Map range**. Both visits now point to the printed repeat.
2. Map visits 5–6 to printed measures starting at 3. To correct an individual ending, choose the same first and last visit and enter its printed measure.
3. Choose **Leave unmapped** for a digital introduction, interlude or other passage absent from the PDF. The trainer continues through it with the PDF highlight cleared. The visit selectors show the current assignments.
4. Use **Loop** with digital score measure numbers. In the MIDI study, set beginning 3 and ending 4 to practice the second pass. Both printed boxes highlight again and boxes outside the loop are shaded. In Wait mode, the highlight holds until all required notes have been played. **Auto-scroll** controls whether the PDF follows a highlighted box onto another page.

## Correct the printed boxes

Choose **Mark measures → Find boxes in score** from any page. The scan starts at page one and previews numbered boxes across the entire PDF. Scroll freely or use **Page** to jump. When the boxes look right, choose **Use score boxes** once to save the whole score.

To fix a spot, navigate to it and choose **Correct this page**. Draw, split, join or remove a box, then choose **Review whole score** to see the result. Later pages renumber automatically unless you explicitly set their **First measure**. You can revisit pages in any order. **Cancel** discards the entire scan draft.

A rescan keeps hand-drawn boxes, adjusted dividers and boxes from older saved mappings. The editor flags a number claimed by two pages or numbering past the last written digital measure and blocks saving until you resolve it. Repeat and ending assignments survive a rescan.

To change a saved rectangle directly, select its measure and drag around the grand staff. A blue divider adjusts two neighbors together and supports the arrow keys. **Find on this page** limits detection to the current page. Select **Replace saved boxes on this page** when you want its proposals to replace existing marks. Choose **Done marking** to practice.

## Save and reopen a marked PDF

With the PDF attached, choose **Scores → Save to Library**. Opening that library score restores the PDF, its measure boxes and its repeat assignments, even if the original file has moved. Later box and repeat edits save automatically. To change editions, attach the replacement PDF and choose **Save to Library** again. **Save a copy** creates a separate library score with its own markings.

Two arrangements can share the same PDF file while keeping different boxes and repeat assignments. **Library tools → Backup Library** and folder exports include the PDF once per backup. Importing into a matching score fills a missing attachment and keeps an existing attachment with its local edits. For a score opened directly from disk, you can still reattach the PDF to recover the browser's local markings.

## Implementation and credits

The reading menu and the separate marking toolbar follow Guitar Trainer Studio’s companion PDF update. [Guitar Trainer commit b18beaf](https://github.com/ztbishop/guitar-trainer-studio/commit/b18beaf)

The page reader, editable box and divider tools, raster detector and editor layout come from Guitar Trainer Studio at commit `1e68d3e` under the project AGPL. Piano Trainer adapts them to OSMD visit positions and the existing looper. The detector recognizes the opening repeat dots on a paired piano staff. The local Mozilla PDF.js 6.5.438 distribution supplies the renderer, worker, maps, fonts and codecs with their accompanying licenses. [Guitar Trainer source](https://github.com/ztbishop/guitar-trainer-studio/tree/1e68d3e) · [Project license](../LICENSE) · [PDF.js provenance](../assets/vendor/pdfjs/SOURCE.md) · [PDF.js license](../assets/vendor/pdfjs/LICENSE)

The original CC0 two-page study and its MuseScore Studio 4.7.6 PDF and MIDI exports are checked in with the regression fixtures. [MusicXML](../tests/fixtures/grand-staff-repeat.musicxml) · [PDF](../tests/fixtures/grand-staff-repeat.pdf) · [MIDI](../tests/fixtures/grand-staff-repeat.mid)

The whole-score scan and numbering checks were ported from Guitar Trainer Studio under the same license. Piano Trainer uses OSMD's written measures for numbering and stages page corrections until the review is saved. [Guitar Trainer commit 85803aa](https://github.com/ztbishop/guitar-trainer-studio/commit/85803aa)

Library attachment storage, reference cleanup and portable backups were adapted from Guitar Trainer Studio under the project AGPL. [Guitar Trainer commit 3a7752b](https://github.com/ztbishop/guitar-trainer-studio/commit/3a7752b)

The PDF shows a 14-pixel translucent blue guide above the current event during playback. **Practice → Visual Feedback → Highlight correct / incorrect notes (on staff)** adds live green for held correct notes and live red for held wrong notes, with red taking priority. Completed graded events leave green for a clean event or red for a wrong or missed note.

Completed marks remain after pausing or finishing. A loop restart clears marks in the loop range, and a repeated visit refreshes its printed measure. Reset or turning staff feedback off clears the completed marks. PDF auto-scroll leaves up to 64 pixels of room above the active box for higher notes and annotations, scaled down on smaller screens.

### Beat guide trial and Guitar Trainer handoff

The Arirang MIDI and TAB PDF provide 16 successive segments in the first bar. The ninth starts halfway across the measure and the sixteenth starts at about 94%. Try how the guide reads on dense runs, long rests and repeats. Printed notes can be spaced unevenly, especially where a system begins with a clef and key signature.

The segment begins at the event’s offset from the written measure start and spans the event’s scheduled score duration, capped at the barline. Both values are expressed as fractions of the written measure duration. The guide uses the existing playback cursor, grading and mapped PDF box.

For an alphaTab trial after piano acceptance, use Guitar Trainer’s playback visit to resolve the printed box, then express the beat’s start, end and measure duration in the same tick coordinate system. Reuse Guitar Trainer’s live wrong-input state and finalize each segment from its grading outcome. Keep completed marks for review and clear the relevant marks on loop restart. Check pause, seek, repeats, wrong-key release and a correction in Wait mode.
