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

echo Generating Plotly real world map...
%PYTHON_CMD% plotly_live_map.py
if %ERRORLEVEL% NEQ 0 (
    echo Plotly map generation failed.
    pause
    exit /b 1
)

echo Open this file in your browser after starting start.bat:
echo %CD%\assets\flareless_plotly_live_map.html
pause
