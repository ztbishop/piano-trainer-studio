# 🎹 Piano Trainer Studio

Practice piano using a MIDI keyboard with real-time feedback and optional LED guidance.

A browser-based piano training app that uses MusicXML scores with real-time MIDI keyboard input and optional LED visualization (WLED).

---

## 🚀 Features

- 🎼 Load and play **MusicXML / MXL** piano scores  
- 🔄 Import **MIDI, MuseScore, and Guitar Pro files** (converted automatically to MusicXML)  
- 🎹 Real-time **MIDI keyboard input feedback**  
- ⏱️ Wait Mode and Realtime Mode  
- 💡 Optional **LED visualization via MIDI LED keyboard or WLED**  
- 🌐 Runs in your browser — no install required (Download can run offline)  
- 📱 iPad/iPhone support via MIDIWeb (see below)

---

## ⚡ Quick Start (Desktop)

### 1. Run the app locally
Open:

`Launchers/Windows/Piano Trainer - Desktop.bat`

(or Mac equivalent)

### 2. Connect your MIDI keyboard
- Plug in via USB or Bluetooth (Bluetooth support may be limited due to browser support)  
- CME WIDI Bud Pro is a good wireless to USB dongle alternative  

### 3. Load a song
- Import **MusicXML / MXL** for best results  
- You can also import **MIDI, MuseScore, and Guitar Pro files**  

---

## 🌐 Web Version (No Install)

You can run the app directly from GitHub:

- Open in your browser (Chrome recommended)
- Works great on desktop
- No helper required

⚠️ Notes:
- MIDI works on desktop browsers  
- iOS Safari/Chrome will NOT detect MIDI devices (see iPad section)

---

## 📱 iPad / iPhone (MIDI Support)

iOS does not support MIDI in normal browsers.

### ✅ Solution: Use MIDIWeb

1. Install **TestFlight**  
2. Install **MIDIWeb** from:  
   https://midiweb.cc  
3. Open MIDIWeb  
4. Enter your app URL (GitHub or local Wi-Fi)  
5. Connect your MIDI device  

### What works:
- ✅ MIDI input  
- ✅ Full app functionality  

### What does NOT work:
- ❌ Safari/Chrome MIDI support  

---

## 🎼 Supported Score Formats

### ✅ Recommended (Best Compatibility)
- `.xml`
- `.musicxml`
- `.mxl`

### 🔄 Supported via Conversion
- `.mid`, `.midi`
- `.mscz`, `.mscx`
- `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gtp`, `.ptb`

### ⚠️ Notes
- MusicXML / MXL provides the most reliable results  
- Other formats are converted in-browser and may vary depending on the file  
- If a file does not load correctly, export it as MusicXML from MuseScore for best results  

---

## 💡 WLED / LED Support

LED / WLED is optional but enables LED feedback for notes.

If you have a keyboard with built-in LEDs and MIDI input, you may connect that via:

Connections → LED Lights → MIDI Device  

(Only "expected" notes will light up in this mode)

For a more interactive, color-coded setup, WLED can be used.

### LED Color Behavior
- Free-play / Correct notes: Off-white amber  
- Expected Notes (L/R): Blue & Green  
- Future Notes: lighter blue & green  
- Incorrect Notes: Red  

---

### 🔧 Before LED Calibration (IMPORTANT)

Before starting LED calibration:

- Set **Player Piano Keys** to match your keyboard  
- Set **LED Count** to match your strip  
- Lower **LED Brightness to ~20%** for safety  

---

### Recommended setup

- Use an **ESP32-based WLED controller**
- Use a **5V addressable strip** such as **WS2812B / WS2812-compatible**
- Recommended: **160–200 LEDs per meter**

---

### Option 1: HTTP JSON (Simplest)

- Works on desktop and iPad (via MIDIWeb)
- Enter your WLED device IP in settings

---

### Option 2: Low Latency Mode (DDP) — Optional

Run:

`Launchers/Windows/WLED Helper - Low Latency (DDP).bat`

### Notes:
- ✅ Best performance (desktop)  
- ❌ Not supported on iPad  
- ⚠️ Requires Node.js v18+  

---

## 🎹 Supported Input

- MIDI keyboard (USB or Bluetooth with adapter)  
- Other MIDI instruments may work, but app is optimized for piano  

---

## 💾 Library & Backup (IMPORTANT)

Songs are stored in IndexedDB (browser storage).

⚠️ Browsers may clear this data.

### You should:
- Use **Scores → Export Library**
- Use **Settings → Backup All Settings**

---

## ⚠️ Known Limitations

### Conversion-based imports
- MIDI, MuseScore, and Guitar Pro files may:
  - Load imperfectly  
  - Require cleanup  
  - Fail on complex arrangements  

👉 Exporting to MusicXML is always the most reliable fallback  

---

### iOS / iPad
- No Web MIDI in Safari/Chrome  
- Requires MIDIWeb  

---

### WLED
- DDP not supported on iPad  

---

## 🛠️ Troubleshooting

### MIDI not detected
- Use Chrome (desktop)  
- Use MIDIWeb on iPad  

### Import issues
- Try exporting the file to MusicXML first  

### LEDs not working
- Check IP  
- Use HTTP JSON first  

---

## 📘 Notes

- Web-first app  
- Desktop = best experience  
- iPad supported via MIDIWeb  

---

## 🙌 Credits

- OSMD (MusicXML rendering)  
- WLED  
- MIDIWeb  
- MuseTrainer Public Domain Library  
- NodeJS  
- Tone.js  
- Webmscore

---

## License

AGPL v3.0