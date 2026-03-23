# 🎹 Piano Trainer Studio

Practice piano using a MIDI keyboard with real-time feedback and optional LED guidance.

A browser-based piano training app that uses MusicXML scores with real-time MIDI keyboard input and optional LED visualization (WLED).

---

## 🚀 Features

- 🎼 Load and play **MusicXML** piano scores  
- 🎹 Real-time **MIDI keyboard input feedback**  
- ⏱️ Wait Mode and Realtime Mode  
- 💡 Optional **LED visualization via Midi LED Keyboard or WLED**  
- 🌐 Runs in your browser — no install required (Download can run offline) 
- 📱 iPad/iPhone support via MIDIWeb (see below)

---

## ⚡ Quick Start (Desktop)

### 1. Run the app locally
Open:

`Launchers/Windows/Piano Trainer - Desktop.bat`

(or Mac equivalent)

### 2. Connect your MIDI keyboard
- Plug in via USB or Bluetooth (Bluetooth support may be limited due to browser support)  -CME WIDI Bud Pro is a good wireless to USB dongle alternative

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
5. Connect your MIDI device  

### What works:
- ✅ MIDI input 
- ✅ Full app functionality  

### What does NOT work:
- ❌ Safari/Chrome MIDI support  

---

## 💡 WLED / LED Support
LED / WLED is optional but enables LED feedback for notes.

If you have a keyboard with built in LEDs and MIDI in support, you may connect that via Connections > LED Lights > MIDI Device (select correct channel for your LED Piano) - only 'expected' notes will light up on this configuration. 

For a more interactive, color-coded setup, WLED can be setup, and is quite inexpensive.  
For WLED controllers, the following colors are used: 
- Free-play mode / Correctly played notes (optional): Off-white amber color
- Epected Notes for L/R hands: Blue & Green
- Future expected notes (optional): lighter blue & green (brightness is setup in the app). 
- Incorrectly played notes: Red

---

### Recommended setup

- Use an **ESP32-based WLED controller**
- Use a **5V addressable strip** such as **WS2812B / WS2812-compatible** LEDs
- For easy disconnects, a **3-pin JST-SM style connector** can be helpful

Try to buy a strip that arrives as one continuous run at the length you need. Some listings ship multiple shorter sections that may require soldering together.
At least 160 LEDs per meter recommended.  I found 200 LED/Meter works great to ensure alignment over correct keys. 

- Pro tip: - I sourced a 5mm wide 200led/m, 2 meter strip from ali -with an adhesive backing.  I cut some white stickers to place behind my keys facing upward (giving the illusion of extending my piano keys upward).  I stuck my LED strip across those stickers and it gives the illusion that my LED strip is directly on the keys, making 'guidance' very clear on which notes are expected. My strip was already in a very light/faint white coating which acts as a diffuser. 
- Some other bare looking LEDs may do well in a 'diffuser strip' if they don't have a sticky backing.  However, as this is not meant to put on a 'light show' I wouldn't get a diffuser that diffuses the lights TOO much.  Clear or semi-transparent may work well.  The goal here is to tell the player which notes are expected, as well as live feedback on what the player is pressing. 


### WLED settings worth checking (on the WLED device)

For the best real-time response:
- Disable transitions
- Disable effects while using real-time note data
- Enable real-time override
- Turn gamma correction off if you want the most direct LED response

---

### Option 1: HTTP JSON (Simplest)

- Works from:
  - Desktop (local or GitHub)
  - iPad (via MIDIWeb)

Enter your WLED device IP in the app settings.

👉 No helper required

---

### Option 2: Low Latency Mode (DDP) — Optional

For better LED responsiveness (NOT REQUIRED):

Run:

`Launchers/Windows/WLED Helper - Low Latency (DDP).bat`
`Launchers/Mac/WLED Helper - Low Latency (DDP).command`

Then enable DDP in the app.

### Notes:
- ✅ Best performance (desktop)  
- ⚠️ Not supported on iPad (currently)  
- ⚠️ Requires helper running on same computer  
- ⚠️ Requires installing node.js v18 or higher 

---

### iPad + WLED

To use LEDs on iPad: 
You must download the project folder (zip) from Github and run the included script to host from a Mac or PC on your network:

1. Run:

`Launchers/Windows/Piano Trainer - iPad (Wi-Fi).bat`
`Launchers/Mac/Piano Trainer - iPad (Wi-Fi).command`

2. Open the displayed IP in MIDIWeb ios app 
3. Use **HTTP JSON mode**

### Notes:
- ✅ Works well  
- ❌ DDP not supported on iPad  

---

## 🎹 Supported Input

- MIDI keyboard (USB or Bluetooth, depending on platform)  
- Note: I have not found a browser yet to directly support Bluetooth Midi
- You can connect Bluetooth midi keyboard to a small USB dongle on your device, called CME WIDI Bud Pro.  It's quite easy to use, and wireless.
- Other MIDI instruments may work, but the interface is optimized for piano/keyboard use  

⚠️ Note: MIDI file import is not currently supported — use MusicXML scores.
- There are online tools to convert MIDI to XML but not great results. 
- Musescore (app) can be used to export XML to midi with much better results. 
- Musescore (app) can also transpose songs prior to export. 


---

## 💾 Library & Backup (IMPORTANT)

Songs are stored in your browser using IndexedDB.

⚠️ Browsers may clear this data unexpectedly.

### You should:
- Regularly use **Scores → Export Library**
- Regularly use **Settings → Backup All Settings**
- Keep backups of your song library, trainer settings, and LED calibration

---

## ⚠️ Known Limitations

### iOS / iPad
- No Web MIDI in Safari/Chrome  
- Requires MIDIWeb for MIDI support  

### WLED
- DDP not supported on iPad  
- HTTP JSON has slightly higher latency, but not very noticeable. 

### Browser Storage
- Library may be lost if browser clears storage  

---

## 🛠️ Troubleshooting

### MIDI not detected
- Use Chrome (desktop)  
- On iPad: use MIDIWeb  
- Try reconnecting device  
- Refresh page  
- Use USB -or a receiver (WIDI Bud Pro) for Bluetotooth MIDI

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

- On-staff Feedback Note improvements

---

## 📘 Notes

- This is a **web-first app**  
- Desktop provides the best experience  
- iPad support is available via MIDIWeb workaround  

---

## 🙌 Credits

- MusicXML rendering libraries (OSMD)
- WLED project  
- MIDIWeb (iOS MIDI support)  
- MuseTrainer Public Domain Library
- NodeJS open-source runtime environment
- ToneJS Web Audio Framework

---

## License

This project is licensed under the GNU Affero General Public License v3.0.

Any modifications — including versions hosted as a service — must also make their source code available under the same license.

See the LICENSE file for full details.

---
