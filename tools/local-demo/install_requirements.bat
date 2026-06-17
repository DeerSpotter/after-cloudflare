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

echo Installing Flareless local demo requirements...
echo Using: %PYTHON_CMD%
echo.
%PYTHON_CMD% -m pip install --upgrade pip
%PYTHON_CMD% -m pip install -r requirements.txt
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
    echo Requirement install failed with error code %EXIT_CODE%.
) else (
    echo Requirements installed.
)
pause
exit /b %EXIT_CODE%
