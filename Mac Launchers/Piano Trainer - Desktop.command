#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SEARCH_DIR="$SCRIPT_DIR"
ROOT=""

while true; do
  if [ -f "$SEARCH_DIR/local-web-server.js" ] || [ -f "$SEARCH_DIR/helper/server.js" ]; then
    ROOT="$SEARCH_DIR"
    break
  fi
  PARENT="$(dirname "$SEARCH_DIR")"
  if [ "$PARENT" = "$SEARCH_DIR" ]; then
    break
  fi
  SEARCH_DIR="$PARENT"
done

if [ -z "$ROOT" ]; then
  echo
  echo "Could not locate the Piano Trainer project root."
  echo "Please keep this launcher inside the project folder."
  echo
  read -p "Press Enter to exit..."
  exit 1
fi

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

echo "Piano Trainer - This Computer"
echo "Starts the Piano Trainer app on this computer only."
echo "Node.js is required for this launcher."
echo
(
  sleep 2
  open "http://127.0.0.1:${PORT}/"
) &
node "$ROOT/local-web-server.js"
