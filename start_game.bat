@echo off
title Global Command 3.0 - Offline
echo Starting offline server on http://localhost:8080
cd /d "%~dp0"
start "" http://localhost:8080
miniweb\miniweb.exe -p 8080 -d miniweb\htdocs
pause
