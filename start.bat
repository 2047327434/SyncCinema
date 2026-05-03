@echo off
chcp 65001 >nul
title SyncCinema Server

set "NODE_EXE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.12.0.installing.13840.__extract_temp__\node-v22.12.0-win-x64\node.exe"
set "SERVER_DIR=%~dp0server"

echo ========================================
echo   SyncCinema
echo ========================================
echo.
echo Starting server...
echo Player:  http://localhost:3001/player/
echo Admin:   http://localhost:3001/admin/
echo.
echo Press Ctrl+C to stop the server.
echo ========================================
echo.

cd /d "%SERVER_DIR%"
"%NODE_EXE%" server.js
pause
