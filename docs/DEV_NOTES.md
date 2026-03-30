VERSION CONTROL - you MUST update the version in version.json and trainer-state.js prior to pushing to github!


//Phase 5
- Renamed app.js to trainer-core.js.
- Added internal section markers and warning comments around playback/metronome/navigation hotspots.
- Moved canonical architecture notes to docs/ARCHITECTURE.md.

//ChangeLog during continued development//

fixed7  - separate anchors for simultaneous chord notes
fixed16 - ignore fingering annotations in notehead fallback search
FeedbackEngine17 Correct duplicate notes, note render on dots
FeedbackEngine18 
fixed21 - fixed most everything but the following; 
	-Lead in notes not rendering target not: Never collapse notes that occur at the same timestamp if they are separate XML <note> elements.
feedbackfixed / debug - 
	Corrected Feedback note placeents & several bugs
	Added Debug mode
	See Prompts.md for troubleshooting future rendering issues of feedback notes. 

1) Dev notes entry: Feedback-note rendering stabilization
Feedback note rendering: stabilized branch and fixes
Current stable version:
app.fixed21.anchor-fix-v7-logging.js
This is the current best-known version for feedback-note rendering.
Stable base history
The important safe base was:

fixed21
preserved the beam drift fix after resize
preserved correct side-shifted same-stem chord note overlays
remained the correct branch to build from for later fixes
Later work should be understood as layered on top of the fixed21 behavior, not as a rewrite.
Important earlier fixes retained from the fixed21 line

fixed7
separate anchors for simultaneous chord notes
fixed16
fallback notehead search ignores fingering / annotation elements
fixed17
dedupe same-time duplicate expected notes

fixed21
safe anchor/rendering base
beam drift after resize fixed
side-shifted same-stem chord notes working correctly

Major problems that were solved after fixed21
1. Missing feedback notes on target notes after ornament / lead-in style notes
Observed in:
Mozart Fantasy in D minor K397, measure 69
Chopin Nocturne Op. 9 No. 2, measures 14 and 16
Chopin Nocturne measure 8
Root cause:
feedback notes were being created and rendered
but notehead candidate selection was choosing the wrong nearby notehead
this was an anchor selection problem, not a missed-note creation problem
Fix direction:
improved SVG notehead candidate selection
used proximity to the preferred per-note anchor
added neighborhood / cluster-aware tie-break logic
preserved notehead-based anchoring instead of cursor snapping

2. Side-shifted same-stem chord regression
Observed when a note in a tight same-stem cluster got mapped onto a sibling notehead on the other side of the stem.
Fix direction:
restored tight chord-cluster precedence
in tight same-stem clusters, use chord-cluster tie-break rules before broader neighborhood override logic

3. Dot contamination
Observed when augmentation dots were selected instead of noteheads.
Cases included:
dot directly to the right of notehead
two dots directly to the right
dot directly above / below notehead
dot slightly diagonally right/up or right/down
note on line vs note on space behaved differently in some cases
Fix direction:
reject tiny round dot-like candidates near the preferred notehead position
widened rejection logic to handle:
right-side dots
vertical dots
diagonal-right dots
double-dot cases
Result of the stabilized version
By the final stabilized build:
lead-in / ornament target notes were rendering correctly
side-shifted same-stem chord notes were rendering correctly
dot contamination cases were corrected
beam drift remained fixed
feedback remained tied to notehead geometry rather than cursor center
Debugging improvements added during this work
A debug system was created to help diagnose rendering failures:
persistent sticky debug overlays for recent prior frames
forced logging during investigation
anchor-resolution tracing
candidate-selection tracing
notehead rejection tracing
Later this was moved behind a Debug toggle in the UI so that:
debug is off by default
no console spam when off
no on-screen debug overlays when off
enabling Debug reactivates logs and sticky visual traces

//
### Fixed
- Trainer expected-note engine incorrectly required ornamental / cue notes that are not visibly rendered by OSMD.
- This caused the trainer to expect "ghost notes" in certain MusicXML scores (example: Mozart Fantasy in D minor K.397, measures ~53–56).

