Place these files in this folder from the browser-ready webmscore-webpack5 package:

- webmscore.js
- webmscore.lib.js
- webmscore.lib.data
- webmscore.lib.wasm
- webmscore.lib.mem.wasm
- webmscore.lib.symbols  (optional, but recommended to match the package)

Download from:
https://cdn.jsdelivr.net/npm/webmscore-webpack5@0.21.0-a/

Important:
- Use the app through this project's local-web-server.js (or another server that serves .wasm as application/wasm).
- If webmscore.lib.mem.wasm is missing, MIDI / MuseScore / Guitar Pro import will fail.
