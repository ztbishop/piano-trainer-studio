# Piano Trainer WLED Helper

Minimal local helper for the Piano Trainer roadmap.

## What it does
- `GET /api/health`
- `POST /api/wled/frame`
- `POST /api/wled/clear`

## Requirements
- Node.js 18 or newer

## Run
```bash
npm start
```

It listens on:
- `http://127.0.0.1:4818`

## Example frame payload
```json
{
  "transport": "http-json",
  "wledIp": "192.168.1.50",
  "ledCount": 88,
  "sequence": 1,
  "timestamp": 1773878400000,
  "frame": [[0,0,0],[255,0,0],[0,0,0]]
}
```

## Notes
- `transport: "http-json"` sends to WLED JSON API
- `transport: "ddp"` sends DDP over UDP to port `4048`
- The helper is transport-only; keep trainer logic in the web app