### Root Cause
Some MusicXML files contain notes marked with:
- `notehead="none"`
- `print-object="false"`
- cue-note flags
//
### Fixed
- Repeated sections in realtime playback could play in a rapid burst after a repeat jump.

### Root Cause
The playback engine computed delay using: nextTimestamp - currentTimestamp
//

### Note
Realtime playback continues to use the accumulated anchor-time scheduler
rather than a monotonic re-anchoring clock. This preserves sync with the
Tone.Transport metronome in the current architecture. The tradeoff is
that playback remains somewhat dependent on browser timer stability and
MusicXML structural timestamps.
--Will ultimately want hybrid engine. 
Wait mode as-is
Real-time playback should use monotonic tone.js scheduler. 

### Notes
- Current stable architecture was retained because it preserves:
  - metronome sync
  - wait mode behavior
  - looper behavior
  - XML tempo changes
  - tempo percentage scaling

  ## tag v0.6.6-stable-baseline

  ### Fixed
- Trainer no longer expects non-rendered ornamental/cue notes in affected MusicXML files.
- Realtime playback no longer rushes through repeated sections after backward repeat jumps.

### Known Limitation
- Realtime playback can still exhibit beat-timing inaccuracies around some repeat / first-ending / second-ending transitions.
- This appears to be a limitation of the current iterator-driven realtime playback model rather than score rendering or feedback rendering.

### Note
Tied same-pitch notes now sustain for their full combined playback duration.
In some passages, back-to-back identical pitches may show reduced visible separation on the virtual keyboard / LEDs. This is currently treated as a display-only behavior and does not affect grading.

### Note
Loop slider does not default to max measure if there are loops.  




i'm back v0.6.7


v0.6.8  LED FUTURE PREVIEW (ITERATOR-BASED)

Replaced timeline/measure scanning preview with iterator-clone read-ahead.

Future preview now:
- clones OSMD cursor iterator
- advances via moveToNext() to obtain future events
- rebuilds preview on each cursor move
- filters tie-end notes per-note
- respects LH/RH practice toggles
- renders preview on LED simulator only

Benefits:
- preview stays synced with playback traversal
- repeats / jumps / endings follow engine behavior
- no measure drift
- no skipped progressions

LED future preview is stable using iterator-clone read-ahead.
Known behavior:
- repeats follow playback correctly
- tie chains behave correctly
- long rests may clear future preview when cursor is on blank events
- jump destinations may not preview until the cursor actually resolves the jump
These behaviors are acceptable and tied to current playback traversal quirks; do not “fix” unless there is a strong need, since deeper changes may destabilize playback.

Version: v0.7.0
Status: Stable checkpoint
UI / Menu Improvements
Reorganized the top static menu
Updated several menu labels for clarity
Improved Display menu ordering
Future Notes
Added Player Piano keyboard types: 88, 76, 73, 61, 49, 37, 32, 25
Selected keyboard size: stored in localStorage
derives playable MIDI range
Virtual keyboard now grays out keys outside playable range
Out-of-range notes:
ignored for grading
skipped in realtime/wait modes
not rendered as expected/future notes
LED System Foundations
Added LED Count configuration
default: 88
stored in localStorage
Virtual LED strip:
spans the player playable range
LED cells represent configurable LED count
Mapping logic now supports:
MIDI note → playable range → proportional LED index
This prepares the architecture for:
LED-to-key alignment tools
external WLED strip control
LED anticipation / preview improvements
Visual Improvements
Added darker out-of-range keyboard overlay
Virtual LED strip now graphically matches user keyboard span
Menu layout spacing cleaned up for better readability

LED Timing Rule
- LED state must be computed from the same shared trainer event timeline used for playback/expected-note logic.
- Do not introduce a separate LED-only timing engine, iterator, or scheduler.
- Virtual LED Strip and WLED output must always read from the same LED frame buffer.
- Anticipation and future preview should modify the shared LED frame, not bypass it.
- This prevents simulator/hardware drift and avoids duplicated timing bugs.

