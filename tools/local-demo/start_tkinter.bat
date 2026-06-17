@echo off
setlocal EnableExtensions

rem Legacy Flareless Tkinter console launcher for Windows.
rem The main start.bat now launches the embedded MapLibre command center.

cd /d "%~dp0"

echo.
echo ============================================================
echo  Flareless Legacy Tkinter Console
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
echo Starting local server and legacy Tkinter release console...
echo.

%PYTHON_CMD% run_demo.py
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo Flareless legacy Tkinter console exited with error code %EXIT_CODE%.
) else (
    echo Flareless legacy Tkinter console closed.
)
echo.
pause
exit /b %EXIT_CODE%
