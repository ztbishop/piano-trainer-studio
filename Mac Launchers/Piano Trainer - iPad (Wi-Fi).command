#!/bin/bash
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PIANO_TRAINER_APP_PORT:-8080}"

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js is required to run this launcher."
  echo
  echo "Please install Node.js from:"
  echo "https://nodejs.org"
  echo
  read -p "Press Enter to exit..."
  exit 1
fi

echo "Piano Trainer - iPad/Tablet (Wi-Fi)"
echo "Hosts the Piano Trainer app on your LAN for iPad/tablet use."
echo "Node.js is required for this launcher."
echo
(
  sleep 2
  open "http://127.0.0.1:${PORT}/connection-info"
) &

export PIANO_TRAINER_APP_HOST=0.0.0.0
export PIANO_TRAINER_APP_PORT="$PORT"
node "$ROOT/local-web-server.js"
