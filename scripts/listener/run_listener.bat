@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "REPO_ROOT=%SCRIPT_DIR%..\.."
set "PYTHONUTF8=1"

if exist "%SCRIPT_DIR%.venv\Scripts\activate.bat" (
  call "%SCRIPT_DIR%.venv\Scripts\activate.bat"
) else if exist "%SCRIPT_DIR%venv\Scripts\activate.bat" (
  call "%SCRIPT_DIR%venv\Scripts\activate.bat"
) else if exist "%REPO_ROOT%\.venv\Scripts\activate.bat" (
  call "%REPO_ROOT%\.venv\Scripts\activate.bat"
) else if exist "%REPO_ROOT%\venv\Scripts\activate.bat" (
  call "%REPO_ROOT%\venv\Scripts\activate.bat"
)

cd /d "%SCRIPT_DIR%"

:loop
echo [%date% %time%] Starting listener...
python "%SCRIPT_DIR%listener.py"
echo [%date% %time%] Listener exited with code %errorlevel%. Restarting in 10 seconds...
timeout /t 10 /nobreak >nul
goto loop
