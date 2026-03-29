# 🎹 Piano Trainer Studio
Practice piano with real-time MIDI feedback, scoring, and optional LED guidance.

App: https://ztbishop.github.io/piano-trainer-studio/
Github repositore: https://github.com/ztbishop/piano-trainer-studio

👉 New here?
- Start with **Quick Start**
- Using iPad? See **iPad / iPhone section**
- Want LED setup? Jump to **WLED Setup**
- Want to find MusixXML? **Library & Backup**

---

## 🚀 Features

- 🎼 Load and play **MusicXML / MXL** piano scores  
- 🔄 Import **MIDI, MuseScore, and Guitar Pro files** (auto-converted to MusicXML)  
- 🎹 Real-time **MIDI keyboard feedback**  
- ⏱️ Wait Mode and Realtime Mode  
- 💡 Optional **LED visualization (WLED or MIDI LED devices)**  
- 🌐 Runs in your browser — no install required  
- 📱 iPad/iPhone support via MIDIWeb  

---

## ⚡ Quick Start (Desktop)

### 1. Run the app
Open:
`Launchers/Windows/Piano Trainer - Desktop.bat`
(or Mac equivalent)

### 2. Connect your MIDI keyboard
- USB recommended  
- Bluetooth may vary by browser  
- Optional: CME WIDI Bud Pro for wireless  

### 3. Load a song
- Best: **MusicXML / MXL**
- Also supported: MIDI, MuseScore, Guitar Pro  

---

## 🌐 Web Version (No Install)

Run directly from GitHub in your browser (Chrome recommended)

- Works great on desktop  
- No helper required  

⚠️ Notes:
- MIDI works on desktop browsers  
- iOS Safari/Chrome do NOT support MIDI  

---

## 📱 iPad / iPhone (MIDI Support)

iOS browsers do not support MIDI.

### ✅ Solution: MIDIWeb

1. Install **TestFlight**  
   https://apps.apple.com/us/app/testflight/id899247664  

2. Install **MIDIWeb**  
   https://midiweb.cc  

3. Open MIDIWeb

4. Load Piano Trainer (GitHub or local network)

5. Connect your MIDI device  
🔵 Bluetooth MIDI (Optional)
- Tap the Bluetooth icon in MIDIWeb  
- Connect your device  
- It will appear in Piano Trainer

6. **WLED light strips** will NOT work on iOS without a helper. 
- Open the following on a Mac/PC on your local network.
- `Launchers/Windows/Piano Trainer - iPad (Wi-Fi).bat`
- (or Mac equivalent)
- Using MIDIWeb app, connect to the resulting URL/IP displayed on your mac/pc browser.  
- Be sure to use http  (NOT https) when putting this URL into MIDIWeb. 

---

## 🎼 Supported Score Formats

### ✅ Best Compatibility
- `.xml`
- `.musicxml`
- `.mxl`

### 🔄 Supported via Conversion
- MIDI (`.mid`, `.midi`)  
- MuseScore (`.mscx`, `.mscz`)  
- Guitar Pro (`.gp`, `.gpx`, etc.)  

⚠️ Notes:
- MusicXML is most reliable  
- Converted formats may vary  
- If issues occur → export to MusicXML  

---

# 💡 WLED / LED Setup (Optional)
LEDs are optional but provide real-time visual guidance.

---

## 🔹 Quick Setup

- Some pianos have red LED lights built in.  If you own one, set the piano as LED MIDI device out.  The app will simply light up the current 'Expected' notes.  Depending on your keyboard you may need to set the channel and optional low velocity to avoid hearing playback.  This is all done in the Setup menu. 

- For a rich feedback experience, the following hardware can be used to place an LED strip over any piano. 

- Use an **ESP32 WLED controller**
- Use a **5V addressable LED strip (WS2812B)**
- Enter your WLED IP in the Piano Trainer app settings. 

---

## 🔹 Recommended Hardware

- Controller: ESP32 (Athom / BTF / similar)
- LED Strip: WS2812B (uses 5V) - Other types of strips may work as well; check WLED compatibility.
- Density: **Recommend 160–200 LEDs per meter** Higher count = more accurancy to line up with keys.
- Length: ~1.2–1.3m for full keyboard
- **IMPORTANT**: Verify if you buy a 2m strip (for 88 keys), it is shipped as 1 piece, and not two individual 1m strips that need soldering. Simply cut the excess off the 2m strip. 

