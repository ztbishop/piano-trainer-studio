# Piano Trainer Studio: current project context

This file records durable context for new chats. Verify changing details against the working tree rather than relying on prior chat history.

## Project and workflow

- Browser-based piano practice with MIDI input, MusicXML notation, scoring, optional audio/MIDI playback, and LED guidance.
- Repository: https://github.com/ztbishop/piano-trainer-studio
- Public site: https://www.pianotrainerstudio.com/
- GitHub Pages address: https://ztbishop.github.io/piano-trainer-studio/
- The user develops in VS Code and uses Live Server for browser/WebMIDI testing.
- The user handles GitHub commits and pushes. Each file-changing update should include a suggested commit title and description; see `../AGENTS.md`.
- Earlier ChatGPT project history was titled **Piano Trainer**. Relevant decisions should be recorded here or in the appropriate current document so new chats do not depend on recovering that history.

## Implemented capabilities

- MusicXML/XML/MXL loading through OSMD; local browser conversion of MIDI, MuseScore, and Guitar Pro formats using bundled webmscore/WASM. Converted files vary in compatibility; MusicXML is preferred.
- Realtime mode advances at tempo. Wait for Me advances when required notes are satisfied. Follow Me practices one hand with adaptive timing and opposite-hand playback.
- Correct/wrong/missed-note feedback, accuracy display, virtual keyboard input, hand colors, and future-note preview.
- Score tempo changes, tempo scaling, metronome/count-in, MIDI metronome output, measure looping, click-to-start navigation, zoom, scrolling, and fullscreen.
- Sampled local piano audio, optional low-latency playback, MIDI output, input/output channel selection, and separate routing/volume controls.
- Starter scores, browser library/folders, bulk import, library backup/restore, settings backup/restore, and key/semitone transposition/reset.
- Optional LED simulator, WLED HTTP JSON/DDP, MIDI LED devices, strip tests, brightness settings, and calibration.
- Cloudflare Web Analytics and Google Analytics tags in `index.html`. No custom practice-event instrumentation was found in the reviewed application code.

## Hand assignment decisions

`js/hand-assignment.js` assigns performance roles without changing OSMD engraving:

- Roles: left hand, right hand, accompaniment, or ignore.
- Staff mode is the default; voice mode permits hands to retain identity across staff crossings.
- Unmapped/unavailable voices follow staff assignments. Voice IDs are resolved within their instrument/part, not globally.
- A unique two-staff piano part can be chosen from a multi-part score; otherwise initial assignments use the first two staves. Other staves start as Ignore.
- Cross-staff suggestions require user selection; the module does not silently switch to voice mode.
- Assignments persist in localStorage under a content fingerprint, not the filename. Changing score XML can produce a different assignment identity.
- Settings backups include hand-assignment entries. Library backup and settings backup serve different purposes.
- Assignment changes pause active playback and refresh expected notes, preview state, and visuals.

## Constraints and limitations

- This is a static app using ordered classic scripts/shared globals, not a bundled framework application.
- Scores are stored in IndexedDB and settings in localStorage. Different browser origins have separate data; there is no account/cloud synchronization.
- Timing remains iterator-driven with an accumulated realtime anchor. Browser timers and complex structural navigation remain important regression areas; no scheduler rewrite is planned by default.
- Rendering relies on OSMD/VexFlow internals and stabilized feedback geometry heuristics. See `../AGENTS.md` for strict protections.
- No automated test suite is checked in. Browser, MIDI, audio, and hardware verification require the manual workflow in `DEVELOPMENT.md`.
- Existing guidance uses MIDIWeb for iPad/iPhone MIDI. The DDP bridge binds to localhost on the computer running it; LAN app hosting does not expose that bridge to another device.
- Core libraries and samples are bundled, but analytics and the Markdown renderer in `README.html` use external scripts. Do not assume all online/help functionality works offline.

## Future ideas, not implementation requests

Scales, triads, arpeggios, and chord-progression practice tools have been discussed. Bundled desktop runtimes have also been considered. These are unimplemented ideas and require a specific request before development.

## Starting a new chat

Open the current project checkout in Codex and use:

> Read AGENTS.md and the relevant project documentation, check Git status, and help implement: [describe changes]. Preserve existing behavior except for the changes requested. Leave commits and pushes to me, and provide a suggested commit title and description.

Repository guidance must be accessible to the new chat. A separate ChatGPT chat needs repository access or the relevant files supplied to it. Documentation is maintained with changes; it does not automatically synchronize separate chats, checkouts, or GitHub.
