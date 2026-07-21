@echo off
setlocal enabledelayedexpansion

set REPO_URL=https://github.com/heyjudewalter/cam-call.git
set INSTALL_DIR=%USERPROFILE%\CamCall

echo ========================================
echo   CamCall - Video Call Installer
echo ========================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [!] Node.js is not installed.
    echo [*] Downloading Node.js installer...
    
    set NODE_URL=https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi
    set INSTALLER=%TEMP%\node-install.msi
    
    powershell -Command "Invoke-WebRequest -Uri '%NODE_URL%' -OutFile '%INSTALLER%'"
    
    if exist "%INSTALLER%" (
        echo [*] Running Node.js installer...
        msiexec /i "%INSTALLER%" /quiet /norestart
        echo [+] Node.js installed. Please restart your terminal and run this script again.
        del "%INSTALLER%"
        pause
        exit /b 0
    ) else (
        echo [!] Failed to download Node.js installer.
        echo     Please install Node.js manually from https://nodejs.org
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [+] Node.js found: %NODE_VER%

:: Check for npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [!] npm not found. Please install npm.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm -v') do set NPM_VER=%%i
echo [+] npm found: %NPM_VER%

:: Clone or update repo
if exist "%INSTALL_DIR%" (
    echo [*] Updating existing installation...
    cd /d "%INSTALL_DIR%"
    git pull
) else (
    echo [*] Cloning CamCall repository...
    git clone "%REPO_URL%" "%INSTALL_DIR%"
    cd /d "%INSTALL_DIR%"
)

:: Install dependencies
echo [*] Installing dependencies...
call npm install

echo.
echo ========================================
echo   Installation Complete!
echo ========================================
echo.
echo Starting CamCall server...
echo Press Ctrl+C to stop.
echo.

:: Start the server
call npm start

pause
