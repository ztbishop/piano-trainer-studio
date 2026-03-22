// Local static server for Piano Trainer web app
// Serves the project web root at http://127.0.0.1:8080

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const HOST = "127.0.0.1";
const PORT = process.env.PIANO_TRAINER_APP_PORT ? Number(process.env.PIANO_TRAINER_APP_PORT) : 8080;
const SITE_DIR = __dirname;
const ALLOWED_ROOT_PATHS = new Set([
  "index.html",
  "style.css",
  "assets",
  "js",
  "favicon.ico"
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
    "Access-Control-Allow-Origin": "*"
  });
  res.end(body);
}

function safeResolve(requestPath) {
  const parsed = url.parse(requestPath);
  let pathname = decodeURIComponent(parsed.pathname || "/");
  if (pathname === "/") pathname = "/index.html";

  const relativePath = pathname.replace(/^\/+/, "");
  const topLevel = relativePath.split("/")[0];
  if (!ALLOWED_ROOT_PATHS.has(topLevel)) return null;

  const fullPath = path.normalize(path.join(SITE_DIR, relativePath));
  if (!fullPath.startsWith(SITE_DIR)) return null;
  return fullPath;
}

const server = http.createServer((req, res) => {
  const filePath = safeResolve(req.url || "/");
  if (!filePath) return send(res, 404, "Not found");

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
  console.log(`Piano Trainer app server listening on http://${HOST}:${PORT}`);
  console.log(`Serving site files from ${SITE_DIR}`);
});
