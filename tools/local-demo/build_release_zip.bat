@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "RELEASE_DIR=%CD%\release"
set "STAGE_DIR=%RELEASE_DIR%\flareless-local-demo"
set "ZIP_PATH=%RELEASE_DIR%\flareless-local-demo.zip"

echo Building Flareless local demo release zip...
if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
if not exist "%RELEASE_DIR%" mkdir "%RELEASE_DIR%"
mkdir "%STAGE_DIR%"
mkdir "%STAGE_DIR%\ui"
mkdir "%STAGE_DIR%\scenarios"
mkdir "%STAGE_DIR%\assets"
mkdir "%STAGE_DIR%\docs"
mkdir "%STAGE_DIR%\state"

copy /y "start.bat" "%STAGE_DIR%\" >nul
copy /y "start_tkinter.bat" "%STAGE_DIR%\" >nul
copy /y "start_embedded_maplibre.bat" "%STAGE_DIR%\" >nul
copy /y "install_requirements.bat" "%STAGE_DIR%\" >nul
copy /y "build_release_zip.bat" "%STAGE_DIR%\" >nul
copy /y "requirements.txt" "%STAGE_DIR%\" >nul
copy /y "webview_console.py" "%STAGE_DIR%\" >nul
copy /y "server.py" "%STAGE_DIR%\" >nul
copy /y "client.py" "%STAGE_DIR%\" >nul
copy /y "run_demo.py" "%STAGE_DIR%\" >nul
copy /y "README.md" "%STAGE_DIR%\" >nul
if exist "Screenshot 2026-06-16 161950.png" copy /y "Screenshot 2026-06-16 161950.png" "%STAGE_DIR%\" >nul
xcopy /e /i /y "ui" "%STAGE_DIR%\ui" >nul
xcopy /e /i /y "scenarios" "%STAGE_DIR%\scenarios" >nul
if exist "assets" xcopy /e /i /y "assets" "%STAGE_DIR%\assets" >nul
if exist "..\..\docs\releases" xcopy /e /i /y "..\..\docs\releases" "%STAGE_DIR%\docs\releases" >nul

rem Keep the state folder empty in the release. Runtime config is created here:
rem   state\local-ui-state.json
rem   state\topology-config.json
rem   state\custom-scenarios.json
rem   state\health-settings.json
rem   state\topology-snapshots.json

if exist "%ZIP_PATH%" del /q "%ZIP_PATH%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '%STAGE_DIR%\*' -DestinationPath '%ZIP_PATH%' -Force"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" (
    echo Release zip build failed with error code %EXIT_CODE%.
) else (
    echo Release zip created:
    echo %ZIP_PATH%
)
echo.
pause
exit /b %EXIT_CODE%
