@echo off
cd /d "%~dp0"
echo ========================================
echo   BLM Service Restart
echo ========================================
echo.

echo [1/3] Stopping BLM processes (port 8081/8091)...

for /f "tokens=5" %%a in ('netstat -ano ^| findstr /c:":8081 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /c:":8091 " ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)

echo Waiting for ports to release...
timeout /t 2 /nobreak >nul
echo Done.

echo.
echo [2/3] Cleaning Python cache...
for /d /r "blm_core" %%d in (__pycache__) do (
    if exist "%%d" rd /s /q "%%d" 2>nul
)
echo Done.

echo.
echo [3/3] Starting BLM server...
start "BLM_Server" python blm.py
echo.
echo Server started on port 8081 (admin 8091).
echo.
echo ========================================
echo   Done! Press Ctrl+Shift+R in browser.
echo ========================================
pause
