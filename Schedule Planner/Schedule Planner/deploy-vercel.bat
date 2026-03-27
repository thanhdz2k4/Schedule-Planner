@echo off
setlocal

cd /d "%~dp0"

where npx >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npx not found. Please install Node.js 18+ first.
  exit /b 1
)

echo [INFO] Deploying to Vercel Production...
call npx --yes vercel deploy --prod --yes
if errorlevel 1 (
  echo [ERROR] Vercel deploy failed.
  exit /b 1
)

echo [DONE] Deployment completed.
exit /b 0
