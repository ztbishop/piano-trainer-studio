const http = require("http");
const dgram = require("dgram");
const { URL } = require("url");

const HOST = "127.0.0.1";
const PORT = process.env.PORT ? Number(process.env.PORT) : 4818;
const DDP_PORT = 4048;
const HELPER_VERSION = "0.1.2";

let lastSeqByTarget = new Map();
let lastFrameStatus = { transport: null, outcome: 'none', at: 0, ip: '', ledCount: 0, sequence: 0, error: '' };
let helperDebugEnabled = false;

function setLastFrameStatus(patch) {
  lastFrameStatus = { ...lastFrameStatus, ...patch, at: Date.now() };
}

function isTruthyDebug(value) {
  if (value === true || value === 1) return true;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function updateDebugEnabledFromPayload(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, "debugEnabled")) {
    helperDebugEnabled = isTruthyDebug(payload.debugEnabled);
  }
}

function updateDebugEnabledFromRequestUrl(reqUrl) {
  try {
    const url = new URL(reqUrl, `http://${HOST}:${PORT}`);
    if (url.searchParams.has("debug")) {
      helperDebugEnabled = isTruthyDebug(url.searchParams.get("debug"));
    }
  } catch (_) {}
}

function debugLog(...args) {
  if (helperDebugEnabled) {
    console.log(...args);
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function clampByte(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function normalizeFrame(frame, ledCount) {
  const count = Math.max(1, Number(ledCount) || 1);
  const out = new Array(count);
  for (let i = 0; i < count; i++) {
    const px = Array.isArray(frame?.[i]) ? frame[i] : [0, 0, 0];
    out[i] = [clampByte(px[0]), clampByte(px[1]), clampByte(px[2])];
  }
  return out;
}

function buildBlackFrame(ledCount) {
  const count = Math.max(1, Number(ledCount) || 1);
  return Array.from({ length: count }, () => [0, 0, 0]);
}

async function sendHttpJsonToWled(wledIp, frame) {
  const segments = [{ i: frame }];
  const res = await fetch(`http://${wledIp}/json/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      on: true,
      tt: 0,
      seg: segments
    })
  });
  if (!res.ok) {
    throw new Error(`WLED HTTP ${res.status}`);
  }
}

async function sendDdpToWled(wledIp, frame) {
  const pixelBytes = Buffer.alloc(frame.length * 3);
  for (let i = 0; i < frame.length; i++) {
    const [r, g, b] = frame[i];
    const o = i * 3;
    pixelBytes[o] = r;
    pixelBytes[o + 1] = g;
    pixelBytes[o + 2] = b;
  }

  const header = Buffer.alloc(10);
  header[0] = 0x41; // version 1
  header[1] = 0x00; // flags
  header[2] = 0x00; // data type = RGB
  header[3] = 0x01; // destination ID (default)
  header.writeUInt32BE(0, 4); // data offset
  header.writeUInt16BE(pixelBytes.length, 8); // data length

  const packet = Buffer.concat([header, pixelBytes]);
  const socket = dgram.createSocket("udp4");

  await new Promise((resolve, reject) => {
    socket.send(packet, DDP_PORT, wledIp, err => {
      socket.close();
      if (err) reject(err);
      else resolve();
    });
  });
}

async function sendFrame(payload) {
  const transport = payload.transport === "ddp" ? "ddp" : "http-json";
  const wledIp = String(payload.wledIp || "").trim();
  const ledCount = Math.max(1, Number(payload.ledCount) || 1);
  const sequence = Number(payload.sequence || 0);

  if (!wledIp) throw new Error("Missing wledIp");

  const clientSessionId = String(payload.clientSessionId || 'default').trim() || 'default';
  const sequenceKey = `${wledIp}::${clientSessionId}`;
  const lastSeq = lastSeqByTarget.get(sequenceKey) || 0;
  if (sequence && sequence < lastSeq) {
    setLastFrameStatus({ transport, outcome: 'skipped', ip: wledIp, ledCount, sequence, error: 'stale-sequence' });
    debugLog(`[helper] skipped ${transport} frame seq=${sequence} ip=${wledIp} client=${clientSessionId} reason=stale-sequence`);
    return { skipped: true, reason: "stale-sequence", transport, ledCount, sequence, clientSessionId };
  }
  if (sequence) lastSeqByTarget.set(sequenceKey, sequence);

  const frame = normalizeFrame(payload.frame, ledCount);
  debugLog(`[helper] frame transport=${transport} seq=${sequence} ip=${wledIp} client=${clientSessionId} leds=${frame.length}`);

  try {
    if (transport === "ddp") {
      await sendDdpToWled(wledIp, frame);
    } else {
      await sendHttpJsonToWled(wledIp, frame);
    }
    setLastFrameStatus({ transport, outcome: 'sent', ip: wledIp, ledCount: frame.length, sequence, error: '' });
    return { skipped: false, transport, ledCount: frame.length, sequence, clientSessionId };
  } catch (err) {
    setLastFrameStatus({ transport, outcome: 'error', ip: wledIp, ledCount: frame.length, sequence, error: err.message || String(err) });
    console.error(`[helper] frame error transport=${transport} seq=${sequence} ip=${wledIp}:`, err.message || err);
    throw err;
  }
}

async function clearFrame(payload) {
  const transport = payload.transport === "ddp" ? "ddp" : "http-json";
  const wledIp = String(payload.wledIp || "").trim();
  const ledCount = Math.max(1, Number(payload.ledCount) || 1);
  const repeat = Math.max(1, Math.min(4, Number(payload.repeat) || 2));

  if (!wledIp) throw new Error("Missing wledIp");

  const frame = buildBlackFrame(ledCount);
  debugLog(`[helper] clear transport=${transport} ip=${wledIp} leds=${ledCount} repeat=${repeat}`);
  for (let i = 0; i < repeat; i++) {
    if (transport === "ddp") {
      await sendDdpToWled(wledIp, frame);
    } else {
      await sendHttpJsonToWled(wledIp, frame);
    }
    if (i < repeat - 1) {
      await new Promise(r => setTimeout(r, 15));
    }
  }

  setLastFrameStatus({ transport, outcome: 'cleared', ip: wledIp, ledCount, sequence: 0, error: '' });
  return { transport, cleared: true, repeat, ledCount };
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      return sendJson(res, 200, { ok: true });
    }

    const reqPath = (() => {
      try {
        return new URL(req.url, `http://${HOST}:${PORT}`).pathname;
      } catch (_) {
        return req.url;
      }
    })();

    if (req.method === "GET" && reqPath === "/api/health") {
      updateDebugEnabledFromRequestUrl(req.url);
      return sendJson(res, 200, {
        ok: true,
        name: "piano-trainer-wled-helper",
        version: HELPER_VERSION,
        supports: ["http-json", "ddp"],
        debugEnabled: helperDebugEnabled,
        lastFrame: lastFrameStatus
      });
    }

    if (req.method === "POST" && reqPath === "/api/wled/frame") {
      const payload = await readJson(req);
      updateDebugEnabledFromPayload(payload);
      const result = await sendFrame(payload);
      return sendJson(res, 200, { ok: true, ...result });
    }

    if (req.method === "POST" && reqPath === "/api/wled/clear") {
      const payload = await readJson(req);
      updateDebugEnabledFromPayload(payload);
      const result = await clearFrame(payload);
      return sendJson(res, 200, { ok: true, ...result });
    }

    return sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (err) {
    return sendJson(res, 400, { ok: false, error: err.message || "Request failed" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Piano Trainer WLED helper listening on http://${HOST}:${PORT}`);
});


// Merge scores count + selected folder into one line (non-destructive)
function updateScoresHeaderLine(){
  try{
    const countEl = document.querySelector('.scores-count, #scoresCount');
    const folderEl = document.querySelector('.selected-folder, #selectedFolderLabel');
    if(!countEl || !folderEl) return;

    // create wrapper if not exists
    let wrapper = countEl.parentElement.querySelector('.scores-header-line');
    if(!wrapper){
      wrapper = document.createElement('div');
      wrapper.className = 'scores-header-line';
      countEl.parentElement.insertBefore(wrapper, countEl);
      wrapper.appendChild(countEl);
      wrapper.appendChild(folderEl);
    }

    // ensure text clean
    const folderName = folderEl.textContent.replace(/Selected folder:\s*/i,'').trim();
    folderEl.textContent = folderName;

    // add separator if missing
    if(!wrapper.querySelector('.scores-separator')){
      const sep = document.createElement('span');
      sep.className='scores-separator';
      sep.textContent='•';
      wrapper.insertBefore(sep, folderEl);
    }
  }catch(e){}
}

// run once after load
setTimeout(updateScoresHeaderLine, 0);
