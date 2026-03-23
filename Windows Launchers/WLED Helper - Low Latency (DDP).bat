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
if not defined PIANO_TRAINER_HELPER_PORT set "PIANO_TRAINER_HELPER_PORT=4818"

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

echo WLED Helper - This Computer (Low Latency)
echo Starts only the optional WLED helper on this computer.
echo Use this when Piano Trainer is also running on this computer.
echo Node.js is required for this launcher.
echo.
node "%ROOT%helper\server.js"