### Power Supply
- 5V power supply required for WS2812B LEDs.
- Size depends on LED count (higher LED count = more power)  5v, 5A should suffice.

---

## 🔹 Example Setup (Recommended)

👉 Consider mounting the LED strip above keys  
👉 Consider small white stickers extending back/up from the white keys, leaving black space for black keys. 
    -This gives the illusion of extending the keys where you can place the LED strip directon on top. 
This creates the effect of:
- LEDs appearing on “extended keys”
- Cleaner visual guidance during play

---

## 🔹 LED Color Behavior

- Correct / free play: warm white  
- Expected notes: Blue (L) / Green (R)  
- Future notes: lighter blue/green  
- Incorrect notes: Red  

---

## 🔹 Before Calibration (IMPORTANT)

- Set **Player Piano Keys**  (88 if you have a full 88 key piano)
- Set **LED Count** (LEDs/m * size after cutting).  You may need to tweak this after testing to get the count right.
- Lower brightness to ~20%  if your WLED controller is set to 100%.
- Set Future note brightness to 1% (bump it up if it doesn't turn on).

---

## 🔹 Recommended WLED Controller Settings

- Effect: Solid  
- Brightness: 20–40%  
- Color: controlled by app  
- Power limit: optional  
- Upon setting up the WLED controller on your wifi, get the IP and enter it in the Trainer WLED settings.

---

## 🔹 Connection Modes

### Option 1: HTTP JSON (Recommended)
- Works everywhere (desktop + iPad)
- Simple setup

### Option 2: DDP (Low Latency)
Run:

`Launchers/Windows/WLED Helper - Low Latency (DDP).bat`

- ✅ Faster performance  
- ❌ Not supported on iPad  
- ⚠️ Requires Node.js  
  - This may change in the future if I ship the app with a wrapper. 

---

## 🎹 Supported Input

- MIDI keyboard (USB or Bluetooth adapter)
- Optimized for piano
- CME WIDI Bud Pro is good for picking up Bluetooth MIDI as a USB device. 

---

## 💾 Library & Backup (IMPORTANT)

Songs are stored in your browser (IndexedDB).

⚠️ Browsers may clear this data.

### Always:
- Use **Scores → Backup Library**
- Use **Settings → Backup All Settings**


### Where can I find MusicXML songs? 

- **Musetrainer**  https://musetrainer.github.io/library
  - Public domain MusicXML Library (69 popular songs formatted for piano)

- **Openscore**  https://fourscoreandmore.org/openscore/lieder/
  - 19th-centurey classical art songs for voice and piano

- **Musescore**  https://musescore.com/
  - Large collection of music.  Use a FREE account.
  - Decline any promotional pop-ups or screens asking you to upgrade to MuseScore PRO or start a 7-day free trial. **You only need the basic, free account.**
  - When searching, filter for public domain & original to bypass paywalls.  Filter for Piano / Solo.
  - Under DOWNLOAD section, choose mxl / musicxml 
  - If you are prompted to pay, ensure you are logged in, and search for anything that is **NOT** 'official score'.  Some 'Pro' scores can be downloaded if logged into a free account. 

- **Github** https://github.com/
- Can be used to find musicxml (may find mixed results)
  - Search this within github with your song name:  extension:mxl OR extension:musicxml piano
  - Search this within google with your song name:  filetype:mxl OR filetype:musicxml "piano"


---

## ⚠️ Known Limitations

### File Conversion
- MIDI / MuseScore / Guitar Pro may:
  - Load imperfectly
  - Require cleanup
  - Fail on complex scores  

👉 Export to MusicXML for best results  

---

### iPad
- No Web MIDI in Safari/Chrome  
- Requires MIDIWeb app
- Requires PC/Mac host for WLED support

---

### WLED
- DDP not supported on iPad  

---

## 🛠️ Troubleshooting

### MIDI not detected
- Use Chrome (desktop)
- Use MIDIWeb (iPad)

### Import issues
- Convert to MusicXML (Musescore app)

### LEDs not working
- Verify IP
- Start with HTTP JSON

---

## 📘 Notes

- Web-first app  
- Desktop = best experience  
- iPad supported via MIDIWeb  
- Regardless of Mac/PC/iOS/Android - do NOT block any accress requests. 
  - These are needed for MIDI and/or WLED

---

## 🙌 Credits

- OSMD  
- WLED  
- MIDIWeb  
- MuseTrainer Library  
- NodeJS  
- Tone.js  
- Webmscore  

---

## License

AGPL v3.0