@echo off
cd /d "%~dp0"
if not exist "public\data\maidens.json" call npm run prepare:data
call npm run dev