//post 0.7.0
added LED Lights mode with None / MIDI Device / WLED
moved LED Count into the WLED settings area
added WLED IP Address, Test LEDs, and a status line
centralized LED outputs so the simulator and WLED both read from the same framebuffer
kept MIDI LED output working under the MIDI Device mode
avoided touching the rendering/anchor/beam systems from your stable build

v0.7.1
LED anticipation timing added
LED brightness controls
WLED integration stable

v0.7.1 — LED System Refinements
Major improvements to LED guidance system and WLED hardware integration.
Architecture
LED system now follows strict 3-stage pipeline:
piano key layer
LED mapping layer
LED frame buffer
added normalized mapping layer:
midi → keyPosition01 → ledIndex
prepares system for future LED calibration tools
WLED Integration
full-frame DDP updates for reliability
added forced clear on:
Reset
Pause
switching away from WLED mode
added manual Re-send LEDs recovery button
prevents LEDs becoming stuck after idle periods
LED Visual Improvements
added LED anticipation timing (realtime mode only)
added LED fade-out smoothing (~40ms)
smoother LED transitions on note release
reduces harsh LED “pop-off” effect during fast passages
LED Brightness Controls
master brightness
future note brightness percentages
settings stored in localStorage
Rendering Safety
Confirmed no impact to critical rendering rules:
beam groups remain stable
note anchor positions unchanged
no changes to OSMD/VexFlow rendering pipeline

Devnotes — v0.7.1 LED system refinements
Added stable WLED hardware integration using the shared LED frame pipeline
Kept simulator and hardware reading from the same LED frame buffer
Added LED brightness controls:
master brightness
future 1 percent
future 2 percent
Future note brightness now scales from the normal hand colors, so 100% matches current note brightness
Added realtime-only LED anticipation timing to reduce perceived lag
Added short LED fade-out smoothing for cleaner note releases
Added WLED recovery behavior:
force clear on Reset
force clear on Pause
force clear when switching away from WLED mode
manual Re-send LEDs button
Refactored LED mapping to explicit normalized pipeline:
midi → keyPosition01 → ledIndex
This prepares the system for future LED calibration
Confirmed rendering safety preserved:
no beam layout changes
no note anchor coordinate changes
no feedback overlay regressions

v0.7.2 Dev Notes

- Preserved critical rendering safety rules:
  - no beam drift on resize
  - feedback notes remain anchored to cached original render positions
  - no accidental / clef regression
  - debug overlays must not interfere with rendering

LED / WLED work completed:
- WLED integration working with shared LED frame pipeline
- virtual LED simulator and hardware both read from the same LED frame
- LED brightness controls added:
  - master brightness
  - future 1 %
  - future 2 %
- future notes now scale from normal hand colors so 100% equals current note brightness
- realtime-only LED anticipation added
- short LED fade smoothing added
- WLED recovery behavior added:
  - force clear on reset
  - force clear on pause
  - force clear when leaving WLED mode
  - manual re-send LEDs button
- normalized LED mapping layer added:
  - midi → keyPosition01 → ledIndex

Calibration work / rules:
- calibration remains inside the existing app, not a separate app
- calibration should be stored per MIDI note across the full 88-key range
- must support different player keyboard sizes by filtering available anchor notes to the current playable range
- optional speed calibration should be anchor-based as a shortcut only
- users must still be able to calibrate any single note later without redoing everything

UI / layout notes:
- keep the side-popup options menu
- do not revert to stretched, fullscreen, or two-column menu layouts
- keep the centered floating calibration popup location
- do not remove WLED selection from Connections
- do not let calibration/menu changes cover or break virtual keyboard / virtual LEDs unnecessarily

Known pitfalls from this chat:
- large menu rewrites caused regressions and removed working controls
- one update accidentally undid the side-popup options menu
- one update broke WLED selection in Connections
- one update moved calibration UI to a bad location
- one update reintroduced confusion by working from the wrong baseline
- long conversation history increased risk of regressions; future work should use a fresh chat and only the newly uploaded current files

Recommended next work:
- continue from a fresh chat
- upload current app.js / index.html / style.css
- implement only small calibration improvements from the current working baseline

