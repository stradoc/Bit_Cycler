@echo off
rem Starts Bit Cycler: serves the game folder with Windows' own PowerShell (nothing to install)
rem and opens it in your browser. Close the window that opens to stop the game.
title Bit Cycler
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\serve-windows.ps1"
if errorlevel 1 pause
