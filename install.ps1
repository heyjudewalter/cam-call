# CamCall Installer for Windows (PowerShell)
# Run as Administrator for best results

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/heyjudewalter/cam-call.git"
$InstallDir = "$env:USERPROFILE\CamCall"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CamCall - Video Call Installer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check for Node.js
$nodeInstalled = $false
try {
    $nodeVersion = node -v 2>$null
    if ($nodeVersion) {
        $nodeInstalled = $true
        Write-Host "[+] Node.js found: $nodeVersion" -ForegroundColor Green
    }
} catch {}

if (-not $nodeInstalled) {
    Write-Host "[!] Node.js is not installed." -ForegroundColor Yellow
    Write-Host "[*] Installing Node.js via winget..." -ForegroundColor Yellow
    
    try {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
        Write-Host "[+] Node.js installed successfully." -ForegroundColor Green
        Write-Host "[*] Please restart your terminal and run this script again." -ForegroundColor Yellow
        Read-Host "Press Enter to exit"
        exit 0
    } catch {
        Write-Host "[!] winget not available. Trying direct download..." -ForegroundColor Yellow
        
        $nodeUrl = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-x64.msi"
        $installer = "$env:TEMP\node-install.msi"
        
        try {
            Invoke-WebRequest -Uri $nodeUrl -OutFile $installer
            Start-Process msiexec.exe -ArgumentList "/i `"$installer`" /quiet /norestart" -Wait
            Write-Host "[+] Node.js installed." -ForegroundColor Green
            Write-Host "[*] Please restart your terminal and run this script again." -ForegroundColor Yellow
            Read-Host "Press Enter to exit"
            exit 0
        } catch {
            Write-Host "[!] Failed to install Node.js automatically." -ForegroundColor Red
            Write-Host "    Please install manually from https://nodejs.org" -ForegroundColor Red
            Read-Host "Press Enter to exit"
            exit 1
        }
    }
}

# Check for npm
try {
    $npmVersion = npm -v 2>$null
    if ($npmVersion) {
        Write-Host "[+] npm found: $npmVersion" -ForegroundColor Green
    }
} catch {
    Write-Host "[!] npm not found." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# Check for git
try {
    $gitVersion = git --version 2>$null
    if ($gitVersion) {
        Write-Host "[+] Git found: $gitVersion" -ForegroundColor Green
    }
} catch {
    Write-Host "[!] Git not found. Installing..." -ForegroundColor Yellow
    try {
        winget install Git.Git --accept-package-agreements --accept-source-agreements
        Write-Host "[+] Git installed." -ForegroundColor Green
    } catch {
        Write-Host "[!] Please install Git manually from https://git-scm.com" -ForegroundColor Red
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Clone or update
if (Test-Path $InstallDir) {
    Write-Host "[*] Updating existing installation..." -ForegroundColor Yellow
    Set-Location $InstallDir
    git pull
} else {
    Write-Host "[*] Cloning CamCall repository..." -ForegroundColor Yellow
    git clone $RepoUrl $InstallDir
    Set-Location $InstallDir
}

# Install dependencies
Write-Host "[*] Installing dependencies..." -ForegroundColor Yellow
npm install

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Installation Complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting CamCall server..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

# Start server
npm start