VERSION: v0.7.3
- Changed LED MIDI output to single channel (expected notes only)
- Added Low Velocity mode for MIDI LED Output

VERSION: v0.7.4
v0.7.x – UI Menu Polish & Reorganization

• Reorganized static toolbar into clearer functional groups:
  Open | Play/Reset | Tempo | Practice | Looper | Score | Settings

• Converted Tempo, Practice, and Looper into centered popup panels.
• Kept Settings as a right-side configuration panel.

• Unified popup visual style across Tempo, Practice, Looper, and Settings:
  - consistent glass surface
  - consistent border/shadow treatment
  - consistent popup behavior

• Added popup animations (fade/slide) for all menus.

• Improved popup layout density and alignment:
  - cleaner grouping of practice controls
  - tighter spacing for sliders and checkboxes
  - clearer hierarchy for Settings sections

• Refined Practice menu terminology and structure:
  - Feedback Notes → Staff Feedback
  - Future Notes → Future Note Lighting
  - Staff Feedback moved above Future Note Lighting

• Improved toolbar usability:
  - stronger hover feedback
  - clearer active/open button state
  - better micro-spacing between toolbar groups

• No functional engine changes (playback, MIDI, LED, or score rendering).
• Changes are UI/UX only.

Piano Trainer – Dev Notes (v0.7.5)

UI cleanup phase finalized.

Top Toolbar

* Renamed Practice → Trainer
* Added icons: ♪ Tempo, 🎹 Trainer, 🔁 Looper, ⚙ Settings
* Renamed Open MusicXML → Open Score
* Maintained existing toolbar layout and popup logic
* Confirmed toolbar grouping and spacing acceptable for final product

Menus

* Trainer menu wording updated
* Staff Feedback placed above Future Note Lighting
* Ensured popups remain hidden on load
* Preserved existing popup animation and transparency behavior

Popup Behavior

* Ensured menus can scroll if viewport height is limited
* Verified Settings scroll behavior remains unchanged

Score Presentation

* Implemented darker workspace background around score
* Kept sheet music page pure white
* Added subtle page shadow for paper-style presentation
* Maintained full-width OSMD rendering to avoid reducing music scale
* Responsive CSS reduces padding/shadow on smaller screens to preserve score size

Stability

* No changes made to OSMD engraving rules to avoid affecting feedback overlay alignment
* No changes to feedback note engine, cursor alignment, or MIDI timing

Status

* UI polish phase considered complete
* Next development focus: WLED performance and timing improvements

v0.7.5 
* Pre-led-opt (going to get rid of softening and see if it fixes stuck faint leds). 

v0.7.6 – Connection Status + WLED Recovery

• Added connection status indicators (dot + text) for MIDI In, MIDI Out, and LED Lights in Connections menu
• Status states: None (gray), Connected (green), Disconnected (red)
• MIDI disconnect now preserves original device name and shows Disconnected instead of None
• Implemented WLED health check (HTTP JSON ping ~3s) for automatic disconnect detection
• Added reconnect recovery logic: re-arm WLED, clear strip, trigger fresh render from current app state
• Fixed issue where LEDs would not resume during active playback after reconnect
• Maintained binary LED behavior (no fade/pulse) and existing frame batching

v0.7.7

* improved connections status update timing. 

v0.7.8 – UI polish + stability improvements

- Fixed refreshConnectionStatuses recursion bug (stack overflow)
- Added robust localStorage system for Settings + Trainer menus
- Implemented Reset All Settings (clears all pt_* keys, restores defaults)
- Persisted:
  - Visual Pulse
  - Loop Count-in
  - Metronome Volume
- Fixed visual pulse double-trigger (now 1 pulse per beat)
- Synced Visual Pulse with Metronome state (auto disable + fade)
- Improved Tempo menu layout (clean row structure + alignment)
- Added LED calibration export/import (backup/restore workflow)
- Fixed toolbar active state when opening calibration tool
- Prevented score click-through when closing menus
- Added safe numeric clamping for persisted values (prevents corrupted state)
- General UI polish (labels, ordering, hover/active states)

No regressions to:
- playback
- LED engine
- menu behavior
- popup animations/transparency

