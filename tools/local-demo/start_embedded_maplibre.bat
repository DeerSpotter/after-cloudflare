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

echo Starting embedded MapLibre GUI.
echo Startup is paused. Press Run selected, Refresh once, or Start polling inside the GUI.
echo.
%PYTHON_CMD% webview_console.py
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo Embedded GUI exited with error code %EXIT_CODE%.
    echo If pywebview is missing, run:
    echo %PYTHON_CMD% -m pip install pywebview
)
echo.
pause
exit /b %EXIT_CODE%
