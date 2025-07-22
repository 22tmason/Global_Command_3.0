@echo off
title Global Command 3.0 - Offline
echo Starting offline server on http://localhost:8000
cd /d "%~dp0"
start "" http://localhost:8000
\miniweb.exe -p 8000 -d .
pause

