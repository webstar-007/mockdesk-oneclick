@echo off
cd /d "%~dp0"
node scripts\check.mjs %*
pause
