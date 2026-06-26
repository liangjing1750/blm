@echo off
cd /d "%~dp0frontend-angular"
echo === BLM Angular Build ===
call npm.cmd run build
if %ERRORLEVEL% neq 0 (
  echo *** BUILD FAILED ***
  pause
  exit /b 1
)
echo === Build OK, restarting server ===
cd /d "%~dp0"
taskkill /f /im python.exe /fi "WINDOWTITLE eq blm*" 2>nul
timeout /t 1 /nobreak >nul
start "BLM" python blm.py
echo === Done ===
timeout /t 2 /nobreak >nul
start http://localhost:8081
