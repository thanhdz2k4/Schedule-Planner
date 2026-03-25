@echo off
setlocal

if "%APP_PORT%"=="" set APP_PORT=3000
if "%DB_PORT%"=="" set DB_PORT=5432

if not exist ".env" (
  if exist ".env.example" (
    copy /Y ".env.example" ".env" >nul
  )
)

docker compose up --build
