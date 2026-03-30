@echo off
setlocal

cd /d "%~dp0"

if "%~1"=="" (
  set /p RELAY_URL=Enter relay webhook URL (e.g. https://your-relay.onrender.com/webhook): 
) else (
  set RELAY_URL=%~1
)

if "%RELAY_URL%"=="" (
  echo [ERROR] Relay URL is required.
  exit /b 1
)

echo [INFO] Configuring SKEDDY bridge env on Vercel production...
node scripts\setup-skeddy-bridge.cjs --url "%RELAY_URL%"
if errorlevel 1 (
  echo [ERROR] Failed to configure bridge env.
  exit /b 1
)

echo [DONE] Bridge env configured.
echo [NEXT] Deploy app: deploy-vercel.bat
exit /b 0

