#!/bin/bash
set -e

REPO_URL="https://github.com/heyjudewalter/cam-call.git"
INSTALL_DIR="$HOME/CamCall"

echo "========================================"
echo "  CamCall - Video Call Installer"
echo "========================================"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "[!] Node.js is not installed."
    echo "[*] Installing Node.js..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install node
        else
            echo "[*] Homebrew not found. Installing Homebrew first..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            brew install node
        fi
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux (Debian/Ubuntu)
        if command -v apt-get &> /dev/null; then
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        elif command -v yum &> /dev/null; then
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs
        else
            echo "[!] Could not auto-install Node.js."
            echo "    Please install Node.js manually from https://nodejs.org"
            exit 1
        fi
    fi
    echo "[+] Node.js installed: $(node -v)"
else
    echo "[+] Node.js found: $(node -v)"
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "[!] npm not found. Please install npm."
    exit 1
fi
echo "[+] npm found: $(npm -v)"

# Clone or update repo
if [ -d "$INSTALL_DIR" ]; then
    echo "[*] Updating existing installation..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "[*] Cloning CamCall repository..."
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
echo "[*] Installing dependencies..."
npm install

echo ""
echo "========================================"
echo "  Installation Complete!"
echo "========================================"
echo ""
echo "Starting CamCall server..."
echo "Press Ctrl+C to stop."
echo ""

# Start the server
npm start
