@echo off
setlocal EnableExtensions

rem Main Flareless launcher for Windows.
rem This starts the embedded MapLibre command center.
rem The legacy Tkinter launcher is start_tkinter.bat.

cd /d "%~dp0"

echo.
echo ============================================================
echo  Flareless Embedded MapLibre Command Center
echo ============================================================
echo.
echo Working directory: %CD%
echo.

set "PYTHON_CMD="
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 set "PYTHON_CMD=py -3"

if not defined PYTHON_CMD (
    where python >nul 2>nul
    if %ERRORLEVEL% EQU 0 set "PYTHON_CMD=python"
)

if not defined PYTHON_CMD (
    echo ERROR: Python was not found on PATH.
    echo Install Python 3.10 or newer, then run this file again.
    echo.
    pause
    exit /b 1
)

echo Using Python command: %PYTHON_CMD%
echo Starting embedded MapLibre GUI.
echo Startup is paused. Press Run, Refresh, or Live inside the GUI.
echo.

%PYTHON_CMD% webview_console.py
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo Flareless embedded MapLibre command center exited with error code %EXIT_CODE%.
    echo.
    echo If pywebview is missing, run:
    echo %PYTHON_CMD% -m pip install -r requirements.txt
) else (
    echo Flareless embedded MapLibre command center closed.
)
echo.
pause
exit /b %EXIT_CODE%
