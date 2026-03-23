@echo off
setlocal
for %%I in ("%~dp0..") do set "ROOT=%%~fI"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo Node.js is required to run this launcher.
  echo.
  echo Please install Node.js from:
  echo https://nodejs.org
  echo.
  pause
  exit /b
)

if not defined PIANO_TRAINER_APP_PORT set "PIANO_TRAINER_APP_PORT=8080"

echo Piano Trainer - iPad/Tablet (Wi-Fi)
echo Hosts the Piano Trainer app on your LAN for iPad/tablet use.
echo Node.js is required for this launcher.
echo.
start "" cmd /c "timeout /t 2 /nobreak >nul & start "" "http://127.0.0.1:%PIANO_TRAINER_APP_PORT%/connection-info""
set "PIANO_TRAINER_APP_HOST=0.0.0.0"
node "%ROOT%\local-web-server.js"
