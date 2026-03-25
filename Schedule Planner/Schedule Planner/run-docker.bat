@echo off
setlocal

set IMAGE=schedule-planner
set PORT=3000

docker build -t %IMAGE% .
if errorlevel 1 exit /b 1

docker run --rm -p %PORT%:3000 %IMAGE%
