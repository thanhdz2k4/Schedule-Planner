@echo off
setlocal

cd /d "%~dp0"

where npx >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npx not found. Please install Node.js 18+ first.
  exit /b 1
)

echo [INFO] Pulling Vercel production env...
call npx --yes vercel env pull .env.vercel.production --environment=production
if errorlevel 1 (
  echo [ERROR] Could not pull Vercel environment variables.
  exit /b 1
)

echo [INFO] Running database migrations against Vercel production database...
node --env-file=.env.vercel.production scripts/db-migrate.cjs
if errorlevel 1 (
  echo [ERROR] Migration failed.
  exit /b 1
)

echo [DONE] Migration completed.
exit /b 0
