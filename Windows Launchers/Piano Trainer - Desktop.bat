@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "SEARCH_DIR=%SCRIPT_DIR%"
set "ROOT="

:find_root
if exist "%SEARCH_DIR%local-web-server.js" set "ROOT=%SEARCH_DIR%"
if exist "%SEARCH_DIR%helper\server.js" set "ROOT=%SEARCH_DIR%"
if defined ROOT goto root_found
for %%I in ("%SEARCH_DIR%..") do set "PARENT=%%~fI\"
if /I "%PARENT%"=="%SEARCH_DIR%" goto root_not_found
set "SEARCH_DIR=%PARENT%"
goto find_root

:root_not_found
echo.
echo Could not locate the Piano Trainer project root.
echo Please keep this launcher inside the project folder.
echo.
pause
exit /b 1

:root_found
if not defined PIANO_TRAINER_APP_PORT set "PIANO_TRAINER_APP_PORT=8080"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo Node.js is required to run this launcher.
  echo.
  echo Please install Node.js from:
  echo https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo Piano Trainer - This Computer
echo Starts the Piano Trainer app on this computer only.
echo Node.js is required for this launcher.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%PIANO_TRAINER_APP_PORT%/'"
node "%ROOT%local-web-server.js"