v0.7.9
- working file browser prototype (messy)

v0.8.0
- Menu added but needs fixing (width, stop close on certain functions, add actions menu to folders, delete folders with files)
- Holding off on this until I split the javascript into separate files. 

v0.8.1
- split javascript from 'app' to multiple files and placed in js directory

v0.8.2
- Fixed the split files and paths

v0.8.3
- Tweaked scores menu
- fixed .mxl support (loads as blob) -xml and musicxml left untouched
- Stopped playback on long notes after pause/reset button

v0.8.4
- fixed gray boarders on virtual keyboard based on smaller user keyboard setting
- Fixed staff assignments, & resulting playback channels & feedback note lines 
- Added null staff assignment for single staff music
- Lowered brightness of WLED test & added LED test for midi devices. Added stop function.
- Added midi channel dropdown for Midi Out and LED Midi Device. 
- Added low velocity mode for midi LED
- Route any active audio channels to midi out
- Cleaned up MIDI config menu

v0.8.5
- hybrid metronome, toggle for note emphasis

v0.8.6
- Add HTTP JSON / DDP transport selector for WLED. 
- Improved top static menu (spacing, dividers)

v0.8.7
- fixed top menu (buttons unresponsive) - wrappers had stretched over controls
- Added WLED DDP transport with HTTP fallback

v0.8.9
Trainer UI + Routing + Live Input Updates
* Refactored Trainer → Playback & Routing into two source groups:
  * Score Playback (L / R / Other Staffs)
  * Live Input (MIDI In / Virtual Keyboard)
* Added Virtual Keyboard as a fully routable source (In-App default ON, MIDI Out default OFF)
* Defaulted all MIDI Out routing checkboxes to OFF
* Persisted all routing + velocity + low-latency settings to localStorage
* Renamed “App Vol” → “In-App Volume” and improved alignment
* Moved “Use MIDI input velocity for live monitoring” to global Live Input Behavior section
* Added “Low-latency live monitoring” (live input only, isolated from score playback)
* Improved UI clarity (removed extra icons, added grouping labels, disabled MIDI Out panel when inactive)
* Ensured no changes to rendering, beam layout, anchor positioning, or feedback note logic
*  Updated some app default settings

v0.9.0
* Improved LED colors hierarchy.  Future & expected now override currently pressed "correct note". 
* Removed "Future 2" LED - improved UI with only one future note. 
* Added DDP Transport Layer Debug toggle & improved reconnect for DDP WLED. 
* Disabled 'correct note' LED unless turned on via toggle; lowered intensity and made white/gold. 
* 'Correct Note' now takes lower priority to future / expected colors. 
* Lowered default LED brightness
* Midi out channel only shows when device is populated. 
* Cleaned up launchers (app launcher, wled helper - Mac/PC)

v0.9.1
* Added version check / update framework (need to finish when pushed online)
* Improved settings import/export
* patched ddp helper permanent stale-sequence while connected. 
  -If the WLED still occasionally drops, the next thing I’d tighten is the health-check behavior so one transient /json/info failure does not make the app look disconnected too aggressively.

v0.9.2
* Pre github push

v0.9.3
* Fixed first run settings (slider values)

v0.9.4
* Added warnings if local device or midi access was blocked. 
* Import settings no longer triggers firstrun override. 

v0.9.5
* re-try to fix settings import not trigger firstrun override. 

v0.9.6 thru v0.1.0 - 
* Lost data - somehow dev_notes was over-written. 
* Highlights: improved launcher files, added update placeholder, added readme

v1.0.1
* Fixed launcer files, implemented updater. 

v1.0.2
* Restored v0.96 thru v0.1.0 (rebuild the behaviors)
- Help button + help popup
- First-run welcome popup
- iPad/iPhone MIDI note in help / first-run with midiweb.cc
- Rename score fix by restoring ScoreLibrary.renameScore(...)
- Starter library auto-import once from assets/Starter_Scores.json when the library is empty
- Fix 'help' menu width
- Link to more in-depth 'Readme'
- VERSION CONTROL - you MUST update the version in version.json and trainer-state.js prior to pushing to github!

