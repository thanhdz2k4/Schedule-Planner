@echo off
setlocal

if "%APP_PORT%"=="" set APP_PORT=3000
if "%DB_PORT%"=="" set DB_PORT=5432

docker compose up --build
