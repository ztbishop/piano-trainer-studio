// Local static server for Piano Trainer web app
// Serves the project web root and, for Wi-Fi launchers, a connection info page.

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const os = require("os");

const HOST = process.env.PIANO_TRAINER_APP_HOST || "127.0.0.1";
const PORT = process.env.PIANO_TRAINER_APP_PORT ? Number(process.env.PIANO_TRAINER_APP_PORT) : 8080;
const SITE_DIR = __dirname;
const ALLOWED_ROOT_PATHS = new Set([
  "index.html",
  "style.css",
  "assets",
  "js",
  "favicon.ico",
  "version.json",
  "README.html",
  "README.md"
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".mxl": "application/vnd.recordare.musicxml+xml",
  ".musicxml": "application/vnd.recordare.musicxml+xml",
  ".wasm": "application/wasm",
  ".data": "application/octet-stream",
  ".symbols": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4"
};

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function getLanAddresses() {
  const interfaces = os.networkInterfaces();
  const results = [];

  for (const name of Object.keys(interfaces)) {
    const entries = interfaces[name] || [];
    for (const entry of entries) {
      if (!entry || entry.internal) continue;
      if (entry.family !== "IPv4") continue;
      results.push({ name, address: entry.address, url: `http://${entry.address}:${PORT}/` });
    }
  }

  const seen = new Set();
  return results.filter((item) => {
    if (seen.has(item.address)) return false;
    seen.add(item.address);
    return true;
  });
}

function renderConnectionInfoPage() {
  const lanEntries = getLanAddresses();
  const localhostUrl = `http://127.0.0.1:${PORT}/`;
  const lanPrimaryUrl = lanEntries.length ? lanEntries[0].url : "LAN address unavailable";
  const lanList = lanEntries.length
    ? lanEntries.map((entry) => `\n        <li><strong>${entry.name}</strong>: <code>${entry.url}</code></li>`).join("")
    : "\n        <li>No LAN IPv4 address detected. Make sure Wi-Fi is connected.</li>";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Piano Trainer - iPad Connection</title>
  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #101216;
      color: #f3f4f6;
      line-height: 1.5;
    }
    .wrap {
      max-width: 760px;
      margin: 0 auto;
      padding: 24px;
    }
    .card {
      background: #1a1f27;
      border: 1px solid #2d3748;
      border-radius: 14px;
      padding: 20px;
      margin-bottom: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.25);
    }
    h1, h2 { margin-top: 0; }
    code {
      display: inline-block;
      padding: 6px 8px;
      border-radius: 8px;
      background: #0b0f14;
      color: #7dd3fc;
      word-break: break-all;
    }
    .primary code {
      font-size: 1.15rem;
      color: #86efac;
    }
    a {
      color: #7dd3fc;
    }
    ol, ul { padding-left: 1.25rem; }
    .muted { color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card primary">
      <h1>Open this on your iPad</h1>
      <p class="muted">Type this address into Safari on the iPad while both devices are on the same Wi-Fi network:</p>
      <p><code>${lanPrimaryUrl}</code></p>
    </div>

    <div class="card">
      <h2>Available LAN addresses</h2>
      <ul>${lanList}
      </ul>
    </div>

    <div class="card">
      <h2>This computer only</h2>
      <p>Use this address only on the host computer:</p>
      <p><code>${localhostUrl}</code></p>
      <p><a href="/">Open Piano Trainer on this computer</a></p>
    </div>

    <div class="card">
      <h2>Quick checklist</h2>
      <ol>
        <li>Keep this launcher window open.</li>
        <li>Make sure the computer and iPad are on the same Wi-Fi network.</li>
        <li>Open the LAN address above on the iPad.</li>
      </ol>
    </div>
  </div>
</body>
</html>`;
}

function safeResolve(requestPath) {
  const parsed = url.parse(requestPath);
  let pathname = decodeURIComponent(parsed.pathname || "/");

  if (pathname === "/connection-info") {
    return { type: "connection-info" };
  }

  if (pathname === "/") pathname = "/index.html";

  const relativePath = pathname.replace(/^\/+/, "");
  const topLevel = relativePath.split("/")[0];
  if (!ALLOWED_ROOT_PATHS.has(topLevel)) return null;

  const fullPath = path.normalize(path.join(SITE_DIR, relativePath));
  if (!fullPath.startsWith(SITE_DIR)) return null;
  return { type: "file", fullPath };
}

const server = http.createServer((req, res) => {
  const resolved = safeResolve(req.url || "/");
  if (!resolved) return send(res, 404, "Not found");

  if (resolved.type === "connection-info") {
    return send(res, 200, renderConnectionInfoPage(), "text/html; charset=utf-8");
  }

  const filePath = resolved.fullPath;
  fs.stat(filePath, (err, stats) => {
    if (err || !stats) return send(res, 404, "Not found");

    let finalPath = filePath;
    if (stats.isDirectory()) finalPath = path.join(filePath, "index.html");

    fs.readFile(finalPath, (readErr, data) => {
      if (readErr) return send(res, 404, "Not found");
      const ext = path.extname(finalPath).toLowerCase();
      const type = MIME_TYPES[ext] || "application/octet-stream";
      send(res, 200, data, type);
    });
  });
});

server.listen(PORT, HOST, () => {
  const localhostUrl = `http://127.0.0.1:${PORT}/`;
  const lanUrls = getLanAddresses().map((entry) => entry.url);

  console.log(`Piano Trainer app server listening on http://${HOST}:${PORT}`);
  console.log(`Serving site files from ${SITE_DIR}`);
  console.log(`Host computer access: ${localhostUrl}`);

  if (HOST === "0.0.0.0") {
    if (lanUrls.length) {
      console.log("LAN access:");
      lanUrls.forEach((lanUrl) => console.log(`  ${lanUrl}`));
      console.log(`Connection info page: http://127.0.0.1:${PORT}/connection-info`);
    } else {
      console.log("LAN access unavailable: no non-internal IPv4 address detected.");
    }
  }
});
