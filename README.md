# 🎹 Piano Trainer Studio

Practice piano using a MIDI keyboard with real-time feedback and optional LED guidance.

A browser-based piano training app that uses MusicXML scores with real-time MIDI keyboard input and optional LED visualization (WLED).

---

## 🚀 Features

- 🎼 Load and play **MusicXML** piano scores  
- 🎹 Real-time **MIDI keyboard input feedback**  
- ⏱️ Wait Mode and Realtime Mode  
- 💡 Optional **LED visualization via WLED**  
- 🌐 Runs in your browser — no install required  
- 📱 iPad/iPhone support via MIDIWeb (see below)

---

## ⚡ Quick Start (Desktop)

### 1. Run the app locally
Open:

`Launchers/Windows/Piano Trainer - Desktop.bat`

(or Mac equivalent)

### 2. Connect your MIDI keyboard
- Plug in via USB or Bluetooth (if supported by your system/browser)

### 3. Load a song
- Import MusicXML files into the app

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
5. Connect your Bluetooth MIDI device  

### What works:
- ✅ MIDI input (Bluetooth)  
- ✅ Full app functionality  

### What does NOT work:
- ❌ USB MIDI (iOS limitation)  
- ❌ Safari/Chrome MIDI support  

---

## 💡 WLED (LED Support)

WLED is optional but enables LED feedback for notes.

---

### Option 1: HTTP JSON (Simplest)

- Works from:
  - Desktop (local or GitHub)
  - iPad (via MIDIWeb)

Enter your WLED device IP in the app settings.

👉 No helper required

---

### Option 2: Low Latency Mode (DDP) — Optional

For better LED responsiveness:

Run:

`Launchers/Windows/WLED Helper - Low Latency (DDP).bat`

Then enable DDP in the app.

### Notes:
- ✅ Best performance (desktop)  
- ⚠️ Not supported on iPad (currently)  
- ⚠️ Requires helper running on same computer  

---

### iPad + WLED

To use LEDs on iPad:

1. Run:

`Launchers/Windows/Piano Trainer - iPad (Wi-Fi).bat`

2. Open the displayed IP in MIDIWeb  
3. Use **HTTP JSON mode**

### Notes:
- ✅ Works well  
- ❌ DDP not supported on iPad  

---

## 🎹 Supported Input

- MIDI keyboard (USB or Bluetooth, depending on platform)  
- Other MIDI instruments may work, but the interface is optimized for piano/keyboard use  

⚠️ Note: MIDI file import is not currently supported — use MusicXML scores.

---

## 💾 Library & Backup (IMPORTANT)

Songs are stored in your browser using IndexedDB.

⚠️ Browsers may clear this data unexpectedly.

### You should:
- Regularly use:
  - **Export Library (JSON)**  
- Keep backups of:
  - songs  
  - LED calibration  

---

## ⚠️ Known Limitations

### iOS / iPad
- No Web MIDI in Safari/Chrome  
- Requires MIDIWeb for MIDI support  
- USB MIDI not supported  

### WLED
- DDP not supported on iPad  
- HTTP JSON has slightly higher latency  

### Browser Storage
- Library may be lost if browser clears storage  

---

## 🛠️ Troubleshooting

### MIDI not detected
- Use Chrome (desktop)  
- On iPad: use MIDIWeb  
- Try reconnecting device  
- Refresh page  

---

### LEDs not working
- Check WLED IP  
- Confirm device is on same network  
- Try HTTP JSON mode first  

---

### App not loading correctly
- Hard refresh (Ctrl + Shift + R)  
- Clear browser cache  

---

## 🔄 Updates (Planned)

- Version checker  
- Update notifications  
- Improved iPad support  
- Possible MIDI helper bridge  

---

## 📘 Notes

- This is a **web-first app**  
- Desktop provides the best experience  
- iPad support is available via MIDIWeb workaround  

---

## 🙌 Credits

- MusicXML rendering libraries  
- WLED project  
- MIDIWeb (iOS MIDI support)  

---

## License

This project is licensed under the GNU Affero General Public License v3.0.

Any modifications — including versions hosted as a service — must also make their source code available under the same license.

See the LICENSE file for full details.

---
