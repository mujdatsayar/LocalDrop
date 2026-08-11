@echo off
cd /d "%~dp0uygulama"
start "" "%~dp0uygulama\node_modules\electron\dist\electron.exe" .
exit /b 0
