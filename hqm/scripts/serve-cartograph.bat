@echo off
setlocal
rem serve-cartograph.bat -- start (or stop) the local Cartograph UI server.
rem
rem   hqm\scripts\serve-cartograph.bat          start on port 9749 and open the browser
rem   hqm\scripts\serve-cartograph.bat 9800     start on another port
rem   hqm\scripts\serve-cartograph.bat stop     stop the server (needed before relinking:
rem                                             Windows holds the binary open and ld.lld fails)
rem
rem Relative pathing on purpose: %~dp0 is this script's folder, so the repo root is
rem two levels up and the script works from any clone location, run from anywhere.

set "ROOT=%~dp0..\.."
set "BIN=%ROOT%\build\c\codebase-memory-mcp.exe"
set "PORT=9749"

if /i "%~1"=="stop" (
  taskkill /im codebase-memory-mcp.exe /f >nul 2>&1
  if errorlevel 1 (echo Cartograph was not running.) else (echo Cartograph stopped.)
  exit /b 0
)
if not "%~1"=="" set "PORT=%~1"

if not exist "%BIN%" (
  echo No binary at: %BIN%
  echo Build it first -- from an MSYS CLANG64 shell:
  echo   scripts/build.sh --with-ui CC=clang CXX=clang++
  echo or use the wrapper: scratchpad/c-suite/build-with-ui.sh
  exit /b 1
)

rem A minimized window of its own, NOT `start /b`: a /b child dies with this
rem console, so the server stopped the moment the script ended. The window is
rem also where the logs live, and closing it stops the server.
start "Cartograph" /min "%BIN%" --ui=true --port=%PORT%
rem Give the server a moment, then open the page. ping, not timeout: timeout
rem needs console stdin and dies under non-interactive shells with
rem "Input redirection is not supported".
ping -n 4 127.0.0.1 >nul
start "" http://127.0.0.1:%PORT%/
echo Cartograph serving at http://127.0.0.1:%PORT%/
echo Binary: %BIN%
echo Stop with: %~nx0 stop
endlocal
