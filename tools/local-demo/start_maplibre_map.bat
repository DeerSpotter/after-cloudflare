@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "PYTHON_CMD="
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 set "PYTHON_CMD=py -3"
if not defined PYTHON_CMD (
    where python >nul 2>nul
    if %ERRORLEVEL% EQU 0 set "PYTHON_CMD=python"
)
if not defined PYTHON_CMD (
    echo ERROR: Python was not found on PATH.
    pause
    exit /b 1
)

echo Generating MapLibre real map...
%PYTHON_CMD% maplibre_live_map.py
if %ERRORLEVEL% NEQ 0 (
    echo MapLibre map generation failed.
    pause
    exit /b 1
)

echo Start start.bat first if the map says waiting for local API.
echo.
echo Opening:
echo %CD%\assets\flareless_maplibre_live_map.html
start "" "%CD%\assets\flareless_maplibre_live_map.html"
pause