v1.0.3
* Fixed update function
- will need to test this after next update!

v1.0.4
* Test from 1.0.3 to ensure updater works

v1.0.5
* Added broader score import support using local browser-side conversion via webmscore.

- Open / Import now accepts:
  .xml, .musicxml, .mxl
  .mid, .midi
  .mscz, .mscx
  .gp, .gp3, .gp4, .gp5, .gpx, .gtp, .ptb

Behavior:
- MusicXML / MXL still load directly and remain the recommended format.
- MIDI / MuseScore / Guitar Pro files are converted locally in-browser to MusicXML, then passed into the existing OSMD pipeline.
- Core rendering, anchor logic, beam stability, clef handling, and feedback note placement were intentionally left untouched.

Implementation notes:
- Replaced handwritten midi-import conversion logic with a wrapper around webmscore.
- Kept converter isolated under assets/vendor/webmscore.
- Existing Open Score / Import flows now allow additional formats instead of blocking them.
- Local web server updated to serve .wasm with application/wasm and related runtime files correctly.

User-facing note:
- Recommend MusicXML / MXL for best reliability.
- MIDI / MuseScore / Guitar Pro support is available, but some complex converted files may still fail or load imperfectly.

v1.0.6
* Added transpose feature.  
- Will still verify / improve enharmonic values after testing key signature changes.
- Need to update text to correct 'current / original' keys. 

v1.0.7
* Fixed first time library for web version

v1.0.8
* Bug fixes

v1.0.9
* Overhauled top menu - more compatible with small tablets
* Overhauled all menus - re-arranged for ease of use
* Increased slider thumb sizes for touch screens
* Upon song load, metronome speed resets to 100%
* Darkened top menu bar background
* Added reverse wled mode
* Removed virtual LED strip debug
* Hide debug menu when no options enabled that use it

v1.1.0
* Moved quickstart help to external file for easier edits
* Replaced 'first run' popup with existing 'quickstart' help menu. 
* Fixed loop 'count-in' checkbox dependancy 
* Applied touch friendly +- buttons to looper measure selection. 
* Cleaned Scores menu
* Clearned Starter Scores library

v1.1.1
* Menu tweaks (more Score menu cleanup)
* Welcome / Quick Start edits
* Updated readme
* Fixed app version sync with JS files (should auto refresh if web version outdated). 

v1.1.2
* Made readme a relative link
* adjusted readme menus (general vs full guide)
* In wait mode, wrong red feedback for the current cursor block now shows only while the wrong key is held
* When the cursor advances, those temporary wrong red markers are committed back onto the score
* Re-pressing a note that was already correctly hit in the current wait-mode chord/block no longer marks it red or increments wrong score
*WLED / Virtual Keyboard color & light behavior improvements: 
-fixes the expected-over-correct-held carryover case when future notes are off
-keeps the held correct → expected on release behavior consistent for WLED and virtual keys
-when the cursor advances, any still-held note that was only showing correct/amber from the previous block now turns off
-if that same pitch is still expected in the new block, it continues to behave as expected guidance
-the virtual keyboard now matches the same rule
* Improved button sizes of LED calibration tool
* LED calibrtion tool allows to HOLD the left/right arrows for quicker calibration. 
* Improved LED and Virtual Keyboard rendering behaviors to prevent sensory overload. Highlights turn off after note's value, regardless if player holds the key afterward.  
* Added new practice mode: "Follow Me" - hybrid between real-time and wait modes.  Player cannot RUSH past the set tempo without penalty (suggest using metronome). Good for 'wait' behavior while allowing the app to playback the other hand and promote tempo awareness. 




**KEEP AT BOTTOM OF FILE FOR REFERENCE!**
//----------------------------------------------------------------------------------------------------------//
VERSION CONTROL - you MUST update the version in version.json and trainer-state.js prior to pushing to github!

version.json
  "version": 
  "downloadUrl"

trainer-state.js
const APP_VERSION = 

index.html
const FALLBACK_ASSET_VERSION = '1.1.0';
//----------------------------------------------------------------------------------------------------------//