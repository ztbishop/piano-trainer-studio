Piano Trainer launchers

Recommended structure
PianoTrainer/
  index.html
  style.css
  assets/
  js/
  helper/
  local-web-server.js
  Windows Launchers/
    Start Piano Trainer.bat
    Start WLED Helper.bat
  Mac Launchers/
    Start Piano Trainer.command
    Start WLED Helper.command

What to use

Windows
- Start Piano Trainer.bat
  Starts the local helper, starts the site server, then opens the browser.
- Start WLED Helper.bat
  Starts only the helper. This is mainly for advanced use or troubleshooting.

macOS
- Start Piano Trainer.command
  Starts the local helper, starts the site server, then opens the browser.
- Start WLED Helper.command
  Starts only the helper.

Why there is no HTTP-only launcher
- The app already falls back to HTTP JSON if the helper is not available.
- This keeps the launcher choices simple for users.

Notes
- You can rename these launcher files later without breaking the app, as long as the script contents still point to the correct relative paths.
- If you rename your app later, update the visible file names only. The scripts themselves will still work.
- Platform-specific folders make it obvious which files belong to Windows vs Mac.

Requirements
- Node.js 18 or newer
- index.html and style.css present at the project root
- assets/ and js/ present at the project root
- helper/server.js present

Ports
- App server: http://127.0.0.1:8080
- Helper: http://127.0.0.1:4818

macOS first use
If a .command file does not run when double-clicked, open Terminal in the project folder and run:
chmod +x "Mac Launchers/Start Piano Trainer.command" "Mac Launchers/Start WLED Helper.command"
